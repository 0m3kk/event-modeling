import { describe, it, expect } from "vitest";
import {
  getSubSelectSections,
  navigateSubSelect,
  getAdjacentSubSelectAfterDeletion,
} from "./subSelection";
import type { CanvasElement, SelectedField } from "@/types";
import type { ToolDefinition } from "@/tools/types";

describe("subSelection navigation utility", () => {
  const singleSectionCard: CanvasElement = {
    id: "card-1",
    type: "eventCard",
    x: 0,
    y: 0,
    width: 220,
    height: 100,
    data: {
      name: "OrderPlaced",
      fields: [
        { name: "id", type: "string" },
        { name: "amount", type: "float" },
        { name: "timestamp", type: "string" },
      ],
    },
  };

  it("extracts single section from data.fields", () => {
    const sections = getSubSelectSections(singleSectionCard);
    expect(sections).toEqual([{ id: "fields", name: "fields", count: 3 }]);
  });

  it("navigates down and up in a single section card and clamps", () => {
    // Start at field 0
    let current: SelectedField = { elementId: "card-1", fieldIndex: 0 };

    // Move down to 1
    current = navigateSubSelect(singleSectionCard, current, "down")!;
    expect(current).toEqual({
      elementId: "card-1",
      sectionIndex: 0,
      sectionId: "fields",
      fieldIndex: 1,
    });

    // Move down to 2
    current = navigateSubSelect(singleSectionCard, current, "down")!;
    expect(current).toEqual({
      elementId: "card-1",
      sectionIndex: 0,
      sectionId: "fields",
      fieldIndex: 2,
    });

    // Move down at boundary -> clamps at 2
    current = navigateSubSelect(singleSectionCard, current, "down")!;
    expect(current.fieldIndex).toBe(2);

    // Move up to 1
    current = navigateSubSelect(singleSectionCard, current, "up")!;
    expect(current.fieldIndex).toBe(1);

    // Move up to 0
    current = navigateSubSelect(singleSectionCard, current, "up")!;
    expect(current.fieldIndex).toBe(0);

    // Move up at boundary -> clamps at 0
    current = navigateSubSelect(singleSectionCard, current, "up")!;
    expect(current.fieldIndex).toBe(0);
  });

  const multiSectionCard: CanvasElement = {
    id: "card-multi",
    type: "readModelCard",
    x: 0,
    y: 0,
    width: 240,
    height: 180,
    data: {
      sections: [
        { id: "sec-params", name: "Parameters", fields: [{ name: "filter" }, { name: "limit" }] },
        { id: "sec-outputs", name: "Projections", fields: [{ name: "total" }, { name: "items" }, { name: "status" }] },
      ],
    },
  };

  it("extracts multiple sections from data.sections", () => {
    const sections = getSubSelectSections(multiSectionCard);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({ id: "sec-params", name: "Parameters", count: 2 });
    expect(sections[1]).toEqual({ id: "sec-outputs", name: "Projections", count: 3 });
  });

  it("navigates seamlessly across multiple sections", () => {
    // Start at Section 0, Field 0
    let current: SelectedField = { elementId: "card-multi", sectionIndex: 0, fieldIndex: 0 };

    // Move down -> Sec 0, Field 1
    current = navigateSubSelect(multiSectionCard, current, "down")!;
    expect(current).toEqual({
      elementId: "card-multi",
      sectionIndex: 0,
      sectionId: "sec-params",
      fieldIndex: 1,
    });

    // Move down across boundary -> Sec 1, Field 0!
    current = navigateSubSelect(multiSectionCard, current, "down")!;
    expect(current).toEqual({
      elementId: "card-multi",
      sectionIndex: 1,
      sectionId: "sec-outputs",
      fieldIndex: 0,
    });

    // Move down -> Sec 1, Field 1
    current = navigateSubSelect(multiSectionCard, current, "down")!;
    expect(current.sectionIndex).toBe(1);
    expect(current.fieldIndex).toBe(1);

    // Move down -> Sec 1, Field 2
    current = navigateSubSelect(multiSectionCard, current, "down")!;
    expect(current.fieldIndex).toBe(2);

    // Move down at bottom boundary -> clamps at Sec 1, Field 2
    current = navigateSubSelect(multiSectionCard, current, "down")!;
    expect(current.sectionIndex).toBe(1);
    expect(current.fieldIndex).toBe(2);

    // Move up -> Sec 1, Field 1
    current = navigateSubSelect(multiSectionCard, current, "up")!;
    expect(current.fieldIndex).toBe(1);

    // Move up -> Sec 1, Field 0
    current = navigateSubSelect(multiSectionCard, current, "up")!;
    expect(current.fieldIndex).toBe(0);

    // Move up across boundary back into previous section -> Sec 0, Field 1!
    current = navigateSubSelect(multiSectionCard, current, "up")!;
    expect(current).toEqual({
      elementId: "card-multi",
      sectionIndex: 0,
      sectionId: "sec-params",
      fieldIndex: 1,
    });

    // Move up -> Sec 0, Field 0
    current = navigateSubSelect(multiSectionCard, current, "up")!;
    expect(current.fieldIndex).toBe(0);

    // Move up at top boundary -> clamps at Sec 0, Field 0
    current = navigateSubSelect(multiSectionCard, current, "up")!;
    expect(current.sectionIndex).toBe(0);
    expect(current.fieldIndex).toBe(0);
  });

  it("skips empty sections in between", () => {
    const cardWithEmptySec: CanvasElement = {
      id: "card-empty",
      type: "custom",
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      data: {
        sections: [
          { id: "s1", name: "Section 1", fields: [{ name: "a" }] },
          { id: "s2", name: "Empty Section", fields: [] },
          { id: "s3", name: "Section 3", fields: [{ name: "b" }] },
        ],
      },
    };

    let current: SelectedField = { elementId: "card-empty", sectionIndex: 0, fieldIndex: 0 };

    // Move down -> should skip Section 1 (empty) and jump directly to Section 2 (index 2), Field 0
    current = navigateSubSelect(cardWithEmptySec, current, "down")!;
    expect(current).toEqual({
      elementId: "card-empty",
      sectionIndex: 2,
      sectionId: "s3",
      fieldIndex: 0,
    });

    // Move up -> should skip Section 1 (empty) and jump back to Section 0 (index 0), Field 0
    current = navigateSubSelect(cardWithEmptySec, current, "up")!;
    expect(current).toEqual({
      elementId: "card-empty",
      sectionIndex: 0,
      sectionId: "s1",
      fieldIndex: 0,
    });
  });

  it("returns null when element ID does not match or element has no fields", () => {
    const emptyCard: CanvasElement = {
      id: "card-empty",
      type: "empty",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      data: {},
    };

    expect(
      navigateSubSelect(singleSectionCard, { elementId: "different-id", fieldIndex: 0 }, "down"),
    ).toBeNull();

    expect(
      navigateSubSelect(emptyCard, { elementId: "card-empty", fieldIndex: 0 }, "down"),
    ).toBeNull();
  });

  it("respects custom tool.onNavigateSubSelect hook if provided", () => {
    const customTool: ToolDefinition = {
      type: "custom",
      name: "Custom",
      icon: () => null,
      color: "#000",
      schema: {} as any,
      createDefaultData: () => ({}),
      defaultSize: { width: 100, height: 100 },
      render: () => {},
      onNavigateSubSelect: (_el, cur, dir) => {
        return {
          elementId: cur.elementId,
          sectionIndex: 99,
          fieldIndex: dir === "down" ? 42 : 10,
        };
      },
    };

    const res = navigateSubSelect(
      singleSectionCard,
      { elementId: "card-1", fieldIndex: 0 },
      "down",
      customTool,
    );
    expect(res).toEqual({
      elementId: "card-1",
      sectionIndex: 99,
      fieldIndex: 42,
    });
  });

  describe("getAdjacentSubSelectAfterDeletion", () => {
    it("selects next field when deleting first or middle item in single-section card", () => {
      // Element originally had 3 fields, field 0 was deleted, 2 fields remain
      const updatedCard: CanvasElement = {
        id: "card-1",
        type: "eventCard",
        x: 0,
        y: 0,
        width: 220,
        height: 88,
        data: {
          fields: [{ name: "amount" }, { name: "timestamp" }],
        },
      };

      // Deleted was index 0 -> adjacent is new index 0 (which is "amount")
      const next = getAdjacentSubSelectAfterDeletion(updatedCard, {
        elementId: "card-1",
        fieldIndex: 0,
      });
      expect(next).toEqual({
        elementId: "card-1",
        sectionIndex: 0,
        sectionId: "fields",
        fieldIndex: 0,
      });
    });

    it("selects previous field when deleting last item in single-section card", () => {
      // Element originally had 2 fields, last field (index 1) was deleted, 1 field remains (index 0)
      const updatedCard: CanvasElement = {
        id: "card-1",
        type: "eventCard",
        x: 0,
        y: 0,
        width: 220,
        height: 60,
        data: {
          fields: [{ name: "id" }],
        },
      };

      const next = getAdjacentSubSelectAfterDeletion(updatedCard, {
        elementId: "card-1",
        fieldIndex: 1, // index 1 was deleted
      });
      expect(next).toEqual({
        elementId: "card-1",
        sectionIndex: 0,
        sectionId: "fields",
        fieldIndex: 0,
      });
    });

    it("returns null when all fields in card have been deleted", () => {
      const emptyCard: CanvasElement = {
        id: "card-1",
        type: "eventCard",
        x: 0,
        y: 0,
        width: 220,
        height: 60,
        data: {
          fields: [],
        },
      };

      const next = getAdjacentSubSelectAfterDeletion(emptyCard, {
        elementId: "card-1",
        fieldIndex: 0,
      });
      expect(next).toBeNull();
    });

    it("moves to next non-empty section when current section becomes empty", () => {
      const multiCard: CanvasElement = {
        id: "card-multi",
        type: "custom",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        data: {
          sections: [
            { id: "sec-0", name: "Empty Now", fields: [] },
            { id: "sec-1", name: "Has Fields", fields: [{ name: "f1" }, { name: "f2" }] },
          ],
        },
      };

      const next = getAdjacentSubSelectAfterDeletion(multiCard, {
        elementId: "card-multi",
        sectionIndex: 0,
        fieldIndex: 0,
      });
      expect(next).toEqual({
        elementId: "card-multi",
        sectionIndex: 1,
        sectionId: "sec-1",
        fieldIndex: 0,
      });
    });

    it("moves to previous non-empty section when last section becomes empty", () => {
      const multiCard: CanvasElement = {
        id: "card-multi",
        type: "custom",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        data: {
          sections: [
            { id: "sec-0", name: "Has Fields", fields: [{ name: "f0" }] },
            { id: "sec-1", name: "Now Empty", fields: [] },
          ],
        },
      };

      const next = getAdjacentSubSelectAfterDeletion(multiCard, {
        elementId: "card-multi",
        sectionIndex: 1,
        fieldIndex: 0,
      });
      expect(next).toEqual({
        elementId: "card-multi",
        sectionIndex: 0,
        sectionId: "sec-0",
        fieldIndex: 0,
      });
    });
  });
});
