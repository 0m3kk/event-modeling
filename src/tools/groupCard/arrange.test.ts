import "@/tools";
import { describe, it, expect, beforeEach } from "vitest";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { GROUP_LABEL_HEIGHT, GROUP_PADDING, GROUP_TYPE } from "./layout";
import { planGroupArrange } from "./arrange";

function group(id: string, x = 0, y = 0): CanvasElement {
  return {
    id,
    type: GROUP_TYPE,
    x,
    y,
    width: 240,
    height: 130,
    data: { name: "Account Types" },
  };
}

function card(
  id: string,
  x: number,
  y: number,
  width = 200,
  height = 90,
  groupId = "g1",
): CanvasElement {
  return { id, type: "objectCard", x, y, width, height, data: {}, groupId };
}

describe("planGroupArrange", () => {
  it("returns null for a missing or empty group", () => {
    expect(planGroupArrange([], "nope")).toBeNull();
    expect(planGroupArrange([group("g1")], "g1")).toBeNull();
  });

  it("packs four cards into a 2x2 grid, anchored at the group", () => {
    const g = group("g1", 100, 50);
    const cards = [
      card("a", 0, 0),
      card("b", 500, 0),
      card("c", 0, 400),
      card("d", 500, 400),
    ];

    const patches = planGroupArrange([g, ...cards], "g1")!;
    const at = (id: string) => patches.find((p) => p.id === id)! as { x: number; y: number };

    const originX = 100 + GROUP_PADDING;
    const originY = 50 + GROUP_LABEL_HEIGHT + GROUP_PADDING;

    // a and b share the top row; c and d the second, all left-aligned at origin.
    expect(at("a").x).toBe(originX);
    expect(at("a").y).toBe(originY);
    expect(at("b").y).toBe(originY);
    expect(at("b").x).toBeGreaterThan(at("a").x);
    expect(at("c").x).toBe(originX);
    expect(at("c").y).toBeGreaterThan(at("a").y);
    expect(at("d").x).toBe(at("b").x);
    expect(at("d").y).toBe(at("c").y);
  });

  it("keeps a single card in a single column", () => {
    const g = group("g1");
    const patches = planGroupArrange([g, card("a", 999, 999)], "g1")!;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ id: "a", x: GROUP_PADDING, y: GROUP_LABEL_HEIGHT + GROUP_PADDING });
  });

  it("honours an explicit column count", () => {
    const g = group("g1");
    const cards = [card("a", 0, 0), card("b", 0, 0), card("c", 0, 0)];
    const patches = planGroupArrange([g, ...cards], "g1", { columns: 3 })!;
    const ys = cards.map((c) => patches.find((p) => p.id === c.id)!.y);
    // Three columns -> a single row.
    expect(new Set(ys).size).toBe(1);
  });
});

describe("arrangeGroup store action", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("repositions the group's cards and is idempotent on a second call", () => {
    const store = useCanvasStore.getState();
    store.addElement(group("g1", 200, 200));
    store.addElement(card("a", 0, 0));
    store.addElement(card("b", 500, 0));

    useCanvasStore.getState().arrangeGroup("g1");
    const after = useCanvasStore.getState().elements;
    const a = after.find((el) => el.id === "a")!;
    const b = after.find((el) => el.id === "b")!;
    expect(a.y).toBe(b.y);

    const undoDepth = useCanvasStore.getState().undoStack.length;
    useCanvasStore.getState().arrangeGroup("g1");
    expect(useCanvasStore.getState().undoStack.length).toBe(undoDepth);
  });
});
