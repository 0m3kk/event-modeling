import { Container, Graphics, Text } from "pixi.js";
import { APP_FONT_FAMILY } from "@/constants/canvas";

export interface InfoBadgeStyle {
  /** Circle radius in canvas units. */
  radius: number;
  /** Circle stroke color. */
  stroke: number;
  strokeWidth?: number;
  /** "i" glyph color. */
  fill: number;
  fontSize: number;
  bold?: boolean;
  /** Overall opacity — badges dim when the card/row has no description yet. */
  alpha?: number;
  textResolution?: number;
}

/**
 * Draws the ⓘ description badge (circle + "i").
 *
 * The glyph is anchored at its own center and placed on the circle center, so
 * it stays optically centered regardless of font metrics. Hand-tuned offsets
 * (e.g. `center - 2`) drift to the right because a monospace advance width is
 * wider than the narrow "i" ink.
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
    textResolution,
  }: InfoBadgeStyle,
): void {
  g.circle(cx, cy, radius).stroke({ color: stroke, width: strokeWidth, alpha });

  const iText = new Text({
    text: "i",
    style: {
      fontSize,
      fontFamily: APP_FONT_FAMILY,
      fontWeight: bold ? "bold" : "normal",
      fill,
    },
    resolution: textResolution,
  });
  iText.anchor.set(0.5);
  iText.x = cx;
  iText.y = cy;
  iText.alpha = alpha;
  container.addChild(iText);
}
