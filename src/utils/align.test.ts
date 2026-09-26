import { describe, expect, it } from "vitest";
import { alignObjects, distributeObjects } from "./align";
import type { CanvasObject } from "@/types";

const makeCard = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 50,
): CanvasObject => ({
  id,
  type: "storm",
  x,
  y,
  width,
  height,
});

describe("alignObjects", () => {
  it("aligns left edges to the leftmost object", () => {
    const cards = [
      makeCard("a", 50, 0),
      makeCard("b", 100, 100),
      makeCard("c", 20, 200),
    ];
    const updates = alignObjects(cards, "left");
    const map = new Map(updates.map((u) => [u.id, u.changes.x]));
    expect(map.get("a")).toBe(20);
    expect(map.get("b")).toBe(20);
    expect(map.has("c")).toBe(false); // already at 20
  });

  it("aligns right edges to the rightmost object", () => {
    const cards = [makeCard("a", 0, 0, 50), makeCard("b", 100, 0, 100)]; // max right is 100+100=200
    const updates = alignObjects(cards, "right");
    const map = new Map(updates.map((u) => [u.id, u.changes.x]));
    expect(map.get("a")).toBe(150); // 200 - 50
    expect(map.has("b")).toBe(false);
  });

  it("aligns centers horizontally", () => {
    const cards = [makeCard("a", 0, 0, 100), makeCard("b", 200, 0, 100)]; // span 0 to 300, center = 150
    const updates = alignObjects(cards, "centerX");
    const map = new Map(updates.map((u) => [u.id, u.changes.x]));
    expect(map.get("a")).toBe(100); // 150 - 50
    expect(map.get("b")).toBe(100); // 150 - 50
  });

  it("returns empty for fewer than 2 objects", () => {
    expect(alignObjects([makeCard("a", 0, 0)], "left")).toEqual([]);
  });
});

describe("distributeObjects", () => {
  it("distributes horizontally with equal gaps between fixed ends", () => {
    // 3 cards of width 100: at x=0, x=30, x=300
    // spanStart=0, spanEnd=400 (300+100). totalWidth=300. totalGap=100. gap per slot=50.
    // Card 1: x=0. Card 2: x=0+100+50=150. Card 3: x=300.
    const cards = [
      makeCard("a", 0, 0),
      makeCard("b", 30, 0),
      makeCard("c", 300, 0),
    ];
    const updates = distributeObjects(cards, "horizontal");
    expect(updates).toEqual([{ id: "b", changes: { x: 150 } }]);
  });

  it("returns empty for fewer than 3 objects", () => {
    expect(
      distributeObjects(
        [makeCard("a", 0, 0), makeCard("b", 100, 0)],
        "horizontal",
      ),
    ).toEqual([]);
  });
});
