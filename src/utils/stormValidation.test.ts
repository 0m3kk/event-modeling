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

  it("passes an actor with permissions matching an existing command action", () => {
    const input: StormValidationInput = {
      existing: [
        {
          id: "cmd-1",
          type: "storm",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          stormData: {
            kind: "command",
            name: "Place Order",
            action: "order:create:own",
            fields: [],
          },
        },
      ],
      cards: [
        card("actor", "Customer", [], {
          permissions: ["order:create:own"],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([]);
  });

  it("passes an actor with wildcard permissions matching an action", () => {
    const input: StormValidationInput = {
      existing: [
        {
          id: "query-1",
          type: "storm",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          stormData: {
            kind: "query",
            name: "Get Order",
            action: "order:read:own",
            fields: [],
          },
        },
      ],
      cards: [
        card("actor", "Customer", [], {
          permissions: ["order:*"],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([]);
  });

  it("flags an actor permission that does not match any action on canvas", () => {
    const input: StormValidationInput = {
      existing: [
        {
          id: "cmd-1",
          type: "storm",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          stormData: {
            kind: "command",
            name: "Place Order",
            action: "order:create:own",
            fields: [],
          },
        },
      ],
      cards: [
        card("actor", "Customer", [], {
          permissions: ["user:manage:all"],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([
      '"Customer" (actor) permission "user:manage:all" does not match any action on the canvas.',
    ]);
  });

  it("flags actor permission when no actions exist on canvas at all", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("actor", "Customer", [], {
          permissions: ["order:*"],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([
      '"Customer" (actor) permission "order:*" does not match any action on the canvas.',
    ]);
  });

  it("accepts an actor permission matching an action defined in the same batch", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("command", "Cancel Order", [], {
          action: "order:cancel:own",
        }),
        card("actor", "Customer", [], {
          permissions: ["order:cancel:own"],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([]);
  });

  it("flags only non-matching permissions when an actor specifies multiple permissions", () => {
    const input: StormValidationInput = {
      existing: [
        {
          id: "cmd-1",
          type: "storm",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          stormData: {
            kind: "command",
            name: "Place Order",
            action: "order:create:own",
            fields: [],
          },
        },
      ],
      cards: [
        card("actor", "Customer", [], {
          permissions: ["order:*", "billing:invoice:pay"],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([
      '"Customer" (actor) permission "billing:invoice:pay" does not match any action on the canvas.',
    ]);
  });

  it("passes an actor with no permissions specified", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [card("actor", "Customer", [])],
    };
    expect(validateStormWrite(input)).toEqual([]);
  });

  it("skips permission check when update does not write permissions", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("actor", "Customer", [field("order:create:own", "")], {
          writtenPermissions: [],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([]);
  });
});

describe("describeStormOptions", () => {
  it("lists the available Event types, tags, and Actions", () => {
    const input: StormValidationInput = {
      existing: [
        orderEvent,
        {
          id: "cmd-1",
          type: "storm",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          stormData: {
            kind: "command",
            name: "Place Order",
            action: "order:create:own",
            fields: [],
          },
        },
      ],
      cards: [],
    };
    expect(describeStormOptions(input)).toBe(
      'Event types available: "Order Placed". Event tags available: "order (uuid)". Actions available: "order:create:own".',
    );
  });

  it("says none when the board has no Event cards and no actions", () => {
    expect(describeStormOptions({ existing: [], cards: [] })).toBe(
      "Event types available: (none yet). Event tags available: (none yet). Actions available: (none yet).",
    );
  });
});
