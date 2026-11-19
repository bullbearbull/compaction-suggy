export type ProviderName = "openrouter" | "openai" | "local";
export type ProviderSelection = ProviderName | "auto";
export type LocalApiFormat = "systemone" | "openai-decisions";
export type HookMode = "block" | "advisory";
export type LanguagePreference = "auto" | "en" | "ko";

export interface TopicShiftConfig {
  /** Whether the hook is enabled. Default: true */
  enabled: boolean;
  /** Decision provider selection. Default: "auto" */
  provider: ProviderSelection;
  /** Optional provider-specific or override model identifier. */
  model?: string;
  /** Probability threshold [0, 1] above which a topic shift triggers compaction suggestion. Default: 0.75 */
  threshold: number;
  /** Decision API request timeout in milliseconds. Default: 2500 */
  timeoutMs: number;
  /** Behavior on topic shift: "block" pauses submission with compact prompt; "advisory" injects context only. Default: "block" */
  mode: HookMode;
  /** Message language preference. Default: "auto" */
  language: LanguagePreference;
  /** Minimum user turns since session start or last compaction before invoking Decision API. Default: 3 */
  minTurns: number;
  /** Minimum characters of prior conversation context before invoking Decision API. Default: 150 */
  minContextChars: number;
  /** Minimum new prompt characters before invoking Decision API. Default: 10 */
  minPromptChars: number;
  /** Maximum recent turns included in sliding window sent to Decision API. Default: 10 */
  maxWindowTurns: number;
  /** Maximum total characters of conversation context sent to Decision API. Default: 4000 */
  maxContextChars: number;
  /** TTL in seconds for one-shot bypass cache when user re-submits a blocked prompt. Default: 300 */
  bypassTtlSeconds: number;
  /** Optional explicit bypass cache file path. */
  bypassCachePath?: string;
  /** OpenRouter API settings */
  openrouter: {
    baseUrl: string;
    apiKey?: string;
    model: string;
    referer?: string;
    title?: string;
  };
  /** OpenAI Decisions API settings */
  openai: {
    baseUrl: string;
    apiKey?: string;
    model: string;
  };
  /** Local Decision Model settings (Ollama /v1/systemone or vLLM/LiteLLM /v1/decisions) */
  local: {
    url: string;
    apiFormat: LocalApiFormat;
    model: string;
    apiKey?: string;
    keepAlive?: string;
  };
  /** Emit debug diagnostics to stderr when true. Default: false */
  debug: boolean;
}

export type PartialTopicShiftConfig = {
  [K in keyof TopicShiftConfig]?: K extends "openrouter" | "openai" | "local"
    ? Partial<TopicShiftConfig[K]>
    : TopicShiftConfig[K];
};

export interface TranscriptTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ParsedTranscript {
  /** Turns after the latest compaction boundary (or entire session if none). */
  turns: TranscriptTurn[];
  /** Optional summary text extracted from the latest compaction record, if present. */
  compactionSummary?: string;
  /** Number of compaction boundaries observed in the transcript. */
  compactionCount: number;
  /** Number of user turns after the latest compaction boundary. */
  userTurnCount: number;
}

export interface DecisionInput {
  previousContext: string;
  newPrompt: string;
  compactionSummary?: string;
  recentUserTopics: string[];
}

export interface DecisionResult {
  provider: ProviderName;
  model: string;
  /** Calibrated probability [0.0, 1.0] that the new prompt shifts to a substantially unrelated topic. */
  probability: number;
  latencyMs: number;
  raw?: unknown;
}

export interface DecisionProvider {
  readonly name: ProviderName;
  readonly model: string;
  decide(input: DecisionInput, timeoutMs: number): Promise<DecisionResult>;
}

/** Normalized UserPromptSubmit hook input payload across Claude Code and OpenAI Codex. */
export interface UserPromptSubmitPayload {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  prompt?: string;
  permission_mode?: string;
  model?: string;
}

export type EvaluationAction = "allow" | "block" | "advisory";

export type SkipReason =
  | "disabled"
  | "empty_prompt"
  | "slash_command"
  | "override_prefix"
  | "short_prompt"
  | "short_acknowledgement"
  | "no_transcript"
  | "insufficient_turns"
  | "insufficient_context"
  | "bypass_cache_hit"
  | "no_provider_configured"
  | "provider_error_fail_open";

export interface EvaluationOutcome {
  action: EvaluationAction;
  skipReason?: SkipReason;
  decision?: DecisionResult;
  threshold: number;
  userTurnCount?: number;
  contextChars?: number;
  errorMessage?: string;
}
