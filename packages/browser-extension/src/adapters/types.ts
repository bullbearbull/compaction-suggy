import type { TranscriptTurn } from "@topic-shift-compact/core/browser";

export type SiteId = "chatgpt" | "claude";

export interface SiteAdapter {
  readonly id: SiteId;
  readonly displayName: string;
  readonly accentColor: string;
  readonly accentHoverColor: string;
  readonly accentSoftColor: string;
  extractConversationId(pathname: string): string;
  findComposerElement(root?: ParentNode): HTMLElement | null;
  findSendButton(root?: ParentNode): HTMLButtonElement | null;
  isSendButtonClick(target: EventTarget | null): boolean;
  isComposerTarget(target: EventTarget | null): boolean;
  isStreamingResponse(): boolean;
  getComposerText(editor: HTMLElement): string;
  setComposerText(editor: HTMLElement, text: string): void;
  extractChatTurns(root?: ParentNode): TranscriptTurn[];
  navigateToNewChat(): void;
  detectDarkMode(): boolean;
}

export function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

export function getProseMirrorText(editor: HTMLElement): string {
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    return editor.value.trim();
  }

  const paragraphs = editor.querySelectorAll(":scope > p");
  if (paragraphs.length > 0) {
    const lines: string[] = [];
    for (const p of paragraphs) {
      const line = (p.textContent ?? "").replace(/\u200B/g, "");
      lines.push(line);
    }
    return lines.join("\n").trim();
  }

  return (editor.innerText || editor.textContent || "").replace(/\u200B/g, "").trim();
}

export function setProseMirrorText(
  editor: HTMLElement,
  text: string,
  preferExecCommand = false,
): void {
  editor.focus();

  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    const proto =
      editor instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(editor, text);
    } else {
      editor.value = text;
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  // On TipTap/ProseMirror (especially Claude.ai), execCommand('insertText') routes
  // directly through ProseMirror's native beforeinput/input transaction pipeline.
  if (preferExecCommand && typeof document.execCommand === "function") {
    try {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      document.execCommand("selectAll", false);
      const inserted = document.execCommand("insertText", false, text);
      if (inserted && getProseMirrorText(editor).trim() === text.trim()) {
        return;
      }
    } catch {
      // Fall through to safe DOM paragraph replacement
    }
  }

  // Safe DOM <p> node construction (never innerHTML) + InputEvent dispatch
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    const p = document.createElement("p");
    if (line.length > 0) {
      p.textContent = line;
    } else {
      const br = document.createElement("br");
      br.className = "ProseMirror-trailingBreak";
      p.appendChild(br);
    }
    fragment.appendChild(p);
  }

  editor.replaceChildren(fragment);

  try {
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } catch {
    // Ignore selection errors in detached frames
  }

  editor.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text,
    }),
  );
}

/**
 * Extracts clean text from a single message DOM node, removing interactive
 * chrome like code-block copy buttons, sr-only speaker prefixes, and toolbars.
 */
export function extractCleanMessageText(node: Element): string {
  const clone = node.cloneNode(true) as HTMLElement;
  const noiseSelectors = [
    "button",
    "svg",
    "style",
    "script",
    ".sr-only",
    '[aria-hidden="true"]',
    '[data-testid*="action"]',
    '[data-testid*="copy"]',
  ];
  for (const sel of noiseSelectors) {
    for (const el of clone.querySelectorAll(sel)) {
      el.remove();
    }
  }

  return (clone.innerText || clone.textContent || "")
    .replace(/\u200B/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectPageDarkMode(): boolean {
  const html = document.documentElement;
  if (
    html.classList.contains("dark") ||
    html.getAttribute("data-mode") === "dark" ||
    html.getAttribute("data-theme") === "dark"
  ) {
    return true;
  }
  if (
    html.classList.contains("light") ||
    html.getAttribute("data-mode") === "light" ||
    html.getAttribute("data-theme") === "light"
  ) {
    return false;
  }

  // Fallback: inspect computed body background luminance
  try {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    const match = bg.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      return luminance < 128;
    }
  } catch {
    // Ignore
  }

  const colorScheme = window.getComputedStyle(html).colorScheme;
  if (colorScheme.includes("dark") && !colorScheme.includes("light")) return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}
