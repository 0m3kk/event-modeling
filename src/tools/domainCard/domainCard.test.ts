import "@/tools";
import { describe, it, expect, beforeEach } from "vitest";
import {
  DOMAIN_CHILD_GAP,
  DOMAIN_LABEL_HEIGHT,
  DOMAIN_PADDING,
  DOMAIN_TYPE,
  computeDomainBounds,
  findDomainDropTarget,
  findDomainFreeSpot,
  reflowDomains,
  type DomainData,
} from "./layout";
import { domainCardTool } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { SpatialIndex } from "@/engine/SpatialIndex";
import { GizmoLayer } from "@/engine/layers/GizmoLayer";
import { ElementLayer } from "@/engine/layers/ElementLayer";
import { PreviewLayer } from "@/engine/layers/PreviewLayer";
import { DragElementsInteraction } from "@/engine/interactions/DragElementsInteraction";
import type { InteractionContext } from "@/engine/interactions/types";

function makeDomain(id: string, x: number, y: number, data: DomainData): CanvasElement<DomainData> {
  return { id, type: DOMAIN_TYPE, x, y, width: 260, height: 160, data };
}

function makeCard(
  id: string,
  type: string,
  x: number,
  y: number,
  extra: Partial<CanvasElement> = {},
): CanvasElement {
  return { id, type, x, y, width: 200, height: 100, data: {}, ...extra };
}

describe("domain layout", () => {
  it("bounds children with padding and a label band", () => {
    const a = makeCard("a", "commandCard", 100, 200, { width: 120, height: 80 });
    const b = makeCard("b", "queryCard", 300, 240, { width: 150, height: 90 });

    const bounds = computeDomainBounds([a, b])!;
    expect(bounds.x).toBe(100 - DOMAIN_PADDING);
    expect(bounds.y).toBe(200 - DOMAIN_PADDING - DOMAIN_LABEL_HEIGHT);
    expect(bounds.width).toBe(300 + 150 - 100 + DOMAIN_PADDING * 2);
    expect(bounds.height).toBe(240 + 90 - 200 + DOMAIN_PADDING * 2 + DOMAIN_LABEL_HEIGHT);
  });

  it("returns null with no children", () => {
    expect(computeDomainBounds([])).toBeNull();
  });
});

describe("reflowDomains", () => {
  it("fits a domain around its children", () => {
    const domain = makeDomain("d1", 0, 0, { name: "Sales" });
    const card = makeCard("c1", "commandCard", 100, 200, { domainId: "d1" });

    const result = reflowDomains([domain, card]);
    const rd = result.find((el) => el.id === "d1")!;
    expect(rd.x).toBe(100 - DOMAIN_PADDING);
    expect(rd.width).toBe(200 + DOMAIN_PADDING * 2);
  });

  it("wraps a slice child using the slice's final box", () => {
    const domain = makeDomain("d1", 0, 0, { name: "Sales" });
    const slice: CanvasElement = {
      id: "s1",
      type: "sliceCard",
      x: 50,
      y: 60,
      width: 400,
      height: 200,
      data: { name: "Slice", lanes: [] },
      domainId: "d1",
    };

    const result = reflowDomains([domain, slice]);
    const rd = result.find((el) => el.id === "d1")!;
    expect(rd.x).toBe(50 - DOMAIN_PADDING);
    expect(rd.width).toBe(400 + DOMAIN_PADDING * 2);
    expect(rd.height).toBe(200 + DOMAIN_PADDING * 2 + DOMAIN_LABEL_HEIGHT);
  });

  it("detaches membership pointing to a missing or nested domain", () => {
    const domain = makeDomain("d1", 0, 0, { name: "Sales" });
    const orphan = makeCard("c1", "commandCard", 0, 0, { domainId: "ghost" });
    const nested = makeDomain("d2", 0, 0, { name: "Inner" });
    nested.domainId = "d1";

    const result = reflowDomains([domain, orphan, nested]);
    expect(result.find((el) => el.id === "c1")!.domainId).toBeUndefined();
    expect(result.find((el) => el.id === "d2")!.domainId).toBeUndefined();
  });

  it("drops domain membership from slice-lane members (exclusive)", () => {
    const domain = makeDomain("d1", 0, 0, { name: "Sales" });
    const card = makeCard("c1", "commandCard", 0, 0, {
      domainId: "d1",
      sliceId: "s1",
      laneId: "l1",
    });

    const result = reflowDomains([domain, card]);
    expect(result.find((el) => el.id === "c1")!.domainId).toBeUndefined();
  });
});

