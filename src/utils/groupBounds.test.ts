import { describe, expect, it } from "vitest";
import type { CanvasObject, GroupInfo } from "@/types";
import { createLineObject } from "./lineGeometry";
import { groupAndAncestorIds, refitGroupSeparators } from "./groupBounds";

describe("groupAndAncestorIds", () => {
  it("returns the group and all of its ancestors", () => {
    const groups: GroupInfo[] = [
      { id: "root", name: "Root" },
      { id: "mid", name: "Mid", parentId: "root" },
      { id: "leaf", name: "Leaf", parentId: "mid" },
    ];
    expect(groupAndAncestorIds("leaf", groups)).toEqual(
      new Set(["leaf", "mid", "root"]),
    );
  });

  it("stops at a dangling parentId", () => {
    const groups: GroupInfo[] = [{ id: "leaf", name: "Leaf", parentId: "gone" }];
    expect(groupAndAncestorIds("leaf", groups)).toEqual(new Set(["leaf"]));
  });
});

const card = (overrides: Partial<CanvasObject> = {}): CanvasObject => ({
  id: "c",
  type: "storm",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  ...overrides,
});

const separator = (
  id: string,
  y: number,
  overrides: Partial<CanvasObject> = {},
): CanvasObject => ({
  ...createLineObject(
    id,
    { x: 60, y },
    { x: 340, y },
    { stroke: "#94a3b8", strokeWidth: 1, lineStyle: "dashed" },
  ),
  groupId: "g1",
  ...overrides,
});

const groups: GroupInfo[] = [{ id: "g1", name: "Slice" }];

const slice = (constraintHeight = 100): CanvasObject[] => [
  card({ id: "cmd", groupId: "g1", x: 100, y: 0 }),
  card({ id: "con", groupId: "g1", x: 100, y: 200, height: constraintHeight }),
  card({ id: "evt", groupId: "g1", x: 100, y: 400 }),
];

describe("refitGroupSeparators", () => {
  it("recenters lines into the gaps between card rows", () => {
    const objects = [...slice(), separator("l1", 150), separator("l2", 350)];
    const out = refitGroupSeparators(objects, groups, "g1");
    const l1 = out.find((o) => o.id === "l1")!;
    const l2 = out.find((o) => o.id === "l2")!;
    expect(l1.y).toBe(150);
    expect(l2.y).toBe(350);
    expect(l1.x).toBe(60);
    expect(l1.lineData?.lineStyle).toBe("dashed");
  });

  it("moves the following line below a card that grew into its row", () => {
    const objects = [...slice(250), separator("l1", 150), separator("l2", 350)];
    const out = refitGroupSeparators(objects, groups, "g1");
    expect(out.find((o) => o.id === "l1")?.y).toBe(150);
    // con now ends at y=450, past evt's top (400): pin the line below it.
    expect(out.find((o) => o.id === "l2")?.y).toBe(456);
  });

  it("ignores non-horizontal lines", () => {
    const diagonal = {
      ...createLineObject("d", { x: 0, y: 0 }, { x: 100, y: 100 }),
      groupId: "g1",
    };
    const objects = [...slice(), diagonal];
    expect(refitGroupSeparators(objects, groups, "g1")).toBe(objects);
  });

  it("ignores locked lines", () => {
    const objects = [...slice(), separator("l1", 150, { locked: true })];
    expect(refitGroupSeparators(objects, groups, "g1")).toBe(objects);
  });

  it("skips nested groups", () => {
    const nested: GroupInfo[] = [
      ...groups,
      { id: "g2", name: "Child", parentId: "g1" },
    ];
    const objects = [...slice(), separator("l1", 150), separator("l2", 350)];
    expect(refitGroupSeparators(objects, nested, "g1")).toBe(objects);
  });
});
