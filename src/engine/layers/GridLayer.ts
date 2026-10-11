import { Container, Graphics } from "pixi.js";
import type { ResolvedTheme, Viewport } from "@/types";

/** World-space spacing of the base dot grid. */
const BASE_GRID_SIZE = 24;
/**
 * Smallest on-screen distance (px) allowed between grid dots. The world-space
 * step is doubled until the on-screen spacing clears this, so the number of
 * dots stays bounded no matter how far the user zooms.
 *
 * The previous implementation drew one dot per world cell across the whole
 * visible area, so the dot count grew as `1 / zoom²` (≈100k circles at 17%
 * zoom) and rebuilding that geometry on every pan frame was the main cause of
 * the lag. Here the grid coarsens instead, keeping the dot count flat.
 */
const MIN_SCREEN_SPACING = 24;

/**
 * Screen-space dot grid. It lives directly under the stage (not under the
 * zoomed world container): the dot pattern is pre-built once per zoom level and
 * panning only slides the layer, which is O(1) instead of O(dots).
 */
export class GridLayer extends Container {
  private graphics = new Graphics();

  /** On-screen spacing the current dot pattern was built with. */
  private spacing = BASE_GRID_SIZE;
  /** Signature of the last built pattern; lets panning skip a rebuild. */
  private signature = "";

  constructor() {
    super();
    this.eventMode = "none";
    this.graphics.eventMode = "none";
    this.addChild(this.graphics);
  }

  /**
   * Rebuilds the dot pattern. Only runs when the on-screen spacing, viewport
   * size or theme changes — panning is handled by {@link updatePosition}, which
   * just slides the pre-built geometry.
   */
  renderGrid(viewport: Viewport, theme: ResolvedTheme) {
    const isDark = theme === "dark";
    const color = isDark ? 0x27272a : 0xe4e4e7;
    const alpha = isDark ? 0.6 : 0.8;
    const zoom = viewport.zoom || 1;

    // Coarsen the grid by powers of two so dot density stays bounded.
    let worldStep = BASE_GRID_SIZE;
    while (worldStep * zoom < MIN_SCREEN_SPACING) worldStep *= 2;

    const spacing = worldStep * zoom;
    const dotRadius = Math.max(0.75, Math.min(3, 1.2 * Math.sqrt(zoom)));

    const signature = `${spacing.toFixed(3)}|${viewport.screenWidth}|${viewport.screenHeight}|${color}|${dotRadius.toFixed(3)}`;
    if (signature === this.signature) return;

    this.signature = signature;
    this.spacing = spacing;

    const g = this.graphics;
    g.clear();

    // One extra row/column beyond the screen so a pan of up to one cell never
    // exposes an empty edge.
    const cols = Math.ceil(viewport.screenWidth / spacing) + 1;
    const rows = Math.ceil(viewport.screenHeight / spacing) + 1;
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        g.circle(i * spacing, j * spacing, dotRadius);
      }
    }
    g.fill({ color, alpha });
  }

  /**
   * Slides the dot pattern so it stays locked to the world grid. O(1), and all
   * that runs while the user pans.
   */
  updatePosition(viewport: Viewport) {
    const s = this.spacing || BASE_GRID_SIZE;
    this.x = ((viewport.x % s) + s) % s;
    this.y = ((viewport.y % s) + s) % s;
  }

  clear() {
    this.graphics.clear();
    this.signature = "";
  }
}
