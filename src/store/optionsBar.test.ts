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
      height: 88,
      data: eventCardTool.createDefaultData(),
    };

    useCanvasStore.getState().addElement(card);

    const initialHeight = card.height;
    const newField = { name: "customerEmail", type: "string" };
    const nextFields = [...card.data.fields, newField];
    const nextData: EventCardData = { ...card.data, fields: nextFields };
    const nextSize = eventCardTool.computeSize!(nextData);

    useCanvasStore.getState().updateElement("card-1", {
      height: nextSize.height,
      data: nextData,
    });

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "card-1");
    expect(updated?.height).toBeGreaterThan(initialHeight);
    expect(updated?.data.fields).toHaveLength(3);
  });
});
