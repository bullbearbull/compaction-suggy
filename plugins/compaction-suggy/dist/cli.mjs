#!/usr/bin/env node

// packages/cli-hook/src/cli.ts
import fs2 from "node:fs";
import os2 from "node:os";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

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

// packages/cli-hook/src/cli.ts
var HOOK_MARKERS = ["compaction-suggy", "topic-shift-compact"];
function isOwnHookEntry(entry) {
  if (!entry) return false;
  if (typeof entry.command === "string" && HOOK_MARKERS.some((marker) => entry.command.includes(marker))) {
    return true;
  }
  if (Array.isArray(entry.args) && entry.args.some(
    (arg) => typeof arg === "string" && HOOK_MARKERS.some((marker) => arg.includes(marker))
  )) {
    return true;
  }
  return false;
}
function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const flags = {};
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token || !token.startsWith("--")) continue;
    const eqIndex = token.indexOf("=");
    if (eqIndex > 2) {
      const key = token.slice(2, eqIndex);
      flags[key] = token.slice(eqIndex + 1);
    } else {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    }
  }
  return { command, flags };
}
function getFlagString(flags, key) {
  const v = flags[key];
  return typeof v === "string" ? v : void 0;
}
function resolveHookScriptPath() {
  const currentFile = fileURLToPath(import.meta.url);
  return path2.join(path2.dirname(currentFile), "hook.mjs");
}
function printHelp() {
  console.log(`Compaction Suggy CLI

Usage:
  node cli.mjs <command> [options]

Commands:
  init                 Write user config (~/.config/topic-shift-compact/config.json)
    --provider         openrouter | openai | local | auto (default: auto)
    --model            Override model ID (e.g. typesafe/jev-latest, gpt-6-luna, tev1)
    --threshold        Topic-shift probability threshold 0.0-1.0 (default: 0.75)
    --mode             block | advisory (default: block)
    --language         auto | ko | en (default: auto)
    --local-url        Local endpoint URL (default: ${DEFAULT_LOCAL_URL})
    --local-format     systemone | openai-decisions (default: systemone)
    --min-turns        Minimum user turns before checking (default: 3)

  doctor               Inspect resolved config, provider credentials, and hook status

  test                 Send a live test decision query using active config
    --context          Prior conversation context (optional sample provided)
    --prompt           New user prompt to test (optional sample provided)

  install-user         Register UserPromptSubmit hook in user settings (Claude Code, Claude Desktop Cowork, Codex CLI/Desktop)
    --target           claude | codex | all (required)

  uninstall-user       Remove Compaction Suggy hook from user settings
    --target           claude | codex | all (required)
`);
}
function runInit(flags) {
  const configPath = getUserConfigPath();
  const provider = getFlagString(flags, "provider") ?? "auto";
  if (!["openrouter", "openai", "local", "auto"].includes(provider)) {
    throw new Error(`Invalid --provider "${provider}". Use openrouter | openai | local | auto.`);
  }
  const mode = getFlagString(flags, "mode") ?? "block";
  if (!["block", "advisory"].includes(mode)) {
    throw new Error(`Invalid --mode "${mode}". Use block | advisory.`);
  }
  const language = getFlagString(flags, "language") ?? "auto";
  if (!["auto", "ko", "en"].includes(language)) {
    throw new Error(`Invalid --language "${language}". Use auto | ko | en.`);
  }
  const localFormat = getFlagString(flags, "local-format") ?? "systemone";
  if (!["systemone", "openai-decisions"].includes(localFormat)) {
    throw new Error(
      `Invalid --local-format "${localFormat}". Use systemone | openai-decisions.`
    );
  }
  const thresholdRaw = getFlagString(flags, "threshold");
  const threshold = thresholdRaw ? Number(thresholdRaw) : 0.75;
  const minTurnsRaw = getFlagString(flags, "min-turns");
  const minTurns = minTurnsRaw ? Number(minTurnsRaw) : 3;
  const model = getFlagString(flags, "model");
  const localUrl = getFlagString(flags, "local-url") ?? DEFAULT_LOCAL_URL;
  const nextConfig = {
    enabled: true,
    provider,
    ...model ? { model } : {},
    threshold: Number.isFinite(threshold) ? Math.min(1, Math.max(0, threshold)) : 0.75,
    mode,
    language,
    minTurns: Number.isFinite(minTurns) ? Math.max(1, Math.round(minTurns)) : 3,
    openrouter: {
      model: DEFAULT_OPENROUTER_MODEL
    },
    openai: {
      model: DEFAULT_OPENAI_MODEL
    },
    local: {
      url: localUrl,
      apiFormat: localFormat,
      model: DEFAULT_LOCAL_MODEL
    }
  };
  fs2.mkdirSync(path2.dirname(configPath), { recursive: true });
  fs2.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}
