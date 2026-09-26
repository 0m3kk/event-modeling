import { nanoid } from "nanoid";
import type {
  AIChatMessage,
  AIConversation,
  AIPlanStep,
  AISettings,
} from "@/types";
import type { CanvasStore } from "@/store/types";
import {
  ABORT_ERROR_NAME,
  AIToolsUnsupportedError,
  chatCompletion,
  createAbortError,
  createSessionId,
  DEFAULT_AI_MAX_TOKENS,
  type OpenAIMessage,
} from "./client";
import {
  findCompactionCut,
  summarizeConversation,
  toModelMessages,
} from "./context";
import { AGENT_FALLBACK_PROMPT, AGENT_SYSTEM_PROMPT } from "./prompt";
import {
  allTools,
  buildToolRegistry,
  executeToolCall,
  type AIToolContext,
  type AIToolDefinition,
} from "./tools";
import { toOpenAITools } from "./tools/schema";
import {
  appendConversationMessage,
  createAssistantMessage,
  createToolMessage,
} from "./conversation";

export const MAX_AGENT_ITERATIONS = 25;

export interface AgentCallbacks {
  onMessage: (message: AIChatMessage) => void;
  onPlan: (plan: AIPlanStep[]) => void;
  onSummary: (summary: string, summarizedUpTo: number) => void;
}

export interface RunAgentOptions {
  getState: () => CanvasStore;
  signal: AbortSignal;
  callbacks: AgentCallbacks;
  tools?: AIToolDefinition[];
  sessionId?: string;
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === ABORT_ERROR_NAME
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError();
  }
}

export async function runAgent(
  conversation: AIConversation,
  settings: AISettings,
  options: RunAgentOptions,
): Promise<void> {
  const { getState, signal, callbacks } = options;
  const tools = options.tools ?? allTools;
  const sessionId = options.sessionId ?? createSessionId();
  const registry = buildToolRegistry(tools);

  let working = conversation;

  // Compaction
  const cut = findCompactionCut(working);
  if (cut !== null) {
    try {
      const summary = await summarizeConversation(
        settings,
        working.summary,
        working.messages.slice(0, cut),
        sessionId,
        signal,
      );
      working = { ...working, summary, summarizedUpTo: cut };
      callbacks.onSummary(summary, cut);
    } catch (error) {
      if (isAbortError(error)) throw error;
    }
  }

  const ctx: AIToolContext = {
    getState,
    getPlan: () => working.plan,
    setPlan: (plan) => {
      working = { ...working, plan };
      callbacks.onPlan(plan);
    },
  };

  const emit = (message: AIChatMessage) => {
    working = appendConversationMessage(working, message);
    callbacks.onMessage(message);
  };

  let emitted = 0;
  const emitCounted = (message: AIChatMessage) => {
    emitted += 1;
    emit(message);
  };

  try {
    await runToolLoop({
      working,
      settings,
      sessionId,
      tools,
      registry,
      ctx,
      signal,
      emit: emitCounted,
    });
  } catch (error) {
    if (error instanceof AIToolsUnsupportedError && emitted === 0) {
      await runFallbackLoop({
        working,
        settings,
        sessionId,
        registry,
        ctx,
        signal,
        emit: emitCounted,
      });
      return;
    }
    throw error;
  }
}

interface LoopArgs {
  working: AIConversation;
  settings: AISettings;
  sessionId: string;
  registry: Map<string, AIToolDefinition>;
  ctx: AIToolContext;
  signal: AbortSignal;
  emit: (message: AIChatMessage) => void;
}

