import type { AISettings } from "@/types";

// ============================================================================
// Constants
// ============================================================================

const AI_SETTINGS_KEY = "storm-app-ai-settings";

export const DEFAULT_AI_MAX_TOKENS = 8192;
export const MIN_AI_MAX_TOKENS = 256;
export const MAX_AI_MAX_TOKENS = 32768;

export function clampAIMaxTokens(value: unknown): number {
  const numeric =
    typeof value === "number" && Number.isFinite(value)
      ? Math.floor(value)
      : DEFAULT_AI_MAX_TOKENS;
  return Math.min(MAX_AI_MAX_TOKENS, Math.max(MIN_AI_MAX_TOKENS, numeric));
}

export const DEFAULT_AI_SETTINGS: Omit<AISettings, "apiKey"> = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  maxTokens: DEFAULT_AI_MAX_TOKENS,
};

// ============================================================================
// Settings Persistence
// ============================================================================

export function getStoredAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AISettings>;
      return {
        baseUrl: parsed.baseUrl || DEFAULT_AI_SETTINGS.baseUrl,
        model: parsed.model || DEFAULT_AI_SETTINGS.model,
        apiKey: parsed.apiKey ?? null,
        maxTokens: clampAIMaxTokens(parsed.maxTokens),
      };
    }
  } catch {
    /* ignore corrupted settings */
  }
  return {
    baseUrl: DEFAULT_AI_SETTINGS.baseUrl,
    model: DEFAULT_AI_SETTINGS.model,
    apiKey: null,
    maxTokens: DEFAULT_AI_SETTINGS.maxTokens,
  };
}

export function storeAISettings(settings: AISettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore storage errors */
  }
}

// ============================================================================
// Wire Types (OpenAI-compatible chat completions)
// ============================================================================

export interface OpenAIToolCall {
  id: string;
  type?: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionMessage {
  content: string;
  toolCalls: OpenAIToolCall[];
}

export class AIToolsUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIToolsUnsupportedError";
  }
}

export const ABORT_ERROR_NAME = "AbortError";

export function createAbortError(message = "AI run aborted"): Error {
  const error = new Error(message);
  error.name = ABORT_ERROR_NAME;
  return error;
}

// ============================================================================
// Transport
// ============================================================================

async function aiFetch(url: string, init: RequestInit): Promise<Response> {
  // If running inside Tauri desktop with plugin-http available, it can be dynamically imported:
  if (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  ) {
    try {
      // Dynamic import to avoid build errors if plugin is absent
      // @ts-expect-error Optional Tauri plugin may not be installed in web environment
      const tauriHttp = await import(/* @vite-ignore */ "@tauri-apps/plugin-http");
      if (tauriHttp && typeof tauriHttp.fetch === "function") {
        return tauriHttp.fetch(url, init);
      }
    } catch {
      // Fallback to standard fetch
    }
  }
  return fetch(url, init);
}

function buildHeaders(settings: AISettings, sessionId: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-opencode-session": sessionId,
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }
  return headers;
}

function endpoint(settings: AISettings): string {
  return `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function throwForStatus(status: number, url: string, errorBody: string): never {
  if (status === 401 || status === 403) {
    throw new Error(
      "Authentication failed. Please check your API key and base URL.",
    );
  }
  if (status === 429) {
    throw new Error("Rate limited. Please wait a moment and try again.");
  }
  if (status === 404) {
    throw new Error(
      `Endpoint not found: ${url}. Please check the base URL (it should include /v1 for most providers).`,
    );
  }
  if ((status === 400 || status === 422) && /tool|function/i.test(errorBody)) {
    throw new AIToolsUnsupportedError(
      `This model or endpoint does not support tool calling: ${errorBody || "unknown error"}`,
    );
  }
  throw new Error(`AI API error (${status}): ${errorBody || "unknown error"}`);
}

const MAX_COMPLETION_ATTEMPTS = 3;
const EMPTY_RETRY_DELAY_MS = 400;

interface RawResponseMessage {
  content?: unknown;
  tool_calls?: unknown;
  reasoning_content?: unknown;
}

interface RawChoice {
  message?: RawResponseMessage;
  finish_reason?: unknown;
}

interface ParsedCompletion {
  content: string;
  toolCalls: OpenAIToolCall[];
  finishReason?: string;
  reasoningOnly: boolean;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function parseCompletion(data: unknown): ParsedCompletion {
  const choice = (data as { choices?: RawChoice[] } | null)?.choices?.[0];
  const message = choice?.message;
  const content = typeof message?.content === "string" ? message.content : "";
  const toolCalls: OpenAIToolCall[] = Array.isArray(message?.tool_calls)
    ? message.tool_calls.filter(
        (call: unknown): call is OpenAIToolCall =>
          typeof call === "object" &&
          call !== null &&
          typeof (call as OpenAIToolCall).function?.name === "string",
      )
    : [];
  return {
    content,
    toolCalls,
    finishReason:
      typeof choice?.finish_reason === "string"
        ? choice.finish_reason
        : undefined,
    reasoningOnly:
      !content &&
      toolCalls.length === 0 &&
      typeof message?.reasoning_content === "string" &&
      message.reasoning_content.length > 0,
  };
}

function emptyResponseMessage(
  finishReason?: string,
  reasoningOnly = false,
): string {
  if (finishReason === "length") {
    return "The model ran out of output tokens before answering. Raise “Max output tokens” in the AI settings, or use a model with a larger output budget.";
  }
  if (finishReason === "content_filter") {
    return "The model blocked this response (content filter). Try rephrasing your request.";
  }
  if (reasoningOnly) {
    return "The model used its whole output budget on reasoning and produced no answer. Raise “Max output tokens” in the AI settings, or switch to a non-reasoning model.";
  }
  return "The AI returned an empty response. Please try again.";
}

export async function chatCompletion(
  settings: AISettings,
  messages: OpenAIMessage[],
  options: {
    sessionId: string;
    maxTokens: number;
    tools?: OpenAITool[];
    toolChoice?: "auto" | "none";
    signal?: AbortSignal;
  },
): Promise<ChatCompletionMessage> {
  const url = endpoint(settings);
  const body: Record<string, unknown> = {
    model: settings.model,
    max_tokens: options.maxTokens,
    messages,
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }

  let lastFinishReason: string | undefined;
  let lastReasoningOnly = false;

  for (let attempt = 0; attempt < MAX_COMPLETION_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await delay(EMPTY_RETRY_DELAY_MS * attempt, options.signal);
    }

    let response: Response;
    try {
      response = await aiFetch(url, {
        method: "POST",
        headers: buildHeaders(settings, options.sessionId),
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw createAbortError();
      throw error;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throwForStatus(response.status, url, errorBody);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      continue;
    }

    const parsed = parseCompletion(data);
    if (parsed.content || parsed.toolCalls.length > 0) {
      return { content: parsed.content, toolCalls: parsed.toolCalls };
    }

    lastFinishReason = parsed.finishReason;
    lastReasoningOnly = parsed.reasoningOnly;
    if (
      parsed.finishReason === "length" ||
      parsed.finishReason === "content_filter" ||
      parsed.reasoningOnly
    ) {
      break;
    }
  }

  throw new Error(emptyResponseMessage(lastFinishReason, lastReasoningOnly));
}

export function createSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
