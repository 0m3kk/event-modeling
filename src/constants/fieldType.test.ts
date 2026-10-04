import { describe, expect, it } from "vitest";
import type { CanvasObject } from "@/types";
import {
  DEFAULT_FIELD_TYPE,
  canonicalPrimitiveType,
  coerceObjectArrays,
  isPrimitiveType,
  normalizeFieldType,
  normalizeObjectFieldTypes,
  splitArraySuffix,
} from "./fieldType";

describe("fieldType constants", () => {
  it("canonicalizes known primitives regardless of case or alias", () => {
    expect(canonicalPrimitiveType("string")).toBe("String");
    expect(canonicalPrimitiveType("STRING")).toBe("String");
    expect(canonicalPrimitiveType("uuid")).toBe("UUID");
    expect(canonicalPrimitiveType("date-time")).toBe("DateTime");
    expect(canonicalPrimitiveType("date_time")).toBe("DateTime");
    expect(canonicalPrimitiveType("datetime")).toBe("DateTime");
    expect(canonicalPrimitiveType("url")).toBe("URL");
    expect(canonicalPrimitiveType("Customer")).toBeNull();
    expect(canonicalPrimitiveType("")).toBeNull();
    expect(canonicalPrimitiveType(undefined)).toBeNull();
  });

  it("splits an array suffix", () => {
    expect(splitArraySuffix("UUID[]")).toEqual({ base: "UUID", isArray: true });
    expect(splitArraySuffix(" Order ")).toEqual({
      base: "Order",
      isArray: false,
    });
  });

  it("detects primitives with their array suffix", () => {
    expect(isPrimitiveType("String")).toBe(true);
    expect(isPrimitiveType("string[]")).toBe(true);
    expect(isPrimitiveType("Order")).toBe(false);
  });

  it("normalizes a field type while keeping non-primitive names", () => {
    expect(normalizeFieldType("uuid")).toBe("UUID");
    expect(normalizeFieldType("date-time")).toBe("DateTime");
    expect(normalizeFieldType("string")).toBe(DEFAULT_FIELD_TYPE);
    expect(normalizeFieldType("uuid[]")).toBe("UUID[]");
    expect(normalizeFieldType("  Order Line  ")).toBe("Order Line");
    expect(normalizeFieldType("")).toBe("");
  });

  it("normalizes every field type on a loaded object", () => {
    const storm: CanvasObject = {
      id: "s1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      stormData: {
        kind: "state",
        name: "Order Summary",
        fields: [{ id: "f", name: "note", fieldType: "string" }],
        inputFields: [
          { id: "i", name: "Order ID", fieldType: "uuid", tag: "order" },
        ],
        outputFields: [{ id: "o", name: "Total", fieldType: "number" }],
      },
    };
    const normalized = normalizeObjectFieldTypes(storm);
    expect(normalized.stormData?.fields[0].fieldType).toBe("String");
    expect(normalized.stormData?.inputFields?.[0].fieldType).toBe("UUID");
    expect(normalized.stormData?.outputFields?.[0].fieldType).toBe("Number");
    // Original object is not mutated.
    expect(storm.stormData?.fields[0].fieldType).toBe("string");

    const model: CanvasObject = {
      id: "m1",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      modelData: {
        kind: "object",
        name: "Order",
        fields: [{ id: "f", name: "items", fieldType: "orderline[]" }],
      },
    };
    const normalizedModel = normalizeObjectFieldTypes(model);
    expect(normalizedModel.modelData?.fields?.[0].fieldType).toBe("orderline[]");

    const array: CanvasObject = {
      id: "m2",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      modelData: { kind: "array", name: "Tags", itemType: "string" },
    };
    expect(normalizeObjectFieldTypes(array).modelData?.itemType).toBe("String");
  });

  it("repairs non-array field lists instead of crashing consumers", () => {
    const model = {
      id: "m1",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      modelData: { kind: "object", name: "Order", fields: { oops: true } },
    } as unknown as CanvasObject;

    const repaired = coerceObjectArrays(model);
    expect(repaired.modelData?.fields).toEqual([]);
    // normalizeObjectFieldTypes must not throw on the same malformed payload.
    expect(normalizeObjectFieldTypes(model).modelData?.fields).toEqual([]);

    const storm = {
      id: "s1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      stormData: { kind: "event", name: "E", fields: 42, queryItems: {} },
    } as unknown as CanvasObject;

    const repairedStorm = coerceObjectArrays(storm);
    expect(repairedStorm.stormData?.fields).toEqual([]);
    expect(repairedStorm.stormData?.queryItems).toEqual([]);

    // A well-formed object is returned untouched (same reference).
    const ok: CanvasObject = {
      id: "m2",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      modelData: { kind: "object", name: "Ok", fields: [] },
    };
    expect(coerceObjectArrays(ok)).toBe(ok);
  });
});
