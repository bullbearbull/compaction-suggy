import {
  TOPIC_SHIFT_CRITERIA,
  TOPIC_SHIFT_INSTRUCTIONS,
  TOPIC_SHIFT_QUESTION_NAME,
  buildSystemOneState,
} from "../prompt-builder.js";
import type { DecisionInput, DecisionProvider, DecisionResult } from "../types.js";

export interface OpenRouterJevOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  referer?: string;
  title?: string;
  fetchImpl?: typeof fetch;
}

export function extractSystemOneNoulProbability(data: unknown): number {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid System One / OpenRouter Decisions response: expected JSON object");
  }
  const obj = data as Record<string, unknown>;
  const answers = obj.answers;

  if (answers && typeof answers === "object" && !Array.isArray(answers)) {
    const answerMap = answers as Record<string, unknown>;
    const entry =
      (answerMap[TOPIC_SHIFT_QUESTION_NAME] as Record<string, unknown> | undefined) ??
      (Object.values(answerMap)[0] as Record<string, unknown> | undefined);
    if (entry && typeof entry === "object") {
      if (typeof entry.noul === "number" && Number.isFinite(entry.noul)) {
        return Math.min(1, Math.max(0, entry.noul));
      }
      if (typeof entry.probability === "number" && Number.isFinite(entry.probability)) {
        return Math.min(1, Math.max(0, entry.probability));
      }
    }
  }

  throw new Error(
    `Unable to extract noul probability from response: ${JSON.stringify(data).slice(0, 300)}`,
  );
}

export class OpenRouterJevProvider implements DecisionProvider {
  readonly name = "openrouter" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly referer?: string;
  private readonly title?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenRouterJevOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl;
    this.referer = options.referer;
    this.title = options.title;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async decide(input: DecisionInput, timeoutMs: number): Promise<DecisionResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      };
      if (this.referer) headers["HTTP-Referer"] = this.referer;
      if (this.title) headers["X-Title"] = this.title;

      const body = {
        model: this.model,
        state: buildSystemOneState(input),
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

      const res = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(
          `OpenRouter Decisions API failed (${res.status}): ${errorText.slice(0, 300)}`,
        );
      }

      const data = (await res.json()) as unknown;
      const probability = extractSystemOneNoulProbability(data);

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
