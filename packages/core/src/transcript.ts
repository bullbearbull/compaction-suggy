import fs from "node:fs";
import type { ParsedTranscript, TranscriptTurn } from "./types.js";
import { normalizePromptForComparison } from "./fast-path.js";

const SYSTEM_TAG_REGEX =
  /<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-caveat|environment_context|user_instructions)[\s\S]*?<\/\1>/gi;

function sanitizeText(text: string): string {
  return text
    .replace(SYSTEM_TAG_REGEX, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return sanitizeText(content);
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        const cleaned = sanitizeText(block);
        if (cleaned) parts.push(cleaned);
        continue;
      }
      if (!block || typeof block !== "object") continue;
      const obj = block as Record<string, unknown>;
      const blockType = typeof obj.type === "string" ? obj.type : "";
      // Ignore tool invocations / tool results / thinking blocks to keep topic signal crisp
      if (
        blockType === "tool_use" ||
        blockType === "tool_result" ||
        blockType === "function_call" ||
        blockType === "function_call_output" ||
        blockType === "thinking" ||
        blockType === "reasoning"
      ) {
        continue;
      }
      if (typeof obj.text === "string") {
        const cleaned = sanitizeText(obj.text);
        if (cleaned) parts.push(cleaned);
      } else if (typeof obj.content === "string") {
        const cleaned = sanitizeText(obj.content);
        if (cleaned) parts.push(cleaned);
      }
    }
    return parts.join("\n").trim();
  }
  return "";
}

interface ExtractedRecord {
  kind: "turn" | "compaction" | "ignore";
  turn?: TranscriptTurn;
  summary?: string;
}

function classifyTranscriptRecord(record: unknown): ExtractedRecord {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { kind: "ignore" };
  }
  const obj = record as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : "";
  const subtype = typeof obj.subtype === "string" ? obj.subtype : "";

  // 1. Compaction boundary / summary markers (Claude Code & OpenAI Codex)
  if (
    subtype === "compact_boundary" ||
    type === "compact_boundary" ||
    type === "compacted" ||
    obj.isCompactSummary === true
  ) {
    const summary =
      extractTextFromContent(obj.summary) ||
      extractTextFromContent(obj.content) ||
      (obj.message && typeof obj.message === "object"
        ? extractTextFromContent((obj.message as Record<string, unknown>).content)
        : "");
    return { kind: "compaction", summary: summary || undefined };
  }

  if (type === "summary") {
    const summary =
      extractTextFromContent(obj.summary) || extractTextFromContent(obj.content);
    return { kind: "compaction", summary: summary || undefined };
  }

  // Codex event_msg format
  if (type === "event_msg" && obj.payload && typeof obj.payload === "object") {
    const payload = obj.payload as Record<string, unknown>;
    const payloadType = typeof payload.type === "string" ? payload.type : "";
    if (payloadType === "context_compacted" || payloadType === "compacted") {
      const summary =
        extractTextFromContent(payload.summary) ||
        extractTextFromContent(payload.message);
      return { kind: "compaction", summary: summary || undefined };
    }
    if (payloadType === "user_message") {
      const text =
        extractTextFromContent(payload.message) ||
        extractTextFromContent(payload.text) ||
        extractTextFromContent(payload.content);
      if (text) return { kind: "turn", turn: { role: "user", text } };
    }
    if (payloadType === "agent_message" || payloadType === "assistant_message") {
      const text =
        extractTextFromContent(payload.message) ||
        extractTextFromContent(payload.text) ||
        extractTextFromContent(payload.content);
      if (text) return { kind: "turn", turn: { role: "assistant", text } };
    }
    return { kind: "ignore" };
  }

  // Codex response_item rollout format
  if (type === "response_item" && obj.payload && typeof obj.payload === "object") {
    const payload = obj.payload as Record<string, unknown>;
    if (payload.type === "message") {
      const role = payload.role;
      if (role === "user" || role === "assistant") {
        const text = extractTextFromContent(payload.content);
        if (text) return { kind: "turn", turn: { role, text } };
      }
    }
    return { kind: "ignore" };
  }

  // Claude Code JSONL format: { type: "user" | "assistant", message: { role, content }, isMeta?: boolean }
  if (obj.isMeta === true || obj.isSidechain === true) {
    return { kind: "ignore" };
  }

  if (obj.message && typeof obj.message === "object") {
    const msg = obj.message as Record<string, unknown>;
    const role = msg.role ?? (type === "user" || type === "assistant" ? type : undefined);
    if (role === "user" || role === "assistant") {
      const text = extractTextFromContent(msg.content);
      if (text) return { kind: "turn", turn: { role, text } };
    }
    return { kind: "ignore" };
  }

  // Generic / flat JSONL format: { role: "user" | "assistant", content: "..." }
  if (obj.role === "user" || obj.role === "assistant") {
    const text =
      extractTextFromContent(obj.content) || extractTextFromContent(obj.text);
    if (text) {
      return { kind: "turn", turn: { role: obj.role, text } };
    }
  }

  return { kind: "ignore" };
}

