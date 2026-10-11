import { describe, it, expect, beforeEach } from "vitest";
import { viewCardTool, computeViewCardSize, queryItemHeight, type ViewCardData } from "./index";
import { validateViewCardData } from "./rules";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { navigateSubSelect } from "@/utils/subSelection";

describe("viewCardTool multi-section (params, query, states)", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const card: CanvasElement<ViewCardData> = {
    id: "view-1",
    type: "viewCard",
    x: 100,
    y: 100,
    width: 220,
    height: 210,
    data: {
      name: "CourseView",
      params: [
        { name: "courseId", type: "string" },
        { name: "capacity", type: "number" },
      ],
      queryItems: [{ types: ["CourseDefined"], tags: [{ tag: "course", field: "courseId" }] }],
      states: [{ name: "exists", type: "boolean" }],
      color: "#0891b2",
    },
  };

  it("has correct metadata and default styling", () => {
    expect(viewCardTool.type).toBe("viewCard");
    expect(viewCardTool.name).toBe("View");
    expect(viewCardTool.color).toBe("#0891b2");
    expect(viewCardTool.category).toBe("modeling");
    expect(viewCardTool.defaultSize).toEqual({ width: 220, height: 182 });
  });

  it("computes height accurately for 3 sections", () => {
    // 32 + (22 + 2*28) + (22 + 1*28) + (22 + 1*28) = 210
    expect(computeViewCardSize(card.data).height).toBe(210);
  });

  it("sub-selects rows across all three sections", () => {
    // header
    expect(viewCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();
    // param banner (32..54)
    expect(viewCardTool.onSubSelect!(card, { x: 50, y: 40 })).toBeNull();
    // param 0 [54, 82)
    expect(viewCardTool.onSubSelect!(card, { x: 50, y: 65 })).toEqual({
      elementId: "view-1",
      sectionIndex: 0,
      sectionId: "params",
      fieldIndex: 0,
    });
    // param 1 [82, 110)
    expect(viewCardTool.onSubSelect!(card, { x: 50, y: 95 })).toMatchObject({
      sectionIndex: 0,
      fieldIndex: 1,
    });
    // query banner (110..132)
    expect(viewCardTool.onSubSelect!(card, { x: 50, y: 120 })).toBeNull();
    // query item 0 [132, 160)
    expect(viewCardTool.onSubSelect!(card, { x: 50, y: 145 })).toEqual({
      elementId: "view-1",
      sectionIndex: 1,
      sectionId: "query",
      fieldIndex: 0,
    });
    // state banner (160..182)
    expect(viewCardTool.onSubSelect!(card, { x: 50, y: 170 })).toBeNull();
    // state 0 [182, 210)
    expect(viewCardTool.onSubSelect!(card, { x: 50, y: 195 })).toEqual({
      elementId: "view-1",
      sectionIndex: 2,
      sectionId: "states",
      fieldIndex: 0,
    });
    // below card
    expect(viewCardTool.onSubSelect!(card, { x: 50, y: 240 })).toBeNull();
  });

  it("grows a query item into multiple lines (2 columns)", () => {
    const multi: CanvasElement<ViewCardData> = {
      ...card,
      data: {
        ...card.data,
        queryItems: [
          { types: ["CourseDefined", "CourseRenamed"], tags: [{ tag: "course", field: "courseId" }] },
        ],
      },
    };
    // 2 lines -> 5*2 padding + 2*18 = 46
    expect(queryItemHeight(multi.data.queryItems![0])).toBe(46);
    // 32 + (22+2*28) + (22+46) + (22+1*28) = 228
    expect(computeViewCardSize(multi.data).height).toBe(228);

    // The item now spans [132, 178); both lines map to the same item.
    expect(viewCardTool.onSubSelect!(multi, { x: 40, y: 140 })).toMatchObject({
      sectionIndex: 1,
      fieldIndex: 0,
    });
    expect(viewCardTool.onSubSelect!(multi, { x: 40, y: 170 })).toMatchObject({
      sectionIndex: 1,
      fieldIndex: 0,
    });
    // States section shifted down accordingly.
    expect(viewCardTool.onSubSelect!(multi, { x: 40, y: 210 })).toMatchObject({
      sectionIndex: 2,
      fieldIndex: 0,
    });
  });

  it("edits the state field name inline", () => {
    useCanvasStore.getState().addElement(card);
    const target = viewCardTool.getInlineEditTarget!(card, { x: 30, y: 195 });
    expect(target?.initialValue).toBe("Exists");
    target?.onCommit("available");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "view-1");
    expect(updated?.data.states?.[0].name).toBe("available");
  });

  it("deletes a row from each section and recomputes height", () => {
    const delParam = viewCardTool.onDeleteSubSelect!(card, 0, 0);
    expect(delParam?.data?.params?.length).toBe(1);
    expect(delParam?.height).toBe(182);

    const delQuery = viewCardTool.onDeleteSubSelect!(card, 0, 1);
    expect(delQuery?.data?.queryItems?.length).toBe(0);
    expect(delQuery?.height).toBe(210);

    const delState = viewCardTool.onDeleteSubSelect!(card, 0, 2);
    expect(delState?.data?.states?.length).toBe(0);
    // Empty sections still reserve one row, so the height is unchanged.
    expect(delState?.height).toBe(210);
  });

  it("updates field types only for params and states", () => {
    const paramPatch = viewCardTool.onUpdateSubSelectType!(
      card,
      { elementId: "view-1", sectionIndex: 0, fieldIndex: 0 },
      "uuid",
    );
    expect(paramPatch?.data?.params?.[0].type).toBe("uuid");

    const queryPatch = viewCardTool.onUpdateSubSelectType!(
      card,
      { elementId: "view-1", sectionIndex: 1, fieldIndex: 0 },
      "uuid",
    );
    expect(queryPatch).toBeNull();

    const statePatch = viewCardTool.onUpdateSubSelectType!(
      card,
      { elementId: "view-1", sectionIndex: 2, fieldIndex: 0 },
      "number",
    );
    expect(statePatch?.data?.states?.[0].type).toBe("number");
  });

  it("exposes section metadata and selected item", () => {
    expect(viewCardTool.getSubSelectSections!(card)).toEqual([
      { id: "params", name: "params", count: 2 },
      { id: "query", name: "query", count: 1 },
      { id: "states", name: "states", count: 1 },
    ]);

    expect(
      viewCardTool.getSelectedFieldItem!(card, { elementId: "view-1", sectionIndex: 1, fieldIndex: 0 }),
    ).toEqual({ name: "CourseDefined", type: "" });
  });

  it("navigates across the three sections via arrow keys", () => {
    const down = navigateSubSelect(
      card,
      { elementId: "view-1", sectionIndex: 0, fieldIndex: 1 },
      "down",
      viewCardTool,
    );
    expect(down).toMatchObject({ sectionIndex: 1, sectionId: "query", fieldIndex: 0 });

    const down2 = navigateSubSelect(
      card,
      { elementId: "view-1", sectionIndex: 1, fieldIndex: 0 },
      "down",
      viewCardTool,
    );
    expect(down2).toMatchObject({ sectionIndex: 2, sectionId: "states", fieldIndex: 0 });

    const up = navigateSubSelect(
      card,
      { elementId: "view-1", sectionIndex: 2, fieldIndex: 0 },
      "up",
      viewCardTool,
    );
    expect(up).toMatchObject({ sectionIndex: 1, sectionId: "query", fieldIndex: 0 });
  });
});

