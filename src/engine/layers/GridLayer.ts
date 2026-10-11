import { Container, Graphics } from "pixi.js";
import type { ResolvedTheme, Viewport } from "@/types";

export class GridLayer extends Container {
  private graphics = new Graphics();

  constructor() {
    super();
    this.addChild(this.graphics);
  }

  renderGrid(viewport: Viewport, theme: ResolvedTheme) {
    this.graphics.clear();

    const isDark = theme === "dark";
    const dotColor = isDark ? 0x27272a : 0xe4e4e7;
    const dotAlpha = isDark ? 0.6 : 0.8;

    const gridSize = 24;
    const zoom = viewport.zoom;

    // Visible world bounds
    const worldLeft = -viewport.x / zoom;
    const worldTop = -viewport.y / zoom;
    const worldRight = worldLeft + viewport.screenWidth / zoom;
    const worldBottom = worldTop + viewport.screenHeight / zoom;

    const startX = Math.floor(worldLeft / gridSize) * gridSize;
    const endX = Math.ceil(worldRight / gridSize) * gridSize;
    const startY = Math.floor(worldTop / gridSize) * gridSize;
    const endY = Math.ceil(worldBottom / gridSize) * gridSize;

    const dotRadius = Math.max(1, 1.2 / Math.sqrt(zoom));

    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        this.graphics.circle(x, y, dotRadius);
      }
    }
    this.graphics.fill({ color: dotColor, alpha: dotAlpha });
  }
}
