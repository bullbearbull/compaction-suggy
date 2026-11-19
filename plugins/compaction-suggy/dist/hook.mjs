#!/usr/bin/env node

// packages/core/dist/config.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// packages/core/dist/defaults.js
var DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/alpha/decisions";
var DEFAULT_OPENROUTER_MODEL = "typesafe/jev-latest";
var DEFAULT_OPENAI_URL = "https://api.openai.com/v1/decisions";
var DEFAULT_OPENAI_MODEL = "gpt-6-luna";
var DEFAULT_LOCAL_URL = "http://localhost:11434/v1/systemone";
var DEFAULT_LOCAL_MODEL = "tev1";
function getDefaultConfig() {
  return {
    enabled: true,
    provider: "auto",
    threshold: 0.75,
    timeoutMs: 2500,
    mode: "block",
    language: "auto",
    minTurns: 3,
    minContextChars: 150,
    minPromptChars: 10,
    maxWindowTurns: 10,
    maxContextChars: 4e3,
    bypassTtlSeconds: 300,
    openrouter: {
      baseUrl: DEFAULT_OPENROUTER_URL,
      model: DEFAULT_OPENROUTER_MODEL,
      referer: "https://github.com/bullbearbull/compaction-suggy",
      title: "Compaction Suggy"
    },
    openai: {
      baseUrl: DEFAULT_OPENAI_URL,
      model: DEFAULT_OPENAI_MODEL
    },
    local: {
      url: DEFAULT_LOCAL_URL,
      apiFormat: "systemone",
      model: DEFAULT_LOCAL_MODEL,
      keepAlive: "10m"
    },
    debug: false
  };
}
function mergeConfig(base, override) {
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...override,
    openrouter: {
      ...base.openrouter,
      ...override.openrouter ?? {}
    },
    openai: {
      ...base.openai,
      ...override.openai ?? {}
    },
    local: {
      ...base.local,
      ...override.local ?? {}
    }
  };
}

