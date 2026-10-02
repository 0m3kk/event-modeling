import { describe, expect, it } from "vitest";
import { Text } from "pixi.js";
import { CardLayer } from "./CardLayer";
import type { CanvasObject } from "@/types";

function stormCard(overrides: Partial<CanvasObject> = {}): CanvasObject {
  return {
    id: "c1",
    type: "storm",
    x: 0,
    y: 0,
    width: 240,
    height: 120,
    stormData: { kind: "event", name: "OrderPlaced", fields: [] },
    ...overrides,
  };
}

function containerOf(layer: CardLayer, id: string) {
  return (
    layer as unknown as {
      cardContainers: Map<string, { x: number; children: unknown[] }>;
    }
  ).cardContainers.get(id)!;
}

describe("CardLayer incremental drawing", () => {
  it("repositions a moved card without rebuilding its children", () => {
    const layer = new CardLayer();
    const card = stormCard();
    layer.renderCards([card], 1, []);

    const before = containerOf(layer, "c1");
    const firstChild = before.children[0];

    // Same content, new position — a typical drag frame. The stormData
    // reference is preserved, exactly like the immutable store updates do.
    layer.renderCards([{ ...card, x: 120, y: 80 }], 1, []);

    const after = containerOf(layer, "c1");
    expect(after).toBe(before);
    expect(after.x).toBe(120);
    expect(after.children[0]).toBe(firstChild);

    layer.destroy();
  });

  it("rebuilds a card only when its content changes", () => {
    const layer = new CardLayer();
    layer.renderCards([stormCard()], 1, []);
    const firstChild = containerOf(layer, "c1").children[0];

    layer.renderCards(
      [
        stormCard({
          stormData: { kind: "event", name: "OrderShipped", fields: [] },
        }),
      ],
      1,
      [],
    );

    expect(containerOf(layer, "c1").children[0]).not.toBe(firstChild);

    layer.destroy();
  });

  it("rebuilds a card when its selection changes but not others", () => {
    const layer = new CardLayer();
    const cardA = stormCard({ id: "a" });
    const cardB = stormCard({ id: "b", x: 400 });

    layer.renderCards([cardA, cardB], 1, []);
    const aChild = containerOf(layer, "a").children[0];
    const bChild = containerOf(layer, "b").children[0];

    layer.renderCards([cardA, cardB], 1, ["a"]);

    expect(containerOf(layer, "a").children[0]).not.toBe(aChild);
    expect(containerOf(layer, "b").children[0]).toBe(bChild);

    layer.destroy();
  });

  it("invalidateAllCards forces the next render to redraw", () => {
    const layer = new CardLayer();
    const card = stormCard();
    layer.renderCards([card], 1, []);
    const firstChild = containerOf(layer, "c1").children[0];

    layer.invalidateAllCards();
    layer.renderCards([card], 1, []);

    expect(containerOf(layer, "c1").children[0]).not.toBe(firstChild);

    layer.destroy();
  });

  it("rasterizes text at an explicit export resolution", () => {
    const layer = new CardLayer();
    const card: CanvasObject = {
      id: "t1",
      type: "textBox",
      x: 0,
      y: 0,
      width: 200,
      height: 40,
      text: "hello",
    };

    layer.renderCards([card], 1, [], undefined, [card], 4);

    const text = containerOf(layer, "t1").children.find(
      (child) => child instanceof Text,
    ) as Text;
    expect(text.resolution).toBe(4);

    layer.destroy();
  });

  it("keeps the model-derived key stable across culling changes", () => {
    const layer = new CardLayer();
    const card = stormCard();
    const model: CanvasObject = {
      id: "m1",
      type: "model",
      x: 1000,
      y: 0,
      width: 240,
      height: 120,
      modelData: { kind: "object", name: "Order", fields: [] },
    };

    // Same card, same full object set (new array each frame), only the culled
    // visible list shrinks/grows as the user pans.
    layer.renderCards([card, model], 1, [], null, [card, model]);
    const firstChild = containerOf(layer, "c1").children[0];

    layer.renderCards([card], 1, [], null, [card, model]);

    expect(containerOf(layer, "c1").children[0]).toBe(firstChild);

    layer.destroy();
  });

  it("invalidates and redraws cards when setDark changes theme", () => {
    const layer = new CardLayer();
    const card = stormCard();
    layer.renderCards([card], 1, []);
    const firstChild = containerOf(layer, "c1").children[0];

    layer.setDark(true);
    layer.renderCards([card], 1, []);

    expect(containerOf(layer, "c1").children[0]).not.toBe(firstChild);

    layer.destroy();
  });
});
