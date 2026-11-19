import type { EvaluationOutcome, LanguagePreference } from "@topic-shift-compact/core";

const HANGUL_REGEX = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;

export function resolveMessageLanguage(
  preference: LanguagePreference,
  prompt: string,
): "ko" | "en" {
  if (preference === "ko" || preference === "en") {
    return preference;
  }
  return HANGUL_REGEX.test(prompt) ? "ko" : "en";
}

export interface HookOutputJson {
  decision?: "block";
  reason?: string;
  hookSpecificOutput?: {
    hookEventName: "UserPromptSubmit";
    additionalContext: string;
  };
}

export function formatHookOutput(
  outcome: EvaluationOutcome,
  prompt: string,
  languagePreference: LanguagePreference,
): HookOutputJson | undefined {
  if (outcome.action === "allow" || !outcome.decision) {
    return undefined;
  }

  const pct = Math.round(outcome.decision.probability * 100);
  const sourceTag = `${outcome.decision.provider}/${outcome.decision.model}`;
  const lang = resolveMessageLanguage(languagePreference, prompt);

  if (outcome.action === "block") {
    const reason =
      lang === "ko"
        ? [
            `[주제 전환 감지 · ${pct}% · ${sourceTag}]`,
            "입력하신 프롬프트가 지금까지의 대화 주제와 크게 다릅니다.",
            "• 권장: `/compact` (또는 `/clear`)로 컨텍스트를 압축한 뒤 진행해 주세요.",
            "• 그대로 진행: 같은 프롬프트를 한 번 더 전송하면 자동으로 통과됩니다. (또는 앞에 `!keep ` 붙이기)",
          ].join("\n")
        : [
            `[Topic Shift Detected · ${pct}% · ${sourceTag}]`,
            "Your new prompt appears substantially unrelated to the current conversation context.",
            "• Recommended: run `/compact` (or `/clear`) first, then send your prompt.",
            "• Continue anyway: re-submit the same prompt once to bypass automatically (or prefix with `!keep `).",
          ].join("\n");

    return {
      decision: "block",
      reason,
    };
  }

  // Advisory mode: do not block submission; guide the assistant to offer compaction.
  const additionalContext =
    lang === "ko"
      ? `[Topic Shift Advisory · ${pct}% · ${sourceTag}] 사용자의 새 프롬프트가 이전 대화 주제와 크게 다른 것으로 감지되었습니다. 긴 작업을 시작하기 전에 먼저 \`/compact\`로 컨텍스트를 압축할지 한 줄로 정중히 제안한 뒤, 사용자가 원할 때 압축할 수 있도록 안내하세요.`
      : `[Topic Shift Advisory · ${pct}% · ${sourceTag}] The user's new prompt appears substantially unrelated to the previous conversation topic. Before diving into a long response, briefly note the topic shift and ask if they want to run \`/compact\` first.`;

  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  };
}
