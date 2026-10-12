import { describe, it, expect, beforeEach } from "vitest";
import { commandCardTool, type CommandCardData } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { navigateSubSelect } from "@/utils/subSelection";

describe("commandCardTool multi-section (inputs & responses)", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const card: CanvasElement<CommandCardData> = {
    id: "cmd-1",
    type: "commandCard",
    x: 100,
    y: 100,
    width: 220,
    height: 160,
    data: {
      name: "PlaceOrder",
      inputs: [
        { name: "orderId", type: "string" },
        { name: "totalAmount", type: "number" },
      ],
      responses: [
        { name: "trackingCode", type: "string" },
      ],
      color: "#2563eb",
    },
  };

  it("has correct metadata and default styling", () => {
    expect(commandCardTool.type).toBe("commandCard");
    expect(commandCardTool.name).toBe("Command");
    expect(commandCardTool.color).toBe("#2563eb");
    expect(commandCardTool.category).toBe("modeling");
    expect(commandCardTool.defaultSize).toEqual({ width: 220, height: 160 });
  });

  it("computes height accurately for 2 sections", () => {
    // 32 (header) + 28 (action row) + 22 (input header) + 2*28 (inputs) + 22 (resp header) + 1*28 (responses) = 188
    const size = commandCardTool.computeSize!(card.data);
    expect(size.width).toBe(220);
    expect(size.height).toBe(188);
  });

  it("sub-selects fields correctly across both sections", () => {
    // Header area (y <= 32)
    expect(commandCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();

    // Action row (32 <= y < 60) is not selectable
    expect(commandCardTool.onSubSelect!(card, { x: 50, y: 45 })).toBeNull();

    // Input section banner (60 <= y < 82)
    expect(commandCardTool.onSubSelect!(card, { x: 50, y: 70 })).toBeNull();

    // Input 0: y in [82, 110) -> e.g. y = 95
    const in0 = commandCardTool.onSubSelect!(card, { x: 50, y: 95 });
    expect(in0).toEqual({
      elementId: "cmd-1",
      sectionIndex: 0,
      sectionId: "inputs",
      fieldIndex: 0,
    });

    // Input 1: y in [110, 138) -> e.g. y = 125
    const in1 = commandCardTool.onSubSelect!(card, { x: 50, y: 125 });
    expect(in1).toEqual({
      elementId: "cmd-1",
      sectionIndex: 0,
      sectionId: "inputs",
      fieldIndex: 1,
    });

    // Response section banner (138 <= y < 160) -> e.g. y = 150
    expect(commandCardTool.onSubSelect!(card, { x: 50, y: 150 })).toBeNull();

    // Response 0: y in [160, 188) -> e.g. y = 175
    const res0 = commandCardTool.onSubSelect!(card, { x: 50, y: 175 });
    expect(res0).toEqual({
      elementId: "cmd-1",
      sectionIndex: 1,
      sectionId: "responses",
      fieldIndex: 0,
    });

    // Below card -> null
    expect(commandCardTool.onSubSelect!(card, { x: 50, y: 210 })).toBeNull();
  });

  it("returns inline edit target for header (Command Name)", () => {
    useCanvasStore.getState().addElement(card);

    const target = commandCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Place Order");
    expect(target?.multiline).toBe(false);

    // Commit change
    target?.onCommit("CancelOrder");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "cmd-1");
    expect(updated?.data.name).toBe("cancelOrder");

    // Undo reverts back
    useCanvasStore.getState().undo();
    const reverted = useCanvasStore.getState().elements.find((e) => e.id === "cmd-1");
    expect(reverted?.data.name).toBe("placeOrder");
  });

  it("shows the action token human-readable while storing its canonical form", () => {
    const withAction: CanvasElement<CommandCardData> = {
      ...card,
      data: { ...card.data, action: "sales:placeOrder" },
    };
    useCanvasStore.getState().addElement(withAction);

    // Action row occupies y in [32, 60); e.g. y = 45.
    const target = commandCardTool.getInlineEditTarget!(withAction, { x: 30, y: 45 });
    expect(target?.initialValue).toBe("Sales:PlaceOrder");

    const undoBefore = useCanvasStore.getState().undoStack.length;
    // Committing the untouched display form is a no-op (no spurious undo step).
    target?.onCommit("Sales:PlaceOrder");
    expect(useCanvasStore.getState().undoStack.length).toBe(undoBefore);

    // A genuine edit is stored in canonical form.
    target?.onCommit("Sales:Cancel Order");
    const updated = useCanvasStore.getState().elements.find((e) => e.id === "cmd-1");
    expect(updated?.data.action).toBe("sales:cancelOrder");
  });

  it("returns inline edit target for Input Field Name", () => {
    useCanvasStore.getState().addElement(card);

    // Double click on input 0 (orderId) at y = 95
    const target = commandCardTool.getInlineEditTarget!(card, { x: 30, y: 95 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Order ID");

    // Commit change
    target?.onCommit("cartId");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "cmd-1");
    expect(updated?.data.inputs?.[0].name).toBe("cartId");
    expect(updated?.data.inputs?.[0].type).toBe("string");

    // Selected field state was updated
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "cmd-1",
      sectionIndex: 0,
      sectionId: "inputs",
      fieldIndex: 0,
    });
  });

  it("returns inline edit target for Response Field Name", () => {
    useCanvasStore.getState().addElement(card);

    // Double click on response 0 (trackingCode) at y = 175
    const target = commandCardTool.getInlineEditTarget!(card, { x: 30, y: 175 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Tracking Code");

    // Commit change
    target?.onCommit("shipmentId");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "cmd-1");
    expect(updated?.data.responses?.[0].name).toBe("shipmentId");
    expect(updated?.data.responses?.[0].type).toBe("string");

    // Selected field state was updated
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "cmd-1",
      sectionIndex: 1,
      sectionId: "responses",
      fieldIndex: 0,
    });
  });

  it("deletes sub-selected field from section 0 (inputs)", () => {
    const patch = commandCardTool.onDeleteSubSelect!(card, 0, 0);
    expect(patch).not.toBeNull();
    expect(patch?.data?.inputs?.length).toBe(1);
    expect(patch?.data?.inputs?.[0].name).toBe("totalAmount");
    expect(patch?.data?.responses?.length).toBe(1);
    // Height updated: 32 + 28 (action) + 22 + 1*28 + 22 + 1*28 = 160
    expect(patch?.height).toBe(160);
  });

  it("deletes sub-selected field from section 1 (responses)", () => {
    const patch = commandCardTool.onDeleteSubSelect!(card, 0, 1);
    expect(patch).not.toBeNull();
    expect(patch?.data?.inputs?.length).toBe(2);
    expect(patch?.data?.responses?.length).toBe(0);
    // Height: 32 + 28 (action) + 22 + 2*28 + 22 + 1*28 (min 1 row for empty response) = 188
    expect(patch?.height).toBe(188);
  });

  it("updates field type for input and response", () => {
    // Update input type
    const inputPatch = commandCardTool.onUpdateSubSelectType!(
      card,
      { elementId: "cmd-1", sectionIndex: 0, fieldIndex: 0 },
      "uuid",
    );
    expect(inputPatch?.data?.inputs?.[0].type).toBe("uuid");

    // Update response type
    const respPatch = commandCardTool.onUpdateSubSelectType!(
      card,
      { elementId: "cmd-1", sectionIndex: 1, fieldIndex: 0 },
      "object",
    );
    expect(respPatch?.data?.responses?.[0].type).toBe("object");
  });

  it("navigates across sections via arrow keys", () => {
    // Inside inputs: 0 -> 1
    const next1 = navigateSubSelect(
      card,
      { elementId: "cmd-1", sectionIndex: 0, fieldIndex: 0 },
      "down",
      commandCardTool,
    );
    expect(next1).toEqual({
      elementId: "cmd-1",
      sectionIndex: 0,
      sectionId: "inputs",
      fieldIndex: 1,
    });

    // From last input (section 0, index 1) down -> jumps to first response (section 1, index 0)!
    const jumpToResp = navigateSubSelect(
      card,
      { elementId: "cmd-1", sectionIndex: 0, fieldIndex: 1 },
      "down",
      commandCardTool,
    );
    expect(jumpToResp).toEqual({
      elementId: "cmd-1",
      sectionIndex: 1,
      sectionId: "responses",
      fieldIndex: 0,
    });

    // From first response (section 1, index 0) up -> jumps back to last input (section 0, index 1)!
    const jumpToInput = navigateSubSelect(
      card,
      { elementId: "cmd-1", sectionIndex: 1, fieldIndex: 0 },
      "up",
      commandCardTool,
    );
    expect(jumpToInput).toEqual({
      elementId: "cmd-1",
      sectionIndex: 0,
      sectionId: "inputs",
      fieldIndex: 1,
    });
  });

  it("sets validation on input fields and ignores response fields", () => {
    const inputPatch = commandCardTool.onUpdateSubSelectValidation!(
      card,
      { elementId: "cmd-1", sectionIndex: 0, fieldIndex: 1 },
      { min: 0, max: 1000 },
    );
    expect(inputPatch?.data?.inputs?.[1].validation).toEqual({ min: 0, max: 1000 });

    // Responses are outputs, so validation is not accepted on them.
    const respPatch = commandCardTool.onUpdateSubSelectValidation!(
      card,
      { elementId: "cmd-1", sectionIndex: 1, fieldIndex: 0 },
      { pattern: "^[A-Z]+$" },
    );
    expect(respPatch).toBeNull();

    // Clearing removes the key.
    const withValidation = {
      ...card,
      data: { ...card.data, inputs: inputPatch!.data!.inputs! },
    };
    const cleared = commandCardTool.onUpdateSubSelectValidation!(
      withValidation as CanvasElement<CommandCardData>,
      { elementId: "cmd-1", sectionIndex: 0, fieldIndex: 1 },
      null,
    );
    expect(cleared?.data?.inputs?.[1].validation).toBeUndefined();
  });
});
