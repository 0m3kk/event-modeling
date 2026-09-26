import { describe, expect, it, vi } from "vitest";
import type { AIChatMessage, AIPlanStep, CanvasObject } from "@/types";
import type { CanvasStore } from "@/store/types";
import { runAgent } from "./agent";
import { createEmptyConversation, createUserMessage } from "./conversation";
import * as clientModule from "./client";

function createFakeStore() {
  const objects: CanvasObject[] = [];
  const store = {
    objects,
    groups: [],
    selectedIds: [],
    viewport: { x: 0, y: 0, zoom: 1, screenWidth: 1000, screenHeight: 800 },
    addObject: (o: CanvasObject) => objects.push(o),
    addObjects: (objs: CanvasObject[]) => objects.push(...objs),
  } as unknown as CanvasStore;
  return { store, objects };
}

describe("runAgent", () => {
  it("runs tool loop and emits messages", async () => {
    const fake = createFakeStore();
    const conv = createEmptyConversation();
    conv.messages.push(createUserMessage("Create an event card OrderPlaced"));

    const chatSpy = vi.spyOn(clientModule, "chatCompletion");

    // First completion: model calls create_storm_cards
    chatSpy.mockResolvedValueOnce({
      content: "",
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "create_storm_cards",
            arguments: JSON.stringify({
              cards: [{ kind: "event", name: "Order Placed" }],
            }),
          },
        },
      ],
    });

    // Second completion: model answers with summary
    chatSpy.mockResolvedValueOnce({
      content: "Created the Order Placed event card for you.",
      toolCalls: [],
    });

    const emittedMessages: AIChatMessage[] = [];
    let updatedPlan: AIPlanStep[] = [];

    await runAgent(
      conv,
      {
        apiKey: "test",
        baseUrl: "https://test.com",
        model: "test-model",
        maxTokens: 1000,
      },
      {
        getState: () => fake.store,
        signal: new AbortController().signal,
        callbacks: {
          onMessage: (msg) => emittedMessages.push(msg),
          onPlan: (plan) => {
            updatedPlan = plan;
          },
          onSummary: () => {},
        },
      },
    );

    expect(emittedMessages).toHaveLength(3);
    // 1. Assistant message with tool call
    expect(emittedMessages[0]!.role).toBe("assistant");
    expect(emittedMessages[0]!.toolCalls).toHaveLength(1);

    // 2. Tool result message
    expect(emittedMessages[1]!.role).toBe("tool");
    expect(emittedMessages[1]!.toolName).toBe("create_storm_cards");

    // 3. Final assistant message
    expect(emittedMessages[2]!.role).toBe("assistant");
    expect(emittedMessages[2]!.content).toContain("Created the Order Placed");
    expect(updatedPlan).toEqual([]);

    // Check store got the card
    expect(fake.objects).toHaveLength(1);
    expect(fake.objects[0]!.stormData?.name).toBe("Order Placed");

    chatSpy.mockRestore();
  });

  it("handles abort signal gracefully", async () => {
    const fake = createFakeStore();
    const conv = createEmptyConversation();
    conv.messages.push(createUserMessage("Long running"));

    const controller = new AbortController();
    controller.abort();

    await expect(
      runAgent(
        conv,
        {
          apiKey: "test",
          baseUrl: "https://test.com",
          model: "test-model",
          maxTokens: 1000,
        },
        {
          getState: () => fake.store,
          signal: controller.signal,
          callbacks: {
            onMessage: () => {},
            onPlan: () => {},
            onSummary: () => {},
          },
        },
      ),
    ).rejects.toThrow();
  });
});
