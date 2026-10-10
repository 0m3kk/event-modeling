import { describe, expect, it } from "vitest";
import type { CanvasObject, StormData, StormField, StormKind } from "@/types";
import {
  collectStormWarnings,
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
  extra: Partial<StormData> = {},
): CanvasObject {
  return {
    id: `${kind}-${name}`,
    type: "storm",
    x: 0,
    y: 0,
    width: 260,
    height: 150,
    stormData: { kind, name, fields, ...extra },
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
        card("state", "Order State", [], {
          inputFields: [field("Order ID", "uuid", "order")],
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
      cards: [
        card("state", "Order State", [], {
          inputFields: [field("Email", "email", "email")],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([
      '"Order State" (state) input param "Email" has tag "email", but no Event field of type "email" carries that tag.',
    ]);
  });

  it("matches a State tag to an Event tag by type, not field name", () => {
    const input: StormValidationInput = {
      existing: [orderEvent],
      cards: [
        card("constraint", "Invariant", [], {
          inputFields: [field("Customer Order", "uuid", "order")],
        }),
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
      '"Place Order" (command) field "Order ID" carries a tag, but tags are only valid on Event, Given/When/Then, and State cards.',
    ]);
  });

  it("flags a tagField that is not a tagged input param on the card", () => {
    const input: StormValidationInput = {
      existing: [orderEvent],
      cards: [
        card("state", "Order State", [], {
          inputFields: [field("Order ID", "uuid")],
          queryItems: [{ types: ["Order Placed"], tagFields: ["Order ID"] }],
        }),
      ],
    };
    expect(validateStormWrite(input)).toEqual([
      '"Order State" (state) queryItems[0] tagField "Order ID" is not a tagged input param on this card.',
    ]);
  });

  it("accepts references satisfied by another card in the same batch", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("event", "Order Placed", [field("Order ID", "uuid", "order")]),
        card("state", "Order State", [], {
          inputFields: [field("Order ID", "uuid", "order")],
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
        card("state", "Order State", [], {
          inputFields: [field("Order ID", "uuid", "order")],
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

  describe("event field origin & tag validation", () => {
    it("passes an event whose fields exist in the associated command", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("command", "Place Order", [
            field("Order ID", "uuid"),
            field("Total Amount", "number"),
          ]),
          card("event", "Order Placed", [
            field("Order ID", "uuid", "order"),
            field("Total Amount", "number"),
          ]),
        ],
      };
      expect(validateStormWrite(input)).toEqual([]);
    });

    it("passes an event whose fields come from both command and constraint", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("command", "Place Order", [field("Order ID", "uuid")]),
          card("constraint", "Inventory Reserved", [field("Warehouse ID", "uuid")]),
          card("event", "Order Placed", [
            field("Order ID", "uuid", "order"),
            field("Warehouse ID", "uuid"),
          ]),
        ],
      };
      expect(validateStormWrite(input)).toEqual([]);
    });

    it("no longer rejects an event field that does not exist in command or constraint", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("command", "Place Order", [field("Order ID", "uuid")]),
          card("event", "Order Placed", [
            field("Order ID", "uuid", "order"),
            field("Unauthorized Discount", "number"),
          ]),
        ],
      };
      // Field origin is a "nice to have" convention, not a hard requirement.
      expect(validateStormWrite(input)).toEqual([]);
    });

    it("flags a tag placed on a non-key event field", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("command", "Place Order", [
            field("Order ID", "uuid"),
            field("Total Amount", "number"),
          ]),
          card("event", "Order Placed", [
            field("Order ID", "uuid", "order"),
            field("Total Amount", "number", "order"),
          ]),
        ],
      };
      expect(validateStormWrite(input)).toEqual([
        '"Order Placed" (event) field "Total Amount" carries tag "order", but tags must only be applied to key/identifier fields (e.g. ID, unique email, code). Non-key fields should not be tagged.',
      ]);
    });

    it("accepts tags on key/unique fields (id, email, code)", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("command", "Register User", [
            field("User ID", "uuid"),
            field("User Email", "email"),
            field("Promo Code", "string"),
          ]),
          card("event", "User Registered", [
            field("User ID", "uuid", "user"),
            field("User Email", "email", "user"),
            field("Promo Code", "string", "promo"),
          ]),
        ],
      };
      expect(validateStormWrite(input)).toEqual([]);
    });

    it("flags constraint rules that perform command input validation", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("constraint", "User Exists", [], {
            constraints: [
              "User must not be deleted",
              "Email cannot be empty",
            ],
          }),
        ],
      };
      expect(validateStormWrite(input)).toEqual([
        '"User Exists" (constraint) rule "Email cannot be empty" appears to perform command input validation. Constraints are reusable Decision Models that check business logic invariants against historical events, not command input validation.',
      ]);
    });
  });
});

