import { describe, it, expect, vi } from "vitest";
import { drawLinkBadge } from "./linkBadge";
import type { CanvasElement } from "@/types";
import { Graphics } from "pixi.js";

describe("drawLinkBadge", () => {
  const element: CanvasElement = {
    id: "card-ref-1",
    type: "eventCard",
    x: 100,
    y: 100,
    width: 220,
    height: 88,
    referenceId: "ref-abc-123",
    data: { name: "OrderPlaced" },
  };

  it("draws link badge graphics without crashing", () => {
    const g = new Graphics();
    const circleSpy = vi.spyOn(g, "circle");
    const strokeSpy = vi.spyOn(g, "stroke");
    const fillSpy = vi.spyOn(g, "fill");

    drawLinkBadge(g, element, { radius: 9, theme: "light" });

    // 1 circle for badge background + 2 circles for chain link loops
    expect(circleSpy).toHaveBeenCalledTimes(3);
    // Badge center at (element.width - 15, 16)
    expect(circleSpy).toHaveBeenNthCalledWith(1, 205, 16, 9);
    expect(fillSpy).toHaveBeenCalled();
    expect(strokeSpy).toHaveBeenCalled();
  });

  it("applies dark mode stroke correctly", () => {
    const g = new Graphics();
    const strokeSpy = vi.spyOn(g, "stroke");

    drawLinkBadge(g, element, { radius: 8, theme: "dark" });
    expect(strokeSpy).toHaveBeenCalledWith({ color: 0x27272a, width: 1.5 });
  });
});
