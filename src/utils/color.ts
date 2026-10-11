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
 * Converts a hex string ('#f97316' or 'f97316') to a numeric color (0xf97316)
 */
export function hexToNumber(hex: string): number {
  const clean = hex.replace("#", "").trim();
  const num = parseInt(clean, 16);
  return isNaN(num) ? 0x000000 : num;
}
