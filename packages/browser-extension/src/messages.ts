import type {
  DecisionResult,
  EvaluationOutcome,
  PartialTopicShiftConfig,
  TranscriptTurn,
  TopicShiftConfig,
} from "@topic-shift-compact/core/browser";
import type { SiteId } from "./adapters/types.js";

export interface SiteToggleConfig {
  chatgpt: boolean;
  claude: boolean;
}

export interface ExtensionConfig extends TopicShiftConfig {
  /** Per-site activation switches. Default: both true */
  sites: SiteToggleConfig;
  /** Automatically submit the prompt after moving it into a New Chat. Default: false */
  autoSendOnNewChat: boolean;
  /** Show a subtle floating indicator while checking topic shift. Default: true */
  showCheckingPill: boolean;
  /** Show a subtle toast with probability & latency even when allowed. Default: false */
  showDebugToast: boolean;
}

export type PartialExtensionConfig = PartialTopicShiftConfig & {
  sites?: Partial<SiteToggleConfig>;
  autoSendOnNewChat?: boolean;
  showCheckingPill?: boolean;
  showDebugToast?: boolean;
};

export interface LastEvaluationRecord {
  timestamp: number;
  site: SiteId;
  conversationId: string;
  promptPreview: string;
  outcome: EvaluationOutcome;
  userDecision?: "new_chat" | "compact_handoff" | "send_here" | "cancelled";
}

export interface PendingHandoff {
  site: SiteId;
  prompt: string;
  autoSend: boolean;
  mode: "clean" | "compact";
  sourceConversationId: string;
  createdAt: number;
  expiresAt: number;
}

export interface EvaluateRequestMessage {
  type: "EVALUATE_TOPIC_SHIFT";
  site: SiteId;
  conversationId: string;
  prompt: string;
  turns: TranscriptTurn[];
}

export interface TestProviderMessage {
  type: "TEST_PROVIDER";
  configOverride?: PartialExtensionConfig;
}

export interface RecordUserActionMessage {
  type: "RECORD_USER_ACTION";
  decision: "new_chat" | "compact_handoff" | "send_here" | "cancelled";
}

export interface RecordSkipMessage {
  type: "RECORD_SKIP";
  site: SiteId;
  conversationId: string;
  promptPreview: string;
  outcome: EvaluationOutcome;
}

export interface GetTabStatusMessage {
  type: "GET_TAB_STATUS";
}

export type ExtensionMessage =
  | EvaluateRequestMessage
  | TestProviderMessage
  | RecordUserActionMessage
  | RecordSkipMessage
  | GetTabStatusMessage;

export interface EvaluateResponse {
  ok: boolean;
  outcome?: EvaluationOutcome;
  error?: string;
}

export interface TestProviderResponse {
  ok: boolean;
  decision?: DecisionResult;
  error?: string;
}

export interface TabStatusResponse {
  supported: boolean;
  site?: SiteId;
  siteName?: string;
  siteEnabled?: boolean;
  conversationId?: string;
  userTurnCount?: number;
  totalTurns?: number;
  composerFound?: boolean;
}
