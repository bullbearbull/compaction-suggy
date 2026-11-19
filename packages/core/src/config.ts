import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_LOCAL_MODEL,
  DEFAULT_LOCAL_URL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_URL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_URL,
  getDefaultConfig,
  mergeConfig,
} from "./defaults.js";
import type {
  HookMode,
  LanguagePreference,
  LocalApiFormat,
  PartialTopicShiftConfig,
  ProviderSelection,
  TopicShiftConfig,
} from "./types.js";

export {
  DEFAULT_LOCAL_MODEL,
  DEFAULT_LOCAL_URL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_URL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_URL,
  getDefaultConfig,
  mergeConfig,
};

export function getUserConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TSC_CONFIG_PATH) {
    return env.TSC_CONFIG_PATH;
  }
  const xdgConfigHome = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdgConfigHome, "topic-shift-compact", "config.json");
}

export function getDefaultBypassCachePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TSC_BYPASS_CACHE_PATH) {
    return env.TSC_BYPASS_CACHE_PATH;
  }
  const pluginDataDir =
    env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || env.CODEX_PLUGIN_DATA;
  if (pluginDataDir) {
    return path.join(pluginDataDir, "bypass-cache.json");
  }
  const xdgCacheHome = env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(xdgCacheHome, "topic-shift-compact", "bypass-cache.json");
}

function readJsonFileIfExists(filePath: string): PartialTopicShiftConfig | undefined {
  try {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as PartialTopicShiftConfig;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return undefined;
}

function parseNumber(
  value: string | undefined,
  min?: number,
  max?: number,
): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

function parseProviderSelection(value: string | undefined): ProviderSelection | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "openrouter" || v === "openai" || v === "local" || v === "auto") {
    return v;
  }
  return undefined;
}

function parseLocalApiFormat(value: string | undefined): LocalApiFormat | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "systemone" || v === "openai-decisions") {
    return v;
  }
  return undefined;
}

function parseHookMode(value: string | undefined): HookMode | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "block" || v === "advisory") {
    return v;
  }
  return undefined;
}

function parseLanguage(value: string | undefined): LanguagePreference | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "auto" || v === "en" || v === "ko") {
    return v;
  }
  return undefined;
}

export interface LoadConfigOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  overrides?: PartialTopicShiftConfig;
}

/**
 * Loads configuration with precedence (lowest to highest):
 * 1. Built-in defaults
 * 2. Plugin data config (${PLUGIN_DATA}/config.json or ${CLAUDE_PLUGIN_DATA}/config.json)
 * 3. User config (~/.config/topic-shift-compact/config.json or $TSC_CONFIG_PATH)
 * 4. Project config (<cwd>/.topic-shift-compact.json)
 * 5. Environment variables (TSC_*, OPENROUTER_API_KEY, OPENAI_API_KEY)
 * 6. Explicit programmatic overrides
 */
