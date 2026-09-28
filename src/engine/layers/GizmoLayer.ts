import { Container, Graphics } from "pixi.js";
import type { CanvasObject } from "@/types";
import type { AlignmentGuide } from "@/store/types";
import { Z_INDICES } from "@/constants/canvas";
import type { ResizeHandle } from "@/utils/cardDimensions";
import type { VisibleBounds } from "./GridLayer";

export interface MarqueeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getCursorForHandle(handle: ResizeHandle): string {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "n":
    case "s":
      return "ns-resize";
  }
}

interface ActiveHandleInfo {
  handle: ResizeHandle;
  cx: number;
  cy: number;
  objectId: string;
}

export class GizmoLayer extends Container {
  private selectionGraphics: Graphics;
  private marqueeGraphics: Graphics;
  private guidesGraphics: Graphics;
  private activeHandles: ActiveHandleInfo[] = [];

  constructor() {
    super();
    this.zIndex = Z_INDICES.GIZMOS;
    this.selectionGraphics = new Graphics();
    this.marqueeGraphics = new Graphics();
    this.guidesGraphics = new Graphics();

    this.addChild(this.selectionGraphics);
    this.addChild(this.marqueeGraphics);
    this.addChild(this.guidesGraphics);
  }

  public renderSelection(
    selectedObjects: CanvasObject[],
    zoom: number = 1,
  ): void {
    this.selectionGraphics.clear();
    this.activeHandles = [];

    const padding = 2;
    const strokeWidth = Math.max(1.5, 2 / zoom);
    const handleStrokeWidth = Math.max(1, 1.5 / zoom);

    for (const obj of selectedObjects) {
      // Connectors have no box of their own — their selected state is drawn by
      // the connector layer (thicker blue stroke).
      if (obj.type === "connector") continue;

      const x = obj.x - padding;
      const y = obj.y - padding;
      const w = obj.width + padding * 2;
      const h = obj.height + padding * 2;

      // Selection bounding box
      this.selectionGraphics
        .roundRect(x, y, w, h, 8)
        .stroke({ color: 0x2563eb, width: strokeWidth, alpha: 0.9 });
    }

    // Only render interactive resize handles when a single, unlocked object is selected
    const resizable =
      selectedObjects.length === 1 &&
      !selectedObjects[0].locked &&
      selectedObjects[0].type !== "connector"
        ? selectedObjects[0]
        : null;

    if (resizable) {
      const rx = resizable.x - padding;
      const ry = resizable.y - padding;
      const rw = resizable.width + padding * 2;
      const rh = resizable.height + padding * 2;

      // Only left & right handles are shown since card height is content-driven
      const handles: { handle: ResizeHandle; cx: number; cy: number }[] = [
        { handle: "w", cx: rx, cy: ry + rh / 2 },
        { handle: "e", cx: rx + rw, cy: ry + rh / 2 },
      ];

      const handleWidth = 6 / zoom;
      const handleHeight = 16 / zoom;
      const handleRadius = 2.5 / zoom;

      for (const h of handles) {
        this.activeHandles.push({ ...h, objectId: resizable.id });
        this.selectionGraphics
          .roundRect(
            h.cx - handleWidth / 2,
            h.cy - handleHeight / 2,
            handleWidth,
            handleHeight,
            handleRadius,
          )
          .fill({ color: 0xffffff })
          .stroke({ color: 0x2563eb, width: handleStrokeWidth });
      }
    }
  }

  public getHandleAt(
    worldX: number,
    worldY: number,
    zoom: number,
  ): { handle: ResizeHandle; objectId: string } | null {
    if (this.activeHandles.length === 0) return null;

    // Hit tolerance in screen pixels converted to world units
    const hitToleranceX = 10 / zoom;
    const hitToleranceY = 12 / zoom;

    for (const h of this.activeHandles) {
      const dx = Math.abs(worldX - h.cx);
      const dy = Math.abs(worldY - h.cy);
      if (dx <= hitToleranceX && dy <= hitToleranceY) {
        return { handle: h.handle, objectId: h.objectId };
      }
    }
    return null;
  }


  public renderMarquee(marquee: MarqueeBox | null): void {
    this.marqueeGraphics.clear();
    if (!marquee || (marquee.width === 0 && marquee.height === 0)) return;

    const x = Math.min(marquee.x, marquee.x + marquee.width);
    const y = Math.min(marquee.y, marquee.y + marquee.height);
    const w = Math.abs(marquee.width);
    const h = Math.abs(marquee.height);

    this.marqueeGraphics
      .rect(x, y, w, h)
      .fill({ color: 0x3b82f6, alpha: 0.12 })
      .stroke({ color: 0x2563eb, width: 1, alpha: 0.8 });
  }

  public renderGuides(guides: AlignmentGuide[], bounds: VisibleBounds): void {
    this.guidesGraphics.clear();
    if (guides.length === 0) return;

    for (const guide of guides) {
      if (guide.axis === "x") {
        // Vertical guideline across visible height
        this.guidesGraphics
          .moveTo(guide.position, bounds.top)
          .lineTo(guide.position, bounds.bottom)
          .stroke({ color: 0x0284c7, width: 1, alpha: 0.75 });
      } else {
        // Horizontal guideline across visible width
        this.guidesGraphics
          .moveTo(bounds.left, guide.position)
          .lineTo(bounds.right, guide.position)
          .stroke({ color: 0x0284c7, width: 1, alpha: 0.75 });
      }
    }
  }

  public override destroy(
    options?: boolean | import("pixi.js").DestroyOptions,
  ): void {
    this.selectionGraphics.destroy();
    this.marqueeGraphics.destroy();
    this.guidesGraphics.destroy();
    super.destroy(options);
  }
}
