import { describe, it, expect } from "vitest";
import {
  getFieldSections,
  findDescriptionText,
  findRowName,
  applyDescription,
} from "./description";
import type { CanvasElement, SelectedField } from "@/types";

function event(description?: string): CanvasElement {
  return {
    id: "evt-1",
    type: "eventCard",
    x: 0,
    y: 0,
    width: 220,
    height: 88,
    data: {
      name: "OrderPlaced",
      ...(description ? { description } : {}),
      fields: [
        { name: "orderId", type: "string", description: "The order identifier" },
        { name: "amount", type: "number" },
      ],
    },
  };
}

function command(): CanvasElement {
  return {
    id: "cmd-1",
    type: "commandCard",
    x: 0,
    y: 0,
    width: 220,
    height: 132,
    data: {
      name: "PlaceOrder",
      inputs: [{ name: "orderId", type: "string", description: "Input id" }],
      responses: [{ name: "ok", type: "boolean" }],
    },
  };
}

function query(): CanvasElement {
  return {
    id: "qry-1",
    type: "queryCard",
    x: 0,
    y: 0,
    width: 220,
    height: 132,
    data: {
      name: "GetOrder",
      params: [{ name: "orderId", type: "string", description: "Param id" }],
      responses: [{ name: "ok", type: "boolean" }],
    },
  };
}

describe("description utility", () => {
  describe("getFieldSections", () => {
    it("returns a single fields band for standard cards", () => {
      expect(getFieldSections(event()).map((s) => s.key)).toEqual(["fields"]);
    });

    it("returns inputs then responses for command cards", () => {
      expect(getFieldSections(command()).map((s) => s.key)).toEqual(["inputs", "responses"]);
    });

    it("returns params then responses for query cards", () => {
      expect(getFieldSections(query()).map((s) => s.key)).toEqual(["params", "responses"]);
    });

    it("falls back to legacy `fields` for command inputs", () => {
      const legacy: CanvasElement = {
        id: "cmd-2",
        type: "commandCard",
        x: 0,
        y: 0,
        width: 220,
        height: 132,
        data: { name: "Legacy", fields: [{ name: "a", type: "string" }] },
      };
      const sections = getFieldSections(legacy);
      expect(sections[0].key).toBe("fields");
      expect(sections[0].fields).toHaveLength(1);
    });
  });

  describe("findDescriptionText", () => {
    it("reads the card-level description", () => {
      expect(findDescriptionText(event("Something happened"))).toBe("Something happened");
    });

    it("reads a field description using section/field index", () => {
      const field: SelectedField = { elementId: "evt-1", fieldIndex: 0 };
      expect(findDescriptionText(event(), field)).toBe("The order identifier");
    });

    it("reads command input and response descriptions", () => {
      const input: SelectedField = { elementId: "cmd-1", sectionIndex: 0, fieldIndex: 0 };
      const response: SelectedField = { elementId: "cmd-1", sectionIndex: 1, fieldIndex: 0 };
      expect(findDescriptionText(command(), input)).toBe("Input id");
      expect(findDescriptionText(command(), response)).toBeUndefined();
    });

    it("reads query param and response descriptions", () => {
      const param: SelectedField = { elementId: "qry-1", sectionIndex: 0, fieldIndex: 0 };
      const response: SelectedField = { elementId: "qry-1", sectionIndex: 1, fieldIndex: 0 };
      expect(findDescriptionText(query(), param)).toBe("Param id");
      expect(findDescriptionText(query(), response)).toBeUndefined();
    });

    it("returns undefined when absent", () => {
      expect(findDescriptionText(event())).toBeUndefined();
    });
  });

  describe("findRowName", () => {
    it("returns the row name", () => {
      expect(findRowName(event(), { elementId: "evt-1", fieldIndex: 1 })).toBe("amount");
      expect(findRowName(event())).toBeUndefined();
    });
  });

  describe("applyDescription", () => {
    it("adds and removes the card description", () => {
      const patch = applyDescription(event(), null, "Hello");
      expect((patch?.data as any).description).toBe("Hello");

      const removed = applyDescription(event("Hello"), null, "");
      expect((removed?.data as any).description).toBeUndefined();
      expect("description" in (removed?.data as any)).toBe(false);
    });

    it("adds a field description", () => {
      const field: SelectedField = { elementId: "evt-1", fieldIndex: 1 };
      const patch = applyDescription(event(), field, "Money");
      const fields = (patch?.data as any).fields;
      expect(fields[1].description).toBe("Money");
      // untouched rows keep identity/values
      expect(fields[0].name).toBe("orderId");
    });

    it("writes command input descriptions under inputs", () => {
      const input: SelectedField = { elementId: "cmd-1", sectionIndex: 0, fieldIndex: 0 };
      const patch = applyDescription(command(), input, "Updated");
      const data = patch?.data as any;
      expect(data.inputs[0].description).toBe("Updated");
      expect(data.responses).toEqual(command().data.responses);
    });

    it("returns null when nothing changes", () => {
      expect(applyDescription(event(), null, undefined)).toBeNull();
      expect(applyDescription(event("Same"), null, "Same")).toBeNull();
    });
  });
});
