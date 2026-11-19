import type { DecisionInput } from "./types.js";

export const TOPIC_SHIFT_QUESTION_NAME = "topic_shifted";

export const TOPIC_SHIFT_INSTRUCTIONS =
  "Is the new user prompt shifting to a substantially different and unrelated task/topic from the previous conversation, such that compacting or clearing the prior conversation context before answering would be beneficial?";

export const TOPIC_SHIFT_CRITERIA = {
  true:
    "The new prompt starts an unrelated task, switches to a different subsystem/feature/domain, or asks an independent question that does not depend on the detailed back-and-forth of the previous conversation.",
  false:
    "The new prompt continues, refines, debugs, tests, reviews, asks follow-up questions about, or builds directly upon the previous conversation topic or artifacts.",
} as const;

export function buildSystemOneState(input: DecisionInput): Record<string, unknown> {
  const state: Record<string, unknown> = {
    previous_conversation: input.previousContext,
    new_user_prompt: input.newPrompt,
  };
  if (input.compactionSummary) {
    state.prior_summary = input.compactionSummary;
  }
  if (input.recentUserTopics.length > 0) {
    state.recent_user_prompts = input.recentUserTopics;
  }
  return state;
}

export function buildOpenAiDecisionInput(input: DecisionInput): string {
  const sections: string[] = [];
  if (input.compactionSummary) {
    sections.push(`## Prior Compacted Summary\n${input.compactionSummary}`);
  }
  sections.push(`## Recent Conversation Context\n${input.previousContext}`);
  sections.push(`## New User Prompt\n${input.newPrompt}`);
  return sections.join("\n\n");
}

export function buildOpenAiPredicateInstructions(): string {
  return [
    TOPIC_SHIFT_INSTRUCTIONS,
    `Answer TRUE when: ${TOPIC_SHIFT_CRITERIA.true}`,
    `Answer FALSE when: ${TOPIC_SHIFT_CRITERIA.false}`,
  ].join("\n");
}
