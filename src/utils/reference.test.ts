import { describe, it, expect, beforeEach } from "vitest";
import {
  buildReferenceCopy,
  pruneDanglingReferences,
  syncReferenceSet,
  touchesSyncedReferenceField,
} from "./reference";
import { useCanvasStore, clearHistory } from "@/store";
import type { CanvasObject, StormData } from "@/types";
import { rectsOverlap } from "./placement";

function storm(overrides: Partial<CanvasObject> = {}): CanvasObject {
  return {
    id: "s1",
    type: "storm",
    x: 100,
    y: 100,
    width: 240,
    height: 120,
    stormData: { kind: "event", name: "OrderCreated", fields: [] },
    ...overrides,
  };
}

function model(overrides: Partial<CanvasObject> = {}): CanvasObject {
  return {
    id: "m1",
    type: "model",
    x: 10,
    y: 10,
    width: 200,
    height: 100,
    modelData: {
      kind: "object",
      name: "Order",
      fields: [{ id: "f1", name: "id", fieldType: "uuid" }],
    },
    ...overrides,
  };
}

describe("touchesSyncedReferenceField", () => {
  it("detects content/style/size patches", () => {
    expect(touchesSyncedReferenceField({ stormData: {} as StormData })).toBe(
      true,
    );
    expect(touchesSyncedReferenceField({ width: 10 })).toBe(true);
    expect(touchesSyncedReferenceField({ modelData: undefined })).toBe(false);
  });

  it("ignores geometry-only patches", () => {
    expect(touchesSyncedReferenceField({ x: 5, y: 5 })).toBe(false);
    expect(touchesSyncedReferenceField({ locked: true })).toBe(false);
    expect(touchesSyncedReferenceField({ groupId: "g1" })).toBe(false);
  });
});

describe("syncReferenceSet", () => {
  it("returns null when the changed object has no referenceId", () => {
    const objects = [storm({ id: "a" }), storm({ id: "b" })];
    expect(syncReferenceSet(objects, "a")).toBeNull();
  });

  it("returns null when the reference set is a single object", () => {
    const objects = [storm({ id: "a", referenceId: "ref-1" })];
    expect(syncReferenceSet(objects, "a")).toBeNull();
  });

  it("propagates content from the edited member to its peers", () => {
    const objects = [
      storm({
        id: "a",
        referenceId: "ref-1",
        stormData: { kind: "event", name: "Renamed", fields: [] },
      }),
      storm({
        id: "b",
        referenceId: "ref-1",
        stormData: { kind: "event", name: "Old", fields: [] },
      }),
    ];

    const next = syncReferenceSet(objects, "a");
    expect(next).not.toBeNull();
    expect(next![1].stormData?.name).toBe("Renamed");
  });

  it("keeps position independent across the set", () => {
    const objects = [
      storm({ id: "a", referenceId: "ref-1", x: 0, y: 0, width: 300 }),
      storm({ id: "b", referenceId: "ref-1", x: 500, y: 500, width: 100 }),
    ];

    const next = syncReferenceSet(objects, "a")!;
    // width syncs, position does not
    expect(next[1].width).toBe(300);
    expect(next[1].x).toBe(500);
    expect(next[1].y).toBe(500);
  });

  it("does not share nested arrays between synced siblings", () => {
    const source = storm({
      id: "a",
      referenceId: "ref-1",
      stormData: {
        kind: "event",
        name: "OrderCreated",
        fields: [{ id: "f1", name: "id", fieldType: "uuid" }],
      },
    });
    const objects = [source, storm({ id: "b", referenceId: "ref-1" })];

    const next = syncReferenceSet(objects, "a")!;
    expect(next[1].stormData?.fields).not.toBe(source.stormData?.fields);
    expect(next[1].stormData?.fields[0]).not.toBe(source.stormData?.fields[0]);
  });
});

