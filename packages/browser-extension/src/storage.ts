import {
  getDefaultConfig,
  mergeConfig,
} from "@topic-shift-compact/core/browser";
import type {
  ExtensionConfig,
  LastEvaluationRecord,
  PartialExtensionConfig,
  PendingHandoff,
} from "./messages.js";

export const STORAGE_KEY_CONFIG = "tsc_config_v1";
export const STORAGE_KEY_LAST_EVAL = "tsc_last_eval_v1";
export const STORAGE_KEY_PENDING_HANDOFF = "tsc_pending_handoff_v1";

export function getDefaultExtensionConfig(): ExtensionConfig {
  const base = getDefaultConfig();
  return {
    ...base,
    sites: {
      chatgpt: true,
      claude: true,
    },
    // On Web chats, starting detection from 2 prior user turns feels responsive & easy to test.
    minTurns: 2,
    minContextChars: 80,
    minPromptChars: 8,
    timeoutMs: 3000,
    provider: "openrouter",
    autoSendOnNewChat: false,
    showCheckingPill: true,
    showDebugToast: false,
  };
}

export function mergeExtensionConfig(
  base: ExtensionConfig,
  override?: PartialExtensionConfig,
): ExtensionConfig {
  if (!override) return base;
  const mergedBase = mergeConfig(base, override);
  return {
    ...mergedBase,
    sites: {
      chatgpt:
        override.sites?.chatgpt !== undefined
          ? Boolean(override.sites.chatgpt)
          : base.sites.chatgpt,
      claude:
        override.sites?.claude !== undefined
          ? Boolean(override.sites.claude)
          : base.sites.claude,
    },
    threshold: Math.min(1, Math.max(0.05, Number(mergedBase.threshold) || 0.75)),
    timeoutMs: Math.min(30000, Math.max(300, Math.round(Number(mergedBase.timeoutMs) || 3000))),
    minTurns: Math.min(50, Math.max(1, Math.round(Number(mergedBase.minTurns) || 2))),
    minContextChars: Math.max(0, Math.round(Number(mergedBase.minContextChars) || 80)),
    minPromptChars: Math.max(1, Math.round(Number(mergedBase.minPromptChars) || 8)),
    maxWindowTurns: Math.min(50, Math.max(2, Math.round(Number(mergedBase.maxWindowTurns) || 10))),
    maxContextChars: Math.min(20000, Math.max(300, Math.round(Number(mergedBase.maxContextChars) || 4000))),
    autoSendOnNewChat:
      override.autoSendOnNewChat !== undefined
        ? Boolean(override.autoSendOnNewChat)
        : base.autoSendOnNewChat,
    showCheckingPill:
      override.showCheckingPill !== undefined
        ? Boolean(override.showCheckingPill)
        : base.showCheckingPill,
    showDebugToast:
      override.showDebugToast !== undefined
        ? Boolean(override.showDebugToast)
        : base.showDebugToast,
  };
}

export function hasConfiguredProvider(config: ExtensionConfig): boolean {
  switch (config.provider) {
    case "openrouter":
      return Boolean(config.openrouter.apiKey?.trim());
    case "openai":
      return Boolean(config.openai.apiKey?.trim());
    case "local":
      return Boolean(config.local.url?.trim());
    case "auto":
      return Boolean(
        config.openrouter.apiKey?.trim() ||
          config.openai.apiKey?.trim() ||
          config.local.url?.trim(),
      );
  }
}

export async function loadExtensionConfig(): Promise<ExtensionConfig> {
  const defaults = getDefaultExtensionConfig();
  try {
    const res = await chrome.storage.local.get(STORAGE_KEY_CONFIG);
    const saved = res[STORAGE_KEY_CONFIG] as PartialExtensionConfig | undefined;
    return mergeExtensionConfig(defaults, saved);
  } catch {
    return defaults;
  }
}

export async function saveExtensionConfig(
  patch: PartialExtensionConfig,
): Promise<ExtensionConfig> {
  const current = await loadExtensionConfig();
  const next = mergeExtensionConfig(current, patch);
  await chrome.storage.local.set({ [STORAGE_KEY_CONFIG]: next });
  return next;
}

export async function loadLastEvaluation(): Promise<LastEvaluationRecord | undefined> {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEY_LAST_EVAL);
    return res[STORAGE_KEY_LAST_EVAL] as LastEvaluationRecord | undefined;
  } catch {
    return undefined;
  }
}

export async function saveLastEvaluation(record: LastEvaluationRecord): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_LAST_EVAL]: record });
  } catch {
    // Ignore storage quota / transient errors
  }
}

export async function savePendingHandoff(handoff: PendingHandoff): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_PENDING_HANDOFF]: handoff });
}

export async function loadPendingHandoff(): Promise<PendingHandoff | undefined> {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEY_PENDING_HANDOFF);
    const handoff = res[STORAGE_KEY_PENDING_HANDOFF] as PendingHandoff | undefined;
    if (!handoff) return undefined;
    if (Date.now() > handoff.expiresAt) {
      await clearPendingHandoff();
      return undefined;
    }
    return handoff;
  } catch {
    return undefined;
  }
}

export async function clearPendingHandoff(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY_PENDING_HANDOFF);
  } catch {
    // Ignore
  }
}
