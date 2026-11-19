import type { TranscriptTurn } from "@topic-shift-compact/core/browser";
import {
  detectPageDarkMode,
  extractCleanMessageText,
  getProseMirrorText,
  isElementVisible,
  setProseMirrorText,
  type SiteAdapter,
} from "./types.js";

function findClaudeComposer(root: ParentNode = document): HTMLElement | null {
  const selectors = [
    '[data-testid="chat-input"][contenteditable="true"]',
    'div.ProseMirror[contenteditable="true"][aria-label]',
    'fieldset div.ProseMirror[contenteditable="true"]',
    'div.ProseMirror[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ];

  for (const selector of selectors) {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      isElementVisible,
    );
    if (candidates.length > 0) {
      // If multiple editors exist (e.g. inline edit), prefer the main bottom composer
      return candidates[candidates.length - 1] ?? null;
    }
  }
  return null;
}

function findClaudeSendButton(root: ParentNode = document): HTMLButtonElement | null {
  const selectors = [
    'button[aria-label="Send message"]',
    'button[aria-label="메시지 보내기"]',
    'button[data-testid="send-button"]',
    'fieldset button[aria-label*="Send" i]',
    'button[aria-label*="Send message" i]',
  ];

  for (const selector of selectors) {
    const btn = root.querySelector<HTMLButtonElement>(selector);
    if (!btn || !isElementVisible(btn)) continue;
    const label = (btn.getAttribute("aria-label") ?? "").toLowerCase();
    if (label.includes("stop") || label.includes("중지")) continue;
    return btn;
  }
  return null;
}

/**
 * Filters out nodes that are nested inside another matched node so wrapper +
 * inner body elements never produce duplicate conversation turns.
 */
function deduplicateNestedElements(elements: HTMLElement[]): HTMLElement[] {
  const set = new Set<Element>(elements);
  return elements.filter((el) => {
    let parent = el.parentElement;
    while (parent) {
      if (set.has(parent)) return false;
      parent = parent.parentElement;
    }
    return true;
  });
}

export const claudeAdapter: SiteAdapter = {
  id: "claude",
  displayName: "Claude.ai",
  accentColor: "#d97757",
  accentHoverColor: "#c46546",
  accentSoftColor: "rgba(217, 119, 87, 0.15)",

  extractConversationId(pathname: string): string {
    const match = pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? "new-chat";
  },

  findComposerElement: findClaudeComposer,
  findSendButton: findClaudeSendButton,

  isSendButtonClick(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const button = target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return false;

    const label = (button.getAttribute("aria-label") ?? "").toLowerCase();
    if (label.includes("stop") || label.includes("중지")) return false;
    if (
      label === "send message" ||
      label === "메시지 보내기" ||
      button.getAttribute("data-testid") === "send-button"
    ) {
      return true;
    }

    const sendBtn = findClaudeSendButton();
    return Boolean(sendBtn && sendBtn === button);
  },

  isComposerTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const composer = findClaudeComposer();
    if (!composer) return false;
    return target === composer || composer.contains(target);
  },

  isStreamingResponse(): boolean {
    if (document.querySelector('[data-is-streaming="true"]')) {
      return true;
    }
    const stopSelectors = [
      'button[aria-label="Stop response"]',
      'button[aria-label="응답 중지"]',
      'button[aria-label*="Stop generating" i]',
    ];
    for (const sel of stopSelectors) {
      const btn = document.querySelector<HTMLElement>(sel);
      if (btn && isElementVisible(btn)) return true;
    }
    return false;
  },

  getComposerText: getProseMirrorText,

  setComposerText(editor: HTMLElement, text: string): void {
    setProseMirrorText(editor, text, true);
  },

  extractChatTurns(root: ParentNode = document): TranscriptTurn[] {
    const hasExplicitAssistantTestId = Boolean(
      root.querySelector('[data-testid="assistant-message"]'),
    );

    const selector = hasExplicitAssistantTestId
      ? '[data-testid="user-message"], [data-testid="assistant-message"]'
      : '[data-testid="user-message"], .font-user-message, .font-claude-response, .font-claude-message';

    const matched = deduplicateNestedElements(
      Array.from(root.querySelectorAll<HTMLElement>(selector)),
    );

    const turns: TranscriptTurn[] = [];
    for (const node of matched) {
      const isUser =
        node.matches('[data-testid="user-message"], .font-user-message');
      const text = extractCleanMessageText(node);
      if (!text) continue;
      turns.push({ role: isUser ? "user" : "assistant", text });
    }
    return turns;
  },

  navigateToNewChat(): void {
    const newChatSelectors = [
      'a[href="/new"]',
      'button[data-testid="new-chat-button"]',
      'a[data-testid="new-chat-button"]',
      'button[aria-label="New chat"]',
      'button[aria-label="새 채팅"]',
      'a[aria-label="New chat"]',
      'a[aria-label="새 채팅"]',
    ];
    for (const selector of newChatSelectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && isElementVisible(el)) {
        el.click();
        return;
      }
    }

    // Preserve Project root if inside /project/<id>
    const projectMatch = window.location.pathname.match(/^(\/project\/[^/]+)/);
    if (projectMatch?.[1]) {
      window.location.assign(`${window.location.origin}${projectMatch[1]}`);
      return;
    }

    window.location.assign(`${window.location.origin}/new`);
  },

  detectDarkMode: detectPageDarkMode,
};
