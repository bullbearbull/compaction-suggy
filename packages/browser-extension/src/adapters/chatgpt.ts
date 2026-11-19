import type { TranscriptTurn } from "@topic-shift-compact/core/browser";
import {
  detectPageDarkMode,
  extractCleanMessageText,
  getProseMirrorText,
  isElementVisible,
  setProseMirrorText,
  type SiteAdapter,
} from "./types.js";

function findChatGptComposer(root: ParentNode = document): HTMLElement | null {
  const selectors = [
    "#prompt-textarea",
    'div.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    "form textarea[placeholder]",
    "form textarea",
  ];
  for (const selector of selectors) {
    const el = root.querySelector<HTMLElement>(selector);
    if (el && isElementVisible(el)) return el;
  }
  return null;
}

function findChatGptSendButton(root: ParentNode = document): HTMLButtonElement | null {
  const selectors = [
    'button[data-testid="send-button"]',
    'button[data-testid="composer-submit-button"]',
    'form button[aria-label="Send prompt"]',
    'form button[aria-label="프롬프트 보내기"]',
    'form button[type="submit"]',
  ];
  for (const selector of selectors) {
    const btn = root.querySelector<HTMLButtonElement>(selector);
    if (btn && isElementVisible(btn)) {
      if (btn.getAttribute("data-testid") === "stop-button") continue;
      return btn;
    }
  }
  return null;
}

export const chatGptAdapter: SiteAdapter = {
  id: "chatgpt",
  displayName: "ChatGPT",
  accentColor: "#10a37f",
  accentHoverColor: "#0d8c6d",
  accentSoftColor: "rgba(16, 163, 127, 0.14)",

  extractConversationId(pathname: string): string {
    const match = pathname.match(/\/c\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? "new-chat";
  },

  findComposerElement: findChatGptComposer,
  findSendButton: findChatGptSendButton,

  isSendButtonClick(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const button = target.closest<HTMLButtonElement>("button");
    if (!button) return false;
    const testId = button.getAttribute("data-testid") ?? "";
    if (testId === "stop-button") return false;
    if (testId === "send-button" || testId === "composer-submit-button") {
      return !button.disabled;
    }
    const sendBtn = findChatGptSendButton();
    return Boolean(sendBtn && sendBtn === button && !button.disabled);
  },

  isComposerTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const composer = findChatGptComposer();
    if (!composer) return false;
    return target === composer || composer.contains(target);
  },

  isStreamingResponse(): boolean {
    const stopBtn = document.querySelector<HTMLElement>('button[data-testid="stop-button"]');
    return Boolean(stopBtn && isElementVisible(stopBtn));
  },

  getComposerText: getProseMirrorText,

  setComposerText(editor: HTMLElement, text: string): void {
    setProseMirrorText(editor, text, false);
  },

  extractChatTurns(root: ParentNode = document): TranscriptTurn[] {
    const turns: TranscriptTurn[] = [];
    const roleNodes = root.querySelectorAll<HTMLElement>("[data-message-author-role]");

    if (roleNodes.length > 0) {
      for (const node of roleNodes) {
        const role = node.getAttribute("data-message-author-role");
        if (role !== "user" && role !== "assistant") continue;
        const text = extractCleanMessageText(node);
        if (!text) continue;
        turns.push({ role, text });
      }
      return turns;
    }

    const articles = root.querySelectorAll<HTMLElement>(
      'article[data-testid^="conversation-turn-"]',
    );
    for (const article of articles) {
      const turnAttr = article.getAttribute("data-turn");
      let role: "user" | "assistant" | undefined;
      if (turnAttr === "user" || turnAttr === "assistant") {
        role = turnAttr;
      } else {
        const heading =
          article.querySelector("h5, h6, .sr-only")?.textContent?.toLowerCase() ?? "";
        if (heading.includes("you said") || heading.includes("나의 말")) {
          role = "user";
        } else if (heading.includes("chatgpt said") || heading.includes("chatgpt의 말")) {
          role = "assistant";
        }
      }
      if (!role) continue;
      const text = extractCleanMessageText(article);
      if (!text) continue;
      turns.push({ role, text });
    }

    return turns;
  },

  navigateToNewChat(): void {
    const newChatSelectors = [
      'a[data-testid="create-new-chat-button"]',
      'button[data-testid="create-new-chat-button"]',
      'button[aria-label="New chat"]',
      'button[aria-label="새 채팅"]',
      'a[aria-label="New chat"]',
      'a[aria-label="새 채팅"]',
      'nav a[href="/"]',
    ];
    for (const selector of newChatSelectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && isElementVisible(el)) {
        el.click();
        return;
      }
    }

    const gptMatch = window.location.pathname.match(/^(\/g\/[^/]+)\/c\//);
    if (gptMatch?.[1]) {
      window.location.assign(`${window.location.origin}${gptMatch[1]}`);
      return;
    }

    window.location.assign(`${window.location.origin}/`);
  },

  detectDarkMode: detectPageDarkMode,
};
