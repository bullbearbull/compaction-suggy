import {
  buildParsedTranscriptFromTurns,
  buildSlidingWindowContext,
  checkPromptFastPath,
  type EvaluationOutcome,
  type TranscriptTurn,
} from "@topic-shift-compact/core/browser";
import { getActiveSiteAdapter, type SiteAdapter } from "./adapters/index.js";
import {
  buildCompactHandoffPrompt,
  formatEvaluationSummary,
  InMemoryBypassCache,
  resolveUiLanguage,
} from "./handoff.js";
import type {
  EvaluateRequestMessage,
  EvaluateResponse,
  ExtensionConfig,
  ExtensionMessage,
  PendingHandoff,
  RecordSkipMessage,
  RecordUserActionMessage,
  TabStatusResponse,
} from "./messages.js";
import {
  hideCheckingPill,
  showCheckingPill,
  showToast,
  showTopicShiftModal,
  type ModalTheme,
} from "./modal.js";
import {
  clearPendingHandoff,
  getDefaultExtensionConfig,
  hasConfiguredProvider,
  loadExtensionConfig,
  loadPendingHandoff,
  savePendingHandoff,
  STORAGE_KEY_CONFIG,
} from "./storage.js";

const siteAdapter: SiteAdapter | undefined = getActiveSiteAdapter();

let cachedConfig: ExtensionConfig = getDefaultExtensionConfig();
let isEvaluating = false;
let bypassNextSubmit = false;
let bypassResetTimer: number | null = null;
const bypassCache = new InMemoryBypassCache(300_000);

function getModalTheme(adapter: SiteAdapter): ModalTheme {
  return {
    isDark: adapter.detectDarkMode(),
    accentColor: adapter.accentColor,
    accentHoverColor: adapter.accentHoverColor,
    accentSoftColor: adapter.accentSoftColor,
  };
}

function isSiteEnabled(adapter: SiteAdapter, config: ExtensionConfig): boolean {
  return config.enabled && config.sites[adapter.id];
}

function armOneShotSubmitBypass(): void {
  bypassNextSubmit = true;
  if (bypassResetTimer !== null) {
    window.clearTimeout(bypassResetTimer);
  }
  bypassResetTimer = window.setTimeout(() => {
    bypassNextSubmit = false;
    bypassResetTimer = null;
  }, 1000);
}

