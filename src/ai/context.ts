import type { AIChatMessage, AIConversation, AISettings } from "@/types";
import { chatCompletion, type OpenAIMessage } from "./client";

// ============================================================================
// Budgets
// ============================================================================

export const CONTEXT_BUDGET = 24000;
export const RECENT_CONTEXT_BUDGET = 12000;
const TOOL_ELIDE_AFTER_MESSAGES = 2;
const TOOL_ELIDE_KEEP_CHARS = 250;
const SUMMARY_INPUT_CHARS = 16000;

const SUPERSEDABLE_READ_TOOLS = new Set([
  "get_canvas_overview",
  "list_objects",
  "get_object",
  "search_objects",
]);

// ============================================================================
// Token estimation
// ============================================================================

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function messageTokens(message: AIChatMessage): number {
  let total = estimateTokens(message.content ?? "");
  if (message.toolCalls) {
    total += estimateTokens(JSON.stringify(message.toolCalls));
  }
  return total;
}

export function estimateConversationTokens(
  conversation: AIConversation,
): number {
  return conversation.messages.reduce((sum, m) => sum + messageTokens(m), 0);
}

// ============================================================================
// Transcript → model messages
// ============================================================================

function toolContentForModel(
  message: AIChatMessage,
  mode: "full" | "elide" | "superseded",
): string {
  const content = message.toolResults?.[0]?.content ?? message.content ?? "";
  if (mode === "superseded") {
    return "(superseded by a later read of the same data — use the newer result)";
  }
  if (mode === "elide" && content.length > TOOL_ELIDE_KEEP_CHARS) {
    return `${content.slice(0, TOOL_ELIDE_KEEP_CHARS)}…(elided)`;
  }
  return content;
}

function readCallKey(
  message: AIChatMessage,
  argsByCallId: Map<string, string>,
): string | null {
  if (!message.toolName || !SUPERSEDABLE_READ_TOOLS.has(message.toolName)) {
    return null;
  }
  const args = message.toolCallId
    ? (argsByCallId.get(message.toolCallId) ?? "")
    : "";
  return `${message.toolName}:${args}`;
}

export function toModelMessages(
  conversation: AIConversation,
  systemPrompt: string,
): OpenAIMessage[] {
  const systemContent = conversation.summary
    ? `${systemPrompt}\n\n## Progress notes from earlier turns\n${conversation.summary}`
    : systemPrompt;

  const messages: OpenAIMessage[] = [
    { role: "system", content: systemContent },
  ];

  const transcript = conversation.messages.slice(conversation.summarizedUpTo);
  const elideBefore = transcript.length - TOOL_ELIDE_AFTER_MESSAGES;

  const argsByCallId = new Map<string, string>();
  for (const message of transcript) {
    if (message.role === "assistant" && message.toolCalls) {
      for (const call of message.toolCalls) {
        argsByCallId.set(call.id, call.arguments);
      }
    }
  }

  const lastReadIndex = new Map<string, number>();
  transcript.forEach((message, index) => {
    if (message.role !== "tool") return;
    const key = readCallKey(message, argsByCallId);
    if (key) lastReadIndex.set(key, index);
  });

  transcript.forEach((message, index) => {
    if (message.role === "user") {
      messages.push({ role: "user", content: message.content });
      return;
    }
    if (message.role === "assistant") {
      messages.push({
        role: "assistant",
        content: message.content || null,
        ...(message.toolCalls && message.toolCalls.length > 0
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: {
                  name: call.name,
                  arguments: call.arguments,
                },
              })),
            }
          : {}),
      });
      return;
    }
    // tool
    const key = readCallKey(message, argsByCallId);
    const mode =
      key !== null && lastReadIndex.get(key) !== index
        ? "superseded"
        : index < elideBefore
          ? "elide"
          : "full";
    messages.push({
      role: "tool",
      tool_call_id: message.toolCallId,
      content: toolContentForModel(message, mode),
    });
  });

  return messages;
}

// ============================================================================
// Compaction
// ============================================================================

export function findCompactionCut(conversation: AIConversation): number | null {
  if (estimateConversationTokens(conversation) <= CONTEXT_BUDGET) {
    return null;
  }

  const { messages } = conversation;
  let accumulated = 0;
  let cut = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    accumulated += messageTokens(messages[i]!);
    if (accumulated > RECENT_CONTEXT_BUDGET) {
      cut = i + 1;
      break;
    }
  }

  while (cut < messages.length && messages[cut]!.role !== "user") {
    cut += 1;
  }
  if (cut <= conversation.summarizedUpTo) return null;
  return cut;
}

function renderForSummary(messages: AIChatMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      lines.push(`USER: ${message.content}`);
    } else if (message.role === "assistant") {
      const tools = message.toolCalls?.map((c) => c.name).join(", ");
      lines.push(
        `ASSISTANT: ${message.content || "(no text)"}${tools ? ` [called: ${tools}]` : ""}`,
      );
    } else {
      const content = message.toolResults?.[0]?.content ?? message.content;
      lines.push(`TOOL(${message.toolName ?? "?"}): ${content.slice(0, 300)}`);
    }
  }
  const text = lines.join("\n");
  return text.length > SUMMARY_INPUT_CHARS
    ? text.slice(text.length - SUMMARY_INPUT_CHARS)
    : text;
}

const SUMMARY_SYSTEM_PROMPT = `You maintain progress notes for an event-storming and data modeling canvas assistant session.
Rewrite the notes to fold in the new transcript. Preserve, in a compact form:
- object ids and names that were created, edited, or referenced (so later turns can act on them)
- decisions made and constraints the user stated
- open tasks and anything left incomplete
Drop chit-chat and redundant tool output. Respond with the notes only — no preamble, no markdown headings.`;

export async function summarizeConversation(
  settings: AISettings,
  existingSummary: string,
  messages: AIChatMessage[],
  sessionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const userContent = `Existing notes:\n${existingSummary || "(none yet)"}\n\nNew transcript to fold in:\n${renderForSummary(messages)}`;
  const result = await chatCompletion(
    settings,
    [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    { sessionId, maxTokens: 1024, signal },
  );
  return result.content.trim();
}
