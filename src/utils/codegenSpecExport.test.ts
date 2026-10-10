import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  buildCodegenSpec,
  exportCodegenSpec,
} from "./codegenSpecExport";
import type { CanvasObject, GroupInfo } from "@/types";

describe("codegenSpecExport", () => {
  it("exports exact query items with event types and resolved readable tags", () => {
    const objects: CanvasObject[] = [
      {
        id: "s1",
        type: "storm",
        x: 0,
        y: 0,
        width: 250,
        height: 200,
        stormData: {
          kind: "state",
          name: "OrderSummary",
          fields: [],
          inputFields: [
            {
              id: "in-1",
              name: "orderId",
              fieldType: "uuid",
              tag: "order",
              required: true,
            },
            {
              id: "in-2",
              name: "tenantId",
              fieldType: "string",
              tag: "tenant",
            },
            {
              id: "in-3",
              name: "unTaggedField",
              fieldType: "string",
            },
          ],
          queryItems: [
            {
              id: "q-1",
              types: ["OrderPlaced", "OrderUpdated"],
              tagFieldIds: ["in-1", "in-2"],
            },
            {
              id: "q-2",
              types: ["PaymentProcessed"],
              tagFieldIds: ["in-3"],
            },
          ],
          outputFields: [
            { id: "out-1", name: "totalAmount", fieldType: "number", required: true },
            { id: "out-2", name: "status", fieldType: "string" },
          ],
        },
      },
    ];

    const spec = buildCodegenSpec(objects, []);
    expect(spec.readModels).toHaveLength(1);
    const readModel = spec.readModels[0];
    expect(readModel.name).toBe("OrderSummary");
    expect(readModel.params).toEqual([
      { name: "orderId", type: "uuid", required: true, tag: "order" },
      { name: "tenantId", type: "string", tag: "tenant" },
      { name: "unTaggedField", type: "string" },
    ]);
    expect(readModel.queryItems).toEqual([
      {
        eventTypes: ["OrderPlaced", "OrderUpdated"],
        tags: ["order:orderId", "tenant:tenantId"],
      },
      {
        eventTypes: ["PaymentProcessed"],
        tags: ["unTaggedField"],
      },
    ]);
    expect(readModel.outputFields).toEqual([
      { name: "totalAmount", type: "number", required: true },
      { name: "status", type: "string" },
    ]);
  });

  it("organizes items into flattened root lists and attaches slice when grouped", () => {
    const groups: GroupInfo[] = [
      { id: "grp-orders", name: "Order Processing" },
    ];

    const objects: CanvasObject[] = [
      {
        id: "c1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        groupId: "grp-orders",
        stormData: {
          kind: "command",
          name: "PlaceOrder",
          action: "order:create",
          fields: [
            { id: "f1", name: "orderId", fieldType: "uuid", required: true },
            {
              id: "f2",
              name: "quantity",
              fieldType: "number",
              validation: { min: 1, max: 99 },
            },
          ],
          responseFields: [
            { id: "rf1", name: "orderId", fieldType: "uuid", required: true },
          ],
        },
      },
      {
        id: "e1",
        type: "storm",
        x: 250,
        y: 0,
        width: 200,
        height: 100,
        groupId: "grp-orders",
        stormData: {
          kind: "event",
          name: "OrderPlaced",
          fields: [
            { id: "ef1", name: "orderId", fieldType: "uuid", required: true, tag: "order" },
          ],
        },
      },
      {
        id: "e2",
        type: "storm",
        x: 500,
        y: 0,
        width: 200,
        height: 100,
        // Ungrouped
        stormData: {
          kind: "event",
          name: "GlobalNotificationSent",
          fields: [{ id: "nf1", name: "message", fieldType: "string" }],
        },
      },
    ];

    const spec = buildCodegenSpec(objects, groups, "Shop Domain");
    expect(spec.title).toBe("Shop Domain");
    expect(spec.slices).toEqual(["Order Processing"]);

    expect(spec.commands).toHaveLength(1);
    expect(spec.commands[0]).toEqual({
      name: "PlaceOrder",
      slice: "Order Processing",
      action: "order:create",
      payload: [
        { name: "orderId", type: "uuid", required: true },
        { name: "quantity", type: "number", validation: { min: 1, max: 99 } },
      ],
      response: [{ name: "orderId", type: "uuid", required: true }],
    });

    expect(spec.events).toHaveLength(2);
    expect(spec.events[0]).toEqual({
      name: "OrderPlaced",
      slice: "Order Processing",
      fields: [{ name: "orderId", type: "uuid", required: true, tag: "order" }],
    });
    expect(spec.events[1]).toEqual({
      name: "GlobalNotificationSent",
      fields: [{ name: "message", type: "string" }],
    });
  });

  it("exports slice definitions with domain tags and groups slices by domain", () => {
    const groups: GroupInfo[] = [
      {
        id: "slice-order-1",
        name: "Create Order Slice",
        isSlice: true,
        domain: "Order",
        tag: "Order",
        commandOrQueryId: "cmd-1",
      },
      {
        id: "slice-order-2",
        name: "Cancel Order Slice",
        isSlice: true,
        domain: "Order",
        tag: "Order",
      },
      {
        id: "slice-user-1",
        name: "Get User Slice",
        isSlice: true,
        domain: "User",
        tag: "User",
        commandOrQueryId: "qry-1",
      },
    ];

    const objects: CanvasObject[] = [
      {
        id: "cmd-1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        groupId: "slice-order-1",
        stormData: {
          kind: "command",
          name: "CreateOrder",
          fields: [{ id: "f1", name: "orderId", fieldType: "uuid" }],
        },
      },
      {
        id: "cmd-2",
        type: "storm",
        x: 300,
        y: 0,
        width: 200,
        height: 100,
        groupId: "slice-order-2",
        stormData: {
          kind: "command",
          name: "CancelOrder",
          fields: [{ id: "f2", name: "orderId", fieldType: "uuid" }],
        },
      },
      {
        id: "qry-1",
        type: "storm",
        x: 600,
        y: 0,
        width: 200,
        height: 100,
        groupId: "slice-user-1",
        stormData: {
          kind: "query",
          name: "GetUser",
          fields: [{ id: "f3", name: "userId", fieldType: "uuid" }],
        },
      },
    ];

    const spec = buildCodegenSpec(objects, groups, "E-Commerce");
    expect(spec.slices).toEqual([
      "Create Order Slice",
      "Cancel Order Slice",
      "Get User Slice",
    ]);

    expect(spec.domains).toEqual({
      Order: ["Create Order Slice", "Cancel Order Slice"],
      User: ["Get User Slice"],
    });

    expect(spec.sliceDefinitions).toEqual([
      {
        name: "Create Order Slice",
        domain: "Order",
        tag: "Order",
        command: "CreateOrder",
      },
      {
        name: "Cancel Order Slice",
        domain: "Order",
        tag: "Order",
        command: "CancelOrder",
      },
      {
        name: "Get User Slice",
        domain: "User",
        tag: "User",
        query: "GetUser",
      },
    ]);

    expect(spec.commands[0]?.domain).toBe("Order");
    expect(spec.commands[0]?.slice).toBe("Create Order Slice");
    expect(spec.commands[1]?.domain).toBe("Order");
    expect(spec.commands[1]?.slice).toBe("Cancel Order Slice");
    expect(spec.queries[0]?.domain).toBe("User");
    expect(spec.queries[0]?.slice).toBe("Get User Slice");
  });

  it("emits per-element domain and lets it override the group's domain", () => {
    const groups: GroupInfo[] = [
      {
        id: "slice-1",
        name: "Create Order Slice",
        isSlice: true,
        domain: "Order",
        tag: "Order",
      },
      { id: "shared", name: "Shared Types" },
    ];

    const objects: CanvasObject[] = [
      {
        id: "cmd-1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        groupId: "slice-1",
        stormData: { kind: "command", name: "CreateOrder", fields: [] },
      },
      {
        id: "evt-1",
        type: "storm",
        x: 0,
        y: 200,
        width: 200,
        height: 100,
        groupId: "slice-1",
        domain: "Billing",
        stormData: { kind: "event", name: "OrderPlaced", fields: [] },
      },
      {
        id: "act-1",
        type: "storm",
        x: 0,
        y: 400,
        width: 200,
        height: 100,
        domain: "Identity",
        stormData: { kind: "actor", name: "Customer", fields: [], permissions: [] },
      },
      {
        id: "bdd-1",
        type: "storm",
        x: 0,
        y: 600,
        width: 200,
        height: 100,
        domain: "Sales",
        stormData: {
          kind: "bdd",
          name: "Given Card",
          phase: "given",
          fields: [],
          steps: [],
        },
      },
      {
        id: "obj-1",
        type: "model",
        x: 400,
        y: 0,
        width: 200,
        height: 100,
        groupId: "shared",
        domain: "Catalog",
        modelData: { kind: "object", name: "OrderLine", fields: [] },
      },
      {
        id: "svc-1",
        type: "model",
        x: 400,
        y: 200,
        width: 200,
        height: 100,
        groupId: "shared",
        domain: "Payments",
        modelData: { kind: "service", name: "PaymentGateway", methods: [] },
      },
    ];

    const spec = buildCodegenSpec(objects, groups, "Shop");

    // The element's own domain wins over the slice's domain...
    expect(spec.events[0]?.domain).toBe("Billing");
    expect(spec.events[0]?.slice).toBe("Create Order Slice");
    // ...and the slice domain remains the fallback when the element has none.
    expect(spec.commands[0]?.domain).toBe("Order");
    expect(spec.commands[0]?.slice).toBe("Create Order Slice");

    expect(spec.actors[0]?.domain).toBe("Identity");
    expect(spec.scenarios[0]?.domain).toBe("Sales");
    expect(spec.models[0]?.domain).toBe("Catalog");
    expect(spec.services[0]?.domain).toBe("Payments");
  });

  it("exports models, queries, constraints, actors, and bdd scenarios", () => {
    const objects: CanvasObject[] = [
      {
        id: "m1",
        type: "model",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        modelData: {
          kind: "enum",
          name: "OrderStatus",
          values: [
            { id: "v1", name: "PENDING", description: "Created but unpaid" },
            { id: "v2", name: "CONFIRMED", value: "confirmed" },
          ],
        },
      },
      {
        id: "m2",
        type: "model",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        modelData: {
          kind: "object",
          name: "Address",
          fields: [
            { id: "mf1", name: "street", fieldType: "string", required: true },
            { id: "mf2", name: "zipCode", fieldType: "string", validation: { pattern: "^\\d{5}$" } },
          ],
        },
      },
      {
        id: "q1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "query",
          name: "GetOrder",
          fields: [{ id: "qf1", name: "orderId", fieldType: "uuid", required: true }],
          responseFields: [{ id: "qrf1", name: "total", fieldType: "number" }],
        },
      },
      {
        id: "c1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "constraint",
          name: "InventoryCheck",
          fields: [],
          inputFields: [{ id: "ci1", name: "orderId", fieldType: "uuid", tag: "order" }],
          queryItems: [{ id: "qi1", types: ["OrderPlaced"], tagFieldIds: ["ci1"] }],
          outputFields: [{ id: "co1", name: "availableStock", fieldType: "number" }],
          constraints: [
            { id: "rule-1", text: "availableStock >= requestedQuantity" },
            { id: "rule-2", text: "isStoreOpen == true" },
          ],
        },
      },
      {
        id: "a1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "actor",
          name: "StoreManager",
          fields: [],
          permissions: ["order:*", "inventory:update"],
        },
      },
      {
        id: "b1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "bdd",
          name: "Given an existing user",
          phase: "given",
          fields: [],
          steps: [
            {
              id: "step1",
              ref: "event",
              name: "UserRegistered",
              payload: [
                { id: "p1", key: "userId", value: "u-101" },
                { id: "p2", key: "email", value: "test@example.com" },
              ],
            },
          ],
        },
      },
    ];

    const spec = buildCodegenSpec(objects, []);

    expect(spec.models).toEqual([
      {
        kind: "enum",
        name: "OrderStatus",
        values: [
          { name: "PENDING", description: "Created but unpaid" },
          { name: "CONFIRMED", value: "confirmed" },
        ],
      },
      {
        kind: "object",
        name: "Address",
        fields: [
          { name: "street", type: "string", required: true },
          { name: "zipCode", type: "string", validation: { pattern: "^\\d{5}$" } },
        ],
      },
    ]);

    expect(spec.queries[0]).toEqual({
      name: "GetOrder",
      params: [{ name: "orderId", type: "uuid", required: true }],
      response: [{ name: "total", type: "number" }],
    });

    expect(spec.constraints[0]).toEqual({
      name: "InventoryCheck",
      params: [{ name: "orderId", type: "uuid", tag: "order" }],
      queryItems: [{ eventTypes: ["OrderPlaced"], tags: ["order:orderId"] }],
      outputFields: [{ name: "availableStock", type: "number" }],
      rules: [
        "availableStock >= requestedQuantity",
        "isStoreOpen == true",
      ],
    });

    expect(spec.actors[0]).toEqual({
      name: "StoreManager",
      permissions: ["order:*", "inventory:update"],
    });

    expect(spec.scenarios[0]).toEqual({
      name: "Given an existing user",
      phase: "given",
      steps: [
        {
          ref: "event",
          name: "UserRegistered",
          payload: {
            userId: "u-101",
            email: "test@example.com",
          },
        },
      ],
    });
  });

  it("resolves connectors into semantic flows", () => {
    const groups: GroupInfo[] = [{ id: "g1", name: "Checkout" }];
    const objects: CanvasObject[] = [
      {
        id: "cmd-1",
        type: "storm",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        groupId: "g1",
        stormData: { kind: "command", name: "SubmitOrder", fields: [] },
      },
      {
        id: "evt-1",
        type: "storm",
        x: 200,
        y: 0,
        width: 100,
        height: 100,
        groupId: "g1",
        stormData: { kind: "event", name: "OrderSubmitted", fields: [] },
      },
      {
        id: "conn-1",
        type: "connector",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        connectorData: {
          start: { objectId: "cmd-1", anchor: "right" },
          end: { objectId: "evt-1", anchor: "left" },
          lineStyle: "dashed",
        },
      },
    ];

    const spec = buildCodegenSpec(objects, groups);
    expect(spec.flows).toHaveLength(1);
    expect(spec.flows[0]).toEqual({
      from: { name: "SubmitOrder", kind: "command", slice: "Checkout" },
      to: { name: "OrderSubmitted", kind: "event", slice: "Checkout" },
      lineStyle: "dashed",
    });
  });

  it("exports JSON and YAML string formats accurately", () => {
    const objects: CanvasObject[] = [
      {
        id: "e1",
        type: "storm",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        stormData: {
          kind: "event",
          name: "UserCreated",
          fields: [{ id: "f1", name: "id", fieldType: "uuid", required: true }],
        },
      },
    ];

    const jsonStr = exportCodegenSpec(objects, [], { format: "json", projectName: "MyProject" });
    const parsedJson = JSON.parse(jsonStr);
    expect(parsedJson.version).toBe("1.0");
    expect(parsedJson.title).toBe("MyProject");
    expect(parsedJson.events[0].name).toBe("UserCreated");

    const yamlStr = exportCodegenSpec(objects, [], { format: "yaml", projectName: "MyProject" });
    const parsedYaml = parseYaml(yamlStr) as typeof parsedJson;
    expect(parsedYaml.version).toBe("1.0");
    expect(parsedYaml.title).toBe("MyProject");
    expect(parsedYaml.events[0].name).toBe("UserCreated");
  });

  it("treats groups with only models as shared type containers, not slices", () => {
    const groups: GroupInfo[] = [
      { id: "grp-shared", name: "Shared Models" },
      { id: "grp-slice", name: "Billing Slice" },
    ];

    const objects: CanvasObject[] = [
      // In shared models group (only models)
      {
        id: "m-common",
        type: "model",
        x: 0,
        y: 0,
        width: 150,
        height: 100,
        groupId: "grp-shared",
        modelData: {
          kind: "enum",
          name: "Currency",
          values: [{ id: "v1", name: "USD" }, { id: "v2", name: "VND" }],
        },
      },
      // In billing slice (contains command + event + model)
      {
        id: "cmd-invoice",
        type: "storm",
        x: 200,
        y: 0,
        width: 150,
        height: 100,
        groupId: "grp-slice",
        stormData: {
          kind: "command",
          name: "IssueInvoice",
          fields: [{ id: "f1", name: "invoiceId", fieldType: "uuid", required: true }],
        },
      },
      {
        id: "m-slice",
        type: "model",
        x: 350,
        y: 0,
        width: 150,
        height: 100,
        groupId: "grp-slice",
        modelData: {
          kind: "object",
          name: "InvoiceLine",
          fields: [{ id: "lf1", name: "amount", fieldType: "number", required: true }],
        },
      },
    ];

    const spec = buildCodegenSpec(objects, groups);

    // "Shared Models" is NOT in slices because it contains only models
    expect(spec.slices).toEqual(["Billing Slice"]);

    // Model in shared group has group: "Shared Models", but NO slice
    const sharedModel = spec.models.find((m) => m.name === "Currency");
    expect(sharedModel).toBeDefined();
    expect(sharedModel?.group).toBe("Shared Models");
    expect(sharedModel?.slice).toBeUndefined();

    // Model in actual slice has slice: "Billing Slice", and NO group
    const sliceModel = spec.models.find((m) => m.name === "InvoiceLine");
    expect(sliceModel).toBeDefined();
    expect(sliceModel?.slice).toBe("Billing Slice");
    expect(sliceModel?.group).toBeUndefined();
  });

  it("exports structured constraint rules when assert, code, or status are provided", () => {
    const objects: CanvasObject[] = [
      {
        id: "const-1",
        type: "storm",
        x: 0,
        y: 0,
        width: 300,
        height: 250,
        stormData: {
          kind: "constraint",
          name: "UserMustExist",
          fields: [],
          inputFields: [
            { id: "p1", name: "userId", fieldType: "uuid", required: true },
          ],
          outputFields: [
            { id: "o1", name: "isDeleted", fieldType: "boolean" },
          ],
          constraints: [
            // Legacy string rule
            { id: "c1", text: "Legacy free text rule without assertion" },
            // Structured codegen rule
            {
              id: "c2",
              text: "User account must exist in the event stream",
              code: "USER_NOT_FOUND",
              assert: "output.userId != null",
              message: "User account not found.",
              status: 404,
              severity: "error",
            },
            // Soft delete assertion
            {
              id: "c3",
              text: "Deleted account cannot be used",
              code: "USER_DELETED",
              assert: "!output.isDeleted",
              message: "User account is deleted.",
              status: 410,
            },
          ],
        },
      },
    ];

    const spec = buildCodegenSpec(objects, []);
    expect(spec.constraints).toHaveLength(1);
    const c = spec.constraints[0];
    expect(c.name).toBe("UserMustExist");
    expect(c.rules).toHaveLength(3);

    // Rule 1 is a legacy string
    expect(c.rules[0]).toBe("Legacy free text rule without assertion");

    // Rule 2 is structured
    expect(c.rules[1]).toEqual({
      code: "USER_NOT_FOUND",
      description: "User account must exist in the event stream",
      assert: "output.userId != null",
      message: "User account not found.",
      severity: "error",
      status: 404,
    });

    // Rule 3 is structured
    expect(c.rules[2]).toEqual({
      code: "USER_DELETED",
      description: "Deleted account cannot be used",
      assert: "!output.isDeleted",
      message: "User account is deleted.",
      status: 410,
    });
  });

  it("exports query item set dictionary without guessing", () => {
    const objects: CanvasObject[] = [
      {
        id: "ev1",
        type: "storm",
        x: 0,
        y: 0,
        width: 250,
        height: 200,
        stormData: {
          kind: "event",
          name: "UserRegistered",
          fields: [
            {
              id: "f1",
              name: "userId",
              fieldType: "UUID",
            },
            {
              id: "f2",
              name: "email",
              fieldType: "Email",
            },
            {
              id: "f3",
              name: "passwordHash",
              fieldType: "String",
            },
            {
              id: "f4",
              name: "unmappedField",
              fieldType: "String",
            },
          ],
        },
      },
      {
        id: "st1",
        type: "storm",
        x: 100,
        y: 100,
        width: 250,
        height: 200,
        stormData: {
          kind: "state",
          name: "UserState",
          fields: [],
          inputFields: [
            { id: "in1", name: "userId", fieldType: "UUID", tag: "user" },
          ],
          outputFields: [
            { id: "out1", name: "email", fieldType: "Email" },
            { id: "out2", name: "status", fieldType: "String" },
          ],
          queryItems: [
            {
              id: "qi1",
              types: ["UserRegistered"],
              tagFieldIds: ["in1"],
              set: {
                email: "event.email",
                status: "'active'",
              },
            },
          ],
        },
      },
    ];

    const spec = buildCodegenSpec(objects, []);
    const event = spec.events.find((e) => e.name === "UserRegistered")!;
    expect(event).toBeDefined();

    const state = spec.readModels.find((s) => s.name === "UserState")!;
    expect(state).toBeDefined();
    expect(state.queryItems[0].set).toEqual({
      email: "event.email",
      status: "'active'",
    });
  });

  it("resolves query item set keys flexibly across naming conventions", () => {
    const objects: CanvasObject[] = [
      {
        id: "c1",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        stormData: {
          kind: "state",
          name: "EmailProjection",
          fields: [],
          inputFields: [],
          outputFields: [
            { id: "of1", name: "Registered Email", fieldType: "Email" },
          ],
          queryItems: [
            {
              id: "qi1",
              types: ["UserRegistered"],
              tagFieldIds: [],
              set: {
                registeredEmail: "Command.Email",
              },
            },
          ],
        },
      },
    ];

    const spec = buildCodegenSpec(objects, []);
    const readModel = spec.readModels.find((rm) => rm.name === "EmailProjection")!;
    expect(readModel).toBeDefined();
    // In output spec, queryItem.set keys and expressions are normalized
    expect(readModel.queryItems[0].set).toEqual({
      registeredEmail: "command.email",
    });
  });

  it("tolerates a model whose fields are not an array", () => {
    const objects = [
      {
        id: "m1",
        type: "model",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        modelData: { kind: "object", name: "Broken", fields: { oops: true } },
      },
    ] as unknown as CanvasObject[];

    const spec = buildCodegenSpec(objects, []);
    expect(spec.models).toEqual([
      { kind: "object", name: "Broken", fields: [] },
    ]);
  });

  it("tolerates a model whose name is missing", () => {
    const objects = [
      {
        id: "m1",
        type: "model",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        modelData: { kind: "object" },
      },
      {
        id: "s1",
        type: "model",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        modelData: {
          kind: "service",
          methods: [{ id: "m1", params: [{ id: "p1" }] }],
        },
      },
    ] as unknown as CanvasObject[];

    const spec = buildCodegenSpec(objects, []);
    expect(spec.models).toEqual([
      { kind: "object", name: "", fields: [] },
    ]);
    expect(spec.services).toEqual([
      {
        name: "",
        methods: [{ name: "", params: [{ name: "", type: "string" }], returnType: "string" }],
      },
    ]);
  });

  it("exports service cards with methods and params into spec.services", () => {
    const objects: CanvasObject[] = [
      {
        id: "s1",
        type: "model",
        x: 0,
        y: 0,
        width: 240,
        height: 120,
        modelData: {
          kind: "service",
          name: "PasswordService",
          description: "Provides password hashing and verification",
          methods: [
            {
              id: "m1",
              name: "hashPassword",
              params: [{ id: "p1", name: "password", paramType: "String" }],
              returnType: "String",
              description: "Hashes raw password using argon2",
            },
            {
              id: "m2",
              name: "verifyPassword",
              params: [
                { id: "p2", name: "password", paramType: "String" },
                { id: "p3", name: "hash", paramType: "String" },
              ],
              returnType: "Boolean",
            },
          ],
        },
      },
    ];

    const spec = buildCodegenSpec(objects, []);
    expect(spec.services).toHaveLength(1);
    expect(spec.services[0]).toEqual({
      name: "PasswordService",
      description: "Provides password hashing and verification",
      methods: [
        {
          name: "hashPassword",
          params: [{ name: "password", type: "String" }],
          returnType: "String",
          description: "Hashes raw password using argon2",
        },
        {
          name: "verifyPassword",
          params: [
            { name: "password", type: "String" },
            { name: "hash", type: "String" },
          ],
          returnType: "Boolean",
        },
      ],
    });
  });
});

