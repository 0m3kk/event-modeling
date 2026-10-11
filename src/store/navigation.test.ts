import "@/tools";
import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore } from "./index";
import { eventCardTool, type EventCardData } from "@/tools/eventCard";
import type { CanvasElement } from "@/types";

describe("navigateSelectedField in canvas store", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const card: CanvasElement<EventCardData> = {
    id: "card-nav",
    type: "eventCard",
    x: 100,
    y: 100,
    width: 220,
    height: 116,
    data: {
      name: "InvoiceGenerated",
      fields: [
        { name: "id", type: "string" },
        { name: "orderId", type: "string" },
        { name: "total", type: "number" },
      ],
    },
  };

  it("navigates down and up across fields and clamps at boundaries", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedIds(["card-nav"]);

    // Initial sub-select at field 0
    useCanvasStore.getState().setSelectedField({
      elementId: "card-nav",
      fieldIndex: 0,
    });

    // Navigate down -> field 1
    useCanvasStore.getState().navigateSelectedField("down");
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(1);

    // Navigate down -> field 2
    useCanvasStore.getState().navigateSelectedField("down");
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(2);

    // Navigate down again at bottom -> clamped at field 2
    useCanvasStore.getState().navigateSelectedField("down");
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(2);

    // Navigate up -> field 1
    useCanvasStore.getState().navigateSelectedField("up");
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(1);

    // Navigate up -> field 0
    useCanvasStore.getState().navigateSelectedField("up");
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(0);

    // Navigate up again at top -> clamped at field 0
    useCanvasStore.getState().navigateSelectedField("up");
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(0);
  });

  it("does nothing if no field is selected or element is unselected", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedIds(["card-nav"]);
    useCanvasStore.getState().setSelectedField(null);

    // Calling navigate with no selected field has no effect
    useCanvasStore.getState().navigateSelectedField("down");
    expect(useCanvasStore.getState().selectedField).toBeNull();

    // Field is set but element is not selected in selectedIds
    useCanvasStore.getState().setSelectedIds([]);
    useCanvasStore.getState().setSelectedField({
      elementId: "card-nav",
      fieldIndex: 0,
    });
    useCanvasStore.getState().navigateSelectedField("down");
    // Remains untouched
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(0);
  });

  it("supports multi-section navigation across section boundaries", () => {
    const multiCard: CanvasElement = {
      id: "card-sections",
      type: "customSectionCard",
      x: 0,
      y: 0,
      width: 250,
      height: 200,
      data: {
        sections: [
          { id: "sec-inputs", name: "Inputs", fields: [{ name: "in1" }, { name: "in2" }] },
          { id: "sec-outputs", name: "Outputs", fields: [{ name: "out1" }, { name: "out2" }] },
        ],
      },
    };

    useCanvasStore.getState().addElement(multiCard);
    useCanvasStore.getState().setSelectedIds(["card-sections"]);
    useCanvasStore.getState().setSelectedField({
      elementId: "card-sections",
      sectionIndex: 0,
      fieldIndex: 1, // last field of Section 0
    });

    // Navigate down -> crosses section boundary into Section 1, field 0!
    useCanvasStore.getState().navigateSelectedField("down");
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "card-sections",
      sectionIndex: 1,
      sectionId: "sec-outputs",
      fieldIndex: 0,
    });

    // Navigate up -> crosses back into Section 0, field 1!
    useCanvasStore.getState().navigateSelectedField("up");
    expect(useCanvasStore.getState().selectedField).toEqual({
      elementId: "card-sections",
      sectionIndex: 0,
      sectionId: "sec-inputs",
      fieldIndex: 1,
    });
  });
});