`, "utf8");
  console.log(`Wrote config to ${configPath}`);
  console.log(JSON.stringify(nextConfig, null, 2));
}
function runDoctor() {
  const config = loadConfig({ cwd: process.cwd() });
  const resolved = resolveDecisionProvider(config);
  console.log("Compaction Suggy doctor\n");
  console.log(`User config path : ${getUserConfigPath()}`);
  console.log(`Bypass cache path: ${config.bypassCachePath}`);
  console.log(`Enabled          : ${config.enabled}`);
  console.log(`Mode             : ${config.mode}`);
  console.log(`Language         : ${config.language}`);
  console.log(`Threshold        : ${config.threshold}`);
  console.log(`Timeout (ms)     : ${config.timeoutMs}`);
  console.log(`Min turns / chars: ${config.minTurns} turns / ${config.minContextChars} chars`);
  console.log(`Configured mode  : provider=${config.provider}`);
  console.log(
    `Resolved provider: ${resolved ? `${resolved.name} (${resolved.model})` : "NONE"}`
  );
  console.log("\nProvider readiness:");
  console.log(
    `  - OpenRouter (Jev)   : ${config.openrouter.apiKey ? "API key set" : "OPENROUTER_API_KEY missing"} (${config.openrouter.model})`
  );
  console.log(
    `  - OpenAI (GPT-6 Luna): ${config.openai.apiKey ? "API key set" : "OPENAI_API_KEY missing"} (${config.openai.model})`
  );
  console.log(
    `  - Local Serving      : ${config.local.url} [${config.local.apiFormat}] (${config.local.model})`
  );
  console.log("\nUser-level hook status:");
  for (const target of ["claude", "codex"]) {
    const filePath = getUserSettingsFile(target);
    const installed = isHookInstalledInFile(filePath);
    const label = target === "claude" ? "Claude Code / Desktop" : "Codex CLI / Desktop  ";
    console.log(
      `  - ${label}: ${installed ? "INSTALLED" : "not registered"} (${filePath})`
    );
  }
}
async function runTest(flags) {
  const config = loadConfig({ cwd: process.cwd() });
  const provider = resolveDecisionProvider(config);
  if (!provider) {
    throw new Error(
      "No Decision Model provider configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or configure local provider via `init --provider local`."
    );
  }
  const previousContext = getFlagString(flags, "context") ?? [
    "User: PostgreSQL \uB9C8\uC774\uADF8\uB808\uC774\uC158 \uC2A4\uD06C\uB9BD\uD2B8\uC5D0\uC11C users \uD14C\uC774\uBE14 \uC778\uB371\uC2A4 \uC0DD\uC131\uC774 \uB77D\uC744 \uC720\uBC1C\uD574.",
    "Assistant: CREATE INDEX CONCURRENTLY\uB97C \uC0AC\uC6A9\uD558\uACE0 \uD2B8\uB79C\uC7AD\uC158 \uBE14\uB85D \uBC16\uC5D0\uC11C \uC2E4\uD589\uD558\uB3C4\uB85D \uBD84\uB9AC\uD588\uC2B5\uB2C8\uB2E4.",
    "User: \uB864\uBC31 \uC2A4\uD06C\uB9BD\uD2B8\uB3C4 \uAC19\uC774 \uC810\uAC80\uD574\uC918.",
    "Assistant: DROP INDEX CONCURRENTLY \uAD6C\uBB38\uACFC \uB77D \uD0C0\uC784\uC544\uC6C3 \uC124\uC815\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4."
  ].join("\n");
  const newPrompt = getFlagString(flags, "prompt") ?? "React \uB300\uC2DC\uBCF4\uB4DC \uD5E4\uB354\uC5D0 \uB2E4\uD06C\uBAA8\uB4DC \uD1A0\uAE00 \uBC84\uD2BC\uACFC Tailwind \uD14C\uB9C8 \uC804\uD658 \uAE30\uB2A5 \uAD6C\uD604\uD574\uC918.";
  console.log(`Calling ${provider.name}/${provider.model} (timeout ${config.timeoutMs}ms)...`);
  const result = await provider.decide(
    {
      previousContext,
      newPrompt,
      recentUserTopics: [previousContext.split("\n")[0] ?? ""]
    },
    config.timeoutMs
  );
  const triggered = result.probability >= config.threshold;
  console.log(
    JSON.stringify(
      {
        provider: result.provider,
        model: result.model,
        probability: result.probability,
        threshold: config.threshold,
        wouldTrigger: triggered,
        mode: config.mode,
        latencyMs: result.latencyMs
      },
      null,
      2
    )
  );
}
function getUserSettingsFile(target) {
  if (target === "claude") {
    return path2.join(os2.homedir(), ".claude", "settings.json");
  }
  if (target === "codex") {
    return path2.join(os2.homedir(), ".codex", "hooks.json");
  }
  throw new Error(`Invalid --target "${target}". Expected "claude" or "codex".`);
}
function readJsonObject(filePath) {
  if (!fs2.existsSync(filePath)) return {};
  const raw = fs2.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed;
  }
  return {};
}
function resolveTargets(target) {
  if (target === "all") return ["claude", "codex"];
  if (target === "claude" || target === "codex") return [target];
  throw new Error(`Invalid --target "${target}". Expected "claude", "codex", or "all".`);
}
function isHookInstalledInFile(filePath) {
  try {
    if (!fs2.existsSync(filePath)) return false;
    const root = readJsonObject(filePath);
    const hooksMap = root.hooks && typeof root.hooks === "object" && !Array.isArray(root.hooks) ? root.hooks : void 0;
    const groups = Array.isArray(hooksMap?.UserPromptSubmit) ? hooksMap.UserPromptSubmit : [];
    return groups.some(
      (group) => Array.isArray(group?.hooks) && group.hooks.some((h) => isOwnHookEntry(h))
    );
  } catch {
    return false;
  }
}
function installHookToTarget(target, hookScript) {
  const settingsFile = getUserSettingsFile(target);
  const root = readJsonObject(settingsFile);
  const hooksMap = root.hooks && typeof root.hooks === "object" && !Array.isArray(root.hooks) ? { ...root.hooks } : {};
  const existingGroups = Array.isArray(hooksMap.UserPromptSubmit) ? [...hooksMap.UserPromptSubmit] : [];
  const alreadyInstalled = existingGroups.some(
    (group) => Array.isArray(group?.hooks) && group.hooks.some((h) => isOwnHookEntry(h))
  );
  if (alreadyInstalled) {
    console.log(`Hook already registered in ${settingsFile}`);
    return;
  }
  existingGroups.push({
    hooks: [
      {
        type: "command",
        command: "node",
        args: [hookScript],
        timeout: 10
      }
    ]
  });
  hooksMap.UserPromptSubmit = existingGroups;
  root.hooks = hooksMap;
  fs2.mkdirSync(path2.dirname(settingsFile), { recursive: true });
  fs2.writeFileSync(settingsFile, `${JSON.stringify(root, null, 2)}
