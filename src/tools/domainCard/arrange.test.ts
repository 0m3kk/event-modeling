import "@/tools";
import { describe, it, expect, beforeEach } from "vitest";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { SpatialIndex } from "@/engine/SpatialIndex";
import { GizmoLayer } from "@/engine/layers/GizmoLayer";
import { ElementLayer } from "@/engine/layers/ElementLayer";
import { PreviewLayer } from "@/engine/layers/PreviewLayer";
import { DragElementsInteraction } from "@/engine/interactions/DragElementsInteraction";
import type { InteractionContext } from "@/engine/interactions/types";
import { DOMAIN_TYPE } from "./layout";
import {
  groupKindRank,
  orderGroups,
  orderSlices,
  planDomainArrange,
  reorderSlices,
} from "./arrange";

function domain(id: string, extra: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    type: DOMAIN_TYPE,
    x: 0,
    y: 0,
    width: 260,
    height: 160,
    data: { name: "Sales" },
    ...extra,
  };
}

function group(id: string, name: string, y = 0, extra: Partial<CanvasElement> = {}): CanvasElement {
  return { id, type: "groupCard", x: 40, y, width: 200, height: 120, data: { name }, ...extra };
}

function slice(id: string, x: number, domainId: string, extra: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    type: "sliceCard",
    x,
    y: 0,
    width: 320,
    height: 142,
    data: { name: id, lanes: [] },
    domainId,
    ...extra,
  };
}

describe("group ordering", () => {
  it("ranks Types, States and Services by name suffix", () => {
    expect(groupKindRank({ data: { name: "Account Types" } } as CanvasElement)).toBe(0);
    expect(groupKindRank({ data: { name: "MoneyTypes" } } as CanvasElement)).toBe(0);
    expect(groupKindRank({ data: { name: "Account States" } } as CanvasElement)).toBe(1);
    expect(groupKindRank({ data: { name: "Account Services" } } as CanvasElement)).toBe(2);
    expect(groupKindRank({ data: { name: "Actors" } } as CanvasElement)).toBe(3);
  });

  it("orders groups Types -> States -> Services regardless of position", () => {
    const services = group("g-svc", "Account Services", 500);
    const states = group("g-state", "Account States", 0);
    const types = group("g-types", "Account Types", 250);
    const ids = orderGroups([services, states, types]).map((g) => g.id);
    expect(ids).toEqual(["g-types", "g-state", "g-svc"]);
  });
});

