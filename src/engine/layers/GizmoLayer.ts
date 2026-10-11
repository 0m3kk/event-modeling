import { Container, Graphics } from "pixi.js";
import type { Rect, CanvasElement, Point } from "@/types";

/** On-screen size (px) of a resize handle, kept constant across zoom levels. */
export const RESIZE_HANDLE_SIZE = 10;
/** On-screen square hit target (px) around a resize handle. */
export const RESIZE_HANDLE_HIT = 18;
/** Smallest width a card may be resized to, in world units. */
export const MIN_ELEMENT_WIDTH = 80;

export type ResizeSide = "left" | "right";

/** World-space centers of a card's left/right resize handles (mid-height). */
export function getResizeHandleCenters(element: CanvasElement): {
  left: Point;
  right: Point;
} {
  const cy = element.y + element.height / 2;
  return {
    left: { x: element.x, y: cy },
    right: { x: element.x + element.width, y: cy },
  };
}

/**
 * Returns which resize handle (if any) sits under a world-space point. The hit
 * target is defined in screen space so it stays usable at any zoom level; the
 * nearer handle wins when a card is narrow enough for the two to overlap.
 */
export function hitResizeHandle(
  element: CanvasElement,
  worldPoint: Point,
  zoom = 1,
): ResizeSide | null {
  const scale = zoom || 1;
  const half = RESIZE_HANDLE_HIT / scale / 2;
  const centers = getResizeHandleCenters(element);

  const near = (c: Point) =>
    Math.abs(worldPoint.x - c.x) <= half && Math.abs(worldPoint.y - c.y) <= half;

  const leftHit = near(centers.left);
  const rightHit = near(centers.right);

  if (leftHit && rightHit) {
    const dl = Math.abs(worldPoint.x - centers.left.x);
    const dr = Math.abs(worldPoint.x - centers.right.x);
    return dl <= dr ? "left" : "right";
  }
  if (leftHit) return "left";
  if (rightHit) return "right";
  return null;
}

export class GizmoLayer extends Container {
  private marqueeGraphics = new Graphics();
  private boundsGraphics = new Graphics();
  private handlesGraphics = new Graphics();

  constructor() {
    super();
    this.addChild(this.marqueeGraphics);
    this.addChild(this.boundsGraphics);
    this.addChild(this.handlesGraphics);
  }

  drawMarquee(rect: Rect | null) {
    this.marqueeGraphics.clear();
    if (!rect) return;

    const x = rect.width < 0 ? rect.x + rect.width : rect.x;
    const y = rect.height < 0 ? rect.y + rect.height : rect.y;
    const w = Math.abs(rect.width);
    const h = Math.abs(rect.height);

    this.marqueeGraphics.rect(x, y, w, h);
    this.marqueeGraphics.fill({ color: 0x3b82f6, alpha: 0.12 });
    this.marqueeGraphics.stroke({ color: 0x3b82f6, width: 1 });
  }

  drawSelectionBounds(selectedElements: CanvasElement[], zoom = 1) {
    this.boundsGraphics.clear();
    this.handlesGraphics.clear();

    // Single selection: the card draws its own selection stroke, so the gizmo
    // only contributes the left/right resize handles.
    if (selectedElements.length === 1) {
      this.drawResizeHandles(selectedElements[0], zoom);
      return;
    }

    if (selectedElements.length <= 1) return; // 0 items: nothing to draw.

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of selectedElements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }

    if (minX !== Infinity) {
      const pad = 6;
      this.boundsGraphics.rect(
        minX - pad,
        minY - pad,
        maxX - minX + pad * 2,
        maxY - minY + pad * 2,
      );
      this.boundsGraphics.stroke({ color: 0x3b82f6, width: 1.5, alpha: 0.8 });
    }
  }

  /**
   * Draws the two square handles used to resize a card's width. Sizes are
   * divided by zoom so they keep a constant on-screen footprint.
   */
  private drawResizeHandles(element: CanvasElement, zoom: number) {
    const scale = zoom || 1;
    const size = RESIZE_HANDLE_SIZE / scale;
    const r = size / 2;
    const centers = getResizeHandleCenters(element);

    for (const c of [centers.left, centers.right]) {
      this.handlesGraphics.roundRect(c.x - r, c.y - r, size, size, 2 / scale);
      this.handlesGraphics.fill({ color: 0xffffff });
      this.handlesGraphics.stroke({ color: 0x3b82f6, width: 1.5 / scale });
    }
  }

  clear() {
    this.marqueeGraphics.clear();
    this.boundsGraphics.clear();
    this.handlesGraphics.clear();
  }
}
