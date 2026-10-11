import { describe, it, expect, beforeEach } from "vitest";
import {
  beginDescZones,
  addDescZone,
  clearDescZones,
  hitDescZone,
} from "./descZones";

describe("descZones registry", () => {
  beforeEach(() => {
    clearDescZones("el-1");
    clearDescZones("el-2");
  });

  it("hits a registered zone and misses outside it", () => {
    beginDescZones("el-1");
    addDescZone("el-1", {
      elementId: "el-1",
      fieldIndex: 0,
      sectionIndex: 0,
      text: "Row note",
      iconBounds: { x: 100, y: 50, width: 18, height: 18 },
    });

    expect(hitDescZone("el-1", { x: 108, y: 58 })?.text).toBe("Row note");
    expect(hitDescZone("el-1", { x: 90, y: 58 })).toBeNull();
    expect(hitDescZone("el-1", { x: 108, y: 20 })).toBeNull();
  });

  it("returns the header zone when no field is set", () => {
    beginDescZones("el-1");
    addDescZone("el-1", {
      elementId: "el-1",
      text: "Card note",
      iconBounds: { x: 200, y: 8, width: 18, height: 18 },
    });

    const hit = hitDescZone("el-1", { x: 205, y: 12 });
    expect(hit?.text).toBe("Card note");
    expect(hit?.fieldIndex).toBeUndefined();
  });

  it("keeps zones isolated per element", () => {
    beginDescZones("el-1");
    addDescZone("el-1", {
      elementId: "el-1",
      text: "One",
      iconBounds: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(hitDescZone("el-2", { x: 5, y: 5 })).toBeNull();
  });

  it("begin() resets previous zones for the element", () => {
    beginDescZones("el-1");
    addDescZone("el-1", {
      elementId: "el-1",
      text: "Old",
      iconBounds: { x: 0, y: 0, width: 10, height: 10 },
    });
    beginDescZones("el-1");
    expect(hitDescZone("el-1", { x: 5, y: 5 })).toBeNull();
  });
});
