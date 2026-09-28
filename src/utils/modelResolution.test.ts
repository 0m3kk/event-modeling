import { describe, it, expect } from "vitest";
import {
  getBaseModelType,
  findModelByName,
  isModelType,
} from "./modelResolution";
import type { CanvasObject } from "@/types";

describe("modelResolution", () => {
  it("extracts base model type correctly", () => {
    expect(getBaseModelType("User")).toBe("User");
    expect(getBaseModelType("User[]")).toBe("User");
    expect(getBaseModelType("  Address[]  ")).toBe("Address");
    expect(getBaseModelType("")).toBeNull();
    expect(getBaseModelType(undefined)).toBeNull();
  });

  const objects: CanvasObject[] = [
    {
      id: "model-1",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      modelData: {
        kind: "object",
        name: "Customer",
        fields: [{ id: "f1", name: "name", fieldType: "string" }],
      },
    },
    {
      id: "model-2",
      type: "model",
      x: 100,
      y: 100,
      width: 240,
      height: 120,
      modelData: {
        kind: "enum",
        name: "OrderStatus",
        values: [{ id: "v1", name: "PENDING" }],
      },
    },
    {
      id: "storm-1",
      type: "storm",
      x: 200,
      y: 200,
      width: 200,
      height: 100,
      stormData: {
        kind: "event",
        name: "OrderPlaced",
        fields: [],
      },
    },
  ];

  it("finds model by exact and case-insensitive name, including arrays", () => {
    expect(findModelByName(objects, "Customer")?.id).toBe("model-1");
    expect(findModelByName(objects, "customer")?.id).toBe("model-1");
    expect(findModelByName(objects, "Customer[]")?.id).toBe("model-1");
    expect(findModelByName(objects, "OrderStatus")?.id).toBe("model-2");
    expect(findModelByName(objects, "OrderPlaced")).toBeNull(); // storm is not model
    expect(findModelByName(objects, "Unknown")).toBeNull();
  });

  it("checks isModelType correctly", () => {
    expect(isModelType(objects, "Customer")).toBe(true);
    expect(isModelType(objects, "Customer[]")).toBe(true);
    expect(isModelType(objects, "string")).toBe(false);
    expect(isModelType(objects, "")).toBe(false);
  });
});
