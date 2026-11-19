import {
  buildParsedTranscriptFromTurns,
  evaluateTranscriptTopicShift,
  resolveDecisionProvider,
} from "@topic-shift-compact/core/browser";
import type {
  EvaluateRequestMessage,
  EvaluateResponse,
  ExtensionConfig,
  ExtensionMessage,
  RecordSkipMessage,
  RecordUserActionMessage,
  TestProviderMessage,
  TestProviderResponse,
} from "./messages.js";
import {
  hasConfiguredProvider,
  loadExtensionConfig,
  loadLastEvaluation,
  mergeExtensionConfig,
  saveLastEvaluation,
  STORAGE_KEY_CONFIG,
} from "./storage.js";

const LOCALHOST_DNR_RULES: chrome.declarativeNetRequest.Rule[] = [
  {
    id: 1,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        {
          header: "Origin",
          operation: "remove",
        },
      ],
    },
    condition: {
      urlFilter: "http://localhost/*",
      resourceTypes: ["xmlhttprequest", "other"],
    },
  },
  {
    id: 2,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        {
          header: "Origin",
          operation: "remove",
        },
      ],
    },
    condition: {
      urlFilter: "http://127.0.0.1/*",
      resourceTypes: ["xmlhttprequest", "other"],
    },
  },
];

async function ensureLocalhostOriginStripRules(): Promise<void> {
  try {
    if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1, 2],
      addRules: LOCALHOST_DNR_RULES,
    });
  } catch {
    // Non-fatal: Ollama users can alternatively set OLLAMA_ORIGINS
  }
}

async function syncActionBadge(config?: ExtensionConfig): Promise<void> {
  try {
    const cfg = config ?? (await loadExtensionConfig());
    if (!cfg.enabled) {
      await chrome.action.setBadgeText({ text: "OFF" });
      await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
      return;
    }
    if (!hasConfiguredProvider(cfg)) {
      await chrome.action.setBadgeText({ text: "!" });
      await chrome.action.setBadgeBackgroundColor({ color: "#d97706" });
      return;
    }
    await chrome.action.setBadgeText({ text: "" });
  } catch {
    // Ignore badge API errors
  }
}

function truncatePreview(text: string, maxLen = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

async function handleEvaluate(msg: EvaluateRequestMessage): Promise<EvaluateResponse> {
  const config = await loadExtensionConfig();
  if (config.provider === "local" || config.provider === "auto") {
    await ensureLocalhostOriginStripRules();
  }

  const parsed = buildParsedTranscriptFromTurns(msg.turns, msg.prompt);
  const outcome = await evaluateTranscriptTopicShift(msg.prompt, parsed, { config });

  await saveLastEvaluation({
    timestamp: Date.now(),
    site: msg.site,
    conversationId: msg.conversationId,
    promptPreview: truncatePreview(msg.prompt),
    outcome,
  });

  return { ok: true, outcome };
}

async function handleTestProvider(msg: TestProviderMessage): Promise<TestProviderResponse> {
  const current = await loadExtensionConfig();
  const config = msg.configOverride
    ? mergeExtensionConfig(current, msg.configOverride)
    : current;

  if (config.provider === "local" || config.provider === "auto") {
    await ensureLocalhostOriginStripRules();
  }

  const provider = resolveDecisionProvider(config);
  if (!provider) {
    return {
      ok: false,
      error:
        config.provider === "openrouter"
          ? "OpenRouter API 키가 비어 있습니다."
          : config.provider === "openai"
            ? "OpenAI API 키가 비어 있습니다."
            : "Local Decision API URL이 비어 있습니다.",
    };
  }

  try {
    const decision = await provider.decide(
      {
        previousContext: [
          "User: FastAPI 서버에서 JWT refresh token 검증 시 401 에러가 간헐적으로 발생해.",
          "Assistant: 토큰 만료 시간과 clock skew(leeway) 설정, 그리고 쿠키 SameSite 옵션을 확인해 보세요.",
          "User: leeway를 30초로 늘리고 pydantic 스키마도 같이 수정했어.",
          "Assistant: 좋습니다. 이제 refresh rotation 시 기존 토큰을 블랙리스트 처리하는 테스트를 추가하면 됩니다.",
        ].join("\n"),
        newPrompt: "다음 달 도쿄 3박 4일 여행 일정이랑 시부야 근처 맛집 추천해줘.",
        recentUserTopics: [
          "FastAPI 서버에서 JWT refresh token 검증 시 401 에러가 간헐적으로 발생해.",
          "leeway를 30초로 늘리고 pydantic 스키마도 같이 수정했어.",
        ],
      },
      Math.max(config.timeoutMs, 5000),
    );
    return { ok: true, decision };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function handleRecordUserAction(msg: RecordUserActionMessage): Promise<{ ok: true }> {
  const last = await loadLastEvaluation();
  if (last) {
    await saveLastEvaluation({
      ...last,
      userDecision: msg.decision,
    });
  }
  return { ok: true };
}

async function handleRecordSkip(msg: RecordSkipMessage): Promise<{ ok: true }> {
  await saveLastEvaluation({
    timestamp: Date.now(),
    site: msg.site,
    conversationId: msg.conversationId,
    promptPreview: truncatePreview(msg.promptPreview),
    outcome: msg.outcome,
  });
  return { ok: true };
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureLocalhostOriginStripRules();
  void syncActionBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureLocalhostOriginStripRules();
  void syncActionBadge();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY_CONFIG]) {
    void syncActionBadge();
  }
});

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  const msg = rawMessage as ExtensionMessage | undefined;
  if (!msg || typeof msg !== "object" || !("type" in msg)) {
    return false;
  }

  if (msg.type === "EVALUATE_TOPIC_SHIFT") {
    void handleEvaluate(msg)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        } satisfies EvaluateResponse),
      );
    return true;
  }

  if (msg.type === "TEST_PROVIDER") {
    void handleTestProvider(msg)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        } satisfies TestProviderResponse),
      );
    return true;
  }

  if (msg.type === "RECORD_USER_ACTION") {
    void handleRecordUserAction(msg).then(sendResponse);
    return true;
  }

  if (msg.type === "RECORD_SKIP") {
    void handleRecordSkip(msg).then(sendResponse);
    return true;
  }

  return false;
});
