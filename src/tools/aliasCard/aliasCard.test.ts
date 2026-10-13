import { describe, it, expect, beforeEach } from "vitest";
import "@/tools";
import { aliasCardTool, computeAliasCardSize, AliasCardSchema, type AliasCardData } from "./index";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";

describe("aliasCardTool", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  const card: CanvasElement<AliasCardData> = {
    id: "alias-1",
    type: "aliasCard",
    x: 100,
    y: 100,
    width: 220,
    height: 60,
    data: {
      name: "CustomerId",
      aliasedType: "uuid",
      color: "#db2777",
    },
  };

  it("exposes modeling metadata", () => {
    expect(aliasCardTool.type).toBe("aliasCard");
    expect(aliasCardTool.name).toBe("Alias");
    expect(aliasCardTool.color).toBe("#db2777");
    expect(aliasCardTool.category).toBe("modeling");
    expect(aliasCardTool.defaultSize).toEqual({ width: 220, height: 60 });
  });

  it("defaults the wrapped type to string", () => {
    expect(aliasCardTool.createDefaultData().aliasedType).toBe("string");
    expect(AliasCardSchema.parse({}).aliasedType).toBe("string");
  });

  it("has no selectable rows", () => {
    expect(aliasCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();
    expect(aliasCardTool.onSubSelect!(card, { x: 50, y: 45 })).toBeNull();
  });

  it("returns inline edit target for the header (Alias Name)", () => {
    useCanvasStore.getState().addElement(card);

    const target = aliasCardTool.getInlineEditTarget!(card, { x: 50, y: 15 });
    expect(target).not.toBeNull();
    expect(target?.initialValue).toBe("Customer ID");

    target?.onCommit("OrderId");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "alias-1");
    expect(updated?.data.name).toBe("orderId");
  });

  it("does not start an inline edit on the wrapped-type line", () => {
    const target = aliasCardTool.getInlineEditTarget!(card, { x: 50, y: 45 });
    expect(target).toBeNull();
  });

  it("supports wrapping a list of the type", () => {
    expect(AliasCardSchema.parse({ isArray: true }).isArray).toBe(true);

    const element = aliasCardTool.ai!.onCreate(
      { name: "Tags", type: "string", isArray: true },
      { x: 0, y: 0 },
    );
    expect((element.data as AliasCardData).isArray).toBe(true);
  });

  it("exposes an AI creation operation", () => {
    expect(aliasCardTool.ai?.toolName).toBe("create_alias_card");
    const element = aliasCardTool.ai!.onCreate(
      { name: "Money", type: "float" },
      { x: 0, y: 0 },
    );
    expect(element.type).toBe("aliasCard");
    expect((element.data as AliasCardData).aliasedType).toBe("float");
  });

  it("carries validation on the wrapped type", () => {
    expect(
      AliasCardSchema.parse({ validation: { min: 0, max: 1000 } }).validation,
    ).toEqual({ min: 0, max: 1000 });

    const element = aliasCardTool.ai!.onCreate(
      {
        name: "Money",
        type: "float",
        validation: { min: 0, rule: "two decimal places" },
      },
      { x: 0, y: 0 },
    );
    const data = element.data as AliasCardData;
    expect(data.validation).toEqual({ min: 0, rule: "two decimal places" });
  });
});

describe("aliasCardTool content width auto-grow", () => {
  it("keeps the default width for short content", () => {
    expect(computeAliasCardSize({ name: "CustomerId", aliasedType: "uuid" }).width).toBe(220);
  });

  it("widens to fit a long wrapped type", () => {
    // Body line: 12 + type(32 chars * 12 * 0.6 = 230.4) + 12 -> 255
    const width = computeAliasCardSize({ name: "Money", aliasedType: "a".repeat(32) }).width;
    expect(width).toBe(255);
  });

  it("reserves room for the validation shield on the wrapped type", () => {
    const type = "a".repeat(30); // 12 + 216 + 12 -> 240
    const plain = computeAliasCardSize({ name: "Money", aliasedType: type }).width;
    const withValidation = computeAliasCardSize({
      name: "Money",
      aliasedType: type,
      validation: { minLength: 1 },
    }).width;
    // Shield adds 6 gap + 15 badge.
    expect(plain).toBe(240);
    expect(withValidation).toBe(261);
  });

  it("never shrinks below a requested width", () => {
    const width = computeAliasCardSize(
      { name: "Money", aliasedType: "a".repeat(32) },
      900,
    ).width;
    expect(width).toBe(900);
  });

  it("widens the card when the wrapped type grows through the store", () => {
    useCanvasStore.getState().addElement({
      id: "alias-1",
      type: "aliasCard",
      x: 0,
      y: 0,
      width: 220,
      height: 60,
      data: { name: "Money", aliasedType: "float" },
    });
    expect(useCanvasStore.getState().elements[0].width).toBe(220);

    useCanvasStore.getState().updateElement("alias-1", {
      data: { name: "Money", aliasedType: "a".repeat(32) },
    });
    expect(useCanvasStore.getState().elements[0].width).toBe(255);
  });
});