async function runToolLoop({
  working,
  settings,
  sessionId,
  tools,
  registry,
  ctx,
  signal,
  emit,
}: LoopArgs & { tools: AIToolDefinition[] }): Promise<void> {
  const messages = toModelMessages(working, AGENT_SYSTEM_PROMPT);
  const openAITools = toOpenAITools(tools);

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    throwIfAborted(signal);
    const assistant = await chatCompletion(settings, messages, {
      sessionId,
      maxTokens: settings.maxTokens ?? DEFAULT_AI_MAX_TOKENS,
      tools: openAITools,
      signal,
    });
    throwIfAborted(signal);

    if (assistant.toolCalls.length === 0) {
      emit(createAssistantMessage(assistant.content));
      return;
    }

    const toolCalls = assistant.toolCalls.map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    }));

    emit(
      createAssistantMessage(assistant.content, {
        toolCalls,
        toolNames: toolCalls.map((call) => call.name),
      }),
    );
    messages.push({
      role: "assistant",
      content: assistant.content || null,
      tool_calls: assistant.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: {
          name: call.function.name,
          arguments: call.function.arguments,
        },
      })),
    });

    for (const call of toolCalls) {
      throwIfAborted(signal);
      const result = await executeToolCall(call, ctx, registry);
      emit(createToolMessage(call, result));
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.content,
      });
    }
  }

  emit(
    createAssistantMessage(
      "I've reached the step limit for this turn. Tell me how you'd like to continue, or ask me to keep going.",
    ),
  );
}

interface FallbackPlan {
  reply: string;
  actions: Array<{ tool: string; args?: unknown }>;
}

function parseFallbackPlan(content: string): FallbackPlan | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<FallbackPlan>;
    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : "",
      actions: actions.filter(
        (action): action is { tool: string; args?: unknown } =>
          typeof action === "object" &&
          action !== null &&
          typeof (action as { tool?: unknown }).tool === "string",
      ),
    };
  } catch {
    return null;
  }
}

function buildFallbackMessages(conversation: AIConversation): OpenAIMessage[] {
  const system = `${AGENT_FALLBACK_PROMPT}\n\n## Progress notes\n${conversation.summary || "(none yet)"}`;
  const messages: OpenAIMessage[] = [{ role: "system", content: system }];
  for (const message of conversation.messages.slice(
    conversation.summarizedUpTo,
  )) {
    if (message.role === "user") {
      messages.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      messages.push({
        role: "assistant",
        content: message.content || "(actions taken)",
      });
    } else {
      messages.push({
        role: "user",
        content: `Observation (${message.toolName ?? "tool"}): ${message.toolResults?.[0]?.content ?? ""}`,
      });
    }
  }
  return messages;
}

async function runFallbackLoop({
  working,
  settings,
  sessionId,
  registry,
  ctx,
  signal,
  emit,
}: LoopArgs): Promise<void> {
  const messages = buildFallbackMessages(working);

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    throwIfAborted(signal);
    const result = await chatCompletion(settings, messages, {
      sessionId,
      maxTokens: settings.maxTokens ?? DEFAULT_AI_MAX_TOKENS,
      signal,
    });
    throwIfAborted(signal);

    const plan = parseFallbackPlan(result.content);
    if (!plan || plan.actions.length === 0) {
      emit(createAssistantMessage(plan?.reply || result.content));
      return;
    }

    const calls = plan.actions.map((action) => ({
      id: nanoid(),
      name: action.tool,
      arguments: action.args ? JSON.stringify(action.args) : "{}",
    }));

    emit(
      createAssistantMessage(plan.reply, {
        toolCalls: calls,
        toolNames: calls.map((call) => call.name),
      }),
    );
    messages.push({
      role: "assistant",
      content: plan.reply || "(actions taken)",
    });

    for (const call of calls) {
      throwIfAborted(signal);
      const toolResult = await executeToolCall(call, ctx, registry);
      emit(createToolMessage(call, toolResult));
      messages.push({
        role: "user",
        content: `Observation (${call.name}): ${toolResult.content}`,
      });
    }
  }

  emit(
    createAssistantMessage(
      "I've reached the step limit for this turn. Tell me how you'd like to continue, or ask me to keep going.",
    ),
  );
}