describe("collectStormWarnings", () => {
  it("warns when an event field is not declared in the command or constraint", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("command", "Place Order", [field("Order ID", "uuid")]),
        card("event", "Order Placed", [
          field("Order ID", "uuid", "order"),
          field("Unauthorized Discount", "number"),
        ]),
      ],
    };
    expect(collectStormWarnings(input)).toEqual([
      '"Order Placed" (event) field "Unauthorized Discount" is not declared in the associated Command or Constraint ("Place Order"). Prefer fields that originate from those payloads; timestamp/audit fields (e.g. Created At, Updated At) are exempt.',
    ]);
  });

  it("does not warn when every event field exists in the command or constraint", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("command", "Place Order", [
          field("Order ID", "uuid"),
          field("Total Amount", "number"),
        ]),
        card("constraint", "Inventory Reserved", [
          field("Warehouse ID", "uuid"),
        ]),
        card("event", "Order Placed", [
          field("Order ID", "uuid", "order"),
          field("Total Amount", "number"),
          field("Warehouse ID", "uuid"),
        ]),
      ],
    };
    expect(collectStormWarnings(input)).toEqual([]);
  });

  it("exempts timestamp/audit fields like Created At and Updated At", () => {
    const input: StormValidationInput = {
      existing: [],
      cards: [
        card("command", "Place Order", [field("Order ID", "uuid")]),
        card("event", "Order Placed", [
          field("Order ID", "uuid", "order"),
          field("Created At", "datetime"),
          field("Updated At", "datetime"),
        ]),
      ],
    };
    expect(collectStormWarnings(input)).toEqual([]);
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

  describe("Title Case enforcement and camelCase rejection", () => {
    it("rejects camelCase card names and field names", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("command", "placeOrder", [
            field("orderId", "uuid"),
            field("Total Amount", "number"),
          ], { action: "order:create:*" }),
        ],
      };
      const issues = validateStormWrite(input);
      expect(issues.some((i) => i.includes('Card name "placeOrder" (command) is in camelCase'))).toBe(true);
      expect(issues.some((i) => i.includes('field "orderId" is in camelCase'))).toBe(true);
    });

    it("rejects camelCase set keys and generic event or camelCase expressions in queryItems", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("event", "Order Placed", [field("Order ID", "uuid", "Order")]),
          {
            kind: "state",
            name: "Order Summary",
            fields: [],
            inputFields: [field("Order ID", "uuid", "Order")],
            outputFields: [field("Order Status", "String")],
            queryItems: [
              {
                types: ["Order Placed"],
                tagFields: ["Order ID"],
                set: {
                  orderStatus: "orderPlaced.status",
                },
              },
            ],
          },
        ],
      };
      const issues = validateStormWrite(input);
      expect(issues.some((i) => i.includes('set key "orderStatus" is in camelCase'))).toBe(true);
      expect(issues.some((i) => i.includes('uses camelCase prefix "orderPlaced."'))).toBe(true);
    });

    it("passes valid Title Case cards, fields, and queryItems set", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("command", "Place Order", [field("Order ID", "uuid")], {
            action: "order:create:*",
          }),
          card("event", "Order Placed", [field("Order ID", "uuid", "Order")]),
          {
            kind: "state",
            name: "Order Summary",
            fields: [],
            inputFields: [field("Order ID", "uuid", "Order")],
            outputFields: [field("Order ID", "uuid")],
            queryItems: [
              {
                types: ["Order Placed"],
                tagFields: ["Order ID"],
                set: {
                  "Order ID": '"Order Placed"."Order ID"',
                },
              },
            ],
          },
        ],
      };
      expect(validateStormWrite(input)).toEqual([]);
    });

    it("rejects deprecated output. and params. in constraint assert, enforces Fields. and Params. with quotes", () => {
      const input: StormValidationInput = {
        existing: [],
        cards: [
          card("constraint", "User Must Exist", [], {
            inputFields: [field("User ID", "uuid", "User")],
            outputFields: [field("User ID", "uuid")],
            constraints: [
              {
                code: "USER_NOT_FOUND",
                assert: "output.userId != null",
              },
            ],
          }),
        ],
      };
      const issues = validateStormWrite(input);
      expect(issues.some((i) => i.includes('uses "output.". Use "Fields." with double quotes'))).toBe(true);

      // Now with valid Fields. and Params. syntax
      const validInput: StormValidationInput = {
        existing: [],
        cards: [
          card("constraint", "User Must Exist", [], {
            inputFields: [field("User ID", "uuid")],
            outputFields: [field("User ID", "uuid")],
            constraints: [
              {
                code: "USER_NOT_FOUND",
                assert: '"Fields"."User ID" != null && "Params"."User ID" != null',
              },
            ],
          }),
        ],
      };
      expect(validateStormWrite(validInput)).toEqual([]);
    });

    it("enforces Enum model prefix when setting or comparing enum fields, but allows plain strings for String fields", () => {
      const userStatusEnum: CanvasObject = {
        id: "enum-user-status",
        type: "model",
        x: 0,
        y: 0,
        width: 150,
        height: 100,
        modelData: {
          name: "User Status",
          kind: "enum",
          values: [
            { id: "v1", name: "PENDING" },
            { id: "v2", name: "ACTIVE" },
            { id: "v3", name: "SUSPENDED" },
          ],
        },
      };

      // 1. Rejects plain string in queryItems set when target outputField is enum "User Status"
      const invalidEnumSetInput: StormValidationInput = {
        existing: [userStatusEnum, stormObject("event", "User Registered", [field("User ID", "uuid", "User")])],
        cards: [
          card("state", "User State", [], {
            inputFields: [field("User ID", "uuid", "User")],
            outputFields: [field("Status", "User Status")],
            queryItems: [
              {
                types: ["User Registered"],
                tagFields: ["User ID"],
                set: {
                  Status: "'PENDING'",
                },
              },
            ],
          }),
        ],
      };
      const issues = validateStormWrite(invalidEnumSetInput);
      expect(
        issues.some((i) =>
          i.includes('has enum type "User Status". Use enum reference "User Status"."<VALUE>"'),
        ),
      ).toBe(true);

      // 2. Allows plain string 'PENDING' when field type is "String"
      const validStringInput: StormValidationInput = {
        existing: [userStatusEnum, stormObject("event", "User Registered", [field("User ID", "uuid", "User")])],
        cards: [
          card("event", "User Registered", [field("Status", "String")]),
          card("state", "User State", [], {
            inputFields: [field("User ID", "uuid", "User")],
            outputFields: [field("Status", "String")],
            queryItems: [
              {
                types: ["User Registered"],
                tagFields: ["User ID"],
                set: {
                  Status: "'PENDING'",
                },
              },
            ],
          }),
        ],
      };
      expect(validateStormWrite(validStringInput)).toEqual([]);

      // 3. Passes when enum reference "User Status"."PENDING" is used
      const validEnumInput: StormValidationInput = {
        existing: [userStatusEnum, stormObject("event", "User Registered", [field("User ID", "uuid", "User")])],
        cards: [
          card("event", "User Registered", [field("Status", "User Status")]),
          card("state", "User State", [], {
            inputFields: [field("User ID", "uuid", "User")],
            outputFields: [field("Status", "User Status")],
            queryItems: [
              {
                types: ["User Registered"],
                tagFields: ["User ID"],
                set: {
                  Status: '"User Status"."PENDING"',
                },
              },
            ],
          }),
        ],
      };
      expect(validateStormWrite(validEnumInput)).toEqual([]);
    });
  });

  describe("Constraint State Reusability & Field Validation", () => {
    it("validates constraint assert rules against fields of a linked State card", () => {
      const userStatusState = stormObject("state", "User Status", [], {
        inputFields: [field("User ID", "UUID", "User")],
        outputFields: [field("Status", "String"), field("Is Active", "Boolean")],
      });

      // Valid: references existing output field "Is Active"
      const validConstraint: StormValidationInput = {
        existing: [userStatusState],
        cards: [
          card("constraint", "User Must Be Active", [], {
            stateId: userStatusState.id,
            constraints: [
              {
                code: "USER_INACTIVE",
                assert: '"Fields"."Is Active" == true',
              },
            ],
          }),
        ],
      };
      expect(validateStormWrite(validConstraint)).toEqual([]);

      // Invalid: references non-existent field "Deleted At"
      const invalidConstraint: StormValidationInput = {
        existing: [userStatusState],
        cards: [
          card("constraint", "User Not Deleted", [], {
            stateId: userStatusState.id,
            constraints: [
              {
                code: "USER_DELETED",
                assert: '"Fields"."Deleted At" == null',
              },
            ],
          }),
        ],
      };
      const issues = validateStormWrite(invalidConstraint);
      expect(issues.length).toBe(1);
      expect(issues[0]).toContain('references "Fields"."Deleted At" which does not exist in output fields');
    });

    it("allows multiple constraints to reuse the same State card", () => {
      const userStatusState = stormObject("state", "User Status", [], {
        inputFields: [field("User ID", "UUID", "User")],
        outputFields: [field("Status", "String")],
      });

      const multiConstraintsInput: StormValidationInput = {
        existing: [userStatusState],
        cards: [
          card("constraint", "User Must Be Active", [], {
            stateId: userStatusState.id,
            constraints: [
              { code: "MUST_BE_ACTIVE", assert: '"Fields"."Status" == \'ACTIVE\'' },
            ],
          }),
          card("constraint", "User Must Be Pending", [], {
            stateId: userStatusState.id,
            constraints: [
              { code: "MUST_BE_PENDING", assert: '"Fields"."Status" == \'PENDING\'' },
            ],
          }),
        ],
      };
      expect(validateStormWrite(multiConstraintsInput)).toEqual([]);
    });

    it("flags error when constraint references a non-existent State name", () => {
      const missingStateInput: StormValidationInput = {
        existing: [],
        cards: [
          card("constraint", "User Must Be Active", [], {
            stateName: "Non Existent State",
            constraints: ["User must be active"],
          }),
        ],
      };
      const issues = validateStormWrite(missingStateInput);
      expect(issues).toEqual([
        '"User Must Be Active" (constraint) references State "Non Existent State", but no matching State card was found.',
      ]);
    });
  });
});
