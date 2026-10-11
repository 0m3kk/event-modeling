import { describe, it, expect } from "vitest";
import {
  collectDefinedTypeNames,
  collectEventTypeNames,
  isKnownFieldType,
  isPrimitiveFieldType,
  listDefinedTypeNames,
  normalizeTypeName,
} from "./typeCatalog";
import type { CanvasElement } from "@/types";

function el(type: string, name: string): CanvasElement {
  return { id: `${type}-1`, type, x: 0, y: 0, width: 100, height: 100, data: { name } };
}

describe("typeCatalog", () => {
  it("normalizes type tokens, stripping array markers", () => {
    expect(normalizeTypeName("  string  ")).toBe("string");
    expect(normalizeTypeName("string[]")).toBe("string");
    expect(normalizeTypeName("number[][]")).toBe("number");
    expect(normalizeTypeName(undefined)).toBe("");
  });

  it("recognizes primitive types", () => {
    expect(isPrimitiveFieldType("string")).toBe(true);
    expect(isPrimitiveFieldType("uuid")).toBe(true);
    expect(isPrimitiveFieldType("decimal")).toBe(true);
    expect(isPrimitiveFieldType("Order")).toBe(false);
  });

  it("collects Object/Enum/Alias names defined on the board", () => {
    const names = collectDefinedTypeNames([
      el("objectCard", "Address"),
      el("enumCard", "Currency"),
      el("aliasCard", "CustomerId"),
      el("eventCard", "OrderPlaced"),
      el("stateCard", "OrderState"),
    ]);
    expect(Array.from(names).sort()).toEqual(["address", "currency", "customerid"]);
  });

  it("lists canonical defined type names for display", () => {
    const names = listDefinedTypeNames([
      el("objectCard", "Address"),
      el("aliasCard", "CustomerId"),
      el("enumCard", "Currency"),
      el("eventCard", "OrderPlaced"),
    ]);
    expect(names).toEqual(["Address", "Currency", "CustomerId"]);
  });

  it("accepts a type only when it is primitive or defined", () => {
    const defined = collectDefinedTypeNames([el("objectCard", "Address")]);
    expect(isKnownFieldType("string", defined)).toBe(true);
    expect(isKnownFieldType("Address", defined)).toBe(true);
    expect(isKnownFieldType("address", defined)).toBe(true);
    expect(isKnownFieldType("Address[]", defined)).toBe(true);
    expect(isKnownFieldType("Ghost", defined)).toBe(false);
    expect(isKnownFieldType("", defined)).toBe(false);
  });

  it("indexes event types by normalized name", () => {
    const events = collectEventTypeNames([
      el("eventCard", "OrderPlaced"),
      el("eventCard", "order placed"),
      el("stateCard", "OrderState"),
    ]);
    expect(events.size).toBe(1);
    expect(events.get("order placed")).toBe("OrderPlaced");
  });
});
