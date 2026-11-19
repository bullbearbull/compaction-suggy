import {
  normalizePromptForComparison,
  type EvaluationOutcome,
  type LanguagePreference,
  type TranscriptTurn,
} from "@topic-shift-compact/core/browser";

const HANGUL_REGEX = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;

export function resolveUiLanguage(
  preference: LanguagePreference,
  prompt: string,
): "ko" | "en" {
  if (preference === "ko" || preference === "en") {
    return preference;
  }
  return HANGUL_REGEX.test(prompt) ? "ko" : "en";
}

export function extractConversationId(pathname: string): string {
  // ChatGPT: /c/<id> or /g/<gpt-id>/c/<id>
  // Claude.ai: /chat/<id>
  const match = pathname.match(/\/(?:c|chat)\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) {
    return match[1];
  }
  return "new-chat";
}

function truncateLine(text: string, maxLen: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/**
 * Builds a concise compact-handoff prompt that carries essential context from
 * the prior thread into a fresh ChatGPT conversation without dragging the full history.
 */
export function buildCompactHandoffPrompt(
  turns: TranscriptTurn[],
  newPrompt: string,
  lang: "ko" | "en",
): string {
  const userTurns = turns.filter((t) => t.role === "user").slice(-4);
  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant");

  const bullets: string[] = [];
  for (const turn of userTurns) {
    bullets.push(`- ${truncateLine(turn.text, 160)}`);
  }
  if (lastAssistant) {
    const label = lang === "ko" ? "직전 어시스턴트 요점" : "Last assistant takeaway";
    bullets.push(`- ${label}: ${truncateLine(lastAssistant.text, 220)}`);
  }

  const summaryBlock = bullets.join("\n");
  if (!summaryBlock) {
    return newPrompt.trim();
  }

  if (lang === "ko") {
    return [
      "[이전 대화 요약 (참고용 · 필요할 때만 반영)]",
      summaryBlock,
      "",
      "[새 요청]",
      newPrompt.trim(),
    ].join("\n");
  }

  return [
    "[Compacted Context from Previous Chat (reference only if relevant)]",
    summaryBlock,
    "",
    "[New Request]",
    newPrompt.trim(),
  ].join("\n");
}

/**
 * Lightweight in-memory one-shot bypass cache so re-sending a prompt after
 * clicking "Send here anyway" never triggers an infinite modal loop.
 */
export class InMemoryBypassCache {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs = 300_000) {
    this.ttlMs = ttlMs;
  }

  private key(conversationId: string, prompt: string): string {
    return `${conversationId}::${normalizePromptForComparison(prompt)}`;
  }

  record(conversationId: string, prompt: string, now = Date.now()): void {
    this.prune(now);
    this.entries.set(this.key(conversationId, prompt), now + this.ttlMs);
  }

  consume(conversationId: string, prompt: string, now = Date.now()): boolean {
    const k = this.key(conversationId, prompt);
    const expiresAt = this.entries.get(k);
    if (!expiresAt) return false;
    this.entries.delete(k);
    return expiresAt > now;
  }

  private prune(now: number): void {
    for (const [k, exp] of this.entries.entries()) {
      if (exp <= now) this.entries.delete(k);
    }
  }
}

export function formatEvaluationSummary(
  outcome: EvaluationOutcome,
  lang: "ko" | "en",
): string {
  if (outcome.decision) {
    const pct = Math.round(outcome.decision.probability * 100);
    const thresholdPct = Math.round(outcome.threshold * 100);
    const tag = `${outcome.decision.provider}/${outcome.decision.model} · ${outcome.decision.latencyMs}ms`;
    if (outcome.action === "block") {
      return lang === "ko"
        ? `주제 전환 감지 (${pct}% ≥ ${thresholdPct}%) · ${tag}`
        : `Topic shift detected (${pct}% ≥ ${thresholdPct}%) · ${tag}`;
    }
    if (outcome.action === "advisory") {
      return lang === "ko"
        ? `주제 전환 알림 (${pct}% ≥ ${thresholdPct}%) · ${tag}`
        : `Topic shift advisory (${pct}% ≥ ${thresholdPct}%) · ${tag}`;
    }
    return lang === "ko"
      ? `같은 주제로 통과 (${pct}% < ${thresholdPct}%) · ${tag}`
      : `Same topic allowed (${pct}% < ${thresholdPct}%) · ${tag}`;
  }

  if (outcome.skipReason === "provider_error_fail_open") {
    const msg = outcome.errorMessage ?? "unknown error";
    return lang === "ko"
      ? `API 오류로 자동 통과 (Fail-Open): ${msg}`
      : `Fail-open on API error: ${msg}`;
  }

  const skipLabels: Record<string, { ko: string; en: string }> = {
    disabled: { ko: "확장 비활성화됨", en: "Extension disabled" },
    empty_prompt: { ko: "빈 프롬프트", en: "Empty prompt" },
    slash_command: { ko: "슬래시 명령어 스킵", en: "Slash command skipped" },
    override_prefix: { ko: "!keep 오버라이드 스킵", en: "Override prefix skipped" },
    short_prompt: { ko: "짧은 프롬프트 스킵", en: "Short prompt skipped" },
    short_acknowledgement: { ko: "짧은 확인 응답 스킵", en: "Short acknowledgement skipped" },
    no_transcript: { ko: "이전 대화 없음 (새 대화)", en: "No prior conversation" },
    insufficient_turns: {
      ko: `대화 턴 부족 (${outcome.userTurnCount ?? 0}턴)`,
      en: `Insufficient turns (${outcome.userTurnCount ?? 0})`,
    },
    insufficient_context: {
      ko: `이전 컨텍스트 길이 부족 (${outcome.contextChars ?? 0}자)`,
      en: `Insufficient context (${outcome.contextChars ?? 0} chars)`,
    },
    bypass_cache_hit: { ko: "재전송 바이패스 통과", en: "One-shot bypass allowed" },
    no_provider_configured: {
      ko: "API 키/로컬 URL 미설정",
      en: "Provider not configured",
    },
  };

  const label = outcome.skipReason ? skipLabels[outcome.skipReason] : undefined;
  if (label) {
    return lang === "ko" ? `스킵: ${label.ko}` : `Skipped: ${label.en}`;
  }
  return lang === "ko" ? "통과됨" : "Allowed";
}
