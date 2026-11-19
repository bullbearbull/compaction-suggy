import type { PartialTopicShiftConfig, TopicShiftConfig } from "./types.js";

export const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/alpha/decisions";
export const DEFAULT_OPENROUTER_MODEL = "typesafe/jev-latest";

export const DEFAULT_OPENAI_URL = "https://api.openai.com/v1/decisions";
export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

export const DEFAULT_LOCAL_URL = "http://localhost:11434/v1/systemone";
export const DEFAULT_LOCAL_MODEL = "tev1";

export function getDefaultConfig(): TopicShiftConfig {
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
    maxContextChars: 4000,
    bypassTtlSeconds: 300,
    openrouter: {
      baseUrl: DEFAULT_OPENROUTER_URL,
      model: DEFAULT_OPENROUTER_MODEL,
      referer: "https://github.com/bullbearbull/compaction-suggy",
      title: "Compaction Suggy",
    },
    openai: {
      baseUrl: DEFAULT_OPENAI_URL,
      model: DEFAULT_OPENAI_MODEL,
    },
    local: {
      url: DEFAULT_LOCAL_URL,
      apiFormat: "systemone",
      model: DEFAULT_LOCAL_MODEL,
      keepAlive: "10m",
    },
    debug: false,
  };
}

export function mergeConfig(
  base: TopicShiftConfig,
  override?: PartialTopicShiftConfig,
): TopicShiftConfig {
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...override,
    openrouter: {
      ...base.openrouter,
      ...(override.openrouter ?? {}),
    },
    openai: {
      ...base.openai,
      ...(override.openai ?? {}),
    },
    local: {
      ...base.local,
      ...(override.local ?? {}),
    },
  };
}
