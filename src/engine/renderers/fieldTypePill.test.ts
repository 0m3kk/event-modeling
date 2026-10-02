import { describe, it, expect } from "vitest";
import { Container, Graphics, Text } from "pixi.js";
import {
  computeTypeZoneWidth,
  drawFieldKindIcon,
  drawFieldTypePill,
  getModelKindHex,
  truncateText,
} from "./fieldTypePill";
import { MODEL_KIND_COLORS } from "@/constants/model";
import type { CanvasObject } from "@/types";

describe("fieldTypePill renderer", () => {
  it("converts model kind colors to numeric hex", () => {
    expect(getModelKindHex("object")).toBe(
      parseInt(MODEL_KIND_COLORS.object.replace("#", ""), 16),
    );
    expect(getModelKindHex("enum")).toBe(
      parseInt(MODEL_KIND_COLORS.enum.replace("#", ""), 16),
    );
    expect(getModelKindHex("unknown")).toBe(0x0891b2);
  });

  it("calculates type zone width for primitive vs model types", () => {
    const primW = computeTypeZoneWidth("string", false);
    const modelW = computeTypeZoneWidth("string", true);

    expect(primW).toBeGreaterThanOrEqual(60);
    expect(modelW).toBeGreaterThan(primW);
    expect(modelW).toBeGreaterThanOrEqual(72);
  });

  it("grows the type zone with the full type name (no truncation cap)", () => {
    const short = computeTypeZoneWidth("Order", true);
    const long = computeTypeZoneWidth(
      "CustomerBillingAccountReferenceAggregate",
      true,
    );

    expect(long).toBeGreaterThan(short);
    // Width tracks the full string instead of clamping to the old 108px cap.
    expect(long).toBeGreaterThan(108);
    expect(long).toBeGreaterThanOrEqual(
      "CustomerBillingAccountReferenceAggregate".length * 6.5,
    );
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncateText("veryLongTypeNameHere", 8)).toBe("veryLon…");
    expect(truncateText("short", 10)).toBe("short");
    expect(truncateText("", 5)).toBe("");
  });

  it("draws vector kind icons for all model kinds without error", () => {
    const g = new Graphics();
    drawFieldKindIcon(g, "object", 10, 10, 0x0891b2);
    drawFieldKindIcon(g, "enum", 10, 10, 0x65a30d);
    drawFieldKindIcon(g, "array", 10, 10, 0xdc2626);
    drawFieldKindIcon(g, "wrap", 10, 10, 0xca8a04);
    expect(g).toBeDefined();
  });

  it("renders a neutral slate pill for primitive types", () => {
    const g = new Graphics();
    const container = new Container();

    drawFieldTypePill({
      g,
      container,
      rawType: "uuid",
      x: 100,
      y: 20,
      w: 60,
      h: 20,
      targetModel: null,
      textResolution: 1,
    });

    const textChild = container.children.find((c) => c instanceof Text) as Text;
    expect(textChild).toBeDefined();
    expect(textChild.text).toBe("uuid");
    expect(textChild.style.fill).toBe(0x64748b);
    expect(textChild.x).toBe(106); // x + 6
  });

  it("renders a tinted model pill with icon and model kind color", () => {
    const g = new Graphics();
    const container = new Container();

    const mockModel: CanvasObject = {
      id: "m1",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      modelData: {
        kind: "object",
        name: "UserProfile",
        fields: [],
      },
    };

    const typeWidth = computeTypeZoneWidth("UserProfile", true);

    drawFieldTypePill({
      g,
      container,
      rawType: "UserProfile",
      x: 100,
      y: 20,
      w: typeWidth,
      h: 20,
      targetModel: mockModel,
      textResolution: 1,
    });

    const textChild = container.children.find((c) => c instanceof Text) as Text;
    expect(textChild).toBeDefined();
    expect(textChild.text).toBe("UserProfile");
    expect(textChild.style.fill).toBe(getModelKindHex("object"));
    expect(textChild.style.fontWeight).toBe("600");
    expect(textChild.x).toBe(118); // x + 18 (leaves space for the kind micro-icon)
  });

  it("renders the full long model type instead of an ellipsized label", () => {
    const g = new Graphics();
    const container = new Container();
    const longType = "CustomerBillingAccountReferenceAggregate";

    const mockModel: CanvasObject = {
      id: "m1",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      modelData: {
        kind: "object",
        name: longType,
        fields: [],
      },
    };

    drawFieldTypePill({
      g,
      container,
      rawType: longType,
      x: 0,
      y: 20,
      w: computeTypeZoneWidth(longType, true),
      h: 20,
      targetModel: mockModel,
      textResolution: 1,
    });

    const textChild = container.children.find((c) => c instanceof Text) as Text;
    expect(textChild.text).toBe(longType);
    expect(textChild.text).not.toContain("…");
  });

  it("renders dark-styled pill for primitive types when isDark=true", () => {
    const g = new Graphics();
    const container = new Container();

    drawFieldTypePill({
      g,
      container,
      rawType: "string",
      x: 100,
      y: 20,
      w: 60,
      h: 20,
      targetModel: null,
      textResolution: 1,
      isDark: true,
    });

    const textChild = container.children.find((c) => c instanceof Text) as Text;
    expect(textChild).toBeDefined();
    expect(textChild.text).toBe("string");
    expect(textChild.style.fill).toBe(0xa1a1aa);
  });
});
