import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AIToolsUnsupportedError,
  chatCompletion,
  clampAIMaxTokens,
  createAbortError,
  createSessionId,
  DEFAULT_AI_MAX_TOKENS,
  MAX_AI_MAX_TOKENS,
  MIN_AI_MAX_TOKENS,
  getStoredAISettings,
  storeAISettings,
  type OpenAITool,
} from "./client";

const SETTINGS = {
  baseUrl: "https://gateway.test/v1",
  model: "test-model",
  apiKey: "test-key",
  maxTokens: 4096,
};

const TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "get_canvas_overview",
    description: "Read the canvas",
    parameters: { type: "object", properties: {} },
  },
};

function okResponse(message: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message }] }),
  };
}

function choiceResponse(choice: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [choice] }),
  };
}

function errorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
  };
}

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, val: string) {
    this.map.set(key, val);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

describe("client helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });
  it("clamps token budget within bounds", () => {
    expect(clampAIMaxTokens(100)).toBe(MIN_AI_MAX_TOKENS);
    expect(clampAIMaxTokens(50000)).toBe(MAX_AI_MAX_TOKENS);
    expect(clampAIMaxTokens("invalid")).toBe(DEFAULT_AI_MAX_TOKENS);
    expect(clampAIMaxTokens(4000.8)).toBe(4000);
  });

  it("creates valid session IDs", () => {
    const id = createSessionId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(10);
  });

  it("creates AbortError with proper name", () => {
    const err = createAbortError("Stopped by user");
    expect(err.name).toBe("AbortError");
    expect(err.message).toBe("Stopped by user");
  });

  it("stores and retrieves settings from localStorage", () => {
    storeAISettings({
      apiKey: "custom-key",
      baseUrl: "https://my-api.com",
      model: "custom-model",
      maxTokens: 2048,
    });
    const retrieved = getStoredAISettings();
    expect(retrieved.apiKey).toBe("custom-key");
    expect(retrieved.model).toBe("custom-model");
  });
});

describe("chatCompletion transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls fetch with correct headers and payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ content: "hello" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatCompletion(
      SETTINGS,
      [{ role: "user", content: "hi" }],
      { sessionId: "session-1", maxTokens: 100, tools: [TOOL] },
    );

    expect(result.content).toBe("hello");
    expect(result.toolCalls).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gateway.test/v1/chat/completions");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["x-opencode-session"]).toBe("session-1");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test-model");
    expect(body.max_tokens).toBe(100);
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe("auto");
  });

  it("parses tool calls from assistant message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        content: null,
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "get_canvas_overview", arguments: "{}" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatCompletion(
      SETTINGS,
      [{ role: "user", content: "read" }],
      { sessionId: "s", maxTokens: 100, tools: [TOOL] },
    );

    expect(result.content).toBe("");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.id).toBe("call-1");
    expect(result.toolCalls[0]!.function.name).toBe("get_canvas_overview");
  });

  it("throws AIToolsUnsupportedError when endpoint rejects tools", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        errorResponse(400, "Unknown parameter: 'tools' is not supported"),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chatCompletion(SETTINGS, [{ role: "user", content: "hi" }], {
        sessionId: "s",
        maxTokens: 100,
        tools: [TOOL],
      }),
    ).rejects.toThrow(AIToolsUnsupportedError);
  });

  it("identifies reasoning-only output when model uses budget on thinking", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      choiceResponse({
        message: { content: "", reasoning_content: "thinking deeply..." },
        finish_reason: "stop",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chatCompletion(SETTINGS, [{ role: "user", content: "hi" }], {
        sessionId: "s",
        maxTokens: 100,
      }),
    ).rejects.toThrow(/reasoning/);
  });
});
