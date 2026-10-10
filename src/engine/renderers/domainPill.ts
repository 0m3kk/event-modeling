import { Container, Graphics, Text } from "pixi.js";
import { APP_FONT_FAMILY } from "@/constants/canvas";

export const DOMAIN_PILL_HEIGHT = 16;
const PILL_PADDING_X = 7;
const PILL_FONT_SIZE = 9;

function makeLabel(domain: string, fill: number, textResolution?: number): Text {
  return new Text({
    text: domain,
    style: {
      fontSize: PILL_FONT_SIZE,
      fontWeight: "bold",
      fontFamily: APP_FONT_FAMILY,
      fill,
    },
    resolution: textResolution,
  });
}

/** Width a domain pill occupies (label width + horizontal padding). */
export function measureDomainPill(
  domain: string,
  textResolution?: number,
): number {
  const label = makeLabel(domain, 0x000000, textResolution);
  const width = Math.ceil(label.width) + PILL_PADDING_X * 2;
  label.destroy();
  return width;
}

/**
 * Draws the domain pill shown next to an element card's title, at the given
 * top-left position. Inverted against the colored header (light fill, header
 * color text) so it reads on every kind color. Returns the pill width.
 */
export function drawDomainPill(
  g: Graphics,
  container: Container,
  x: number,
  y: number,
  domain: string,
  opts: { headerColor: number; textResolution?: number },
): number {
  const label = makeLabel(domain, opts.headerColor, opts.textResolution);

  const width = Math.ceil(label.width) + PILL_PADDING_X * 2;
  g.roundRect(x, y, width, DOMAIN_PILL_HEIGHT, DOMAIN_PILL_HEIGHT / 2)
    .fill({ color: 0xffffff, alpha: 0.85 })
    .stroke({ color: opts.headerColor, width: 1, alpha: 0.5 });

  label.x = x + PILL_PADDING_X;
  label.y = y + (DOMAIN_PILL_HEIGHT - label.height) / 2;
  container.addChild(label);

  return width;
}
