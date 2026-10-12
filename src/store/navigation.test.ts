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
        { name: "total", type: "float" },
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

  it("auto-selects adjacent field after deletion enabling consecutive deletions and navigation", () => {
    useCanvasStore.getState().addElement(card);
    useCanvasStore.getState().setSelectedIds(["card-nav"]);

    // Select middle field (orderId at index 1 of [id, orderId, total])
    useCanvasStore.getState().setSelectedField({
      elementId: "card-nav",
      fieldIndex: 1,
    });

    // 1. Delete orderId
    useCanvasStore.getState().deleteSelectedField();

    let el = useCanvasStore.getState().elements.find((e) => e.id === "card-nav");
    expect(el?.data.fields).toHaveLength(2);
    expect(el?.data.fields.map((f: any) => f.name)).toEqual(["id", "total"]);

    // Adjacent field (now "total" at index 1) is selected
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(1);

    // 2. Navigate up to "id" (index 0)
    useCanvasStore.getState().navigateSelectedField("up");
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(0);

    // 3. Delete "id" (index 0)
    useCanvasStore.getState().deleteSelectedField();

    el = useCanvasStore.getState().elements.find((e) => e.id === "card-nav");
    expect(el?.data.fields).toHaveLength(1);
    expect(el?.data.fields[0].name).toBe("total");

    // Only remaining field ("total" at index 0) is selected
    expect(useCanvasStore.getState().selectedField?.fieldIndex).toBe(0);

    // 4. Delete the last remaining field
    useCanvasStore.getState().deleteSelectedField();

    el = useCanvasStore.getState().elements.find((e) => e.id === "card-nav");
    expect(el?.data.fields).toHaveLength(0);

    // When card has 0 fields left, selectedField cleanly becomes null
    expect(useCanvasStore.getState().selectedField).toBeNull();
  });
});
