import { Container, Graphics } from "pixi.js";
import type { CanvasObject } from "@/types";
import { Z_INDICES } from "@/constants/canvas";

export class VisualLinkLayer extends Container {
  private graphics: Graphics;
  private animTime: number = 0;
  private currentHighlights: CanvasObject[] = [];

  constructor() {
    super();
    this.zIndex = Z_INDICES.VISUAL_LINKS;
    this.graphics = new Graphics();
    this.addChild(this.graphics);
  }

  public updateAnimation(deltaMs: number): void {
    this.animTime += deltaMs;
    if (this.currentHighlights.length > 0) {
      this.drawHighlights();
    }
  }

  public renderHighlights(highlightedObjects: CanvasObject[]): void {
    this.currentHighlights = highlightedObjects;
    this.drawHighlights();
  }

  public clearHighlights(): void {
    this.currentHighlights = [];
    this.graphics.clear();
  }

  private drawHighlights(): void {
    this.graphics.clear();
    if (this.currentHighlights.length === 0) return;

    // Smooth sinusoidal pulsing
    const pulseAlpha = 0.55 + 0.35 * Math.sin(this.animTime / 160);

    for (const obj of this.currentHighlights) {
      // 1. Soft outer halo
      const outerPadding = 8;
      this.graphics
        .roundRect(
          obj.x - outerPadding,
          obj.y - outerPadding,
          obj.width + outerPadding * 2,
          obj.height + outerPadding * 2,
          14,
        )
        .stroke({
          color: 0x38bdf8,
          width: 2,
          alpha: pulseAlpha * 0.45,
        });

      // 2. Crisp inner highlight border
      const innerPadding = 4;
      this.graphics
        .roundRect(
          obj.x - innerPadding,
          obj.y - innerPadding,
          obj.width + innerPadding * 2,
          obj.height + innerPadding * 2,
          10,
        )
        .stroke({
          color: 0x0284c7,
          width: 2.5,
          alpha: pulseAlpha,
        });
    }
  }

  public override destroy(
    options?: boolean | import("pixi.js").DestroyOptions,
  ): void {
    this.graphics.destroy();
    super.destroy(options);
  }
}
