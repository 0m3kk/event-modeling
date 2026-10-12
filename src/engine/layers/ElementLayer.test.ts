import { describe, it, expect, beforeEach, vi } from "vitest";
import { ElementLayer } from "./ElementLayer";
import { toolRegistry } from "@/tools";
import type { CanvasElement } from "@/types";

const TEST_TYPE = "perfTestCard";

describe("ElementLayer render caching", () => {
  let layer: ElementLayer;
  let render: ReturnType<typeof vi.fn>;

  const makeElement = (overrides: Partial<CanvasElement> = {}): CanvasElement => ({
    id: "el-1",
    type: TEST_TYPE,
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    data: { name: "Card" },
    ...overrides,
  });

  beforeEach(() => {
    layer = new ElementLayer();
    render = vi.fn((container) => {
      container.removeChildren();
    });
    toolRegistry.register({ type: TEST_TYPE, name: "Perf Test", render } as never);
  });

  it("renders an element only once when it is re-supplied unchanged", () => {
    const element = makeElement();

    layer.renderElements([element], new Set(), "light", 1);
    layer.renderElements([element], new Set(), "light", 1);

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("does not redraw when an element only moved (new object, same content)", () => {
    const element = makeElement({ data: { name: "Card" } });

    layer.renderElements([element], new Set(), "light", 1);
    expect(render).toHaveBeenCalledTimes(1);

    // Simulate a drag frame: the store is immutable, so the moved element is a
    // new object that differs only in x/y and reuses the same data reference.
    const moved = { ...element, x: 40, y: 60 };
    layer.renderElements([moved], new Set(), "light", 1);

    expect(render).toHaveBeenCalledTimes(1);
    // The container transform still follows the new position.
    const container = (layer as never as { elementContainers: Map<string, { x: number; y: number }> })
      .elementContainers.get(element.id)!;
    expect(container.x).toBe(40);
    expect(container.y).toBe(60);
  });

  it("redraws when the element's data changes", () => {
    const element = makeElement({ data: { name: "Card" } });

    layer.renderElements([element], new Set(), "light", 1);
    layer.renderElements([element], new Set(), "light", 1);
    expect(render).toHaveBeenCalledTimes(1);

    const edited = { ...element, data: { name: "Renamed" } };
    layer.renderElements([edited], new Set(), "light", 1);

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("redraws when the element's size changes", () => {
    const element = makeElement();

    layer.renderElements([element], new Set(), "light", 1);
    const resized = { ...element, width: 260, height: 140 };
    layer.renderElements([resized], new Set(), "light", 1);

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("redraws when selection changes", () => {
    const element = makeElement();

    layer.renderElements([element], new Set(), "light", 1);
    expect(render).toHaveBeenCalledTimes(1);

    layer.renderElements([element], new Set([element.id]), "light", 1);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
