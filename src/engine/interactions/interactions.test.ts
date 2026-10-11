import { describe, it, expect, beforeEach, vi } from "vitest";
import { InteractionManager } from "./InteractionManager";
import { PanInteraction } from "./PanInteraction";
import { MarqueeInteraction } from "./MarqueeInteraction";
import { DragElementsInteraction } from "./DragElementsInteraction";
import type { InteractionContext } from "./types";
import { SpatialIndex } from "../SpatialIndex";
import { GizmoLayer } from "../layers/GizmoLayer";
import { ElementLayer } from "../layers/ElementLayer";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

describe("Interaction System", () => {
  let ctx: InteractionContext;
  let spatialIndex: SpatialIndex;
  let gizmoLayer: GizmoLayer;
  let elementLayer: ElementLayer;

  beforeEach(() => {
    spatialIndex = new SpatialIndex();
    gizmoLayer = new GizmoLayer();
    elementLayer = new ElementLayer();

    ctx = {
      screenToWorld: (x, y) => ({ x, y }),
      worldToScreen: (x, y) => ({ x, y }),
      spatialIndex,
      gizmoLayer,
      elementLayer,
      setCursor: vi.fn(),
      theme: "light",
      isSpaceHeld: () => false,
    };

    useCanvasStore.setState({
      elements: [],
      selectedIds: [],
      tool: "select",
      viewport: { x: 0, y: 0, zoom: 1, screenWidth: 800, screenHeight: 600 },
    });
  });

  describe("PanInteraction", () => {
    it("activates when dragging empty space without Cmd/Ctrl", () => {
      const pan = new PanInteraction();
      const event = { button: 0, clientX: 100, clientY: 100, metaKey: false, ctrlKey: false } as PointerEvent;

      const started = pan.onPointerDown(event, { x: 100, y: 100 }, ctx);
      expect(started).toBe(true);
      expect(pan.isActive()).toBe(true);

      // Move
      pan.onPointerMove({ clientX: 150, clientY: 120 } as PointerEvent, { x: 150, y: 120 }, ctx);
      expect(useCanvasStore.getState().viewport.x).toBe(50);
      expect(useCanvasStore.getState().viewport.y).toBe(20);

      // Up
      pan.onPointerUp({} as PointerEvent, { x: 150, y: 120 }, ctx);
      expect(pan.isActive()).toBe(false);
    });

    it("clears selection when clicking empty space without moving", () => {
      useCanvasStore.setState({ selectedIds: ["el-1"] });
      const pan = new PanInteraction();
      const event = { button: 0, clientX: 100, clientY: 100, metaKey: false, ctrlKey: false } as PointerEvent;

      pan.onPointerDown(event, { x: 100, y: 100 }, ctx);
      pan.onPointerUp({} as PointerEvent, { x: 100, y: 100 }, ctx);

      expect(useCanvasStore.getState().selectedIds).toEqual([]);
    });
  });

  describe("MarqueeInteraction", () => {
    it("activates ONLY when Command or Ctrl is held on empty space", () => {
      const marquee = new MarqueeInteraction();

      // Without Cmd -> should NOT start
      const normalEvent = { button: 0, metaKey: false, ctrlKey: false } as PointerEvent;
      expect(marquee.onPointerDown(normalEvent, { x: 50, y: 50 }, ctx)).toBe(false);

      // With Cmd -> should start
      const cmdEvent = { button: 0, metaKey: true, ctrlKey: false } as PointerEvent;
      expect(marquee.onPointerDown(cmdEvent, { x: 50, y: 50 }, ctx)).toBe(true);
      expect(marquee.isActive()).toBe(true);
    });
  });

  describe("InteractionManager", () => {
    it("routes to DragElements when clicking on an element", () => {
      const element: CanvasElement = {
        id: "el-1",
        type: "stickyNote",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        data: {},
      };
      useCanvasStore.setState({ elements: [element] });
      spatialIndex.rebuild([element]);

      const manager = new InteractionManager(ctx);
      const hitEvent = { button: 0, clientX: 60, clientY: 60, metaKey: false, ctrlKey: false } as PointerEvent;

      manager.handlePointerDown(hitEvent, { x: 60, y: 60 });
      expect(useCanvasStore.getState().selectedIds).toEqual(["el-1"]);
    });

    it("routes to Marquee when Cmd is held on empty space", () => {
      const manager = new InteractionManager(ctx);
      const cmdEvent = { button: 0, clientX: 10, clientY: 10, metaKey: true, ctrlKey: false } as PointerEvent;

      const handled = manager.handlePointerDown(cmdEvent, { x: 10, y: 10 });
      expect(handled).toBe(true);
    });

    it("routes to Pan when dragging empty space without Cmd", () => {
      const manager = new InteractionManager(ctx);
      const emptyDragEvent = { button: 0, clientX: 10, clientY: 10, metaKey: false, ctrlKey: false } as PointerEvent;

      const handled = manager.handlePointerDown(emptyDragEvent, { x: 10, y: 10 });
      expect(handled).toBe(true);
    });
  });
});
