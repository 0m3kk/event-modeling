import { Container, Graphics } from "pixi.js";
import type { Rect, CanvasElement } from "@/types";

export class GizmoLayer extends Container {
  private marqueeGraphics = new Graphics();
  private boundsGraphics = new Graphics();

  constructor() {
    super();
    this.addChild(this.marqueeGraphics);
    this.addChild(this.boundsGraphics);
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

  drawSelectionBounds(selectedElements: CanvasElement[]) {
    this.boundsGraphics.clear();
    if (selectedElements.length <= 1) return; // Single items draw their own selection stroke in ElementLayer

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

  clear() {
    this.marqueeGraphics.clear();
    this.boundsGraphics.clear();
  }
}
