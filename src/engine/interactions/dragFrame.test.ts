import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DragElementsInteraction } from "./DragElementsInteraction";
import type { InteractionContext } from "./types";
import { SpatialIndex } from "../SpatialIndex";
import { GizmoLayer } from "../layers/GizmoLayer";
import { ElementLayer } from "../layers/ElementLayer";
import { PreviewLayer } from "../layers/PreviewLayer";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

/**
 * Drag rendering is coalesced to one pass per animation frame. These tests
 * install a manual rAF so we can assert that several pointer moves produce a
 * single render, and that releasing flushes the final position.
 */
describe("DragElementsInteraction frame coalescing", () => {
  let ctx: InteractionContext;
  let elementLayer: ElementLayer;
  let gizmoLayer: GizmoLayer;
  let renderSpy: ReturnType<typeof vi.spyOn>;
  let frames: Array<() => void>;

  const element: CanvasElement = {
    id: "el-1",
    type: "stickyNote",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    data: {},
  };

  const flushFrames = () => {
    const pending = frames;
    frames = [];
    for (const cb of pending) cb();
  };

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const spatialIndex = new SpatialIndex();
    elementLayer = new ElementLayer();
    gizmoLayer = new GizmoLayer();
    const previewLayer = new PreviewLayer();

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

    renderSpy = vi
      .spyOn(elementLayer, "renderElements")
      .mockImplementation(() => undefined);
    vi.spyOn(gizmoLayer, "drawSelectionBounds").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders once for several moves within a frame", () => {
    const drag = new DragElementsInteraction();
    drag.onPointerDown({ button: 0 } as PointerEvent, { x: 10, y: 10 }, ctx);

    drag.onPointerMove({} as PointerEvent, { x: 40, y: 40 }, ctx);
    drag.onPointerMove({} as PointerEvent, { x: 60, y: 60 }, ctx);
    drag.onPointerMove({} as PointerEvent, { x: 80, y: 80 }, ctx);

    expect(renderSpy).not.toHaveBeenCalled();
    flushFrames();
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // The single render used the latest pointer position (+70, +70).
    const [elements] = renderSpy.mock.calls[0];
    const moved = (elements as CanvasElement[])[0];
    expect(moved.x).toBe(70);
    expect(moved.y).toBe(70);

    drag.onPointerUp({} as PointerEvent, { x: 80, y: 80 }, ctx);
  });

  it("commits the release position and clears the drag flag", () => {
    const drag = new DragElementsInteraction();
    drag.onPointerDown({ button: 0 } as PointerEvent, { x: 10, y: 10 }, ctx);

    drag.onPointerMove({} as PointerEvent, { x: 90, y: 90 }, ctx);
    flushFrames();
    drag.onPointerUp({} as PointerEvent, { x: 90, y: 90 }, ctx);

    const stored = useCanvasStore.getState().elements[0];
    expect(stored.x).toBe(80);
    expect(stored.y).toBe(80);
    expect(useCanvasStore.getState().isDragging).toBe(false);
  });
});
