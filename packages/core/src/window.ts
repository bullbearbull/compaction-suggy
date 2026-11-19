import { normalizePromptForComparison } from "./fast-path.js";
import type { ParsedTranscript, TranscriptTurn } from "./types.js";

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

export interface WindowResult {
  previousContext: string;
  recentUserTopics: string[];
  contextChars: number;
}

/**
 * Builds a ParsedTranscript from an already-extracted list of turns (e.g. from DOM in a browser extension).
 * Deduplicates consecutive identical turns and strips a trailing user turn if it duplicates currentPrompt.
 */
export function buildParsedTranscriptFromTurns(
  rawTurns: TranscriptTurn[],
  currentPrompt?: string,
  compactionSummary?: string,
): ParsedTranscript {
  const turns: TranscriptTurn[] = [];

  for (const turn of rawTurns) {
    const cleaned = turn.text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!cleaned) continue;

    const last = turns[turns.length - 1];
    if (
      last &&
      last.role === turn.role &&
      normalizePromptForComparison(last.text) === normalizePromptForComparison(cleaned)
    ) {
      continue;
    }
    turns.push({ role: turn.role, text: cleaned });
  }

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
    compactionCount: compactionSummary ? 1 : 0,
    userTurnCount,
  };
}

export function buildSlidingWindowContext(
  parsed: ParsedTranscript,
  maxWindowTurns: number,
  maxContextChars: number,
): WindowResult {
  const sliced = parsed.turns.slice(-Math.max(1, maxWindowTurns));
  const formattedLines: string[] = [];

  for (const turn of sliced) {
    const cap = turn.role === "user" ? 500 : 280;
    const prefix = turn.role === "user" ? "User" : "Assistant";
    formattedLines.push(`${prefix}: ${truncateText(turn.text, cap)}`);
  }

  // Keep the most recent turns within maxContextChars
  const selected: string[] = [];
  let totalLen = 0;
  for (let i = formattedLines.length - 1; i >= 0; i -= 1) {
    const line = formattedLines[i];
    if (!line) continue;
    const addedLen = line.length + (selected.length > 0 ? 1 : 0);
    if (totalLen + addedLen > maxContextChars && selected.length > 0) {
      break;
    }
    selected.unshift(line);
    totalLen += addedLen;
  }

  const previousContext = selected.join("\n").slice(0, maxContextChars);
  const recentUserTopics = sliced
    .filter((t) => t.role === "user")
    .slice(-5)
    .map((t) => truncateText(t.text, 200));

  return {
    previousContext,
    recentUserTopics,
    contextChars: previousContext.length + (parsed.compactionSummary?.length ?? 0),
  };
}