describe("slice ordering", () => {
  it("keeps stored order then appends the rest by x", () => {
    const a = slice("a", 0, "d1");
    const b = slice("b", 400, "d1");
    const c = slice("c", 800, "d1");
    expect(orderSlices([a, b, c], ["c", "a"]).map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(orderSlices([c, b, a]).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("reorders a dragged slice by drop position", () => {
    const a = slice("a", 100, "d1");
    const b = slice("b", 460, "d1");
    const c = slice("c", 820, "d1");
    const elements = [domain("d1", { data: { name: "Sales", sliceOrder: ["a", "b", "c"] } }), a, b, c];

    // Dropped left of A's centre -> first.
    expect(reorderSlices(elements, "d1", "b", 100)).toEqual(["b", "a", "c"]);
    // Dropped far right -> last.
    expect(reorderSlices(elements, "d1", "b", 2000)).toEqual(["a", "c", "b"]);
    // Dropped between A and C -> middle.
    expect(reorderSlices(elements, "d1", "b", 700)).toEqual(["a", "b", "c"]);
  });
});

describe("planDomainArrange", () => {
  it("returns null for a missing or empty domain", () => {
    expect(planDomainArrange([], "nope")).toBeNull();
    expect(planDomainArrange([domain("d1")], "d1")).toBeNull();
  });

  it("stacks groups on the left and lays slices in a row to the right", () => {
    const d1 = domain("d1");
    const gTypes = group("g-types", "Sales Types", 900, { domainId: "d1" });
    const gServices = group("g-services", "Sales Services", 0, { domainId: "d1" });
    const obj = {
      id: "o1",
      type: "objectCard",
      x: 900,
      y: 900,
      width: 150,
      height: 90,
      data: {},
      groupId: "g-types",
    } as CanvasElement;
    const s1 = slice("s1", 900, "d1");
    const s2 = slice("s2", 900, "d1");
    const elements = [d1, gTypes, gServices, obj, s1, s2];

    const patches = planDomainArrange(elements, "d1")!;
    const at = (id: string) =>
      patches.find((p) => p.id === id)! as {
        id: string;
        x: number;
        y: number;
        data?: { sliceOrder: string[] };
      };

    // Its object is laid inside the group's content box (indented from the frame).
    expect(at("o1").x).toBeGreaterThan(at("g-types").x);
    expect(at("o1").y).toBeGreaterThan(at("g-types").y);

    // Every group starts left of every slice.
    for (const gid of ["g-types", "g-services"]) {
      expect(at(gid).x).toBeLessThan(at("s1").x);
      expect(at(gid).x).toBeLessThan(at("s2").x);
    }

    // Slices sit in a single row, left to right.
    expect(at("s1").y).toBe(at("s2").y);
    expect(at("s2").x).toBeGreaterThan(at("s1").x);

    // The Slice order is persisted on the domain patch.
    expect(at("d1").data!.sliceOrder).toEqual(["s1", "s2"]);
  });

  it("packs a group's cards into a grid instead of one tall column", () => {
    const d1 = domain("d1");
    const gTypes = group("g-types", "Sales Types", 0, { domainId: "d1" });
    const objects = Array.from({ length: 4 }, (_, i) => ({
      id: `o${i}`,
      type: "objectCard",
      x: 900,
      y: 900,
      width: 200,
      height: 90,
      data: {},
      groupId: "g-types",
    })) as CanvasElement[];

    const patches = planDomainArrange([d1, gTypes, ...objects], "d1")!;
    const xs = objects.map((o) => patches.find((p) => p.id === o.id)!.x);
    // Four 200px cards become a 2-column grid, not four stacked rows.
    expect(new Set(xs).size).toBe(2);

    const ys = objects.map((o) => patches.find((p) => p.id === o.id)!.y);
    expect(new Set(ys).size).toBe(2);
  });

  it("wraps the group column so a tall group does not stretch the domain", () => {
    const d1 = domain("d1");
    // Three ~400px-tall groups; as one column they would reach ~1250px.
    const tallGroup = (id: string, name: string, childType: string): CanvasElement[] => [
      group(id, name, 0, { domainId: "d1" }),
      {
        id: `${id}-kid`,
        type: childType,
        x: 0,
        y: 0,
        width: 150,
        height: 350,
        data: {},
        groupId: id,
      } as CanvasElement,
    ];
    const s1 = slice("s1", 0, "d1");
    const s2 = slice("s2", 0, "d1");

    const elements = [
      d1,
      ...tallGroup("g-types", "Sales Types", "objectCard"),
      ...tallGroup("g-states", "Sales States", "stateCard"),
      ...tallGroup("g-services", "Sales Services", "serviceCard"),
      s1,
      s2,
    ];

    const patches = planDomainArrange(elements, "d1")!;
    const groupXs = ["g-types", "g-states", "g-services"].map(
      (id) => patches.find((p) => p.id === id)!.x!,
    );
    // The groups split into more than one column.
    expect(new Set(groupXs).size).toBeGreaterThan(1);

    // The group region's bottom stays far below the naive 3-row stack.
    const kidBottoms = ["g-types-kid", "g-states-kid", "g-services-kid"].map((id) => {
      const kid = patches.find((p) => p.id === id)!;
      return kid.y! + 350;
    });
    const groupRegionHeight = Math.max(...kidBottoms) - Math.min(...kidBottoms) + 350;
    expect(groupRegionHeight).toBeLessThan(900);
  });

  it("gives loose cards their own row below the slice row", () => {
    const d1 = domain("d1");
    const s1 = slice("s1", 100, "d1");
    const loose = {
      id: "l1",
      type: "eventCard",
      x: 900,
      y: 900,
      width: 180,
      height: 80,
      data: {},
      domainId: "d1",
    } as CanvasElement;
    const elements = [d1, s1, loose];

    const patches = planDomainArrange(elements, "d1")!;
    const s = patches.find((p) => p.id === "s1")! as { x: number; y: number };
    const l = patches.find((p) => p.id === "l1")! as { x: number; y: number };
    expect(l.y).toBeGreaterThan(s.y + s1.height - 1);
    expect(l.x).toBe(s.x);
  });

  it("respects an explicit slice order override", () => {
    const d1 = domain("d1", { data: { name: "Sales", sliceOrder: [] } });
    const s1 = slice("s1", 100, "d1");
    const s2 = slice("s2", 500, "d1");
    const patches = planDomainArrange([d1, s1, s2], "d1", { sliceOrder: ["s2", "s1"] })!;
    const p1 = patches.find((p) => p.id === "s1")! as { x: number };
    const p2 = patches.find((p) => p.id === "s2")! as { x: number };
    expect(p2.x).toBeLessThan(p1.x);
  });
});

describe("arrangeDomain store action", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("records slice order and repositions the domain children", () => {
    const store = useCanvasStore.getState();
    store.addElement(domain("d1"));
    store.addElement(slice("s1", 0, "d1"));
    store.addElement(slice("s2", 2000, "d1"));

    useCanvasStore.getState().arrangeDomain("d1");

    const elements = useCanvasStore.getState().elements;
    const d = elements.find((el) => el.id === "d1")!;
    expect((d.data as { sliceOrder: string[] }).sliceOrder).toEqual(["s1", "s2"]);

    const s1 = elements.find((el) => el.id === "s1")!;
    const s2 = elements.find((el) => el.id === "s2")!;
    expect(s1.y).toBe(s2.y);
    expect(s1.x).toBeLessThan(s2.x);
  });

  it("does not stack undo entries when arranged twice", () => {
    const store = useCanvasStore.getState();
    store.addElement(domain("d1"));
    store.addElement(slice("s1", 100, "d1"));

    useCanvasStore.getState().arrangeDomain("d1");
    const undoDepth = useCanvasStore.getState().undoStack.length;

    useCanvasStore.getState().arrangeDomain("d1");
    expect(useCanvasStore.getState().undoStack.length).toBe(undoDepth);
  });
});

describe("slice reorder drag inside an arranged domain", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("moves a slice before its sibling when dropped to the left", () => {
    const store = useCanvasStore.getState();
    store.addElement(domain("d1"));
    store.addElement(slice("s1", 0, "d1"));
    store.addElement(slice("s2", 400, "d1"));
    useCanvasStore.getState().arrangeDomain("d1");

    const arranged = useCanvasStore.getState().elements;
    const s1 = arranged.find((el) => el.id === "s1")!;
    const s2 = arranged.find((el) => el.id === "s2")!;
    const d = arranged.find((el) => el.id === "d1")!;

    const spatialIndex = new SpatialIndex();
    spatialIndex.rebuild(arranged);

    const ctx: InteractionContext = {
      screenToWorld: (x, y) => ({ x, y }),
      worldToScreen: (x, y) => ({ x, y }),
      spatialIndex,
      gizmoLayer: new GizmoLayer(),
      elementLayer: new ElementLayer(),
      previewLayer: new PreviewLayer(),
      setCursor: () => {},
      theme: "light",
      isSpaceHeld: () => false,
    };

    // Grab s2 near the middle of the domain, drag it to the left edge of s1.
    const grab = { x: s2.x + 20, y: s2.y + 20 };
    const drop = { x: s1.x + 5, y: s1.y + 5 };
    expect(d.x).toBeLessThanOrEqual(drop.x);

    const drag = new DragElementsInteraction();
    expect(drag.onPointerDown({ button: 0, shiftKey: false } as PointerEvent, grab, ctx)).toBe(true);
    drag.onPointerMove({} as PointerEvent, drop, ctx);
    drag.onPointerUp({} as PointerEvent, drop, ctx);

    const after = useCanvasStore.getState().elements;
    const dAfter = after.find((el) => el.id === "d1")!;
    expect((dAfter.data as { sliceOrder: string[] }).sliceOrder).toEqual(["s2", "s1"]);

    const s1After = after.find((el) => el.id === "s1")!;
    const s2After = after.find((el) => el.id === "s2")!;
    expect(s2After.x).toBeLessThan(s1After.x);
  });
});
