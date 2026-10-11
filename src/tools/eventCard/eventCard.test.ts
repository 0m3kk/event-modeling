import { describe, it, expect, beforeEach } from "vitest";
import { eventCardTool, type EventCardData } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

describe("EventCardTool sub-selection & inline edit targets", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const card: CanvasElement<EventCardData> = {
    id: "card-1",
    type: "eventCard",
    x: 100,
    y: 100,
    width: 220,
    height: 88,
    data: {
      name: "OrderPlaced",
      fields: [
        { name: "orderId", type: "string" },
        { name: "amount", type: "number" },
      ],
      color: "#f97316",
    },
  };

  it("sub-selects fields correctly", () => {
    // Header area (y <= 32) is not a field
    expect(eventCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();

    // Field 0 starts at y=42, height 22 (range 42 - 64)
    expect(eventCardTool.onSubSelect!(card, { x: 50, y: 50 })).toBe(0);

    // Field 1 starts at y=64, height 22 (range 64 - 86)
    expect(eventCardTool.onSubSelect!(card, { x: 50, y: 70 })).toBe(1);

    // Below card fields -> null
    expect(eventCardTool.onSubSelect!(card, { x: 50, y: 92 })).toBeNull();
  });

  it("returns inline edit target for header (Event Name)", () => {
    useCanvasStore.getState().addElement(card);

    const target = eventCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("OrderPlaced");
    expect(target?.multiline).toBe(false);

    // Commit change
    target?.onCommit("PaymentReceived");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.name).toBe("PaymentReceived");

    // Undo reverts back
    useCanvasStore.getState().undo();
    const reverted = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(reverted?.data.name).toBe("OrderPlaced");
  });

  it("returns inline edit target for Field Name (name only, not type)", () => {
    useCanvasStore.getState().addElement(card);

    // Double click on field 0 (orderId)
    const target = eventCardTool.getInlineEditTarget!(card, { x: 30, y: 50 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("orderId");

    // Commit change
    target?.onCommit("invoiceId");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.fields[0].name).toBe("invoiceId");
    // Type remains untouched
    expect(updated?.data.fields[0].type).toBe("string");

    // Selected field state was updated
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "card-1",
      fieldIndex: 0,
    });
  });
});
