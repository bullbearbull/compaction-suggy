import {
  buildParsedTranscriptFromTurns,
  evaluateTranscriptTopicShift,
  getDefaultConfig,
  mergeConfig,
  normalizePromptForComparison,
  type DecisionProvider,
  type EvaluationOutcome,
  type HookMode,
  type LanguagePreference,
  type LocalApiFormat,
  type ParsedTranscript,
  type ProviderSelection,
  type TopicShiftConfig,
  type TranscriptTurn,
  type UserPromptSubmitPayload,
} from "@topic-shift-compact/core/browser";

/**
 * Minimal structural typing for Claude Code's in-process Mods API (v2.1.287+).
 * Note: Claude Code's mod validator enforces:
 * - Zero `node:*` imports (only relative modules and `"claude-code"`)
 * - Top-level `export function register(on)` declaration
 * - Direct `on("<event>", handler)` calls at the callsite
 */
export interface ModUiApi {
  toast?: (message: string, options?: Record<string, unknown>) => void;
  notify?: (message: string, options?: Record<string, unknown>) => void;
  log?: (message: string) => void;
}

export interface ModContext {
  ui?: ModUiApi;
  session?: {
    id?: string;
    cwd?: string;
    transcriptPath?: string;
    messages?: ModPromptEvent["messages"];
  };
}

export interface ModPromptEvent extends UserPromptSubmitPayload {
  messages?: Array<{
    role?: string;
    content?: unknown;
    text?: string;
  }>;
}

export type ModNextFn<TEvent = unknown, TResult = unknown> = (
  event: TEvent,
) => Promise<TResult> | TResult;

export type ModHandler<TEvent = unknown, TResult = unknown> = (
  $: ModContext,
  event: TEvent,
  next: ModNextFn<TEvent, TResult>,
) => Promise<TResult> | TResult;

export type ModOnFn = (eventName: string, handler: ModHandler<any, any>) => void;

export interface ModRuntimeOverrides {
  loadConfigFn?: () => TopicShiftConfig;
  provider?: DecisionProvider;
  fetchImpl?: typeof fetch;
}

const HANGUL_REGEX = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;

let runtimeOverrides: ModRuntimeOverrides = {};
const bypassMap = new Map<string, number>();
const sessionTurns = new Map<string, TranscriptTurn[]>();

/** Test helper for injecting deterministic config/provider without breaking top-level register(on). */
export function setModRuntimeOverrides(overrides: ModRuntimeOverrides): void {
  runtimeOverrides = overrides;
  bypassMap.clear();
  sessionTurns.clear();
}

function getRuntimeEnv(): Record<string, string | undefined> {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env ?? {};
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return undefined;
}

