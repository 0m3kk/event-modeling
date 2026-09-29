import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore, undo, redo, clearHistory } from "./index";
import type { CanvasObject } from "@/types";

describe("useCanvasStore", () => {
  beforeEach(() => {
    useCanvasStore.getState().resetBoard();
    clearHistory();
  });

  it("initializes with empty objects, default viewport and default projectName", () => {
    const state = useCanvasStore.getState();
    expect(state.objects).toHaveLength(0);
    expect(state.selectedIds).toHaveLength(0);
    expect(state.tool).toBe("select");
    expect(state.viewport.zoom).toBe(1);
    expect(state.projectName).toBe("Untitled");
  });

  it("tracks the validation panel target and its hover tooltip", () => {
    const store = useCanvasStore.getState();
    expect(store.validationTarget).toBeNull();
    expect(store.validationHover).toBeNull();

    store.setValidationTarget({ objectId: "cmd-1", fieldId: "f1" });
    store.setValidationHover({
      objectId: "cmd-1",
      fieldId: "f1",
      text: "min length 1",
      iconBounds: { x: 40, y: 50, width: 15, height: 26 },
    });

    expect(useCanvasStore.getState().validationTarget).toEqual({
      objectId: "cmd-1",
      fieldId: "f1",
    });
    expect(useCanvasStore.getState().validationHover?.text).toBe("min length 1");

    // resetBoard clears both, like the other hover/selection state.
    useCanvasStore.getState().resetBoard();
    expect(useCanvasStore.getState().validationTarget).toBeNull();
    expect(useCanvasStore.getState().validationHover).toBeNull();
  });

  it("updates projectName and preserves it across object edits", () => {
    useCanvasStore.getState().setProjectName("My Architecture Board");
    expect(useCanvasStore.getState().projectName).toBe("My Architecture Board");

    // Resetting board with a new project name updates it
    useCanvasStore.getState().resetBoard([], [], "Loaded Project");
    expect(useCanvasStore.getState().projectName).toBe("Loaded Project");

    // Resetting board without project name defaults to Untitled
    useCanvasStore.getState().resetBoard();
    expect(useCanvasStore.getState().projectName).toBe("Untitled");
  });

  it("adds objects and auto-selects them", () => {
    const card: CanvasObject = {
      id: "card-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
    };

    useCanvasStore.getState().addObject(card);
    const state = useCanvasStore.getState();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0].id).toBe("card-1");
    expect(state.selectedIds).toEqual(["card-1"]);
  });

  it("updates object properties", () => {
    const card: CanvasObject = {
      id: "card-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
    };
    useCanvasStore.getState().addObject(card);
    useCanvasStore.getState().updateObject("card-1", { x: 250, y: 300 });

    const updated = useCanvasStore.getState().objects[0];
    expect(updated.x).toBe(250);
    expect(updated.y).toBe(300);
  });

  it("moves objects and snaps to 10px grid when requested", () => {
    const card: CanvasObject = {
      id: "card-1",
      type: "storm",
      x: 102,
      y: 103,
      width: 200,
      height: 120,
    };
    useCanvasStore.getState().addObject(card);

    // Move without snap
    useCanvasStore.getState().moveObjects(["card-1"], 15, 25, false);
    let obj = useCanvasStore.getState().objects[0];
    expect(obj.x).toBe(117);
    expect(obj.y).toBe(128);

    // Move with snap
    useCanvasStore.getState().moveObjects(["card-1"], 0, 0, true);
    obj = useCanvasStore.getState().objects[0];
    expect(obj.x).toBe(120);
    expect(obj.y).toBe(130);
  });

  it("deletes objects and cleans up selection", () => {
    const card1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const card2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    };

    useCanvasStore.getState().addObjects([card1, card2]);
    expect(useCanvasStore.getState().objects).toHaveLength(2);
    expect(useCanvasStore.getState().selectedIds).toEqual(["c1", "c2"]);

    useCanvasStore.getState().deleteObjects(["c1"]);
    expect(useCanvasStore.getState().objects).toHaveLength(1);
    expect(useCanvasStore.getState().objects[0].id).toBe("c2");
    expect(useCanvasStore.getState().selectedIds).toEqual(["c2"]);
  });

  it("selects and deletes a connector", () => {
    const card1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const card2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 300,
      y: 0,
      width: 100,
      height: 100,
    };
    const connector: CanvasObject = {
      id: "conn-1",
      type: "connector",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      connectorData: {
        start: { objectId: "c1", anchor: "right" },
        end: { objectId: "c2", anchor: "left" },
        stroke: "#475569",
        strokeWidth: 2,
        arrowEnd: true,
      },
    };
    useCanvasStore.getState().addObjects([card1, card2, connector]);

    useCanvasStore.getState().clearSelection();
    useCanvasStore.getState().selectObject("conn-1");
    expect(useCanvasStore.getState().selectedIds).toEqual(["conn-1"]);

    useCanvasStore.getState().deleteObjects(["conn-1"]);
    const state = useCanvasStore.getState();
    expect(state.objects.map((o) => o.id)).toEqual(["c1", "c2"]);
    expect(state.selectedIds).toEqual([]);
  });

  it("cascades connector deletion when an attached card is deleted", () => {
    const card1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const card2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 300,
      y: 0,
      width: 100,
      height: 100,
    };
    const connector: CanvasObject = {
      id: "conn-1",
      type: "connector",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      connectorData: {
        start: { objectId: "c1", anchor: "right" },
        end: { objectId: "c2", anchor: "left" },
      },
    };
    useCanvasStore.getState().addObjects([card1, card2, connector]);

    useCanvasStore.getState().deleteObjects(["c1"]);
    expect(useCanvasStore.getState().objects.map((o) => o.id)).toEqual(["c2"]);
  });

  it("handles multi-selection and toggle selection", () => {
    const card1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const card2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([card1, card2]);

    useCanvasStore.getState().clearSelection();
    expect(useCanvasStore.getState().selectedIds).toHaveLength(0);

    useCanvasStore.getState().selectObject("c1", false);
    expect(useCanvasStore.getState().selectedIds).toEqual(["c1"]);

    useCanvasStore.getState().selectObject("c2", true);
    expect(useCanvasStore.getState().selectedIds).toEqual(["c1", "c2"]);

    useCanvasStore.getState().selectObject("c1", true);
    expect(useCanvasStore.getState().selectedIds).toEqual(["c2"]);
  });

  it("clears the storm field selection together with the card selection", () => {
    const card: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObject(card);
    useCanvasStore.getState().setStormSelectedField({
      objectId: "c1",
      fieldId: "f1",
    });

    useCanvasStore.getState().clearSelection();

    const state = useCanvasStore.getState();
    expect(state.selectedIds).toHaveLength(0);
    expect(state.stormSelectedField).toBeNull();
  });

  it("drops the storm field selection when a group is selected", () => {
    const card: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObject(card);
    useCanvasStore.getState().setStormSelectedField({
      objectId: "c1",
      fieldId: "f1",
    });

    useCanvasStore.getState().selectGroup("g1");

    const state = useCanvasStore.getState();
    expect(state.selectedIds).toEqual(["__group:g1"]);
    expect(state.stormSelectedField).toBeNull();
  });

  it("handles groups and cascades group deletion without removing members", () => {
    const card: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      groupId: "g1",
    };
    useCanvasStore.getState().addObject(card);
    useCanvasStore.getState().addGroup({ id: "g1", name: "Order Context" });

    expect(useCanvasStore.getState().groups).toHaveLength(1);
    expect(useCanvasStore.getState().objects[0].groupId).toBe("g1");

    useCanvasStore.getState().deleteGroup("g1");
    expect(useCanvasStore.getState().groups).toHaveLength(0);
    expect(useCanvasStore.getState().objects[0].groupId).toBeUndefined();
  });

  it("records history and performs undo and redo", () => {
    const card: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 10,
      y: 10,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObject(card);
    // Flush so addObject is its own distinct history entry
    undo(); // undo add -> []
    expect(useCanvasStore.getState().objects).toHaveLength(0);
    redo(); // redo add -> [card]
    expect(useCanvasStore.getState().objects).toHaveLength(1);
    expect(useCanvasStore.getState().objects[0].x).toBe(10);

    // Now update object
    useCanvasStore.getState().updateObject("c1", { x: 50, y: 50 });
    expect(useCanvasStore.getState().objects[0].x).toBe(50);

    // Trigger undo
    undo();
    expect(useCanvasStore.getState().objects[0].x).toBe(10);

    // Trigger redo
    redo();
    expect(useCanvasStore.getState().objects[0].x).toBe(50);
  });

  it("manages typeSelect and inlineEdit with mutual closing", () => {
    useCanvasStore.getState().setTypeSelect({
      objectId: "c1",
      fieldId: "f1",
      anchor: { x: 10, y: 20, width: 60, height: 26 },
    });
    expect(useCanvasStore.getState().typeSelect).not.toBeNull();
    expect(useCanvasStore.getState().inlineEdit).toBeNull();

    // Opening inlineEdit should close typeSelect
    useCanvasStore.getState().setInlineEdit({
      objectId: "c1",
      zone: {
        type: "fieldName",
        bounds: { x: 10, y: 20, width: 80, height: 26 },
      },
      initialValue: "userId",
    });
    expect(useCanvasStore.getState().inlineEdit).not.toBeNull();
    expect(useCanvasStore.getState().typeSelect).toBeNull();

    // Opening typeSelect again should close inlineEdit
    useCanvasStore.getState().setTypeSelect({
      objectId: "c1",
      fieldId: "f2",
      anchor: { x: 10, y: 50, width: 60, height: 26 },
    });
    expect(useCanvasStore.getState().typeSelect?.fieldId).toBe("f2");
    expect(useCanvasStore.getState().inlineEdit).toBeNull();
  });

  it("groups selected cards with 24px padding and ungroups cleanly", () => {
    const card1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };
    const card2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 350,
      y: 200,
      width: 150,
      height: 80,
    };
    useCanvasStore.getState().addObjects([card1, card2]);
    useCanvasStore.getState().setSelectedIds(["c1", "c2"]);

    const gid = useCanvasStore.getState().groupObjects();
    expect(gid).toBeDefined();

    const state = useCanvasStore.getState();
    expect(state.groups).toHaveLength(1);
    const group = state.groups[0];
    expect(group.id).toBe(gid);
    expect(group.name).toBe("Group");
    expect(group.lineStyle).toBe("dashed");

    // Check 24px padding bounds
    // minX=100, minY=100, maxX=500, maxY=280
    expect(group.customBounds).toEqual({
      x: 100 - 24,
      y: 100 - 24,
      width: 500 - 100 + 48,
      height: 280 - 100 + 48,
    });

    // Check members have groupId assigned
    expect(state.objects.find((o) => o.id === "c1")?.groupId).toBe(gid);
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBe(gid);
    expect(state.selectedIds).toEqual([`__group:${gid}`]);

    // Move group moves all member objects and customBounds synchronously
    useCanvasStore.getState().moveGroupObjects(gid!, 50, 40);
    const afterMove = useCanvasStore.getState();
    expect(afterMove.objects.find((o) => o.id === "c1")?.x).toBe(150);
    expect(afterMove.objects.find((o) => o.id === "c1")?.y).toBe(140);
    expect(afterMove.objects.find((o) => o.id === "c2")?.x).toBe(400);
    expect(afterMove.objects.find((o) => o.id === "c2")?.y).toBe(240);
    expect(afterMove.groups[0].customBounds?.x).toBe(100 - 24 + 50);
    expect(afterMove.groups[0].customBounds?.y).toBe(100 - 24 + 40);

    // Ungroup dissolves group and keeps member objects
    useCanvasStore.getState().ungroupObjects([`__group:${gid}`]);
    const afterUngroup = useCanvasStore.getState();
    expect(afterUngroup.groups).toHaveLength(0);
    expect(afterUngroup.objects).toHaveLength(2);
    expect(
      afterUngroup.objects.find((o) => o.id === "c1")?.groupId,
    ).toBeUndefined();
    expect(
      afterUngroup.objects.find((o) => o.id === "c2")?.groupId,
    ).toBeUndefined();
  });

  it("moves nested sub-groups synchronously when parent group moves", () => {
    const parentCard: CanvasObject = {
      id: "pc",
      type: "storm",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      groupId: "parent-g",
    };
    const childCard: CanvasObject = {
      id: "cc",
      type: "storm",
      x: 200,
      y: 200,
      width: 100,
      height: 100,
      groupId: "child-g",
    };
    useCanvasStore.getState().addObjects([parentCard, childCard]);
    useCanvasStore.getState().setGroups([
      {
        id: "parent-g",
        name: "Parent Context",
        customBounds: { x: 40, y: 40, width: 400, height: 400 },
      },
      {
        id: "child-g",
        name: "Child Context",
        parentId: "parent-g",
        customBounds: { x: 180, y: 180, width: 150, height: 150 },
      },
    ]);

    useCanvasStore.getState().moveGroupObjects("parent-g", 30, 20);

    const state = useCanvasStore.getState();
    expect(state.objects.find((o) => o.id === "pc")?.x).toBe(80);
    expect(state.objects.find((o) => o.id === "pc")?.y).toBe(70);
    expect(state.objects.find((o) => o.id === "cc")?.x).toBe(230);
    expect(state.objects.find((o) => o.id === "cc")?.y).toBe(220);
    expect(state.groups.find((g) => g.id === "parent-g")?.customBounds?.x).toBe(
      70,
    );
    expect(state.groups.find((g) => g.id === "child-g")?.customBounds?.x).toBe(
      210,
    );
  });

  it("adds objects to an existing group and expands bounds (addToGroup)", () => {
    const card1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };
    const card2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 400,
      y: 200,
      width: 150,
      height: 100,
    };
    useCanvasStore.getState().addObjects([card1, card2]);
    const gid = useCanvasStore.getState().groupObjects(["c1"], "My Group");
    expect(gid).toBeDefined();

    const groupBefore = useCanvasStore.getState().groups[0];
    expect(groupBefore.name).toBe("My Group");
    expect(groupBefore.customBounds?.width).toBe(200 + 48);

    // Add card2 to the existing group
    useCanvasStore.getState().addToGroup(gid!, ["c2"]);

    const state = useCanvasStore.getState();
    const groupAfter = state.groups.find((g) => g.id === gid);
    expect(groupAfter?.name).toBe("My Group");
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBe(gid);

    // Bounds should now envelope both c1 (100..300, 100..200) and c2 (400..550, 200..300) with 24 padding
    // minX = 100-24=76, maxX = 550+24=574 => width = 498
    expect(groupAfter?.customBounds?.x).toBe(76);
    expect(groupAfter?.customBounds?.width).toBe(574 - 76);
  });

  it("removes objects from a group without destroying the group (removeFromGroup)", () => {
    const card1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };
    const card2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 350,
      y: 100,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([card1, card2]);
    const gid = useCanvasStore.getState().groupObjects(["c1", "c2"], "Keep Group");

    // Remove card2 from group
    useCanvasStore.getState().removeFromGroup(["c2"]);

    const state = useCanvasStore.getState();
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBeUndefined();
    expect(state.objects.find((o) => o.id === "c1")?.groupId).toBe(gid);
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].name).toBe("Keep Group");

    // Removing remaining member dissolves the group
    useCanvasStore.getState().removeFromGroup(["c1"]);
    expect(useCanvasStore.getState().groups).toHaveLength(0);
  });

  it("shrinks the source group immediately when a member moves to another group (addToGroup)", () => {
    const makeCard = (
      id: string,
      x: number,
      w: number,
    ): CanvasObject => ({
      id,
      type: "storm",
      x,
      y: 100,
      width: w,
      height: 100,
    });
    useCanvasStore.getState().addObjects([
      makeCard("c1", 100, 200),
      makeCard("c2", 400, 100),
      makeCard("c3", 1000, 100),
    ]);

    const groupA = useCanvasStore.getState().groupObjects(["c1", "c2"], "A")!;
    const groupB = useCanvasStore.getState().groupObjects(["c3"], "B")!;

    // Move c2 from group A into group B.
    useCanvasStore.getState().addToGroup(groupB, ["c2"]);

    const state = useCanvasStore.getState();
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBe(groupB);

    // Group A now only encloses c1 (100..300 => padded 76..324).
    const boundsA = state.groups.find((g) => g.id === groupA)?.customBounds;
    expect(boundsA).toEqual({ x: 76, y: 76, width: 248, height: 148 });

    // Group B now encloses c3 (1000..1100) and c2 (400..500).
    const boundsB = state.groups.find((g) => g.id === groupB)?.customBounds;
    expect(boundsB).toEqual({ x: 376, y: 76, width: 748, height: 148 });
  });

  it("dissolves a source group that loses its last member (addToGroup)", () => {
    useCanvasStore.getState().addObjects([
      { id: "c1", type: "storm", x: 100, y: 100, width: 200, height: 100 },
      { id: "c2", type: "storm", x: 400, y: 100, width: 100, height: 100 },
    ]);
    const source = useCanvasStore.getState().groupObjects(["c1"], "Source")!;
    const target = useCanvasStore.getState().groupObjects(["c2"], "Target")!;

    // c1 is the only member, so moving it out leaves the source group empty.
    useCanvasStore.getState().addToGroup(target, ["c1"]);

    const state = useCanvasStore.getState();
    expect(state.groups.find((g) => g.id === source)).toBeUndefined();
    expect(state.objects.find((o) => o.id === "c1")?.groupId).toBe(target);
  });

  it("shrinks both source groups when groupObjects creates a new group from their members", () => {
    useCanvasStore.getState().addObjects([
      { id: "c1", type: "storm", x: 0, y: 0, width: 100, height: 100 },
      { id: "c2", type: "storm", x: 200, y: 0, width: 100, height: 100 },
      { id: "c3", type: "storm", x: 1000, y: 0, width: 100, height: 100 },
      { id: "c4", type: "storm", x: 1200, y: 0, width: 100, height: 100 },
    ]);
    const groupA = useCanvasStore.getState().groupObjects(["c1", "c2"], "A")!;
    const groupB = useCanvasStore.getState().groupObjects(["c3", "c4"], "B")!;

    // c2 (from A) and c3 (from B) form a brand-new group.
    const merged = useCanvasStore
      .getState()
      .groupObjects(["c2", "c3"], "Merged")!;
    expect(merged).not.toBe(groupA);
    expect(merged).not.toBe(groupB);

    const state = useCanvasStore.getState();
    expect(
      state.groups.find((g) => g.id === groupA)?.customBounds,
    ).toEqual({ x: -24, y: -24, width: 148, height: 148 });
    expect(
      state.groups.find((g) => g.id === groupB)?.customBounds,
    ).toEqual({ x: 1176, y: -24, width: 148, height: 148 });
    expect(
      state.groups.find((g) => g.id === merged)?.customBounds,
    ).toEqual({ x: 176, y: -24, width: 948, height: 148 });
  });

  it("shrinks a group when a single member is detached via ungroupObjects", () => {
    useCanvasStore.getState().addObjects([
      { id: "c1", type: "storm", x: 100, y: 100, width: 200, height: 100 },
      { id: "c2", type: "storm", x: 400, y: 100, width: 100, height: 100 },
    ]);
    const gid = useCanvasStore
      .getState()
      .groupObjects(["c1", "c2"], "Keep")!;

    // Selecting just c2 and "ungrouping" detaches it but keeps the group.
    useCanvasStore.getState().ungroupObjects(["c2"]);

    const state = useCanvasStore.getState();
    expect(state.groups.find((g) => g.id === gid)?.customBounds).toEqual({
      x: 76,
      y: 76,
      width: 248,
      height: 148,
    });
  });

  it("smart groupObjects: merges unassigned card when group is selected along with card", () => {
    const card1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };
    const card2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 350,
      y: 100,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([card1, card2]);
    const gid = useCanvasStore.getState().groupObjects(["c1"], "Existing Service");

    // User selects the group AND card2, then presses Cmd+G (groupObjects())
    useCanvasStore.getState().setSelectedIds([`__group:${gid}`, "c2"]);
    const returnedGid = useCanvasStore.getState().groupObjects();

    expect(returnedGid).toBe(gid);
    const state = useCanvasStore.getState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].name).toBe("Existing Service");
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBe(gid);
    expect(state.selectedIds).toEqual([`__group:${gid}`]);
  });

  it("smart groupObjects: merges unassigned card when card in group is selected with unassigned card", () => {
    const card1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };
    const card2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 350,
      y: 100,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([card1, card2]);
    const gid = useCanvasStore.getState().groupObjects(["c1"], "Payment Group");

    // User selects card1 (in group) AND card2 (unassigned), then triggers groupObjects()
    useCanvasStore.getState().setSelectedIds(["c1", "c2"]);
    const returnedGid = useCanvasStore.getState().groupObjects();

    expect(returnedGid).toBe(gid);
    const state = useCanvasStore.getState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].name).toBe("Payment Group");
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBe(gid);
  });

  it("handles moveRow and deleteSelectedRow", () => {
    const card: CanvasObject = {
      id: "storm-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 260,
      height: 150,
      stormData: {
        kind: "command",
        name: "CreateOrder",
        fields: [
          { id: "f1", name: "id", fieldType: "uuid" },
          { id: "f2", name: "amount", fieldType: "number" },
          { id: "f3", name: "currency", fieldType: "string" },
        ],
      },
    };
    useCanvasStore.getState().addObject(card);
    useCanvasStore
      .getState()
      .setStormSelectedField({ objectId: "storm-1", fieldId: "f2" });

    // Move f2 up
    useCanvasStore.getState().moveRow("storm-1", "f2", "up");
    let state = useCanvasStore.getState();
    expect(state.objects[0].stormData?.fields.map((f) => f.id)).toEqual([
      "f2",
      "f1",
      "f3",
    ]);

    // Delete selected storm field
    useCanvasStore.getState().deleteSelectedStormField();
    state = useCanvasStore.getState();
    expect(state.objects[0].stormData?.fields.map((f) => f.id)).toEqual([
      "f1",
      "f3",
    ]);
    expect(state.stormSelectedField).toBeNull();
  });

  it("handles copySelectedFields and pasteFields", () => {
    const cardA: CanvasObject = {
      id: "storm-A",
      type: "storm",
      x: 100,
      y: 100,
      width: 260,
      height: 150,
      stormData: {
        kind: "event",
        name: "OrderPlaced",
        fields: [
          { id: "fa1", name: "orderId", fieldType: "uuid", tag: "order" },
        ],
      },
    };
    const cardB: CanvasObject = {
      id: "storm-B",
      type: "storm",
      x: 400,
      y: 100,
      width: 260,
      height: 150,
      stormData: {
        kind: "state",
        name: "OrderState",
        fields: [],
      },
    };
    useCanvasStore.getState().addObjects([cardA, cardB]);

    // Select fa1 on cardA and copy
    useCanvasStore
      .getState()
      .setStormSelectedField({ objectId: "storm-A", fieldId: "fa1" });
    useCanvasStore.getState().copySelectedFields();

    expect(useCanvasStore.getState().fieldClipboard?.entries).toHaveLength(1);
    expect(useCanvasStore.getState().fieldClipboard?.entries[0].name).toBe(
      "orderId",
    );

    // Paste into cardB (State/Constraint paste into the OUTPUT band by default)
    useCanvasStore.getState().pasteFields("storm-B");
    const updatedB = useCanvasStore
      .getState()
      .objects.find((o) => o.id === "storm-B");
    expect(updatedB?.stormData?.outputFields).toHaveLength(1);
    expect(updatedB?.stormData?.outputFields?.[0].name).toBe("orderId");
    expect(updatedB?.stormData?.outputFields?.[0].tag).toBe("order");
  });

  it("routes addStormField to input/output bands on State and Constraint cards", () => {
    const state: CanvasObject = {
      id: "storm-S",
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 150,
      stormData: { kind: "state", name: "OrderState", fields: [] },
    };
    useCanvasStore.getState().addObjects([state]);

    const inputId = useCanvasStore
      .getState()
      .addStormField("storm-S", "params");
    const outputId = useCanvasStore
      .getState()
      .addStormField("storm-S", "response");

    const updated = useCanvasStore
      .getState()
      .objects.find((o) => o.id === "storm-S");
    expect(updated?.stormData?.fields).toEqual([]);
    expect(updated?.stormData?.inputFields?.map((f) => f.id)).toEqual([
      inputId,
    ]);
    expect(updated?.stormData?.outputFields?.map((f) => f.id)).toEqual([
      outputId,
    ]);
  });

  it("handles alignObjects, distributeObjects, and arrangeLanes", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      stormData: { kind: "command", name: "C1", fields: [] },
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 300,
      y: 200,
      width: 200,
      height: 100,
      stormData: { kind: "event", name: "C2", fields: [] },
    };
    const c3: CanvasObject = {
      id: "c3",
      type: "storm",
      x: 700,
      y: 300,
      width: 200,
      height: 100,
      stormData: { kind: "actor", name: "C3", fields: [] },
    };

    useCanvasStore.getState().addObjects([c1, c2, c3]);
    useCanvasStore.getState().setSelectedIds(["c1", "c2", "c3"]);

    // Align top
    useCanvasStore.getState().alignObjects("top");
    let objs = useCanvasStore.getState().objects;
    expect(objs.find((o) => o.id === "c1")?.y).toBe(100);
    expect(objs.find((o) => o.id === "c2")?.y).toBe(100);
    expect(objs.find((o) => o.id === "c3")?.y).toBe(100);

    // Arrange lanes: Actor (c3) -> Command (c1) -> Event (c2)
    useCanvasStore.getState().arrangeLanes();
    objs = useCanvasStore.getState().objects;
    const actorObj = objs.find((o) => o.id === "c3");
    const cmdObj = objs.find((o) => o.id === "c1");
    const evtObj = objs.find((o) => o.id === "c2");

    expect(actorObj!.x).toBeLessThan(cmdObj!.x);
    expect(cmdObj!.x).toBeLessThan(evtObj!.x);
  });

  it("handles cascading model popups correctly", () => {
    // Level 0: open popup for Model A
    useCanvasStore.getState().openModelPopup({
      modelId: "model-a",
      level: 0,
      anchorRect: { x: 200, y: 100, width: 0, height: 26 },
      sourceFieldName: "user",
      sourceFieldType: "User",
    });

    let chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(1);
    expect(chain[0].modelId).toBe("model-a");
    expect(chain[0].level).toBe(0);

    // Level 1: open popup for Model B from Model A
    useCanvasStore.getState().openModelPopup({
      modelId: "model-b",
      level: 1,
      anchorRect: { x: 450, y: 130, width: 0, height: 26 },
      sourceFieldName: "address",
      sourceFieldType: "Address",
    });

    chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(2);
    expect(chain[1].modelId).toBe("model-b");
    expect(chain[1].level).toBe(1);

    // Level 2: open popup for Model C from Model B
    useCanvasStore.getState().openModelPopup({
      modelId: "model-c",
      level: 2,
      anchorRect: { x: 700, y: 160, width: 0, height: 26 },
      sourceFieldName: "city",
      sourceFieldType: "City",
    });

    chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(3);

    // Opening another Level 1 popup replaces level 1 & 2
    useCanvasStore.getState().openModelPopup({
      modelId: "model-d",
      level: 1,
      anchorRect: { x: 450, y: 180, width: 0, height: 26 },
      sourceFieldName: "profile",
      sourceFieldType: "Profile",
    });

    chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(2);
    expect(chain[0].modelId).toBe("model-a");
    expect(chain[1].modelId).toBe("model-d");

    // Close level 1 closes level 1
    useCanvasStore.getState().closeModelPopup(1);
    chain = useCanvasStore.getState().modelPopupChain;
    expect(chain).toHaveLength(1);
    expect(chain[0].modelId).toBe("model-a");

    // Clear all popups
    useCanvasStore.getState().clearModelPopups();
    expect(useCanvasStore.getState().modelPopupChain).toHaveLength(0);
  });

  it("expands and shrinks a group's bounds when a member moves (moveObjects)", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 300,
      y: 100,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2]);
    const gid = useCanvasStore.getState().groupObjects(["c1", "c2"], "G")!;

    // Content spans x 100..400 with 24 padding on each side.
    expect(useCanvasStore.getState().groups[0].customBounds).toEqual({
      x: 76,
      y: 76,
      width: 400 - 100 + 48,
      height: 200 - 100 + 48,
    });

    // Drag a member far to the right -> boundary grows to keep enclosing it.
    useCanvasStore.getState().moveObjects(["c2"], 300, 0, false);
    let group = useCanvasStore.getState().groups.find((g) => g.id === gid)!;
    expect(group.customBounds?.x).toBe(76);
    expect(group.customBounds?.width).toBe(700 - 100 + 48);

    // Drag it back inward -> boundary shrinks again.
    useCanvasStore.getState().moveObjects(["c2"], -300, 0, false);
    group = useCanvasStore.getState().groups.find((g) => g.id === gid)!;
    expect(group.customBounds?.width).toBe(400 - 100 + 48);
  });

  it("updates group bounds when a member is dragged via updateObjects", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 300,
      y: 100,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2]);
    const gid = useCanvasStore.getState().groupObjects(["c1", "c2"], "G")!;

    // Dragging c1 up/left to (0, 50) must grow the boundary upward and leftward.
    useCanvasStore.getState().updateObjects([
      { id: "c1", patch: { x: 0, y: 50 } },
    ]);

    const group = useCanvasStore.getState().groups.find((g) => g.id === gid)!;
    expect(group.customBounds).toEqual({
      x: 0 - 24,
      y: 50 - 24,
      width: 400 - 0 + 48,
      height: 200 - 50 + 48,
    });
  });

  it("recomputes nested child and parent bounds when a nested member moves", () => {
    useCanvasStore.getState().addObjects([
      {
        id: "pc",
        type: "storm",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        groupId: "parent-g",
      },
      {
        id: "cc",
        type: "storm",
        x: 200,
        y: 200,
        width: 100,
        height: 100,
        groupId: "child-g",
      },
    ]);
    useCanvasStore.getState().setGroups([
      {
        id: "parent-g",
        name: "Parent",
        customBounds: { x: 26, y: 26, width: 422, height: 322 },
      },
      {
        id: "child-g",
        name: "Child",
        parentId: "parent-g",
        customBounds: { x: 176, y: 176, width: 148, height: 148 },
      },
    ]);

    // Move the child's member right by 100 -> child grows, parent follows.
    useCanvasStore.getState().moveObjects(["cc"], 100, 0, false);

    const state = useCanvasStore.getState();
    const child = state.groups.find((g) => g.id === "child-g")!;
    const parent = state.groups.find((g) => g.id === "parent-g")!;

    expect(child.customBounds).toEqual({
      x: 300 - 24,
      y: 200 - 24,
      width: 100 + 48,
      height: 100 + 48,
    });
    // Parent encloses its member (50..150) and the child (276..424).
    expect(parent.customBounds).toEqual({
      x: 50 - 24,
      y: 50 - 24,
      width: 424 - 50 + 48,
      height: 324 - 50 + 48,
    });
  });

  it("recomputes and shrinks group bounds when a member is deleted via deleteObjects", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 500,
      y: 100,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2]);
    const gid = useCanvasStore.getState().groupObjects(["c1", "c2"], "Group A")!;

    // Initial bounds enclose both c1 (100..200) and c2 (500..600)
    let group = useCanvasStore.getState().groups.find((g) => g.id === gid)!;
    expect(group.customBounds).toEqual({
      x: 100 - 24,
      y: 100 - 24,
      width: 600 - 100 + 48,
      height: 200 - 100 + 48,
    });

    // Delete c2 (the rightmost member) -> group boundary should shrink to enclose only c1
    useCanvasStore.getState().deleteObjects(["c2"]);

    group = useCanvasStore.getState().groups.find((g) => g.id === gid)!;
    expect(group).toBeDefined();
    expect(group.customBounds).toEqual({
      x: 100 - 24,
      y: 100 - 24,
      width: 100 + 48,
      height: 100 + 48,
    });
  });

  it("automatically removes empty group when all member objects are deleted via deleteObjects", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1]);
    const gid = useCanvasStore.getState().groupObjects(["c1"], "Solitary Group")!;

    expect(useCanvasStore.getState().groups.some((g) => g.id === gid)).toBe(true);

    // Delete the only member
    useCanvasStore.getState().deleteObjects(["c1"]);

    // Group should be removed
    expect(useCanvasStore.getState().groups.some((g) => g.id === gid)).toBe(false);
  });

  it("recomputes group bounds when an object is added with groupId via addObject or addObjects", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1]);
    const gid = useCanvasStore.getState().groupObjects(["c1"], "My Section")!;

    let group = useCanvasStore.getState().groups.find((g) => g.id === gid)!;
    expect(group.customBounds).toEqual({
      x: 100 - 24,
      y: 100 - 24,
      width: 100 + 48,
      height: 100 + 48,
    });

    // Add a new object via addObject with groupId
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      groupId: gid,
    };
    useCanvasStore.getState().addObject(c2);

    group = useCanvasStore.getState().groups.find((g) => g.id === gid)!;
    expect(group.customBounds).toEqual({
      x: 100 - 24,
      y: 100 - 24,
      width: 400 - 100 + 48,
      height: 100 + 48,
    });

    // Add another object via addObjects with groupId
    const c3: CanvasObject = {
      id: "c3",
      type: "storm",
      x: 500,
      y: 100,
      width: 100,
      height: 100,
      groupId: gid,
    };
    useCanvasStore.getState().addObjects([c3]);

    group = useCanvasStore.getState().groups.find((g) => g.id === gid)!;
    expect(group.customBounds).toEqual({
      x: 100 - 24,
      y: 100 - 24,
      width: 600 - 100 + 48,
      height: 100 + 48,
    });
  });
});

