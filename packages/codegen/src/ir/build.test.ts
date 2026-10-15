import { describe, it, expect } from "vitest";
import { hoistTypes, parseSpecification } from "@em/spec";
import type { CodegenConfig } from "../config";
import { buildIr } from "./build";

const SPEC = `
name: Shop
domains:
  - name: Sales
    cards: [PlaceOrder, OrderPlaced]
  - name: Shipping
    cards: [ShipOrder, OrderShipped]
events:
  - name: OrderPlaced
    fields:
      - name: order
        type:
          object: Order
          fields:
            - name: id
              type: string
            - name: status
              type:
                enum: Status
                values: [pending, paid]
      - name: placedAt
        type:
          alias: Timestamp
          of: string
  - name: OrderShipped
    fields:
      - name: orderId
        type: OrderId
      - name: shippedAt
        type: Timestamp
commands:
  - name: PlaceOrder
    action: sales:placeOrder
    inputs:
      - name: orderId
        type:
          alias: OrderId
          of: string
        required: true
  - name: ShipOrder
    inputs:
      - name: orderId
        type: OrderId
`;

function ir(config: CodegenConfig = { spec: "s", out: "o" }) {
  const spec = parseSpecification(SPEC);
  const { spec: hoisted, types } = hoistTypes(spec);
  return buildIr({ spec: hoisted, types, config });
}

function artifact(crate: ReturnType<typeof ir>["crate"], name: string) {
  return crate.artifacts.find((a) => a.name === name)!;
}

