import { describe, it, expect } from "vitest";
import {
  nameKey,
  makeUniqueName,
  getElementName,
  setElementName,
  ensureUniqueElement,
} from "./naming";
import type { CanvasElement } from "@/types";

describe("Naming utility", () => {
  describe("nameKey", () => {
    it("normalizes names across spaces, cases, and separators", () => {
      expect(nameKey("OrderPlaced")).toBe("order placed");
      expect(nameKey("orderPlaced")).toBe("order placed");
      expect(nameKey("Order Placed")).toBe("order placed");
      expect(nameKey("ORDER_PLACED")).toBe("order placed");
      expect(nameKey("order-placed")).toBe("order placed");
      expect(nameKey("OrderPlaced 2")).toBe("order placed 2");
      expect(nameKey("")).toBe("");
      expect(nameKey(undefined)).toBe("");
    });
  });

  describe("makeUniqueName", () => {
    it("returns base if no collisions", () => {
      expect(makeUniqueName("Order", [])).toBe("Order");
      expect(makeUniqueName("Order", ["Customer"])).toBe("Order");
    });

    it("appends 2 for first collision", () => {
      expect(makeUniqueName("Order", ["Order"])).toBe("Order 2");
      expect(makeUniqueName("order", ["Order"])).toBe("order 2");
      expect(makeUniqueName("OrderPlaced", ["orderPlaced"])).toBe("OrderPlaced 2");
    });

    it("increments to next available number", () => {
      expect(makeUniqueName("Order", ["Order", "Order 2"])).toBe("Order 3");
      expect(makeUniqueName("Order 2", ["Order", "Order 2"])).toBe("Order 3");
      expect(makeUniqueName("Order 1", ["Order 1"])).toBe("Order 2");
      expect(makeUniqueName("Order", ["Order", "Order 2", "Order 3"])).toBe("Order 4");
    });

    it("fills lowest available number if gap exists", () => {
      // If Order and Order 3 exist, next for Order is Order 2
      expect(makeUniqueName("Order", ["Order", "Order 3"])).toBe("Order 2");
    });

    it("preserves empty string without change", () => {
      expect(makeUniqueName("", ["Order"])).toBe("");
      expect(makeUniqueName("   ", ["Order"])).toBe("   ");
    });
  });

  describe("getElementName & setElementName", () => {
    it("reads and writes name properly", () => {
      const el: CanvasElement = {
        id: "1",
        type: "eventCard",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        data: { name: "OrderCreated" },
      };

      expect(getElementName(el)).toBe("OrderCreated");
      const updated = setElementName(el, "OrderModified");
      expect(updated.data.name).toBe("OrderModified");
    });

    it("reads and writes text properly for notes", () => {
      const note: CanvasElement = {
        id: "2",
        type: "stickyNote",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        data: { text: "Note Content" },
      };

      expect(getElementName(note)).toBe("Note Content");
      const updated = setElementName(note, "Note 2");
      expect(updated.data.text).toBe("Note 2");
    });
  });

  describe("ensureUniqueElement", () => {
    it("suffixes colliding names for elements of the SAME type", () => {
      const existing: CanvasElement[] = [
        {
          id: "1",
          type: "eventCard",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          data: { name: "NewEvent" },
        },
      ];

      const newEl: CanvasElement = {
        id: "2",
        type: "eventCard",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        data: { name: "NewEvent" },
      };

      const result = ensureUniqueElement(newEl, existing);
      expect(result.data.name).toBe("NewEvent 2");
    });

    it("does not rename if existing element has DIFFERENT type", () => {
      const existing: CanvasElement[] = [
        {
          id: "1",
          type: "commandCard",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          data: { name: "Order" },
        },
      ];

      const newEl: CanvasElement = {
        id: "2",
        type: "eventCard",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        data: { name: "Order" },
      };

      const result = ensureUniqueElement(newEl, existing);
      expect(result.data.name).toBe("Order");
    });

    it("does not rename a reference copy sharing referenceId", () => {
      const existing: CanvasElement[] = [
        {
          id: "1",
          type: "eventCard",
          referenceId: "ref-abc",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          data: { name: "OrderPlaced" },
        },
      ];

      const copy: CanvasElement = {
        id: "2",
        type: "eventCard",
        referenceId: "ref-abc",
        x: 30,
        y: 30,
        width: 100,
        height: 100,
        data: { name: "OrderPlaced" },
      };

      const result = ensureUniqueElement(copy, existing);
      expect(result.data.name).toBe("OrderPlaced");
    });
  });
});
