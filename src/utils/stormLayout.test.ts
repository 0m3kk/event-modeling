import { describe, expect, it } from "vitest";
import {
  arrangeStormLanes,
  arrangeVerticalSlice,
  STORM_LANE_ORDER,
} from "./stormLayout";
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

describe("arrangeVerticalSlice", () => {
  it("arranges cards vertically top-to-bottom: Command -> Constraint -> Event", () => {
    const cards = [
      card("cmd1", "command", 200, 100),
      card("cst1", "constraint", 220, 120),
      card("evt1", "event", 200, 100),
    ];
    const positions = arrangeVerticalSlice(cards, {
      origin: { x: 50, y: 100 },
      rowGap: 60,
    });

    const byId = new Map(positions.map((p) => [p.id, p]));
    const cmd = byId.get("cmd1")!;
    const cst = byId.get("cst1")!;
    const evt = byId.get("evt1")!;

    expect(cmd.y).toBe(100);
    expect(cst.y).toBe(cmd.y + 100 + 60);
    expect(evt.y).toBe(cst.y + 120 + 60);

    // Centered horizontally relative to widest card (constraint: width 220)
    expect(cst.x).toBe(50);
    expect(cmd.x).toBe(50 + (220 - 200) / 2);
    expect(evt.x).toBe(50 + (220 - 200) / 2);
  });

  it("handles Read slice vertically: Query -> State <- Event", () => {
    const cards = [
      card("qry1", "query", 200, 100),
      card("st1", "state", 200, 120),
      card("evt1", "event", 200, 100),
    ];
    const positions = arrangeVerticalSlice(cards, {
      origin: { x: 0, y: 0 },
      rowGap: 50,
    });

    const byId = new Map(positions.map((p) => [p.id, p]));
    expect(byId.get("qry1")!.y).toBe(0);
    expect(byId.get("st1")!.y).toBe(100 + 50);
    expect(byId.get("evt1")!.y).toBe(100 + 50 + 120 + 50);
  });
});

