import { describe, it, expect, beforeEach, vi } from "vitest";
import { ResizeElementInteraction, computeResize } from "./ResizeElementInteraction";
import { InteractionManager } from "./InteractionManager";
import {
  GizmoLayer,
  hitResizeHandle,
  getResizeHandleCenters,
  MIN_ELEMENT_WIDTH,
} from "../layers/GizmoLayer";
import { ElementLayer } from "../layers/ElementLayer";
import { PreviewLayer } from "../layers/PreviewLayer";
import { SpatialIndex } from "../SpatialIndex";
import type { InteractionContext } from "./types";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

const element: CanvasElement = {
  id: "el-1",
  type: "stickyNote",
  x: 50,
  y: 50,
  width: 100,
  height: 100,
  data: {},
};

describe("computeResize (pure geometry)", () => {
  it("moves the right edge when dragging the right handle", () => {
    expect(computeResize("right", { x: 50, width: 100 }, 30)).toEqual({ x: 50, width: 130 });
  });

  it("moves the left edge when dragging the left handle", () => {
    expect(computeResize("left", { x: 50, width: 100 }, 10)).toEqual({ x: 60, width: 90 });
  });

  it("clamps to the minimum width on the right handle", () => {
    const result = computeResize("right", { x: 50, width: 100 }, -500);
    expect(result.width).toBe(MIN_ELEMENT_WIDTH);
    expect(result.x).toBe(50);
  });

  it("clamps to the minimum width on the left handle while keeping the right edge anchored", () => {
    const result = computeResize("left", { x: 50, width: 100 }, 500);
    expect(result.width).toBe(MIN_ELEMENT_WIDTH);
    // Right edge (start.x + start.width) stays put.
    expect(result.x + result.width).toBe(150);
  });
});

describe("hitResizeHandle", () => {
  it("detects the left and right handles at their centers", () => {
    const centers = getResizeHandleCenters(element);
    expect(hitResizeHandle(element, centers.left, 1)).toBe("left");
    expect(hitResizeHandle(element, centers.right, 1)).toBe("right");
  });

  it("returns null away from any handle", () => {
    expect(hitResizeHandle(element, { x: 100, y: 40 }, 1)).toBeNull();
  });

  it("keeps the hit target usable when zoomed out", () => {
    // Center of the card, far from both edges at zoom 1, becomes reachable
    // (in world units) only because the screen-space target is divided by zoom.
    const center = { x: 100, y: 100 };
    expect(hitResizeHandle(element, center, 1)).toBeNull();
    expect(hitResizeHandle(element, center, 0.1)).not.toBeNull();
  });
});

describe("ResizeElementInteraction", () => {
  let ctx: InteractionContext;
  let spatialIndex: SpatialIndex;
  let gizmoLayer: GizmoLayer;
  let elementLayer: ElementLayer;
  let previewLayer: PreviewLayer;

  beforeEach(() => {
    spatialIndex = new SpatialIndex();
    gizmoLayer = new GizmoLayer();
    elementLayer = new ElementLayer();
    previewLayer = new PreviewLayer();

    ctx = {
      screenToWorld: (x, y) => ({ x, y }),
      worldToScreen: (x, y) => ({ x, y }),
      spatialIndex,
      gizmoLayer,
      elementLayer,
      previewLayer,
      setCursor: vi.fn(),
      theme: "light",
      isSpaceHeld: () => false,
    };

    useCanvasStore.setState({
      elements: [{ ...element }],
      selectedIds: ["el-1"],
      tool: "select",
      viewport: { x: 0, y: 0, zoom: 1, screenWidth: 800, screenHeight: 600 },
    });
    spatialIndex.rebuild(useCanvasStore.getState().elements);
  });

  it("resizes the right edge and commits width on pointer up", () => {
    const resize = new ResizeElementInteraction();
    const down = { button: 0 } as PointerEvent;

    expect(resize.onPointerDown(down, { x: 150, y: 100 }, ctx)).toBe(true);
    resize.onPointerMove({} as PointerEvent, { x: 200, y: 100 }, ctx);
    resize.onPointerUp({} as PointerEvent, { x: 200, y: 100 }, ctx);

    const updated = useCanvasStore.getState().elements[0];
    expect(updated.width).toBe(150);
    expect(updated.x).toBe(50);
  });

  it("resizes the left edge and shifts x while keeping the right edge anchored", () => {
    const resize = new ResizeElementInteraction();
    const down = { button: 0 } as PointerEvent;

    expect(resize.onPointerDown(down, { x: 50, y: 100 }, ctx)).toBe(true);
    resize.onPointerMove({} as PointerEvent, { x: 60, y: 100 }, ctx);
    resize.onPointerUp({} as PointerEvent, { x: 60, y: 100 }, ctx);

    const updated = useCanvasStore.getState().elements[0];
    expect(updated.x + updated.width).toBe(150);
    expect(updated.x).toBe(60);
    expect(updated.width).toBe(90);
  });

  it("does not activate when nothing is selected", () => {
    useCanvasStore.setState({ selectedIds: [] });
    const resize = new ResizeElementInteraction();
    expect(resize.onPointerDown({ button: 0 } as PointerEvent, { x: 150, y: 100 }, ctx)).toBe(false);
  });

  it("does not activate on a multi-selection", () => {
    useCanvasStore.setState({ selectedIds: ["el-1", "el-2"] });
    const resize = new ResizeElementInteraction();
    expect(resize.onPointerDown({ button: 0 } as PointerEvent, { x: 150, y: 100 }, ctx)).toBe(false);
  });

  it("routes a pointer down on the handle to resize via the manager", () => {
    const manager = new InteractionManager(ctx);
    const handled = manager.handlePointerDown(
      { button: 0, metaKey: false, ctrlKey: false } as PointerEvent,
      { x: 150, y: 100 },
    );
    expect(handled).toBe(true);

    manager.handlePointerMove({} as PointerEvent, { x: 210, y: 100 });
    manager.handlePointerUp({} as PointerEvent, { x: 210, y: 100 });
    expect(useCanvasStore.getState().elements[0].width).toBe(160);
  });

  it("selects (does not resize) when clicking the card body", () => {
    useCanvasStore.setState({ selectedIds: [] });
    const manager = new InteractionManager(ctx);
    manager.handlePointerDown(
      { button: 0, metaKey: false, ctrlKey: false } as PointerEvent,
      { x: 100, y: 80 },
    );
    expect(useCanvasStore.getState().selectedIds).toEqual(["el-1"]);
  });

  it("flags the ew-resize cursor when hovering a handle", () => {
    const manager = new InteractionManager(ctx);
    manager.handlePointerMove({} as PointerEvent, { x: 150, y: 100 });
    expect(ctx.setCursor).toHaveBeenCalledWith("ew-resize");

    manager.handlePointerMove({} as PointerEvent, { x: 100, y: 40 });
    expect(ctx.setCursor).toHaveBeenLastCalledWith("default");
  });
});
