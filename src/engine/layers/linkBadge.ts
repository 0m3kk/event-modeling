import { Graphics } from "pixi.js";
import type { CanvasElement, ResolvedTheme } from "@/types";

export interface LinkBadgeOptions {
  radius?: number;
  fill?: number;
  glyph?: number;
  stroke?: number;
  theme?: ResolvedTheme;
}

/**
 * Draws the reference-copy badge — a vibrant filled circle with an interlocking chain-link glyph —
 * on a card that belongs to a linked reference set.
 *
 * Positioned in the top-right corner inside card bounds, staying crisp at any zoom level.
 */
export function drawLinkBadge(
  g: Graphics,
  element: CanvasElement<any>,
  options: LinkBadgeOptions = {},
): void {
  const radius = options.radius ?? 9;
  const isDark = options.theme === "dark";
  const fill = options.fill ?? 0x0284c7; // vibrant sky blue (#0284c7)
  const glyph = options.glyph ?? 0xffffff;
  const stroke = options.stroke ?? (isDark ? 0x27272a : 0xffffff);

  // Positioned in top-right corner inside card bounds
  const cx = element.width - 15;
  const cy = 16;

  // 1. Badge circular background with contrast border
  g.circle(cx, cy, radius)
    .fill({ color: fill })
    .stroke({ color: stroke, width: 1.5 });

  // 2. Interlocking chain link glyph (angled at 45° like standard Link2 icon)
  const s = radius / 9;
  const ring = { color: glyph, width: 1.4 * s, cap: "round" as const };

  // Bottom-left loop
  g.circle(cx - 2 * s, cy + 2 * s, 2.2 * s).stroke(ring);
  // Top-right loop
  g.circle(cx + 2 * s, cy - 2 * s, 2.2 * s).stroke(ring);
  // Connecting link line
  g.moveTo(cx - 1.2 * s, cy + 1.2 * s)
    .lineTo(cx + 1.2 * s, cy - 1.2 * s)
    .stroke(ring);
}
