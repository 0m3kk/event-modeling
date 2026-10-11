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
      color: "#8b5cf6",
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
    expect(updated?.data.name).toBe("CustomerAddress");
  });

  it("returns inline edit target for Field Name", () => {
    useCanvasStore.getState().addElement(card);

    const target = objectCardTool.getInlineEditTarget!(card, { x: 30, y: 50 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("street");

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
    expect(updated?.data.fields[1].type).toBe("Address");
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

  it("exposes an AI creation operation", () => {
    expect(objectCardTool.ai?.toolName).toBe("create_object_card");
    const element = objectCardTool.ai!.onCreate(
      { name: "Money", fields: [{ name: "amount", type: "number" }] },
      { x: 0, y: 0 },
    );
    expect(element.type).toBe("objectCard");
    expect((element.data as ObjectCardData).fields).toHaveLength(1);
  });
});
