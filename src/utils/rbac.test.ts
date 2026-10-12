import { describe, it, expect } from "vitest";
import type { CanvasElement } from "@/types";
import {
  actionKey,
  boardActionsByKey,
  collectBoardActions,
  isMatchAllPattern,
  isWildcard,
  matchesAction,
  strictlySubsumesAction,
  subsumesAction,
  validateActionToken,
} from "./rbac";

function command(id: string, name: string, action?: string): CanvasElement {
  return { id, type: "commandCard", x: 0, y: 0, width: 220, height: 132, data: { name, action } };
}
function query(id: string, name: string, action?: string): CanvasElement {
  return { id, type: "queryCard", x: 0, y: 0, width: 220, height: 132, data: { name, action } };
}

describe("action token helpers", () => {
  it("actionKey trims and lower-cases but preserves ':' and '*'", () => {
    expect(actionKey("  Sales:PlaceOrder ")).toBe("sales:placeorder");
    expect(actionKey("sales:*")).toBe("sales:*");
    expect(actionKey(undefined)).toBe("");
  });

  it("isWildcard detects '*', isMatchAllPattern detects match-all", () => {
    expect(isWildcard("sales:*")).toBe(true);
    expect(isWildcard("sales:placeOrder")).toBe(false);

    expect(isMatchAllPattern("*")).toBe(true);
    expect(isMatchAllPattern("*:*")).toBe(true);
    expect(isMatchAllPattern("**")).toBe(true);
    expect(isMatchAllPattern("sales:*")).toBe(false);
    expect(isMatchAllPattern("sales:placeOrder")).toBe(false);
    expect(isMatchAllPattern("")).toBe(false);
  });
});

describe("matchesAction", () => {
  it("matches exact tokens case-insensitively", () => {
    expect(matchesAction("sales:placeOrder", "sales:placeorder")).toBe(true);
    expect(matchesAction("sales:placeOrder", "sales:cancelorder")).toBe(false);
  });

  it("matches namespace and verb wildcards", () => {
    expect(matchesAction("sales:*", "sales:placeorder")).toBe(true);
    expect(matchesAction("sales:*", "salesx:foo")).toBe(false);
    expect(matchesAction("*:getOrder", "sales:getorder")).toBe(true);
    expect(matchesAction("*:getOrder", "inventory:getorder")).toBe(true);
    expect(matchesAction("sales:refund*", "sales:refundorder")).toBe(true);
    expect(matchesAction("sales:refund*", "sales:placeorder")).toBe(false);
  });

  it("treats other regex characters literally", () => {
    expect(matchesAction("a.b:c", "axb:c")).toBe(false);
    expect(matchesAction("a.b:c", "a.b:c")).toBe(true);
  });
});

describe("collectBoardActions", () => {
  const board = [command("c1", "PlaceOrder", "sales:placeOrder"), query("q1", "GetOrder", "sales:getOrder"), command("c2", "NoAction")];

  it("collects only Command/Query cards with a non-empty action", () => {
    const actions = collectBoardActions(board);
    expect(actions.map((a) => a.action).sort()).toEqual(["sales:getOrder", "sales:placeOrder"]);
    expect(actions.every((a) => a.cardType === "commandCard" || a.cardType === "queryCard")).toBe(true);
  });

  it("indexes by normalized key", () => {
    const byKey = boardActionsByKey(board);
    expect(byKey.get("sales:placeorder")?.[0].cardName).toBe("PlaceOrder");
  });
});

describe("validateActionToken", () => {
  const board = [command("c1", "PlaceOrder", "sales:placeOrder")];

  it("accepts an empty action and a unique concrete token", () => {
    expect(validateActionToken("", board)).toEqual([]);
    expect(validateActionToken("sales:cancelOrder", board)).toEqual([]);
  });

  it("rejects duplicates across the board", () => {
    const issues = validateActionToken("sales:placeOrder", board);
    expect(issues.map((i) => i.code)).toContain("action_duplicate");
  });

  it("rejects a wildcard on a Command/Query", () => {
    const issues = validateActionToken("sales:*", []);
    expect(issues.map((i) => i.code)).toContain("action_has_wildcard");
  });
});

describe("subsumption", () => {
  const keys = ["sales:placeorder", "sales:cancelorder", "inventory:getorder"];

  it("detects subsumption over the concrete board", () => {
    expect(subsumesAction("sales:*", "sales:placeOrder", keys)).toBe(true);
    expect(strictlySubsumesAction("sales:*", "sales:placeOrder", keys)).toBe(true);
    expect(strictlySubsumesAction("sales:placeOrder", "sales:*", keys)).toBe(false);
  });

  it("returns false when neither covers the other", () => {
    expect(strictlySubsumesAction("sales:*", "*:getOrder", keys)).toBe(false);
  });
});
