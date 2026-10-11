import "@/tools";
import { describe, it, expect, beforeEach } from "vitest";
import {
  SLICE_CHILD_GAP,
  SLICE_HEADER_HEIGHT,
  SLICE_LANE_LABEL_HEIGHT,
  SLICE_LANE_PADDING,
  SLICE_LANE_MIN_CONTENT_HEIGHT,
  SLICE_TYPE,
  computeSliceCardSize,
  computeSliceLayout,
  createSliceLane,
  findSliceDropTarget,
  normalizeSliceData,
  orderForRender,
  reflowSlices,
  type SliceData,
} from "./layout";
import { sliceCardTool } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

function makeSlice(id: string, x: number, y: number, data: SliceData): CanvasElement<SliceData> {
  return { id, type: SLICE_TYPE, x, y, width: 320, height: 200, data };
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

describe("slice layout", () => {
  it("derives lane type from the first card and stacks lanes vertically", () => {
    const lane0 = createSliceLane();
    const lane1 = createSliceLane();
    const slice = makeSlice("s1", 0, 0, {
      name: "Slice",
      lanes: [lane0, lane1],
    });
    const c1 = makeCard("c1", "commandCard", 0, 0, { sliceId: "s1", laneId: lane0.id });
    const c2 = makeCard("c2", "queryCard", 0, 0, { sliceId: "s1", laneId: lane1.id });

    const layout = computeSliceLayout(slice, [c1, c2]);

    expect(layout.lanes).toHaveLength(2);
    expect(layout.lanes[0].childType).toBe("commandCard");
    expect(layout.lanes[1].childType).toBe("queryCard");

    // Lane 0 starts right under the header; lane 1 starts after lane 0.
    expect(layout.lanes[0].top).toBe(SLICE_HEADER_HEIGHT);
    expect(layout.lanes[1].top).toBe(layout.lanes[0].top + layout.lanes[0].height);

    // Single 200-wide, 100-tall card → lane height is label + padding + content.
    expect(layout.lanes[0].contentHeight).toBe(100);
    expect(layout.lanes[0].height).toBe(SLICE_LANE_LABEL_HEIGHT + SLICE_LANE_PADDING * 2 + 100);

    // Card sits at the lane's left padding.
    expect(layout.placements.get("c1")).toEqual({
      x: SLICE_LANE_PADDING,
      y: SLICE_HEADER_HEIGHT + SLICE_LANE_LABEL_HEIGHT + SLICE_LANE_PADDING,
    });
  });

  it("flows multiple cards left-to-right with a gap", () => {
    const lane = createSliceLane();
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });
    const c1 = makeCard("c1", "eventCard", 0, 0, { sliceId: "s1", laneId: lane.id, width: 150 });
    const c2 = makeCard("c2", "eventCard", 5, 0, { sliceId: "s1", laneId: lane.id, width: 150 });

    const layout = computeSliceLayout(slice, [c2, c1]);
    const p1 = layout.placements.get("c1")!;
    const p2 = layout.placements.get("c2")!;

    expect(p1.x).toBe(SLICE_LANE_PADDING);
    expect(p2.x).toBe(SLICE_LANE_PADDING + 150 + SLICE_CHILD_GAP);
  });

  it("keeps a reserved lane's type even when empty", () => {
    const lane = createSliceLane("commandCard");
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });

    const layout = computeSliceLayout(slice, []);
    expect(layout.lanes[0].childType).toBe("commandCard");
  });

  it("centers narrower lanes against the widest lane", () => {
    const lane0 = createSliceLane();
    const lane1 = createSliceLane();
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane0, lane1] });
    const a = makeCard("a1", "commandCard", 0, 0, { sliceId: "s1", laneId: lane0.id, width: 150 });
    const b1 = makeCard("b1", "queryCard", 0, 0, { sliceId: "s1", laneId: lane1.id, width: 200 });
    const b2 = makeCard("b2", "queryCard", 300, 0, { sliceId: "s1", laneId: lane1.id, width: 200 });

    const layout = computeSliceLayout(slice, [a, b1, b2]);
    const widest = 200 + SLICE_CHILD_GAP + 200;

    // Widest lane keeps the left padding...
    expect(layout.placements.get("b1")!.x).toBe(SLICE_LANE_PADDING);
    // ...the narrower lane is centered against it.
    expect(layout.placements.get("a1")!.x).toBe(SLICE_LANE_PADDING + (widest - 150) / 2);
  });

  it("keeps a stable default size for an empty slice", () => {
    const size = computeSliceCardSize({ name: "Slice", lanes: [] });
    expect(size.width).toBe(320);
    expect(size.height).toBeGreaterThan(SLICE_HEADER_HEIGHT);
  });
});

