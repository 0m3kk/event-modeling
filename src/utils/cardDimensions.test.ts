import { describe, it, expect } from "vitest";
import {
  computeStormCardHeight,
  computeModelNodeHeight,
} from "./cardDimensions";
import type { StormData, ModelData } from "@/types";

describe("cardDimensions", () => {
  it("expands storm card height as fields are added", () => {
    const data: StormData = {
      kind: "command",
      name: "CreateUser",
      action: "user:create:own",
      fields: [
        { id: "f1", name: "id", fieldType: "uuid" },
        { id: "f2", name: "email", fieldType: "string" },
      ],
    };

    // The authorization action is a header badge and adds no height, so the
    // base is measured from the header plus the two field rows.
    const h1 = computeStormCardHeight(data);
    expect(h1).toBe(36 + 6 + 2 * 26 + 10);

    const withMoreFields: StormData = {
      ...data,
      fields: [
        { id: "f1", name: "id", fieldType: "uuid" },
        { id: "f2", name: "email", fieldType: "string" },
        { id: "f3", name: "role", fieldType: "string" },
        { id: "f4", name: "phone", fieldType: "string" },
        { id: "f5", name: "status", fieldType: "string" },
      ],
    };

    const h4 = computeStormCardHeight(withMoreFields);
    expect(h4).toBe(h1 + 3 * 26);
  });

  it("calculates query card height with params and response sections", () => {
    const queryData: StormData = {
      kind: "query",
      name: "GetUser",
      action: "user:read:own",
      fields: [{ id: "p1", name: "id", fieldType: "uuid" }],
      responseFields: [{ id: "r1", name: "user", fieldType: "User" }],
    };

    const h = computeStormCardHeight(queryData);
    expect(h).toBeGreaterThan(120);
  });

  it("keeps the Query Response section even when it has no fields", () => {
    const paramsOnly: StormData = {
      kind: "query",
      name: "GetOrder",
      fields: [{ id: "p1", name: "id", fieldType: "uuid" }],
      responseFields: [],
    };
    const withResponse: StormData = {
      ...paramsOnly,
      responseFields: [{ id: "r1", name: "order", fieldType: "Order" }],
    };
    // The Response band is always present (section label); each response field
    // adds exactly one row.
    expect(computeStormCardHeight(withResponse)).toBe(
      computeStormCardHeight(paramsOnly) + 26,
    );
  });

  it("grows a constraint card for fields, query items and constraint lines", () => {
    const base: StormData = {
      kind: "constraint",
      name: "OrderConstraints",
      // Two fields keep the base above the 80px minimum so each delta is exact.
      fields: [
        { id: "cf1", name: "total", fieldType: "number" },
        { id: "cf2", name: "status", fieldType: "string" },
      ],
    };

    const hBase = computeStormCardHeight(base);

    // +1 field row
    const withField: StormData = {
      ...base,
      fields: [
        ...base.fields,
        { id: "cf3", name: "currency", fieldType: "string" },
      ],
    };
    expect(computeStormCardHeight(withField)).toBe(hBase + 26);

    // +1 Related Events (Query Items) row (section label + row)
    const withQuery: StormData = {
      ...base,
      queryItems: [{ id: "qi1", types: [], tagFieldIds: [] }],
    };
    expect(computeStormCardHeight(withQuery)).toBe(hBase + 22 + 26);

    // +1 free-text constraint row (section label + row)
    const withConstraint: StormData = {
      ...base,
      constraints: [{ id: "c1", text: "total > 0" }],
    };
    expect(computeStormCardHeight(withConstraint)).toBe(hBase + 22 + 26);
  });

  it("expands model node height as fields are added", () => {
    const model: ModelData = {
      kind: "object",
      name: "User",
      fields: [
        { id: "f1", name: "id", fieldType: "uuid" },
        { id: "f2", name: "name", fieldType: "string" },
      ],
    };

    const h2 = computeModelNodeHeight(model);
    const with4Fields: ModelData = {
      ...model,
      fields: [
        { id: "f1", name: "id", fieldType: "uuid" },
        { id: "f2", name: "name", fieldType: "string" },
        { id: "f3", name: "email", fieldType: "string" },
        { id: "f4", name: "role", fieldType: "string" },
      ],
    };

    const h4 = computeModelNodeHeight(with4Fields);
    expect(h4).toBe(h2 + 2 * 26);
  });
});
