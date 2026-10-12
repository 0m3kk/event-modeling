import { describe, it, expect, beforeEach } from "vitest";
import { objectCardTool, type ObjectCardData } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

describe("ObjectCardTool sub-selection & inline edit targets", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const card: CanvasElement<ObjectCardData> = {
    id: "obj-1",
    type: "objectCard",
    x: 100,
    y: 100,
    width: 220,
    height: 88,
    data: {
      name: "Address",
      fields: [
        { name: "street", type: "string" },
        { name: "zip", type: "string" },
      ],
      color: "#c026d3",
    },
  };

  it("sub-selects fields correctly", () => {
    // Header area (y <= 32) is not a field
    expect(objectCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();

    // Field 0 starts at y=32, height 28 (range 32 - 60) -> y = 50
    expect(objectCardTool.onSubSelect!(card, { x: 50, y: 50 })).toBe(0);

    // Field 1 starts at y=60, height 28 (range 60 - 88) -> y = 70
    expect(objectCardTool.onSubSelect!(card, { x: 50, y: 70 })).toBe(1);

    // Below card fields -> null
    expect(objectCardTool.onSubSelect!(card, { x: 50, y: 92 })).toBeNull();
  });

  it("returns inline edit target for header (Object Name)", () => {
    useCanvasStore.getState().addElement(card);

    const target = objectCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Address");
    expect(target?.multiline).toBe(false);

    target?.onCommit("CustomerAddress");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.name).toBe("customerAddress");
  });

  it("returns inline edit target for Field Name", () => {
    useCanvasStore.getState().addElement(card);

    const target = objectCardTool.getInlineEditTarget!(card, { x: 30, y: 50 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Street");

    target?.onCommit("streetLine1");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields[0].name).toBe("streetLine1");
    expect(updated?.data.fields[0].type).toBe("string");
  });

  it("updates a field type to another object name", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedField({
      elementId: "obj-1",
      fieldIndex: 1,
    });

    const item = objectCardTool.getSelectedFieldItem!(card, {
      elementId: "obj-1",
      fieldIndex: 1,
    });
    expect(item).toEqual({ name: "zip", type: "string" });

    useCanvasStore.getState().updateSelectedFieldType("Address");
    const updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields[1].type).toBe("address");
  });

  it("deletes a field", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedField({
      elementId: "obj-1",
      fieldIndex: 0,
    });

    useCanvasStore.getState().deleteSelectedField();

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields).toEqual([{ name: "zip", type: "string" }]);
  });

  it("toggles a field as an array", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedField({
      elementId: "obj-1",
      fieldIndex: 0,
    });

    useCanvasStore.getState().toggleSelectedFieldArray();
    let updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields[0].isArray).toBe(true);

    useCanvasStore.getState().toggleSelectedFieldArray();
    updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields[0].isArray).toBe(false);
  });

  it("toggles a field as required", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedField({
      elementId: "obj-1",
      fieldIndex: 1,
    });

    useCanvasStore.getState().toggleSelectedFieldRequired();
    let updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields[1].isRequired).toBe(true);

    useCanvasStore.getState().toggleSelectedFieldRequired();
    updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields[1].isRequired).toBe(false);
  });

  it("exposes an AI creation operation", () => {
    expect(objectCardTool.ai?.toolName).toBe("create_object_card");
    const element = objectCardTool.ai!.onCreate(
      { name: "Money", fields: [{ name: "amount", type: "number" }] },
      { x: 0, y: 0 },
    );
    expect(element.type).toBe("objectCard");
    expect((element.data as ObjectCardData).fields).toHaveLength(1);
  });

  it("keeps the object and per-field descriptions from AI params", () => {
    const element = objectCardTool.ai!.onCreate(
      {
        name: "Money",
        description: "An amount of money in a given currency",
        fields: [
          {
            name: "amount",
            type: "number",
            description: "The numeric value, in minor units",
          },
        ],
      },
      { x: 0, y: 0 },
    );
    const data = element.data as ObjectCardData;
    expect(data.description).toBe("An amount of money in a given currency");
    expect(data.fields[0].description).toBe("The numeric value, in minor units");
  });

  it("sets and clears a field's validation constraints", () => {
    const setPatch = objectCardTool.onUpdateSubSelectValidation!(
      card,
      { elementId: "obj-1", fieldIndex: 0 },
      { minLength: 3, maxLength: 32 },
    );
    expect(setPatch?.data?.fields?.[0].validation).toEqual({ minLength: 3, maxLength: 32 });
    // Other rows untouched
    expect(setPatch?.data?.fields?.[1].validation).toBeUndefined();

    const withValidation = {
      ...card,
      data: { ...card.data, fields: setPatch!.data!.fields! },
    };

    const clearPatch = objectCardTool.onUpdateSubSelectValidation!(
      withValidation as CanvasElement<ObjectCardData>,
      { elementId: "obj-1", fieldIndex: 0 },
      null,
    );
    expect(clearPatch?.data?.fields?.[0].validation).toBeUndefined();
  });

  it("applies validation through the store with undo/redo", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedIds(["obj-1"]);
    useCanvasStore.getState().setSelectedField({ elementId: "obj-1", fieldIndex: 1 });

    useCanvasStore.getState().updateSelectedFieldValidation({ maxLength: 10 });

    let updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields[1].validation).toEqual({ maxLength: 10 });

    // Clearing drops the key entirely.
    useCanvasStore.getState().updateSelectedFieldValidation(null);
    updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields[1].validation).toBeUndefined();

    useCanvasStore.getState().undo();
    updated = useCanvasStore.getState().elements.find((e) => e.id === "obj-1");
    expect(updated?.data.fields[1].validation).toEqual({ maxLength: 10 });
  });
});
