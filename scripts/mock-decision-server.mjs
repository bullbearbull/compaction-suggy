#!/usr/bin/env node
/**
 * Local Mock Decision Model server for zero-cost end-to-end UI testing on ChatGPT Web.
 * Implements both:
 *   - POST /v1/systemone   (Ollama / OpenRouter Jev noul format)
 *   - POST /v1/decisions   (OpenAI GPT-6 Luna / vLLM predicate format)
 *
 * Usage:
 *   node scripts/mock-decision-server.mjs [--port 11435] [--prob auto|0.92|0.15]
 */
import http from "node:http";

const args = process.argv.slice(2);
let port = 11435;
let mode = "auto";

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--port" && args[i + 1]) {
    port = Number(args[i + 1]) || 11435;
    i += 1;
  } else if (args[i] === "--prob" && args[i + 1]) {
    mode = args[i + 1];
    i += 1;
  }
}

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2),
  );
}

function estimateTopicShiftHeuristic(previousText, newPrompt) {
  if (mode !== "auto") {
    const fixed = Number(mode);
    if (Number.isFinite(fixed)) {
      return Math.min(1, Math.max(0, fixed));
    }
  }
  const prevTokens = tokenize(previousText);
  const nextTokens = tokenize(newPrompt);
  if (prevTokens.size === 0 || nextTokens.size === 0) return 0.2;

  let overlap = 0;
  for (const t of nextTokens) {
    if (prevTokens.has(t)) overlap += 1;
  }
  const ratio = overlap / Math.max(1, Math.min(prevTokens.size, nextTokens.size));
  // Low lexical overlap -> high shift probability, high overlap -> low probability
  if (ratio === 0) return 0.91;
  if (ratio < 0.08) return 0.82;
  if (ratio < 0.2) return 0.55;
  return 0.14;
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "POST /v1/systemone or /v1/decisions" }));
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    try {
      const body = JSON.parse(raw || "{}");
      let prev = "";
      let next = "";

      if (body.state && typeof body.state === "object") {
        prev = String(body.state.previous_conversation || "");
        next = String(body.state.new_user_prompt || "");
      } else if (typeof body.input === "string") {
        const parts = body.input.split("## New User Prompt");
        prev = parts[0] || "";
        next = parts[1] || "";
      }

      const probability = estimateTopicShiftHeuristic(prev, next);
      const isOpenAiFormat =
        req.url?.includes("/decisions") && Array.isArray(body.questions);

      console.log(
        `[${new Date().toLocaleTimeString()}] ${req.url} -> prob=${probability.toFixed(2)} | prompt="${next.trim().slice(0, 50)}"`,
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      if (isOpenAiFormat) {
        res.end(
          JSON.stringify({
            id: `mock_${Date.now()}`,
            model: body.model || "mock-decision",
            answers: [{ name: "topic_shifted", type: "predicate", probability }],
          }),
        );
      } else {
        res.end(
          JSON.stringify({
            model: body.model || "mock-tev1",
            answers: { topic_shifted: { noul: probability } },
          }),
        );
      }
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock Decision Model Server listening on http://127.0.0.1:${port}`);
  console.log(`  System One (Ollama) endpoint: http://localhost:${port}/v1/systemone`);
  console.log(`  OpenAI Decisions endpoint:    http://localhost:${port}/v1/decisions`);
  console.log(`  Mode: ${mode} (pass --prob 0.92 or --prob 0.15 to force a probability)`);
});
