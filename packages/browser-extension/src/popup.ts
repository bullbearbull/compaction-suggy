import type {
  HookMode,
  LanguagePreference,
  LocalApiFormat,
  ProviderName,
} from "@topic-shift-compact/core/browser";
import { detectSiteFromUrl } from "./adapters/index.js";
import { formatEvaluationSummary } from "./handoff.js";
import type {
  ExtensionConfig,
  GetTabStatusMessage,
  LastEvaluationRecord,
  PartialExtensionConfig,
  TabStatusResponse,
  TestProviderMessage,
  TestProviderResponse,
} from "./messages.js";
import {
  hasConfiguredProvider,
  loadExtensionConfig,
  loadLastEvaluation,
  saveExtensionConfig,
} from "./storage.js";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const enabledToggle = byId<HTMLInputElement>("enabledToggle");
const statusSubtitle = byId<HTMLParagraphElement>("statusSubtitle");
const tabDot = byId<HTMLSpanElement>("tabDot");
const tabStatusText = byId<HTMLSpanElement>("tabStatusText");
const siteChatGpt = byId<HTMLInputElement>("siteChatGpt");
const siteClaude = byId<HTMLInputElement>("siteClaude");

const openrouterKey = byId<HTMLInputElement>("openrouterKey");
const openrouterModel = byId<HTMLInputElement>("openrouterModel");
const openaiKey = byId<HTMLInputElement>("openaiKey");
const openaiModel = byId<HTMLInputElement>("openaiModel");
const localUrl = byId<HTMLInputElement>("localUrl");
const localFormat = byId<HTMLSelectElement>("localFormat");
const localModel = byId<HTMLInputElement>("localModel");
const localKey = byId<HTMLInputElement>("localKey");

const thresholdRange = byId<HTMLInputElement>("thresholdRange");
const thresholdValue = byId<HTMLSpanElement>("thresholdValue");
const minTurnsInput = byId<HTMLInputElement>("minTurns");
const modeSelect = byId<HTMLSelectElement>("modeSelect");
const languageSelect = byId<HTMLSelectElement>("languageSelect");
const autoSendOnNewChat = byId<HTMLInputElement>("autoSendOnNewChat");
const showDebugToast = byId<HTMLInputElement>("showDebugToast");

const timeoutMsInput = byId<HTMLInputElement>("timeoutMs");
const maxWindowTurnsInput = byId<HTMLInputElement>("maxWindowTurns");
const minPromptCharsInput = byId<HTMLInputElement>("minPromptChars");
const minContextCharsInput = byId<HTMLInputElement>("minContextChars");
const showCheckingPill = byId<HTMLInputElement>("showCheckingPill");

const testBtn = byId<HTMLButtonElement>("testBtn");
const saveBtn = byId<HTMLButtonElement>("saveBtn");
const feedbackBox = byId<HTMLDivElement>("feedbackBox");
const lastEvalTime = byId<HTMLSpanElement>("lastEvalTime");
const lastEvalBody = byId<HTMLDivElement>("lastEvalBody");

const providerTabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".seg-btn"),
);
const providerPanels = Array.from(
  document.querySelectorAll<HTMLDivElement>(".provider-panel"),
);

let selectedProvider: ProviderName = "openrouter";

function setActiveProviderTab(provider: ProviderName): void {
  selectedProvider = provider;
  for (const btn of providerTabs) {
    btn.classList.toggle("active", btn.dataset.provider === provider);
  }
  for (const panel of providerPanels) {
    panel.classList.toggle("hidden", panel.dataset.panel !== provider);
  }
}

function showFeedback(text: string, kind: "ok" | "err" | "warn"): void {
  feedbackBox.textContent = text;
  feedbackBox.className = `feedback ${kind}`;
}

function clearFeedback(): void {
  feedbackBox.className = "feedback hidden";
  feedbackBox.textContent = "";
}

function readFormPatch(): PartialExtensionConfig {
  return {
    enabled: enabledToggle.checked,
    sites: {
      chatgpt: siteChatGpt.checked,
      claude: siteClaude.checked,
    },
    provider: selectedProvider,
    threshold: Number(thresholdRange.value) || 0.75,
    minTurns: Number(minTurnsInput.value) || 2,
    mode: (modeSelect.value as HookMode) || "block",
    language: (languageSelect.value as LanguagePreference) || "auto",
    autoSendOnNewChat: autoSendOnNewChat.checked,
    showDebugToast: showDebugToast.checked,
    showCheckingPill: showCheckingPill.checked,
    timeoutMs: Number(timeoutMsInput.value) || 3000,
    maxWindowTurns: Number(maxWindowTurnsInput.value) || 10,
    minPromptChars: Number(minPromptCharsInput.value) || 8,
    minContextChars: Number(minContextCharsInput.value) || 80,
    openrouter: {
      apiKey: openrouterKey.value.trim() || undefined,
      model: openrouterModel.value.trim() || "typesafe/jev-latest",
    },
    openai: {
      apiKey: openaiKey.value.trim() || undefined,
      model: openaiModel.value.trim() || "gpt-6-luna",
    },
    local: {
      url: localUrl.value.trim() || "http://localhost:11434/v1/systemone",
      apiFormat: (localFormat.value as LocalApiFormat) || "systemone",
      model: localModel.value.trim() || "tev1",
      apiKey: localKey.value.trim() || undefined,
    },
  };
}