// packages/core/dist/config.js
function getUserConfigPath(env = process.env) {
  if (env.TSC_CONFIG_PATH) {
    return env.TSC_CONFIG_PATH;
  }
  const xdgConfigHome = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdgConfigHome, "topic-shift-compact", "config.json");
}
function getDefaultBypassCachePath(env = process.env) {
  if (env.TSC_BYPASS_CACHE_PATH) {
    return env.TSC_BYPASS_CACHE_PATH;
  }
  const pluginDataDir = env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || env.CODEX_PLUGIN_DATA;
  if (pluginDataDir) {
    return path.join(pluginDataDir, "bypass-cache.json");
  }
  const xdgCacheHome = env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(xdgCacheHome, "topic-shift-compact", "bypass-cache.json");
}
function readJsonFileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return void 0;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function parseBoolean(value) {
  if (value === void 0)
    return void 0;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on")
    return true;
  if (v === "0" || v === "false" || v === "no" || v === "off")
    return false;
  return void 0;
}
function parseNumber(value, min, max) {
  if (value === void 0 || value.trim() === "")
    return void 0;
  const n = Number(value);
  if (!Number.isFinite(n))
    return void 0;
  if (min !== void 0 && n < min)
    return min;
  if (max !== void 0 && n > max)
    return max;
  return n;
}
function parseProviderSelection(value) {
  if (!value)
    return void 0;
  const v = value.trim().toLowerCase();
  if (v === "openrouter" || v === "openai" || v === "local" || v === "auto") {
    return v;
  }
  return void 0;
}
function parseLocalApiFormat(value) {
  if (!value)
    return void 0;
  const v = value.trim().toLowerCase();
  if (v === "systemone" || v === "openai-decisions") {
    return v;
  }
  return void 0;
}
function parseHookMode(value) {
  if (!value)
    return void 0;
  const v = value.trim().toLowerCase();
  if (v === "block" || v === "advisory") {
    return v;
  }
  return void 0;
}
function parseLanguage(value) {
  if (!value)
    return void 0;
  const v = value.trim().toLowerCase();
  if (v === "auto" || v === "en" || v === "ko") {
    return v;
  }
  return void 0;
}
function loadConfig(options = {}) {
  const env = options.env ?? process.env;
  let config = getDefaultConfig();
  const pluginDataDir = env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || env.CODEX_PLUGIN_DATA;
  if (pluginDataDir) {
    config = mergeConfig(config, readJsonFileIfExists(path.join(pluginDataDir, "config.json")));
  }
  config = mergeConfig(config, readJsonFileIfExists(getUserConfigPath(env)));
  if (options.cwd) {
    config = mergeConfig(config, readJsonFileIfExists(path.join(options.cwd, ".topic-shift-compact.json")));
  }
  const disabled = parseBoolean(env.TSC_DISABLED);
  if (disabled === true)
    config.enabled = false;
  const enabled = parseBoolean(env.TSC_ENABLED);
  if (enabled !== void 0)
    config.enabled = enabled;
  const provider = parseProviderSelection(env.TSC_PROVIDER);
  if (provider)
    config.provider = provider;
  if (env.TSC_MODEL?.trim()) {
    config.model = env.TSC_MODEL.trim();
  }
  const threshold = parseNumber(env.TSC_THRESHOLD, 0, 1);
  if (threshold !== void 0)
    config.threshold = threshold;
  const timeoutMs = parseNumber(env.TSC_TIMEOUT_MS, 100, 6e4);
  if (timeoutMs !== void 0)
    config.timeoutMs = Math.round(timeoutMs);
  const mode = parseHookMode(env.TSC_MODE);
  if (mode)
    config.mode = mode;
  const language = parseLanguage(env.TSC_LANGUAGE);
  if (language)
    config.language = language;
  const minTurns = parseNumber(env.TSC_MIN_TURNS, 1, 100);
  if (minTurns !== void 0)
    config.minTurns = Math.round(minTurns);
  const minContextChars = parseNumber(env.TSC_MIN_CONTEXT_CHARS, 0, 5e4);
  if (minContextChars !== void 0)
    config.minContextChars = Math.round(minContextChars);
  const minPromptChars = parseNumber(env.TSC_MIN_PROMPT_CHARS, 1, 1e3);
  if (minPromptChars !== void 0)
    config.minPromptChars = Math.round(minPromptChars);
  const maxWindowTurns = parseNumber(env.TSC_MAX_WINDOW_TURNS, 1, 100);
  if (maxWindowTurns !== void 0)
    config.maxWindowTurns = Math.round(maxWindowTurns);
  const maxContextChars = parseNumber(env.TSC_MAX_CONTEXT_CHARS, 200, 5e4);
  if (maxContextChars !== void 0)
    config.maxContextChars = Math.round(maxContextChars);
  const bypassTtlSeconds = parseNumber(env.TSC_BYPASS_TTL_SECONDS, 5, 86400);
  if (bypassTtlSeconds !== void 0)
    config.bypassTtlSeconds = Math.round(bypassTtlSeconds);
  if (env.TSC_BYPASS_CACHE_PATH?.trim()) {
    config.bypassCachePath = env.TSC_BYPASS_CACHE_PATH.trim();
  }
  if (env.TSC_OPENROUTER_URL?.trim())
    config.openrouter.baseUrl = env.TSC_OPENROUTER_URL.trim();
  if (env.TSC_OPENROUTER_MODEL?.trim())
    config.openrouter.model = env.TSC_OPENROUTER_MODEL.trim();
  if (env.OPENROUTER_API_KEY?.trim()) {
    config.openrouter.apiKey = env.OPENROUTER_API_KEY.trim();
  } else if (env.TSC_OPENROUTER_API_KEY?.trim()) {
    config.openrouter.apiKey = env.TSC_OPENROUTER_API_KEY.trim();
  }
  if (env.TSC_OPENAI_URL?.trim())
    config.openai.baseUrl = env.TSC_OPENAI_URL.trim();
  if (env.TSC_OPENAI_MODEL?.trim())
    config.openai.model = env.TSC_OPENAI_MODEL.trim();
  if (env.OPENAI_API_KEY?.trim()) {
    config.openai.apiKey = env.OPENAI_API_KEY.trim();
  } else if (env.TSC_OPENAI_API_KEY?.trim()) {
    config.openai.apiKey = env.TSC_OPENAI_API_KEY.trim();
  }
  if (env.TSC_LOCAL_URL?.trim())
    config.local.url = env.TSC_LOCAL_URL.trim();
  const localApiFormat = parseLocalApiFormat(env.TSC_LOCAL_API_FORMAT);
  if (localApiFormat)
    config.local.apiFormat = localApiFormat;
  if (env.TSC_LOCAL_MODEL?.trim())
    config.local.model = env.TSC_LOCAL_MODEL.trim();
  if (env.TSC_LOCAL_API_KEY?.trim())
    config.local.apiKey = env.TSC_LOCAL_API_KEY.trim();
  if (env.TSC_LOCAL_KEEP_ALIVE?.trim())
    config.local.keepAlive = env.TSC_LOCAL_KEEP_ALIVE.trim();
  const debug = parseBoolean(env.TSC_DEBUG);
  if (debug !== void 0)
    config.debug = debug;
  config = mergeConfig(config, options.overrides);
  config.threshold = Math.min(1, Math.max(0, Number(config.threshold) || 0.75));
  if (!config.bypassCachePath) {
    config.bypassCachePath = getDefaultBypassCachePath(env);
  }
  return config;
}

