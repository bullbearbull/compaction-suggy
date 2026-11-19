import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { getDefaultConfig } from "../dist/config.js";
import { evaluateTopicShift } from "../dist/evaluator.js";
import type { DecisionProvider, ParsedTranscript } from "../dist/types.js";

function makeTranscript(userTurns = 4): ParsedTranscript {
  const turns = [];
  for (let i = 1; i <= userTurns; i += 1) {
    turns.push({
      role: "user" as const,
      text: `PostgreSQL migration step ${i}: optimize index creation and lock timeout settings on the users table.`,
    });
    turns.push({
      role: "assistant" as const,
      text: `Applied step ${i} using CREATE INDEX CONCURRENTLY and verified migration plan safely.`,
    });
  }
  return { turns, compactionCount: 0, userTurnCount: userTurns };
}

function makeStubProvider(probability: number, counter?: { calls: number }): DecisionProvider {
  return {
    name: "openrouter",
    model: "typesafe/jev-latest",
    async decide() {
      if (counter) counter.calls += 1;
      return {
        provider: "openrouter",
        model: "typesafe/jev-latest",
        probability,
        latencyMs: 42,
      };
    },
  };
}

describe("evaluateTopicShift", () => {
  it("blocks on topic shift and allows automatic one-shot bypass on exact re-submit", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsc-eval-test-"));
    try {
      const config = {
        ...getDefaultConfig(),
        bypassCachePath: path.join(tmpDir, "cache.json"),
        threshold: 0.75,
        mode: "block" as const,
      };
      const counter = { calls: 0 };
      const provider = makeStubProvider(0.92, counter);
      const transcript = makeTranscript(4);
      const payload = {
        session_id: "sess-abc",
        prompt: "React 대시보드에 다크모드 토글을 만들어줘.",
      };

      // First submit -> block
      const first = await evaluateTopicShift(payload, {
        config,
        provider,
        transcript,
        now: 100_000,
      });
      assert.equal(first.action, "block");
      assert.equal(first.decision?.probability, 0.92);
      assert.equal(counter.calls, 1);

      // Re-submit same prompt -> bypass cache hit, zero API call
      const second = await evaluateTopicShift(payload, {
        config,
        provider,
        transcript,
        now: 105_000,
      });
      assert.equal(second.action, "allow");
      assert.equal(second.skipReason, "bypass_cache_hit");
      assert.equal(counter.calls, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns advisory without blocking when mode is advisory", async () => {
    const config = {
      ...getDefaultConfig(),
      mode: "advisory" as const,
      threshold: 0.75,
    };
    const outcome = await evaluateTopicShift(
      { session_id: "sess-adv", prompt: "Build a completely unrelated CSS animation." },
      { config, provider: makeStubProvider(0.89), transcript: makeTranscript(4) },
    );
    assert.equal(outcome.action, "advisory");
    assert.equal(outcome.decision?.probability, 0.89);
  });

  it("allows when probability is below threshold", async () => {
    const config = getDefaultConfig();
    const outcome = await evaluateTopicShift(
      {
        session_id: "sess-same",
        prompt: "Also add a lock_timeout guard to the PostgreSQL rollback script.",
      },
      { config, provider: makeStubProvider(0.14), transcript: makeTranscript(4) },
    );
    assert.equal(outcome.action, "allow");
    assert.equal(outcome.decision?.probability, 0.14);
  });

  it("skips when fewer than minTurns have occurred since session start or compaction", async () => {
    const config = { ...getDefaultConfig(), minTurns: 3 };
    const counter = { calls: 0 };
    const outcome = await evaluateTopicShift(
      { session_id: "sess-early", prompt: "Switch to a totally different topic right now." },
      { config, provider: makeStubProvider(0.99, counter), transcript: makeTranscript(2) },
    );
    assert.equal(outcome.action, "allow");
    assert.equal(outcome.skipReason, "insufficient_turns");
    assert.equal(counter.calls, 0);
  });

  it("fails open when provider throws or times out", async () => {
    const config = getDefaultConfig();
    const brokenProvider: DecisionProvider = {
      name: "local",
      model: "tev1",
      async decide() {
        throw new Error("ECONNREFUSED localhost:11434");
      },
    };
    const outcome = await evaluateTopicShift(
      { session_id: "sess-err", prompt: "Build a brand new GraphQL gateway service." },
      { config, provider: brokenProvider, transcript: makeTranscript(4) },
    );
    assert.equal(outcome.action, "allow");
    assert.equal(outcome.skipReason, "provider_error_fail_open");
    assert.match(outcome.errorMessage ?? "", /ECONNREFUSED/);
  });
});
