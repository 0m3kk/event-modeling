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
    },
    body: JSON.stringify(body),
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
