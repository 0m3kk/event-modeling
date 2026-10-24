import { describe, it, expect } from "vitest";
import { hoistTypes } from "./hoist";
import type { ObjectTypeDef, Specification } from "./types";

function defName(def: unknown): string {
  const d = def as ObjectTypeDef & { enum?: string; alias?: string };
  return d.object ?? d.enum ?? d.alias ?? "";
}

describe("hoistTypes", () => {
  it("lifts inline definitions and rewrites field types to plain names", () => {
    const spec: Specification = {
      name: "Shop",
      events: [
        {
          name: "OrderPlaced",
          fields: [
            {
              name: "order",
              type: {
                object: "Order",
                fields: [
                  { name: "id", type: { alias: "OrderId", of: "string" } },
                  { name: "status", type: { enum: "Status", values: ["pending", "paid"] } },
                ],
              },
            },
          ],
        },
        { name: "OrderShipped", fields: [{ name: "orderId", type: "OrderId" }] },
      ],
    };

    const { spec: out, types } = hoistTypes(spec);

    expect(out.events?.[0].fields?.[0].type).toBe("Order");
    expect(out.events?.[1].fields?.[0].type).toBe("OrderId");
    expect(types.map(defName)).toEqual(["Order", "OrderId", "Status"]);
    // The input object is not mutated.
    expect(typeof spec.events?.[0].fields?.[0].type).toBe("object");
  });

  it("de-duplicates definitions and survives cyclic references", () => {
    const spec: Specification = {
      name: "Cycle",
      events: [
        {
          name: "E",
          fields: [
            {
              name: "a",
              type: {
                object: "A",
                fields: [
                  { name: "b", type: { object: "B", fields: [{ name: "a", type: "A" }] } },
                ],
              },
            },
          ],
        },
      ],
    };

    const { types } = hoistTypes(spec);
    expect(types.map(defName)).toEqual(["A", "B"]);
  });

  it("hoists definitions from command/services/state field lists", () => {
    const spec: Specification = {
      name: "Mixed",
      services: [
        {
          name: "m",
          params: [{ name: "x", type: { alias: "X", of: "string" } }],
          returns: [{ name: "z", type: { object: "Z", fields: [] } }],
        },
      ],
      states: [{ name: "St", params: [{ name: "y", type: { object: "Y", fields: [] } }] }],
    };

    const { types } = hoistTypes(spec);
    expect(types.map(defName).sort()).toEqual(["X", "Y", "Z"]);
  });

  it("still hoists the legacy multi-method service shape", () => {
    const spec: Specification = {
      name: "Legacy",
      services: [
        {
          name: "S",
          methods: [{ name: "m", params: [{ name: "x", type: { alias: "X", of: "string" } }] }],
        },
      ],
    };

    const { types } = hoistTypes(spec);
    expect(types.map(defName).sort()).toEqual(["X"]);
  });

  it("keeps an explicit `types` registry and normalises its field types", () => {
    const spec: Specification = {
      name: "Account",
      types: [
        {
          object: "Profile",
          fields: [{ name: "id", type: { alias: "AccountId", of: "string" } }],
        },
      ],
      events: [
        {
          name: "AccountCreated",
          // The definition is already hoisted, so the field references it by name.
          fields: [{ name: "profile", type: "Profile" }],
        },
      ],
    };

    const { spec: out, types } = hoistTypes(spec);

    expect(types.map(defName)).toEqual(["Profile", "AccountId"]);
    expect(out.types?.map(defName)).toEqual(["Profile", "AccountId"]);
    expect(out.events?.[0].fields?.[0].type).toBe("Profile");
    // The nested inline alias was lifted and rewrite to a name.
    const profile = out.types?.[0] as ObjectTypeDef;
    expect(profile.fields?.[0].type).toBe("AccountId");
    // The input is not mutated.
    const inputProfile = spec.types?.[0] as ObjectTypeDef;
    expect(typeof inputProfile.fields?.[0].type).toBe("object");
  });

  it("de-duplicates a definition declared both in `types` and inline", () => {
    const spec: Specification = {
      name: "Shop",
      types: [{ alias: "OrderId", of: "string" }],
      events: [
        {
          name: "OrderPlaced",
          fields: [{ name: "orderId", type: { alias: "OrderId", of: "string" } }],
        },
      ],
    };

    const { spec: out, types } = hoistTypes(spec);
    expect(types.map(defName)).toEqual(["OrderId"]);
    expect(out.events?.[0].fields?.[0].type).toBe("OrderId");
  });
});