// packages/core/dist/fast-path.js
var SHORT_ACKNOWLEDGEMENTS = /* @__PURE__ */ new Set([
  "ok",
  "okay",
  "k",
  "yes",
  "yep",
  "yeah",
  "y",
  "no",
  "nope",
  "n",
  "sure",
  "go",
  "go ahead",
  "proceed",
  "continue",
  "lgtm",
  "looks good",
  "thanks",
  "thank you",
  "thx",
  "ty",
  "done",
  "fix it",
  "try again",
  "run it",
  "do it",
  "apply",
  "commit",
  "push",
  "\uC751",
  "\u3147\u3147",
  "\uB124",
  "\uC608",
  "\uC544\uB2C8",
  "\uC544\uB2C8\uC694",
  "\uC88B\uC544",
  "\uC88B\uC544\uC694",
  "\uC9C4\uD589\uD574",
  "\uC9C4\uD589\uD574\uC918",
  "\uACC4\uC18D",
  "\uACC4\uC18D\uD574",
  "\uACC4\uC18D\uD574\uC918",
  "\uD574\uC918",
  "\uACE0\uB9C8\uC6CC",
  "\uAC10\uC0AC",
  "\uAC10\uC0AC\uD569\uB2C8\uB2E4",
  "\uD655\uC778",
  "\uD655\uC778\uD588\uC5B4",
  "\uC54C\uACA0\uC5B4",
  "\uC624\uCF00\uC774",
  "\u3131\u3131",
  "\uACE0\uACE0",
  "\uB2E4\uC2DC",
  "\uB2E4\uC2DC\uD574\uC918",
  "\uC2E4\uD589\uD574\uC918",
  "\uCEE4\uBC0B\uD574\uC918"
]);
var OVERRIDE_PREFIX_PATTERN = /^(!keep|\[keep\]|!nocompact|\[nocompact\])(?=\s|$)/i;
function normalizePromptForComparison(prompt) {
  return prompt.trim().replace(/\s+/g, " ");
}
function checkPromptFastPath(rawPrompt, config) {
  if (!config.enabled) {
    return "disabled";
  }
  const trimmed = rawPrompt.trim();
  if (!trimmed) {
    return "empty_prompt";
  }
  if (trimmed.startsWith("/")) {
    return "slash_command";
  }
  if (OVERRIDE_PREFIX_PATTERN.test(trimmed)) {
    return "override_prefix";
  }
  const normalizedLower = normalizePromptForComparison(trimmed).toLowerCase().replace(/[.!?~]+$/g, "").trim();
  if (SHORT_ACKNOWLEDGEMENTS.has(normalizedLower)) {
    return "short_acknowledgement";
  }
  if (trimmed.length < config.minPromptChars) {
    return "short_prompt";
  }
  return void 0;
}

// packages/core/dist/transcript.js
import fs2 from "node:fs";

