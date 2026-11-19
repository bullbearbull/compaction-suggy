export * from "./types.js";
export * from "./defaults.js";
export * from "./fast-path.js";
export * from "./prompt-builder.js";
export * from "./window.js";
export * from "./providers/index.js";

import { checkPromptFastPath } from "./fast-path.js";
import { resolveDecisionProvider } from "./providers/index.js";
import type {
  DecisionProvider,
  EvaluationOutcome,
  ParsedTranscript,
  TopicShiftConfig,
} from "./types.js";
import { buildSlidingWindowContext } from "./window.js";

export interface BrowserEvaluateOptions {
  config: TopicShiftConfig;
  provider?: DecisionProvider;
  fetchImpl?: typeof fetch;
}

/**
 * Browser-safe topic-shift evaluator (zero Node.js dependencies).
 * Shared by web extensions (ChatGPT Web, etc.) and any browser runtime.
 */
export async function evaluateTranscriptTopicShift(
  prompt: string,
  parsedTranscript: ParsedTranscript | undefined,
  options: BrowserEvaluateOptions,
): Promise<EvaluationOutcome> {
  const { config } = options;

  const fastPathSkip = checkPromptFastPath(prompt, config);
  if (fastPathSkip) {
    return {
      action: "allow",
      skipReason: fastPathSkip,
      threshold: config.threshold,
    };
  }

  if (!parsedTranscript) {
    return {
      action: "allow",
      skipReason: "no_transcript",
      threshold: config.threshold,
    };
  }

  if (parsedTranscript.userTurnCount < config.minTurns) {
    return {
      action: "allow",
      skipReason: "insufficient_turns",
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount,
    };
  }

  const window = buildSlidingWindowContext(
    parsedTranscript,
    config.maxWindowTurns,
    config.maxContextChars,
  );

  if (window.contextChars < config.minContextChars) {
    return {
      action: "allow",
      skipReason: "insufficient_context",
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount,
      contextChars: window.contextChars,
    };
  }

  const provider =
    options.provider ??
    resolveDecisionProvider(config, { fetchImpl: options.fetchImpl });

  if (!provider) {
    return {
      action: "allow",
      skipReason: "no_provider_configured",
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount,
      contextChars: window.contextChars,
    };
  }

  try {
    const decision = await provider.decide(
      {
        previousContext: window.previousContext,
        newPrompt: prompt.trim(),
        compactionSummary: parsedTranscript.compactionSummary,
        recentUserTopics: window.recentUserTopics,
      },
      config.timeoutMs,
    );

    if (decision.probability >= config.threshold) {
      return {
        action: config.mode === "block" ? "block" : "advisory",
        decision,
        threshold: config.threshold,
        userTurnCount: parsedTranscript.userTurnCount,
        contextChars: window.contextChars,
      };
    }

    return {
      action: "allow",
      decision,
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount,
      contextChars: window.contextChars,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      action: "allow",
      skipReason: "provider_error_fail_open",
      threshold: config.threshold,
      userTurnCount: parsedTranscript.userTurnCount,
      contextChars: window.contextChars,
      errorMessage: message,
    };
  }
}
