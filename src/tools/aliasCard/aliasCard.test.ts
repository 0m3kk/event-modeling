import { describe, it, expect, beforeEach } from "vitest";
import { aliasCardTool, AliasCardSchema, type AliasCardData } from "./index";
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
      { name: "Money", type: "number" },
      { x: 0, y: 0 },
    );
    expect(element.type).toBe("aliasCard");
    expect((element.data as AliasCardData).aliasedType).toBe("number");
  });
});
