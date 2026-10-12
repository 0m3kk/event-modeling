import { describe, it, expect, beforeEach } from "vitest";
import { queryCardTool, type QueryCardData } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { navigateSubSelect } from "@/utils/subSelection";

describe("queryCardTool multi-section (params & responses)", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const card: CanvasElement<QueryCardData> = {
    id: "qry-1",
    type: "queryCard",
    x: 100,
    y: 100,
    width: 220,
    height: 160,
    data: {
      name: "GetOrder",
      params: [
        { name: "orderId", type: "string" },
        { name: "totalAmount", type: "number" },
      ],
      responses: [{ name: "trackingCode", type: "string" }],
      color: "#16a34a",
    },
  };

  it("has correct metadata and default styling", () => {
    expect(queryCardTool.type).toBe("queryCard");
    expect(queryCardTool.name).toBe("Query");
    expect(queryCardTool.color).toBe("#16a34a");
    expect(queryCardTool.category).toBe("modeling");
    expect(queryCardTool.defaultSize).toEqual({ width: 220, height: 160 });
  });

  it("computes height accurately for 2 sections", () => {
    // 32 (header) + 28 (action row) + 22 (param header) + 2*28 (params) + 22 (resp header) + 1*28 (responses) = 188
    const size = queryCardTool.computeSize!(card.data);
    expect(size.width).toBe(220);
    expect(size.height).toBe(188);
  });

  it("sub-selects fields correctly across both sections", () => {
    // Header area (y <= 32)
    expect(queryCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();

    // Action row (32 <= y < 60) is not selectable
    expect(queryCardTool.onSubSelect!(card, { x: 50, y: 45 })).toBeNull();

    // Param section banner (60 <= y < 82)
    expect(queryCardTool.onSubSelect!(card, { x: 50, y: 70 })).toBeNull();

    // Param 0: y in [82, 110) -> e.g. y = 95
    const p0 = queryCardTool.onSubSelect!(card, { x: 50, y: 95 });
    expect(p0).toEqual({
      elementId: "qry-1",
      sectionIndex: 0,
      sectionId: "params",
      fieldIndex: 0,
    });

    // Param 1: y in [110, 138) -> e.g. y = 125
    const p1 = queryCardTool.onSubSelect!(card, { x: 50, y: 125 });
    expect(p1).toEqual({
      elementId: "qry-1",
      sectionIndex: 0,
      sectionId: "params",
      fieldIndex: 1,
    });

    // Response section banner (138 <= y < 160) -> e.g. y = 150
    expect(queryCardTool.onSubSelect!(card, { x: 50, y: 150 })).toBeNull();

    // Response 0: y in [160, 188) -> e.g. y = 175
    const r0 = queryCardTool.onSubSelect!(card, { x: 50, y: 175 });
    expect(r0).toEqual({
      elementId: "qry-1",
      sectionIndex: 1,
      sectionId: "responses",
      fieldIndex: 0,
    });

    // Below card -> null
    expect(queryCardTool.onSubSelect!(card, { x: 50, y: 210 })).toBeNull();
  });

  it("returns inline edit target for header (Query Name)", () => {
    useCanvasStore.getState().addElement(card);

    const target = queryCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Get Order");
    expect(target?.multiline).toBe(false);

    // Commit change
    target?.onCommit("FindOrder");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "qry-1");
    expect(updated?.data.name).toBe("findOrder");

    // Undo reverts back
    useCanvasStore.getState().undo();
    const reverted = useCanvasStore.getState().elements.find((e) => e.id === "qry-1");
    expect(reverted?.data.name).toBe("getOrder");
  });

  it("shows the action token in PascalCase while storing its canonical form", () => {
    const withAction: CanvasElement<QueryCardData> = {
      ...card,
      data: { ...card.data, action: "sales:getOrder" },
    };
    useCanvasStore.getState().addElement(withAction);

    // Action row occupies y in [32, 60); e.g. y = 45.
    const target = queryCardTool.getInlineEditTarget!(withAction, { x: 30, y: 45 });
    expect(target?.initialValue).toBe("Sales:GetOrder");

    const undoBefore = useCanvasStore.getState().undoStack.length;
    target?.onCommit("Sales:GetOrder");
    expect(useCanvasStore.getState().undoStack.length).toBe(undoBefore);

    target?.onCommit("Sales:FindOrder");
    const updated = useCanvasStore.getState().elements.find((e) => e.id === "qry-1");
    expect(updated?.data.action).toBe("sales:findOrder");
  });

  it("returns inline edit target for Param Field Name", () => {
    useCanvasStore.getState().addElement(card);

    // Double click on param 0 (orderId) at y = 95
    const target = queryCardTool.getInlineEditTarget!(card, { x: 30, y: 95 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Order ID");

    // Commit change
    target?.onCommit("cartId");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "qry-1");
    expect(updated?.data.params?.[0].name).toBe("cartId");
    expect(updated?.data.params?.[0].type).toBe("string");

    // Selected field state was updated
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "qry-1",
      sectionIndex: 0,
      sectionId: "params",
      fieldIndex: 0,
    });
  });

  it("returns inline edit target for Response Field Name", () => {
    useCanvasStore.getState().addElement(card);

    // Double click on response 0 (trackingCode) at y = 175
    const target = queryCardTool.getInlineEditTarget!(card, { x: 30, y: 175 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Tracking Code");

    // Commit change
    target?.onCommit("shipmentId");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "qry-1");
    expect(updated?.data.responses?.[0].name).toBe("shipmentId");
    expect(updated?.data.responses?.[0].type).toBe("string");

    // Selected field state was updated
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "qry-1",
      sectionIndex: 1,
      sectionId: "responses",
      fieldIndex: 0,
    });
  });

  it("deletes sub-selected field from section 0 (params)", () => {
    const patch = queryCardTool.onDeleteSubSelect!(card, 0, 0);
    expect(patch).not.toBeNull();
    expect(patch?.data?.params?.length).toBe(1);
    expect(patch?.data?.params?.[0].name).toBe("totalAmount");
    expect(patch?.data?.responses?.length).toBe(1);
    // Height updated: 32 + 28 (action) + 22 + 1*28 + 22 + 1*28 = 160
    expect(patch?.height).toBe(160);
  });

  it("deletes sub-selected field from section 1 (responses)", () => {
    const patch = queryCardTool.onDeleteSubSelect!(card, 0, 1);
    expect(patch).not.toBeNull();
    expect(patch?.data?.params?.length).toBe(2);
    expect(patch?.data?.responses?.length).toBe(0);
    // Height: 32 + 28 (action) + 22 + 2*28 + 22 + 1*28 (min 1 row for empty response) = 188
    expect(patch?.height).toBe(188);
  });

  it("updates field type for param and response", () => {
    // Update param type
    const paramPatch = queryCardTool.onUpdateSubSelectType!(
      card,
      { elementId: "qry-1", sectionIndex: 0, fieldIndex: 0 },
      "uuid",
    );
    expect(paramPatch?.data?.params?.[0].type).toBe("uuid");

    // Update response type
    const respPatch = queryCardTool.onUpdateSubSelectType!(
      card,
      { elementId: "qry-1", sectionIndex: 1, fieldIndex: 0 },
      "object",
    );
    expect(respPatch?.data?.responses?.[0].type).toBe("object");
  });

  it("navigates across sections via arrow keys", () => {
    // Inside params: 0 -> 1
    const next1 = navigateSubSelect(
      card,
      { elementId: "qry-1", sectionIndex: 0, fieldIndex: 0 },
      "down",
      queryCardTool,
    );
    expect(next1).toEqual({
      elementId: "qry-1",
      sectionIndex: 0,
      sectionId: "params",
      fieldIndex: 1,
    });

    // From last param (section 0, index 1) down -> jumps to first response (section 1, index 0)!
    const jumpToResp = navigateSubSelect(
      card,
      { elementId: "qry-1", sectionIndex: 0, fieldIndex: 1 },
      "down",
      queryCardTool,
    );
    expect(jumpToResp).toEqual({
      elementId: "qry-1",
      sectionIndex: 1,
      sectionId: "responses",
      fieldIndex: 0,
    });

    // From first response (section 1, index 0) up -> jumps back to last param (section 0, index 1)!
    const jumpToParam = navigateSubSelect(
      card,
      { elementId: "qry-1", sectionIndex: 1, fieldIndex: 0 },
      "up",
      queryCardTool,
    );
    expect(jumpToParam).toEqual({
      elementId: "qry-1",
      sectionIndex: 0,
      sectionId: "params",
      fieldIndex: 1,
    });
  });

  it("sets validation on params and ignores response fields", () => {
    const paramPatch = queryCardTool.onUpdateSubSelectValidation!(
      card,
      { elementId: "qry-1", sectionIndex: 0, fieldIndex: 1 },
      { min: 0 },
    );
    expect(paramPatch?.data?.params?.[1].validation).toEqual({ min: 0 });

    // Responses are outputs, so validation is not accepted on them.
    const respPatch = queryCardTool.onUpdateSubSelectValidation!(
      card,
      { elementId: "qry-1", sectionIndex: 1, fieldIndex: 0 },
      { minItems: 1, maxItems: 5 },
    );
    expect(respPatch).toBeNull();

    const withValidation = {
      ...card,
      data: { ...card.data, params: paramPatch!.data!.params! },
    };
    const cleared = queryCardTool.onUpdateSubSelectValidation!(
      withValidation as CanvasElement<QueryCardData>,
      { elementId: "qry-1", sectionIndex: 0, fieldIndex: 1 },
      null,
    );
    expect(cleared?.data?.params?.[1].validation).toBeUndefined();
  });
});
