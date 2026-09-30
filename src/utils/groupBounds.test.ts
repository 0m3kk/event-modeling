import { describe, expect, it } from "vitest";
import type { GroupInfo } from "@/types";
import { groupAndAncestorIds } from "./groupBounds";

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
