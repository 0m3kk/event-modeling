import { describe, it, expect, beforeEach } from "vitest";
import "@/tools";
import { enumCardTool, computeEnumCardSize, type EnumCardData } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { applyDescription, findDescriptionText } from "@/utils/description";

describe("enumCardTool", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const card: CanvasElement<EnumCardData> = {
    id: "enum-1",
    type: "enumCard",
    x: 100,
    y: 100,
    width: 220,
    height: 88,
    data: {
      name: "OrderStatus",
      fields: [{ name: "Draft" }, { name: "Active" }],
      color: "#65a30d",
    },
  };

  it("exposes modeling metadata", () => {
    expect(enumCardTool.type).toBe("enumCard");
    expect(enumCardTool.name).toBe("Enum");
    expect(enumCardTool.color).toBe("#65a30d");
    expect(enumCardTool.category).toBe("modeling");
    expect(enumCardTool.defaultSize).toEqual({ width: 220, height: 60 });
  });

  it("widens to fit the longest value but never narrows below the default", () => {
    const wide = computeEnumCardSize({
      name: "OrderStatus",
      fields: [{ name: "aVeryLongEnumValueNameForTesting" }],
    });
    expect(wide.width).toBeGreaterThan(220);

    const short = computeEnumCardSize({ name: "OrderStatus", fields: [{ name: "Draft" }] });
    expect(short.width).toBe(220);
    // Height still tracks the row count.
    expect(short.height).toBe(32 + 28);
  });

  it("sub-selects values correctly", () => {
    expect(enumCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();
    expect(enumCardTool.onSubSelect!(card, { x: 50, y: 50 })).toBe(0);
    expect(enumCardTool.onSubSelect!(card, { x: 50, y: 70 })).toBe(1);
    expect(enumCardTool.onSubSelect!(card, { x: 50, y: 92 })).toBeNull();
  });

  it("returns inline edit target for header (Enum Name)", () => {
    useCanvasStore.getState().addElement(card);

    const target = enumCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Order Status");

    target?.onCommit("PaymentStatus");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "enum-1");
    expect(updated?.data.name).toBe("paymentStatus");
  });

  it("returns inline edit target for a value name", () => {
    useCanvasStore.getState().addElement(card);

    const target = enumCardTool.getInlineEditTarget!(card, { x: 30, y: 50 });
    expect(target).not.toBeNull();
    // Editor shows the card's display form: verbatim, ALL CAPS.
    expect(target?.initialValue).toBe("DRAFT");

    target?.onCommit("Pending");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "enum-1");
    // Commit stores the value verbatim.
    expect(updated?.data.fields[0].name).toBe("Pending");
    // Values stay typeless.
    expect("type" in updated!.data.fields[0]).toBe(false);
  });

  it("shows values in ALL CAPS but stores them verbatim (underscores kept)", () => {
    const underscored: CanvasElement<EnumCardData> = {
      ...card,
      data: { ...card.data, fields: [{ name: "in_progress" }] },
    };
    useCanvasStore.getState().addElement(underscored);

    const target = enumCardTool.getInlineEditTarget!(underscored, { x: 30, y: 50 });
    // Display keeps underscores and uppercases them.
    expect(target?.initialValue).toBe("IN_PROGRESS");

    target?.onCommit("ON_HOLD");
    const updated = useCanvasStore.getState().elements.find((e) => e.id === "enum-1");
    // Underscores and casing are preserved as typed.
    expect(updated?.data.fields[0].name).toBe("ON_HOLD");
  });

  it("reports selected values as typeless", () => {
    const item = enumCardTool.getSelectedFieldItem!(card, {
      elementId: "enum-1",
      fieldIndex: 1,
    });
    expect(item).toEqual({ name: "Active", type: "" });
  });

  it("deletes a value", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedField({
      elementId: "enum-1",
      fieldIndex: 0,
    });

    useCanvasStore.getState().deleteSelectedField();

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "enum-1");
    expect(updated?.data.fields).toEqual([{ name: "Active" }]);
  });

  it("supports per-value descriptions via the shared pipeline", () => {
    const patch = applyDescription(card, { elementId: "enum-1", fieldIndex: 0 }, "Not yet submitted");
    expect(patch?.data?.fields?.[0].description).toBe("Not yet submitted");

    const updated: CanvasElement<EnumCardData> = {
      ...card,
      data: { ...card.data, fields: patch!.data!.fields },
    };
    expect(findDescriptionText(updated, { elementId: "enum-1", fieldIndex: 0 })).toBe(
      "Not yet submitted",
    );
  });

  it("exposes an AI creation operation", () => {
    expect(enumCardTool.ai?.toolName).toBe("create_enum_card");
    const element = enumCardTool.ai!.onCreate(
      { name: "Currency", values: [{ name: "USD" }, { name: "VND" }] },
      { x: 0, y: 0 },
    );
    expect(element.type).toBe("enumCard");
    expect((element.data as EnumCardData).fields).toHaveLength(2);
  });
});

describe("enumCardTool content width auto-grow", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("keeps the default width for short values", () => {
    expect(
      computeEnumCardSize({ name: "OrderStatus", fields: [{ name: "Draft" }] }).width,
    ).toBe(220);
  });

  it("never shrinks below a requested width", () => {
    const data: EnumCardData = { name: "OrderStatus", fields: [{ name: "Draft" }] };
    expect(computeEnumCardSize(data, 500).width).toBe(500);
  });

  it("re-fits a card when a value grows through the store", () => {
    useCanvasStore.getState().addElement({
      id: "enum-1",
      type: "enumCard",
      x: 0,
      y: 0,
      width: 220,
      height: 88,
      data: { name: "OrderStatus", fields: [{ name: "Draft" }] },
    });
    expect(useCanvasStore.getState().elements[0].width).toBe(220);

    useCanvasStore.getState().updateElement("enum-1", {
      data: { name: "OrderStatus", fields: [{ name: "aVeryLongEnumValueNameForTesting" }] },
    });
    expect(useCanvasStore.getState().elements[0].width).toBeGreaterThan(220);
  });
});