describe("buildIr", () => {
  it("defaults the crate name to the spec name in snake_case", () => {
    expect(ir().crate.name).toBe("shop");
  });

  it("maps cards to their domain folder and kind folder", () => {
    const { crate } = ir();
    expect(artifact(crate, "OrderPlaced").modulePath).toEqual(["sales", "events"]);
    expect(artifact(crate, "ShipOrder").modulePath).toEqual(["shipping", "commands"]);
  });

  it("assigns a type to the domain that uses it, or common when shared", () => {
    const { crate } = ir();
    expect(artifact(crate, "Order").modulePath).toEqual(["sales", "types"]);
    expect(artifact(crate, "Status").modulePath).toEqual(["sales", "types"]);
    expect(artifact(crate, "OrderId").modulePath).toEqual(["common", "types"]);
    expect(artifact(crate, "Timestamp").modulePath).toEqual(["common", "types"]);
    expect(crate.typeModules).toEqual(["common", "sales"]);
  });

  it("renders required/array/optional fields and flags prelude usage", () => {
    const { crate } = ir();
    const placed = artifact(crate, "OrderPlaced");
    const order = placed.fields!.find((f) => f.rustName === "order")!;
    expect(order.rustType).toBe("Option<Order>");
    expect(placed.usesPrelude).toBe(true);

    const place = artifact(crate, "PlaceOrder");
    const orderId = place.inputs!.find((f) => f.rustName === "order_id")!;
    expect(orderId.rustType).toBe("OrderId");
    expect(orderId.optional).toBe(false);
    expect(orderId.needsRename).toBe(true);
  });

  it("resolves domain membership from groups and from slice lanes", () => {
    const source = `
name: Auth
domains:
  - name: account
    groups: [accountStates]
    slices: [registerAccount]
  - name: shared
    groups: [sharedServices]
groups:
  - name: accountStates
    domain: account
    cards: [accountState]
  - name: sharedServices
    domain: shared
    cards: [notificationService]
slices:
  - name: registerAccount
    domain: account
    lanes:
      - type: Command
        cards: [registerAccount]
      - type: Event
        cards: [accountRegistered]
      - type: State
        cards: [accountState]
events:
  - name: accountRegistered
    fields:
      - name: id
        type: string
commands:
  - name: registerAccount
    inputs:
      - name: email
        type: string
services:
  - name: notificationService
    methods:
      - name: send
states:
  - name: accountState
    params:
      - name: id
        type: string
`;
    const spec = parseSpecification(source);
    const { spec: hoisted, types } = hoistTypes(spec);
    const { crate } = buildIr({ spec: hoisted, types, config: { spec: "s", out: "o" } });
    const module = (name: string) => crate.artifacts.find((a) => a.name === name)!.modulePath;

    expect(module("registerAccount")).toEqual(["account", "commands"]);
    expect(module("accountRegistered")).toEqual(["account", "events"]);
    expect(module("accountState")).toEqual(["account", "states"]);
    expect(module("notificationService")).toEqual(["shared", "services"]);
  });

  it("always depends on serde and detects chrono/uuid from the type map", () => {
    expect(ir().crate.deps.map((d) => d.name)).toEqual(["serde"]);

    const { crate } = ir({
      spec: "s",
      out: "o",
      typeMap: { datetime: "chrono::DateTime<chrono::Utc>", uuid: "uuid::Uuid" },
    });
    // Nothing uses those types here, so no extra deps.
    expect(crate.deps.map((d) => d.name)).toEqual(["serde"]);
  });

  it("merges extra dependencies from the config", () => {
    const { crate } = ir({
      spec: "s",
      out: "o",
      crate: { deps: [{ name: "tracing", version: "0.1" }] },
    });
    expect(crate.deps.map((d) => d.name)).toEqual(["serde", "tracing"]);
  });

  it("generates validator attributes and skips what validator cannot express", () => {
    const source = `
name: Val
events:
  - name: Item
    fields:
      - name: title
        type: string
        validation: { minLength: 1, maxLength: 20 }
      - name: email
        type: string
        validation: { format: email }
      - name: total
        type: float
        validation: { min: 0 }
      - name: count
        type: integer
        validation: { min: 0, max: 10 }
      - name: tags
        type: string
        array: true
        validation: { minItems: 1 }
      - name: born
        type: string
        validation: { format: date }
      - name: code
        type: string
        validation: { pattern: "^[A-Z]+$", rule: "must be uppercase" }
`;
    const spec = parseSpecification(source);
    const { spec: hoisted, types } = hoistTypes(spec);
    const { crate } = buildIr({ spec: hoisted, types, config: { spec: "s", out: "o" } });
    const item = crate.artifacts.find((a) => a.name === "Item")!;
    const field = (name: string) => item.fields!.find((f) => f.rustName === name)!;

    expect(field("title").validations).toEqual(["length(min = 1, max = 20)"]);
    expect(field("email").validations).toEqual(["email"]);
    expect(field("total").validations).toEqual(["range(min = 0.0)"]);
    expect(field("count").validations).toEqual(["range(min = 0, max = 10)"]);
    expect(field("tags").validations).toEqual(["length(min = 1)"]);
    // No built-in check for `date`: routed to the generated validation helper.
    expect(field("born").validations).toEqual([
      'custom(function = "crate::validation::validate_date")',
    ]);
    expect(field("born").validationNotes).toEqual([]);
    // Unsupported: a raw pattern/rule -> notes, no attribute.
    expect(field("code").validations).toEqual([]);
    expect(field("code").validationNotes).toHaveLength(2);

    expect(item.validates).toBe(true);
    expect(crate.deps.map((d) => d.name)).toContain("validator");
    expect(crate.validationHelpers).toEqual(["validate_date"]);
  });

  it("maps ipv4/ipv6 to the versioned ip validator and collects helper names", () => {
    const source = `
name: Val
events:
  - name: Item
    fields:
      - name: host4
        type: string
        validation: { format: ipv4 }
      - name: host6
        type: string
        validation: { format: ipv6 }
      - name: id
        type: string
        validation: { format: uuid }
      - name: at
        type: string
        validation: { format: datetime }
`;
    const spec = parseSpecification(source);
    const { spec: hoisted, types } = hoistTypes(spec);
    const { crate } = buildIr({ spec: hoisted, types, config: { spec: "s", out: "o" } });
    const item = crate.artifacts.find((a) => a.name === "Item")!;
    const field = (name: string) => item.fields!.find((f) => f.rustName === name)!;

    expect(field("host4").validations).toEqual(["ip(v4 = true)"]);
    expect(field("host6").validations).toEqual(["ip(v6 = true)"]);
    expect(field("id").validations).toEqual([
      'custom(function = "crate::validation::validate_uuid")',
    ]);
    expect(field("at").validations).toEqual([
      'custom(function = "crate::validation::validate_datetime")',
    ]);
    expect(crate.validationHelpers).toEqual(["validate_datetime", "validate_uuid"]);
  });
});
