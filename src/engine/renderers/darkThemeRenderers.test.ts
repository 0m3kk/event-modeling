import { describe, it, expect } from "vitest";
import { Container, Text } from "pixi.js";
import { StormCardRenderer } from "./StormCardRenderer";
import { ModelNodeRenderer } from "./ModelNodeRenderer";
import type { CanvasObject } from "@/types";

describe("Dark mode rendering in StormCardRenderer and ModelNodeRenderer", () => {
  it("renders StormCard with dark styling when isDark is true", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "card-1",
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 140,
      stormData: {
        kind: "command",
        name: "CreateOrder",
        fields: [
          { id: "f1", name: "orderId", fieldType: "uuid" },
          { id: "f2", name: "amount", fieldType: "number" },
        ],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 2, false, undefined, undefined, true);
    expect(res).toBeDefined();
    expect(res.hitZones.length).toBeGreaterThan(0);

    // Verify text colors for dark mode: field names should be subdued light (0xd4d4d8)
    const texts = container.children.filter((c) => c instanceof Text) as Text[];
    const fieldText = texts.find((t) => t.text.includes("orderId"));
    expect(fieldText).toBeDefined();
    expect(fieldText!.style.fill).toBe(0xd4d4d8);

    const titleText = texts.find((t) => t.text === "CreateOrder");
    expect(titleText).toBeDefined();
    expect(titleText!.style.fill).toBe(0xe4e4e7);
  });

  it("renders StormCard with light styling when isDark is false", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "card-2",
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 140,
      stormData: {
        kind: "command",
        name: "CreateOrder",
        fields: [
          { id: "f1", name: "orderId", fieldType: "uuid" },
        ],
      },
    };

    const res = StormCardRenderer.draw(container, obj, 2, false, undefined, undefined, false);
    expect(res).toBeDefined();

    const texts = container.children.filter((c) => c instanceof Text) as Text[];
    const fieldText = texts.find((t) => t.text.includes("orderId"));
    expect(fieldText).toBeDefined();
    expect(fieldText!.style.fill).toBe(0x1e293b);
  });

  it("renders ModelNode with dark styling when isDark is true", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "model-1",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      modelData: {
        kind: "object",
        name: "User",
        fields: [
          { id: "mf1", name: "username", fieldType: "string" },
        ],
      },
    };

    const res = ModelNodeRenderer.draw(container, obj, 2, false, undefined, undefined, true);
    expect(res).toBeDefined();

    const texts = container.children.filter((c) => c instanceof Text) as Text[];
    const fieldText = texts.find((t) => t.text.includes("username"));
    expect(fieldText).toBeDefined();
    expect(fieldText!.style.fill).toBe(0xd4d4d8);

    const titleText = texts.find((t) => t.text === "User");
    expect(titleText).toBeDefined();
    expect(titleText!.style.fill).toBe(0xe4e4e7);
  });

  it("renders ModelNode with light styling when isDark is false", () => {
    const container = new Container();
    const obj: CanvasObject = {
      id: "model-2",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      modelData: {
        kind: "object",
        name: "User",
        fields: [
          { id: "mf1", name: "username", fieldType: "string" },
        ],
      },
    };

    const res = ModelNodeRenderer.draw(container, obj, 2, false, undefined, undefined, false);
    expect(res).toBeDefined();

    const texts = container.children.filter((c) => c instanceof Text) as Text[];
    const fieldText = texts.find((t) => t.text.includes("username"));
    expect(fieldText).toBeDefined();
    expect(fieldText!.style.fill).toBe(0x1e293b);
  });
});
