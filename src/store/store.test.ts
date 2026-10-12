import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore } from "./index";
import type { CanvasElement } from "@/types";

describe("useCanvasStore", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      elements: [],
      selectedIds: [],
      undoStack: [],
      redoStack: [],
      projectName: "Test Board",
    });
  });

  it("adds an element and tracks undo", () => {
    const el: CanvasElement = {
      id: "el-1",
      type: "stickyNote",
      x: 100,
      y: 100,
      width: 180,
      height: 140,
      data: { text: "Hello" },
    };

    useCanvasStore.getState().addElement(el);
    expect(useCanvasStore.getState().elements.length).toBe(1);
    expect(useCanvasStore.getState().selectedIds).toEqual(["el-1"]);
    expect(useCanvasStore.getState().canUndo()).toBe(true);

    // Undo
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().elements.length).toBe(0);
    expect(useCanvasStore.getState().canRedo()).toBe(true);

    // Redo
    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().elements.length).toBe(1);
  });

  it("updates an element", () => {
    const el: CanvasElement = {
      id: "el-1",
      type: "stickyNote",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      data: { text: "Initial" },
    };
    useCanvasStore.getState().addElement(el);
    useCanvasStore.getState().updateElement("el-1", { x: 200 });

    expect(useCanvasStore.getState().elements[0].x).toBe(200);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().elements[0].x).toBe(50);
  });

  it("stores identifiers in camelCase on add, regardless of input casing", () => {
    const el: CanvasElement = {
      id: "el-1",
      type: "eventCard",
      x: 0,
      y: 0,
      width: 220,
      height: 88,
      data: {
        name: "Order Placed",
        fields: [{ name: "Order ID", type: "UUID" }],
      },
    };
    useCanvasStore.getState().addElement(el);

    const data = useCanvasStore.getState().elements[0].data as any;
    expect(data.name).toBe("orderPlaced");
    expect(data.fields[0].name).toBe("orderId");
    expect(data.fields[0].type).toBe("uuid");
  });

  it("normalizes identifiers on update", () => {
    const el: CanvasElement = {
      id: "el-1",
      type: "eventCard",
      x: 0,
      y: 0,
      width: 220,
      height: 88,
      data: { name: "orderPlaced", fields: [{ name: "orderId", type: "string" }] },
    };
    useCanvasStore.getState().addElement(el);
    useCanvasStore.getState().updateElement("el-1", {
      data: { name: "Order Placed", fields: [{ name: "Order ID", type: "uuid" }] },
    });

    const data = useCanvasStore.getState().elements[0].data as any;
    expect(data.name).toBe("orderPlaced");
    expect(data.fields[0].name).toBe("orderId");
  });

  it("does not rewrite existing identifiers when loading a board", () => {
    useCanvasStore.getState().loadProject({
      version: 2,
      id: "proj-1",
      name: "Legacy",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      viewport: { x: 0, y: 0, zoom: 1 },
      groups: [],
      elements: [
        {
          id: "el-1",
          type: "eventCard",
          x: 0,
          y: 0,
          width: 220,
          height: 88,
          data: { name: "OrderPlaced", fields: [{ name: "orderId", type: "string" }] },
        } as CanvasElement,
      ],
    });

    const data = useCanvasStore.getState().elements[0].data as any;
    expect(data.name).toBe("OrderPlaced");
  });

  it("deletes elements", () => {
    const el1: CanvasElement = {
      id: "el-1",
      type: "stickyNote",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      data: {},
    };
    const el2: CanvasElement = {
      id: "el-2",
      type: "eventCard",
      x: 200,
      y: 0,
      width: 100,
      height: 100,
      data: {},
    };

    useCanvasStore.getState().addElements([el1, el2]);
    expect(useCanvasStore.getState().elements.length).toBe(2);

    useCanvasStore.getState().deleteElements(["el-1"]);
    expect(useCanvasStore.getState().elements.length).toBe(1);
    expect(useCanvasStore.getState().elements[0].id).toBe("el-2");

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().elements.length).toBe(2);
  });

  it("organizes the board and collapses into a single undo step", () => {
    const a: CanvasElement = {
      id: "a",
      type: "stickyNote",
      x: 0,
      y: 0,
      width: 160,
      height: 120,
      data: { text: "A" },
    };
    const b: CanvasElement = {
      id: "b",
      type: "stickyNote",
      x: 10,
      y: 10,
      width: 160,
      height: 120,
      data: { text: "B" },
    };
    useCanvasStore.getState().addElements([a, b]);

    const moved = useCanvasStore.getState().organizeBoard();
    expect(moved).toBeGreaterThan(0);

    const [first, second] = useCanvasStore.getState().elements;
    const overlap =
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y;
    expect(overlap).toBe(false);

    // One undo restores the pre-organize positions.
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().elements.map((e) => [e.x, e.y])).toEqual([
      [0, 0],
      [10, 10],
    ]);
  });

  it("does nothing when there is nothing to organize", () => {
    const el: CanvasElement = {
      id: "a",
      type: "stickyNote",
      x: 0,
      y: 0,
      width: 160,
      height: 120,
      data: { text: "A" },
    };
    useCanvasStore.getState().addElement(el);
    expect(useCanvasStore.getState().organizeBoard()).toBe(0);
  });
});
