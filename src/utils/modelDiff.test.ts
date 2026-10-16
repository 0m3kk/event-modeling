import { describe, it, expect } from "vitest";
import type { CanvasElement, ChangeSet } from "@/types";
import {
  toModelElement,
  diffElements,
  diffModelElement,
  applyOps,
  replayModel,
  toCanvasElements,
  extractUiSidecar,
} from "./modelDiff";
import {
  buildProjectV3,
  encodeProject,
  decodeProject,
  projectToLoaded,
  parseProjectBytes,
} from "./projectFile";

function card(overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: "evt-1",
    type: "eventCard",
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    data: { name: "UserSignedUp", fields: [{ name: "email", type: "string" }] },
    ...overrides,
  };
}

describe("toModelElement", () => {
  it("drops geometry and colour but keeps membership links", () => {
    const el = card({ data: { name: "X", color: "#fff" }, groupId: "g1", referenceId: "r1" });
    const model = toModelElement(el);
    expect(model).toEqual({
      id: "evt-1",
      type: "eventCard",
      data: { name: "X" },
      groupId: "g1",
      referenceId: "r1",
    });
  });
});

describe("diffElements", () => {
  it("reports created, deleted and patched cards", () => {
    const a = card({ id: "a" });
    const b = card({ id: "b" });
    const bEdited = card({ id: "b", data: { name: "Other", fields: [] } });
    const c = card({ id: "c" });

    const events = diffElements([a, b], [bEdited, c]);
    expect(events).toContainEqual({ t: "deleted", id: "a" });
    expect(events).toContainEqual({ t: "created", el: toModelElement(c) });
    const patched = events.find((e) => e.t === "patched") as { id: string; ops: unknown[] };
    expect(patched.id).toBe("b");
    expect(patched.ops.length).toBeGreaterThan(0);
  });

  it("ignores geometry-only and colour-only changes", () => {
    const before = card();
    const moved = card({ x: 999, y: 42, width: 300 });
    const recolored = card({ data: { name: "UserSignedUp", fields: [{ name: "email", type: "string" }], color: "#f00" } });
    expect(diffElements([before], [moved])).toHaveLength(0);
    expect(diffElements([before], [recolored])).toHaveLength(0);
  });
});

describe("diffModelElement", () => {
  const base = toModelElement(
    card({ data: { name: "X", fields: [{ name: "a", type: "string" }, { name: "b", type: "string" }] } }),
  );

  it("diffs a nested key inside a same-shaped array", () => {
    const next = toModelElement(
      card({ data: { name: "X", fields: [{ name: "a", type: "number" }, { name: "b", type: "string" }] } }),
    );
    const ops = diffModelElement(base, next);
    expect(ops).toEqual([{ op: "replace", path: "/data/fields/0/type", value: "number" }]);
    expect(applyOps(base, ops)).toEqual(next);
  });

  it("replaces a whole array when its shape changes", () => {
    const next = toModelElement(
      card({ data: { name: "X", fields: [{ name: "a", type: "string" }] } }),
    );
    const ops = diffModelElement(base, next);
    expect(ops).toEqual([{ op: "replace", path: "/data/fields", value: [{ name: "a", type: "string" }] }]);
    expect(applyOps(base, ops)).toEqual(next);
  });

  it("adds and removes membership links", () => {
    const withGroup: typeof base = { ...base, groupId: "g1" };
    const ops = diffModelElement(base, withGroup);
    expect(ops).toEqual([{ op: "add", path: "/groupId", value: "g1" }]);
    expect(applyOps(base, ops)).toEqual(withGroup);

    const backOps = diffModelElement(withGroup, base);
    expect(backOps).toEqual([{ op: "remove", path: "/groupId" }]);
    expect(applyOps(withGroup, backOps)).toEqual(base);
  });
});

describe("replay", () => {
  it("rebuilds state by replaying diff events", () => {
    const a = card({ id: "a" });
    const b = card({ id: "b" });
    const aMoved = card({ id: "a", x: 500 });
    const aEdited = card({ id: "a", x: 500, data: { name: "Renamed", fields: [] } });

    // A sequence of board states across three commits, starting from empty.
    const log: ChangeSet[] = [
      { id: "cs1", seq: 1, at: "", actor: "user", events: diffElements([], [a, b]) },
      { id: "cs2", seq: 2, at: "", actor: "user", events: diffElements([a, b], [aMoved, b]) },
      { id: "cs3", seq: 3, at: "", actor: "ai", events: diffElements([aMoved, b], [aEdited, b]) },
    ];

    const ui = extractUiSidecar([aEdited, b], { x: 0, y: 0, zoom: 1, screenWidth: 0, screenHeight: 0 });
    const model = replayModel(log);
    const rebuilt = toCanvasElements(model, ui);
    expect(rebuilt.map((el) => ({ id: el.id, data: el.data, x: el.x }))).toEqual([
      { id: "a", data: aEdited.data, x: aEdited.x },
      { id: "b", data: b.data, x: b.x },
    ]);
  });
});

describe("project file v3", () => {
  const log: ChangeSet[] = [
    { id: "cs1", seq: 1, at: "", actor: "user", events: diffElements([], [card()]) },
  ];
  const elements = [card({ data: { name: "E", color: "#abc" } })];
  const viewport = { x: 5, y: 6, zoom: 2, screenWidth: 0, screenHeight: 0 };

  it("round-trips through CBOR and rebuilds geometry + colour", () => {
    const project = buildProjectV3({ name: "Board", elements, viewport, log });
    const bytes = encodeProject(project);
    const decoded = decodeProject(bytes);
    const loaded = projectToLoaded(decoded);
    expect(loaded.name).toBe("Board");
    expect(loaded.log).toHaveLength(1);
    expect(loaded.viewport.zoom).toBe(2);
    expect(loaded.elements[0].data.color).toBe("#abc");
    expect(loaded.elements[0].x).toBe(10);
  });

  it("migrates a v2 JSON board", () => {
    const v2 = JSON.stringify({
      version: 2,
      id: "p1",
      name: "Old",
      createdAt: "",
      updatedAt: "",
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [card()],
      groups: [],
    });
    const loaded = parseProjectBytes(new TextEncoder().encode(v2));
    expect(loaded.name).toBe("Old");
    expect(loaded.log).toHaveLength(1);
    expect(loaded.elements).toHaveLength(1);
  });
});
