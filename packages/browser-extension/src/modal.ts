import type { DecisionResult } from "@topic-shift-compact/core/browser";
import { detectPageDarkMode } from "./adapters/types.js";

export type ModalChoice = "new_chat" | "compact_handoff" | "send_here" | "cancelled";

export interface ModalTheme {
  isDark?: boolean;
  accentColor?: string;
  accentHoverColor?: string;
  accentSoftColor?: string;
}

export interface TopicShiftModalOptions {
  decision: DecisionResult;
  threshold: number;
  prompt: string;
  userTurnCount: number;
  lang: "ko" | "en";
  theme?: ModalTheme;
}

const HOST_ID = "tsc-chatgpt-ui-host";

function getOrCreateShadowRoot(): ShadowRoot {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "0";
    host.style.height = "0";
    document.documentElement.appendChild(host);
  }
  let shadow = host.shadowRoot;
  if (!shadow) {
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHADOW_STYLES;
    shadow.appendChild(style);
  }
  return shadow;
}

const SHADOW_STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  }

  .tsc-root {
    --bg: #ffffff;
    --bg-subtle: #f5f5f7;
    --bg-hover: #ececef;
    --text: #171717;
    --text-muted: #5f6368;
    --border: rgba(0, 0, 0, 0.11);
    --shadow: 0 20px 55px rgba(0, 0, 0, 0.18), 0 4px 14px rgba(0, 0, 0, 0.08);
    --accent: #10a37f;
    --accent-hover: #0d8c6d;
    --accent-soft: rgba(16, 163, 127, 0.12);
    --amber: #d97706;
    --amber-soft: rgba(217, 119, 6, 0.12);
    --overlay: rgba(0, 0, 0, 0.44);
  }

  .tsc-root.dark {
    --bg: #212121;
    --bg-subtle: #2c2c2e;
    --bg-hover: #363639;
    --text: #ececec;
    --text-muted: #a1a1aa;
    --border: rgba(255, 255, 255, 0.12);
    --shadow: 0 24px 64px rgba(0, 0, 0, 0.55), 0 4px 18px rgba(0, 0, 0, 0.35);
    --accent: #10a37f;
    --accent-hover: #14b88f;
    --accent-soft: rgba(16, 163, 127, 0.18);
    --amber: #f59e0b;
    --amber-soft: rgba(245, 158, 11, 0.16);
    --overlay: rgba(0, 0, 0, 0.62);
  }

  .tsc-pill {
    position: fixed;
    left: 50%;
    bottom: 108px;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-radius: 999px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: 12.5px;
    font-weight: 500;
    letter-spacing: -0.01em;
    pointer-events: none;
    animation: tsc-fade-up 140ms ease-out;
  }

  .tsc-spinner {
    width: 13px;
    height: 13px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: tsc-spin 0.7s linear infinite;
  }

  .tsc-toast {
    position: fixed;
    right: 20px;
    bottom: 24px;
    max-width: 360px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 11px 14px;
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
    font-size: 13px;
    line-height: 1.45;
    animation: tsc-fade-up 160ms ease-out;
    pointer-events: auto;
  }

  .tsc-toast-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 5px;
    flex-shrink: 0;
    background: var(--accent);
  }

  .tsc-toast.warn .tsc-toast-dot {
    background: var(--amber);
  }

  .tsc-backdrop {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    pointer-events: auto;
    animation: tsc-fade-in 130ms ease-out;
  }

  .tsc-dialog {
    width: 100%;
    max-width: 460px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: var(--shadow);
    padding: 22px;
    box-sizing: border-box;
    animation: tsc-pop 150ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tsc-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .tsc-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tsc-badge-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    flex-shrink: 0;
  }

  .tsc-title {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: var(--text);
  }

  .tsc-subtitle {
    margin: 3px 0 0 0;
    font-size: 12.5px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .tsc-close {
    border: none;
    background: transparent;
    color: var(--text-muted);
    width: 28px;
    height: 28px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tsc-close:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }

  .tsc-meter-card {
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 11px 13px;
    margin-bottom: 14px;
  }

  .tsc-meter-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    margin-bottom: 7px;
  }

  .tsc-prob-label {
    font-weight: 600;
    color: var(--text);
  }

  .tsc-meta {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .tsc-bar-track {
    position: relative;
    height: 6px;
    background: var(--border);
    border-radius: 999px;
    overflow: hidden;
  }

  .tsc-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
  }

  .tsc-prompt-box {
    background: var(--bg-subtle);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    padding: 9px 12px;
    margin-bottom: 16px;
    font-size: 12.5px;
    color: var(--text);
    line-height: 1.45;
    max-height: 74px;
    overflow: hidden;
    word-break: break-word;
  }

  .tsc-prompt-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 3px;
  }

  .tsc-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tsc-btn {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 11px;
    padding: 11px 14px;
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    transition: background 120ms ease, transform 80ms ease, border-color 120ms ease;
    font-family: inherit;
    box-sizing: border-box;
  }

  .tsc-btn:active {
    transform: scale(0.99);
  }

  .tsc-btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
  }

  .tsc-btn-primary:hover {
    background: var(--accent-hover);
  }

  .tsc-btn-secondary {
    background: var(--bg-subtle);
    color: var(--text);
  }

  .tsc-btn-secondary:hover {
    background: var(--bg-hover);
  }

  .tsc-btn-ghost {
    background: transparent;
    color: var(--text-muted);
  }

  .tsc-btn-ghost:hover {
    background: var(--bg-subtle);
    color: var(--text);
  }

  .tsc-btn-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tsc-btn-main {
    font-size: 13.5px;
    font-weight: 600;
  }

  .tsc-btn-desc {
    font-size: 11.5px;
    opacity: 0.85;
  }

  .tsc-kbd {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.16);
    flex-shrink: 0;
  }

  .tsc-btn-secondary .tsc-kbd,
  .tsc-btn-ghost .tsc-kbd {
    background: var(--border);
    color: var(--text-muted);
  }

  .tsc-footer {
    margin-top: 13px;
    font-size: 11.5px;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.4;
  }

  @keyframes tsc-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes tsc-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes tsc-fade-up {
    from { opacity: 0; transform: translate(-50%, 6px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  @keyframes tsc-pop {
    from { opacity: 0; transform: scale(0.96) translateY(6px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
`;

let activePill: HTMLElement | null = null;
let activeToastTimer: number | null = null;
let activeToast: HTMLElement | null = null;

function createThemedWrapper(theme?: ModalTheme): HTMLDivElement {
  const wrap = document.createElement("div");
  const isDark = theme?.isDark ?? detectPageDarkMode();
  wrap.className = `tsc-root${isDark ? " dark" : ""}`;
  if (theme?.accentColor) {
    wrap.style.setProperty("--accent", theme.accentColor);
  }
  if (theme?.accentHoverColor) {
    wrap.style.setProperty("--accent-hover", theme.accentHoverColor);
  }
  if (theme?.accentSoftColor) {
    wrap.style.setProperty("--accent-soft", theme.accentSoftColor);
  }
  return wrap;
}

export function showCheckingPill(lang: "ko" | "en", theme?: ModalTheme): void {
  hideCheckingPill();
  const shadow = getOrCreateShadowRoot();
  const wrap = createThemedWrapper(theme);
  const pill = document.createElement("div");
  pill.className = "tsc-pill";

  const spinner = document.createElement("span");
  spinner.className = "tsc-spinner";

  const label = document.createElement("span");
  label.textContent = lang === "ko" ? "주제 전환 확인 중..." : "Checking topic shift...";

  pill.append(spinner, label);
  wrap.appendChild(pill);
  shadow.appendChild(wrap);
  activePill = wrap;
}

export function hideCheckingPill(): void {
  if (activePill) {
    activePill.remove();
    activePill = null;
  }
}

export function showToast(
  message: string,
  variant: "info" | "warn" = "info",
  durationMs = 3600,
  theme?: ModalTheme,
): void {
  if (activeToastTimer !== null) {
    window.clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }

  const shadow = getOrCreateShadowRoot();
  const wrap = createThemedWrapper(theme);
  const toast = document.createElement("div");
  toast.className = `tsc-toast${variant === "warn" ? " warn" : ""}`;
  // Override animation transform for right-anchored toast
  toast.style.animation = "tsc-fade-in 160ms ease-out";

  const dot = document.createElement("span");
  dot.className = "tsc-toast-dot";

  const text = document.createElement("span");
  text.textContent = message;

  toast.append(dot, text);
  wrap.appendChild(toast);
  shadow.appendChild(wrap);
  activeToast = wrap;

  activeToastTimer = window.setTimeout(() => {
    wrap.remove();
    if (activeToast === wrap) activeToast = null;
    activeToastTimer = null;
  }, durationMs);
}

export function showTopicShiftModal(
  options: TopicShiftModalOptions,
): Promise<ModalChoice> {
  hideCheckingPill();

  return new Promise<ModalChoice>((resolve) => {
    const shadow = getOrCreateShadowRoot();
    const wrap = createThemedWrapper(options.theme);
    const { decision, threshold, prompt, userTurnCount, lang } = options;

    const pct = Math.round(decision.probability * 100);
    const thresholdPct = Math.round(threshold * 100);
    const promptPreview =
      prompt.trim().length > 140
        ? `${prompt.trim().slice(0, 139).trimEnd()}…`
        : prompt.trim();

    const backdrop = document.createElement("div");
    backdrop.className = "tsc-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "tsc-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    // Header
    const header = document.createElement("div");
    header.className = "tsc-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "tsc-title-group";

    const badgeIcon = document.createElement("div");
    badgeIcon.className = "tsc-badge-icon";
    badgeIcon.textContent = "⇄";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "tsc-title";
    title.textContent =
      lang === "ko" ? "새 주제로 전환된 것 같아요" : "Topic shift detected";

    const subtitle = document.createElement("p");
    subtitle.className = "tsc-subtitle";
    subtitle.textContent =
      lang === "ko"
        ? `현재 대화(${userTurnCount}턴)와 다른 주제입니다. 새 대화로 옮기면 컨텍스트가 깔끔해집니다.`
        : `This prompt diverges from the current thread (${userTurnCount} turns). Starting fresh keeps context clean.`;

    titleWrap.append(title, subtitle);
    titleGroup.append(badgeIcon, titleWrap);

    const closeBtn = document.createElement("button");
    closeBtn.className = "tsc-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", lang === "ko" ? "닫기" : "Close");
    closeBtn.textContent = "×";

    header.append(titleGroup, closeBtn);

    // Probability meter card
    const meterCard = document.createElement("div");
    meterCard.className = "tsc-meter-card";

    const meterTop = document.createElement("div");
    meterTop.className = "tsc-meter-top";

    const probLabel = document.createElement("span");
    probLabel.className = "tsc-prob-label";
    probLabel.textContent =
      lang === "ko"
        ? `주제 전환 확률 ${pct}% (기준 ${thresholdPct}%)`
        : `Shift probability ${pct}% (threshold ${thresholdPct}%)`;

    const meta = document.createElement("span");
    meta.className = "tsc-meta";
    meta.textContent = `${decision.provider}/${decision.model} · ${decision.latencyMs}ms`;

    meterTop.append(probLabel, meta);

    const track = document.createElement("div");
    track.className = "tsc-bar-track";
    const fill = document.createElement("div");
    fill.className = "tsc-bar-fill";
    fill.style.width = `${Math.max(4, Math.min(100, pct))}%`;
    track.appendChild(fill);

    meterCard.append(meterTop, track);

    // Prompt preview
    const promptBox = document.createElement("div");
    promptBox.className = "tsc-prompt-box";
    const promptLabel = document.createElement("span");
    promptLabel.className = "tsc-prompt-label";
    promptLabel.textContent = lang === "ko" ? "입력한 프롬프트" : "Your prompt";
    const promptText = document.createElement("div");
    promptText.textContent = promptPreview;
    promptBox.append(promptLabel, promptText);

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "tsc-actions";

    const makeBtn = (
      variant: "primary" | "secondary" | "ghost",
      mainText: string,
      descText: string,
      hotkey: string,
      choice: ModalChoice,
    ): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `tsc-btn tsc-btn-${variant}`;

      const textWrap = document.createElement("span");
      textWrap.className = "tsc-btn-text";

      const main = document.createElement("span");
      main.className = "tsc-btn-main";
      main.textContent = mainText;

      const desc = document.createElement("span");
      desc.className = "tsc-btn-desc";
      desc.textContent = descText;

      textWrap.append(main, desc);

      const kbd = document.createElement("span");
      kbd.className = "tsc-kbd";
      kbd.textContent = hotkey;

      btn.append(textWrap, kbd);
      btn.addEventListener("click", () => finish(choice));
      return btn;
    };

    const newChatBtn = makeBtn(
      "primary",
      lang === "ko" ? "새 대화에서 질문하기" : "Start fresh in New Chat",
      lang === "ko"
        ? "이전 컨텍스트 없이 새 스레드로 프롬프트를 옮깁니다"
        : "Move your prompt cleanly into a brand-new conversation",
      "1",
      "new_chat",
    );

    const compactBtn = makeBtn(
      "secondary",
      lang === "ko" ? "이전 대화 요약 포함해 새 대화로" : "Compact summary → New Chat",
      lang === "ko"
        ? "핵심 요약만 압축해서 새 대화에 함께 넘깁니다"
        : "Carry a compact digest of this thread into a new chat",
      "2",
      "compact_handoff",
    );

    const sendHereBtn = makeBtn(
      "ghost",
      lang === "ko" ? "현재 대화에서 그대로 전송" : "Send here anyway",
      lang === "ko"
        ? "주제 전환 알림을 무시하고 지금 대화에 바로 보냅니다"
        : "Skip compaction and send immediately in this thread",
      "3",
      "send_here",
    );

    actions.append(newChatBtn, compactBtn, sendHereBtn);

    const footer = document.createElement("div");
    footer.className = "tsc-footer";
    footer.textContent =
      lang === "ko"
        ? "ESC로 취소 (입력한 텍스트는 그대로 유지) · !keep 접두어로 1회 건너뛰기"
        : "Press ESC to cancel (keeps your draft) · Prefix with !keep to skip once";

    dialog.append(header, meterCard, promptBox, actions, footer);
    backdrop.appendChild(dialog);
    wrap.appendChild(backdrop);
    shadow.appendChild(wrap);

    let done = false;
    const finish = (choice: ModalChoice): void => {
      if (done) return;
      done = true;
      window.removeEventListener("keydown", onKeyDown, true);
      wrap.remove();
      resolve(choice);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish("cancelled");
        return;
      }
      if (event.key === "1") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish("new_chat");
        return;
      }
      if (event.key === "2") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish("compact_handoff");
        return;
      }
      if (event.key === "3") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish("send_here");
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    closeBtn.addEventListener("click", () => finish("cancelled"));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish("cancelled");
    });

    // Focus primary action button for keyboard accessibility
    window.setTimeout(() => newChatBtn.focus(), 20);
  });
}