describe("findDomainDropTarget", () => {
  it("returns the domain under the pointer", () => {
    const domain = makeDomain("d1", 0, 0, { name: "Sales" });
    const hit = findDomainDropTarget([domain], { x: 10, y: 10 }, "drag", "commandCard");
    expect(hit?.domainId).toBe("d1");
  });

  it("refuses to nest a domain inside a domain", () => {
    const domain = makeDomain("d1", 0, 0, { name: "Sales" });
    expect(findDomainDropTarget([domain], { x: 10, y: 10 }, "drag", DOMAIN_TYPE)).toBeNull();
  });
});

describe("domain store integration", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("adds a card to a domain and auto-sizes the frame", () => {
    const domain: CanvasElement<DomainData> = {
      id: "d1",
      type: DOMAIN_TYPE,
      x: 100,
      y: 100,
      width: 260,
      height: 160,
      data: domainCardTool.createDefaultData(),
    };
    const card = makeCard("c1", "commandCard", 900, 900);

    useCanvasStore.getState().addElement(domain);
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().updateElements([{ id: "c1", domainId: "d1" }]);

    const stored = useCanvasStore.getState().elements;
    expect(stored.find((el) => el.id === "c1")!.domainId).toBe("d1");

    const rd = stored.find((el) => el.id === "d1")!;
    expect(rd.width).toBeGreaterThan(200);
    expect(rd.x).toBe(900 - DOMAIN_PADDING);
  });
});

describe("findDomainFreeSpot", () => {
  it("keeps the dropped position when it is free", () => {
    const a = makeCard("a", "commandCard", 0, 0);
    expect(findDomainFreeSpot([a], { x: 400, y: 0, width: 200, height: 100 })).toEqual({
      x: 400,
      y: 0,
    });
  });

  it("moves a colliding card to a free slot beside the others", () => {
    const a = makeCard("a", "commandCard", 0, 0);
    const spot = findDomainFreeSpot([a], { x: 0, y: 0, width: 200, height: 100 });
    expect(spot).toEqual({ x: 200 + DOMAIN_CHILD_GAP, y: 0 });
  });

  it("never returns a position that overlaps an existing card", () => {
    const a = makeCard("a", "commandCard", 0, 0);
    const b = makeCard("b", "commandCard", 216, 0);
    const spot = findDomainFreeSpot([a, b], { x: 0, y: 0, width: 200, height: 100 });

    const collides = (o: CanvasElement) =>
      spot.x < o.x + o.width + 1 &&
      spot.x + 200 + 1 > o.x &&
      spot.y < o.y + o.height + 1 &&
      spot.y + 100 + 1 > o.y;
    expect(collides(a)).toBe(false);
    expect(collides(b)).toBe(false);
  });
});

describe("domain drop placement (interaction)", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("places a card entering a domain in a free spot instead of overlapping", () => {
    const domain = makeDomain("d1", 0, 0, { name: "Domain" });
    const a = makeCard("a", "commandCard", 60, 60, { width: 120, height: 80, domainId: "d1" });
    const b = makeCard("b", "queryCard", 60, 60, { width: 120, height: 80 });

    useCanvasStore.setState({
      elements: [domain, a, b],
      selectedIds: [],
      tool: "select",
      viewport: { x: 0, y: 0, zoom: 1, screenWidth: 800, screenHeight: 600 },
    });

    const spatialIndex = new SpatialIndex();
    spatialIndex.rebuild([domain, a, b]);

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

    const drag = new DragElementsInteraction();
    expect(
      drag.onPointerDown({ button: 0, shiftKey: false } as PointerEvent, { x: 100, y: 100 }, ctx),
    ).toBe(true);
    drag.onPointerMove({} as PointerEvent, { x: 110, y: 110 }, ctx);
    drag.onPointerUp({} as PointerEvent, { x: 110, y: 110 }, ctx);

    const stored = useCanvasStore.getState().elements;
    const rb = stored.find((el) => el.id === "b")!;
    const ra = stored.find((el) => el.id === "a")!;

    expect(rb.domainId).toBe("d1");
    const overlaps =
      rb.x < ra.x + ra.width &&
      rb.x + rb.width > ra.x &&
      rb.y < ra.y + ra.height &&
      rb.y + rb.height > ra.y;
    expect(overlaps).toBe(false);
  });
});

describe("domain AI operation", () => {
  it("creates a domain card at the spawn point", () => {
    expect(domainCardTool.ai?.toolName).toBe("create_domain_card");
    const element = domainCardTool.ai!.onCreate({ name: "Ordering" }, { x: 0, y: 0 });
    expect(element.type).toBe(DOMAIN_TYPE);
    expect((element.data as DomainData).name).toBe("Ordering");
    expect((element.data as DomainData).color).toBe(domainCardTool.color);
  });
});
