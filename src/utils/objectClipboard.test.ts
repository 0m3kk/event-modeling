import { describe, it, expect } from "vitest";
import {
  buildObjectClipboard,
  buildPastedObjects,
  OBJECT_PASTE_OFFSET,
} from "./objectClipboard";
import type { CanvasObject, GroupInfo } from "@/types";

function storm(
  id: string,
  overrides: Partial<CanvasObject> = {},
): CanvasObject {
  return {
    id,
    type: "storm",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    stormData: { kind: "event", name: id, fields: [] },
    ...overrides,
  };
}

const connector = (id: string, from: string, to: string): CanvasObject => ({
  id,
  type: "connector",
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  connectorData: {
    start: { objectId: from, anchor: "right" },
    end: { objectId: to, anchor: "left" },
  },
});

describe("objectClipboard", () => {
  it("copies an explicit selection of cards", () => {
    const cardA = storm("s1", { x: 10, y: 20 });
    const cardB = storm("s2", { x: 300, y: 20 });
    const clipboard = buildObjectClipboard(
      ["s1", "s2"],
      [cardA, cardB],
      [],
    );

    expect(clipboard?.objects.map((o) => o.id)).toEqual(["s1", "s2"]);
    expect(clipboard?.groups).toEqual([]);
    expect(clipboard?.pasteIndex).toBe(0);
  });

  it("returns null when the selection is empty or unknown", () => {
    const cardA = storm("s1");
    expect(buildObjectClipboard([], [cardA], [])).toBeNull();
    expect(buildObjectClipboard(["ghost"], [cardA], [])).toBeNull();
  });

  it("expands a selected group into its nested groups, members and wiring", () => {
    const groupA: GroupInfo = { id: "g1", name: "Flow" };
    const groupChild: GroupInfo = { id: "g2", name: "Sub", parentId: "g1" };
    const cardA = storm("s1", { groupId: "g1" });
    const cardB = storm("s2", { groupId: "g2" });
    const outside = storm("s3");
    const wired = connector("c1", "s1", "s2");
    const dangling = connector("c2", "s1", "s3");
    const objects = [cardA, cardB, outside, wired, dangling];

    const clipboard = buildObjectClipboard(
      ["__group:g1"],
      objects,
      [groupA, groupChild],
    );

    expect(clipboard?.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    // s1 + s2 are members; c1 connects both; c2 and s3 stay behind.
    expect(clipboard?.objects.map((o) => o.id).sort()).toEqual([
      "c1",
      "s1",
      "s2",
    ]);
  });

  it("drops a connector selected without its endpoints", () => {
    const cardA = storm("s1");
    const cardB = storm("s2");
    const wired = connector("c1", "s1", "s2");

    const clipboard = buildObjectClipboard(["c1"], [cardA, cardB, wired], []);
    expect(clipboard).toBeNull();
  });

  it("remaps ids, groups, endpoints and strips referenceId on paste", () => {
    const groupA: GroupInfo = { id: "g1", name: "Flow" };
    const groupChild: GroupInfo = { id: "g2", name: "Sub", parentId: "g1" };
    const cardA = storm("s1", { groupId: "g1", referenceId: "ref-1" });
    const cardB = storm("s2", { groupId: "g2" });
    const wired = connector("c1", "s1", "s2");

    const clipboard = buildObjectClipboard(
      ["__group:g1"],
      [cardA, cardB, wired],
      [groupA, groupChild],
    )!;
    const pasted = buildPastedObjects(clipboard)!;

    const newIds = pasted.objects.map((o) => o.id);
    expect(newIds).not.toContain("s1");
    expect(newIds).not.toContain("s2");
    expect(new Set(newIds).size).toBe(newIds.length);

    // Copies are independent: no reference linkage carried over.
    expect(pasted.objects.every((o) => o.referenceId === undefined)).toBe(true);

    const newGroupIds = pasted.groups.map((g) => g.id);
    expect(newGroupIds).not.toContain("g1");
    expect(newGroupIds).not.toContain("g2");

    const pastedA = pasted.objects.find((o) => o.stormData?.name === "s1")!;
    const pastedB = pasted.objects.find((o) => o.stormData?.name === "s2")!;
    expect(pastedA.groupId).toBeDefined();
    expect(pastedB.groupId).toBeDefined();
    expect(newGroupIds).toContain(pastedA.groupId);
    expect(newGroupIds).toContain(pastedB.groupId);
    expect(pastedA.groupId).not.toBe(pastedB.groupId);

    // Nested group keeps its parent link, mapped onto the new id space.
    const pastedChild = pasted.groups.find((g) => g.parentId !== undefined)!;
    expect(newGroupIds).toContain(pastedChild.parentId);

    // Connector endpoints follow the copied cards.
    const pastedConn = pasted.objects.find((o) => o.type === "connector")!;
    expect(pastedConn.connectorData?.start.objectId).toBe(pastedA.id);
    expect(pastedConn.connectorData?.end.objectId).toBe(pastedB.id);
  });

  it("steps the offset forward on each successive paste", () => {
    const card = storm("s1", { x: 100, y: 100 });
    const clipboard = buildObjectClipboard(["s1"], [card], [])!;

    const first = buildPastedObjects(clipboard)!;
    expect(first.objects[0].x).toBe(100 + OBJECT_PASTE_OFFSET);

    const second = buildPastedObjects({ ...clipboard, pasteIndex: 1 })!;
    expect(second.objects[0].x).toBe(100 + OBJECT_PASTE_OFFSET * 2);
  });
});
