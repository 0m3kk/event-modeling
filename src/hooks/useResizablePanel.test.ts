import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyResize,
  clampPanelSize,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_WIDTH,
  getStoredPanelSize,
  maxPanelSize,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
} from "./useResizablePanel";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, val: string) {
    this.map.set(key, val);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

describe("useResizablePanel helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("window", { innerWidth: 1600, innerHeight: 1200 });
  });

  it("grows the panel when dragging the left edge left", () => {
    const start = { width: 500, height: 600 };
    expect(applyResize("left", start, -120, 0)).toEqual({
      width: 620,
      height: 600,
    });
    expect(applyResize("left", start, 80, 0)).toEqual({
      width: 420,
      height: 600,
    });
  });

  it("grows the panel when dragging the top edge up", () => {
    const start = { width: 500, height: 600 };
    expect(applyResize("top", start, 0, -90)).toEqual({
      width: 500,
      height: 690,
    });
  });

  it("combines both axes for the top-left corner", () => {
    expect(applyResize("top-left", { width: 500, height: 600 }, -50, -50)).toEqual({
      width: 550,
      height: 650,
    });
  });

  it("clamps to the minimum and viewport maximum", () => {
    const max = maxPanelSize(1600, 1200);
    expect(clampPanelSize({ width: 10, height: 10 }, max)).toEqual({
      width: MIN_PANEL_WIDTH,
      height: MIN_PANEL_HEIGHT,
    });
    expect(clampPanelSize({ width: 5000, height: 5000 }, max)).toEqual(max);
  });

  it("keeps a floor when the viewport is smaller than the minimum", () => {
    const max = maxPanelSize(200, 200);
    expect(max).toEqual({ width: MIN_PANEL_WIDTH, height: MIN_PANEL_HEIGHT });
  });

  it("falls back to defaults with no stored size", () => {
    expect(getStoredPanelSize()).toEqual({
      width: DEFAULT_PANEL_WIDTH,
      height: DEFAULT_PANEL_HEIGHT,
    });
  });

  it("reads a stored size and clamps it to the viewport", () => {
    localStorage.setItem(
      "storm-app-ai-panel-size",
      JSON.stringify({ width: 900, height: 700 }),
    );
    expect(getStoredPanelSize()).toEqual({ width: 900, height: 700 });

    localStorage.setItem(
      "storm-app-ai-panel-size",
      JSON.stringify({ width: 99999, height: 99999 }),
    );
    expect(getStoredPanelSize()).toEqual(maxPanelSize(1600, 1200));
  });

  it("ignores corrupted stored sizes", () => {
    localStorage.setItem("storm-app-ai-panel-size", "{not json");
    expect(getStoredPanelSize()).toEqual({
      width: DEFAULT_PANEL_WIDTH,
      height: DEFAULT_PANEL_HEIGHT,
    });
  });
});
