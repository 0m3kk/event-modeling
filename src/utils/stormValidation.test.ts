import { describe, expect, it } from "vitest";
import type { CanvasObject, StormField, StormKind } from "@/types";
import {
  describeStormOptions,
  validateStormWrite,
  type StormValidationCard,
  type StormValidationInput,
} from "./stormValidation";

function field(name: string, fieldType: string, tag?: string): StormField {
  return {
    id: `f-${name}-${fieldType}`,
    name,
    fieldType,
    ...(tag ? { tag } : {}),
  };
}

function stormObject(
  kind: StormKind,
  name: string,
  fields: StormField[],
): CanvasObject {
  return {
    id: `${kind}-${name}`,
    type: "storm",
    x: 0,
    y: 0,
    width: 260,
    height: 150,
    stormData: { kind, name, fields },
  };
}

function card(
  kind: StormKind,
  name: string,
  fields: StormField[] = [],
  extra: Partial<StormValidationCard> = {},
): StormValidationCard {
  return { kind, name, fields, ...extra };
}

const orderEvent = stormObject("event", "Order Placed", [
  field("Order ID", "uuid", "order"),
]);

describe("validateStormWrite", () => {
  it("passes a state that references an existing Event type and tag", () => {
    const input: StormValidationInput = {
      existing: [orderEvent],
      cards: [
        card("state", "Order State", [field("Order ID", "uuid", "order")], {
          queryItems: [{ types: ["Order Placed"], tagFields: ["Order ID"] }],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([]);
  });

  it("flags a query-item type with no matching Event card", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("state", "Order State", [], {
          queryItems: [{ types: ["Order Shipped"] }],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([
      '"Order State" (state) queryItems[0] type "Order Shipped" does not match any Event card.',
    ]);
  });

  it("flags a State tag that no Event field of the same type carries", () => {
    const input: StormValidationInput = {
      existing: [orderEvent],
      cards: [card("state", "Order State", [field("Email", "email", "email")])],
    };
    expect(validateStormWrite(input)).toEqual([
      '"Order State" (state) field "Email" has tag "email", but no Event field of type "email" carries that tag.',
    ]);
  });

  it("matches a State tag to an Event tag by type, not field name", () => {
    const input: StormValidationInput = {
      existing: [orderEvent],
      cards: [
        card("constraint", "Invariant", [
          field("Customer Order", "uuid", "order"),
        ]),
      ],
    };
    expect(validateStormWrite(input)).toEqual([]);
  });

  it("flags a tag on a kind that has no tag slot", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("command", "Place Order", [field("Order ID", "uuid", "order")]),
      ],
    };
    expect(validateStormWrite(input)).toEqual([
      '"Place Order" (command) field "Order ID" carries a tag, but tags are only valid on Event, Given/When/Then, State, and Constraint cards.',
    ]);
  });

  it("flags a tagField that is not a tagged field on the card", () => {
    const input: StormValidationInput = {
      existing: [orderEvent],
      cards: [
        card("state", "Order State", [field("Order ID", "uuid")], {
          queryItems: [{ types: ["Order Placed"], tagFields: ["Order ID"] }],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([
      '"Order State" (state) queryItems[0] tagField "Order ID" is not a tagged field on this card.',
    ]);
  });

  it("accepts references satisfied by another card in the same batch", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("event", "Order Placed", [field("Order ID", "uuid", "order")]),
        card("state", "Order State", [field("Order ID", "uuid", "order")], {
          queryItems: [{ types: ["OrderPlaced"], tagFields: ["orderId"] }],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([]);
  });

  it("skips tag checks for fields an update does not write, but still resolves tagFields", () => {
    const input: StormValidationInput = {
      existing: [orderEvent],
      cards: [
        card("state", "Order State", [field("Order ID", "uuid", "order")], {
          writtenFields: [],
          queryItems: [{ types: ["Order Placed"], tagFields: ["Order ID"] }],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([]);
  });
});

describe("describeStormOptions", () => {
  it("lists the available Event types and tags", () => {
    const input: StormValidationInput = {
      existing: [orderEvent],
      cards: [],
    };
    expect(describeStormOptions(input)).toBe(
      'Event types available: "Order Placed". Event tags available: "order (uuid)".',
    );
  });

  it("says none when the board has no Event cards", () => {
    expect(describeStormOptions({ existing: [], cards: [] })).toBe(
      "Event types available: (none yet). Event tags available: (none yet).",
    );
  });
});