function parseNum(v: string | undefined, min?: number, max?: number): number | undefined {
  if (!v || !v.trim()) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

export function loadModConfigFromEnv(
  env: Record<string, string | undefined> = getRuntimeEnv(),
): TopicShiftConfig {
  const base = getDefaultConfig();

  const providerRaw = env.TSC_PROVIDER?.trim().toLowerCase();
  const provider: ProviderSelection =
    providerRaw === "openrouter" ||
    providerRaw === "openai" ||
    providerRaw === "local" ||
    providerRaw === "auto"
      ? providerRaw
      : base.provider;

  const modeRaw = env.TSC_MODE?.trim().toLowerCase();
  const mode: HookMode =
    modeRaw === "advisory" || modeRaw === "block" ? modeRaw : base.mode;

  const langRaw = env.TSC_LANGUAGE?.trim().toLowerCase();
  const language: LanguagePreference =
    langRaw === "ko" || langRaw === "en" || langRaw === "auto"
      ? langRaw
      : base.language;

  const localFormatRaw = env.TSC_LOCAL_API_FORMAT?.trim().toLowerCase();
  const localApiFormat: LocalApiFormat =
    localFormatRaw === "openai-decisions" || localFormatRaw === "systemone"
      ? localFormatRaw
      : base.local.apiFormat;

  const disabled = parseBool(env.TSC_DISABLED);
  const enabledEnv = parseBool(env.TSC_ENABLED);
  const enabled = disabled === true ? false : (enabledEnv ?? base.enabled);

  return mergeConfig(base, {
    enabled,
    provider,
    model: env.TSC_MODEL?.trim() || undefined,
    threshold: parseNum(env.TSC_THRESHOLD, 0, 1) ?? base.threshold,
    timeoutMs: Math.round(parseNum(env.TSC_TIMEOUT_MS, 100, 60000) ?? base.timeoutMs),
    mode,
    language,
    minTurns: Math.round(parseNum(env.TSC_MIN_TURNS, 1, 100) ?? base.minTurns),
    minContextChars: Math.round(
      parseNum(env.TSC_MIN_CONTEXT_CHARS, 0, 50000) ?? base.minContextChars,
    ),
    minPromptChars: Math.round(
      parseNum(env.TSC_MIN_PROMPT_CHARS, 1, 1000) ?? base.minPromptChars,
    ),
    maxWindowTurns: Math.round(
      parseNum(env.TSC_MAX_WINDOW_TURNS, 1, 100) ?? base.maxWindowTurns,
    ),
    maxContextChars: Math.round(
      parseNum(env.TSC_MAX_CONTEXT_CHARS, 200, 50000) ?? base.maxContextChars,
    ),
    bypassTtlSeconds: Math.round(
      parseNum(env.TSC_BYPASS_TTL_SECONDS, 5, 86400) ?? base.bypassTtlSeconds,
    ),
    openrouter: {
      baseUrl: env.TSC_OPENROUTER_URL?.trim() || base.openrouter.baseUrl,
      model: env.TSC_OPENROUTER_MODEL?.trim() || base.openrouter.model,
      apiKey: env.OPENROUTER_API_KEY?.trim() || env.TSC_OPENROUTER_API_KEY?.trim(),
    },
    openai: {
      baseUrl: env.TSC_OPENAI_URL?.trim() || base.openai.baseUrl,
      model: env.TSC_OPENAI_MODEL?.trim() || base.openai.model,
      apiKey: env.OPENAI_API_KEY?.trim() || env.TSC_OPENAI_API_KEY?.trim(),
    },
    local: {
      url: env.TSC_LOCAL_URL?.trim() || base.local.url,
      apiFormat: localApiFormat,
      model: env.TSC_LOCAL_MODEL?.trim() || base.local.model,
      apiKey: env.TSC_LOCAL_API_KEY?.trim(),
      keepAlive: env.TSC_LOCAL_KEEP_ALIVE?.trim() || base.local.keepAlive,
    },
    debug: parseBool(env.TSC_DEBUG) ?? base.debug,
  });
}

function resolveLanguage(preference: LanguagePreference, prompt: string): "ko" | "en" {
  if (preference === "ko" || preference === "en") return preference;
  return HANGUL_REGEX.test(prompt) ? "ko" : "en";
}

function extractMessagesToTranscript(
  messages: ModPromptEvent["messages"],
  currentPrompt?: string,
): ParsedTranscript | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  const turns: TranscriptTurn[] = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    let text = "";
    if (typeof m.text === "string") {
      text = m.text;
    } else if (typeof m.content === "string") {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content
        .map((block) => {
          if (typeof block === "string") return block;
          if (
            block &&
            typeof block === "object" &&
            typeof (block as Record<string, unknown>).text === "string"
          ) {
            return String((block as Record<string, unknown>).text);
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    if (text.trim()) {
      turns.push({ role: m.role, text: text.trim() });
    }
  }
  if (turns.length === 0) return undefined;
  return buildParsedTranscriptFromTurns(turns, currentPrompt);
}

function formatModBlockReason(outcome: EvaluationOutcome, lang: "ko" | "en"): string {
  const pct = Math.round((outcome.decision?.probability ?? 0) * 100);
  const tag = outcome.decision
    ? `${outcome.decision.provider}/${outcome.decision.model} · ${outcome.decision.latencyMs}ms`
    : "decision-model";

  if (lang === "ko") {
    return [
      `[Compaction Suggy · 주제 전환 감지 ${pct}% · ${tag}]`,
      "입력하신 프롬프트가 지금까지의 대화 주제와 크게 다릅니다.",
      "• 권장: `/compact` (또는 `/clear`)로 컨텍스트를 압축한 뒤 진행해 주세요.",
      "• 그대로 진행: 같은 프롬프트를 한 번 더 전송하면 자동으로 통과됩니다. (또는 앞에 `!keep ` 붙이기)",
    ].join("\n");
  }

  return [
    `[Compaction Suggy · Topic Shift ${pct}% · ${tag}]`,
    "Your new prompt appears substantially unrelated to the current conversation context.",
    "• Recommended: run `/compact` (or `/clear`) first, then send your prompt.",
    "• Continue anyway: re-submit the same prompt once to bypass automatically (or prefix with `!keep `).",
  ].join("\n");
}

function formatModAdvisoryContext(
  outcome: EvaluationOutcome,
  lang: "ko" | "en",
): string {
  const pct = Math.round((outcome.decision?.probability ?? 0) * 100);
  const tag = outcome.decision
    ? `${outcome.decision.provider}/${outcome.decision.model}`
    : "decision-model";

  return lang === "ko"
    ? `[Compaction Suggy Advisory · ${pct}% · ${tag}] 사용자의 새 프롬프트가 이전 대화 주제와 크게 다른 것으로 감지되었습니다. 긴 작업을 시작하기 전에 먼저 \`/compact\`로 컨텍스트를 압축할지 한 줄로 정중히 제안해 주세요.`
    : `[Compaction Suggy Advisory · ${pct}% · ${tag}] The user's new prompt appears substantially unrelated to the previous conversation topic. Before diving into a long response, briefly suggest running \`/compact\` first.`;
}

function bypassKey(sessionId: string, prompt: string): string {
  return `${sessionId}::${normalizePromptForComparison(prompt)}`;
}

function consumeBypass(sessionId: string, prompt: string): boolean {
  const key = bypassKey(sessionId, prompt);
  const exp = bypassMap.get(key);
  if (!exp) return false;
  bypassMap.delete(key);
  return exp > Date.now();
}

function recordBypass(sessionId: string, prompt: string, ttlSeconds: number): void {
  const now = Date.now();
  for (const [k, exp] of bypassMap.entries()) {
    if (exp <= now) bypassMap.delete(k);
  }
  bypassMap.set(bypassKey(sessionId, prompt), now + Math.max(5, ttlSeconds) * 1000);
}

interface ModDecisionAction {
  kind: "allow" | "block" | "advisory";
  toastMessage?: string;
  response?: Record<string, unknown>;
}

async function evaluatePromptForMod(
  sessionId: string,
  prompt: string,
  rawMessages?: ModPromptEvent["messages"],
): Promise<ModDecisionAction> {
  const config = (runtimeOverrides.loadConfigFn ?? loadModConfigFromEnv)();

  if (config.mode === "block" && consumeBypass(sessionId, prompt)) {
    const list = sessionTurns.get(sessionId) ?? [];
    list.push({ role: "user", text: prompt.trim() });
    sessionTurns.set(sessionId, list.slice(-40));
    return { kind: "allow" };
  }

  const parsed =
    extractMessagesToTranscript(rawMessages, prompt) ??
    (() => {
      const history = sessionTurns.get(sessionId);
      return history && history.length > 0
        ? buildParsedTranscriptFromTurns(history, prompt)
        : undefined;
    })();

  const outcome = await evaluateTranscriptTopicShift(prompt, parsed, {
    config,
    provider: runtimeOverrides.provider,
    fetchImpl: runtimeOverrides.fetchImpl,
  });

  const lang = resolveLanguage(config.language, prompt);

  if (outcome.action === "block" && outcome.decision) {
    recordBypass(sessionId, prompt, config.bypassTtlSeconds);
    const pct = Math.round(outcome.decision.probability * 100);
    return {
      kind: "block",
      toastMessage:
        lang === "ko"
          ? `Compaction Suggy: 주제 전환 감지 (${pct}%) — /compact 권장`
          : `Compaction Suggy: Topic shift (${pct}%) — /compact recommended`,
      response: {
        decision: "block",
        reason: formatModBlockReason(outcome, lang),
      },
    };
  }

  const list = sessionTurns.get(sessionId) ?? [];
  list.push({ role: "user", text: prompt.trim() });
  sessionTurns.set(sessionId, list.slice(-40));

  if (outcome.action === "advisory" && outcome.decision) {
    const pct = Math.round(outcome.decision.probability * 100);
    return {
      kind: "advisory",
      toastMessage:
        lang === "ko"
          ? `Compaction Suggy: 주제 전환 알림 (${pct}%)`
          : `Compaction Suggy: Topic shift advisory (${pct}%)`,
      response: {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: formatModAdvisoryContext(outcome, lang),
        },
      },
    };
  }

  return { kind: "allow" };
}

/**
 * Top-level Claude Code Mod registration entry point.
 */
export function register(on: ModOnFn): void {
  on("prompt.submit", async ($: ModContext, e: ModPromptEvent, next: ModNextFn<ModPromptEvent, unknown>) => {
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