describe("buildReferenceCopy", () => {
  it("assigns a shared referenceId and offsets the copy", () => {
    const source = storm({ id: "a", referenceId: "ref-1", locked: true });
    const copy = buildReferenceCopy(source);

    expect(copy.id).not.toBe(source.id);
    expect(copy.referenceId).toBe("ref-1");
    expect(copy.x).toBe(source.x + 32);
    expect(copy.y).toBe(source.y + 32);
    // Per-instance state starts fresh
    expect(copy.locked).toBe(false);
  });

  it("generates a new referenceId when the source is not linked yet", () => {
    const copy = buildReferenceCopy(storm({ id: "a" }));
    expect(copy.referenceId).toMatch(/^ref-/);
  });

  it("deep-clones model data so edits do not leak into the source", () => {
    const source = model({ referenceId: "ref-1" });
    const copy = buildReferenceCopy(source);
    expect(copy.modelData?.fields).not.toBe(source.modelData?.fields);
    copy.modelData!.fields![0].name = "changed";
    expect(source.modelData?.fields![0].name).toBe("id");
  });

  it("starts the copy detached from the source's Section", () => {
    const source = storm({ id: "a", groupId: "g1" });
    const copy = buildReferenceCopy(source);
    expect(source.groupId).toBe("g1");
    expect(copy.groupId).toBeUndefined();
  });
});

describe("pruneDanglingReferences", () => {
  it("drops a referenceId when only one member remains", () => {
    const objects = [storm({ id: "a", referenceId: "ref-1" })];
    const next = pruneDanglingReferences(objects);
    expect(next[0].referenceId).toBeUndefined();
  });

  it("keeps a referenceId shared by two members", () => {
    const objects = [
      storm({ id: "a", referenceId: "ref-1" }),
      storm({ id: "b", referenceId: "ref-1" }),
    ];
    expect(pruneDanglingReferences(objects)).toBe(objects);
  });
});

describe("createReferenceCopy (store)", () => {
  beforeEach(() => {
    useCanvasStore.getState().resetBoard();
    clearHistory();
  });

  it("links a source and its copy, and propagates later edits", () => {
    const store = useCanvasStore.getState();
    store.addObject(storm({ id: "s1" }));

    useCanvasStore.getState().createReferenceCopy(["s1"]);
    let state = useCanvasStore.getState();
    expect(state.objects).toHaveLength(2);

    const source = state.objects.find((o) => o.id === "s1")!;
    const copy = state.objects.find((o) => o.id !== "s1")!;
    expect(source.referenceId).toBeTruthy();
    expect(copy.referenceId).toBe(source.referenceId);
    expect(state.selectedIds).toEqual([copy.id]);

    // Edit the copy's field list — the source should follow.
    useCanvasStore.getState().updateObject(copy.id, {
      stormData: {
        ...copy.stormData!,
        fields: [{ id: "f9", name: "amount", fieldType: "number" }],
      },
    });

    state = useCanvasStore.getState();
    const updatedSource = state.objects.find((o) => o.id === "s1")!;
    expect(updatedSource.stormData?.fields[0].name).toBe("amount");
  });

  it("drops the referenceId when the copy is deleted", () => {
    const store = useCanvasStore.getState();
    store.addObject(model({ id: "m1" }));
    useCanvasStore.getState().createReferenceCopy(["m1"]);

    let state = useCanvasStore.getState();
    const copy = state.objects.find((o) => o.id !== "m1")!;
    useCanvasStore.getState().deleteObjects([copy.id]);

    state = useCanvasStore.getState();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].referenceId).toBeUndefined();
  });

  it("places the copy in free space instead of on top of the source", () => {
    const store = useCanvasStore.getState();
    store.addObject(storm({ id: "s1", x: 100, y: 100 }));
    useCanvasStore.getState().createReferenceCopy(["s1"]);

    const state = useCanvasStore.getState();
    const copy = state.objects.find((o) => o.id !== "s1")!;
    expect(
      rectsOverlap(
        { x: copy.x, y: copy.y, width: copy.width!, height: copy.height! },
        { x: 100, y: 100, width: 240, height: 120 },
        40,
      ),
    ).toBe(false);
  });

  it("keeps a copy clear of an existing Section frame and detaches it", () => {
    const store = useCanvasStore.getState();
    store.addObject(storm({ id: "s1", x: 0, y: 0, groupId: "g1" }));
    store.setGroups([
      {
        id: "g1",
        name: "Domain",
        customBounds: { x: -24, y: -24, width: 288, height: 168 },
      },
    ]);

    useCanvasStore.getState().createReferenceCopy(["s1"]);

    const state = useCanvasStore.getState();
    const copy = state.objects.find((o) => o.id !== "s1")!;
    expect(copy.groupId).toBeUndefined();
    expect(
      rectsOverlap(
        { x: copy.x, y: copy.y, width: copy.width!, height: copy.height! },
        { x: -24, y: -24, width: 288, height: 168 },
        40,
      ),
    ).toBe(false);
  });
});
