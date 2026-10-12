import { describe, it, expect, beforeEach } from "vitest";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { actorCardTool, computeActorCardSize } from "./index";
import {
  actorsAllowing,
  collectBoardActors,
  getActorPermissions,
  validateActorCardData,
  type ActorCardData,
} from "./rules";

const placeOrder: CanvasElement = {
  id: "cmd-place",
  type: "commandCard",
  x: 0,
  y: 0,
  width: 220,
  height: 132,
  data: { name: "PlaceOrder", action: "sales:placeOrder" },
};
const cancelOrder: CanvasElement = {
  id: "cmd-cancel",
  type: "commandCard",
  x: 0,
  y: 0,
  width: 220,
  height: 132,
  data: { name: "CancelOrder", action: "sales:cancelOrder" },
};
const refundOrder: CanvasElement = {
  id: "cmd-refund",
  type: "commandCard",
  x: 0,
  y: 0,
  width: 220,
  height: 132,
  data: { name: "RefundOrder", action: "sales:refundOrder" },
};
const getOrder: CanvasElement = {
  id: "q-get",
  type: "queryCard",
  x: 0,
  y: 0,
  width: 220,
  height: 132,
  data: { name: "GetOrder", action: "sales:getOrder" },
};
const refundWindow: CanvasElement = {
  id: "con-refund",
  type: "constraintCard",
  x: 0,
  y: 0,
  width: 260,
  height: 126,
  data: { name: "RefundWithinWindow", states: [], rules: ["Within 30 days"] },
};

const resourceBoard: CanvasElement[] = [placeOrder, cancelOrder, refundOrder, getOrder, refundWindow];

function validate(data: ActorCardData, board: CanvasElement[] = resourceBoard) {
  return validateActorCardData(data, { elements: board });
}

describe("actorCardTool", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("has correct metadata", () => {
    expect(actorCardTool.type).toBe("actorCard");
    expect(actorCardTool.name).toBe("Actor");
    expect(actorCardTool.color).toBe("#7c3aed");
    expect(actorCardTool.category).toBe("modeling");
  });

  it("computes height from the permission count", () => {
    expect(computeActorCardSize({ name: "X", permissions: [] }).height).toBe(82);
    expect(
      computeActorCardSize({ name: "X", permissions: [{ action: "a" }, { action: "b" }] }).height,
    ).toBe(110);
  });

  it("sub-selects permission rows", () => {
    const el: CanvasElement<ActorCardData> = {
      id: "actor-1",
      type: "actorCard",
      x: 0,
      y: 0,
      width: 260,
      height: 110,
      data: {
        name: "Customer",
        permissions: [{ action: "sales:placeOrder" }, { action: "sales:getOrder" }],
      },
    };
    expect(actorCardTool.onSubSelect!(el, { x: 10, y: 15 })).toBeNull();
    expect(actorCardTool.onSubSelect!(el, { x: 10, y: 40 })).toBeNull();
    expect(actorCardTool.onSubSelect!(el, { x: 10, y: 60 })).toEqual({
      elementId: "actor-1",
      sectionIndex: 0,
      sectionId: "permissions",
      fieldIndex: 0,
    });
    expect(actorCardTool.onSubSelect!(el, { x: 10, y: 90 })).toEqual({
      elementId: "actor-1",
      sectionIndex: 0,
      sectionId: "permissions",
      fieldIndex: 1,
    });
  });

  it("exposes the permissions section and registers an AI op", () => {
    const el: CanvasElement<ActorCardData> = {
      id: "actor-1",
      type: "actorCard",
      x: 0,
      y: 0,
      width: 260,
      height: 110,
      data: { name: "Customer", permissions: [{ action: "sales:placeOrder" }] },
    };
    expect(actorCardTool.getSubSelectSections!(el)).toEqual([
      { id: "permissions", name: "permissions", count: 1 },
    ]);
    expect(actorCardTool.ai?.toolName).toBe("create_actor_card");
  });
});