// packages/core/dist/window.js
function truncateText(text, maxLen) {
  if (text.length <= maxLen)
    return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}\u2026`;
}
function buildSlidingWindowContext(parsed, maxWindowTurns, maxContextChars) {
  const sliced = parsed.turns.slice(-Math.max(1, maxWindowTurns));
  const formattedLines = [];
  for (const turn of sliced) {
    const cap = turn.role === "user" ? 500 : 280;
    const prefix = turn.role === "user" ? "User" : "Assistant";
    formattedLines.push(`${prefix}: ${truncateText(turn.text, cap)}`);
  }
  const selected = [];
  let totalLen = 0;
  for (let i = formattedLines.length - 1; i >= 0; i -= 1) {
    const line = formattedLines[i];
    if (!line)
      continue;
    const addedLen = line.length + (selected.length > 0 ? 1 : 0);
    if (totalLen + addedLen > maxContextChars && selected.length > 0) {
      break;
    }
    selected.unshift(line);
    totalLen += addedLen;
  }
  const previousContext = selected.join("\n").slice(0, maxContextChars);
  const recentUserTopics = sliced.filter((t) => t.role === "user").slice(-5).map((t) => truncateText(t.text, 200));
  return {
    previousContext,
    recentUserTopics,
    contextChars: previousContext.length + (parsed.compactionSummary?.length ?? 0)
  };
}

// packages/core/dist/transcript.js
var SYSTEM_TAG_REGEX = /<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-caveat|environment_context|user_instructions)[\s\S]*?<\/\1>/gi;
function sanitizeText(text) {
  return text.replace(SYSTEM_TAG_REGEX, " ").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function extractTextFromContent(content) {
  if (typeof content === "string") {
    return sanitizeText(content);
  }
  if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (typeof block === "string") {
        const cleaned = sanitizeText(block);
        if (cleaned)
          parts.push(cleaned);
        continue;
      }
      if (!block || typeof block !== "object")
        continue;
      const obj = block;
      const blockType = typeof obj.type === "string" ? obj.type : "";
      if (blockType === "tool_use" || blockType === "tool_result" || blockType === "function_call" || blockType === "function_call_output" || blockType === "thinking" || blockType === "reasoning") {
        continue;
      }
      if (typeof obj.text === "string") {
        const cleaned = sanitizeText(obj.text);
        if (cleaned)
          parts.push(cleaned);
      } else if (typeof obj.content === "string") {
        const cleaned = sanitizeText(obj.content);
        if (cleaned)
          parts.push(cleaned);
      }
    }
    return parts.join("\n").trim();
  }
  return "";
}
function classifyTranscriptRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { kind: "ignore" };
  }
  const obj = record;
  const type = typeof obj.type === "string" ? obj.type : "";
  const subtype = typeof obj.subtype === "string" ? obj.subtype : "";
  if (subtype === "compact_boundary" || type === "compact_boundary" || type === "compacted" || obj.isCompactSummary === true) {
    const summary = extractTextFromContent(obj.summary) || extractTextFromContent(obj.content) || (obj.message && typeof obj.message === "object" ? extractTextFromContent(obj.message.content) : "");
    return { kind: "compaction", summary: summary || void 0 };
  }
  if (type === "summary") {
    const summary = extractTextFromContent(obj.summary) || extractTextFromContent(obj.content);
    return { kind: "compaction", summary: summary || void 0 };
  }
  if (type === "event_msg" && obj.payload && typeof obj.payload === "object") {
    const payload = obj.payload;
    const payloadType = typeof payload.type === "string" ? payload.type : "";
    if (payloadType === "context_compacted" || payloadType === "compacted") {
      const summary = extractTextFromContent(payload.summary) || extractTextFromContent(payload.message);
      return { kind: "compaction", summary: summary || void 0 };
    }
    if (payloadType === "user_message") {
      const text = extractTextFromContent(payload.message) || extractTextFromContent(payload.text) || extractTextFromContent(payload.content);
      if (text)
        return { kind: "turn", turn: { role: "user", text } };
    }
    if (payloadType === "agent_message" || payloadType === "assistant_message") {
      const text = extractTextFromContent(payload.message) || extractTextFromContent(payload.text) || extractTextFromContent(payload.content);
      if (text)
        return { kind: "turn", turn: { role: "assistant", text } };
    }
    return { kind: "ignore" };
  }
  if (type === "response_item" && obj.payload && typeof obj.payload === "object") {
    const payload = obj.payload;
    if (payload.type === "message") {
      const role = payload.role;
      if (role === "user" || role === "assistant") {
        const text = extractTextFromContent(payload.content);
        if (text)
          return { kind: "turn", turn: { role, text } };
      }
    }
    return { kind: "ignore" };
  }
  if (obj.isMeta === true || obj.isSidechain === true) {
    return { kind: "ignore" };
  }
  if (obj.message && typeof obj.message === "object") {
    const msg = obj.message;
    const role = msg.role ?? (type === "user" || type === "assistant" ? type : void 0);
    if (role === "user" || role === "assistant") {
      const text = extractTextFromContent(msg.content);
      if (text)
        return { kind: "turn", turn: { role, text } };
    }
    return { kind: "ignore" };
  }
  if (obj.role === "user" || obj.role === "assistant") {
    const text = extractTextFromContent(obj.content) || extractTextFromContent(obj.text);
    if (text) {
      return { kind: "turn", turn: { role: obj.role, text } };
    }
  }
  return { kind: "ignore" };
}
function parseTranscriptJsonl(rawJsonl, currentPrompt) {
  const lines = rawJsonl.split(/\r?\n/);
  let turns = [];
  let compactionSummary;
  let compactionCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed)
      continue;
    let parsed;
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
      if (last && last.role === classified.turn.role && normalizePromptForComparison(last.text) === normalizePromptForComparison(classified.turn.text)) {
        continue;
      }
      turns.push(classified.turn);
    }
  }
  if (currentPrompt && turns.length > 0) {
    const last = turns[turns.length - 1];
    if (last && last.role === "user" && normalizePromptForComparison(last.text) === normalizePromptForComparison(currentPrompt)) {
      turns.pop();
    }
  }
  const userTurnCount = turns.filter((t) => t.role === "user").length;
  return {
    turns,
    compactionSummary,
    compactionCount,
    userTurnCount
  };
}
function readTranscriptFile(transcriptPath, currentPrompt, maxBytes = 2 * 1024 * 1024) {
  try {
    if (!transcriptPath || !fs2.existsSync(transcriptPath)) {
      return void 0;
    }
    const stat = fs2.statSync(transcriptPath);
    if (!stat.isFile())
      return void 0;
    let raw;
    if (stat.size <= maxBytes) {
      raw = fs2.readFileSync(transcriptPath, "utf8");
    } else {
      const fd = fs2.openSync(transcriptPath, "r");
      try {
        const buffer = Buffer.alloc(maxBytes);
        const startPos = stat.size - maxBytes;
        fs2.readSync(fd, buffer, 0, maxBytes, startPos);
        const tail = buffer.toString("utf8");
        const firstNewline = tail.indexOf("\n");
        raw = firstNewline >= 0 ? tail.slice(firstNewline + 1) : tail;
      } finally {
        fs2.closeSync(fd);
      }
    }
    return parseTranscriptJsonl(raw, currentPrompt);
  } catch {
    return void 0;
  }
}

// packages/core/dist/bypass-cache.js
import crypto from "node:crypto";
import fs3 from "node:fs";
import path2 from "node:path";
var MAX_STORE_ENTRIES = 200;
function makeBypassKey(sessionId, prompt) {
  const normalized = normalizePromptForComparison(prompt);
  const scope = sessionId?.trim() || "default";
  return crypto.createHash("sha256").update(`${scope}::${normalized}`).digest("hex");
}
function readStore(cachePath, now) {
  try {
    if (!fs3.existsSync(cachePath)) {
      return { version: 1, entries: {} };
    }
    const raw = fs3.readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    const entries = {};
    if (parsed.entries && typeof parsed.entries === "object") {
      for (const [k, v] of Object.entries(parsed.entries)) {
        if (v && typeof v === "object" && typeof v.expiresAt === "number" && v.expiresAt > now) {
          entries[k] = v;
        }
      }
    }
    return { version: 1, entries };
  } catch {
    return { version: 1, entries: {} };
  }
}
function writeStore(cachePath, store) {
  try {
    const dir = path2.dirname(cachePath);
    fs3.mkdirSync(dir, { recursive: true });
    const keys = Object.keys(store.entries);
    if (keys.length > MAX_STORE_ENTRIES) {
      keys.sort((a, b) => (store.entries[a]?.createdAt ?? 0) - (store.entries[b]?.createdAt ?? 0));
      const toRemove = keys.slice(0, keys.length - MAX_STORE_ENTRIES);
      for (const k of toRemove) {
        delete store.entries[k];
      }
    }
    const tmpPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    fs3.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8");
    fs3.renameSync(tmpPath, cachePath);
  } catch {
  }
}
var BypassCache = class {
  cachePath;
  ttlMs;
  constructor(cachePath, ttlSeconds) {
    this.cachePath = cachePath;
    this.ttlMs = Math.max(5, ttlSeconds) * 1e3;
  }
  /**
   * Checks if the given session+prompt has an active one-shot bypass entry.
   * If found, consumes (deletes) it so subsequent independent turns remain protected.
   */
  consumeIfBypassed(sessionId, prompt, now = Date.now()) {
    const key = makeBypassKey(sessionId, prompt);
    const store = readStore(this.cachePath, now);
    const entry = store.entries[key];
    if (!entry || entry.expiresAt <= now) {
      return false;
    }
    delete store.entries[key];
    writeStore(this.cachePath, store);
    return true;
  }
  /**
   * Records a blocked prompt so that if the user immediately re-submits the exact
   * same prompt to proceed without compacting, the next submission passes through.
   */
  recordBlockedPrompt(sessionId, prompt, probability, now = Date.now()) {
    const key = makeBypassKey(sessionId, prompt);
    const store = readStore(this.cachePath, now);
    store.entries[key] = {
      createdAt: now,
      expiresAt: now + this.ttlMs,
      probability
    };
    writeStore(this.cachePath, store);
  }
};

// packages/core/dist/prompt-builder.js
var TOPIC_SHIFT_QUESTION_NAME = "topic_shifted";
var TOPIC_SHIFT_INSTRUCTIONS = "Is the new user prompt shifting to a substantially different and unrelated task/topic from the previous conversation, such that compacting or clearing the prior conversation context before answering would be beneficial?";
var TOPIC_SHIFT_CRITERIA = {
  true: "The new prompt starts an unrelated task, switches to a different subsystem/feature/domain, or asks an independent question that does not depend on the detailed back-and-forth of the previous conversation.",
  false: "The new prompt continues, refines, debugs, tests, reviews, asks follow-up questions about, or builds directly upon the previous conversation topic or artifacts."
};
function buildSystemOneState(input) {
  const state = {
    previous_conversation: input.previousContext,
    new_user_prompt: input.newPrompt
  };
  if (input.compactionSummary) {
    state.prior_summary = input.compactionSummary;
  }
  if (input.recentUserTopics.length > 0) {
    state.recent_user_prompts = input.recentUserTopics;
  }
  return state;
}
function buildOpenAiDecisionInput(input) {
  const sections = [];
  if (input.compactionSummary) {
    sections.push(`## Prior Compacted Summary
