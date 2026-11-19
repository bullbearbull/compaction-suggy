import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LocalDecisionProvider } from "../dist/providers/local-systemone.js";
import { OpenAiLunaProvider } from "../dist/providers/openai-luna.js";
import { OpenRouterJevProvider } from "../dist/providers/openrouter-jev.js";
import type { DecisionInput } from "../dist/types.js";

const sampleInput: DecisionInput = {
  previousContext: "User: Optimize PostgreSQL index.\nAssistant: Added CONCURRENTLY.",
  newPrompt: "Design a dark mode toggle button in React.",
  recentUserTopics: ["Optimize PostgreSQL index."],
};

describe("Decision Providers", () => {
  it("OpenRouterJevProvider sends System One noul request and extracts probability", async () => {
    let capturedUrl = "";
    let capturedAuth = "";
    let capturedBody: Record<string, unknown> = {};

    const mockFetch: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      const headers = init?.headers as Record<string, string>;
      capturedAuth = headers.Authorization ?? "";
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          model: "typesafe/jev-1.14",
          answers: {
            topic_shifted: { type: "noul", noul: 0.9421 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = new OpenRouterJevProvider({
      apiKey: "or-test-key",
      model: "typesafe/jev-latest",
      baseUrl: "https://openrouter.ai/api/alpha/decisions",
      fetchImpl: mockFetch,
    });

    const result = await provider.decide(sampleInput, 2000);
    assert.equal(capturedUrl, "https://openrouter.ai/api/alpha/decisions");
    assert.equal(capturedAuth, "Bearer or-test-key");
    assert.equal(capturedBody.model, "typesafe/jev-latest");
    assert.equal(result.provider, "openrouter");
    assert.equal(result.probability, 0.9421);
  });

  it("OpenAiLunaProvider sends predicate request to /v1/decisions and extracts probability", async () => {
    let capturedBody: Record<string, unknown> = {};

    const mockFetch: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          model: "gpt-6-luna",
          answers: [
            { type: "predicate", name: "topic_shifted", probability: 0.87 },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = new OpenAiLunaProvider({
      apiKey: "sk-test-key",
      model: "gpt-6-luna",
      baseUrl: "https://api.openai.com/v1/decisions",
      fetchImpl: mockFetch,
    });

    const result = await provider.decide(sampleInput, 2000);
    assert.equal(capturedBody.model, "gpt-6-luna");
    assert.ok(Array.isArray(capturedBody.questions));
    assert.equal(result.provider, "openai");
    assert.equal(result.probability, 0.87);
  });

  it("LocalDecisionProvider supports both Ollama systemone and vLLM openai-decisions formats", async () => {
    const mockSystemOneFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "tev1");
      assert.equal(body.keep_alive, "10m");
      return new Response(
        JSON.stringify({
          model: "tev1",
          answers: { topic_shifted: { type: "noul", noul: 0.81 } },
        }),
        { status: 200 },
      );
    };

    const ollama = new LocalDecisionProvider({
      url: "http://localhost:11434/v1/systemone",
      model: "tev1",
      apiFormat: "systemone",
      keepAlive: "10m",
      fetchImpl: mockSystemOneFetch,
    });
    const r1 = await ollama.decide(sampleInput, 2000);
    assert.equal(r1.probability, 0.81);

    const mockVllmFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "d3-mini");
      return new Response(
        JSON.stringify({
          model: "d3-mini",
          answers: [{ type: "predicate", name: "topic_shifted", probability: 0.18 }],
        }),
        { status: 200 },
      );
    };

    const vllm = new LocalDecisionProvider({
      url: "http://localhost:8000/v1/decisions",
      model: "d3-mini",
      apiFormat: "openai-decisions",
      fetchImpl: mockVllmFetch,
    });
    const r2 = await vllm.decide(sampleInput, 2000);
    assert.equal(r2.probability, 0.18);
  });
});
