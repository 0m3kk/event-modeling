import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore } from "./index";
import type { EventCardData } from "@/tools/eventCard";
import type { CanvasElement } from "@/types";

describe("Clipboard copy & paste", () => {
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
        { name: "timestamp", type: "string" },
      ],
      color,
    },
  });

  it("captures the selected elements into the clipboard", () => {
    const store = useCanvasStore.getState();
    store.addElement(makeCard("card-1", "OrderPlaced"));
    store.addElement(makeCard("card-2", "OrderCancelled"));

    store.setSelectedIds(["card-2"]);
    useCanvasStore.getState().copySelection();

    const clipboard = useCanvasStore.getState().clipboard;
    expect(clipboard).toHaveLength(1);
    expect(clipboard[0].data.name).toBe("orderCancelled");
  });

  it("is a no-op when nothing is selected", () => {
    const store = useCanvasStore.getState();
    store.addElement(makeCard("card-1"));
    useCanvasStore.getState().clearSelection();

    useCanvasStore.getState().copySelection();

    expect(useCanvasStore.getState().clipboard).toHaveLength(0);
  });

  it("pastes an independent copy with a new id, no reference link and unique name", () => {
    const store = useCanvasStore.getState();
    store.addElement(makeCard("card-1", "OrderPlaced"));

    store.setSelectedIds(["card-1"]);
    useCanvasStore.getState().copySelection();
    useCanvasStore.getState().pasteClipboard();

    const state = useCanvasStore.getState();
    expect(state.elements).toHaveLength(2);

    const pasted = state.elements.find((el) => el.id !== "card-1")!;
    expect(pasted.id).not.toBe("card-1");
    expect(pasted.referenceId).toBeUndefined();
    expect(pasted.isOriginal).toBeUndefined();
    expect(pasted.data.name).toBe("orderPlaced 2");
    // The paste is nudged so it does not sit exactly on the source.
    expect(pasted.x).toBe(124);
    expect(pasted.y).toBe(124);
    // The pasted copy becomes the selection.
    expect(state.selectedIds).toEqual([pasted.id]);
  });

  it("snapshots the selection, so later edits to the source do not change the clipboard", () => {
    const store = useCanvasStore.getState();
    store.addElement(makeCard("card-1", "OrderPlaced"));

    store.setSelectedIds(["card-1"]);
    useCanvasStore.getState().copySelection();

    useCanvasStore.getState().updateElement("card-1", { data: { name: "OrderShipped" } });

    useCanvasStore.getState().pasteClipboard();
    const pasted = useCanvasStore.getState().elements.find((el) => el.id !== "card-1")!;
    // Keeps the name captured at copy time, not the renamed source.
    expect(pasted.data.name).toBe("orderPlaced");
  });

  it("cascades repeated pastes by the offset step", () => {
    const store = useCanvasStore.getState();
    store.addElement(makeCard("card-1", "OrderPlaced"));

    store.setSelectedIds(["card-1"]);
    useCanvasStore.getState().copySelection();
    useCanvasStore.getState().pasteClipboard();
    useCanvasStore.getState().pasteClipboard();

    const positions = useCanvasStore
      .getState()
      .elements.filter((el) => el.id !== "card-1")
      .map((el) => el.x)
      .sort((a, b) => a - b);
    expect(positions).toEqual([124, 148]);
  });

  it("pastes a reference element as a standalone copy", () => {
    const store = useCanvasStore.getState();
    store.addElement(makeCard("card-1", "OrderPlaced"));
    store.setSelectedIds(["card-1"]);

    const reference = useCanvasStore.getState().createReferenceCopy("card-1")!;
    useCanvasStore.getState().setSelectedIds([reference.id]);
    useCanvasStore.getState().copySelection();
    useCanvasStore.getState().pasteClipboard();

    const pasted = useCanvasStore
      .getState()
      .elements.find((el) => el.id !== "card-1" && el.id !== reference.id)!;
    expect(pasted.referenceId).toBeUndefined();
    expect(pasted.data.name).toBe("orderPlaced 2");
    // The original reference pair is untouched.
    expect(useCanvasStore.getState().elements.find((el) => el.id === "card-1")!.referenceId).toBe(
      reference.referenceId,
    );
  });

  it("is a no-op when the clipboard is empty", () => {
    const store = useCanvasStore.getState();
    store.addElement(makeCard("card-1"));

    useCanvasStore.getState().pasteClipboard();

    expect(useCanvasStore.getState().elements).toHaveLength(1);
  });
});
