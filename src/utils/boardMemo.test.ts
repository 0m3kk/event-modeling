import { describe, it, expect } from "vitest";
import { collectBoardTagCatalog, collectBoardTags } from "./eventTags";
import { collectBoardStateCards, boardStateCardsByName } from "@/tools/constraintCard/rules";
import { getDomainChildren } from "@/tools/domainCard/layout";
import { getGroupChildren } from "@/tools/groupCard/layout";
import { getSliceChildren } from "@/tools/sliceCard/layout";
import type { CanvasElement } from "@/types";

/**
 * These derived board views are recomputed while rendering (and validating) many
 * cards. They are memoized by the `elements` array reference, so the same board
 * version must yield the same instance — that identity is what makes the cache
 * effective.
 */
describe("board-derived memoization", () => {
  const board: CanvasElement[] = [
    {
      id: "e1",
      type: "eventCard",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      data: { name: "Opened", fields: [{ name: "account", type: "string", tag: "account" }] },
    },
    {
      id: "s1",
      type: "stateCard",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      data: { name: "Account", params: [{ name: "id", type: "string" }], states: [] },
    },
    { id: "d1", type: "domainCard", x: 0, y: 0, width: 1, height: 1, data: { name: "D" } },
    { id: "c1", type: "objectCard", x: 0, y: 0, width: 1, height: 1, data: {}, domainId: "d1" },
    { id: "g1", type: "groupCard", x: 0, y: 0, width: 1, height: 1, data: { name: "G" } },
    { id: "c2", type: "aliasCard", x: 0, y: 0, width: 1, height: 1, data: {}, groupId: "g1" },
    { id: "sl1", type: "sliceCard", x: 0, y: 0, width: 1, height: 1, data: { name: "S", lanes: [] } },
    { id: "c3", type: "commandCard", x: 0, y: 0, width: 1, height: 1, data: {}, sliceId: "sl1" },
  ];

  it("reuses the tag catalog and tags for the same board, recomputes for a new board", () => {
    expect(collectBoardTagCatalog(board)).toBe(collectBoardTagCatalog(board));
    expect(collectBoardTags(board)).toBe(collectBoardTags(board));
    expect(collectBoardTagCatalog([...board])).not.toBe(collectBoardTagCatalog(board));
  });

  it("reuses the collected state cards and their name index", () => {
    expect(collectBoardStateCards(board)).toBe(collectBoardStateCards(board));
    expect(boardStateCardsByName(board)).toBe(boardStateCardsByName(board));
  });

  it("groups children once per board version", () => {
    expect(getDomainChildren(board, "d1")).toBe(getDomainChildren(board, "d1"));
    expect(getGroupChildren(board, "g1")).toBe(getGroupChildren(board, "g1"));
    expect(getSliceChildren(board, "sl1")).toBe(getSliceChildren(board, "sl1"));

    expect(getDomainChildren(board, "d1").map((el) => el.id)).toEqual(["c1"]);
    expect(getGroupChildren(board, "g1").map((el) => el.id)).toEqual(["c2"]);
    expect(getSliceChildren(board, "sl1").map((el) => el.id)).toEqual(["c3"]);
  });

  it("returns a shared empty list for containers with no children", () => {
    expect(getDomainChildren(board, "missing")).toBe(getDomainChildren(board, "missing"));
    expect(getDomainChildren(board, "missing")).toHaveLength(0);
  });
});
