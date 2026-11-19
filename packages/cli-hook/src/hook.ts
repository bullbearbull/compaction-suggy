#!/usr/bin/env node
import {
  evaluateTopicShift,
  loadConfig,
  type UserPromptSubmitPayload,
} from "@topic-shift-compact/core";
import { formatHookOutput } from "./formatter.js";

async function readStdin(): Promise<string> {
  return await new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

async function main(): Promise<void> {
  const rawInput = await readStdin();
  if (!rawInput.trim()) {
    process.exit(0);
  }

  let payload: UserPromptSubmitPayload;
  try {
    payload = JSON.parse(rawInput) as UserPromptSubmitPayload;
  } catch {
    // Fail open on malformed stdin
    process.exit(0);
  }

  const config = loadConfig({ cwd: payload.cwd });
  const outcome = await evaluateTopicShift(payload, { config });

  if (config.debug) {
    const summary = {
      action: outcome.action,
      skipReason: outcome.skipReason,
      provider: outcome.decision?.provider,
      model: outcome.decision?.model,
      probability: outcome.decision?.probability,
      latencyMs: outcome.decision?.latencyMs,
      threshold: outcome.threshold,
      userTurnCount: outcome.userTurnCount,
      contextChars: outcome.contextChars,
      errorMessage: outcome.errorMessage,
    };
    process.stderr.write(`[topic-shift-compact] ${JSON.stringify(summary)}\n`);
  }

  const output = formatHookOutput(outcome, payload.prompt ?? "", config.language);
  if (output) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  if (process.env.TSC_DEBUG === "1" || process.env.TSC_DEBUG === "true") {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[topic-shift-compact] fatal fail-open: ${message}\n`);
  }
  process.exit(0);
});
