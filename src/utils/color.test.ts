import { describe, it, expect } from "vitest";
import { parseHexColor, getContrastTextColor, hexToNumber, resolveHeaderColor } from "./color";

describe("color utilities", () => {
  it("parses hex color correctly", () => {
    expect(parseHexColor("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor("#f00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("calculates contrast text color", () => {
    // Yellow or white should require dark text
    expect(getContrastTextColor("#fef08a")).toBe("#18181b");
    expect(getContrastTextColor("#ffffff")).toBe("#18181b");
    expect(getContrastTextColor("#eab308")).toBe("#18181b");

    // Blue, black, dark purple should require light text
    expect(getContrastTextColor("#000000")).toBe("#ffffff");
    expect(getContrastTextColor("#3b82f6")).toBe("#ffffff");
    expect(getContrastTextColor("#18181b")).toBe("#ffffff");
  });

  it("converts hex string to number", () => {
    expect(hexToNumber("#f97316")).toBe(0xf97316);
    expect(hexToNumber("3b82f6")).toBe(0x3b82f6);
  });

  it("softens header colors in dark mode only", () => {
    // Light mode keeps the original color untouched
    expect(resolveHeaderColor("#f97316", false)).toBe("#f97316");
    // Dark mode blends toward the dark card background (#18181b)
    expect(resolveHeaderColor("#f97316", true)).toBe("#ac5418");
    // The softened color is dimmer than the original
    expect(parseHexColor(resolveHeaderColor("#eab308", true)).r).toBeLessThan(0xea);
  });
});
