/**
 * Color utility functions for canvas rendering and UI contrast
 */

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").trim();
  let fullHex = clean;
  if (clean.length === 3) {
    fullHex = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(fullHex, 16);
  if (isNaN(num)) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Returns '#18181b' (dark) or '#ffffff' (light) depending on perceived luminance
 */
export function getContrastTextColor(hex: string): string {
  const { r, g, b } = parseHexColor(hex);
  // YIQ luminance formula
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#18181b" : "#ffffff";
}

/**
 * Softens a card header color for dark mode.
 *
 * Card headers are large filled areas, so a vivid light-mode color is harsh
 * against the dark canvas. In dark mode we blend the color toward the dark
 * card background, which keeps the hue recognizable while lowering brightness
 * and saturation. Light mode returns the color unchanged.
 */
const DARK_HEADER_BLEND = 0.34;
const DARK_CARD_BG = { r: 0x18, g: 0x18, b: 0x1b };

export function resolveHeaderColor(hex: string, isDark: boolean): string {
  if (!isDark) return hex;
  const { r, g, b } = parseHexColor(hex);
  const blend = (channel: number, target: number) =>
    Math.round(channel * (1 - DARK_HEADER_BLEND) + target * DARK_HEADER_BLEND);
  const toHexPart = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHexPart(blend(r, DARK_CARD_BG.r))}${toHexPart(blend(g, DARK_CARD_BG.g))}${toHexPart(blend(b, DARK_CARD_BG.b))}`;
}

/**
 * Converts a hex string ('#f97316' or 'f97316') to a numeric color (0xf97316)
 */
export function hexToNumber(hex: string): number {
  const clean = hex.replace("#", "").trim();
  const num = parseInt(clean, 16);
  return isNaN(num) ? 0x000000 : num;
}