describe("viewCardTool DCB rule enforcement", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  function seedTaggedEvent() {
    useCanvasStore.getState().addElement({
      id: "evt-1",
      type: "eventCard",
      x: 0,
      y: 0,
      width: 220,
      height: 100,
      data: {
        name: "CourseDefined",
        fields: [{ name: "courseId", type: "string", isTag: true, tag: "course" }],
      },
    });
  }

  it("normalizeData drops tag references that break the rules", () => {
    const data: ViewCardData = {
      name: "Course",
      params: [{ name: "courseId", type: "string" }],
      queryItems: [
        { types: ["CourseDefined"], tags: [{ tag: "ghost", field: "courseId" }] },
        { types: [], tags: [{ tag: "course", field: "courseId" }] },
      ],
      states: [],
    };
    const board = [
      {
        id: "evt-1",
        type: "eventCard",
        x: 0,
        y: 0,
        width: 220,
        height: 100,
        data: { name: "CourseDefined", fields: [{ name: "courseId", type: "string", tag: "course" }] },
      },
    ];
    const normalized = viewCardTool.normalizeData!(data, { elements: board });
    expect(normalized.queryItems?.[0].tags).toHaveLength(0);
    expect(normalized.queryItems?.[1].tags).toHaveLength(1);
  });

  it("validateData rejects a tag that is unknown", () => {
    useCanvasStore.getState().clearBoard();
    const { issues } = viewCardTool.validateData!(
      {
        name: "Course",
        params: [{ name: "courseId", type: "string" }],
        queryItems: [{ types: ["CourseDefined"], tags: [{ tag: "course", field: "courseId" }] }],
        states: [],
      },
      { elements: [] },
    );
    expect(issues.some((i) => i.code === "tag_not_found")).toBe(true);
  });

  it("AI creation succeeds once the tag exists on the board", () => {
    seedTaggedEvent();
    const element = viewCardTool.ai!.onCreate(
      {
        name: "Course",
        params: [{ name: "courseId", type: "string" }],
        queryItems: [{ types: ["CourseDefined"], tags: [{ tag: "course", field: "courseId" }] }],
        states: [{ name: "exists", type: "boolean" }],
      },
      { x: 0, y: 0 },
    );
    expect(element.type).toBe("viewCard");
    expect(element.data.queryItems?.[0].tags).toHaveLength(1);
    expect(element.data.states?.[0].name).toBe("exists");
  });

  it("validateData reports the exact issue codes", () => {
    const { issues } = validateViewCardData(
      {
        name: "Course",
        params: [{ name: "courseId", type: "number" }],
        queryItems: [{ types: [], tags: [{ tag: "course", field: "courseId" }] }],
      },
      {
        elements: [
          {
            id: "evt-1",
            type: "eventCard",
            x: 0,
            y: 0,
            width: 220,
            height: 100,
            data: { name: "CourseDefined", fields: [{ name: "courseId", type: "string", tag: "course" }] },
          },
        ],
      },
    );
    expect(issues.some((i) => i.code === "type_mismatch")).toBe(true);
  });
});
