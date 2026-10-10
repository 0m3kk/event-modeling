import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore, clearHistory } from "@/store";
import type { CanvasObject, StormKind, StormQueryItem } from "@/types";
import { stormHasQueryItems } from "@/constants/storm";

describe("State Query Item Tool", () => {
  beforeEach(() => {
    useCanvasStore.getState().resetBoard();
    clearHistory();
  });

  it("identifies state cards as query-item-capable cards", () => {
    expect(stormHasQueryItems("state")).toBe(true);
    expect(stormHasQueryItems("constraint")).toBe(false);
    expect(stormHasQueryItems("event")).toBe(false);
    expect(stormHasQueryItems("command")).toBe(false);
    expect(stormHasQueryItems("actor")).toBe(false);
  });

  it("adds a new query item to a state card", () => {
    const stateCard: CanvasObject = {
      id: "state-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 140,
      stormData: {
        kind: "state",
        name: "OrderState",
        fields: [{ id: "f-1", name: "orderId", fieldType: "uuid", tag: "order" }],
        queryItems: [],
      },
    };

    useCanvasStore.getState().addObjects([stateCard]);

    const newItem: StormQueryItem = {
      id: "qi-1",
      types: ["OrderPlaced"],
      tagFieldIds: ["f-1"],
    };

    useCanvasStore.getState().updateObject("state-1", {
      stormData: {
        ...stateCard.stormData!,
        queryItems: [newItem],
      },
    });

    const updated = useCanvasStore
      .getState()
      .objects.find((o) => o.id === "state-1");
    expect(updated?.stormData?.queryItems).toHaveLength(1);
    expect(updated?.stormData?.queryItems?.[0].types).toEqual(["OrderPlaced"]);
    expect(updated?.stormData?.queryItems?.[0].tagFieldIds).toEqual(["f-1"]);
  });

  it("edits an existing query item on a state card", () => {
    const stateCard: CanvasObject = {
      id: "state-2",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 140,
      stormData: {
        kind: "state",
        name: "OrderState",
        fields: [],
        queryItems: [
          { id: "qi-old", types: ["OrderPlaced"], tagFieldIds: [] },
        ],
      },
    };

    useCanvasStore.getState().addObjects([stateCard]);

    const updatedItems = (stateCard.stormData!.queryItems ?? []).map((q) =>
      q.id === "qi-old" ? { ...q, types: ["OrderPlaced", "OrderPaid"] } : q,
    );

    useCanvasStore.getState().updateObject("state-2", {
      stormData: {
        ...stateCard.stormData!,
        queryItems: updatedItems,
      },
    });

    const updated = useCanvasStore
      .getState()
      .objects.find((o) => o.id === "state-2");
    expect(updated?.stormData?.queryItems?.[0].types).toEqual([
      "OrderPlaced",
      "OrderPaid",
    ]);
  });

  it("deletes a query item from a state card", () => {
    const stateCard: CanvasObject = {
      id: "state-3",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 140,
      stormData: {
        kind: "state",
        name: "OrderState",
        fields: [],
        queryItems: [
          { id: "qi-to-delete", types: ["OrderPlaced"], tagFieldIds: [] },
        ],
      },
    };

    useCanvasStore.getState().addObjects([stateCard]);

    const remainingItems = (stateCard.stormData!.queryItems ?? []).filter(
      (q) => q.id !== "qi-to-delete",
    );

    useCanvasStore.getState().updateObject("state-3", {
      stormData: {
        ...stateCard.stormData!,
        queryItems: remainingItems,
      },
    });

    const updated = useCanvasStore
      .getState()
      .objects.find((o) => o.id === "state-3");
    expect(updated?.stormData?.queryItems).toHaveLength(0);
  });

  it("determines edit button is only visible when a query item row is selected", () => {
    const isEditButtonVisible = (
      kind: StormKind,
      selectedQueryItem: unknown,
    ): boolean => {
      return stormHasQueryItems(kind) && Boolean(selectedQueryItem);
    };

    // Selecting whole state card
    expect(isEditButtonVisible("state", null)).toBe(false);
    expect(isEditButtonVisible("state", undefined)).toBe(false);

    // Selecting a query item on state card
    expect(isEditButtonVisible("state", { id: "qi-1", types: [] })).toBe(true);

    // Selecting a query item on constraint card (constraint has no query items)
    expect(isEditButtonVisible("constraint", { id: "qi-1", types: [] })).toBe(
      false,
    );

    // Event card does not have query items
    expect(isEditButtonVisible("event", { id: "qi-1", types: [] })).toBe(false);
  });

  it("determines filter button is highlighted when query item is selected or popover is open", () => {
    const isFilterHighlighted = (
      selectedQueryItem: unknown,
      showPopover: boolean,
      mode: "create" | "edit",
    ): boolean => {
      return Boolean(selectedQueryItem || (showPopover && mode === "edit"));
    };

    expect(isFilterHighlighted({ id: "qi-1", types: [] }, false, "edit")).toBe(true);
    expect(isFilterHighlighted(null, true, "edit")).toBe(true);
    expect(isFilterHighlighted(null, false, "create")).toBe(false);
    expect(isFilterHighlighted(null, true, "create")).toBe(false);
  });
});
