import { Container, Graphics } from "pixi.js";
import { Z_INDICES } from "@/constants/canvas";

export interface VisibleBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class GridLayer extends Container {
  private graphics: Graphics;
  private lastBoundsKey: string = "";

  constructor() {
    super();
    this.zIndex = Z_INDICES.GRID;
    this.graphics = new Graphics();
    this.addChild(this.graphics);
  }

  public renderGrid(bounds: VisibleBounds, zoom: number): void {
    // Determine grid step based on zoom level to maintain performance and visual clarity
    let step = 20;
    if (zoom < 0.25) {
      step = 80;
    } else if (zoom < 0.5) {
      step = 40;
    }

    const startX = Math.floor(bounds.left / step) * step;
    const endX = Math.ceil(bounds.right / step) * step;
    const startY = Math.floor(bounds.top / step) * step;
    const endY = Math.ceil(bounds.bottom / step) * step;

    const boundsKey = `${startX},${endX},${startY},${endY},${step}`;
    if (this.lastBoundsKey === boundsKey) {
      return;
    }
    this.lastBoundsKey = boundsKey;

    this.graphics.clear();

    const dotRadius = Math.max(1, 1.2 / Math.sqrt(zoom));
    const alpha = Math.min(0.5, 0.3 * Math.sqrt(zoom));

    for (let x = startX; x <= endX; x += step) {
      for (let y = startY; y <= endY; y += step) {
        this.graphics.circle(x, y, dotRadius).fill({ color: 0x9ca3af, alpha });
      }
    }
  }

  public override destroy(
    options?: boolean | import("pixi.js").DestroyOptions,
  ): void {
    this.graphics.destroy();
    super.destroy(options);
  }
}
