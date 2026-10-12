import "@/tools";
import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore } from "./index";
import { eventCardTool, type EventCardData } from "@/tools/eventCard";
import { stickyNoteTool } from "@/tools/stickyNote";
import type { CanvasElement } from "@/types";

describe("OptionsBar data workflows & undo/redo", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("updates element color and tracks in undo stack", () => {
    const card: CanvasElement<EventCardData> = {
      id: "card-1",
      type: "eventCard",
      x: 100,
      y: 100,
      width: 220,
      height: 120,
      data: eventCardTool.createDefaultData(),
    };

    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedIds([card.id]);

    // Update color to Blue
    useCanvasStore.getState().updateElement("card-1", {
      data: { ...card.data, color: "#3b82f6" },
    });

    let el = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(el?.data.color).toBe("#3b82f6");

    // Undo should revert back to original color
    useCanvasStore.getState().undo();
    el = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(el?.data.color).toBe("#f97316");

    // Redo should re-apply the blue color
    useCanvasStore.getState().redo();
    el = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(el?.data.color).toBe("#3b82f6");
  });

  it("updates multiple elements color at once", () => {
    const card: CanvasElement = {
      id: "card-1",
      type: "eventCard",
      x: 100,
      y: 100,
      width: 220,
      height: 120,
      data: eventCardTool.createDefaultData(),
    };
    const note: CanvasElement = {
      id: "note-1",
      type: "stickyNote",
      x: 400,
      y: 100,
      width: 180,
      height: 140,
      data: stickyNoteTool.createDefaultData(),
    };

    useCanvasStore.getState().addElements([card, note]);
    useCanvasStore.getState().setSelectedIds(["card-1", "note-1"]);

    useCanvasStore.getState().updateElements([
      { id: "card-1", data: { ...card.data, color: "#10b981" } },
      { id: "note-1", data: { ...note.data, color: "#10b981" } },
    ]);

    expect(useCanvasStore.getState().elements[0].data.color).toBe("#10b981");
    expect(useCanvasStore.getState().elements[1].data.color).toBe("#10b981");

    // Single undo reverts both
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().elements[0].data.color).toBe("#f97316");
    expect(useCanvasStore.getState().elements[1].data.color).toBe("#fef08a");
  });

  it("supports adding field to EventCard and recalculating height", () => {
    const card: CanvasElement<EventCardData> = {
      id: "card-1",
      type: "eventCard",
      x: 100,
      y: 100,
      width: 220,
      height: 60,
      data: eventCardTool.createDefaultData(),
    };

    useCanvasStore.getState().addElement(card);

    const initialHeight = card.height;
    const nextFields = [
      { name: "id", type: "string" },
      { name: "customerEmail", type: "string" },
    ];
    const nextData: EventCardData = { ...card.data, fields: nextFields };
    const nextSize = eventCardTool.computeSize!(nextData);

    useCanvasStore.getState().updateElement("card-1", {
      height: nextSize.height,
      data: nextData,
    });

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.height).toBeGreaterThan(initialHeight);
    expect(updated?.data.fields).toHaveLength(2);
  });

  it("deletes selected field and shrinks card height using deleteSelectedField", () => {
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
      },
    };

    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedIds(["card-1"]);
    useCanvasStore.getState().setSelectedField({
      elementId: "card-1",
      fieldIndex: 0,
    });

    // Delete the field
    useCanvasStore.getState().deleteSelectedField();

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.fields).toHaveLength(1);
    expect(updated?.data.fields[0].name).toBe("amount");
    expect(updated?.height).toBe(60); // 32 header + 1 field * 28 = 60
    // Adjacent remaining field (amount at index 0) is automatically selected
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "card-1",
      sectionIndex: 0,
      sectionId: "fields",
      fieldIndex: 0,
    });
    // Card itself is NOT deleted!
    expect(useCanvasStore.getState().elements).toHaveLength(1);

    // Undo restores the field and height
    useCanvasStore.getState().undo();
    const reverted = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(reverted?.data.fields).toHaveLength(2);
    expect(reverted?.height).toBe(88);
  });

  it("syncs field deletion across reference copies", () => {
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
      },
    };

    useCanvasStore.getState().addElement(card);
    const copy = useCanvasStore.getState().createReferenceCopy("card-1")!;

    // Select and delete field on the copy
    useCanvasStore.getState().setSelectedIds([copy.id]);
    useCanvasStore.getState().setSelectedField({
      elementId: copy.id,
      fieldIndex: 1,
    });

    useCanvasStore.getState().deleteSelectedField();

    const original = useCanvasStore.getState().elements.find((e) => e.id === "card-1")!;
    const refCopy = useCanvasStore.getState().elements.find((e) => e.id === copy.id)!;

    // Both cards should have the field removed and synced height
    expect(original.data.fields).toHaveLength(1);
    expect(original.data.fields[0].name).toBe("orderId");
    expect(original.height).toBe(60);

    expect(refCopy.data.fields).toHaveLength(1);
    expect(refCopy.data.fields[0].name).toBe("orderId");
    expect(refCopy.height).toBe(60);

    // Adjacent field (orderId at index 0) is automatically selected
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: copy.id,
      sectionIndex: 0,
      sectionId: "fields",
      fieldIndex: 0,
    });
  });

  it("updates field type via updateSelectedFieldType with full undo/redo", () => {
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
      },
    };

    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedIds(["card-1"]);
    useCanvasStore.getState().setSelectedField({
      elementId: "card-1",
      fieldIndex: 0,
    });

    // Change orderId from "string" to "boolean"
    useCanvasStore.getState().updateSelectedFieldType("boolean");

    let updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.fields[0].type).toBe("boolean");
    expect(updated?.data.fields[0].name).toBe("orderId");

    // Undo reverts back to string
    useCanvasStore.getState().undo();
    updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.fields[0].type).toBe("string");

    // Redo restores boolean
    useCanvasStore.getState().redo();
    updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.data.fields[0].type).toBe("boolean");
  });

  it("syncs field type change across reference copies", () => {
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
      },
    };

    useCanvasStore.getState().addElement(card);
    const copy = useCanvasStore.getState().createReferenceCopy("card-1")!;

    useCanvasStore.getState().setSelectedIds([copy.id]);
    useCanvasStore.getState().setSelectedField({
      elementId: copy.id,
      fieldIndex: 1,
    });

    // Change amount from "number" to "Money" (custom domain type) on the copy
    useCanvasStore.getState().updateSelectedFieldType("Money");

    const original = useCanvasStore.getState().elements.find((e) => e.id === "card-1")!;
    const refCopy = useCanvasStore.getState().elements.find((e) => e.id === copy.id)!;

    expect(refCopy.data.fields[1].type).toBe("money");
    expect(original.data.fields[1].type).toBe("money");
  });
});

