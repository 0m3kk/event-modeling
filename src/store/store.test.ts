import { describe, it, expect, beforeEach } from "vitest";
import "@/tools";
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
        fields: [{ name: "Order ID", type: "BOOLEAN" }],
      },
    };
    useCanvasStore.getState().addElement(el);

    const data = useCanvasStore.getState().elements[0].data as any;
    expect(data.name).toBe("orderPlaced");
    expect(data.fields[0].name).toBe("orderId");
    expect(data.fields[0].type).toBe("boolean");
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
      data: { name: "Order Placed", fields: [{ name: "Order ID", type: "boolean" }] },
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

});

describe("useCanvasStore content width auto-fit", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      elements: [],
      selectedIds: [],
      undoStack: [],
      redoStack: [],
      projectName: "Test Board",
    });
  });

  it("grows an opted-in card to fit its content when the data changes", () => {
    useCanvasStore.getState().addElement({
      id: "evt-1",
      type: "eventCard",
      x: 0,
      y: 0,
      width: 220,
      height: 60,
      data: { name: "OrderPlaced", fields: [] },
    });
    expect(useCanvasStore.getState().elements[0].width).toBe(220);

    useCanvasStore.getState().updateElement("evt-1", {
      data: {
        name: "OrderPlaced",
        fields: [{ name: "field", type: "abcdefghijklmnopqrstuvwxyz" }],
      },
    });

    // 12 + "Field"(36) + 30 gap + type(171.6) + 12 -> 262.
    expect(useCanvasStore.getState().elements[0].width).toBe(262);
    expect(useCanvasStore.getState().elements[0].height).toBe(60);
  });

  it("never shrinks an opted-in card below a width the user already set", () => {
    useCanvasStore.getState().addElement({
      id: "evt-1",
      type: "eventCard",
      x: 0,
      y: 0,
      width: 900,
      height: 60,
      data: { name: "OrderPlaced", fields: [] },
    });

    useCanvasStore.getState().updateElement("evt-1", {
      data: { name: "OrderPlaced", fields: [{ name: "id", type: "string" }] },
    });
    expect(useCanvasStore.getState().elements[0].width).toBe(900);
  });

  it("does not auto-fit a card that has not opted in", () => {
    useCanvasStore.getState().addElement({
      id: "obj-1",
      type: "objectCard",
      x: 0,
      y: 0,
      width: 220,
      height: 60,
      data: {
        name: "Obj",
        fields: [{ name: "field", type: "abcdefghijklmnopqrstuvwxyz" }],
      },
    });
    expect(useCanvasStore.getState().elements[0].width).toBe(220);
  });

  it("reflows the height of a width-sensitive card on data change", () => {
    useCanvasStore.getState().addElement({
      id: "con-1",
      type: "constraintCard",
      x: 0,
      y: 0,
      width: 260,
      height: 126,
      data: { name: "C", states: [], rules: ["short"] },
    });
    expect(useCanvasStore.getState().elements[0].height).toBe(126);

    useCanvasStore.getState().updateElement("con-1", {
      data: { name: "C", states: [], rules: ["x".repeat(400)] },
    });
    // The longer rule wraps to many lines, so only the height changes.
    expect(useCanvasStore.getState().elements[0].width).toBe(260);
    expect(useCanvasStore.getState().elements[0].height).toBeGreaterThan(126);
  });
});
