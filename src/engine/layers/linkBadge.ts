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
 * Draws the reference-copy badge — a vibrant sky blue circle with an interlocking chain-link glyph (🔗) —
 * on a card that is a reference copy instance.
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

/**
 * Draws the original master badge — a distinct violet circle with a 4-diamond master glyph (❖) —
 * on the canonical original card of a linked reference set.
 */
export function drawMasterBadge(
  g: Graphics,
  element: CanvasElement<any>,
  options: LinkBadgeOptions = {},
): void {
  const radius = options.radius ?? 9;
  const isDark = options.theme === "dark";
  const fill = options.fill ?? 0x8b5cf6; // violet / purple (#8b5cf6)
  const glyph = options.glyph ?? 0xffffff;
  const stroke = options.stroke ?? (isDark ? 0x27272a : 0xffffff);

  // Positioned in top-right corner inside card bounds
  const cx = element.width - 15;
  const cy = 16;

  // 1. Badge circular background with contrast border
  g.circle(cx, cy, radius)
    .fill({ color: fill })
    .stroke({ color: stroke, width: 1.5 });

  // 2. Master diamond icon (❖: 4 diamonds symmetrically arranged)
  const s = radius / 9;

  // Top diamond
  g.moveTo(cx, cy - 4.5 * s)
    .lineTo(cx + 1.8 * s, cy - 2.7 * s)
    .lineTo(cx, cy - 0.9 * s)
    .lineTo(cx - 1.8 * s, cy - 2.7 * s)
    .closePath()
    .fill({ color: glyph });

  // Bottom diamond
  g.moveTo(cx, cy + 4.5 * s)
    .lineTo(cx + 1.8 * s, cy + 2.7 * s)
    .lineTo(cx, cy + 0.9 * s)
    .lineTo(cx - 1.8 * s, cy + 2.7 * s)
    .closePath()
    .fill({ color: glyph });

  // Left diamond
  g.moveTo(cx - 4.5 * s, cy)
    .lineTo(cx - 2.7 * s, cy + 1.8 * s)
    .lineTo(cx - 0.9 * s, cy)
    .lineTo(cx - 2.7 * s, cy - 1.8 * s)
    .closePath()
    .fill({ color: glyph });

  // Right diamond
  g.moveTo(cx + 4.5 * s, cy)
    .lineTo(cx + 2.7 * s, cy + 1.8 * s)
    .lineTo(cx + 0.9 * s, cy)
    .lineTo(cx + 2.7 * s, cy - 1.8 * s)
    .closePath()
    .fill({ color: glyph });
}

/**
 * Universal dispatcher: draws either the Master badge or the Reference Copy badge.
 */
export function drawReferenceIndicator(
  g: Graphics,
  element: CanvasElement<any>,
  isOriginal: boolean,
  options: LinkBadgeOptions = {},
): void {
  if (isOriginal) {
    drawMasterBadge(g, element, options);
  } else {
    drawLinkBadge(g, element, options);
  }
}
