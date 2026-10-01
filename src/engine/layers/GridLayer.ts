import {
  Container,
  Graphics,
  Rectangle,
  TilingSprite,
  type Renderer,
  type Texture,
} from "pixi.js";
import { Z_INDICES } from "@/constants/canvas";

export interface VisibleBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Dot grid drawn as one small tile texture repeated by a TilingSprite, so a pan
 * or zoom only offsets the texture instead of rebuilding thousands of vector
 * circles. The tile is baked once per zoom bucket and the sprite is snapped to
 * the world grid, keeping the dots on the same multiples of `step` the old
 * per-dot Graphics drew.
 */
export class GridLayer extends Container {
  private tileSource: Graphics;
  private tileTexture: Texture | null = null;
  private sprite: TilingSprite | null = null;
  private lastTileKey: string = "";
  private lastBoundsKey: string = "";

  constructor() {
    super();
    this.zIndex = Z_INDICES.GRID;
    // Kept off-tree: only used as the source shape when (re)baking the tile.
    this.tileSource = new Graphics();
  }

  public renderGrid(
    bounds: VisibleBounds,
    zoom: number,
    renderer: Renderer,
  ): void {
    // Determine grid step based on zoom level to maintain performance and visual clarity
    let step = 20;
    if (zoom < 0.25) {
      step = 80;
    } else if (zoom < 0.5) {
      step = 40;
    }

    const dotRadius = Math.max(1, 1.2 / Math.sqrt(zoom));
    const alpha = Math.min(0.5, 0.3 * Math.sqrt(zoom));
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    // Bucket the zoom-dependent styling so a continuous zoom gesture never
    // re-bakes the tile; the drift within a bucket is imperceptible.
    const radiusKey = Math.round(dotRadius * 4) / 4;
    const alphaKey = Math.round(alpha * 10) / 10;
    const resolutionKey = Math.min(6, Math.max(1, Math.ceil(zoom * dpr)));
    const tileKey = [step, radiusKey, alphaKey, resolutionKey].join(",");

    if (tileKey !== this.lastTileKey) {
      this.bakeTile(step, radiusKey, alphaKey, resolutionKey, renderer);
      this.lastTileKey = tileKey;
    }

    // Snap the sprite to the world grid so the baked dots land exactly on the
    // multiples of `step`, then let the camera transform carry it along.
    const startX = Math.floor(bounds.left / step) * step;
    const endX = Math.ceil(bounds.right / step) * step;
    const startY = Math.floor(bounds.top / step) * step;
    const endY = Math.ceil(bounds.bottom / step) * step;

    const boundsKey = `${startX},${endX},${startY},${endY},${step}`;
    if (this.sprite && boundsKey !== this.lastBoundsKey) {
      this.lastBoundsKey = boundsKey;
      // The baked dot sits at the tile center, so shift by half a tile to put
      // dots on the grid; pad one extra tile so edge dots stay inside the sprite.
      this.sprite.position.set(startX - step / 2 - step, startY - step / 2 - step);
      this.sprite.width = endX - startX + 3 * step;
      this.sprite.height = endY - startY + 3 * step;
    }
  }

  private bakeTile(
    step: number,
    dotRadius: number,
    alpha: number,
    resolution: number,
    renderer: Renderer,
  ): void {
    if (this.sprite) {
      this.removeChild(this.sprite);
      this.sprite.destroy();
      this.sprite = null;
    }
    if (this.tileTexture) {
      this.tileTexture.destroy(true);
      this.tileTexture = null;
    }

    this.tileSource.clear();
    this.tileSource.circle(step / 2, step / 2, dotRadius);
    this.tileSource.fill({ color: 0x9ca3af, alpha });

    this.tileTexture = renderer.generateTexture({
      target: this.tileSource,
      frame: new Rectangle(0, 0, step, step),
      resolution,
    });

    this.sprite = new TilingSprite({
      texture: this.tileTexture,
      width: step,
      height: step,
    });
    this.addChild(this.sprite);
    this.lastBoundsKey = "";
  }

  public override destroy(
    options?: boolean | import("pixi.js").DestroyOptions,
  ): void {
    this.sprite?.destroy();
    this.sprite = null;
    this.tileTexture?.destroy(true);
    this.tileTexture = null;
    this.tileSource.destroy(
      typeof options === "object" ? options : undefined,
    );
    super.destroy(options);
  }
}
