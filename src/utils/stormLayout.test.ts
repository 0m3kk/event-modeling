import { describe, expect, it } from "vitest";
import { arrangeStormLanes, STORM_LANE_ORDER } from "./stormLayout";
import type { StormLaneCard } from "./stormLayout";

const card = (
  id: string,
  kind: StormLaneCard["kind"],
  width = 220,
  height = 120,
): StormLaneCard => ({ id, kind, width, height });

describe("arrangeStormLanes", () => {
  it("orders lanes left-to-right by kind", () => {
    const cards = [
      card("event1", "event"),
      card("cmd1", "command"),
      card("actor1", "actor"),
    ];
    const positions = arrangeStormLanes(cards, { origin: { x: 0, y: 0 } });

    const byId = new Map(positions.map((p) => [p.id, p]));
    expect(byId.get("actor1")!.x).toBe(0);
    expect(byId.get("cmd1")!.x).toBeGreaterThan(byId.get("actor1")!.x);
    expect(byId.get("event1")!.x).toBeGreaterThan(byId.get("cmd1")!.x);
  });

  it("stacks multiple cards in the same lane vertically", () => {
    const cards = [card("a", "event"), card("b", "event", 220, 100)];
    const positions = arrangeStormLanes(cards, {
      origin: { x: 0, y: 0 },
      rowGap: 40,
    });

    const byId = new Map(positions.map((p) => [p.id, p]));
    expect(byId.get("a")!.x).toBe(byId.get("b")!.x);
    expect(byId.get("b")!.y).toBe(byId.get("a")!.y + 120 + 40);
  });

  it("skips empty lanes without leaving gaps", () => {
    const cards = [card("actor", "actor"), card("rule", "constraint")];
    const positions = arrangeStormLanes(cards, {
      origin: { x: 100, y: 50 },
      laneGap: 80,
    });

    const byId = new Map(positions.map((p) => [p.id, p]));
    expect(byId.get("actor")!.x).toBe(100);
    expect(byId.get("rule")!.x).toBe(100 + 220 + 80);
    expect(byId.get("actor")!.y).toBe(50);
  });

  it("exposes canonical lane order", () => {
    expect(STORM_LANE_ORDER).toEqual([
      "actor",
      "command",
      "event",
      "notify",
      "query",
      "state",
      "constraint",
    ]);
  });

  it("returns an empty list for no cards", () => {
    expect(arrangeStormLanes([])).toEqual([]);
  });
});
