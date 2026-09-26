import type { Graphics } from "pixi.js";

export interface LinkBadgeStyle {
  /** Circle radius in canvas units. */
  radius: number;
  /** Circle fill color. */
  fill: number;
  /** Chain-glyph stroke color. */
  glyph: number;
}

/**
 * Draws the reference-copy badge — a filled circle with a chain-link glyph —
 * on a card that belongs to a linked reference set. Mirrors the badge in the
 * main event-whiteboard app (src/components/ReferenceBadge.tsx).
 *
 * Drawn on the card's own Graphics so it needs no DOM and stays crisp at any
 * zoom. Call it last in a renderer so it sits above the header.
 */
export function drawLinkBadge(
  g: Graphics,
  cx: number,
  cy: number,
  { radius, fill, glyph }: LinkBadgeStyle,
): void {
  g.circle(cx, cy, radius)
    .fill({ color: fill })
    .stroke({ color: 0xffffff, width: Math.max(1, radius * 0.16) });

  // Two interlocking rings, matching the Link2 icon.
  const s = radius / 10;
  const ring = { color: glyph, width: 1.5 * s, cap: "round" as const };
  g.circle(cx - 2.6 * s, cy, 2.6 * s).stroke(ring);
  g.circle(cx + 2.6 * s, cy, 2.6 * s).stroke(ring);
}
