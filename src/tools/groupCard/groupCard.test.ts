import "@/tools";
import { describe, it, expect, beforeEach } from "vitest";
import {
  GROUP_CHILD_GAP,
  GROUP_LABEL_HEIGHT,
  GROUP_PADDING,
  GROUP_TYPE,
  computeGroupBounds,
  findGroupDropTarget,
  findGroupFreeSpot,
  reflowGroups,
  type GroupData,
} from "./layout";
import { groupCardTool } from "./index";
import { reflowDomains, DOMAIN_TYPE } from "@/tools/domainCard/layout";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { SpatialIndex } from "@/engine/SpatialIndex";
import { GizmoLayer } from "@/engine/layers/GizmoLayer";
import { ElementLayer } from "@/engine/layers/ElementLayer";
import { PreviewLayer } from "@/engine/layers/PreviewLayer";
import { DragElementsInteraction } from "@/engine/interactions/DragElementsInteraction";
import type { InteractionContext } from "@/engine/interactions/types";

function makeGroup(id: string, x: number, y: number, data: GroupData): CanvasElement<GroupData> {
  return { id, type: GROUP_TYPE, x, y, width: 240, height: 130, data };
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

describe("group layout", () => {
  it("bounds children with padding and a label band", () => {
    const a = makeCard("a", "objectCard", 100, 200, { width: 120, height: 80 });
    const b = makeCard("b", "serviceCard", 300, 240, { width: 150, height: 90 });

    const bounds = computeGroupBounds([a, b])!;
    expect(bounds.x).toBe(100 - GROUP_PADDING);
    expect(bounds.y).toBe(200 - GROUP_PADDING - GROUP_LABEL_HEIGHT);
    expect(bounds.width).toBe(300 + 150 - 100 + GROUP_PADDING * 2);
    expect(bounds.height).toBe(240 + 90 - 200 + GROUP_PADDING * 2 + GROUP_LABEL_HEIGHT);
  });

  it("returns null with no children", () => {
    expect(computeGroupBounds([])).toBeNull();
  });
});

describe("reflowGroups", () => {
  it("fits a group around its children", () => {
    const group = makeGroup("g1", 0, 0, { name: "Types" });
    const card = makeCard("c1", "objectCard", 100, 200, { groupId: "g1" });

    const result = reflowGroups([group, card]);
    const rg = result.find((el) => el.id === "g1")!;
    expect(rg.x).toBe(100 - GROUP_PADDING);
    expect(rg.width).toBe(200 + GROUP_PADDING * 2);
  });

  it("detaches membership pointing to a missing group", () => {
    const orphan = makeCard("c1", "objectCard", 0, 0, { groupId: "ghost" });
    const result = reflowGroups([orphan]);
    expect(result.find((el) => el.id === "c1")!.groupId).toBeUndefined();
  });

  it("detaches ineligible card types", () => {
    const group = makeGroup("g1", 0, 0, { name: "Types" });
    const event = makeCard("e1", "eventCard", 0, 0, { groupId: "g1" });

    const result = reflowGroups([group, event]);
    expect(result.find((el) => el.id === "e1")!.groupId).toBeUndefined();
  });

  it("keeps a state card as a group child", () => {
    const group = makeGroup("g1", 0, 0, { name: "States" });
    const state = makeCard("s1", "stateCard", 0, 0, { groupId: "g1" });

    const result = reflowGroups([group, state]);
    expect(result.find((el) => el.id === "s1")!.groupId).toBe("g1");
  });

  it("keeps an actor card as a group child", () => {
    const group = makeGroup("g1", 0, 0, { name: "Actors" });
    const actor = makeCard("a1", "actorCard", 0, 0, { groupId: "g1" });

    const result = reflowGroups([group, actor]);
    expect(result.find((el) => el.id === "a1")!.groupId).toBe("g1");
  });

  it("drops group membership from slice-lane members (exclusive)", () => {
    const group = makeGroup("g1", 0, 0, { name: "Types" });
    const card = makeCard("c1", "serviceCard", 0, 0, {
      groupId: "g1",
      sliceId: "s1",
      laneId: "l1",
    });

    const result = reflowGroups([group, card]);
    expect(result.find((el) => el.id === "c1")!.groupId).toBeUndefined();
  });
});

describe("findGroupDropTarget", () => {
  it("returns the group under the pointer for an eligible card", () => {
    const group = makeGroup("g1", 0, 0, { name: "Types" });
    const hit = findGroupDropTarget([group], { x: 10, y: 10 }, "drag", "objectCard");
    expect(hit?.groupId).toBe("g1");
    const stateHit = findGroupDropTarget([group], { x: 10, y: 10 }, "drag", "stateCard");
    expect(stateHit?.groupId).toBe("g1");
    const actorHit = findGroupDropTarget([group], { x: 10, y: 10 }, "drag", "actorCard");
    expect(actorHit?.groupId).toBe("g1");
  });

  it("refuses an ineligible card type", () => {
    const group = makeGroup("g1", 0, 0, { name: "Types" });
    expect(findGroupDropTarget([group], { x: 10, y: 10 }, "drag", "eventCard")).toBeNull();
    expect(findGroupDropTarget([group], { x: 10, y: 10 }, "drag", GROUP_TYPE)).toBeNull();
  });
});

describe("findGroupFreeSpot", () => {
  it("keeps the dropped position when it is free", () => {
    const a = makeCard("a", "objectCard", 0, 0);
    expect(findGroupFreeSpot([a], { x: 400, y: 0, width: 200, height: 100 })).toEqual({
      x: 400,
      y: 0,
    });
  });

  it("moves a colliding card to a free slot beside the others", () => {
    const a = makeCard("a", "objectCard", 0, 0);
    const spot = findGroupFreeSpot([a], { x: 0, y: 0, width: 200, height: 100 });
    expect(spot).toEqual({ x: 200 + GROUP_CHILD_GAP, y: 0 });
  });
});

describe("group store integration", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("adds a card to a group and auto-sizes the frame", () => {
    const group: CanvasElement<GroupData> = {
      id: "g1",
      type: GROUP_TYPE,
      x: 100,
      y: 100,
      width: 240,
      height: 130,
      data: groupCardTool.createDefaultData(),
    };
    const card = makeCard("c1", "objectCard", 900, 900);

    useCanvasStore.getState().addElement(group);
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().updateElements([{ id: "c1", groupId: "g1" }]);

    const stored = useCanvasStore.getState().elements;
    expect(stored.find((el) => el.id === "c1")!.groupId).toBe("g1");

    const rg = stored.find((el) => el.id === "g1")!;
    expect(rg.width).toBeGreaterThan(200);
    expect(rg.x).toBe(900 - GROUP_PADDING);
  });

  it("keeps a group child inside the domain only through the group frame", () => {
    const domain = makeCard("d1", DOMAIN_TYPE, 0, 0, {
      width: 260,
      height: 160,
      data: { name: "Ordering" },
    });
    const group = makeGroup("g1", 100, 100, { name: "Types" });
    group.domainId = "d1";
    const card = makeCard("c1", "objectCard", 120, 140, { groupId: "g1" });

    const result = reflowDomains(reflowGroups([domain, group, card]));
    // The card is in the group, so it is not a *direct* domain child.
    expect(result.find((el) => el.id === "c1")!.domainId).toBeUndefined();
    expect(result.find((el) => el.id === "c1")!.groupId).toBe("g1");
    // The group frame is the direct domain child and is wrapped by the domain.
    expect(result.find((el) => el.id === "g1")!.domainId).toBe("d1");
  });
});

