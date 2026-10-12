import { describe, it, expect } from "vitest";
import { arrangeBoard } from "./arrange";
import type { CanvasElement } from "@/types";

function card(
  id: string,
  x: number,
  y: number,
  width = 180,
  height = 80,
  extra: Partial<CanvasElement> = {},
): CanvasElement {
  return { id, type: "objectCard", x, y, width, height, data: { name: id }, ...extra };
}

function overlaps(a: CanvasElement, b: CanvasElement): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Applies the returned positions onto the elements and returns the board. */
function apply(elements: CanvasElement[]): CanvasElement[] {
  const patches = arrangeBoard(elements);
  const byId = new Map(patches.map((p) => [p.id, p]));
  return elements.map((el) => {
    const patch = byId.get(el.id);
    return patch ? { ...el, x: patch.x, y: patch.y } : el;
  });
}

describe("arrangeBoard", () => {
  it("returns nothing for an empty or single-element board", () => {
    expect(arrangeBoard([])).toEqual([]);
    expect(arrangeBoard([card("a", 0, 0)])).toEqual([]);
  });

  it("packs overlapping free cards into a grid without overlap", () => {
    const elements = [card("a", 0, 0), card("b", 5, 5), card("c", 10, 10)];
    const placed = apply(elements);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it("keeps the board anchored at its current top-left", () => {
    const patches = arrangeBoard([card("a", 500, 600), card("b", 900, 900)]);
    const minX = Math.min(...patches.map((p) => p.x));
    const minY = Math.min(...patches.map((p) => p.y));
    expect(minX).toBe(500);
    expect(minY).toBe(600);
  });

  it("arranges a container's children but leaves the frame to the store", () => {
    const domain: CanvasElement = {
      id: "d",
      type: "domainCard",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      data: { name: "Ordering" },
    };
    const a = card("a", 10, 10, 180, 80, { domainId: "d" });
    const b = card("b", 20, 20, 180, 80, { domainId: "d" });

    const patches = arrangeBoard([domain, a, b]);
    const ids = patches.map((p) => p.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    // The domain frame is derived from its children by the store reflow.
    expect(ids).not.toContain("d");

    const placedA = apply([domain, a, b]).find((el) => el.id === "a")!;
    const placedB = apply([domain, a, b]).find((el) => el.id === "b")!;
    expect(overlaps(placedA, placedB)).toBe(false);
  });

  it("treats a slice as one block and never moves its lane cards", () => {
    const slice: CanvasElement = {
      id: "s",
      type: "sliceCard",
      x: 0,
      y: 0,
      width: 320,
      height: 150,
      data: { name: "PlaceOrder", lanes: [{ id: "l1", childType: "objectCard" }] },
    };
    const lane = card("lane", 100, 100, 180, 80, { sliceId: "s", laneId: "l1" });

    const patches = arrangeBoard([slice, lane]);
    expect(patches.map((p) => p.id)).toEqual(["s"]);
  });

  it("honours an explicit column count", () => {
    const patches = arrangeBoard(
      [card("a", 0, 0), card("b", 500, 500), card("c", 1000, 1000)],
      { columns: 3 },
    );
    const ys = new Set(patches.map((p) => p.y));
    expect(ys.size).toBe(1);
    const xs = patches.map((p) => p.x).sort((m, n) => m - n);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });
});