${input.compactionSummary}`);
  }
  sections.push(`## Recent Conversation Context
${input.previousContext}`);
  sections.push(`## New User Prompt
${input.newPrompt}`);
  return sections.join("\n\n");
}
function buildOpenAiPredicateInstructions() {
  return [
    TOPIC_SHIFT_INSTRUCTIONS,
    `Answer TRUE when: ${TOPIC_SHIFT_CRITERIA.true}`,
    `Answer FALSE when: ${TOPIC_SHIFT_CRITERIA.false}`
  ].join("\n");
}

// packages/core/dist/providers/openai-luna.js
function extractOpenAiPredicateProbability(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid OpenAI Decisions response: expected JSON object");
  }
  const obj = data;
  const answers = obj.answers;
  if (Array.isArray(answers)) {
    const matched = answers.find((item) => item && typeof item === "object" && item.name === TOPIC_SHIFT_QUESTION_NAME) ?? answers[0];
    if (matched && typeof matched === "object") {
      const prob = matched.probability;
      if (typeof prob === "number" && Number.isFinite(prob)) {
        return Math.min(1, Math.max(0, prob));
      }
    }
  }
  throw new Error(`Unable to extract predicate probability from OpenAI Decisions response: ${JSON.stringify(data).slice(0, 300)}`);
}
var OpenAiLunaProvider = class {
  name = "openai";
  model;
  apiKey;
  baseUrl;
  fetchImpl;
  constructor(options) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  async decide(input, timeoutMs) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body = {
        model: this.model,
        input: buildOpenAiDecisionInput(input),
        questions: [
          {
            type: "predicate",
            name: TOPIC_SHIFT_QUESTION_NAME,
            instructions: buildOpenAiPredicateInstructions()
          }
        ]
      };
      const res = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`OpenAI Decisions API failed (${res.status}): ${errorText.slice(0, 300)}`);
      }
      const data = await res.json();
      const probability = extractOpenAiPredicateProbability(data);
      return {
        provider: this.name,
        model: this.model,
        probability,
        latencyMs: Date.now() - startedAt,
        raw: data
      };
    } finally {
      clearTimeout(timer);
    }
  }
};

// packages/core/dist/providers/openrouter-jev.js
function extractSystemOneNoulProbability(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid System One / OpenRouter Decisions response: expected JSON object");
  }
  const obj = data;
  const answers = obj.answers;
  if (answers && typeof answers === "object" && !Array.isArray(answers)) {
    const answerMap = answers;
    const entry = answerMap[TOPIC_SHIFT_QUESTION_NAME] ?? Object.values(answerMap)[0];
    if (entry && typeof entry === "object") {
      if (typeof entry.noul === "number" && Number.isFinite(entry.noul)) {
        return Math.min(1, Math.max(0, entry.noul));
      }
      if (typeof entry.probability === "number" && Number.isFinite(entry.probability)) {
        return Math.min(1, Math.max(0, entry.probability));
      }
    }
  }
  throw new Error(`Unable to extract noul probability from response: ${JSON.stringify(data).slice(0, 300)}`);
}
var OpenRouterJevProvider = class {
  name = "openrouter";
  model;
  apiKey;
  baseUrl;
  referer;
  title;
  fetchImpl;
  constructor(options) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl;
    this.referer = options.referer;
    this.title = options.title;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  async decide(input, timeoutMs) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      };
      if (this.referer)
        headers["HTTP-Referer"] = this.referer;
      if (this.title)
        headers["X-Title"] = this.title;
      const body = {
        model: this.model,
        state: buildSystemOneState(input),
        questions: {
          [TOPIC_SHIFT_QUESTION_NAME]: {
            type: "noul",
            instructions: TOPIC_SHIFT_INSTRUCTIONS,
            criteria: {
              true: TOPIC_SHIFT_CRITERIA.true,
              false: TOPIC_SHIFT_CRITERIA.false
            }
          }
        }
      };
      const res = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`OpenRouter Decisions API failed (${res.status}): ${errorText.slice(0, 300)}`);
      }
      const data = await res.json();
      const probability = extractSystemOneNoulProbability(data);
      return {
        provider: this.name,
        model: this.model,
        probability,
        latencyMs: Date.now() - startedAt,
        raw: data
      };
    } finally {
      clearTimeout(timer);
    }
  }
};

// packages/core/dist/providers/local-systemone.js
var LocalDecisionProvider = class {
  name = "local";
  model;
  url;
  apiFormat;
  apiKey;
  keepAlive;
  fetchImpl;
  constructor(options) {
    this.url = options.url;
    this.model = options.model;
    this.apiFormat = options.apiFormat;
    this.apiKey = options.apiKey;
    this.keepAlive = options.keepAlive;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  async decide(input, timeoutMs) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      const body = this.apiFormat === "openai-decisions" ? {
        model: this.model,
        input: buildOpenAiDecisionInput(input),
        questions: [
          {
            type: "predicate",
            name: TOPIC_SHIFT_QUESTION_NAME,
            instructions: buildOpenAiPredicateInstructions()
          }
        ]
      } : {
        model: this.model,
        state: buildSystemOneState(input),
        ...this.keepAlive ? { keep_alive: this.keepAlive } : {},
        questions: {
          [TOPIC_SHIFT_QUESTION_NAME]: {
            type: "noul",
            instructions: TOPIC_SHIFT_INSTRUCTIONS,
            criteria: {
              true: TOPIC_SHIFT_CRITERIA.true,
              false: TOPIC_SHIFT_CRITERIA.false
            }
          }
        }
      };
      const res = await this.fetchImpl(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Local Decision API (${this.url}) failed (${res.status}): ${errorText.slice(0, 300)}`);
      }
      const data = await res.json();
      const probability = this.apiFormat === "openai-decisions" ? extractOpenAiPredicateProbability(data) : extractSystemOneNoulProbability(data);
      return {
        provider: this.name,
        model: this.model,
        probability,
        latencyMs: Date.now() - startedAt,
        raw: data
      };
    } finally {
      clearTimeout(timer);
    }
  }
};

