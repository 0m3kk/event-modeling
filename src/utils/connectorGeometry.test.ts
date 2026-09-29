import { describe, it, expect } from "vitest";
import type { CanvasObject, GroupInfo } from "@/types";
import {
  buildConnectorLookup,
  findConnectorEndpointBounds,
  getPolylineMidpoint,
  getPolylineMidpointInfo,
  resolveConnectorPoints,
} from "./connectorGeometry";

function card(id: string, x: number, y: number): CanvasObject {
  return { id, type: "storm", x, y, width: 200, height: 100 };
}

function connector(
  startId: string,
  endId: string,
): CanvasObject {
  return {
    id: "conn-1",
    type: "connector",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    connectorData: {
      start: { objectId: startId, anchor: "right" },
      end: { objectId: endId, anchor: "left" },
    },
  };
}

describe("connectorGeometry", () => {
  it("computes the midpoint of a straight polyline", () => {
    expect(
      getPolylineMidpoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toEqual({ x: 50, y: 0 });
  });

  it("computes the midpoint by distance across bends", () => {
    expect(
      getPolylineMidpoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ]),
    ).toEqual({ x: 100, y: 0 });
  });

  it("reports the orientation of the segment at the midpoint", () => {
    const horizontal = getPolylineMidpointInfo([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(horizontal.point).toEqual({ x: 100, y: 0 });
    expect(horizontal.isHorizontal).toBe(true);

    const vertical = getPolylineMidpointInfo([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ]);
    expect(vertical.point).toEqual({ x: 0, y: 50 });
    expect(vertical.isHorizontal).toBe(false);
  });

  it("resolves an endpoint from an object id", () => {
    const objects = [card("a", 0, 0)];
    const lookup = buildConnectorLookup(objects, []);
    expect(findConnectorEndpointBounds("a", lookup)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });

  it("resolves an endpoint from a group id (with __group: prefix)", () => {
    const objects = [card("a", 0, 0)];
    const groups: GroupInfo[] = [
      {
        id: "g1",
        name: "Group",
        customBounds: { x: 10, y: 20, width: 300, height: 150 },
      },
    ];
    const lookup = buildConnectorLookup(objects, groups);
    expect(findConnectorEndpointBounds("__group:g1", lookup)).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 150,
    });
  });

  it("resolves a connector path between two cards", () => {
    const objects = [card("a", 0, 0), card("b", 400, 0), connector("a", "b")];
    const points = resolveConnectorPoints(objects[2]!, objects, []);
    expect(points).not.toBeNull();
    expect(points!.length).toBeGreaterThanOrEqual(2);

    const mid = getPolylineMidpoint(points!);
    expect(mid.x).toBeGreaterThan(200);
    expect(mid.x).toBeLessThan(400);
  });

  it("returns null when an endpoint is missing", () => {
    const objects = [card("a", 0, 0), connector("a", "missing")];
    expect(resolveConnectorPoints(objects[1]!, objects, [])).toBeNull();
  });
});
