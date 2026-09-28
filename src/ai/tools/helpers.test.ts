import { describe, expect, it } from "vitest";
import type { CanvasObject } from "@/types";
import type { CanvasStore } from "@/store/types";
import {
  findFreeSpot,
  getObjectsBounds,
  getViewportCenter,
  objectLabel,
  rectsOverlap,
  toObjectRow,
} from "./helpers";

describe("ai tool helpers", () => {
  it("determines correct human label for objects", () => {
    const stormObj: CanvasObject = {
      id: "1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      stormData: { kind: "event", name: "Order Placed", fields: [] },
    };
    expect(objectLabel(stormObj)).toBe("Order Placed");

    const modelObj: CanvasObject = {
      id: "2",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      modelData: { kind: "object", name: "Customer", fields: [] },
    };
    expect(objectLabel(modelObj)).toBe("Customer");

    const stickyObj: CanvasObject = {
      id: "3",
      type: "stickyNote",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      text: "Note 1",
    };
    expect(objectLabel(stickyObj)).toBe("Note 1");
  });

  it("converts object to compact ObjectRow", () => {
    const obj: CanvasObject = {
      id: "1",
      type: "storm",
      x: 10.4,
      y: 20.6,
      width: 199.8,
      height: 100.2,
      stormData: { kind: "command", name: "Pay Order", fields: [] },
    };

    const compact = toObjectRow(obj);
    expect(compact).toEqual({
      id: "1",
      type: "storm",
      kind: "command",
      label: "Pay Order",
    });

    const withGeo = toObjectRow(obj, { includeGeometry: true });
    expect(withGeo).toEqual({
      id: "1",
      type: "storm",
      kind: "command",
      label: "Pay Order",
      x: 10,
      y: 21,
      width: 200,
      height: 100,
    });
  });

  it("calculates viewport center in world coordinates", () => {
    const fakeStore = {
      viewport: {
        x: 100,
        y: 200,
        zoom: 2,
        screenWidth: 1000,
        screenHeight: 800,
      },
    } as unknown as CanvasStore;

    const center = getViewportCenter(fakeStore);
    // x = 100 + 1000 / 2 / 2 = 100 + 250 = 350
    // y = 200 + 800 / 2 / 2 = 200 + 200 = 400
    expect(center).toEqual({ x: 350, y: 400 });
  });

  it("computes bounding box of objects", () => {
    const objects: CanvasObject[] = [
      { id: "1", type: "storm", x: 10, y: 20, width: 100, height: 50 },
      { id: "2", type: "model", x: 150, y: 100, width: 200, height: 100 },
    ];
    const bounds = getObjectsBounds(objects);
    expect(bounds).toEqual({
      minX: 10,
      minY: 20,
      maxX: 350,
      maxY: 200,
    });
  });

  it("detects rectangle overlap", () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 50, height: 50 },
        { x: 25, y: 25, width: 50, height: 50 },
      ),
    ).toBe(true);

    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 50, height: 50 },
        { x: 100, y: 100, width: 50, height: 50 },
      ),
    ).toBe(false);
  });

  it("finds free spot avoiding collisions", () => {
    const existing: CanvasObject[] = [
      { id: "1", type: "storm", x: 0, y: 0, width: 200, height: 100 },
    ];
    const spot = findFreeSpot(existing, { width: 200, height: 100 }, { x: 0, y: 0 });
    expect(spot).not.toEqual({ x: 0, y: 0 });
    expect(
      rectsOverlap(
        { x: spot.x, y: spot.y, width: 200, height: 100 },
        { x: 0, y: 0, width: 200, height: 100 },
        40,
      ),
    ).toBe(false);
  });
});