describe("validateActorCardData", () => {
  it("keeps exact actions that resolve", () => {
    const { data, issues } = validate({
      name: "Customer",
      permissions: [{ action: "sales:placeOrder" }, { action: "sales:getOrder" }],
    });
    expect(issues).toEqual([]);
    expect(getActorPermissions(data).map((p) => p.action)).toEqual([
      "sales:placeOrder",
      "sales:getOrder",
    ]);
  });

  it("flags and drops an unknown exact action", () => {
    const { data, issues } = validate({ name: "A", permissions: [{ action: "sales:refund" }] });
    expect(issues.map((i) => i.code)).toContain("action_not_found");
    expect(getActorPermissions(data)).toEqual([]);
  });

  it("forbids match-all patterns (bare '*' and '*:*')", () => {
    const { issues } = validate({
      name: "A",
      permissions: [{ action: "*" }, { action: "*:*" }],
    });
    expect(issues.filter((i) => i.code === "wildcard_all_forbidden")).toHaveLength(2);
  });

  it("flags a wildcard that matches nothing", () => {
    const { issues } = validate({ name: "A", permissions: [{ action: "inventory:*" }] });
    expect(issues.map((i) => i.code)).toContain("wildcard_matches_nothing");
  });

  it("flags duplicates", () => {
    const { issues } = validate({
      name: "A",
      permissions: [{ action: "sales:placeOrder" }, { action: "sales:placeOrder" }],
    });
    expect(issues.map((i) => i.code)).toContain("duplicate_permission");
  });

  it("flags overlap and repairs by dropping the subsumed permission", () => {
    const { data, issues } = validate({
      name: "A",
      permissions: [{ action: "sales:*" }, { action: "sales:placeOrder" }],
    });
    expect(issues.map((i) => i.code)).toContain("permission_overlap");
    expect(getActorPermissions(data).map((p) => p.action)).toEqual(["sales:*"]);
  });

  it("keeps partial overlaps (neither covers the other) but reports them", () => {
    const inventoryGetOrder: CanvasElement = {
      id: "q-inv",
      type: "queryCard",
      x: 0,
      y: 0,
      width: 220,
      height: 132,
      data: { name: "GetStock", action: "inventory:getOrder" },
    };
    const board = [...resourceBoard, inventoryGetOrder];
    const { data, issues } = validate(
      { name: "A", permissions: [{ action: "sales:*" }, { action: "*:getOrder" }] },
      board,
    );
    expect(issues.map((i) => i.code)).toContain("permission_overlap");
    expect(getActorPermissions(data).map((p) => p.action)).toEqual(["sales:*", "*:getOrder"]);
  });
});

describe("collectBoardActors / actorsAllowing", () => {
  const customer: CanvasElement<ActorCardData> = {
    id: "actor-customer",
    type: "actorCard",
    x: 0,
    y: 0,
    width: 260,
    height: 110,
    data: {
      name: "Customer",
      permissions: [{ action: "sales:placeOrder" }, { action: "sales:getOrder" }],
    },
  };
  const manager: CanvasElement<ActorCardData> = {
    id: "actor-manager",
    type: "actorCard",
    x: 0,
    y: 0,
    width: 260,
    height: 110,
    data: { name: "SalesManager", permissions: [{ action: "sales:*" }] },
  };
  const board = [...resourceBoard, customer, manager];

  it("collects actors from the board", () => {
    expect(collectBoardActors(board).map((a) => a.name).sort()).toEqual([
      "Customer",
      "SalesManager",
    ]);
  });

  it("lists every actor that can execute an action", () => {
    expect(actorsAllowing("sales:placeorder", board).map((a) => a.actor).sort()).toEqual([
      "Customer",
      "SalesManager",
    ]);
    expect(actorsAllowing("sales:cancelorder", board).map((a) => a.actor)).toEqual([
      "SalesManager",
    ]);
  });
});
