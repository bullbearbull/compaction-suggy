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

// packages/core/dist/window.js
function truncateText(text, maxLen) {
  if (text.length <= maxLen)
    return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}\u2026`;
}
function buildParsedTranscriptFromTurns(rawTurns, currentPrompt, compactionSummary) {
  const turns = [];
  for (const turn of rawTurns) {
    const cleaned = turn.text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!cleaned)
      continue;
    const last = turns[turns.length - 1];
    if (last && last.role === turn.role && normalizePromptForComparison(last.text) === normalizePromptForComparison(cleaned)) {
      continue;
    }
    turns.push({ role: turn.role, text: cleaned });
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
    compactionCount: compactionSummary ? 1 : 0,
    userTurnCount
  };
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

// packages/core/dist/browser.js
async function evaluateTranscriptTopicShift(prompt, parsedTranscript, options) {
  const { config } = options;
  const fastPathSkip = checkPromptFastPath(prompt, config);
  if (fastPathSkip) {
    return {
      action: "allow",
      skipReason: fastPathSkip,
      threshold: config.threshold
    };
  }
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
      return {
        action: config.mode === "block" ? "block" : "advisory",
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

// packages/claude-mod/src/register.ts
var HANGUL_REGEX = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;
var runtimeOverrides = {};
var bypassMap = /* @__PURE__ */ new Map();
var sessionTurns = /* @__PURE__ */ new Map();
function setModRuntimeOverrides(overrides) {
  runtimeOverrides = overrides;
  bypassMap.clear();
  sessionTurns.clear();
}
function getRuntimeEnv() {
  const g = globalThis;
  return g.process?.env ?? {};
}
function parseBool(v) {
  if (v === void 0) return void 0;
  const s = v.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return void 0;
}
function parseNum(v, min, max) {
  if (!v || !v.trim()) return void 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return void 0;
  if (min !== void 0 && n < min) return min;
  if (max !== void 0 && n > max) return max;
  return n;
}
function loadModConfigFromEnv(env = getRuntimeEnv()) {
  const base = getDefaultConfig();
  const providerRaw = env.TSC_PROVIDER?.trim().toLowerCase();
  const provider = providerRaw === "openrouter" || providerRaw === "openai" || providerRaw === "local" || providerRaw === "auto" ? providerRaw : base.provider;
  const modeRaw = env.TSC_MODE?.trim().toLowerCase();
  const mode = modeRaw === "advisory" || modeRaw === "block" ? modeRaw : base.mode;
  const langRaw = env.TSC_LANGUAGE?.trim().toLowerCase();
  const language = langRaw === "ko" || langRaw === "en" || langRaw === "auto" ? langRaw : base.language;
  const localFormatRaw = env.TSC_LOCAL_API_FORMAT?.trim().toLowerCase();
  const localApiFormat = localFormatRaw === "openai-decisions" || localFormatRaw === "systemone" ? localFormatRaw : base.local.apiFormat;
  const disabled = parseBool(env.TSC_DISABLED);
  const enabledEnv = parseBool(env.TSC_ENABLED);
  const enabled = disabled === true ? false : enabledEnv ?? base.enabled;
  return mergeConfig(base, {
    enabled,
    provider,
    model: env.TSC_MODEL?.trim() || void 0,
    threshold: parseNum(env.TSC_THRESHOLD, 0, 1) ?? base.threshold,
    timeoutMs: Math.round(parseNum(env.TSC_TIMEOUT_MS, 100, 6e4) ?? base.timeoutMs),
    mode,
    language,
    minTurns: Math.round(parseNum(env.TSC_MIN_TURNS, 1, 100) ?? base.minTurns),
    minContextChars: Math.round(
      parseNum(env.TSC_MIN_CONTEXT_CHARS, 0, 5e4) ?? base.minContextChars
    ),
    minPromptChars: Math.round(
      parseNum(env.TSC_MIN_PROMPT_CHARS, 1, 1e3) ?? base.minPromptChars
    ),
    maxWindowTurns: Math.round(
      parseNum(env.TSC_MAX_WINDOW_TURNS, 1, 100) ?? base.maxWindowTurns
    ),
    maxContextChars: Math.round(
      parseNum(env.TSC_MAX_CONTEXT_CHARS, 200, 5e4) ?? base.maxContextChars
    ),
    bypassTtlSeconds: Math.round(
      parseNum(env.TSC_BYPASS_TTL_SECONDS, 5, 86400) ?? base.bypassTtlSeconds
    ),
    openrouter: {
      baseUrl: env.TSC_OPENROUTER_URL?.trim() || base.openrouter.baseUrl,
      model: env.TSC_OPENROUTER_MODEL?.trim() || base.openrouter.model,
      apiKey: env.OPENROUTER_API_KEY?.trim() || env.TSC_OPENROUTER_API_KEY?.trim()
    },
    openai: {
      baseUrl: env.TSC_OPENAI_URL?.trim() || base.openai.baseUrl,
      model: env.TSC_OPENAI_MODEL?.trim() || base.openai.model,
      apiKey: env.OPENAI_API_KEY?.trim() || env.TSC_OPENAI_API_KEY?.trim()
    },
    local: {
      url: env.TSC_LOCAL_URL?.trim() || base.local.url,
      apiFormat: localApiFormat,
      model: env.TSC_LOCAL_MODEL?.trim() || base.local.model,
      apiKey: env.TSC_LOCAL_API_KEY?.trim(),
      keepAlive: env.TSC_LOCAL_KEEP_ALIVE?.trim() || base.local.keepAlive
    },
    debug: parseBool(env.TSC_DEBUG) ?? base.debug
  });
}
function resolveLanguage(preference, prompt) {
  if (preference === "ko" || preference === "en") return preference;
  return HANGUL_REGEX.test(prompt) ? "ko" : "en";
}
function extractMessagesToTranscript(messages, currentPrompt) {
  if (!Array.isArray(messages) || messages.length === 0) return void 0;
  const turns = [];
  for (const m of messages) {
    if (!m || m.role !== "user" && m.role !== "assistant") continue;
    let text = "";
    if (typeof m.text === "string") {
      text = m.text;
    } else if (typeof m.content === "string") {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content.map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && typeof block.text === "string") {
          return String(block.text);
        }
        return "";
      }).filter(Boolean).join("\n");
    }
    if (text.trim()) {
      turns.push({ role: m.role, text: text.trim() });
    }
  }
  if (turns.length === 0) return void 0;
  return buildParsedTranscriptFromTurns(turns, currentPrompt);
}
function formatModBlockReason(outcome, lang) {
  const pct = Math.round((outcome.decision?.probability ?? 0) * 100);
  const tag = outcome.decision ? `${outcome.decision.provider}/${outcome.decision.model} \xB7 ${outcome.decision.latencyMs}ms` : "decision-model";
  if (lang === "ko") {
    return [
      `[Compaction Suggy \xB7 \uC8FC\uC81C \uC804\uD658 \uAC10\uC9C0 ${pct}% \xB7 ${tag}]`,
      "\uC785\uB825\uD558\uC2E0 \uD504\uB86C\uD504\uD2B8\uAC00 \uC9C0\uAE08\uAE4C\uC9C0\uC758 \uB300\uD654 \uC8FC\uC81C\uC640 \uD06C\uAC8C \uB2E4\uB985\uB2C8\uB2E4.",
      "\u2022 \uAD8C\uC7A5: `/compact` (\uB610\uB294 `/clear`)\uB85C \uCEE8\uD14D\uC2A4\uD2B8\uB97C \uC555\uCD95\uD55C \uB4A4 \uC9C4\uD589\uD574 \uC8FC\uC138\uC694.",
      "\u2022 \uADF8\uB300\uB85C \uC9C4\uD589: \uAC19\uC740 \uD504\uB86C\uD504\uD2B8\uB97C \uD55C \uBC88 \uB354 \uC804\uC1A1\uD558\uBA74 \uC790\uB3D9\uC73C\uB85C \uD1B5\uACFC\uB429\uB2C8\uB2E4. (\uB610\uB294 \uC55E\uC5D0 `!keep ` \uBD99\uC774\uAE30)"
    ].join("\n");
  }
  return [
    `[Compaction Suggy \xB7 Topic Shift ${pct}% \xB7 ${tag}]`,
    "Your new prompt appears substantially unrelated to the current conversation context.",
    "\u2022 Recommended: run `/compact` (or `/clear`) first, then send your prompt.",
    "\u2022 Continue anyway: re-submit the same prompt once to bypass automatically (or prefix with `!keep `)."
  ].join("\n");
}
function formatModAdvisoryContext(outcome, lang) {
  const pct = Math.round((outcome.decision?.probability ?? 0) * 100);
  const tag = outcome.decision ? `${outcome.decision.provider}/${outcome.decision.model}` : "decision-model";
  return lang === "ko" ? `[Compaction Suggy Advisory \xB7 ${pct}% \xB7 ${tag}] \uC0AC\uC6A9\uC790\uC758 \uC0C8 \uD504\uB86C\uD504\uD2B8\uAC00 \uC774\uC804 \uB300\uD654 \uC8FC\uC81C\uC640 \uD06C\uAC8C \uB2E4\uB978 \uAC83\uC73C\uB85C \uAC10\uC9C0\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAE34 \uC791\uC5C5\uC744 \uC2DC\uC791\uD558\uAE30 \uC804\uC5D0 \uBA3C\uC800 \`/compact\`\uB85C \uCEE8\uD14D\uC2A4\uD2B8\uB97C \uC555\uCD95\uD560\uC9C0 \uD55C \uC904\uB85C \uC815\uC911\uD788 \uC81C\uC548\uD574 \uC8FC\uC138\uC694.` : `[Compaction Suggy Advisory \xB7 ${pct}% \xB7 ${tag}] The user's new prompt appears substantially unrelated to the previous conversation topic. Before diving into a long response, briefly suggest running \`/compact\` first.`;
}
function bypassKey(sessionId, prompt) {
  return `${sessionId}::${normalizePromptForComparison(prompt)}`;
}
function consumeBypass(sessionId, prompt) {
  const key = bypassKey(sessionId, prompt);
  const exp = bypassMap.get(key);
  if (!exp) return false;
  bypassMap.delete(key);
  return exp > Date.now();
}
function recordBypass(sessionId, prompt, ttlSeconds) {
  const now = Date.now();
  for (const [k, exp] of bypassMap.entries()) {
    if (exp <= now) bypassMap.delete(k);
  }
  bypassMap.set(bypassKey(sessionId, prompt), now + Math.max(5, ttlSeconds) * 1e3);
}
async function evaluatePromptForMod(sessionId, prompt, rawMessages) {
  const config = (runtimeOverrides.loadConfigFn ?? loadModConfigFromEnv)();
  if (config.mode === "block" && consumeBypass(sessionId, prompt)) {
    const list2 = sessionTurns.get(sessionId) ?? [];
    list2.push({ role: "user", text: prompt.trim() });
    sessionTurns.set(sessionId, list2.slice(-40));
    return { kind: "allow" };
  }
  const parsed = extractMessagesToTranscript(rawMessages, prompt) ?? (() => {
    const history = sessionTurns.get(sessionId);
    return history && history.length > 0 ? buildParsedTranscriptFromTurns(history, prompt) : void 0;
  })();
  const outcome = await evaluateTranscriptTopicShift(prompt, parsed, {
    config,
    provider: runtimeOverrides.provider,
    fetchImpl: runtimeOverrides.fetchImpl
  });
  const lang = resolveLanguage(config.language, prompt);
  if (outcome.action === "block" && outcome.decision) {
    recordBypass(sessionId, prompt, config.bypassTtlSeconds);
    const pct = Math.round(outcome.decision.probability * 100);
    return {
      kind: "block",
      toastMessage: lang === "ko" ? `Compaction Suggy: \uC8FC\uC81C \uC804\uD658 \uAC10\uC9C0 (${pct}%) \u2014 /compact \uAD8C\uC7A5` : `Compaction Suggy: Topic shift (${pct}%) \u2014 /compact recommended`,
      response: {
        decision: "block",
        reason: formatModBlockReason(outcome, lang)
      }
    };
  }
  const list = sessionTurns.get(sessionId) ?? [];
  list.push({ role: "user", text: prompt.trim() });
  sessionTurns.set(sessionId, list.slice(-40));
  if (outcome.action === "advisory" && outcome.decision) {
    const pct = Math.round(outcome.decision.probability * 100);
    return {
      kind: "advisory",
      toastMessage: lang === "ko" ? `Compaction Suggy: \uC8FC\uC81C \uC804\uD658 \uC54C\uB9BC (${pct}%)` : `Compaction Suggy: Topic shift advisory (${pct}%)`,
      response: {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: formatModAdvisoryContext(outcome, lang)
        }
      }
    };
  }
  return { kind: "allow" };
}
function register(on) {
  on("prompt.submit", async ($, e, next) => {
    try {
      const prompt = typeof e?.prompt === "string" ? e.prompt : "";
      if (!prompt.trim()) {
        return await next(e);
      }
      const sessionId = e.session_id ?? "default";
      const result = await evaluatePromptForMod(sessionId, prompt, e.messages);
      if (result.kind === "block" && result.response) {
        return result.response;
      }
      if (result.kind === "advisory" && result.response) {
        return result.response;
      }
      return await next(e);
    } catch {
      return await next(e);
    }
  });
}
export {
  loadModConfigFromEnv,
  register,
  setModRuntimeOverrides
};
