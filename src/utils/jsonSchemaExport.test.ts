import { describe, expect, it } from "vitest";
import {
  exportCanvasJsonSchema,
  generateModelJsonSchema,
  generateStormCardJsonSchema,
} from "./jsonSchemaExport";
import type { CanvasObject, ModelData, StormData } from "@/types";

describe("jsonSchemaExport", () => {
  it("generates schema for an object model with primitives and required fields", () => {
    const model: ModelData = {
      kind: "object",
      name: "UserProfile",
      fields: [
        { id: "1", name: "userId", fieldType: "uuid", required: true },
        { id: "2", name: "email", fieldType: "email", required: true },
        { id: "3", name: "age", fieldType: "number" },
      ],
    };

    const schema = generateModelJsonSchema(model);
    expect(schema.title).toBe("UserProfile");
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["userId", "email"]);
    expect(schema.properties?.userId).toEqual({
      type: "string",
      format: "uuid",
      description: undefined,
    });
    expect(schema.properties?.email).toEqual({
      type: "string",
      format: "email",
      description: undefined,
    });
    expect(schema.properties?.age).toEqual({
      type: "number",
      description: undefined,
    });
  });

  it("generates schema for an enum model", () => {
    const model: ModelData = {
      kind: "enum",
      name: "OrderStatus",
      values: [
        { id: "1", name: "PENDING" },
        { id: "2", name: "CONFIRMED" },
        { id: "3", name: "SHIPPED" },
      ],
    };

    const schema = generateModelJsonSchema(model);
    expect(schema.title).toBe("OrderStatus");
    expect(schema.type).toBe("string");
    expect(schema.enum).toEqual(["PENDING", "CONFIRMED", "SHIPPED"]);
  });

  it("resolves model references as $ref", () => {
    const modelNames = new Set(["Address"]);
    const model: ModelData = {
      kind: "object",
      name: "Customer",
      fields: [{ id: "1", name: "shippingAddress", fieldType: "Address" }],
    };

    const schema = generateModelJsonSchema(model, modelNames);
    expect(schema.properties?.shippingAddress).toEqual({
      $ref: "#/definitions/Address",
      description: undefined,
    });
  });

  it("generates schema for a storm card payload", () => {
    const storm: StormData = {
      kind: "event",
      name: "InvoiceIssued",
      fields: [
        { id: "1", name: "invoiceId", fieldType: "uuid", required: true },
        { id: "2", name: "amount", fieldType: "number" },
      ],
    };

    const schema = generateStormCardJsonSchema(storm);
    expect(schema.title).toBe("InvoiceIssued");
    expect(schema.required).toEqual(["invoiceId"]);
    expect(schema.properties?.invoiceId).toEqual({
      type: "string",
      format: "uuid",
      description: undefined,
    });
  });

  it("exports Command and Query param validation as JSON Schema keywords", () => {
    const command: StormData = {
      kind: "command",
      name: "PlaceOrder",
      fields: [
        { id: "1", name: "orderId", fieldType: "uuid", required: true },
        {
          id: "2",
          name: "quantity",
          fieldType: "number",
          validation: { min: 1, max: 100 },
        },
        {
          id: "3",
          name: "code",
          fieldType: "string",
          validation: { minLength: 3, maxLength: 12, pattern: "^[A-Z]+$" },
        },
        {
          id: "4",
          name: "status",
          fieldType: "string",
          validation: { allowedValues: ["draft", "placed", "  "] },
        },
        {
          id: "5",
          name: "contact",
          fieldType: "string",
          validation: { format: "email" },
        },
      ],
    };

    const schema = generateStormCardJsonSchema(command);
    expect(schema.required).toEqual(["orderId"]);
    expect(schema.properties?.quantity).toEqual({
      type: "number",
      description: undefined,
      minimum: 1,
      maximum: 100,
    });
    expect(schema.properties?.code).toEqual({
      type: "string",
      description: undefined,
      minLength: 3,
      maxLength: 12,
      pattern: "^[A-Z]+$",
    });
    expect(schema.properties?.status).toEqual({
      type: "string",
      description: undefined,
      enum: ["draft", "placed"],
    });
    expect(schema.properties?.contact).toEqual({
      type: "string",
      description: undefined,
      format: "email",
    });
  });

  it("exports model node validation for object fields, arrays and wraps", () => {
    const objectModel: ModelData = {
      kind: "object",
      name: "Customer",
      fields: [
        { id: "1", name: "email", fieldType: "string", validation: { format: "email" } },
      ],
    };
    const objectSchema = generateModelJsonSchema(objectModel);
    expect(objectSchema.properties?.email).toEqual({
      type: "string",
      description: undefined,
      format: "email",
    });

    const arrayModel: ModelData = {
      kind: "array",
      name: "Tags",
      itemType: "string",
      validation: { minItems: 1, maxItems: 5 },
    };
    const arraySchema = generateModelJsonSchema(arrayModel);
    expect(arraySchema.type).toBe("array");
    expect(arraySchema.minItems).toBe(1);
    expect(arraySchema.maxItems).toBe(5);

    const wrapModel: ModelData = {
      kind: "wrap",
      name: "Nickname",
      innerType: "string",
      validation: { maxLength: 20, pattern: "^[a-z]+$" },
    };
    const wrapSchema = generateModelJsonSchema(wrapModel) as {
      title?: string;
      maxLength?: number;
      pattern?: string;
    };
    expect(wrapSchema.title).toBe("Nickname");
    expect(wrapSchema.maxLength).toBe(20);
    expect(wrapSchema.pattern).toBe("^[a-z]+$");
  });

  it("generates complete canvas schema definitions", () => {
    const objects: CanvasObject[] = [
      {
        id: "m1",
        type: "model",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        modelData: {
          kind: "object",
          name: "Item",
          fields: [
            { id: "f1", name: "price", fieldType: "number", required: true },
          ],
        },
      },
      {
        id: "s1",
        type: "storm",
        x: 300,
        y: 0,
        width: 260,
        height: 150,
        stormData: {
          kind: "event",
          name: "OrderPlaced",
          fields: [
            { id: "sf1", name: "orderId", fieldType: "uuid", required: true },
          ],
        },
      },
    ];

    const json = exportCanvasJsonSchema(objects);
    const parsed = JSON.parse(json);

    expect(parsed.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(parsed.definitions.Item.properties.price.type).toBe("number");
    expect(parsed.definitions.OrderPlaced.properties.orderId.format).toBe(
      "uuid",
    );
  });

  it("exports State and Constraint projections with params, query items and output fields", () => {
    const state: StormData = {
      kind: "state",
      name: "OrderSummary",
      fields: [],
      inputFields: [
        {
          id: "i1",
          name: "orderId",
          fieldType: "uuid",
          tag: "order",
          required: true,
        },
      ],
      outputFields: [{ id: "o1", name: "total", fieldType: "number" }],
      queryItems: [{ id: "q1", types: ["OrderPlaced"], tagFieldIds: ["i1"] }],
    };

    const schema = generateStormCardJsonSchema(state);
    expect(schema.title).toBe("OrderSummary");
    const props = schema.properties!;
    const inputFields = props.inputFields as {
      type?: string;
      required?: string[];
      properties: Record<string, { format?: string }>;
    };
    expect(inputFields.type).toBe("object");
    expect(inputFields.required).toEqual(["orderId"]);
    expect(inputFields.properties.orderId.format).toBe("uuid");

    const outputFields = props.outputFields as {
      type?: string;
      properties: Record<string, { type?: string }>;
    };
    expect(outputFields.type).toBe("object");
    expect(outputFields.properties.total.type).toBe("number");

    const queryItems = props.queryItems as {
      type?: string;
      items: { properties: Record<string, { type?: string }> };
    };
    expect(queryItems.type).toBe("array");
    expect(queryItems.items.properties.types.type).toBe("array");
    expect(props.constraints).toBeUndefined();

    const constraint: StormData = {
      kind: "constraint",
      name: "OrderRules",
      fields: [],
      inputFields: [],
      outputFields: [],
      constraints: [{ id: "c1", text: "total > 0" }],
    };
    const cSchema = generateStormCardJsonSchema(constraint);
    expect(
      (cSchema.properties!.constraints as { type?: string }).type,
    ).toBe("array");
  });

  it("includes State and Constraint cards in the canvas export", () => {
    const objects: CanvasObject[] = [
      {
        id: "st",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 120,
        stormData: {
          kind: "state",
          name: "OrderSummary",
          fields: [],
          inputFields: [],
          outputFields: [{ id: "o", name: "total", fieldType: "number" }],
        },
      },
      {
        id: "co",
        type: "storm",
        x: 0,
        y: 0,
        width: 200,
        height: 120,
        stormData: {
          kind: "constraint",
          name: "OrderRules",
          fields: [],
          constraints: [{ id: "c", text: "total > 0" }],
        },
      },
    ];

    const parsed = JSON.parse(exportCanvasJsonSchema(objects));
    expect(
      parsed.definitions.OrderSummary.properties.outputFields.properties.total
        .type,
    ).toBe("number");
    expect(parsed.definitions.OrderRules.properties.constraints.type).toBe(
      "array",
    );
  });

  it("generates Draft 2020-12 schema with $defs and updated $schema", () => {
    const objects: CanvasObject[] = [
      {
        id: "m1",
        type: "model",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        modelData: {
          kind: "object",
          name: "Item",
          fields: [
            { id: "f1", name: "price", fieldType: "number", required: true },
          ],
        },
      },
      {
        id: "m2",
        type: "model",
        x: 300,
        y: 0,
        width: 200,
        height: 100,
        modelData: {
          kind: "object",
          name: "Cart",
          fields: [
            { id: "f2", name: "item", fieldType: "Item", required: true },
          ],
        },
      },
    ];

    const json = exportCanvasJsonSchema(objects, { dialect: "2020-12" });
    const parsed = JSON.parse(json);

    expect(parsed.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(parsed.$defs).toBeDefined();
    expect(parsed.$defs.Item.properties.price.type).toBe("number");
    expect(parsed.$defs.Cart.properties.item.$ref).toBe("#/$defs/Item");
  });
});

