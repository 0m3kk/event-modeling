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
