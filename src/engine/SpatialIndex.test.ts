import { describe, it, expect, beforeEach } from "vitest";
import { SpatialIndex } from "./SpatialIndex";

describe("SpatialIndex", () => {
  let index: SpatialIndex;

  beforeEach(() => {
    index = new SpatialIndex();
  });

  it("inserts and retrieves spatial items by bounding box search", () => {
    index.insert({ id: "card-1", x: 100, y: 100, width: 200, height: 100 });
    index.insert({ id: "card-2", x: 500, y: 500, width: 100, height: 100 });

    // Search overlapping card-1
    const hits1 = index.search({ minX: 50, minY: 50, maxX: 150, maxY: 150 });
    expect(hits1).toEqual(["card-1"]);

    // Search overlapping card-2
    const hits2 = index.search({ minX: 450, minY: 450, maxX: 650, maxY: 650 });
    expect(hits2).toEqual(["card-2"]);

    // Search empty region
    const hitsEmpty = index.search({
      minX: 1000,
      minY: 1000,
      maxX: 1200,
      maxY: 1200,
    });
    expect(hitsEmpty).toHaveLength(0);
  });

  it("updates position of existing item", () => {
    index.insert({ id: "card-1", x: 100, y: 100, width: 200, height: 100 });
    index.update({ id: "card-1", x: 800, y: 800, width: 200, height: 100 });

    const oldSearch = index.search({
      minX: 50,
      minY: 50,
      maxX: 200,
      maxY: 200,
    });
    expect(oldSearch).toHaveLength(0);

    const newSearch = index.search({
      minX: 750,
      minY: 750,
      maxX: 900,
      maxY: 900,
    });
    expect(newSearch).toEqual(["card-1"]);
  });

  it("removes items and updates size", () => {
    index.insert({ id: "c1", x: 0, y: 0, width: 50, height: 50 });
    index.insert({ id: "c2", x: 100, y: 100, width: 50, height: 50 });
    expect(index.size).toBe(2);

    index.remove("c1");
    expect(index.size).toBe(1);
    expect(
      index.search({ minX: -10, minY: -10, maxX: 60, maxY: 60 }),
    ).toHaveLength(0);
  });

  it("bulk loads multiple items cleanly", () => {
    const items = [
      { id: "c1", x: 0, y: 0, width: 100, height: 100 },
      { id: "c2", x: 200, y: 0, width: 100, height: 100 },
      { id: "c3", x: 400, y: 0, width: 100, height: 100 },
    ];
    index.load(items);
    expect(index.size).toBe(3);

    const hits = index.search({ minX: 50, minY: -10, maxX: 250, maxY: 110 });
    expect(hits.sort()).toEqual(["c1", "c2"].sort());
  });
});
