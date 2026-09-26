import { Container, Graphics } from "pixi.js";
import type { CanvasObject } from "@/types";
import type { AlignmentGuide } from "@/store/types";
import { Z_INDICES } from "@/constants/canvas";
import type { VisibleBounds } from "./GridLayer";

export interface MarqueeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class GizmoLayer extends Container {
  private selectionGraphics: Graphics;
  private marqueeGraphics: Graphics;
  private guidesGraphics: Graphics;

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

  public renderSelection(selectedObjects: CanvasObject[]): void {
    this.selectionGraphics.clear();

    const handleSize = 6;
    const padding = 2;

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
        .stroke({ color: 0x2563eb, width: 2, alpha: 0.9 });

      // Corner handles
      const corners = [
        { cx: x, cy: y },
        { cx: x + w, cy: y },
        { cx: x, cy: y + h },
        { cx: x + w, cy: y + h },
      ];

      for (const corner of corners) {
        this.selectionGraphics
          .rect(
            corner.cx - handleSize / 2,
            corner.cy - handleSize / 2,
            handleSize,
            handleSize,
          )
          .fill({ color: 0xffffff })
          .stroke({ color: 0x2563eb, width: 1.5 });
      }
    }
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
