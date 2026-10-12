import { describe, it, expect } from "vitest";
import {
  nameKey,
  toDisplayName,
  toDisplayType,
  toDisplayAction,
  toPascalIdentifier,
  toCanonicalAction,
  toCamelIdentifier,
  normalizeIdentifierNames,
  isSameIdentifier,
  isSameAction,
  makeUniqueName,
  getElementName,
  setElementName,
  ensureUniqueElement,
  resolveUniqueDataOnUpdate,
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

  describe("toDisplayName", () => {
    it("title-cases camelCase and PascalCase words", () => {
      expect(toDisplayName("firstName")).toBe("First Name");
      expect(toDisplayName("OrderPlaced")).toBe("Order Placed");
      expect(toDisplayName("createdAt")).toBe("Created At");
    });

    it("keeps known initialisms uppercase", () => {
      expect(toDisplayName("userId")).toBe("User ID");
      expect(toDisplayName("apiUrl")).toBe("API URL");
      expect(toDisplayName("HTMLParser")).toBe("HTML Parser");
      expect(toDisplayName("APIKey")).toBe("API Key");
    });

    it("handles snake_case and kebab-case", () => {
      expect(toDisplayName("order_placed")).toBe("Order Placed");
      expect(toDisplayName("order-placed")).toBe("Order Placed");
      expect(toDisplayName("customer_id")).toBe("Customer ID");
    });

    it("keeps digits attached to their word", () => {
      expect(toDisplayName("addressLine1")).toBe("Address Line1");
      expect(toDisplayName("field2Name")).toBe("Field2 Name");
    });

    it("is idempotent for already-human labels", () => {
      expect(toDisplayName("First Name")).toBe("First Name");
      expect(toDisplayName("User ID")).toBe("User ID");
    });

    it("does not uppercase whole English words that merely contain an initialism fragment", () => {
      expect(toDisplayName("contactUs")).toBe("Contact Us");
    });

    it("handles empty input", () => {
      expect(toDisplayName("")).toBe("");
      expect(toDisplayName("   ")).toBe("");
      expect(toDisplayName(undefined)).toBe("");
      expect(toDisplayName(null)).toBe("");
    });
  });

  describe("toDisplayType", () => {
    it("humanizes type names and re-appends the array marker", () => {
      expect(toDisplayType("string")).toBe("String");
      expect(toDisplayType("CustomerId")).toBe("Customer ID");
      expect(toDisplayType("CustomerId", true)).toBe("Customer ID[]");
      expect(toDisplayType("string", true)).toBe("String[]");
    });

    it("returns an empty string for missing types", () => {
      expect(toDisplayType(undefined)).toBe("");
      expect(toDisplayType("")).toBe("");
      expect(toDisplayType("   ")).toBe("");
    });

    it("falls back to an unknown label when requested", () => {
      expect(toDisplayType("unknown")).toBe("Unknown");
    });
  });

  describe("toCamelIdentifier", () => {
    it("canonicalizes every input spelling to camelCase", () => {
      expect(toCamelIdentifier("First Name")).toBe("firstName");
      expect(toCamelIdentifier("first name")).toBe("firstName");
      expect(toCamelIdentifier("first_name")).toBe("firstName");
      expect(toCamelIdentifier("FirstName")).toBe("firstName");
      expect(toCamelIdentifier("first-name")).toBe("firstName");
    });

    it("keeps initialisms as a lowercased head / camel tail", () => {
      expect(toCamelIdentifier("User ID")).toBe("userId");
      expect(toCamelIdentifier("userId")).toBe("userId");
      expect(toCamelIdentifier("UUID")).toBe("uuid");
      expect(toCamelIdentifier("APIKey")).toBe("apiKey");
      expect(toCamelIdentifier("HTMLParser")).toBe("htmlParser");
    });

    it("is idempotent", () => {
      expect(toCamelIdentifier("userEmail")).toBe("userEmail");
      expect(toCamelIdentifier(toCamelIdentifier("First Name"))).toBe("firstName");
    });

    it("handles empty input", () => {
      expect(toCamelIdentifier("")).toBe("");
      expect(toCamelIdentifier("   ")).toBe("");
      expect(toCamelIdentifier(undefined)).toBe("");
    });
  });

  describe("toDisplayAction", () => {
    it("PascalCases each segment while preserving ':' and '*'", () => {
      expect(toDisplayAction("sales:placeOrder")).toBe("Sales:PlaceOrder");
      expect(toDisplayAction("sales:*")).toBe("Sales:*");
      expect(toDisplayAction("*:getOrder")).toBe("*:GetOrder");
      expect(toDisplayAction("inventory:restockItem")).toBe("Inventory:RestockItem");
    });

    it("is idempotent and handles empty input", () => {
      expect(toDisplayAction("Sales:PlaceOrder")).toBe("Sales:PlaceOrder");
      expect(toDisplayAction("Sales:Place Order")).toBe("Sales:PlaceOrder");
      expect(toDisplayAction("")).toBe("");
      expect(toDisplayAction(undefined)).toBe("");
    });
  });

  describe("toPascalIdentifier", () => {
    it("joins identifier words without separators", () => {
      expect(toPascalIdentifier("placeOrder")).toBe("PlaceOrder");
      expect(toPascalIdentifier("Place Order")).toBe("PlaceOrder");
      expect(toPascalIdentifier("place_order")).toBe("PlaceOrder");
      expect(toPascalIdentifier("userId")).toBe("UserId");
    });

    it("is idempotent and handles empty input", () => {
      expect(toPascalIdentifier("PlaceOrder")).toBe("PlaceOrder");
      expect(toPascalIdentifier("")).toBe("");
      expect(toPascalIdentifier(undefined)).toBe("");
    });
  });

  describe("toCanonicalAction", () => {
    it("camelCases each segment while preserving ':' and '*'", () => {
      expect(toCanonicalAction("Sales:Place Order")).toBe("sales:placeOrder");
      expect(toCanonicalAction("Sales:PlaceOrder")).toBe("sales:placeOrder");
      expect(toCanonicalAction("Sales:*")).toBe("sales:*");
      expect(toCanonicalAction("*:Get Order")).toBe("*:getOrder");
    });

    it("is idempotent and handles empty input", () => {
      expect(toCanonicalAction("sales:placeOrder")).toBe("sales:placeOrder");
      expect(toCanonicalAction("")).toBe("");
      expect(toCanonicalAction(undefined)).toBe("");
    });
  });

  describe("isSameAction", () => {
    it("treats the human-readable form of the stored token as unchanged", () => {
      expect(isSameAction("Sales:Place Order", "sales:placeOrder")).toBe(true);
      expect(isSameAction("sales:placeOrder", "sales:placeOrder")).toBe(true);
      expect(isSameAction("  sales:placeOrder  ", "sales:placeOrder")).toBe(true);
      expect(isSameAction("Sales:*", "sales:*")).toBe(true);
    });

    it("detects a genuine change", () => {
      expect(isSameAction("Sales:Cancel Order", "sales:placeOrder")).toBe(false);
    });
  });

  describe("normalizeIdentifierNames", () => {
    it("canonicalizes Command/Query action tokens and Actor permissions", () => {
      expect(normalizeIdentifierNames({ name: "Place Order", action: "Sales:Place Order" }, "commandCard")).toEqual({
        name: "placeOrder",
        action: "sales:placeOrder",
      });

      const actor = normalizeIdentifierNames(
        { name: "Customer", permissions: [{ action: "Sales:*" }, { action: "*:Get Order" }] },
        "actorCard",
      ) as any;
      expect(actor.permissions).toEqual([{ action: "sales:*" }, { action: "*:getOrder" }]);
    });

    it("leaves `action` free text on unrelated card types alone", () => {
      const input = { name: "foo", action: "Some Free Text" };
      expect(normalizeIdentifierNames(input, "groupCard")).toBe(input);
    });

    it("camelCases card names, field names and types", () => {
      const input = {
        name: "Order Placed",
        fields: [
          { name: "Order ID", type: "UUID" },
          { name: "first name", type: "string" },
        ],
        description: "Something happened",
      };
      expect(normalizeIdentifierNames(input, "eventCard")).toEqual({
        name: "orderPlaced",
        fields: [
          { name: "orderId", type: "uuid" },
          { name: "firstName", type: "string" },
        ],
        description: "Something happened",
      });
    });

    it("camelCases query tag refs, DCB tags and event type lists", () => {
      const input = {
        name: "Order state",
        params: [{ name: "Order ID", type: "uuid" }],
        items: [
          {
            types: ["Order Placed", "Order Cancelled"],
            tags: [{ tag: "Order Tag", field: "Order ID" }],
          },
        ],
      };
      const out = normalizeIdentifierNames(input, "stateCard") as any;
      expect(out.name).toBe("orderState");
      expect(out.items[0].types).toEqual(["orderPlaced", "orderCancelled"]);
      expect(out.items[0].tags[0].field).toBe("orderId");
      expect(out.items[0].tags[0].tag).toBe("orderTag");
    });

    it("camelCases event field DCB tags", () => {
      const input = {
        name: "Order Placed",
        fields: [{ name: "Order ID", type: "string", tag: "Order Tag" }],
      };
      const out = normalizeIdentifierNames(input, "eventCard") as any;
      expect(out.fields[0].tag).toBe("orderTag");
    });

    it("keeps enum member values untouched", () => {
      const input = { name: "Order Status", fields: [{ name: "Active" }, { name: "USD" }] };
      const out = normalizeIdentifierNames(input, "enumCard") as any;
      expect(out.name).toBe("orderStatus");
      expect(out.fields).toEqual([{ name: "Active" }, { name: "USD" }]);
    });

    it("returns the same reference when nothing changes", () => {
      const input = { name: "orderPlaced", fields: [{ name: "orderId", type: "uuid" }] };
      expect(normalizeIdentifierNames(input, "eventCard")).toBe(input);
    });

    it("leaves free text and colors alone", () => {
      const input = {
        name: "Payment",
        color: "#c026d3",
        rules: ["Account Status must be Active"],
        description: "free text",
      };
      const out = normalizeIdentifierNames(input, "constraintCard") as any;
      expect(out.name).toBe("payment");
      expect(out.color).toBe("#c026d3");
      expect(out.rules).toEqual(["Account Status must be Active"]);
      expect(out.description).toBe("free text");
    });
  });

  describe("isSameIdentifier", () => {
    it("treats the human-readable form of the stored value as unchanged", () => {
      // Editor shows "Order ID" while the data holds "orderId".
      expect(isSameIdentifier("Order ID", "orderId")).toBe(true);
      expect(isSameIdentifier("orderId", "orderId")).toBe(true);
      expect(isSameIdentifier("  orderId  ", "orderId")).toBe(true);
    });

    it("detects a genuine change", () => {
      expect(isSameIdentifier("Customer Id", "orderId")).toBe(false);
    });

    it("keeps enum-like values that are not camelCased", () => {
      expect(isSameIdentifier("Active", "Active")).toBe(true);
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

  describe("resolveUniqueDataOnUpdate", () => {
    it("returns patchData unmodified if name did not change or collide", () => {
      const target: CanvasElement = {
        id: "1",
        type: "eventCard",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        data: { name: "OrderCreated" },
      };
      const elements = [target];

      const patchData = { name: "OrderModified" };
      const resolved = resolveUniqueDataOnUpdate(target, patchData, elements);
      expect(resolved.name).toBe("OrderModified");
    });

    it("renames when updated name collides with another element of the same type", () => {
      const el1: CanvasElement = {
        id: "1",
        type: "eventCard",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        data: { name: "OrderCreated" },
      };
      const el2: CanvasElement = {
        id: "2",
        type: "eventCard",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        data: { name: "OrderPlaced" },
      };
      const elements = [el1, el2];

      const patchData = { name: "OrderPlaced" };
      const resolved = resolveUniqueDataOnUpdate(el1, patchData, elements);
      expect(resolved.name).toBe("OrderPlaced 2");
    });

    it("ignores reference siblings when checking for collisions", () => {
      const el1: CanvasElement = {
        id: "1",
        type: "eventCard",
        referenceId: "ref-1",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        data: { name: "OrderPlaced" },
      };
      const el2: CanvasElement = {
        id: "2",
        type: "eventCard",
        referenceId: "ref-1",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        data: { name: "OrderPlaced" },
      };
      const elements = [el1, el2];

      const patchData = { name: "OrderPlaced" };
      const resolved = resolveUniqueDataOnUpdate(el1, patchData, elements);
      expect(resolved.name).toBe("OrderPlaced");
    });
  });
});

