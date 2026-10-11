import { describe, it, expect, beforeEach } from "vitest";
import { commandCardTool, type CommandCardData } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

describe("commandCardTool sub-selection & inline edit targets", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const card: CanvasElement<CommandCardData> = {
    id: "cmd-1",
    type: "commandCard",
    x: 100,
    y: 100,
    width: 220,
    height: 88,
    data: {
      name: "PlaceOrder",
      fields: [
        { name: "orderId", type: "string" },
        { name: "totalAmount", type: "number" },
      ],
      color: "#2563eb",
    },
  };

  it("has correct metadata and default styling", () => {
    expect(commandCardTool.type).toBe("commandCard");
    expect(commandCardTool.name).toBe("Command");
    expect(commandCardTool.color).toBe("#2563eb");
    expect(commandCardTool.category).toBe("modeling");
    expect(commandCardTool.defaultSize).toEqual({ width: 220, height: 88 });
  });

  it("sub-selects fields correctly", () => {
    // Header area (y <= 32) is not a field
    expect(commandCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();

    // Field 0: y in [32, 60] -> e.g. y = 45
    expect(commandCardTool.onSubSelect!(card, { x: 50, y: 45 })).toBe(0);

    // Field 1: y in [60, 88] -> e.g. y = 75
    expect(commandCardTool.onSubSelect!(card, { x: 50, y: 75 })).toBe(1);

    // Below card fields -> null
    expect(commandCardTool.onSubSelect!(card, { x: 50, y: 120 })).toBeNull();
  });

  it("returns inline edit target for header (Command Name)", () => {
    useCanvasStore.getState().addElement(card);

    const target = commandCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("PlaceOrder");
    expect(target?.multiline).toBe(false);

    // Commit change
    target?.onCommit("CancelOrder");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "cmd-1");
    expect(updated?.data.name).toBe("CancelOrder");

    // Undo reverts back
    useCanvasStore.getState().undo();
    const reverted = useCanvasStore.getState().elements.find((e) => e.id === "cmd-1");
    expect(reverted?.data.name).toBe("PlaceOrder");
  });

  it("returns inline edit target for Field Name", () => {
    useCanvasStore.getState().addElement(card);

    // Double click on field 0 (orderId)
    const target = commandCardTool.getInlineEditTarget!(card, { x: 30, y: 45 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("orderId");

    // Commit change
    target?.onCommit("cartId");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "cmd-1");
    expect(updated?.data.fields[0].name).toBe("cartId");
    expect(updated?.data.fields[0].type).toBe("string");

    // Selected field state was updated
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "cmd-1",
      fieldIndex: 0,
    });
  });

  it("deletes sub-selected field and updates card height", () => {
    const patch = commandCardTool.onDeleteSubSelect!(card, 0);
    expect(patch).not.toBeNull();
    expect(patch?.data?.fields.length).toBe(1);
    expect(patch?.data?.fields[0].name).toBe("totalAmount");
    expect(patch?.height).toBe(32 + 28);
  });

  it("navigates fields via arrow keys", () => {
    const down = commandCardTool.onNavigateSubSelect!(
      card,
      { elementId: "cmd-1", fieldIndex: 0 },
      "down",
    );
    expect(down?.fieldIndex).toBe(1);

    const up = commandCardTool.onNavigateSubSelect!(
      card,
      { elementId: "cmd-1", fieldIndex: 1 },
      "up",
    );
    expect(up?.fieldIndex).toBe(0);
  });
});
