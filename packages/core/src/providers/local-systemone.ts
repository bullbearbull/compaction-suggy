import {
  TOPIC_SHIFT_CRITERIA,
  TOPIC_SHIFT_INSTRUCTIONS,
  TOPIC_SHIFT_QUESTION_NAME,
  buildOpenAiDecisionInput,
  buildOpenAiPredicateInstructions,
  buildSystemOneState,
} from "../prompt-builder.js";
import type {
  DecisionInput,
  DecisionProvider,
  DecisionResult,
  LocalApiFormat,
} from "../types.js";
import { extractOpenAiPredicateProbability } from "./openai-luna.js";
import { extractSystemOneNoulProbability } from "./openrouter-jev.js";

export interface LocalDecisionOptions {
  url: string;
  model: string;
  apiFormat: LocalApiFormat;
  apiKey?: string;
  keepAlive?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Supports locally served Decision Models:
 * - Ollama v0.35+ (`/v1/systemone` with models like `tev1`, `nimble`) via `apiFormat: "systemone"`
 * - vLLM Semantic Router / LiteLLM / LocalAI (`/v1/decisions` with `d3`, `d3-mini`, etc.) via `apiFormat: "openai-decisions"`
 */
export class LocalDecisionProvider implements DecisionProvider {
  readonly name = "local" as const;
  readonly model: string;
  private readonly url: string;
  private readonly apiFormat: LocalApiFormat;
  private readonly apiKey?: string;
  private readonly keepAlive?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LocalDecisionOptions) {
    this.url = options.url;
    this.model = options.model;
    this.apiFormat = options.apiFormat;
    this.apiKey = options.apiKey;
    this.keepAlive = options.keepAlive;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async decide(input: DecisionInput, timeoutMs: number): Promise<DecisionResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const body =
        this.apiFormat === "openai-decisions"
          ? {
              model: this.model,
              input: buildOpenAiDecisionInput(input),
              questions: [
                {
                  type: "predicate",
                  name: TOPIC_SHIFT_QUESTION_NAME,
                  instructions: buildOpenAiPredicateInstructions(),
                },
              ],
            }
          : {
              model: this.model,
              state: buildSystemOneState(input),
              ...(this.keepAlive ? { keep_alive: this.keepAlive } : {}),
              questions: {
                [TOPIC_SHIFT_QUESTION_NAME]: {
                  type: "noul",
                  instructions: TOPIC_SHIFT_INSTRUCTIONS,
                  criteria: {
                    true: TOPIC_SHIFT_CRITERIA.true,
                    false: TOPIC_SHIFT_CRITERIA.false,
                  },
                },
              },
            };

      const res = await this.fetchImpl(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(
          `Local Decision API (${this.url}) failed (${res.status}): ${errorText.slice(0, 300)}`,
        );
      }

      const data = (await res.json()) as unknown;
      const probability =
        this.apiFormat === "openai-decisions"
          ? extractOpenAiPredicateProbability(data)
          : extractSystemOneNoulProbability(data);

      return {
        provider: this.name,
        model: this.model,
        probability,
        latencyMs: Date.now() - startedAt,
        raw: data,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
