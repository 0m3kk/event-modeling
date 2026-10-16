import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { changeRecorder, USER_DEBOUNCE_MS } from "./recorder";
import type { CanvasElement } from "@/types";

function card(overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: "a",
    type: "eventCard",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    data: { name: "A", fields: [] },
    ...overrides,
  };
}

describe("changeRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    changeRecorder.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of user edits into one change set", () => {
    changeRecorder.recordDiff([], [card({ id: "a" })], "Add card");
    changeRecorder.recordDiff(
      [card({ id: "a" })],
      [card({ id: "a" }), card({ id: "b" })],
      "Add card",
    );
    expect(changeRecorder.getLog()).toHaveLength(0);

    vi.advanceTimersByTime(USER_DEBOUNCE_MS);
    const log = changeRecorder.getLog();
    expect(log).toHaveLength(1);
    expect(log[0].events.filter((e) => e.t === "created")).toHaveLength(2);
  });

  it("groups every event of an AI scope into a single change set", () => {
    changeRecorder.openScope("ai", "Build checkout");
    changeRecorder.recordDiff([], [card({ id: "a" })], "Add card");
    changeRecorder.recordDiff([card({ id: "a" })], [card({ id: "a" }), card({ id: "b" })]);
    expect(changeRecorder.getLog()).toHaveLength(0);

    changeRecorder.closeScope();
    const log = changeRecorder.getLog();
    expect(log).toHaveLength(1);
    expect(log[0].actor).toBe("ai");
    expect(log[0].label).toBe("Build checkout");
    expect(log[0].events).toHaveLength(2);
  });

  it("ignores geometry-only and colour-only changes", () => {
    changeRecorder.recordDiff([card({ id: "a" })], [card({ id: "a", x: 500, y: 900 })]);
    changeRecorder.recordDiff(
      [card({ id: "a" })],
      [card({ id: "a", data: { name: "A", fields: [], color: "#f00" } })],
    );
    vi.advanceTimersByTime(USER_DEBOUNCE_MS);
    expect(changeRecorder.getLog()).toHaveLength(0);
  });

  it("records an explicit board-cleared event", () => {
    changeRecorder.recordBoardCleared();
    vi.advanceTimersByTime(USER_DEBOUNCE_MS);
    const log = changeRecorder.getLog();
    expect(log).toHaveLength(1);
    expect(log[0].events[0]).toEqual({ t: "board.cleared" });
  });

  it("continues sequence numbers after setLog and flush", () => {
    changeRecorder.setLog([
      { id: "cs1", seq: 7, at: "", actor: "user", events: [] },
    ]);
    changeRecorder.recordBoardCleared();
    changeRecorder.flush();
    const log = changeRecorder.getLog();
    expect(log).toHaveLength(2);
    expect(log[1].seq).toBe(8);
  });
});
