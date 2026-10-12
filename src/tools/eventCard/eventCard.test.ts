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
        { name: "amount", type: "float" },
      ],
      color: "#f97316",
    },
  };

  it("sub-selects fields correctly", () => {
    // Header area (y <= 32) is not a field
    expect(eventCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();

    // Field 0 starts at y=32, height 28 (range 32 - 60) -> y = 50
    expect(eventCardTool.onSubSelect!(card, { x: 50, y: 50 })).toBe(0);

    // Field 1 starts at y=60, height 28 (range 60 - 88) -> y = 70
    expect(eventCardTool.onSubSelect!(card, { x: 50, y: 70 })).toBe(1);

    // Below card fields -> null
    expect(eventCardTool.onSubSelect!(card, { x: 50, y: 92 })).toBeNull();
  });

  it("returns inline edit target for header (Event Name)", () => {
    useCanvasStore.getState().addElement(card);

    const target = eventCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Order Placed");
    expect(target?.multiline).toBe(false);

    // Commit change
    target?.onCommit("PaymentReceived");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.name).toBe("paymentReceived");

    // Undo reverts back
    useCanvasStore.getState().undo();
    const reverted = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(reverted?.data.name).toBe("orderPlaced");
  });

  it("returns inline edit target for Field Name (name only, not type)", () => {
    useCanvasStore.getState().addElement(card);

    // Double click on field 0 (orderId)
    const target = eventCardTool.getInlineEditTarget!(card, { x: 30, y: 50 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Order ID");

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

  it("toggles field tag (DCB consistency boundary) on and off", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedField({
      elementId: "card-1",
      fieldIndex: 0,
    });

    // Toggle tag ON
    useCanvasStore.getState().toggleSelectedFieldTag();
    let updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.fields[0].isTag).toBe(true);

    // Toggle tag OFF
    useCanvasStore.getState().toggleSelectedFieldTag();
    updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.fields[0].isTag).toBe(false);

    // Undo restores tagged state
    useCanvasStore.getState().undo();
    updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.fields[0].isTag).toBe(true);
  });

  it("updates field type and resolves selected item data", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedField({
      elementId: "card-1",
      fieldIndex: 1,
    });

    // Resolve field item
    const item = eventCardTool.getSelectedFieldItem!(card, {
      elementId: "card-1",
      fieldIndex: 1,
    });
    expect(item).toEqual({ name: "amount", type: "float" });

    // Update type
    useCanvasStore.getState().updateSelectedFieldType("integer");
    const updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.fields[1].type).toBe("integer");
  });

  it("customizes field tag names (e.g. user on id, email on email)", () => {
    const userEvent: CanvasElement<EventCardData> = {
      id: "event-user",
      type: "eventCard",
      x: 100,
      y: 100,
      width: 220,
      height: 88,
      data: {
        name: "UserRegistered",
        fields: [
          { name: "id", type: "string" },
          { name: "email", type: "string" },
        ],
        color: "#f97316",
      },
    };

    useCanvasStore.getState().addElement(userEvent);

    // 1. Tag field 0 (id) with "user"
    useCanvasStore.getState().setSelectedField({
      elementId: "event-user",
      fieldIndex: 0,
    });
    useCanvasStore.getState().updateSelectedFieldTag("user");

    let el = useCanvasStore.getState().elements.find((e) => e.id === "event-user");
    expect(el?.data.fields[0].tag).toBe("user");
    expect(el?.data.fields[0].isTag).toBe(true);

    // 2. Tag field 1 (email) with "email" (strips leading # if user entered "#email")
    useCanvasStore.getState().setSelectedField({
      elementId: "event-user",
      fieldIndex: 1,
    });
    useCanvasStore.getState().updateSelectedFieldTag("#email");

    el = useCanvasStore.getState().elements.find((e) => e.id === "event-user");
    expect(el?.data.fields[1].tag).toBe("email");
    expect(el?.data.fields[1].isTag).toBe(true);

    // 3. Clear tag on field 1 with null
    useCanvasStore.getState().updateSelectedFieldTag(null);
    el = useCanvasStore.getState().elements.find((e) => e.id === "event-user");
    expect(el?.data.fields[1].tag).toBeUndefined();
    expect(el?.data.fields[1].isTag).toBe(false);

    // 4. Undo restores email tag
    useCanvasStore.getState().undo();
    el = useCanvasStore.getState().elements.find((e) => e.id === "event-user");
    expect(el?.data.fields[1].tag).toBe("email");
  });
});
