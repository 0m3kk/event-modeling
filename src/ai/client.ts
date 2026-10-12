export interface AISettings {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  maxTokens: number;
  maxTurns: number;
}

const AI_SETTINGS_STORAGE_KEY = "event_modeling_ai_settings_v2";

export const DEFAULT_AI_SETTINGS: AISettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: null,
  model: "gpt-4o-mini",
  maxTokens: 4096,
  maxTurns: 5,
};

export function getStoredAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        baseUrl: parsed.baseUrl || DEFAULT_AI_SETTINGS.baseUrl,
        apiKey: parsed.apiKey || null,
        model: parsed.model || DEFAULT_AI_SETTINGS.model,
        maxTokens: parsed.maxTokens || DEFAULT_AI_SETTINGS.maxTokens,
        maxTurns: parsed.maxTurns || DEFAULT_AI_SETTINGS.maxTurns,
      };
    }
  } catch {
    // Ignore error
  }
  return DEFAULT_AI_SETTINGS;
}

export function storeAISettings(settings: AISettings) {
  try {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore error
  }
}

/**
 * Generates a session id sent as the `x-opencode-session` header.
 *
 * The opencode AI gateway requires this header on every request to group a
 * conversation together, so we fall back to a UUID v4 when `crypto.randomUUID`
 * is unavailable (older browsers / non-secure contexts).
 */
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

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  toolName?: string;
  toolCallId?: string;
}

export async function sendChatMessage(
  settings: AISettings,
  messages: Array<{ role: string; content: string; tool_calls?: any; tool_call_id?: string }>,
  tools: any[],
  sessionId: string,
  signal?: AbortSignal,
): Promise<{
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: any }>;
}> {
  if (!settings.apiKey) {
    throw new Error("Vui lòng nhập OpenAI API Key trong phần Cài đặt AI trước khi bắt đầu.");
  }

  const endpoint = `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body: Record<string, any> = {
    model: settings.model,
    messages,
    max_tokens: settings.maxTokens,
  };

  if (tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      // Required by the opencode AI gateway to group requests into a session.
      "x-opencode-session": sessionId,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const msg = choice?.message;

  const toolCalls: Array<{ id: string; name: string; arguments: any }> = [];
  if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
      } catch {
        // ignore
      }
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        arguments: parsedArgs,
      });
    }
  }

  return {
    content: msg?.content || "",
    toolCalls,
  };
}
