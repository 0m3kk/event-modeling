import { Container, Graphics, Text } from "pixi.js";
import { APP_FONT_FAMILY } from "@/constants/canvas";

export interface InfoBadgeStyle {
  /** Circle radius in canvas units. */
  radius: number;
  /** Circle stroke color. */
  stroke: number;
  strokeWidth?: number;
  /** Glyph color. */
  fill: number;
  fontSize: number;
  bold?: boolean;
  /** Overall opacity — badges dim when the card/row has no description yet. */
  alpha?: number;
  /** Glyph to draw at the circle center (defaults to the description "i"). */
  glyph?: string;
  textResolution?: number;
}

/**
 * Draws a small circular badge (circle + centered glyph). Used for the ⓘ
 * description badge and the ✓ validation badge so both share one size/style.
 *
 * The glyph is anchored at its own center and placed on the circle center, so
 * it stays optically centered regardless of font metrics. Hand-tuned offsets
 * (e.g. `center - 2`) drift to the right because a monospace advance width is
 * wider than narrow glyph ink.
 */
export function drawInfoBadge(
  g: Graphics,
  container: Container,
  cx: number,
  cy: number,
  {
    radius,
    stroke,
    strokeWidth = 1,
    fill,
    fontSize,
    bold = false,
    alpha = 1,
    glyph = "i",
    textResolution,
  }: InfoBadgeStyle,
): void {
  g.circle(cx, cy, radius).stroke({ color: stroke, width: strokeWidth, alpha });

  const glyphText = new Text({
    text: glyph,
    style: {
      fontSize,
      fontFamily: APP_FONT_FAMILY,
      fontWeight: bold ? "bold" : "normal",
      fill,
    },
    resolution: textResolution,
  });
  glyphText.anchor.set(0.5);
  glyphText.x = cx;
  glyphText.y = cy;
  glyphText.alpha = alpha;
  container.addChild(glyphText);
}
