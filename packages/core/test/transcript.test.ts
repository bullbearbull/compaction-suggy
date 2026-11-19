import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSlidingWindowContext,
  parseTranscriptJsonl,
} from "../dist/transcript.js";

describe("parseTranscriptJsonl", () => {
  it("parses Claude Code JSONL and strips system reminders and tool blocks", () => {
    const jsonl = [
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: "<system-reminder>internal note</system-reminder>Fix the PostgreSQL migration lock issue.",
        },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "hidden thoughts" },
            { type: "text", text: "I will use CREATE INDEX CONCURRENTLY." },
            { type: "tool_use", name: "Edit", input: { file: "001.sql" } },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        isMeta: true,
        message: { role: "user", content: "meta message to ignore" },
      }),
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", content: "command output" }],
        },
      }),
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "Now add a rollback script for the index." },
      }),
    ].join("\n");

    const parsed = parseTranscriptJsonl(jsonl);
    assert.equal(parsed.compactionCount, 0);
    assert.equal(parsed.userTurnCount, 2);
    assert.deepEqual(parsed.turns, [
      { role: "user", text: "Fix the PostgreSQL migration lock issue." },
      { role: "assistant", text: "I will use CREATE INDEX CONCURRENTLY." },
      { role: "user", text: "Now add a rollback script for the index." },
    ]);
  });

  it("parses Codex rollout JSONL and deduplicates mirrored event_msg and response_item records", () => {
    const jsonl = [
      JSON.stringify({
        type: "event_msg",
        payload: { type: "user_message", message: "Refactor JWT auth middleware." },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Refactor JWT auth middleware." }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Updated middleware to verify RS256 signatures." }],
        },
      }),
    ].join("\n");

    const parsed = parseTranscriptJsonl(jsonl);
    assert.equal(parsed.userTurnCount, 1);
    assert.equal(parsed.turns.length, 2);
    assert.equal(parsed.turns[0]?.text, "Refactor JWT auth middleware.");
    assert.equal(parsed.turns[1]?.text, "Updated middleware to verify RS256 signatures.");
  });

  it("resets turns at compaction boundaries and keeps summary", () => {
    const jsonl = [
      JSON.stringify({ role: "user", content: "Old turn 1 about Docker" }),
      JSON.stringify({ role: "assistant", content: "Old response 1" }),
      JSON.stringify({ role: "user", content: "Old turn 2 about Kubernetes" }),
      JSON.stringify({
        type: "system",
        subtype: "compact_boundary",
        summary: "Previously set up Docker and Kubernetes manifests.",
      }),
      JSON.stringify({ role: "user", content: "Now let's tune nginx caching." }),
    ].join("\n");

    const parsed = parseTranscriptJsonl(jsonl);
    assert.equal(parsed.compactionCount, 1);
    assert.equal(parsed.userTurnCount, 1);
    assert.equal(
      parsed.compactionSummary,
      "Previously set up Docker and Kubernetes manifests.",
    );
    assert.deepEqual(parsed.turns, [
      { role: "user", text: "Now let's tune nginx caching." },
    ]);
  });

  it("drops trailing user turn when it matches incoming currentPrompt", () => {
    const jsonl = [
      JSON.stringify({ role: "user", content: "Help me write a SQL query." }),
      JSON.stringify({ role: "assistant", content: "Sure, what tables?" }),
      JSON.stringify({ role: "user", content: "Build a dark mode toggle in React." }),
    ].join("\n");

    const parsed = parseTranscriptJsonl(jsonl, "Build a dark mode toggle in React.");
    assert.equal(parsed.userTurnCount, 1);
    assert.equal(parsed.turns.length, 2);
  });

  it("enforces maxWindowTurns and maxContextChars in sliding window", () => {
    const turns = Array.from({ length: 12 }, (_, idx) => ({
      role: (idx % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      text: `Message ${idx + 1} ${"x".repeat(120)}`,
    }));

    const window = buildSlidingWindowContext(
      { turns, compactionCount: 0, userTurnCount: 6 },
      4,
      350,
    );
    assert.ok(window.previousContext.length <= 350);
    assert.ok(window.previousContext.includes("Message 12"));
    assert.ok(!window.previousContext.includes("Message 1 "));
  });
});
