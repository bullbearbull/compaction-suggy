import type { SkipReason, TopicShiftConfig } from "./types.js";

/**
 * Common short confirmations/continuations in English and Korean that clearly
 * continue the active turn and should never trigger a Decision API call.
 */
const SHORT_ACKNOWLEDGEMENTS = new Set([
  "ok",
  "okay",
  "k",
  "yes",
  "yep",
  "yeah",
  "y",
  "no",
  "nope",
  "n",
  "sure",
  "go",
  "go ahead",
  "proceed",
  "continue",
  "lgtm",
  "looks good",
  "thanks",
  "thank you",
  "thx",
  "ty",
  "done",
  "fix it",
  "try again",
  "run it",
  "do it",
  "apply",
  "commit",
  "push",
  "응",
  "ㅇㅇ",
  "네",
  "예",
  "아니",
  "아니요",
  "좋아",
  "좋아요",
  "진행해",
  "진행해줘",
  "계속",
  "계속해",
  "계속해줘",
  "해줘",
  "고마워",
  "감사",
  "감사합니다",
  "확인",
  "확인했어",
  "알겠어",
  "오케이",
  "ㄱㄱ",
  "고고",
  "다시",
  "다시해줘",
  "실행해줘",
  "커밋해줘",
]);

const OVERRIDE_PREFIX_PATTERN = /^(!keep|\[keep\]|!nocompact|\[nocompact\])(?=\s|$)/i;

export function normalizePromptForComparison(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

export function checkPromptFastPath(
  rawPrompt: string,
  config: TopicShiftConfig,
): SkipReason | undefined {
  if (!config.enabled) {
    return "disabled";
  }

  const trimmed = rawPrompt.trim();
  if (!trimmed) {
    return "empty_prompt";
  }

  // Never intercept slash commands like /compact, /clear, /help, /hooks, /model, etc.
  if (trimmed.startsWith("/")) {
    return "slash_command";
  }

  // Explicit user override prefix to skip topic-shift detection for this turn.
  if (OVERRIDE_PREFIX_PATTERN.test(trimmed)) {
    return "override_prefix";
  }

  const normalizedLower = normalizePromptForComparison(trimmed)
    .toLowerCase()
    .replace(/[.!?~]+$/g, "")
    .trim();

  if (SHORT_ACKNOWLEDGEMENTS.has(normalizedLower)) {
    return "short_acknowledgement";
  }

  if (trimmed.length < config.minPromptChars) {
    return "short_prompt";
  }

  return undefined;
}