`, "utf8");
  console.log(`Registered UserPromptSubmit hook in ${settingsFile}`);
  console.log(`Command: node "${hookScript}"`);
}
function runInstallUser(flags) {
  const target = getFlagString(flags, "target");
  if (!target) {
    throw new Error("Missing required --target claude | codex | all");
  }
  const hookScript = resolveHookScriptPath();
  if (!fs2.existsSync(hookScript)) {
    throw new Error(`Bundled hook script not found at ${hookScript}. Run npm run build first.`);
  }
  for (const t of resolveTargets(target)) {
    installHookToTarget(t, hookScript);
  }
}
function uninstallHookFromTarget(target) {
  const settingsFile = getUserSettingsFile(target);
  if (!fs2.existsSync(settingsFile)) {
    console.log(`No settings file found at ${settingsFile}`);
    return;
  }
  const root = readJsonObject(settingsFile);
  const hooksMap = root.hooks && typeof root.hooks === "object" && !Array.isArray(root.hooks) ? { ...root.hooks } : {};
  if (!Array.isArray(hooksMap.UserPromptSubmit)) {
    console.log(`No UserPromptSubmit hooks found in ${settingsFile}`);
    return;
  }
  const filtered = hooksMap.UserPromptSubmit.filter(
    (group) => !(Array.isArray(group?.hooks) && group.hooks.some((h) => isOwnHookEntry(h)))
  );
  hooksMap.UserPromptSubmit = filtered;
  root.hooks = hooksMap;
  fs2.writeFileSync(settingsFile, `${JSON.stringify(root, null, 2)}
`, "utf8");
  console.log(`Removed Compaction Suggy UserPromptSubmit hook from ${settingsFile}`);
}
function runUninstallUser(flags) {
  const target = getFlagString(flags, "target");
  if (!target) {
    throw new Error("Missing required --target claude | codex | all");
  }
  for (const t of resolveTargets(target)) {
    uninstallHookFromTarget(t);
  }
}
async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "init":
      runInit(flags);
      break;
    case "doctor":
      runDoctor();
      break;
    case "test":
      await runTest(flags);
      break;
    case "install-user":
      runInstallUser(flags);
      break;
    case "uninstall-user":
      runUninstallUser(flags);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}
`);
      printHelp();
      process.exit(1);
  }
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