// packages/core/dist/providers/index.js
function resolveDecisionProvider(config, options = {}) {
  const fetchImpl = options.fetchImpl;
  const createOpenRouter = () => {
    if (!config.openrouter.apiKey)
      return void 0;
    return new OpenRouterJevProvider({
      apiKey: config.openrouter.apiKey,
      model: config.model || config.openrouter.model,
      baseUrl: config.openrouter.baseUrl,
      referer: config.openrouter.referer,
      title: config.openrouter.title,
      fetchImpl
    });
  };
  const createOpenAi = () => {
    if (!config.openai.apiKey)
      return void 0;
    return new OpenAiLunaProvider({
      apiKey: config.openai.apiKey,
      model: config.model || config.openai.model,
      baseUrl: config.openai.baseUrl,
      fetchImpl
    });
  };
  const createLocal = () => {
    if (!config.local.url)
      return void 0;
    return new LocalDecisionProvider({
      url: config.local.url,
      model: config.model || config.local.model,
      apiFormat: config.local.apiFormat,
      apiKey: config.local.apiKey,
      keepAlive: config.local.keepAlive,
      fetchImpl
    });
  };
  switch (config.provider) {
    case "openrouter":
      return createOpenRouter();
    case "openai":
      return createOpenAi();
    case "local":
      return createLocal();
    case "auto":
      return createOpenRouter() ?? createOpenAi() ?? createLocal();
  }
}

