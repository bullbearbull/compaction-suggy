import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildParsedTranscriptFromTurns,
  evaluateTranscriptTopicShift,
  getDefaultConfig,
  type DecisionProvider,
} from "@topic-shift-compact/core/browser";
import {
  buildCompactHandoffPrompt,
  extractConversationId,
  formatEvaluationSummary,
  InMemoryBypassCache,
  resolveUiLanguage,
} from "../src/handoff.ts";

describe("ChatGPT extension handoff & browser evaluator", () => {
  it("extracts conversation IDs from ChatGPT and Claude.ai URLs", () => {
    assert.equal(extractConversationId("/"), "new-chat");
    assert.equal(extractConversationId("/new"), "new-chat");
    assert.equal(
      extractConversationId("/c/67b89c10-2a4e-8002-98c1-abc123456789"),
      "67b89c10-2a4e-8002-98c1-abc123456789",
    );
    assert.equal(
      extractConversationId("/g/g-p-12345-my-gpt/c/conv_999"),
      "conv_999",
    );
    assert.equal(
      extractConversationId("/chat/9f8c7a6b-1234-4abc-9def-0123456789ab"),
      "9f8c7a6b-1234-4abc-9def-0123456789ab",
    );
  });

  it("auto-detects Korean vs English UI language", () => {
    assert.equal(resolveUiLanguage("auto", "도쿄 여행 일정 짜줘"), "ko");
    assert.equal(resolveUiLanguage("auto", "Plan a 3-day trip to Tokyo"), "en");
    assert.equal(resolveUiLanguage("ko", "Plan a trip"), "ko");
    assert.equal(resolveUiLanguage("en", "도쿄 여행"), "en");
  });

  it("builds a concise compact handoff prompt in Korean and English", () => {
    const turns = [
      { role: "user" as const, text: "FastAPI JWT refresh token 401 오류 도와줘" },
      { role: "assistant" as const, text: "leeway 설정과 쿠키 SameSite 옵션을 확인하세요." },
      { role: "user" as const, text: "leeway 30초로 수정했어" },
      { role: "assistant" as const, text: "좋습니다. 이제 단위 테스트를 추가하세요." },
    ];

    const ko = buildCompactHandoffPrompt(turns, "도쿄 3박 4일 일정 짜줘", "ko");
    assert.match(ko, /\[이전 대화 요약/);
    assert.match(ko, /FastAPI JWT refresh token/);
    assert.match(ko, /직전 어시스턴트 요점/);
    assert.match(ko, /\[새 요청\]\n도쿄 3박 4일 일정 짜줘$/);

    const en = buildCompactHandoffPrompt(turns, "Plan a Tokyo trip", "en");
    assert.match(en, /\[Compacted Context from Previous Chat/);
    assert.match(en, /Last assistant takeaway/);
    assert.match(en, /\[New Request\]\nPlan a Tokyo trip$/);
  });

  it("supports one-shot in-memory bypass with TTL expiration", () => {
    const cache = new InMemoryBypassCache(60_000);
    const t0 = 1_000_000;
    cache.record("conv-1", "도쿄 여행 일정 추천해줘", t0);

    // Consumes once
    assert.equal(cache.consume("conv-1", "  도쿄  여행 일정 추천해줘 ", t0 + 1000), true);
    // Second call is no longer bypassed
    assert.equal(cache.consume("conv-1", "도쿄 여행 일정 추천해줘", t0 + 2000), false);

    // Expired entry does not bypass
    cache.record("conv-2", "another prompt", t0);
    assert.equal(cache.consume("conv-2", "another prompt", t0 + 61_000), false);
  });

  it("evaluates DOM turns via browser-safe evaluator without Node dependencies", async () => {
    const turns = [
      { role: "user" as const, text: "FastAPI에서 OAuth2 password bearer 설정 방법을 알려줘." },
      { role: "assistant" as const, text: "OAuth2PasswordBearer와 Depends를 사용하면 됩니다. 토큰 검증 함수도 함께 작성하세요." },
      { role: "user" as const, text: "refresh token rotation도 같이 붙이고 싶어. Redis 블랙리스트가 좋을까?" },
      { role: "assistant" as const, text: "네, jti 클레임과 TTL을 Redis에 저장하면 로그아웃과 재사용 감지가 깔끔합니다." },
    ];
    const parsed = buildParsedTranscriptFromTurns(turns, "도쿄 3박 4일 여행 일정 추천해줘");
    assert.equal(parsed.userTurnCount, 2);

    const mockProvider: DecisionProvider = {
      name: "openrouter",
      model: "typesafe/jev-latest",
      async decide() {
        return {
          provider: "openrouter",
          model: "typesafe/jev-latest",
          probability: 0.93,
          latencyMs: 112,
        };
      },
    };

    const config = { ...getDefaultConfig(), minTurns: 2, minContextChars: 50, threshold: 0.75 };
    const outcome = await evaluateTranscriptTopicShift(
      "도쿄 3박 4일 여행 일정 추천해줘",
      parsed,
      { config, provider: mockProvider },
    );

    assert.equal(outcome.action, "block");
    assert.equal(outcome.decision?.probability, 0.93);
    assert.match(formatEvaluationSummary(outcome, "ko"), /주제 전환 감지 \(93% ≥ 75%\)/);
  });
});
