import { describe, expect, it } from "vitest";
import {
  bumpCanvasRevision,
  getCanvasRevision,
  resetCanvasRevision,
} from "./canvasRevision";

describe("canvasRevision", () => {
  it("increments monotonically and resets", () => {
    resetCanvasRevision();
    expect(getCanvasRevision()).toBe(0);
    bumpCanvasRevision();
    expect(getCanvasRevision()).toBe(1);
    bumpCanvasRevision();
    expect(getCanvasRevision()).toBe(2);
    resetCanvasRevision();
    expect(getCanvasRevision()).toBe(0);
  });
});