// packages/core/dist/evaluator.js
async function evaluateTopicShift(payload, options) {
  const { config } = options;
  const prompt = payload.prompt ?? "";
  const fastPathSkip = checkPromptFastPath(prompt, config);
  if (fastPathSkip) {
    return {
      action: "allow",
      skipReason: fastPathSkip,
      threshold: config.threshold
    };
  }
  const bypassCache = config.bypassCachePath ? new BypassCache(config.bypassCachePath, config.bypassTtlSeconds) : void 0;
  if (config.mode === "block" && bypassCache?.consumeIfBypassed(payload.session_id, prompt, options.now)) {
    return {
      action: "allow",
      skipReason: "bypass_cache_hit",
      threshold: config.threshold
    };
  }
  const parsedTranscript = options.transcript ?? (payload.transcript_path ? readTranscriptFile(payload.transcript_path, prompt) : void 0);
  if (!parsedTranscript) {
    return {
      action: "allow",
      skipReason: "no_transcript",
      threshold: config.threshold
    };
  }
  if (parsedTranscript.userTurnCount < config.minTurns) {
    return {
      action: "allow",
      skipReason: "insufficient_turns",
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount
    };
  }
  const window = buildSlidingWindowContext(parsedTranscript, config.maxWindowTurns, config.maxContextChars);
  if (window.contextChars < config.minContextChars) {
    return {
      action: "allow",
      skipReason: "insufficient_context",
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount,
      contextChars: window.contextChars
    };
  }
  const provider = options.provider ?? resolveDecisionProvider(config, { fetchImpl: options.fetchImpl });
  if (!provider) {
    return {
      action: "allow",
      skipReason: "no_provider_configured",
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount,
      contextChars: window.contextChars
    };
  }
  try {
    const decision = await provider.decide({
      previousContext: window.previousContext,
      newPrompt: prompt.trim(),
      compactionSummary: parsedTranscript.compactionSummary,
      recentUserTopics: window.recentUserTopics
    }, config.timeoutMs);
    if (decision.probability >= config.threshold) {
      if (config.mode === "block") {
        bypassCache?.recordBlockedPrompt(payload.session_id, prompt, decision.probability, options.now);
        return {
          action: "block",
          decision,
          threshold: config.threshold,
          userTurnCount: parsedTranscript.userTurnCount,
          contextChars: window.contextChars
        };
      }
      return {
        action: "advisory",
        decision,
        threshold: config.threshold,
        userTurnCount: parsedTranscript.userTurnCount,
        contextChars: window.contextChars
      };
    }
    return {
      action: "allow",
      decision,
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount,
      contextChars: window.contextChars
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      action: "allow",
      skipReason: "provider_error_fail_open",
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount,
      contextChars: window.contextChars,
      errorMessage: message
    };
  }
}

