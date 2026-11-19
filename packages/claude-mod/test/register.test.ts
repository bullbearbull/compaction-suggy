import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { getDefaultConfig, type DecisionProvider } from "@topic-shift-compact/core/browser";
import {
  register,
  setModRuntimeOverrides,
  type ModHandler,
  type ModOnFn,
} from "../dist/register.js";

describe("Compaction Suggy Claude Code Mod (Mods API)", () => {
  afterEach(() => {
    setModRuntimeOverrides({});
  });

  it("registers UserPromptSubmit, blocks on shift, and bypasses on re-submit", async () => {
    const handlers = new Map<string, ModHandler<any, any>>();
    const on: ModOnFn = (eventName, fn) => {
      handlers.set(eventName, fn);
    };

    let calls = 0;
    const provider: DecisionProvider = {
      name: "openrouter",
      model: "typesafe/jev-latest",
      async decide() {
        calls += 1;
        return {
          provider: "openrouter",
          model: "typesafe/jev-latest",
          probability: 0.91,
          latencyMs: 85,
        };
      },
    };

    setModRuntimeOverrides({
      loadConfigFn: () => ({
        ...getDefaultConfig(),
        minTurns: 2,
        minContextChars: 40,
        threshold: 0.75,
      }),
      provider,
    });

    register(on);

    const submitHandler = handlers.get("prompt.submit");
    assert.ok(submitHandler, "prompt.submit handler should be registered");

    const event = {
      session_id: "mod-sess-1",
      prompt: "도쿄 3박 4일 여행 일정이랑 맛집 추천해줘",
      messages: [
        { role: "user", content: "PostgreSQL 인덱스 락 문제 해결 방법 알려줘." },
        { role: "assistant", content: "CREATE INDEX CONCURRENTLY를 사용하면 테이블 락을 피할 수 있습니다." },
        { role: "user", content: "롤백 스크립트도 같이 작성해줘." },
        { role: "assistant", content: "DROP INDEX CONCURRENTLY와 lock_timeout을 추가했습니다." },
      ],
    };

    let nextCalled = 0;
    const next = async (e: unknown) => {
      nextCalled += 1;
      return { passed: true, e };
    };

    // 1st submission: blocked
    const res1 = (await submitHandler({}, event, next)) as {
      decision?: string;
      reason?: string;
    };
    assert.equal(res1.decision, "block");
    assert.match(res1.reason ?? "", /Compaction Suggy/);
    assert.match(res1.reason ?? "", /\/compact/);
    assert.equal(nextCalled, 0);
    assert.equal(calls, 1);

    // 2nd identical submission: automatic one-shot bypass -> calls next()
    const res2 = (await submitHandler({}, event, next)) as { passed?: boolean };
    assert.equal(res2.passed, true);
    assert.equal(nextCalled, 1);
    assert.equal(calls, 1);
  });

  it("returns advisory additionalContext in advisory mode", async () => {
    const handlers = new Map<string, ModHandler<any, any>>();
    const on: ModOnFn = (eventName, fn) => {
      handlers.set(eventName, fn);
    };

    const provider: DecisionProvider = {
      name: "openai",
      model: "gpt-6-luna",
      async decide() {
        return {
          provider: "openai",
          model: "gpt-6-luna",
          probability: 0.89,
          latencyMs: 95,
        };
      },
    };

    setModRuntimeOverrides({
      loadConfigFn: () => ({
        ...getDefaultConfig(),
        mode: "advisory",
        minTurns: 2,
        minContextChars: 40,
      }),
      provider,
    });

    register(on);

    const submitHandler = handlers.get("prompt.submit")!;
    const res = (await submitHandler(
      {},
      {
        prompt: "Plan a weekend hiking trip to Yosemite National Park",
        messages: [
          { role: "user", content: "Help me refactor this Rust async Tokio worker pool." },
          { role: "assistant", content: "Use bounded mpsc channels with JoinSet for clean backpressure." },
          { role: "user", content: "How should I handle graceful shutdown with CancellationToken?" },
          { role: "assistant", content: "Pass tokio_util::sync::CancellationToken into each worker select! branch." },
        ],
      },
      async (e) => ({ passed: true, e }),
    )) as { hookSpecificOutput?: { hookEventName: string; additionalContext: string } };

    assert.equal(res.hookSpecificOutput?.hookEventName, "UserPromptSubmit");
    assert.match(res.hookSpecificOutput?.additionalContext ?? "", /Compaction Suggy Advisory/);
  });

  it("produces a standalone zero-node-import plugin bundle exporting register()", async () => {
    const bundlePath = path.resolve(
      process.cwd(),
      "plugins",
      "compaction-suggy-mod",
      "dist",
      "register.mjs",
    );
    assert.equal(fs.existsSync(bundlePath), true, `Missing mod bundle at ${bundlePath}`);
    const src = fs.readFileSync(bundlePath, "utf8");
    assert.doesNotMatch(src, /from\s*["']node:|require\(\s*["']node:/);
    const mod = (await import(`file://${bundlePath}`)) as { register?: unknown };
    assert.equal(typeof mod.register, "function");
  });
});
