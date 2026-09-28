import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore, clearHistory } from "@/store";
import type { CanvasObject, StormKind } from "@/types";
import { stormHasTags } from "@/constants/storm";

describe("Event Card Field Tagging Tool", () => {
  beforeEach(() => {
    useCanvasStore.getState().resetBoard();
    clearHistory();
  });

  it("identifies event cards as taggable cards", () => {
    expect(stormHasTags("event")).toBe(true);
    expect(stormHasTags("command")).toBe(false);
    expect(stormHasTags("actor")).toBe(false);
    expect(stormHasTags("query")).toBe(false);
  });

  it("sets a tag on an event card field", () => {
    const eventCard: CanvasObject = {
      id: "evt-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
      stormData: {
        kind: "event",
        name: "OrderPlaced",
        fields: [
          { id: "f-order", name: "orderId", fieldType: "uuid" },
          { id: "f-cust", name: "customerId", fieldType: "uuid" },
        ],
      },
    };

    useCanvasStore.getState().addObjects([eventCard]);
    useCanvasStore.getState().setSelectedIds(["evt-1"]);

    // Update field tag for 'orderId'
    const currentFields = eventCard.stormData!.fields;
    const updatedFields = currentFields.map((f) =>
      f.id === "f-order" ? { ...f, tag: "order" } : f,
    );

    useCanvasStore.getState().updateObject("evt-1", {
      stormData: {
        ...eventCard.stormData!,
        fields: updatedFields,
      },
    });

    const updated = useCanvasStore
      .getState()
      .objects.find((o) => o.id === "evt-1");
    expect(updated?.stormData?.fields[0].tag).toBe("order");
    expect(updated?.stormData?.fields[1].tag).toBeUndefined();
  });

  it("removes a tag from a field by clearing it", () => {
    const eventCard: CanvasObject = {
      id: "evt-2",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
      stormData: {
        kind: "event",
        name: "OrderCancelled",
        fields: [
          { id: "f-order", name: "orderId", fieldType: "uuid", tag: "order" },
        ],
      },
    };

    useCanvasStore.getState().addObjects([eventCard]);

    const updatedFields = eventCard.stormData!.fields.map((f) =>
      f.id === "f-order" ? { ...f, tag: undefined } : f,
    );

    useCanvasStore.getState().updateObject("evt-2", {
      stormData: {
        ...eventCard.stormData!,
        fields: updatedFields,
      },
    });

    const updated = useCanvasStore
      .getState()
      .objects.find((o) => o.id === "evt-2");
    expect(updated?.stormData?.fields[0].tag).toBeUndefined();
  });

  it("handles selected field state properly", () => {
    const eventCard: CanvasObject = {
      id: "evt-3",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
      stormData: {
        kind: "event",
        name: "ItemAdded",
        fields: [
          { id: "f-1", name: "cartId", fieldType: "uuid" },
          { id: "f-2", name: "itemId", fieldType: "uuid" },
        ],
      },
    };

    useCanvasStore.getState().addObjects([eventCard]);
    useCanvasStore.getState().setSelectedIds(["evt-3"]);

    useCanvasStore.getState().setStormSelectedField({
      objectId: "evt-3",
      fieldId: "f-2",
    });

    expect(useCanvasStore.getState().stormSelectedField).toEqual({
      objectId: "evt-3",
      fieldId: "f-2",
    });
  });

  it("determines tag button is only visible when a field is selected, not whole card", () => {
    const isTagToolVisible = (
      kind: StormKind,
      selectedField: unknown,
    ): boolean => {
      return stormHasTags(kind) && Boolean(selectedField);
    };

    // Selecting whole card without field selected
    expect(isTagToolVisible("event", null)).toBe(false);
    expect(isTagToolVisible("event", undefined)).toBe(false);

    // Selecting a field on event card
    expect(isTagToolVisible("event", { id: "f-1", name: "orderId" })).toBe(true);

    // Selecting a field on non-taggable card (e.g. command)
    expect(isTagToolVisible("command", { id: "f-1", name: "orderId" })).toBe(false);
  });
});
