import { describe, expect, it } from "vitest";
import type { AIChatMessage, AIConversation } from "@/types";
import {
  CONTEXT_BUDGET,
  estimateConversationTokens,
  estimateTokens,
  findCompactionCut,
  toModelMessages,
} from "./context";

function createConversation(
  messages: Partial<AIChatMessage>[],
  extra: Partial<AIConversation> = {},
): AIConversation {
  return {
    id: "conv-1",
    title: "Test",
    createdAt: "",
    updatedAt: "",
    messages: messages.map((m, i) => ({
      id: `m-${i}`,
      role: m.role ?? "user",
      content: m.content ?? "",
      createdAt: "",
      ...m,
    })),
    summary: extra.summary ?? "",
    summarizedUpTo: extra.summarizedUpTo ?? 0,
    plan: [],
    ...extra,
  };
}

describe("token estimation", () => {
  it("estimates tokens by 4-char rule", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("sums message and tool call tokens", () => {
    const conv = createConversation([
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "hi",
        toolCalls: [{ id: "c1", name: "list_objects", arguments: "{}" }],
      },
    ]);
    expect(estimateConversationTokens(conv)).toBeGreaterThan(5);
  });
});

describe("toModelMessages", () => {
  it("includes system prompt and summary", () => {
    const conv = createConversation(
      [{ role: "user", content: "Hello" }],
      { summary: "Earlier we built an OrderPlaced event." },
    );
    const msgs = toModelMessages(conv, "SYSTEM");
    expect(msgs[0]?.role).toBe("system");
    expect(msgs[0]?.content).toContain("SYSTEM");
    expect(msgs[0]?.content).toContain("Earlier we built an OrderPlaced event.");
    expect(msgs[1]?.role).toBe("user");
    expect(msgs[1]?.content).toBe("Hello");
  });

  it("supersedes older identical read tool calls", () => {
    const conv = createConversation([
      { role: "user", content: "read" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "get_canvas_overview", arguments: "{}" }],
      },
      {
        role: "tool",
        toolCallId: "c1",
        toolName: "get_canvas_overview",
        content: JSON.stringify({ count: 1 }),
      },
      { role: "user", content: "read again" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c2", name: "get_canvas_overview", arguments: "{}" }],
      },
      {
        role: "tool",
        toolCallId: "c2",
        toolName: "get_canvas_overview",
        content: JSON.stringify({ count: 2 }),
      },
    ]);

    const msgs = toModelMessages(conv, "SYS");
    const firstTool = msgs.find((m) => m.tool_call_id === "c1");
    const secondTool = msgs.find((m) => m.tool_call_id === "c2");

    expect(firstTool?.content).toContain("superseded");
    expect(secondTool?.content).toBe(JSON.stringify({ count: 2 }));
  });
});

describe("findCompactionCut", () => {
  it("returns null when conversation is under budget", () => {
    const conv = createConversation([{ role: "user", content: "short" }]);
    expect(findCompactionCut(conv)).toBeNull();
  });

  it("finds a cut point at user turn boundary when over budget", () => {
    const bigContent = "x".repeat(CONTEXT_BUDGET * 4 + 1000);
    const conv = createConversation([
      { role: "user", content: bigContent },
      { role: "assistant", content: "ok" },
      { role: "user", content: "next message" },
      { role: "assistant", content: "done" },
    ]);
    const cut = findCompactionCut(conv);
    expect(cut).not.toBeNull();
    expect(conv.messages[cut!]?.role).toBe("user");
  });
});
