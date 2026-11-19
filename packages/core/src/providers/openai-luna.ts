import {
  TOPIC_SHIFT_QUESTION_NAME,
  buildOpenAiDecisionInput,
  buildOpenAiPredicateInstructions,
} from "../prompt-builder.js";
import type { DecisionInput, DecisionProvider, DecisionResult } from "../types.js";

export interface OpenAiLunaOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function extractOpenAiPredicateProbability(data: unknown): number {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid OpenAI Decisions response: expected JSON object");
  }
  const obj = data as Record<string, unknown>;
  const answers = obj.answers;

  if (Array.isArray(answers)) {
    const matched =
      answers.find(
        (item) =>
          item &&
          typeof item === "object" &&
          (item as Record<string, unknown>).name === TOPIC_SHIFT_QUESTION_NAME,
      ) ?? answers[0];
    if (matched && typeof matched === "object") {
      const prob = (matched as Record<string, unknown>).probability;
      if (typeof prob === "number" && Number.isFinite(prob)) {
        return Math.min(1, Math.max(0, prob));
      }
    }
  }

  throw new Error(
    `Unable to extract predicate probability from OpenAI Decisions response: ${JSON.stringify(data).slice(0, 300)}`,
  );
}

export class OpenAiLunaProvider implements DecisionProvider {
  readonly name = "openai" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiLunaOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async decide(input: DecisionInput, timeoutMs: number): Promise<DecisionResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = {
        model: this.model,
        input: buildOpenAiDecisionInput(input),
        questions: [
          {
            type: "predicate",
            name: TOPIC_SHIFT_QUESTION_NAME,
            instructions: buildOpenAiPredicateInstructions(),
          },
        ],
      };

      const res = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(
          `OpenAI Decisions API failed (${res.status}): ${errorText.slice(0, 300)}`,
        );
      }

      const data = (await res.json()) as unknown;
      const probability = extractOpenAiPredicateProbability(data);

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
