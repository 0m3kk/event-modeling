import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore, undo, redo, clearHistory } from "./index";
import type { CanvasObject } from "@/types";
import { createLineObject } from "@/utils/lineGeometry";

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

  it("updates storm query item sets", () => {
    // Query item set update
    const stateObj: CanvasObject = {
      id: "st-1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      stormData: {
        kind: "state",
        name: "OrderState",
        fields: [],
        outputFields: [{ id: "out-1", name: "total", fieldType: "Number" }],
        queryItems: [{ id: "qi-1", types: ["OrderPlaced"], tagFieldIds: [] }],
      },
    };
    useCanvasStore.getState().addObject(stateObj);

    useCanvasStore.getState().updateStormQueryItemSet("st-1", "qi-1", { total: "event.total" });
    const updatedSt = useCanvasStore.getState().objects.find((o) => o.id === "st-1")!;
    expect(updatedSt.stormData?.queryItems?.[0].set).toEqual({ total: "event.total" });
  });

  it("updates projectName and preserves it across object edits", () => {
    useCanvasStore.getState().setProjectName("My Architecture Board");
    expect(useCanvasStore.getState().projectName).toBe("My Architecture Board");

    // Resetting board with a new project name updates it
    useCanvasStore.getState().resetBoard([], [], "Loaded Project");
    expect(useCanvasStore.getState().projectName).toBe("Loaded Project");

    useCanvasStore.getState().setTool("line");
    useCanvasStore.getState().resetBoard();
    expect(useCanvasStore.getState().projectName).toBe("Untitled");
    expect(useCanvasStore.getState().tool).toBe("select");
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

  it("adopts separator lines drawn across a slice when grouping it", () => {
    const command: CanvasObject = {
      id: "cmd",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };
    const event: CanvasObject = {
      id: "evt",
      type: "storm",
      x: 100,
      y: 400,
      width: 200,
      height: 100,
    };
    const acrossLine = createLineObject(
      "line-1",
      { x: 60, y: 300 },
      { x: 340, y: 300 },
    );
    // A separator belonging to a different slice stays out of this group.
    const farLine = createLineObject(
      "line-2",
      { x: 600, y: 300 },
      { x: 880, y: 300 },
    );
    useCanvasStore.getState().addObjects([command, event, acrossLine, farLine]);

    const gid = useCanvasStore
      .getState()
      .groupObjects(["cmd", "evt"], "Write Slice")!;
    const state = useCanvasStore.getState();

    expect(state.objects.find((o) => o.id === "line-1")?.groupId).toBe(gid);
    expect(state.objects.find((o) => o.id === "line-2")?.groupId).toBeUndefined();

    // The frame now spans the separator (60..340), not just the cards (100..300).
    const bounds = state.groups.find((g) => g.id === gid)?.customBounds;
    expect(bounds?.x).toBe(36);
    expect(bounds?.width).toBe(340 - 60 + 48);
  });

  it("adopts separator lines when adding members to an existing group (addToGroup)", () => {
    const command: CanvasObject = {
      id: "cmd",
      type: "storm",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };
    const event: CanvasObject = {
      id: "evt",
      type: "storm",
      x: 100,
      y: 400,
      width: 200,
      height: 100,
    };
    const separator = createLineObject(
      "line-1",
      { x: 60, y: 300 },
      { x: 340, y: 300 },
    );
    useCanvasStore.getState().addObjects([command, event, separator]);

    const gid = useCanvasStore.getState().groupObjects(["cmd"], "Write Slice")!;
    // The line sits outside the single-card section, so it stays free.
    expect(
      useCanvasStore.getState().objects.find((o) => o.id === "line-1")?.groupId,
    ).toBeUndefined();

    useCanvasStore.getState().addToGroup(gid, ["evt"]);

    const state = useCanvasStore.getState();
    expect(state.objects.find((o) => o.id === "line-1")?.groupId).toBe(gid);
    const bounds = state.groups.find((g) => g.id === gid)?.customBounds;
    expect(bounds?.x).toBe(36);
    expect(bounds?.width).toBe(340 - 60 + 48);
  });

  it("createSlice creates a vertical slice with domain tag and links root Command", () => {
    const cmd: CanvasObject = {
      id: "cmd-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 260,
      height: 120,
      stormData: {
        kind: "command",
        name: "Place Order",
        fields: [],
      },
    };
    const evt: CanvasObject = {
      id: "evt-1",
      type: "storm",
      x: 100,
      y: 300,
      width: 260,
      height: 100,
      stormData: {
        kind: "event",
        name: "Order Placed",
        fields: [],
      },
    };
    useCanvasStore.getState().addObjects([cmd, evt]);

    const sliceId = useCanvasStore.getState().createSlice({
      objectIds: ["cmd-1", "evt-1"],
      name: "Place Order Slice",
      domain: "Order",
    });

    expect(sliceId).toBeDefined();
    const state = useCanvasStore.getState();
    const slice = state.groups.find((g) => g.id === sliceId);
    expect(slice).toBeDefined();
    expect(slice?.isSlice).toBe(true);
    expect(slice?.name).toBe("Place Order Slice");
    expect(slice?.domain).toBe("Order");
    expect(slice?.tag).toBe("Order");
    expect(slice?.commandOrQueryId).toBe("cmd-1");
    expect(slice?.commandOrQueryName).toBe("Place Order");
    expect(state.objects.find((o) => o.id === "cmd-1")?.groupId).toBe(sliceId);
    expect(state.objects.find((o) => o.id === "evt-1")?.groupId).toBe(sliceId);
  });

  it("createSlice auto-detects name and command when name is omitted", () => {
    const cmd: CanvasObject = {
      id: "cmd-cancel",
      type: "storm",
      x: 100,
      y: 100,
      width: 260,
      height: 120,
      stormData: {
        kind: "command",
        name: "Cancel Order",
        fields: [],
      },
    };
    useCanvasStore.getState().addObjects([cmd]);

    const sliceId = useCanvasStore.getState().createSlice({
      objectIds: ["cmd-cancel"],
    });

    expect(sliceId).toBeDefined();
    const slice = useCanvasStore.getState().groups.find((g) => g.id === sliceId);
    expect(slice?.name).toBe("Cancel Order Slice");
    expect(slice?.commandOrQueryId).toBe("cmd-cancel");
  });

  it("createSlice can create an independent slice without any child objects", () => {
    useCanvasStore.getState().resetBoard();
    const sliceId = useCanvasStore.getState().createSlice({
      name: "Empty Order Slice",
      domain: "Order",
    });

    expect(sliceId).toBeDefined();
    const state = useCanvasStore.getState();
    const slice = state.groups.find((g) => g.id === sliceId);
    expect(slice).toBeDefined();
    expect(slice?.isSlice).toBe(true);
    expect(slice?.name).toBe("Empty Order Slice");
    expect(slice?.domain).toBe("Order");
    expect(slice?.customBounds).toBeDefined();
    expect(slice?.customBounds?.width).toBe(320);
    expect(slice?.customBounds?.height).toBe(240);
    expect(state.selectedIds).toEqual([`__group:${sliceId}`]);
  });

  it("a slice remains intact when its member objects are removed or deleted, unlike standard groups", () => {
    useCanvasStore.getState().resetBoard();
    const cmd: CanvasObject = {
      id: "cmd-order",
      type: "storm",
      x: 100,
      y: 100,
      width: 260,
      height: 120,
      stormData: { kind: "command", name: "Create Order", fields: [] },
    };
    useCanvasStore.getState().addObject(cmd);

    const sliceId = useCanvasStore.getState().createSlice({
      objectIds: ["cmd-order"],
      name: "Order Slice",
      domain: "Order",
    });
    expect(sliceId).toBeDefined();

    // Now remove the object from the group/slice
    useCanvasStore.getState().removeFromGroup(["cmd-order"]);

    // Slice still exists even with 0 members!
    const state = useCanvasStore.getState();
    const slice = state.groups.find((g) => g.id === sliceId);
    expect(slice).toBeDefined();
    expect(slice?.name).toBe("Order Slice");

    // Standard group behavior for comparison:
    useCanvasStore.getState().groupObjects(["cmd-order"], "Temp Group");
    const tempGroup = useCanvasStore.getState().groups.find((g) => g.name === "Temp Group");
    expect(tempGroup).toBeDefined();
    useCanvasStore.getState().removeFromGroup(["cmd-order"]);
    // Standard group dissolves when empty:
    expect(useCanvasStore.getState().groups.find((g) => g.id === tempGroup?.id)).toBeUndefined();
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

    // Move c2 from group A into group B. c2 sat far from group B's only member
    // (c3), so it is pulled back next to it instead of ballooning the frame.
    useCanvasStore.getState().addToGroup(groupB, ["c2"]);

    const state = useCanvasStore.getState();
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBe(groupB);
    expect(state.objects.find((o) => o.id === "c2")?.x).toBe(1140);

    // Group A now only encloses c1 (100..300 => padded 76..324).
    const boundsA = state.groups.find((g) => g.id === groupA)?.customBounds;
    expect(boundsA).toEqual({ x: 76, y: 76, width: 248, height: 148 });

    // Group B encloses c3 (1000..1100) and the snapped c2 (1140..1240).
    const boundsB = state.groups.find((g) => g.id === groupB)?.customBounds;
    expect(boundsB).toEqual({ x: 976, y: 76, width: 288, height: 148 });
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

  it("snaps a far new member next to the group cluster (addToGroup)", () => {
    useCanvasStore.getState().addObjects([
      { id: "a", type: "storm", x: 100, y: 100, width: 200, height: 100 },
      { id: "b", type: "storm", x: 5000, y: 100, width: 200, height: 100 },
    ]);
    const gid = useCanvasStore.getState().groupObjects(["a"], "Actors")!;

    useCanvasStore.getState().addToGroup(gid, ["b"]);

    const state = useCanvasStore.getState();
    // b is pulled to the right of a (ends at 300) with the placement padding.
    expect(state.objects.find((o) => o.id === "b")?.x).toBe(340);
    // Compact frame around both members, not spanning out to x=5000.
    const bounds = state.groups.find((g) => g.id === gid)?.customBounds;
    expect(bounds?.width).toBe(440 + 48);
  });

  it("refits a group's separator lines when a member is resized (updateObject)", () => {
    const cmd: CanvasObject = {
      id: "cmd",
      type: "storm",
      x: 100,
      y: 0,
      width: 200,
      height: 100,
    };
    const con: CanvasObject = {
      id: "con",
      type: "storm",
      x: 100,
      y: 200,
      width: 200,
      height: 100,
    };
    const evt: CanvasObject = {
      id: "evt",
      type: "storm",
      x: 100,
      y: 400,
      width: 200,
      height: 100,
    };
    const line1 = createLineObject("l1", { x: 60, y: 150 }, { x: 340, y: 150 });
    const line2 = createLineObject("l2", { x: 60, y: 350 }, { x: 340, y: 350 });
    useCanvasStore.getState().addObjects([cmd, con, evt, line1, line2]);
    useCanvasStore
      .getState()
      .groupObjects(["cmd", "con", "evt", "l1", "l2"], "Slice");

    useCanvasStore.getState().updateObject("con", { height: 250 });

    const state = useCanvasStore.getState();
    expect(state.objects.find((o) => o.id === "l1")?.y).toBe(150);
    // con now ends at y=450, past evt's top (400): pin the line below it.
    expect(state.objects.find((o) => o.id === "l2")?.y).toBe(456);
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

  it("copies and pastes selected cards as independent duplicates", () => {
    const cardA: CanvasObject = {
      id: "storm-A",
      type: "storm",
      x: 100,
      y: 100,
      width: 260,
      height: 150,
      stormData: { kind: "event", name: "OrderPlaced", fields: [] },
    };
    const cardB: CanvasObject = {
      id: "model-B",
      type: "model",
      x: 400,
      y: 100,
      width: 220,
      height: 120,
      modelData: { kind: "object", name: "Order", fields: [] },
    };
    useCanvasStore.getState().addObjects([cardA, cardB]);
    useCanvasStore.getState().setSelectedIds(["storm-A", "model-B"]);

    useCanvasStore.getState().copySelectedObjects();
    expect(useCanvasStore.getState().objectClipboard?.objects).toHaveLength(2);

    useCanvasStore.getState().pasteObjects();
    const state = useCanvasStore.getState();
    expect(state.objects).toHaveLength(4);
    expect(state.selectedIds).toHaveLength(2);

    const pastedA = state.objects.find((o) => o.id === state.selectedIds[0]!);
    const pastedB = state.objects.find((o) => o.id === state.selectedIds[1]!);
    expect(pastedA?.id).not.toBe("storm-A");
    // Pasted titles dedupe against the board.
    expect(pastedA?.stormData?.name).toBe("OrderPlaced 2");
    expect(pastedB?.modelData?.name).toBe("Order 2");
    // Placement is offset from the source.
    expect(pastedA?.x).toBe(132);

    // The sources are untouched.
    expect(
      state.objects.find((o) => o.id === "storm-A")?.stormData?.name,
    ).toBe("OrderPlaced");

    // A second paste steps the offset so copies do not stack.
    useCanvasStore.getState().pasteObjects();
    const again = useCanvasStore.getState();
    const secondA = again.objects.find((o) => o.id === again.selectedIds[0]!);
    expect(secondA?.x).toBe(164);
  });

  it("copies a group together with its members", () => {
    const card: CanvasObject = {
      id: "storm-A",
      type: "storm",
      x: 100,
      y: 100,
      width: 260,
      height: 150,
      stormData: { kind: "event", name: "OrderPlaced", fields: [] },
      groupId: "g1",
    };
    useCanvasStore.getState().addGroup({ id: "g1", name: "Flow" });
    useCanvasStore.getState().addObjects([card]);
    useCanvasStore.getState().setSelectedIds(["__group:g1"]);

    useCanvasStore.getState().copySelectedObjects();
    useCanvasStore.getState().pasteObjects();

    const state = useCanvasStore.getState();
    expect(state.objects).toHaveLength(2);
    expect(state.groups).toHaveLength(2);
    const pastedCard = state.objects.find((o) => o.id === state.selectedIds[0]!);
    expect(pastedCard?.groupId).toBeDefined();
    expect(pastedCard?.groupId).not.toBe("g1");
    expect(state.groups.some((g) => g.id === pastedCard?.groupId)).toBe(true);
  });

  it("keeps the field and object clipboards mutually exclusive", () => {
    const card: CanvasObject = {
      id: "storm-A",
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 150,
      stormData: {
        kind: "event",
        name: "OrderPlaced",
        fields: [{ id: "f1", name: "id", fieldType: "uuid" }],
      },
    };
    useCanvasStore.getState().addObjects([card]);

    useCanvasStore
      .getState()
      .setStormSelectedField({ objectId: "storm-A", fieldId: "f1" });
    useCanvasStore.getState().copySelectedFields();
    expect(useCanvasStore.getState().fieldClipboard).not.toBeNull();
    expect(useCanvasStore.getState().objectClipboard).toBeNull();

    useCanvasStore.getState().setSelectedIds(["storm-A"]);
    useCanvasStore.getState().copySelectedObjects();
    expect(useCanvasStore.getState().fieldClipboard).toBeNull();
    expect(useCanvasStore.getState().objectClipboard).not.toBeNull();
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

  it("adds, updates, reorders and deletes BDD scenario steps", () => {
    const bddCard: CanvasObject = {
      id: "bdd-A",
      type: "storm",
      x: 0,
      y: 0,
      width: 260,
      height: 120,
      stormData: { kind: "bdd", name: "Given", phase: "given", fields: [] },
    };
    useCanvasStore.getState().addObjects([bddCard]);

    // Default ref follows the phase (Given => event).
    const step1 = useCanvasStore.getState().addBddStep("bdd-A")!;
    const step2 = useCanvasStore.getState().addBddStep("bdd-A")!;
    let updated = useCanvasStore
      .getState()
      .objects.find((o) => o.id === "bdd-A");
    expect(updated?.stormData?.steps?.map((s) => s.id)).toEqual([step1, step2]);
    expect(updated?.stormData?.steps?.every((s) => s.ref === "event")).toBe(
      true,
    );
    // A new step is selected so the options bar can edit it.
    expect(useCanvasStore.getState().stormSelectedField).toEqual({
      objectId: "bdd-A",
      fieldId: step2,
    });

    // Update name + payload.
    useCanvasStore.getState().updateBddStep("bdd-A", step1, {
      name: "OrderPlaced",
      payload: [{ id: "p1", key: "orderId", value: "42" }],
    });
    updated = useCanvasStore.getState().objects.find((o) => o.id === "bdd-A");
    expect(updated?.stormData?.steps?.[0].name).toBe("OrderPlaced");
    expect(updated?.stormData?.steps?.[0].payload).toHaveLength(1);

    // Reorder then delete via the selected-row path.
    useCanvasStore.getState().moveRow("bdd-A", step1, "down");
    updated = useCanvasStore.getState().objects.find((o) => o.id === "bdd-A");
    expect(updated?.stormData?.steps?.map((s) => s.id)).toEqual([step2, step1]);

    useCanvasStore
      .getState()
      .setStormSelectedField({ objectId: "bdd-A", fieldId: step1 });
    useCanvasStore.getState().deleteSelectedStormField();
    updated = useCanvasStore.getState().objects.find((o) => o.id === "bdd-A");
    expect(updated?.stormData?.steps?.map((s) => s.id)).toEqual([step2]);
    expect(useCanvasStore.getState().stormSelectedField).toBeNull();
  });

  it("tracks the BDD step popover and clears it on selection changes", () => {
    expect(useCanvasStore.getState().bddStepPopup).toBeNull();
    useCanvasStore.getState().setBddStepPopup({ objectId: "bdd-A" });
    expect(useCanvasStore.getState().bddStepPopup).toEqual({
      objectId: "bdd-A",
    });

    // Selecting a different card drops the stale popup target.
    useCanvasStore.getState().selectObject("other-card");
    expect(useCanvasStore.getState().bddStepPopup).toBeNull();

    useCanvasStore.getState().setBddStepPopup({ objectId: "bdd-A" });
    useCanvasStore.getState().clearSelection();
    expect(useCanvasStore.getState().bddStepPopup).toBeNull();

    useCanvasStore.getState().resetBoard();
    expect(useCanvasStore.getState().bddStepPopup).toBeNull();
  });

  it("tracks the QueryItem popover and clears it on selection changes", () => {
    expect(useCanvasStore.getState().queryItemPopup).toBeNull();
    useCanvasStore.getState().setQueryItemPopup({ objectId: "card-A", queryItemId: "qi-1" });
    expect(useCanvasStore.getState().queryItemPopup).toEqual({
      objectId: "card-A",
      queryItemId: "qi-1",
    });

    // Selecting a different card drops the stale popup target.
    useCanvasStore.getState().selectObject("other-card");
    expect(useCanvasStore.getState().queryItemPopup).toBeNull();

    useCanvasStore.getState().setQueryItemPopup({ objectId: "card-A" });
    useCanvasStore.getState().clearSelection();
    expect(useCanvasStore.getState().queryItemPopup).toBeNull();

    useCanvasStore.getState().setQueryItemPopup({ objectId: "card-A" });
    useCanvasStore.getState().resetBoard();
    expect(useCanvasStore.getState().queryItemPopup).toBeNull();
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

  it("arrangeSlice re-centers a slice's layers and leaves non-members put", () => {
    const cmd: CanvasObject = {
      id: "cmd",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      stormData: { kind: "command", name: "Place Order", fields: [] },
    };
    const cst: CanvasObject = {
      id: "cst",
      type: "storm",
      x: 500,
      y: 200,
      width: 300,
      height: 80,
      stormData: { kind: "constraint", name: "Check Stock", fields: [] },
    };
    const evt: CanvasObject = {
      id: "evt",
      type: "storm",
      x: 800,
      y: 400,
      width: 120,
      height: 80,
      stormData: { kind: "event", name: "Order Placed", fields: [] },
    };
    const outsider: CanvasObject = {
      id: "outsider",
      type: "storm",
      x: 2000,
      y: 2000,
      width: 200,
      height: 80,
      stormData: { kind: "event", name: "Other", fields: [] },
    };

    useCanvasStore.getState().addObjects([cmd, cst, evt, outsider]);
    useCanvasStore.getState().arrangeSlice(["cmd", "cst", "evt"]);

    const objs = useCanvasStore.getState().objects;
    const cmd2 = objs.find((o) => o.id === "cmd")!;
    const cst2 = objs.find((o) => o.id === "cst")!;
    const evt2 = objs.find((o) => o.id === "evt")!;
    const out2 = objs.find((o) => o.id === "outsider")!;

    const center = (o: CanvasObject) => o.x + o.width / 2;
    // Every layer centers on the widest layer (the 300px constraint).
    expect(Math.round(center(cmd2))).toBe(Math.round(center(cst2)));
    expect(Math.round(center(evt2))).toBe(Math.round(center(cst2)));
    // Layers stack top-to-bottom.
    expect(cmd2.y).toBeLessThan(cst2.y);
    expect(cst2.y).toBeLessThan(evt2.y);
    // Anchored at the slice's current top-left.
    expect(cmd2.x).toBe(100);
    expect(cst2.x).toBe(0);
    expect(evt2.x).toBe(90);
    // Non-member stays untouched.
    expect(out2.x).toBe(2000);
    expect(out2.y).toBe(2000);
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

  it("creates a nested child group when grouping members of an existing group", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 200,
      y: 0,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2]);
    const parentId = useCanvasStore.getState().groupObjects(["c1", "c2"], "Parent")!;

    // Group both members of the existing group again -> a nested child group.
    const childId = useCanvasStore
      .getState()
      .groupObjects(["c1", "c2"], "Child")!;

    const state = useCanvasStore.getState();
    expect(childId).toBeDefined();
    expect(childId).not.toBe(parentId);
    expect(state.groups.find((g) => g.id === childId)?.parentId).toBe(parentId);
    expect(state.objects.find((o) => o.id === "c1")?.groupId).toBe(childId);
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBe(childId);
    expect(state.selectedIds).toEqual([`__group:${childId}`]);
    // Parent still exists and now encloses the child.
    expect(state.groups.some((g) => g.id === parentId)).toBe(true);
  });

  it("does not nest when the selection mixes assigned and unassigned cards", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2]);
    const groupId = useCanvasStore.getState().groupObjects(["c1"], "Group")!;

    // c1 is in the group, c2 is not -> merge c2 into the group (no nesting).
    useCanvasStore.getState().groupObjects(["c1", "c2"]);

    const state = useCanvasStore.getState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].id).toBe(groupId);
    expect(state.groups[0].parentId).toBeUndefined();
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBe(groupId);
  });

  it("nests two selected groups under a new parent group (group-in-group)", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2]);
    const groupA = useCanvasStore.getState().groupObjects(["c1"], "A")!;
    const groupB = useCanvasStore.getState().groupObjects(["c2"], "B")!;

    const parentId = useCanvasStore.getState().groupObjects(
      [`__group:${groupA}`, `__group:${groupB}`],
      "Parent",
    )!;

    expect(parentId).toBeDefined();
    const state = useCanvasStore.getState();
    expect(state.groups.find((g) => g.id === groupA)?.parentId).toBe(parentId);
    expect(state.groups.find((g) => g.id === groupB)?.parentId).toBe(parentId);
    expect(state.selectedIds).toEqual([`__group:${parentId}`]);

    // Parent bounds enclose both child groups (each padded by 24).
    expect(state.groups.find((g) => g.id === parentId)?.customBounds).toEqual({
      x: -24 - 24,
      y: -24 - 24,
      width: 524 - -24 + 48,
      height: 124 - -24 + 48,
    });
  });

  it("re-parents child groups to the root when their parent is ungrouped", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2]);
    const groupA = useCanvasStore.getState().groupObjects(["c1"], "A")!;
    const groupB = useCanvasStore.getState().groupObjects(["c2"], "B")!;
    const parentId = useCanvasStore.getState().groupObjects(
      [`__group:${groupA}`, `__group:${groupB}`],
      "Parent",
    )!;

    useCanvasStore.getState().ungroupObjects([`__group:${parentId}`]);

    const state = useCanvasStore.getState();
    expect(state.groups.some((g) => g.id === parentId)).toBe(false);
    expect(state.groups.find((g) => g.id === groupA)?.parentId).toBeUndefined();
    expect(state.groups.find((g) => g.id === groupB)?.parentId).toBeUndefined();
    // Members are untouched.
    expect(state.objects.find((o) => o.id === "c1")?.groupId).toBe(groupA);
    expect(state.objects.find((o) => o.id === "c2")?.groupId).toBe(groupB);
  });

  it("re-parents child groups when their parent is deleted via deleteObjects", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2]);
    const groupA = useCanvasStore.getState().groupObjects(["c1"], "A")!;
    const groupB = useCanvasStore.getState().groupObjects(["c2"], "B")!;
    const parentId = useCanvasStore.getState().groupObjects(
      [`__group:${groupA}`, `__group:${groupB}`],
      "Parent",
    )!;

    useCanvasStore.getState().deleteObjects([`__group:${parentId}`]);

    const state = useCanvasStore.getState();
    expect(state.groups.some((g) => g.id === parentId)).toBe(false);
    expect(state.groups.find((g) => g.id === groupA)?.parentId).toBeUndefined();
    expect(state.groups.find((g) => g.id === groupB)?.parentId).toBeUndefined();
    expect(state.groups.some((g) => g.id === groupA)).toBe(true);
    expect(state.groups.some((g) => g.id === groupB)).toBe(true);
  });

  it("removes connectors attached to a group when that group is deleted", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2]);
    const gid = useCanvasStore.getState().groupObjects(["c2"], "Target")!;

    const connector: CanvasObject = {
      id: "conn-1",
      type: "connector",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      connectorData: {
        start: { objectId: "c1", anchor: "right" },
        end: { objectId: gid, anchor: "left" },
      },
    };
    useCanvasStore.getState().addObject(connector);
    expect(
      useCanvasStore.getState().objects.some((o) => o.id === "conn-1"),
    ).toBe(true);

    useCanvasStore.getState().deleteObjects([`__group:${gid}`]);

    expect(
      useCanvasStore.getState().objects.some((o) => o.id === "conn-1"),
    ).toBe(false);
  });

  it("keeps a connector between two groups when an unrelated object is deleted", () => {
    const c1: CanvasObject = {
      id: "c1",
      type: "storm",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const c2: CanvasObject = {
      id: "c2",
      type: "storm",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
    };
    const c3: CanvasObject = {
      id: "c3",
      type: "storm",
      x: 800,
      y: 0,
      width: 100,
      height: 100,
    };
    useCanvasStore.getState().addObjects([c1, c2, c3]);
    const groupA = useCanvasStore.getState().groupObjects(["c1"], "A")!;
    const groupB = useCanvasStore.getState().groupObjects(["c2"], "B")!;

    const connector: CanvasObject = {
      id: "conn-1",
      type: "connector",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      connectorData: {
        start: { objectId: groupA, anchor: "right" },
        end: { objectId: groupB, anchor: "left" },
      },
    };
    useCanvasStore.getState().addObject(connector);

    useCanvasStore.getState().deleteObjects(["c3"]);

    expect(
      useCanvasStore.getState().objects.some((o) => o.id === "conn-1"),
    ).toBe(true);
  });

  it("adds and updates structured constraint rules via updateStormConstraint", () => {
    const card: CanvasObject = {
      id: "const-card-1",
      type: "storm",
      x: 100,
      y: 100,
      width: 250,
      height: 150,
      stormData: {
        kind: "constraint",
        name: "Check User",
        fields: [],
        inputFields: [{ id: "f1", name: "userId", fieldType: "uuid" }],
        outputFields: [{ id: "o1", name: "isDeleted", fieldType: "boolean" }],
        constraints: [],
      },
    };
    useCanvasStore.getState().addObject(card);

    const ruleId = useCanvasStore.getState().addStormConstraint("const-card-1")!;
    expect(ruleId).toBeDefined();

    let updated = useCanvasStore.getState().objects.find((o) => o.id === "const-card-1");
    expect(updated?.stormData?.constraints).toHaveLength(1);
    expect(updated?.stormData?.constraints?.[0]?.id).toBe(ruleId);

    // Update with structured codegen fields
    useCanvasStore.getState().updateStormConstraint("const-card-1", ruleId, {
      text: "User must exist and not be deleted",
      code: "USER_NOT_FOUND",
      assert: "output.userId != null && !output.isDeleted",
      message: "User account not found.",
      status: 404,
      severity: "error",
    });

    updated = useCanvasStore.getState().objects.find((o) => o.id === "const-card-1");
    const rule = updated?.stormData?.constraints?.[0];
    expect(rule?.text).toBe("User must exist and not be deleted");
    expect(rule?.code).toBe("USER_NOT_FOUND");
    expect(rule?.assert).toBe("output.userId != null && !output.isDeleted");
    expect(rule?.message).toBe("User account not found.");
    expect(rule?.status).toBe(404);
    expect(rule?.severity).toBe("error");
  });

  it("manages service card methods: add, update, move, delete", () => {
    const serviceCard: CanvasObject = {
      id: "srv-card-1",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 80,
      modelData: {
        kind: "service",
        name: "AuthService",
        methods: [],
      },
    };
    useCanvasStore.getState().addObject(serviceCard);

    // 1. Add method
    const m1 = useCanvasStore.getState().addServiceModelMethod("srv-card-1")!;
    expect(m1).toBeDefined();

    let card = useCanvasStore.getState().objects.find((o) => o.id === "srv-card-1");
    expect(card?.modelData?.methods).toHaveLength(1);
    expect(card?.modelData?.methods?.[0].id).toBe(m1);

    // 2. Update method
    useCanvasStore.getState().updateServiceModelMethod("srv-card-1", m1, {
      name: "hashPassword",
      params: [{ id: "p1", name: "password", paramType: "String" }],
      returnType: "String",
    });

    card = useCanvasStore.getState().objects.find((o) => o.id === "srv-card-1");
    expect(card?.modelData?.methods?.[0].name).toBe("hashPassword");
    expect(card?.modelData?.methods?.[0].params).toEqual([
      { id: "p1", name: "password", paramType: "String" },
    ]);
    expect(card?.modelData?.methods?.[0].returnType).toBe("String");

    // 3. Add second method & move row
    const m2 = useCanvasStore.getState().addServiceModelMethod("srv-card-1")!;
    useCanvasStore.getState().updateServiceModelMethod("srv-card-1", m2, {
      name: "verifyPassword",
    });

    card = useCanvasStore.getState().objects.find((o) => o.id === "srv-card-1");
    expect(card?.modelData?.methods?.[0].name).toBe("hashPassword");
    expect(card?.modelData?.methods?.[1].name).toBe("verifyPassword");

    useCanvasStore.getState().moveRow("srv-card-1", m2, "up");
    card = useCanvasStore.getState().objects.find((o) => o.id === "srv-card-1");
    expect(card?.modelData?.methods?.[0].name).toBe("verifyPassword");
    expect(card?.modelData?.methods?.[1].name).toBe("hashPassword");

    // 4. Delete method
    useCanvasStore.getState().deleteSelectedRow("srv-card-1", m2);
    card = useCanvasStore.getState().objects.find((o) => o.id === "srv-card-1");
    expect(card?.modelData?.methods).toHaveLength(1);
    expect(card?.modelData?.methods?.[0].name).toBe("hashPassword");
  });

  it("manages service method visibility: toggle, hide, show all, show only, and cleans on delete", () => {
    const serviceCard: CanvasObject = {
      id: "srv-vis-1",
      type: "model",
      x: 0,
      y: 0,
      width: 240,
      height: 154,
      modelData: {
        kind: "service",
        name: "PaymentService",
        methods: [
          { id: "m1", name: "charge", params: [], returnType: "Receipt" },
          { id: "m2", name: "refund", params: [], returnType: "bool" },
          { id: "m3", name: "getHistory", params: [], returnType: "Receipt[]" },
        ],
      },
    };

    useCanvasStore.getState().addObject(serviceCard);

    // 1. Hide method m2
    useCanvasStore.getState().hideServiceModelMethod("srv-vis-1", "m2");
    let card = useCanvasStore.getState().objects.find((o) => o.id === "srv-vis-1")!;
    expect(card.hiddenMethodIds).toEqual(["m2"]);
    expect(card.height).toBe(128); // 2 visible + 1 indicator row

    // 2. Toggle m3 (hides it)
    useCanvasStore.getState().toggleServiceModelMethodVisibility("srv-vis-1", "m3");
    card = useCanvasStore.getState().objects.find((o) => o.id === "srv-vis-1")!;
    expect(card.hiddenMethodIds).toEqual(["m2", "m3"]);
    expect(card.height).toBe(102); // 1 visible + 1 indicator row

    // 3. Toggle m2 again (unhides it)
    useCanvasStore.getState().toggleServiceModelMethodVisibility("srv-vis-1", "m2");
    card = useCanvasStore.getState().objects.find((o) => o.id === "srv-vis-1")!;
    expect(card.hiddenMethodIds).toEqual(["m3"]);

    // 4. showAllServiceModelMethods
    useCanvasStore.getState().showAllServiceModelMethods("srv-vis-1");
    card = useCanvasStore.getState().objects.find((o) => o.id === "srv-vis-1")!;
    expect(card.hiddenMethodIds).toBeUndefined();
    expect(card.height).toBe(128); // 3 visible, no indicator: 34 + 6 + 3*26 + 10 = 128

    // 5. showOnlyServiceModelMethod (call only 1 method in a flow)
    useCanvasStore.getState().showOnlyServiceModelMethod("srv-vis-1", "m1");
    card = useCanvasStore.getState().objects.find((o) => o.id === "srv-vis-1")!;
    expect(card.hiddenMethodIds).toEqual(["m2", "m3"]);
    expect(card.height).toBe(102);

    // 6. Delete a hidden method -> cleans up from hiddenMethodIds
    useCanvasStore.getState().deleteSelectedRow("srv-vis-1", "m2");
    card = useCanvasStore.getState().objects.find((o) => o.id === "srv-vis-1")!;
    expect(card.modelData?.methods?.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(card.hiddenMethodIds).toEqual(["m3"]);

    // 7. createReferenceCopy of service with 2+ methods sets serviceMethodVisibilityPopup
    useCanvasStore.getState().createReferenceCopy(["srv-vis-1"]);
    const state = useCanvasStore.getState();
    const clone = state.objects.find((o) => o.id !== "srv-vis-1")!;
    expect(state.serviceMethodVisibilityPopup?.objectId).toBe(clone.id);
  });

  it("links and unlinks state for a storm constraint card with undo/redo", () => {
    const constraintCard: CanvasObject = {
      id: "cn-1",
      type: "storm",
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      stormData: {
        kind: "constraint",
        name: "User Must Be Active",
        fields: [],
      },
    };
    const stateCard: CanvasObject = {
      id: "st-1",
      type: "storm",
      x: 300,
      y: 0,
      width: 200,
      height: 120,
      stormData: {
        kind: "state",
        name: "User Status",
        fields: [],
      },
    };

    useCanvasStore.getState().addObjects([constraintCard, stateCard]);
    clearHistory();

    // 1. Set popup target
    useCanvasStore.getState().setConstraintStatePopup({ objectId: "cn-1" });
    expect(useCanvasStore.getState().constraintStatePopup?.objectId).toBe("cn-1");

    // 2. Link state
    useCanvasStore.getState().setStormConstraintState("cn-1", "st-1");
    let cn = useCanvasStore.getState().objects.find((o) => o.id === "cn-1")!;
    expect(cn.stormData?.stateId).toBe("st-1");
    expect(cn.stormData?.stateIds).toEqual(["st-1"]);

    // 3. Undo linking
    undo();
    cn = useCanvasStore.getState().objects.find((o) => o.id === "cn-1")!;
    expect(cn.stormData?.stateId).toBeUndefined();

    // 4. Redo linking
    redo();
    cn = useCanvasStore.getState().objects.find((o) => o.id === "cn-1")!;
    expect(cn.stormData?.stateId).toBe("st-1");

    // 5. Unlink state
    useCanvasStore.getState().setStormConstraintState("cn-1", undefined);
    cn = useCanvasStore.getState().objects.find((o) => o.id === "cn-1")!;
    expect(cn.stormData?.stateId).toBeUndefined();
    expect(cn.stormData?.stateIds).toBeUndefined();
  });
});

