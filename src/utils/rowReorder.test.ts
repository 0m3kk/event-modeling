import { describe, it, expect } from "vitest";
import {
  reorderItems,
  resolveModelRowList,
  resolveStormRowList,
  moveModelRowInObject,
  moveStormRowInObject,
} from "./rowReorder";
import type { CanvasObject } from "@/types";

describe("rowReorder", () => {
  it("reorders items correctly with reorderItems", () => {
    const list = ["a", "b", "c", "d"];
    expect(reorderItems(list, 1, 2)).toEqual(["a", "c", "b", "d"]);
    expect(reorderItems(list, 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(reorderItems(list, 2, 2)).toEqual(["a", "b", "c", "d"]);
    expect(reorderItems(list, -1, 2)).toEqual(["a", "b", "c", "d"]);
    expect(reorderItems(list, 1, 10)).toEqual(["a", "b", "c", "d"]);
  });

  it("resolves model row list correctly", () => {
    const objModel = {
      kind: "object" as const,
      name: "User",
      fields: [
        { id: "f1", name: "id", fieldType: "uuid" },
        { id: "f2", name: "name", fieldType: "string" },
      ],
    };
    expect(resolveModelRowList(objModel, "f1")).toBe("fields");
    expect(resolveModelRowList(objModel, "f99")).toBeNull();

    const enumModel = {
      kind: "enum" as const,
      name: "Role",
      values: [{ id: "v1", name: "ADMIN", value: "ADMIN" }],
    };
    expect(resolveModelRowList(enumModel, "v1")).toBe("values");
  });

  it("resolves storm row list correctly", () => {
    const stormData = {
      kind: "query" as const,
      name: "GetOrder",
      fields: [{ id: "f1", name: "id", fieldType: "uuid" }],
      responseFields: [{ id: "r1", name: "total", fieldType: "number" }],
      queryItems: [{ id: "q1", types: ["OrderPlaced"], tagFieldIds: [] }],
      constraints: [{ id: "c1", text: "total > 0" }],
    };
    expect(resolveStormRowList(stormData, "f1")).toBe("fields");
    expect(resolveStormRowList(stormData, "r1")).toBe("responseFields");
    expect(resolveStormRowList(stormData, "q1")).toBe("queryItems");
    expect(resolveStormRowList(stormData, "c1")).toBe("constraints");
    expect(resolveStormRowList(stormData, "unknown")).toBeNull();
  });

  it("moves model row up and down", () => {
    const card: CanvasObject = {
      id: "m1",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      modelData: {
        kind: "object",
        name: "Test",
        fields: [
          { id: "f1", name: "a", fieldType: "string" },
          { id: "f2", name: "b", fieldType: "string" },
          { id: "f3", name: "c", fieldType: "string" },
        ],
      },
    };

    // Move f2 up -> f2 should be first
    const movedUp = moveModelRowInObject(card, "f2", "up");
    expect(movedUp).not.toBeNull();
    expect(movedUp?.modelData?.fields?.map((f) => f.id)).toEqual([
      "f2",
      "f1",
      "f3",
    ]);

    // Move f1 down -> f1 should be at index 1
    const movedDown = moveModelRowInObject(card, "f1", "down");
    expect(movedDown).not.toBeNull();
    expect(movedDown?.modelData?.fields?.map((f) => f.id)).toEqual([
      "f2",
      "f1",
      "f3",
    ]);

    // Boundary: move f1 up when already at top -> returns null
    expect(moveModelRowInObject(card, "f1", "up")).toBeNull();

    // Boundary: move f3 down when already at bottom -> returns null
    expect(moveModelRowInObject(card, "f3", "down")).toBeNull();
  });

  it("moves storm row up and down", () => {
    const card: CanvasObject = {
      id: "s1",
      type: "storm",
      x: 0,
      y: 0,
      width: 240,
      height: 180,
      stormData: {
        kind: "state",
        name: "OrderState",
        fields: [
          { id: "f1", name: "status", fieldType: "string" },
          { id: "f2", name: "total", fieldType: "number" },
        ],
        queryItems: [
          { id: "q1", types: ["EventA"], tagFieldIds: [] },
          { id: "q2", types: ["EventB"], tagFieldIds: [] },
        ],
      },
    };

    // Move query item q2 up
    const movedQ = moveStormRowInObject(card, "q2", "up");
    expect(movedQ).not.toBeNull();
    expect(movedQ?.stormData?.queryItems?.map((q) => q.id)).toEqual([
      "q2",
      "q1",
    ]);

    // Boundary move
    expect(moveStormRowInObject(card, "f1", "up")).toBeNull();
  });
});
