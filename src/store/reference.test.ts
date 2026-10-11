import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore } from "./index";
import { eventCardTool, type EventCardData } from "@/tools/eventCard";
import type { CanvasElement } from "@/types";

describe("Store Reference Copies & Unique Naming", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const makeCard = (
    id: string,
    name = "NewEvent",
    color = "#f97316",
  ): CanvasElement<EventCardData> => ({
    id,
    type: "eventCard",
    x: 100,
    y: 100,
    width: 220,
    height: 88,
    data: {
      name,
      fields: [
        { name: "id", type: "string" },
        { name: "timestamp", type: "datetime" },
      ],
      color,
    },
  });

  it("automatically gives newly created elements of the same type unique incremented names", () => {
    const card1 = makeCard("card-1");
    const card2 = makeCard("card-2");
    const card3 = makeCard("card-3");

    useCanvasStore.getState().addElement(card1);
    expect(useCanvasStore.getState().elements[0].data.name).toBe("newEvent");

    useCanvasStore.getState().addElement(card2);
    expect(useCanvasStore.getState().elements[1].data.name).toBe("newEvent 2");

    useCanvasStore.getState().addElement(card3);
    expect(useCanvasStore.getState().elements[2].data.name).toBe("newEvent 3");
  });

  it("creates a reference copy that shares referenceId and identical name", () => {
    const card1 = makeCard("card-1", "OrderPlaced");
    useCanvasStore.getState().addElement(card1);

    // Create reference copy
    const copy = useCanvasStore.getState().createReferenceCopy("card-1");
    expect(copy).not.toBeNull();

    const elements = useCanvasStore.getState().elements;
    expect(elements).toHaveLength(2);

    const original = elements.find((e) => e.id === "card-1")!;
    const referenceCopy = elements.find((e) => e.id !== "card-1")!;

    expect(original.referenceId).toBeDefined();
    expect(original.isOriginal).toBe(true);
    expect(referenceCopy.referenceId).toBe(original.referenceId);
    expect(referenceCopy.isOriginal).toBe(false);

    // Reference copy MUST have the exact same name!
    expect(referenceCopy.data.name).toBe("orderPlaced");

    // Offsets position
    expect(referenceCopy.x).toBe(original.x + 30);
    expect(referenceCopy.y).toBe(original.y + 30);
  });

  it("syncs name change across all reference copies", () => {
    const card1 = makeCard("card-1", "OrderPlaced");
    useCanvasStore.getState().addElement(card1);
    const copy = useCanvasStore.getState().createReferenceCopy("card-1")!;

    // Rename original card
    useCanvasStore.getState().updateElement("card-1", {
      data: { ...card1.data, name: "OrderCompleted" },
    });

    const elements = useCanvasStore.getState().elements;
    const original = elements.find((e) => e.id === "card-1")!;
    const reference = elements.find((e) => e.id === copy.id)!;

    expect(original.data.name).toBe("orderCompleted");
    expect(reference.data.name).toBe("orderCompleted");
  });

  it("syncs field additions and size changes across all reference copies", () => {
    const card1 = makeCard("card-1", "OrderPlaced");
    useCanvasStore.getState().addElement(card1);
    const copy = useCanvasStore.getState().createReferenceCopy("card-1")!;

    const nextFields = [
      ...card1.data.fields,
      { name: "totalAmount", type: "number" },
    ];
    const nextData = { ...card1.data, fields: nextFields };
    const nextSize = eventCardTool.computeSize!(nextData);

    useCanvasStore.getState().updateElement("card-1", {
      height: nextSize.height,
      data: nextData,
    });

    const elements = useCanvasStore.getState().elements;
    const original = elements.find((e) => e.id === "card-1")!;
    const reference = elements.find((e) => e.id === copy.id)!;

    expect(original.data.fields).toHaveLength(3);
    expect(reference.data.fields).toHaveLength(3);
    expect(original.height).toBe(nextSize.height);
    expect(reference.height).toBe(nextSize.height);
  });

  it("syncs color changes across all reference copies", () => {
    const card1 = makeCard("card-1");
    useCanvasStore.getState().addElement(card1);
    const copy = useCanvasStore.getState().createReferenceCopy("card-1")!;

    useCanvasStore.getState().updateElement(copy.id, {
      data: { ...copy.data, color: "#3b82f6" },
    });

    const elements = useCanvasStore.getState().elements;
    expect(elements[0].data.color).toBe("#3b82f6");
    expect(elements[1].data.color).toBe("#3b82f6");
  });

  it("does NOT sync position changes between reference copies", () => {
    const card1 = makeCard("card-1");
    useCanvasStore.getState().addElement(card1);
    const copy = useCanvasStore.getState().createReferenceCopy("card-1")!;

    useCanvasStore.getState().updateElement(copy.id, {
      x: 500,
      y: 600,
    });

    const elements = useCanvasStore.getState().elements;
    const original = elements.find((e) => e.id === "card-1")!;
    const reference = elements.find((e) => e.id === copy.id)!;

    expect(original.x).toBe(100);
    expect(original.y).toBe(100);
    expect(reference.x).toBe(500);
    expect(reference.y).toBe(600);
  });

  it("handles undo and redo for reference copying", () => {
    const card1 = makeCard("card-1");
    useCanvasStore.getState().addElement(card1);

    useCanvasStore.getState().createReferenceCopy("card-1");
    expect(useCanvasStore.getState().elements).toHaveLength(2);

    // Undo copy
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().elements).toHaveLength(1);

    // Redo copy
    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().elements).toHaveLength(2);
  });

  it("prunes referenceId when reference counterpart is deleted", () => {
    const card1 = makeCard("card-1");
    useCanvasStore.getState().addElement(card1);
    const copy = useCanvasStore.getState().createReferenceCopy("card-1")!;

    expect(useCanvasStore.getState().elements[0].referenceId).toBeDefined();

    // Delete the copy
    useCanvasStore.getState().deleteElements([copy.id]);
    expect(useCanvasStore.getState().elements).toHaveLength(1);

    // The remaining card no longer has dangling referenceId
    expect(useCanvasStore.getState().elements[0].referenceId).toBeUndefined();
  });
});