// packages/cli-hook/src/formatter.ts
var HANGUL_REGEX = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;
function resolveMessageLanguage(preference, prompt) {
  if (preference === "ko" || preference === "en") {
    return preference;
  }
  return HANGUL_REGEX.test(prompt) ? "ko" : "en";
}
function formatHookOutput(outcome, prompt, languagePreference) {
  if (outcome.action === "allow" || !outcome.decision) {
    return void 0;
  }
  const pct = Math.round(outcome.decision.probability * 100);
  const sourceTag = `${outcome.decision.provider}/${outcome.decision.model}`;
  const lang = resolveMessageLanguage(languagePreference, prompt);
  if (outcome.action === "block") {
    const reason = lang === "ko" ? [
      `[\uC8FC\uC81C \uC804\uD658 \uAC10\uC9C0 \xB7 ${pct}% \xB7 ${sourceTag}]`,
      "\uC785\uB825\uD558\uC2E0 \uD504\uB86C\uD504\uD2B8\uAC00 \uC9C0\uAE08\uAE4C\uC9C0\uC758 \uB300\uD654 \uC8FC\uC81C\uC640 \uD06C\uAC8C \uB2E4\uB985\uB2C8\uB2E4.",
      "\u2022 \uAD8C\uC7A5: `/compact` (\uB610\uB294 `/clear`)\uB85C \uCEE8\uD14D\uC2A4\uD2B8\uB97C \uC555\uCD95\uD55C \uB4A4 \uC9C4\uD589\uD574 \uC8FC\uC138\uC694.",
      "\u2022 \uADF8\uB300\uB85C \uC9C4\uD589: \uAC19\uC740 \uD504\uB86C\uD504\uD2B8\uB97C \uD55C \uBC88 \uB354 \uC804\uC1A1\uD558\uBA74 \uC790\uB3D9\uC73C\uB85C \uD1B5\uACFC\uB429\uB2C8\uB2E4. (\uB610\uB294 \uC55E\uC5D0 `!keep ` \uBD99\uC774\uAE30)"
    ].join("\n") : [
      `[Topic Shift Detected \xB7 ${pct}% \xB7 ${sourceTag}]`,
      "Your new prompt appears substantially unrelated to the current conversation context.",
      "\u2022 Recommended: run `/compact` (or `/clear`) first, then send your prompt.",
      "\u2022 Continue anyway: re-submit the same prompt once to bypass automatically (or prefix with `!keep `)."
    ].join("\n");
    return {
      decision: "block",
      reason
    };
  }
  const additionalContext = lang === "ko" ? `[Topic Shift Advisory \xB7 ${pct}% \xB7 ${sourceTag}] \uC0AC\uC6A9\uC790\uC758 \uC0C8 \uD504\uB86C\uD504\uD2B8\uAC00 \uC774\uC804 \uB300\uD654 \uC8FC\uC81C\uC640 \uD06C\uAC8C \uB2E4\uB978 \uAC83\uC73C\uB85C \uAC10\uC9C0\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAE34 \uC791\uC5C5\uC744 \uC2DC\uC791\uD558\uAE30 \uC804\uC5D0 \uBA3C\uC800 \`/compact\`\uB85C \uCEE8\uD14D\uC2A4\uD2B8\uB97C \uC555\uCD95\uD560\uC9C0 \uD55C \uC904\uB85C \uC815\uC911\uD788 \uC81C\uC548\uD55C \uB4A4, \uC0AC\uC6A9\uC790\uAC00 \uC6D0\uD560 \uB54C \uC555\uCD95\uD560 \uC218 \uC788\uB3C4\uB85D \uC548\uB0B4\uD558\uC138\uC694.` : `[Topic Shift Advisory \xB7 ${pct}% \xB7 ${sourceTag}] The user's new prompt appears substantially unrelated to the previous conversation topic. Before diving into a long response, briefly note the topic shift and ask if they want to run \`/compact\` first.`;
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext
    }
  };
}

// packages/cli-hook/src/hook.ts
async function readStdin() {
  return await new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}
async function main() {
  const rawInput = await readStdin();
  if (!rawInput.trim()) {
    process.exit(0);
  }
  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    process.exit(0);
  }
  const config = loadConfig({ cwd: payload.cwd });
  const outcome = await evaluateTopicShift(payload, { config });
  if (config.debug) {
    const summary = {
      action: outcome.action,
      skipReason: outcome.skipReason,
      provider: outcome.decision?.provider,
      model: outcome.decision?.model,
      probability: outcome.decision?.probability,
      latencyMs: outcome.decision?.latencyMs,
      threshold: outcome.threshold,
      userTurnCount: outcome.userTurnCount,
      contextChars: outcome.contextChars,
      errorMessage: outcome.errorMessage
    };
    process.stderr.write(`[topic-shift-compact] ${JSON.stringify(summary)}
`);
  }
  const output = formatHookOutput(outcome, payload.prompt ?? "", config.language);
  if (output) {
    process.stdout.write(`${JSON.stringify(output)}
`);
  }
  process.exit(0);
}
main().catch((err) => {
  if (process.env.TSC_DEBUG === "1" || process.env.TSC_DEBUG === "true") {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[topic-shift-compact] fatal fail-open: ${message}
`);
  }
  process.exit(0);
});
