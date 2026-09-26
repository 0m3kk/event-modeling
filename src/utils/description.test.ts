import { describe, it, expect } from "vitest";
import type { CanvasObject } from "@/types";
import {
  applyDescription,
  findDescriptionText,
  findRowName,
} from "./description";

const storm: CanvasObject = {
  id: "s1",
  type: "storm",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  stormData: {
    kind: "query",
    name: "GetOrder",
    description: "Card level info",
    fields: [
      { id: "f1", name: "id", fieldType: "uuid", description: "Param info" },
    ],
    responseFields: [{ id: "r1", name: "result", fieldType: "string" }],
  },
};

const model: CanvasObject = {
  id: "m1",
  type: "model",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  modelData: {
    kind: "enum",
    name: "Role",
    description: "Role values",
    values: [
      { id: "v1", name: "ACTIVE", value: "ACTIVE", description: "Active user" },
    ],
  },
};

describe("findDescriptionText", () => {
  it("returns the card description when no field id is given", () => {
    expect(findDescriptionText(storm)).toBe("Card level info");
    expect(findDescriptionText(model)).toBe("Role values");
  });

  it("resolves storm param and response field descriptions", () => {
    expect(findDescriptionText(storm, "f1")).toBe("Param info");
    expect(findDescriptionText(storm, "r1")).toBeUndefined();
  });

  it("resolves model enum value descriptions", () => {
    expect(findDescriptionText(model, "v1")).toBe("Active user");
    expect(findDescriptionText(model, "missing")).toBeUndefined();
  });

  it("returns undefined for cards without a description", () => {
    const bare: CanvasObject = {
      ...storm,
      stormData: { ...storm.stormData!, description: undefined },
    };
    expect(findDescriptionText(bare)).toBeUndefined();
  });
});

describe("findRowName", () => {
  it("resolves storm field and model enum value names", () => {
    expect(findRowName(storm, "f1")).toBe("id");
    expect(findRowName(storm, "r1")).toBe("result");
    expect(findRowName(model, "v1")).toBe("ACTIVE");
  });

  it("returns undefined for the card scope or an unknown id", () => {
    expect(findRowName(storm, undefined)).toBeUndefined();
    expect(findRowName(storm, "missing")).toBeUndefined();
  });
});

/** Records updateObject patches so the applied description can be inspected. */
function capture() {
  const calls: { id: string; patch: Partial<CanvasObject> }[] = [];
  return {
    calls,
    updateObject: (id: string, patch: Partial<CanvasObject>) =>
      calls.push({ id, patch }),
  };
}

describe("applyDescription", () => {
  it("writes and removes the storm card description", () => {
    const add = capture();
    applyDescription(storm, undefined, "New info", add.updateObject);
    expect(add.calls[0].patch.stormData?.description).toBe("New info");

    const remove = capture();
    applyDescription(storm, undefined, undefined, remove.updateObject);
    expect(remove.calls[0].patch.stormData?.description).toBeUndefined();
  });

  it("writes param and response field descriptions", () => {
    const param = capture();
    applyDescription(storm, "f1", "Updated", param.updateObject);
    expect(param.calls[0].patch.stormData?.fields[0].description).toBe(
      "Updated",
    );

    const response = capture();
    applyDescription(storm, "r1", "Response info", response.updateObject);
    expect(response.calls[0].patch.stormData?.responseFields?.[0].description).toBe(
      "Response info",
    );
  });

  it("writes model object field and enum value descriptions", () => {
    const objectModel: CanvasObject = {
      ...model,
      modelData: {
        kind: "object",
        name: "User",
        fields: [{ id: "mf1", name: "id", fieldType: "uuid" }],
      },
    };
    const field = capture();
    applyDescription(objectModel, "mf1", "Field info", field.updateObject);
    expect(field.calls[0].patch.modelData?.fields?.[0].description).toBe(
      "Field info",
    );

    const value = capture();
    applyDescription(model, "v1", "Value info", value.updateObject);
    expect(value.calls[0].patch.modelData?.values?.[0].description).toBe(
      "Value info",
    );
  });

  it("removes a field description when value is undefined", () => {
    const remove = capture();
    applyDescription(storm, "f1", undefined, remove.updateObject);
    expect(remove.calls[0].patch.stormData?.fields[0].description).toBeUndefined();
  });
});