describe("normalizeSliceData", () => {
  it("drops duplicate / malformed lane ids", () => {
    const data: SliceData = {
      name: "Slice",
      lanes: [{ id: "a" }, { id: "a" }, { id: "" } as never, { id: "b" }],
    };
    expect(normalizeSliceData(data).lanes).toEqual([{ id: "a" }, { id: "b" }]);
  });
});

describe("orderForRender", () => {
  it("puts slices before other elements, preserving the rest", () => {
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [] });
    const child = makeCard("c1", "commandCard", 0, 0, { sliceId: "s1", laneId: "x" });
    const other = makeCard("n1", "stickyNote", 0, 0);

    const ordered = orderForRender([child, slice, other]);
    expect(ordered.map((el) => el.id)).toEqual(["s1", "c1", "n1"]);
  });
});

describe("reflowSlices", () => {
  it("sizes the slice and snaps cards into their lanes", () => {
    const lane0 = createSliceLane();
    const lane1 = createSliceLane();
    const slice = makeSlice("s1", 100, 100, { name: "Slice", lanes: [lane0, lane1] });
    const c1 = makeCard("c1", "commandCard", 9999, 9999, { sliceId: "s1", laneId: lane0.id });
    const c2 = makeCard("c2", "queryCard", 9999, 9999, { sliceId: "s1", laneId: lane1.id });

    const result = reflowSlices([slice, c1, c2]);
    const rs = result.find((el) => el.id === "s1")!;
    const rc1 = result.find((el) => el.id === "c1")!;
    const rc2 = result.find((el) => el.id === "c2")!;

    expect(rs.x).toBe(100);
    expect(rc1.x).toBe(100 + SLICE_LANE_PADDING);
    expect(rc2.x).toBe(100 + SLICE_LANE_PADDING);
    expect(rc2.y).toBeGreaterThan(rc1.y);
    expect(rs.height).toBeGreaterThan(SLICE_LANE_MIN_CONTENT_HEIGHT);
  });

  it("returns the same array when nothing changes", () => {
    const lane = createSliceLane();
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });
    const once = reflowSlices([slice]);
    const twice = reflowSlices(once);
    expect(twice).toBe(once);
  });

  it("detaches cards whose slice or lane no longer exists", () => {
    const lane = createSliceLane();
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });
    const orphan = makeCard("o1", "commandCard", 0, 0, { sliceId: "gone", laneId: "nope" });
    const laneGone = makeCard("o2", "commandCard", 0, 0, { sliceId: "s1", laneId: "nope" });

    const result = reflowSlices([slice, orphan, laneGone]);
    expect(result.find((el) => el.id === "o1")!.sliceId).toBeUndefined();
    expect(result.find((el) => el.id === "o2")!.sliceId).toBeUndefined();
  });

  it("enforces a single child type per lane", () => {
    const lane = createSliceLane();
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });
    // Left-most card wins the lane type.
    const command = makeCard("c1", "commandCard", 10, 0, { sliceId: "s1", laneId: lane.id });
    const query = makeCard("q1", "queryCard", 20, 0, { sliceId: "s1", laneId: lane.id });

    const result = reflowSlices([slice, query, command]);
    expect(result.find((el) => el.id === "c1")!.sliceId).toBe("s1");
    expect(result.find((el) => el.id === "q1")!.sliceId).toBeUndefined();
  });

  it("detaches cards that clash with a reserved lane type", () => {
    const lane = createSliceLane("commandCard");
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });
    const query = makeCard("q1", "queryCard", 0, 0, { sliceId: "s1", laneId: lane.id });

    const result = reflowSlices([slice, query]);
    expect(result.find((el) => el.id === "q1")!.sliceId).toBeUndefined();
  });

  it("detaches ineligible card types that got assigned to a lane", () => {
    const lane = createSliceLane();
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });
    const object = makeCard("o1", "objectCard", 0, 0, { sliceId: "s1", laneId: lane.id });

    const result = reflowSlices([slice, object]);
    expect(result.find((el) => el.id === "o1")!.sliceId).toBeUndefined();
    expect(result.find((el) => el.id === "o1")!.laneId).toBeUndefined();
  });
});

