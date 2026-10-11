import type { CanvasInteraction, InteractionContext } from "./types";
import type { Point } from "@/types";
import { useCanvasStore } from "@/store";
import {
  hitResizeHandle,
  isResizableElement,
  MIN_ELEMENT_WIDTH,
  type ResizeSide,
} from "../layers/GizmoLayer";

/**
 * Pure geometry for a width resize. `side` is the dragged handle; `dx` is the
 * total horizontal pointer travel since the gesture started.
 *
 * - Dragging the right handle moves the right edge (x stays put).
 * - Dragging the left handle moves the left edge (x follows the pointer) while
 *   the right edge stays anchored.
 * - Width is never allowed below `minWidth`; the anchored edge wins, so the
 *   pointer simply stops advancing the moving edge.
 */
export function computeResize(
  side: ResizeSide,
  start: { x: number; width: number },
  dx: number,
  minWidth = MIN_ELEMENT_WIDTH,
): { x: number; width: number } {
  let width = side === "right" ? start.width + dx : start.width - dx;
  let x = side === "left" ? start.x + dx : start.x;

  if (width < minWidth) {
    width = minWidth;
    if (side === "left") {
      x = start.x + start.width - minWidth;
    }
  }

  width = Math.round(width);
  if (side === "left") {
    // Re-derive x from the rounded width so the right edge stays exactly put.
    x = Math.round(start.x + start.width - width);
  }
  return { x, width };
}

/**
 * Drags a card's left/right edge to change its width. Only active in select
 * mode with exactly one card selected, when the pointer grabs one of the resize
 * handles drawn by {@link GizmoLayer}.
 */
export class ResizeElementInteraction implements CanvasInteraction {
  readonly id = "resizeElement";
  private active = false;
  private elementId: string | null = null;
  private side: ResizeSide = "right";
  private startWorld: Point = { x: 0, y: 0 };
  private start: { x: number; width: number } = { x: 0, width: 0 };
  private next: { x: number; width: number } = { x: 0, width: 0 };

  isActive(): boolean {
    return this.active;
  }

  onPointerDown(
    e: PointerEvent,
    worldPoint: Point,
    _ctx: InteractionContext,
  ): boolean {
    if (e.button !== 0) return false;

    const state = useCanvasStore.getState();
    if (state.tool !== "select" || state.selectedIds.length !== 1) return false;

    const element = state.elements.find((el) => el.id === state.selectedIds[0]);
    if (!element || element.locked) return false;
    if (!isResizableElement(element)) return false;

    const side = hitResizeHandle(element, worldPoint, state.viewport.zoom);
    if (!side) return false;

    this.active = true;
    this.elementId = element.id;
    this.side = side;
    this.startWorld = worldPoint;
    this.start = { x: element.x, width: element.width };
    this.next = { x: element.x, width: element.width };
    return true;
  }

  onPointerMove(_e: PointerEvent, worldPoint: Point, ctx: InteractionContext): void {
    if (!this.active || !this.elementId) return;

    const dx = worldPoint.x - this.startWorld.x;
    this.next = computeResize(this.side, this.start, dx, MIN_ELEMENT_WIDTH);

    const state = useCanvasStore.getState();
    const nextElements = state.elements.map((el) =>
      el.id === this.elementId ? { ...el, x: this.next.x, width: this.next.width } : el,
    );

    ctx.elementLayer.renderElements(
      nextElements,
      new Set(state.selectedIds),
      ctx.theme,
      state.viewport.zoom,
    );
    ctx.gizmoLayer.drawSelectionBounds(
      nextElements.filter((el) => el.id === this.elementId),
      state.viewport.zoom,
    );
    ctx.setCursor("ew-resize");
  }

  onPointerUp(_e: PointerEvent, _worldPoint: Point, _ctx: InteractionContext): void {
    if (!this.active || !this.elementId) return;

    const id = this.elementId;
    const patch = { x: this.next.x, width: this.next.width };
    const changed = this.next.x !== this.start.x || this.next.width !== this.start.width;
    this.reset();

    // Commit once so the whole gesture is a single undo step.
    if (changed) {
      useCanvasStore.getState().updateElement(id, patch);
    }
  }

  onCancel(ctx: InteractionContext): void {
    if (!this.active) return;
    const id = this.elementId;
    this.reset();
    if (!id) return;

    // Re-render from the committed store state to discard the preview.
    const state = useCanvasStore.getState();
    ctx.elementLayer.renderElements(
      state.elements,
      new Set(state.selectedIds),
      ctx.theme,
      state.viewport.zoom,
    );
    ctx.gizmoLayer.drawSelectionBounds(
      state.elements.filter((el) => el.id === id),
      state.viewport.zoom,
    );
  }

  private reset() {
    this.active = false;
    this.elementId = null;
    this.start = { x: 0, width: 0 };
    this.next = { x: 0, width: 0 };
  }
}