export function loadConfig(options: LoadConfigOptions = {}): TopicShiftConfig {
  const env = options.env ?? process.env;
  let config = getDefaultConfig();

  const pluginDataDir =
    env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || env.CODEX_PLUGIN_DATA;
  if (pluginDataDir) {
    config = mergeConfig(
      config,
      readJsonFileIfExists(path.join(pluginDataDir, "config.json")),
    );
  }

  config = mergeConfig(config, readJsonFileIfExists(getUserConfigPath(env)));

  if (options.cwd) {
    config = mergeConfig(
      config,
      readJsonFileIfExists(path.join(options.cwd, ".topic-shift-compact.json")),
    );
  }

  // Apply environment variables
  const disabled = parseBoolean(env.TSC_DISABLED);
  if (disabled === true) config.enabled = false;
  const enabled = parseBoolean(env.TSC_ENABLED);
  if (enabled !== undefined) config.enabled = enabled;

  const provider = parseProviderSelection(env.TSC_PROVIDER);
  if (provider) config.provider = provider;

  if (env.TSC_MODEL?.trim()) {
    config.model = env.TSC_MODEL.trim();
  }

  const threshold = parseNumber(env.TSC_THRESHOLD, 0, 1);
  if (threshold !== undefined) config.threshold = threshold;

  const timeoutMs = parseNumber(env.TSC_TIMEOUT_MS, 100, 60000);
  if (timeoutMs !== undefined) config.timeoutMs = Math.round(timeoutMs);

  const mode = parseHookMode(env.TSC_MODE);
  if (mode) config.mode = mode;

  const language = parseLanguage(env.TSC_LANGUAGE);
  if (language) config.language = language;

  const minTurns = parseNumber(env.TSC_MIN_TURNS, 1, 100);
  if (minTurns !== undefined) config.minTurns = Math.round(minTurns);

  const minContextChars = parseNumber(env.TSC_MIN_CONTEXT_CHARS, 0, 50000);
  if (minContextChars !== undefined) config.minContextChars = Math.round(minContextChars);

  const minPromptChars = parseNumber(env.TSC_MIN_PROMPT_CHARS, 1, 1000);
  if (minPromptChars !== undefined) config.minPromptChars = Math.round(minPromptChars);

  const maxWindowTurns = parseNumber(env.TSC_MAX_WINDOW_TURNS, 1, 100);
  if (maxWindowTurns !== undefined) config.maxWindowTurns = Math.round(maxWindowTurns);

  const maxContextChars = parseNumber(env.TSC_MAX_CONTEXT_CHARS, 200, 50000);
  if (maxContextChars !== undefined) config.maxContextChars = Math.round(maxContextChars);

  const bypassTtlSeconds = parseNumber(env.TSC_BYPASS_TTL_SECONDS, 5, 86400);
  if (bypassTtlSeconds !== undefined) config.bypassTtlSeconds = Math.round(bypassTtlSeconds);

  if (env.TSC_BYPASS_CACHE_PATH?.trim()) {
    config.bypassCachePath = env.TSC_BYPASS_CACHE_PATH.trim();
  }

  if (env.TSC_OPENROUTER_URL?.trim()) config.openrouter.baseUrl = env.TSC_OPENROUTER_URL.trim();
  if (env.TSC_OPENROUTER_MODEL?.trim()) config.openrouter.model = env.TSC_OPENROUTER_MODEL.trim();
  if (env.OPENROUTER_API_KEY?.trim()) {
    config.openrouter.apiKey = env.OPENROUTER_API_KEY.trim();
  } else if (env.TSC_OPENROUTER_API_KEY?.trim()) {
    config.openrouter.apiKey = env.TSC_OPENROUTER_API_KEY.trim();
  }

  if (env.TSC_OPENAI_URL?.trim()) config.openai.baseUrl = env.TSC_OPENAI_URL.trim();
  if (env.TSC_OPENAI_MODEL?.trim()) config.openai.model = env.TSC_OPENAI_MODEL.trim();
  if (env.OPENAI_API_KEY?.trim()) {
    config.openai.apiKey = env.OPENAI_API_KEY.trim();
  } else if (env.TSC_OPENAI_API_KEY?.trim()) {
    config.openai.apiKey = env.TSC_OPENAI_API_KEY.trim();
  }

  if (env.TSC_LOCAL_URL?.trim()) config.local.url = env.TSC_LOCAL_URL.trim();
  const localApiFormat = parseLocalApiFormat(env.TSC_LOCAL_API_FORMAT);
  if (localApiFormat) config.local.apiFormat = localApiFormat;
  if (env.TSC_LOCAL_MODEL?.trim()) config.local.model = env.TSC_LOCAL_MODEL.trim();
  if (env.TSC_LOCAL_API_KEY?.trim()) config.local.apiKey = env.TSC_LOCAL_API_KEY.trim();
  if (env.TSC_LOCAL_KEEP_ALIVE?.trim()) config.local.keepAlive = env.TSC_LOCAL_KEEP_ALIVE.trim();

  const debug = parseBoolean(env.TSC_DEBUG);
  if (debug !== undefined) config.debug = debug;

  config = mergeConfig(config, options.overrides);

  // Clamp threshold safely even if malformed in JSON file
  config.threshold = Math.min(1, Math.max(0, Number(config.threshold) || 0.75));
  if (!config.bypassCachePath) {
    config.bypassCachePath = getDefaultBypassCachePath(env);
  }

  return config;
}
