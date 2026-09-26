import { describe, it, expect } from "vitest";
import { computeTextResolution } from "./textResolution";

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