function applyConfigToForm(cfg: ExtensionConfig): void {
  enabledToggle.checked = cfg.enabled;
  siteChatGpt.checked = cfg.sites.chatgpt;
  siteClaude.checked = cfg.sites.claude;
  const prov: ProviderName =
    cfg.provider === "openai" || cfg.provider === "local" ? cfg.provider : "openrouter";
  setActiveProviderTab(prov);

  openrouterKey.value = cfg.openrouter.apiKey ?? "";
  openrouterModel.value = cfg.openrouter.model;
  openaiKey.value = cfg.openai.apiKey ?? "";
  openaiModel.value = cfg.openai.model;
  localUrl.value = cfg.local.url;
  localFormat.value = cfg.local.apiFormat;
  localModel.value = cfg.local.model;
  localKey.value = cfg.local.apiKey ?? "";

  thresholdRange.value = cfg.threshold.toFixed(2);
  thresholdValue.textContent = `${Math.round(cfg.threshold * 100)}%`;
  minTurnsInput.value = String(cfg.minTurns);
  modeSelect.value = cfg.mode;
  languageSelect.value = cfg.language;
  autoSendOnNewChat.checked = cfg.autoSendOnNewChat;
  showDebugToast.checked = cfg.showDebugToast;
  showCheckingPill.checked = cfg.showCheckingPill;

  timeoutMsInput.value = String(cfg.timeoutMs);
  maxWindowTurnsInput.value = String(cfg.maxWindowTurns);
  minPromptCharsInput.value = String(cfg.minPromptChars);
  minContextCharsInput.value = String(cfg.minContextChars);

  updateSubtitle(cfg);
}

function updateSubtitle(cfg: ExtensionConfig): void {
  if (!cfg.enabled) {
    statusSubtitle.textContent = "비활성화됨 (전송 가로채기 꺼짐)";
    return;
  }
  if (!hasConfiguredProvider(cfg)) {
    statusSubtitle.textContent = "API 키 또는 로컬 URL을 설정해 주세요";
    return;
  }
  const activeLabel =
    cfg.provider === "openai"
      ? `OpenAI · ${cfg.openai.model}`
      : cfg.provider === "local"
        ? `Local · ${cfg.local.model}`
        : `OpenRouter · ${cfg.openrouter.model}`;
  statusSubtitle.textContent = `활성 · ${activeLabel}`;
}

async function ensureHostPermissionForCustomUrl(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    // Chrome match patterns omit port numbers (e.g. http://localhost/* covers all ports).
    const originPattern = `${parsed.protocol}//${parsed.hostname}/*`;
    const alreadyGranted = await chrome.permissions.contains({
      origins: [originPattern],
    });
    if (alreadyGranted) return true;
    return await chrome.permissions.request({
      origins: [originPattern],
    });
  } catch {
    return false;
  }
}

async function refreshTabStatus(minTurns: number): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? "";
    const detectedSite = detectSiteFromUrl(url);

    if (!detectedSite || !tab?.id) {
      tabDot.className = "dot";
      tabStatusText.textContent =
        "ChatGPT(chatgpt.com) 또는 Claude.ai 탭을 열면 자동 감지됩니다.";
      return;
    }

    const fallbackName = detectedSite === "claude" ? "Claude.ai" : "ChatGPT";
    const res = await chrome.tabs.sendMessage<GetTabStatusMessage, TabStatusResponse>(
      tab.id,
      { type: "GET_TAB_STATUS" },
    );

    if (!res?.supported) {
      tabDot.className = "dot warn";
      tabStatusText.textContent = `${fallbackName} 탭을 새로고침(⌘R)하면 확장이 연결됩니다.`;
      return;
    }

    const siteName = res.siteName ?? fallbackName;
    if (res.siteEnabled === false) {
      tabDot.className = "dot";
      tabStatusText.textContent = `${siteName} 연결됨 · 이 사이트는 비활성화 상태입니다.`;
      return;
    }

    const turns = res.userTurnCount ?? 0;
    if (turns >= minTurns) {
      tabDot.className = "dot ok";
      tabStatusText.textContent = `${siteName} 연결됨 · 현재 ${turns}턴 (기준 ${minTurns}턴 충족 · 감지 대기 중)`;
    } else {
      tabDot.className = "dot warn";
      tabStatusText.textContent = `${siteName} 연결됨 · 현재 ${turns}턴 / 기준 ${minTurns}턴 미만`;
    }
  } catch {
    tabDot.className = "dot warn";
    tabStatusText.textContent = "채팅 페이지를 새로고침(⌘R)하면 확장이 연결됩니다.";
  }
}

