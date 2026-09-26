import { nanoid } from "nanoid";
import type { AIChatMessage, AIConversation } from "@/types";

/** Starts a fresh, empty conversation (in-memory only). */
export function createEmptyConversation(): AIConversation {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
    summary: "",
    summarizedUpTo: 0,
    plan: [],
  };
}

/** Appends a message, returning a new conversation object. */
export function appendConversationMessage(
  conversation: AIConversation,
  message: AIChatMessage,
): AIConversation {
  return {
    ...conversation,
    messages: [...conversation.messages, message],
    updatedAt: new Date().toISOString(),
  };
}

export function createUserMessage(content: string): AIChatMessage {
  return {
    id: nanoid(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
    status: "complete",
  };
}

export function createAssistantMessage(
  content: string,
  extra: Partial<AIChatMessage> = {},
): AIChatMessage {
  return {
    id: nanoid(),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    status: "complete",
    ...extra,
  };
}

export function createToolMessage(
  call: { id: string; name: string },
  result: { content: string; isError?: boolean },
): AIChatMessage {
  return {
    id: nanoid(),
    role: "tool",
    content: result.content,
    createdAt: new Date().toISOString(),
    toolCallId: call.id,
    toolName: call.name,
    toolResults: [
      {
        toolCallId: call.id,
        name: call.name,
        content: result.content,
        isError: result.isError,
      },
    ],
    status: "complete",
  };
}

/** First user line, trimmed to a short conversation title. */
export function deriveConversationTitle(text: string): string {
  const firstLine = text.split("\n")[0]?.trim() ?? "New chat";
  return firstLine.length > 48 ? `${firstLine.slice(0, 45)}…` : firstLine;
}
