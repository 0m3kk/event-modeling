/**
 * AI Assistant types for multi-turn canvas agent
 */

export type AIChatRole = "user" | "assistant" | "system" | "tool";

export type AIChatStatus = "complete" | "running" | "error" | "stopped";

export type AIPlanStepStatus = "pending" | "in_progress" | "done";

export interface AIPlanStep {
  id: string;
  text: string;
  status: AIPlanStepStatus;
}

export interface AIToolCall {
  id: string;
  name: string;
  /** Raw JSON argument string returned by the model. */
  arguments: string;
}

export interface AIToolResult {
  toolCallId: string;
  name: string;
  /** JSON payload or error envelope. */
  content: string;
  isError?: boolean;
}

export interface AIChatMessage {
  id: string;
  role: AIChatRole;
  content: string;
  createdAt: string;
  toolCalls?: AIToolCall[];
  toolResults?: AIToolResult[];
  toolCallId?: string;
  toolName?: string;
  toolNames?: string[];
  status?: AIChatStatus;
  error?: string;
}

export interface AIConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AIChatMessage[];
  /** Rolling summary from auto-compaction. */
  summary: string;
  summarizedUpTo: number;
  plan: AIPlanStep[];
}

export interface AISettings {
  apiKey: string | null;
  baseUrl: string;
  model: string;
  maxTokens: number;
}

export interface AISliceState {
  aiSettings: AISettings;
  aiConversation: AIConversation;
  aiRunning: boolean;
  aiError: string | null;
  /** Count of completed turns. */
  aiUsageCount: number;
}

export interface AISliceActions {
  setAISettings: (settings: Partial<AISettings>) => void;
  sendAIMessage: (text: string) => Promise<void>;
  stopAI: () => void;
  newAIConversation: () => void;
  clearAIError: () => void;
}