function renderLastEvaluation(record: LastEvaluationRecord | undefined): void {
  if (!record) {
    lastEvalTime.textContent = "";
    lastEvalBody.textContent = "아직 ChatGPT / Claude.ai에서 판정한 기록이 없습니다.";
    return;
  }

  const time = new Date(record.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const siteTag = record.site === "claude" ? "Claude.ai" : "ChatGPT";
  lastEvalTime.textContent = `${siteTag} · ${time}`;

  const summary = formatEvaluationSummary(record.outcome, "ko");
  const actionLabels: Record<NonNullable<LastEvaluationRecord["userDecision"]>, string> = {
    new_chat: " → 새 대화로 이동함",
    compact_handoff: " → 요약 포함 새 대화로 이동함",
    send_here: " → 현재 대화에서 전송함",
    cancelled: " → 취소함",
  };
  const suffix = record.userDecision ? actionLabels[record.userDecision] : "";

  lastEvalBody.replaceChildren();
  const mainLine = document.createElement("div");
  mainLine.textContent = `${summary}${suffix}`;

  const promptLine = document.createElement("div");
  promptLine.className = "eval-prompt";
  promptLine.textContent = `“${record.promptPreview}”`;

  lastEvalBody.append(mainLine, promptLine);
}

// Event wiring
for (const btn of providerTabs) {
  btn.addEventListener("click", () => {
    const provider = btn.dataset.provider as ProviderName;
    if (provider) {
      setActiveProviderTab(provider);
      clearFeedback();
    }
  });
}

for (const eyeBtn of document.querySelectorAll<HTMLButtonElement>("[data-toggle-secret]")) {
  eyeBtn.addEventListener("click", () => {
    const targetId = eyeBtn.dataset.toggleSecret;
    if (!targetId) return;
    const input = byId<HTMLInputElement>(targetId);
    input.type = input.type === "password" ? "text" : "password";
  });
}

thresholdRange.addEventListener("input", () => {
  thresholdValue.textContent = `${Math.round(Number(thresholdRange.value) * 100)}%`;
});

enabledToggle.addEventListener("change", async () => {
  const next = await saveExtensionConfig({ enabled: enabledToggle.checked });
  updateSubtitle(next);
  showFeedback(
    next.enabled ? "주제 전환 감지를 켰습니다." : "주제 전환 감지를 껐습니다.",
    next.enabled ? "ok" : "warn",
  );
});

for (const siteCheckbox of [siteChatGpt, siteClaude]) {
  siteCheckbox.addEventListener("change", async () => {
    const saved = await saveExtensionConfig({
      sites: {
        chatgpt: siteChatGpt.checked,
        claude: siteClaude.checked,
      },
    });
    await refreshTabStatus(saved.minTurns);
  });
}

saveBtn.addEventListener("click", async () => {
  clearFeedback();
  const patch = readFormPatch();

  if (patch.provider === "local" && patch.local?.url) {
    const granted = await ensureHostPermissionForCustomUrl(patch.local.url);
    if (!granted) {
      showFeedback("로컬 URL 접근 권한이 거부되었습니다.", "warn");
      return;
    }
  }

  const saved = await saveExtensionConfig(patch);
  applyConfigToForm(saved);
  await refreshTabStatus(saved.minTurns);
  showFeedback("설정을 저장했습니다. ChatGPT / Claude.ai에 즉시 반영됩니다.", "ok");
});

testBtn.addEventListener("click", async () => {
  clearFeedback();
  const patch = readFormPatch();

  if (patch.provider === "local" && patch.local?.url) {
    const granted = await ensureHostPermissionForCustomUrl(patch.local.url);
    if (!granted) {
      showFeedback("로컬 엔드포인트 접근 권한을 허용해 주세요.", "warn");
      return;
    }
  }

  testBtn.disabled = true;
  testBtn.textContent = "테스트 중...";

  try {
    const res = await chrome.runtime.sendMessage<TestProviderMessage, TestProviderResponse>({
      type: "TEST_PROVIDER",
      configOverride: patch,
    });

    if (res?.ok && res.decision) {
      const pct = Math.round(res.decision.probability * 100);
      showFeedback(
        `연결 성공! 주제 전환 샘플 판정: ${pct}% · ${res.decision.latencyMs}ms (${res.decision.provider}/${res.decision.model})`,
        "ok",
      );
    } else {
      showFeedback(`테스트 실패: ${res?.error ?? "알 수 없는 오류"}`, "err");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showFeedback(`테스트 오류: ${msg}`, "err");
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = "API 테스트";
  }
});

async function init(): Promise<void> {
  const cfg = await loadExtensionConfig();
  applyConfigToForm(cfg);
  const lastEval = await loadLastEvaluation();
  renderLastEvaluation(lastEval);
  await refreshTabStatus(cfg.minTurns);
}

void init();
