import { describe, it, expect } from "vitest";
import { buildFieldClipboard, canPasteFields } from "./fieldClipboard";
import type { CanvasObject, FieldClipboard } from "@/types";

describe("fieldClipboard", () => {
  it("builds field clipboard from storm fields", () => {
    const card: CanvasObject = {
      id: "s1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      stormData: {
        kind: "command",
        name: "CreateUser",
        fields: [
          { id: "f1", name: "id", fieldType: "uuid", required: true },
          { id: "f2", name: "email", fieldType: "string", tag: "user" },
        ],
      },
    };

    const clipboard = buildFieldClipboard(card, ["f1", "f2"]);
    expect(clipboard).toEqual({
      sourceKind: "storm",
      entries: [
        {
          name: "id",
          fieldType: "uuid",
          required: true,
          description: undefined,
        },
        {
          name: "email",
          fieldType: "string",
          required: undefined,
          description: undefined,
          tag: "user",
        },
      ],
    });
  });

  it("carries Command / Query param validation into the clipboard", () => {
    const card: CanvasObject = {
      id: "s1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      stormData: {
        kind: "command",
        name: "PlaceOrder",
        fields: [
          {
            id: "f1",
            name: "quantity",
            fieldType: "number",
            validation: { min: 1, max: 10 },
          },
        ],
      },
    };

    const clipboard = buildFieldClipboard(card, ["f1"]);
    expect(clipboard?.entries[0].validation).toEqual({ min: 1, max: 10 });
  });

  it("builds field clipboard from model enum values", () => {
    const card: CanvasObject = {
      id: "m1",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      modelData: {
        kind: "enum",
        name: "Status",
        values: [
          { id: "v1", name: "PENDING", value: "PENDING" },
          { id: "v2", name: "DONE", value: "DONE" },
        ],
      },
    };

    const clipboard = buildFieldClipboard(card, ["v1"]);
    expect(clipboard).toEqual({
      sourceKind: "model-enum",
      entries: [{ name: "PENDING", fieldType: "", description: undefined }],
    });
  });

  it("checks canPasteFields rules", () => {
    const stormCard: CanvasObject = {
      id: "s1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      stormData: {
        kind: "command",
        name: "Test",
        fields: [],
      },
    };

    const enumCard: CanvasObject = {
      id: "m1",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      modelData: {
        kind: "enum",
        name: "TestEnum",
      },
    };

    const objectCard: CanvasObject = {
      id: "m2",
      type: "model",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      modelData: {
        kind: "object",
        name: "TestObj",
      },
    };

    const stormClipboard: FieldClipboard = {
      sourceKind: "storm",
      entries: [{ name: "fieldA", fieldType: "string" }],
    };

    const enumClipboard: FieldClipboard = {
      sourceKind: "model-enum",
      entries: [{ name: "OPT_1", fieldType: "" }],
    };

    // Storm card accepts storm clipboard, but NOT enum clipboard
    expect(canPasteFields(stormCard, stormClipboard)).toBe(true);
    expect(canPasteFields(stormCard, enumClipboard)).toBe(false);

    // Object card accepts storm clipboard, but NOT enum clipboard
    expect(canPasteFields(objectCard, stormClipboard)).toBe(true);
    expect(canPasteFields(objectCard, enumClipboard)).toBe(false);

    // Enum card accepts enum clipboard, but NOT storm clipboard
    expect(canPasteFields(enumCard, enumClipboard)).toBe(true);
    expect(canPasteFields(enumCard, stormClipboard)).toBe(false);

    // Locked card rejects
    expect(canPasteFields({ ...stormCard, locked: true }, stormClipboard)).toBe(
      false,
    );
  });
});