function submitComposerNow(adapter: SiteAdapter, editor?: HTMLElement | null): void {
  armOneShotSubmitBypass();

  const sendBtn = adapter.findSendButton();
  if (sendBtn && !sendBtn.disabled) {
    sendBtn.click();
    return;
  }

  const target = editor ?? adapter.findComposerElement();
  if (!target) return;
  target.focus();
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function reportSkipAsync(
  adapter: SiteAdapter,
  conversationId: string,
  prompt: string,
  outcome: EvaluationOutcome,
): void {
  try {
    const msg: RecordSkipMessage = {
      type: "RECORD_SKIP",
      site: adapter.id,
      conversationId,
      promptPreview: prompt,
      outcome,
    };
    void chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    // Ignore extension reload errors
  }
}

function reportUserActionAsync(
  decision: RecordUserActionMessage["decision"],
): void {
  try {
    const msg: RecordUserActionMessage = {
      type: "RECORD_USER_ACTION",
      decision,
    };
    void chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    // Ignore
  }
}

async function deliverPendingHandoffWhenReady(
  adapter: SiteAdapter,
  handoff: PendingHandoff,
): Promise<void> {
  if (handoff.site !== adapter.id) return;

  const deadline = Date.now() + 9000;
  const theme = getModalTheme(adapter);

  while (Date.now() < deadline) {
    const currentConv = adapter.extractConversationId(window.location.pathname);
    const turns = adapter.extractChatTurns();
    const composer = adapter.findComposerElement();

    const movedToFreshChat =
      turns.length === 0 &&
      (handoff.sourceConversationId === "new-chat" ||
        currentConv !== handoff.sourceConversationId);

    if (movedToFreshChat && composer) {
      await clearPendingHandoff();
      adapter.setComposerText(composer, handoff.prompt);

      const lang = resolveUiLanguage(cachedConfig.language, handoff.prompt);
      if (handoff.autoSend) {
        window.setTimeout(() => {
          submitComposerNow(adapter, adapter.findComposerElement() ?? composer);
        }, 320);
      } else {
        const msg =
          handoff.mode === "compact"
            ? lang === "ko"
              ? "이전 대화 요약과 함께 새 대화로 옮겼습니다. Enter로 전송하세요."
              : "Moved compacted context + prompt to New Chat. Press Enter to send."
            : lang === "ko"
              ? "새 대화에 프롬프트를 옮겼습니다. Enter를 눌러 전송하세요."
              : "Moved your prompt to New Chat. Press Enter to send.";
        showToast(msg, "info", 4200, theme);
      }
      return;
    }

    await new Promise((r) => window.setTimeout(r, 150));
  }
}

async function checkPendingHandoffOnMount(adapter: SiteAdapter): Promise<void> {
  const pending = await loadPendingHandoff();
  if (!pending || pending.site !== adapter.id) return;
  void deliverPendingHandoffWhenReady(adapter, pending);
}

async function evaluateAndHandle(
  adapter: SiteAdapter,
  prompt: string,
  turns: TranscriptTurn[],
  conversationId: string,
  editor: HTMLElement,
): Promise<void> {
  isEvaluating = true;
  const lang = resolveUiLanguage(cachedConfig.language, prompt);
  const theme = getModalTheme(adapter);

  if (cachedConfig.showCheckingPill) {
    showCheckingPill(lang, theme);
  }

  try {
    const req: EvaluateRequestMessage = {
      type: "EVALUATE_TOPIC_SHIFT",
      site: adapter.id,
      conversationId,
      prompt,
      turns,
    };

    const res = await chrome.runtime.sendMessage<EvaluateRequestMessage, EvaluateResponse>(
      req,
    );
    hideCheckingPill();

    if (!res?.ok || !res.outcome) {
      if (cachedConfig.showDebugToast && res?.error) {
        showToast(`Compaction Suggy fail-open: ${res.error}`, "warn", 4000, theme);
      }
      submitComposerNow(adapter, editor);
      return;
    }

    const { outcome } = res;

    if (outcome.action === "allow") {
      if (cachedConfig.showDebugToast) {
        const variant =
          outcome.skipReason === "provider_error_fail_open" ? "warn" : "info";
        showToast(formatEvaluationSummary(outcome, lang), variant, 3400, theme);
      }
      submitComposerNow(adapter, editor);
      return;
    }

    if (outcome.action === "advisory") {
      submitComposerNow(adapter, editor);
      if (outcome.decision) {
        const pct = Math.round(outcome.decision.probability * 100);
        const msg =
          lang === "ko"
            ? `주제 전환 감지 (${pct}%) — 다음 질문은 새 대화에서 시작해 보세요.`
            : `Topic shift detected (${pct}%) — consider starting a New Chat next.`;
        showToast(msg, "warn", 4500, theme);
      }
      return;
    }

    if (!outcome.decision) {
      submitComposerNow(adapter, editor);
      return;
    }

    const choice = await showTopicShiftModal({
      decision: outcome.decision,
      threshold: outcome.threshold,
      prompt,
      userTurnCount:
        outcome.userTurnCount ?? turns.filter((t) => t.role === "user").length,
      lang,
      theme,
    });

    reportUserActionAsync(choice);

    if (choice === "cancelled") {
      editor.focus();
      return;
    }

    if (choice === "send_here") {
      bypassCache.record(`${adapter.id}:${conversationId}`, prompt);
      submitComposerNow(adapter, editor);
      return;
    }

    const targetPrompt =
      choice === "compact_handoff"
        ? buildCompactHandoffPrompt(turns, prompt, lang)
        : prompt;

    const handoff: PendingHandoff = {
      site: adapter.id,
      prompt: targetPrompt,
      autoSend: cachedConfig.autoSendOnNewChat,
      mode: choice === "compact_handoff" ? "compact" : "clean",
      sourceConversationId: conversationId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };

    await savePendingHandoff(handoff);
    adapter.navigateToNewChat();
    void deliverPendingHandoffWhenReady(adapter, handoff);
  } catch (err) {
    hideCheckingPill();
    if (cachedConfig.showDebugToast) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Compaction Suggy fail-open: ${message}`, "warn", 4000, theme);
    }
    submitComposerNow(adapter, editor);
  } finally {
    isEvaluating = false;
  }
}

function handleSubmissionAttempt(adapter: SiteAdapter, event: Event): void {
  if (bypassNextSubmit) {
    bypassNextSubmit = false;
    return;
  }

  if (isEvaluating) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  if (!isSiteEnabled(adapter, cachedConfig)) {
    return;
  }

  const editor = adapter.findComposerElement();
  if (!editor) return;

  const prompt = adapter.getComposerText(editor);
  if (!prompt) return;

  if (adapter.isStreamingResponse() && !adapter.findSendButton()) {
    return;
  }

  const conversationId = adapter.extractConversationId(window.location.pathname);

  // 1. Synchronous zero-latency fast-path checks
  const fastPathSkip = checkPromptFastPath(prompt, cachedConfig);
  if (fastPathSkip) {
    if (fastPathSkip !== "disabled" && fastPathSkip !== "empty_prompt") {
      reportSkipAsync(adapter, conversationId, prompt, {
        action: "allow",
        skipReason: fastPathSkip,
        threshold: cachedConfig.threshold,
      });
    }
    return;
  }

  if (!hasConfiguredProvider(cachedConfig)) {
    reportSkipAsync(adapter, conversationId, prompt, {
      action: "allow",
      skipReason: "no_provider_configured",
      threshold: cachedConfig.threshold,
    });
    return;
  }

  if (bypassCache.consume(`${adapter.id}:${conversationId}`, prompt)) {
    reportSkipAsync(adapter, conversationId, prompt, {
      action: "allow",
      skipReason: "bypass_cache_hit",
      threshold: cachedConfig.threshold,
    });
    return;
  }

  const turns = adapter.extractChatTurns();
  const parsed = buildParsedTranscriptFromTurns(turns, prompt);

  if (parsed.userTurnCount < cachedConfig.minTurns) {
    reportSkipAsync(adapter, conversationId, prompt, {
      action: "allow",
      skipReason: "insufficient_turns",
      threshold: cachedConfig.threshold,
      userTurnCount: parsed.userTurnCount,
    });
    return;
  }

  const windowCtx = buildSlidingWindowContext(
    parsed,
    cachedConfig.maxWindowTurns,
    cachedConfig.maxContextChars,
  );

  if (windowCtx.contextChars < cachedConfig.minContextChars) {
    reportSkipAsync(adapter, conversationId, prompt, {
      action: "allow",
      skipReason: "insufficient_context",
      threshold: cachedConfig.threshold,
      userTurnCount: parsed.userTurnCount,
      contextChars: windowCtx.contextChars,
    });
    return;
  }

  // 2. Intercept cleanly and evaluate asynchronously via background service worker
  event.preventDefault();
  event.stopImmediatePropagation();
  void evaluateAndHandle(adapter, prompt, turns, conversationId, editor);
}

function attachListeners(adapter: SiteAdapter): void {
  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      // Critical for Korean/Japanese/Chinese IME: ignore Enter used to finalize composition
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key !== "Enter") return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!adapter.isComposerTarget(event.target)) return;
      handleSubmissionAttempt(adapter, event);
    },
    true,
  );

  document.addEventListener(
    "click",
    (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!adapter.isSendButtonClick(event.target)) return;
      handleSubmissionAttempt(adapter, event);
    },
    true,
  );

  chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    const msg = rawMessage as ExtensionMessage | undefined;
    if (msg?.type === "GET_TAB_STATUS") {
      const turns = adapter.extractChatTurns();
      const userTurnCount = turns.filter((t) => t.role === "user").length;
      const response: TabStatusResponse = {
        supported: true,
        site: adapter.id,
        siteName: adapter.displayName,
        siteEnabled: isSiteEnabled(adapter, cachedConfig),
        conversationId: adapter.extractConversationId(window.location.pathname),
        userTurnCount,
        totalTurns: turns.length,
        composerFound: Boolean(adapter.findComposerElement()),
      };
      sendResponse(response);
      return true;
    }
    return false;
  });
}

async function init(): Promise<void> {
  if (!siteAdapter) return;

  cachedConfig = await loadExtensionConfig();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEY_CONFIG]) {
      void loadExtensionConfig().then((next) => {
        cachedConfig = next;
      });
    }
  });

  attachListeners(siteAdapter);
  void checkPendingHandoffOnMount(siteAdapter);
}

void init();
