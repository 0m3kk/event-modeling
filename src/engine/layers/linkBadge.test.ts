import { describe, it, expect, vi } from "vitest";
import {
  drawLinkBadge,
  drawMasterBadge,
  drawMethodCopyBadge,
  drawReferenceIndicator,
} from "./linkBadge";
import type { CanvasElement } from "@/types";
import { Graphics } from "pixi.js";

describe("linkBadge renderers", () => {
  const masterElement: CanvasElement = {
    id: "card-orig-1",
    type: "eventCard",
    x: 100,
    y: 100,
    width: 220,
    height: 88,
    referenceId: "ref-abc-123",
    isOriginal: true,
    data: { name: "OrderPlaced" },
  };

  const copyElement: CanvasElement = {
    id: "card-copy-1",
    type: "eventCard",
    x: 150,
    y: 150,
    width: 220,
    height: 88,
    referenceId: "ref-abc-123",
    isOriginal: false,
    data: { name: "OrderPlaced" },
  };

  it("draws link badge (Copy) with sky blue background and chain-link glyph", () => {
    const g = new Graphics();
    const circleSpy = vi.spyOn(g, "circle");
    const fillSpy = vi.spyOn(g, "fill");
    const strokeSpy = vi.spyOn(g, "stroke");

    drawLinkBadge(g, copyElement, { radius: 9, theme: "light" });

    // 1 circle for badge background + 2 circles for chain link loops
    expect(circleSpy).toHaveBeenCalledTimes(3);
    // Badge center at (element.width - 15, 16)
    expect(circleSpy).toHaveBeenNthCalledWith(1, 205, 16, 9);
    // Fill called with sky blue
    expect(fillSpy).toHaveBeenCalledWith({ color: 0x0284c7 });
    expect(strokeSpy).toHaveBeenCalled();
  });

  it("draws master badge (Original) with violet background and 4-diamond glyph", () => {
    const g = new Graphics();
    const circleSpy = vi.spyOn(g, "circle");
    const fillSpy = vi.spyOn(g, "fill");
    const strokeSpy = vi.spyOn(g, "stroke");

    drawMasterBadge(g, masterElement, { radius: 9, theme: "light" });

    // 1 circle for background
    expect(circleSpy).toHaveBeenCalledTimes(1);
    expect(circleSpy).toHaveBeenCalledWith(205, 16, 9);
    // Fill called with violet for master
    expect(fillSpy).toHaveBeenCalledWith({ color: 0x8b5cf6 });
    expect(strokeSpy).toHaveBeenCalled();
  });

  it("draws method-copy badge with emerald background and play glyph", () => {
    const g = new Graphics();
    const circleSpy = vi.spyOn(g, "circle");
    const fillSpy = vi.spyOn(g, "fill");
    const strokeSpy = vi.spyOn(g, "stroke");

    drawMethodCopyBadge(g, copyElement, { radius: 9, theme: "light" });

    // 1 circle for the badge background (the glyph is a filled triangle).
    expect(circleSpy).toHaveBeenCalledTimes(1);
    expect(circleSpy).toHaveBeenCalledWith(205, 16, 9);
    expect(fillSpy).toHaveBeenCalledWith({ color: 0x059669 });
    expect(strokeSpy).toHaveBeenCalled();
  });

  it("drawReferenceIndicator delegates correctly based on isOriginal flag", () => {
    const gMaster = new Graphics();
    const fillMasterSpy = vi.spyOn(gMaster, "fill");
    drawReferenceIndicator(gMaster, masterElement, true, { theme: "light" });
    expect(fillMasterSpy).toHaveBeenCalledWith({ color: 0x8b5cf6 });

    const gCopy = new Graphics();
    const fillCopySpy = vi.spyOn(gCopy, "fill");
    drawReferenceIndicator(gCopy, copyElement, false, { theme: "light" });
    expect(fillCopySpy).toHaveBeenCalledWith({ color: 0x0284c7 });
  });

  it("applies dark mode stroke correctly", () => {
    const g = new Graphics();
    const strokeSpy = vi.spyOn(g, "stroke");

    drawLinkBadge(g, copyElement, { radius: 8, theme: "dark" });
    expect(strokeSpy).toHaveBeenCalledWith({ color: 0x27272a, width: 1.5 });
  });
});