/**
 * Parses a JSONL transcript string (Claude Code or Codex format) and returns
 * only the turns following the latest compaction boundary.
 */
export function parseTranscriptJsonl(
  rawJsonl: string,
  currentPrompt?: string,
): ParsedTranscript {
  const lines = rawJsonl.split(/\r?\n/);
  let turns: TranscriptTurn[] = [];
  let compactionSummary: string | undefined;
  let compactionCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const classified = classifyTranscriptRecord(parsed);
    if (classified.kind === "compaction") {
      compactionCount += 1;
      turns = [];
      if (classified.summary) {
        compactionSummary = classified.summary;
      }
    } else if (classified.kind === "turn" && classified.turn) {
      const last = turns[turns.length - 1];
      // Deduplicate identical back-to-back messages (some rollouts emit both event_msg and response_item)
      if (
        last &&
        last.role === classified.turn.role &&
        normalizePromptForComparison(last.text) ===
          normalizePromptForComparison(classified.turn.text)
      ) {
        continue;
      }
      turns.push(classified.turn);
    }
  }

  // Some runtimes append the incoming user prompt to the transcript before running UserPromptSubmit.
  // Pop it if the trailing user turn matches the incoming prompt so we don't compare a prompt with itself.
  if (currentPrompt && turns.length > 0) {
    const last = turns[turns.length - 1];
    if (
      last &&
      last.role === "user" &&
      normalizePromptForComparison(last.text) ===
        normalizePromptForComparison(currentPrompt)
    ) {
      turns.pop();
    }
  }

  const userTurnCount = turns.filter((t) => t.role === "user").length;

  return {
    turns,
    compactionSummary,
    compactionCount,
    userTurnCount,
  };
}

export function readTranscriptFile(
  transcriptPath: string,
  currentPrompt?: string,
  maxBytes = 2 * 1024 * 1024,
): ParsedTranscript | undefined {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      return undefined;
    }
    const stat = fs.statSync(transcriptPath);
    if (!stat.isFile()) return undefined;

    let raw: string;
    if (stat.size <= maxBytes) {
      raw = fs.readFileSync(transcriptPath, "utf8");
    } else {
      // Read the tail slice for very large transcripts and drop any partial leading line
      const fd = fs.openSync(transcriptPath, "r");
      try {
        const buffer = Buffer.alloc(maxBytes);
        const startPos = stat.size - maxBytes;
        fs.readSync(fd, buffer, 0, maxBytes, startPos);
        const tail = buffer.toString("utf8");
        const firstNewline = tail.indexOf("\n");
        raw = firstNewline >= 0 ? tail.slice(firstNewline + 1) : tail;
      } finally {
        fs.closeSync(fd);
      }
    }

    return parseTranscriptJsonl(raw, currentPrompt);
  } catch {
    return undefined;
  }
}

export {
  buildParsedTranscriptFromTurns,
  buildSlidingWindowContext,
  type WindowResult,
} from "./window.js";