describe("findSliceDropTarget", () => {
  it("accepts any card into an empty lane", () => {
    const lane = createSliceLane();
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });
    const target = findSliceDropTarget([slice], { x: 100, y: 60 }, "dragged", "commandCard");
    expect(target).not.toBeNull();
    expect(target!.laneId).toBe(lane.id);
    expect(target!.allowed).toBe(true);
    expect(target!.expectedType).toBeNull();
  });

  it("rejects a card of the wrong type for a lane", () => {
    const lane = createSliceLane();
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });
    const command = makeCard("c1", "commandCard", 12, 46, { sliceId: "s1", laneId: lane.id });

    const target = findSliceDropTarget([slice, command], { x: 100, y: 60 }, "dragged", "queryCard");
    expect(target).not.toBeNull();
    expect(target!.allowed).toBe(false);
    expect(target!.expectedType).toBe("commandCard");
  });

  it("refuses type-definition cards (enum/object/alias)", () => {
    const lane = createSliceLane();
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });

    for (const type of ["enumCard", "objectCard", "aliasCard"]) {
      expect(findSliceDropTarget([slice], { x: 100, y: 60 }, "dragged", type)).toBeNull();
    }
    // A modellable card is still accepted.
    expect(findSliceDropTarget([slice], { x: 100, y: 60 }, "dragged", "commandCard")).not.toBeNull();
  });

  it("enforces a reserved lane type even while the lane is empty", () => {
    const lane = createSliceLane("commandCard");
    const slice = makeSlice("s1", 0, 0, { name: "Slice", lanes: [lane] });

    const ok = findSliceDropTarget([slice], { x: 100, y: 60 }, "dragged", "commandCard");
    expect(ok!.allowed).toBe(true);

    const bad = findSliceDropTarget([slice], { x: 100, y: 60 }, "dragged", "queryCard");
    expect(bad!.allowed).toBe(false);
    expect(bad!.expectedType).toBe("commandCard");
  });
});

describe("slice store integration", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("places a dropped card into a lane and auto-sizes the slice", () => {
    const sliceData = sliceCardTool.createDefaultData();
    const slice: CanvasElement<SliceData> = {
      id: "slice-1",
      type: SLICE_TYPE,
      x: 200,
      y: 200,
      width: 320,
      height: 100,
      data: sliceData,
    };
    const card = makeCard("cmd-1", "commandCard", 900, 900);

    useCanvasStore.getState().addElement(slice);
    useCanvasStore.getState().addElement(card);

    const laneId = sliceData.lanes[0].id;
    useCanvasStore.getState().updateElements([
      { id: "cmd-1", sliceId: "slice-1", laneId },
    ]);

    const stored = useCanvasStore.getState().elements;
    const storedCard = stored.find((el) => el.id === "cmd-1")!;
    const storedSlice = stored.find((el) => el.id === "slice-1")!;

    expect(storedCard.sliceId).toBe("slice-1");
    expect(storedCard.laneId).toBe(laneId);
    expect(storedCard.x).toBe(200 + SLICE_LANE_PADDING);
    expect(storedSlice.height).toBeGreaterThan(100);
  });

  it("pushes cards out when their lane is removed", () => {
    const sliceData = sliceCardTool.createDefaultData();
    const laneId = sliceData.lanes[0].id;
    const slice: CanvasElement<SliceData> = {
      id: "slice-1",
      type: SLICE_TYPE,
      x: 0,
      y: 0,
      width: 320,
      height: 100,
      data: sliceData,
    };
    const card = makeCard("cmd-1", "commandCard", 0, 0, {
      sliceId: "slice-1",
      laneId,
    });

    useCanvasStore.getState().addElement(slice);
    useCanvasStore.getState().addElement(card);

    const patch = sliceCardTool.onDeleteSubSelect!(
      useCanvasStore.getState().elements.find((el) => el.id === "slice-1")!,
      -1,
      0,
    );
    expect(patch).not.toBeNull();
    useCanvasStore.getState().updateElement("slice-1", patch!);

    const storedCard = useCanvasStore.getState().elements.find((el) => el.id === "cmd-1")!;
    expect(storedCard.sliceId).toBeUndefined();
    expect(storedCard.laneId).toBeUndefined();
  });
});
