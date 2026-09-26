import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasStore, undo, redo } from "./index";
import { beginHistoryBatch, endHistoryBatch } from "./historyBatch";
import { executeToolCall } from "@/ai/tools";
import type { AIToolContext } from "@/ai/tools/types";

describe("AI Assistant One-Step Undo (Phase 6 Exit Criteria)", () => {
  beforeEach(() => {
    useCanvasStore.getState().resetBoard([], []);
    useCanvasStore.temporal.getState().clear();
  });

  it("reverts an entire multi-tool AI turn with a single Cmd+Z undo", async () => {
    const store = useCanvasStore.getState();
    expect(store.objects).toHaveLength(0);
    expect(store.groups).toHaveLength(0);

    const ctx: AIToolContext = {
      getState: () => useCanvasStore.getState(),
      getPlan: () => [],
      setPlan: () => {},
    };

    // Simulate the store wrapping an AI turn in beginHistoryBatch / endHistoryBatch
    beginHistoryBatch();

    // 1. AI creates storm cards (Actor, Command, Event)
    const stormRes = await executeToolCall(
      {
        id: "call-1",
        name: "create_storm_cards",
        arguments: JSON.stringify({
          cards: [
            { kind: "actor", name: "Buyer" },
            { kind: "command", name: "Submit Payment" },
            { kind: "event", name: "Payment Received" },
          ],
        }),
      },
      ctx,
    );
    expect(stormRes.isError).toBeFalsy();

    // 2. AI connects the Command to the Event
    const currentObjects = useCanvasStore.getState().objects;
    const cmd = currentObjects.find((o) => o.stormData?.kind === "command")!;
    const evt = currentObjects.find((o) => o.stormData?.kind === "event")!;

    const connRes = await executeToolCall(
      {
        id: "call-2",
        name: "connect_objects",
        arguments: JSON.stringify({
          connections: [
            {
              sourceId: cmd.id,
              targetId: evt.id,
              sourceAnchor: "right",
              targetAnchor: "left",
            },
          ],
        }),
      },
      ctx,
    );
    expect(connRes.isError).toBeFalsy();

    // 3. AI groups the cards into a Payment Section
    const groupRes = await executeToolCall(
      {
        id: "call-3",
        name: "group_objects",
        arguments: JSON.stringify({
          ids: [cmd.id, evt.id],
          name: "Payment Processing",
        }),
      },
      ctx,
    );
    expect(groupRes.isError).toBeFalsy();

    // End of AI turn: history batch releases
    endHistoryBatch();

    // Verify all created entities are present on the canvas
    const stateAfterAITurn = useCanvasStore.getState();
    expect(stateAfterAITurn.objects).toHaveLength(4); // 3 storm cards + 1 connector
    expect(stateAfterAITurn.groups).toHaveLength(1);
    expect(stateAfterAITurn.groups[0]!.name).toBe("Payment Processing");

    // ACT: User presses Cmd+Z once (single undo step)
    undo();

    // ASSERT: All changes made during the entire AI turn are cleanly reverted!
    const stateAfterUndo = useCanvasStore.getState();
    expect(stateAfterUndo.objects).toHaveLength(0);
    expect(stateAfterUndo.groups).toHaveLength(0);

    // ACT: User presses Cmd+Shift+Z (redo)
    redo();

    // ASSERT: Everything is restored cleanly
    const stateAfterRedo = useCanvasStore.getState();
    expect(stateAfterRedo.objects).toHaveLength(4);
    expect(stateAfterRedo.groups).toHaveLength(1);
  });
});