describe("group drop placement (interaction)", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("places a card entering a group in a free spot instead of overlapping", () => {
    const group = makeGroup("g1", 0, 0, { name: "Group" });
    const a = makeCard("a", "objectCard", 60, 60, { width: 120, height: 80, groupId: "g1" });
    const b = makeCard("b", "serviceCard", 60, 60, { width: 120, height: 80 });

    useCanvasStore.setState({
      elements: [group, a, b],
      selectedIds: [],
      tool: "select",
      viewport: { x: 0, y: 0, zoom: 1, screenWidth: 800, screenHeight: 600 },
    });

    const spatialIndex = new SpatialIndex();
    spatialIndex.rebuild([group, a, b]);

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

    expect(rb.groupId).toBe("g1");
    const overlaps =
      rb.x < ra.x + ra.width &&
      rb.x + rb.width > ra.x &&
      rb.y < ra.y + ra.height &&
      rb.y + rb.height > ra.y;
    expect(overlaps).toBe(false);
  });
});

describe("group AI operation", () => {
  it("creates a group card at the spawn point", () => {
    expect(groupCardTool.ai?.toolName).toBe("create_group_card");
    const element = groupCardTool.ai!.onCreate({ name: "MoneyTypes" }, { x: 0, y: 0 });
    expect(element.type).toBe(GROUP_TYPE);
    expect((element.data as GroupData).name).toBe("MoneyTypes");
    expect((element.data as GroupData).color).toBe(groupCardTool.color);
  });
});
