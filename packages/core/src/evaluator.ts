import { BypassCache } from "./bypass-cache.js";
import { checkPromptFastPath } from "./fast-path.js";
import { resolveDecisionProvider } from "./providers/index.js";
import {
  buildSlidingWindowContext,
  readTranscriptFile,
} from "./transcript.js";
import type {
  DecisionProvider,
  EvaluationOutcome,
  ParsedTranscript,
  TopicShiftConfig,
  UserPromptSubmitPayload,
} from "./types.js";

export interface EvaluateOptions {
  config: TopicShiftConfig;
  /** Optional explicit provider override (primarily for testing). */
  provider?: DecisionProvider;
  /** Optional pre-parsed transcript override (e.g., for browser extensions or tests). */
  transcript?: ParsedTranscript;
  /** Optional custom fetch implementation. */
  fetchImpl?: typeof fetch;
  /** Optional timestamp override for deterministic bypass cache testing. */
  now?: number;
}

export async function evaluateTopicShift(
  payload: UserPromptSubmitPayload,
  options: EvaluateOptions,
): Promise<EvaluationOutcome> {
  const { config } = options;
  const prompt = payload.prompt ?? "";

  // 1. Zero-latency fast-path checks (disabled, slash commands, short acks, override prefix)
  const fastPathSkip = checkPromptFastPath(prompt, config);
  if (fastPathSkip) {
    return {
      action: "allow",
      skipReason: fastPathSkip,
      threshold: config.threshold,
    };
  }

  // 2. Check one-shot bypass cache before doing any transcript I/O or network call
  const bypassCache = config.bypassCachePath
    ? new BypassCache(config.bypassCachePath, config.bypassTtlSeconds)
    : undefined;

  if (
    config.mode === "block" &&
    bypassCache?.consumeIfBypassed(payload.session_id, prompt, options.now)
  ) {
    return {
      action: "allow",
      skipReason: "bypass_cache_hit",
      threshold: config.threshold,
    };
  }

  // 3. Load and parse transcript (after latest compaction boundary)
  const parsedTranscript =
    options.transcript ??
    (payload.transcript_path
      ? readTranscriptFile(payload.transcript_path, prompt)
      : undefined);

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

  // 4. Resolve configured Decision Model provider
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

  // 5. Call Decision API with fail-open safety
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
      if (config.mode === "block") {
        bypassCache?.recordBlockedPrompt(
          payload.session_id,
          prompt,
          decision.probability,
          options.now,
        );
        return {
          action: "block",
          decision,
          threshold: config.threshold,
          userTurnCount: parsedTranscript.userTurnCount,
          contextChars: window.contextChars,
        };
      }

      return {
        action: "advisory",
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
