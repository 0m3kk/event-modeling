import { describe, it, expect } from "vitest";
import {
  computeExportTextResolution,
  computeTextResolution,
} from "./textResolution";

describe("computeTextResolution", () => {
  it("matches the device scale at 100% zoom", () => {
    // 1 texture pixel per screen pixel — no resampling blur.
    expect(computeTextResolution(1, 1)).toBe(1);
    expect(computeTextResolution(1, 2)).toBe(2);
    expect(computeTextResolution(1, 1.5)).toBe(2);
  });

  it("scales with zoom so text stays sharp when zoomed in", () => {
    expect(computeTextResolution(2, 2)).toBe(4);
    expect(computeTextResolution(2.5, 2)).toBe(5);
  });

  it("never drops below 1 and caps the texture size", () => {
    expect(computeTextResolution(0.1, 1)).toBe(1);
    expect(computeTextResolution(5, 3)).toBe(6);
  });
});

describe("computeExportTextResolution", () => {
  it("matches the export device scale, not the device pixel ratio", () => {
    // The RenderTexture resolution replaces the renderer's dpr, so text must
    // rasterize at the export scale exactly.
    expect(computeExportTextResolution(1)).toBe(1);
    expect(computeExportTextResolution(2)).toBe(2);
    expect(computeExportTextResolution(3)).toBe(3);
  });

  it("rounds sub-pixel scales up and clamps the texture size", () => {
    expect(computeExportTextResolution(0.5)).toBe(1);
    expect(computeExportTextResolution(2.2)).toBe(3);
    expect(computeExportTextResolution(99)).toBe(6);
  });
});
