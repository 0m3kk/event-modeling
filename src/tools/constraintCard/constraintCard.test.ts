import { describe, it, expect, beforeEach } from "vitest";
import {
  constraintCardTool,
  computeConstraintCardSize,
  type ConstraintCardData,
} from "./index";
import { validateConstraintCardData, collectBoardStateCards } from "./rules";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { navigateSubSelect } from "@/utils/subSelection";

const accountState: CanvasElement = {
  id: "state-1",
  type: "stateCard",
  x: 0,
  y: 0,
  width: 220,
  height: 210,
  data: {
    name: "AccountStatus",
    params: [{ name: "accountId", type: "string" }],
    queryItems: [],
    states: [{ name: "status", type: "string" }],
  },
};

const card: CanvasElement<ConstraintCardData> = {
  id: "constraint-1",
  type: "constraintCard",
  x: 100,
  y: 100,
  width: 260,
  height: 132,
  data: {
    name: "AccountMustBeActive",
    states: [{ name: "AccountStatus" }],
    rules: ["AccountStatus.status must be active"],
    color: "#e11d48",
  },
};

describe("constraintCardTool (states + rules sections)", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("has correct metadata", () => {
    expect(constraintCardTool.type).toBe("constraintCard");
    expect(constraintCardTool.name).toBe("Constraint");
    expect(constraintCardTool.color).toBe("#e11d48");
    expect(constraintCardTool.category).toBe("modeling");
    expect(constraintCardTool.defaultSize).toEqual({ width: 260, height: 126 });
  });

  it("computes height for both sections", () => {
    // The 36-char rule wraps to 2 lines at the default width:
    // 32 + (22 + 28) + (22 + (2*15 + 4)) = 138
    expect(computeConstraintCardSize(card.data).height).toBe(138);
  });

  it("grows with additional rules", () => {
    const multi: ConstraintCardData = {
      ...card.data,
      rules: ["a", "b", "c"],
    };
    // 32 + (22 + 28) + (22 + 3*22) = 170
    expect(computeConstraintCardSize(multi).height).toBe(170);
  });

  it("sub-selects rows across states and rules", () => {
    // header
    expect(constraintCardTool.onSubSelect!(card, { x: 50, y: 15 })).toBeNull();
    // states banner (32..54)
    expect(constraintCardTool.onSubSelect!(card, { x: 50, y: 40 })).toBeNull();
    // state 0 [54, 82)
    expect(constraintCardTool.onSubSelect!(card, { x: 50, y: 65 })).toEqual({
      elementId: "constraint-1",
      sectionIndex: 0,
      sectionId: "states",
      fieldIndex: 0,
    });
    // rules banner (82..104)
    expect(constraintCardTool.onSubSelect!(card, { x: 50, y: 90 })).toBeNull();
    // rule 0 [104, 138)
    expect(constraintCardTool.onSubSelect!(card, { x: 50, y: 115 })).toEqual({
      elementId: "constraint-1",
      sectionIndex: 1,
      sectionId: "rules",
      fieldIndex: 0,
    });
    // below card
    expect(constraintCardTool.onSubSelect!(card, { x: 50, y: 200 })).toBeNull();
  });

  it("exposes section metadata and selected items", () => {
    expect(constraintCardTool.getSubSelectSections!(card)).toEqual([
      { id: "states", name: "states", count: 1 },
      { id: "rules", name: "rules", count: 1 },
    ]);
    expect(
      constraintCardTool.getSelectedFieldItem!(card, { elementId: "constraint-1", sectionIndex: 0, fieldIndex: 0 }),
    ).toEqual({ name: "AccountStatus", type: "" });
    expect(
      constraintCardTool.getSelectedFieldItem!(card, { elementId: "constraint-1", sectionIndex: 1, fieldIndex: 0 }),
    ).toEqual({ name: "AccountStatus.status must be active", type: "" });
  });

  it("navigates across the two sections via arrow keys", () => {
    const down = navigateSubSelect(
      card,
      { elementId: "constraint-1", sectionIndex: 0, fieldIndex: 0 },
      "down",
      constraintCardTool,
    );
    expect(down).toMatchObject({ sectionIndex: 1, sectionId: "rules", fieldIndex: 0 });

    const up = navigateSubSelect(
      card,
      { elementId: "constraint-1", sectionIndex: 1, fieldIndex: 0 },
      "up",
      constraintCardTool,
    );
    expect(up).toMatchObject({ sectionIndex: 0, sectionId: "states", fieldIndex: 0 });
  });

  it("edits the rule text inline", () => {
    useCanvasStore.getState().addElement(card);
    const target = constraintCardTool.getInlineEditTarget!(card, { x: 30, y: 115 });
    expect(target?.initialValue).toBe("AccountStatus.status must be active");
    target?.onCommit("AccountStatus.status must be enabled");

    const updated = useCanvasStore.getState().elements.find((e) => e.id === "constraint-1");
    expect(updated?.data.rules?.[0]).toBe("AccountStatus.status must be enabled");
  });

  it("deletes a rule and a state independently", () => {
    const delRule = constraintCardTool.onDeleteSubSelect!(card, 0, 1);
    expect(delRule?.data?.rules?.length).toBe(0);
    expect(delRule?.data?.states?.length).toBe(1);
    // No rules left: only the empty rules row remains (104 + 22 = 126).
    expect(delRule?.height).toBe(126);

    const delState = constraintCardTool.onDeleteSubSelect!(card, 0, 0);
    expect(delState?.data?.states?.length).toBe(0);
    // Rules are free text, so they are not cascade-deleted with the state.
    expect(delState?.data?.rules?.length).toBe(1);
    // The rule still wraps to two lines: 104 + 34 = 138.
    expect(delState?.height).toBe(138);
  });
});

describe("constraintCardTool rule wrapping", () => {
  // At width 120 the rule text fits 13 characters per line (12px * 0.6 = 7.2px).
  // The title and state names are kept short so the content-driven width stays
  // below 120 and the wrapping behaviour can be exercised at a fixed width.
  const narrow: CanvasElement<ConstraintCardData> = {
    ...card,
    width: 120,
    data: {
      name: "R",
      states: [],
      rules: [
        "alpha beta gamma delta", // wraps to 2 lines -> row height 40
        "one two", // stays on 1 line -> row height 28
      ],
    },
  };

  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("grows the card height for wrapped rule lines", () => {
    // 32 + (22 + 28) + (22 + 34 + 22) = 160
    expect(computeConstraintCardSize(narrow.data, narrow.width).height).toBe(160);
  });

  it("exposes the width-aware height through the tool hook", () => {
    expect(constraintCardTool.computeHeightForWidth!(narrow.data, narrow.width)).toBe(160);
    // The sample rule wraps to two lines at the default width too.
    expect(computeConstraintCardSize(card.data, 260).height).toBe(138);
  });

  it("sub-selects the correct wrapped rule row by Y", () => {
    // First rule spans [104, 138), second spans [138, 160).
    expect(constraintCardTool.onSubSelect!(narrow, { x: 50, y: 120 })).toEqual({
      elementId: "constraint-1",
      sectionIndex: 1,
      sectionId: "rules",
      fieldIndex: 0,
    });
    expect(constraintCardTool.onSubSelect!(narrow, { x: 50, y: 150 })).toEqual({
      elementId: "constraint-1",
      sectionIndex: 1,
      sectionId: "rules",
      fieldIndex: 1,
    });
  });

  it("opens a multiline editor sized to the wrapped row", () => {
    useCanvasStore.getState().addElement(narrow);
    const target = constraintCardTool.getInlineEditTarget!(narrow, { x: 30, y: 150 });
    expect(target?.initialValue).toBe("one two");
    expect(target?.multiline).toBe(true);
    expect(target?.worldBounds.y).toBe(narrow.y + 138 + 2);
  });

  it("reflows the height when an edited rule wraps", () => {
    useCanvasStore.getState().addElement(narrow);
    const target = constraintCardTool.getInlineEditTarget!(narrow, { x: 30, y: 150 });
    target?.onCommit("one two three four five six");

    const updated = useCanvasStore
      .getState()
      .elements.find((e) => e.id === "constraint-1");
    expect(updated?.data.rules?.[1]).toBe("one two three four five six");
    // The second rule now wraps to two lines: 160 - 22 + 34 = 172.
    expect(updated?.height).toBe(172);
  });
});

describe("constraintCardTool content width auto-grow", () => {
  const base: ConstraintCardData = {
    name: "C",
    states: [{ name: "AccountBalanceProjection" }],
    rules: ["short"],
  };

  it("widens to fit a long state name", () => {
    // 12 + "Account Balance Projection"(26 * 7.2 = 187.2) + 80 hint reserve
    // = 279.2 -> 280, above the default 260.
    expect(computeConstraintCardSize(base).width).toBe(280);
  });

  it("ignores the free-text rules when sizing the width", () => {
    const long: ConstraintCardData = { ...base, rules: ["x".repeat(400)] };
    expect(computeConstraintCardSize(long).width).toBe(280);
  });

  it("keeps the default width for short state names", () => {
    expect(
      computeConstraintCardSize({ name: "C", states: [{ name: "A" }], rules: [] }).width,
    ).toBe(260);
  });
});

describe("constraintCardTool validation + AI", () => {
  beforeEach(() => {
    useCanvasStore.getState().clearBoard();
  });

  it("collects board state cards with their fields", () => {
    const cards = collectBoardStateCards([accountState]);
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe("AccountStatus");
    expect(cards[0].fields.sort()).toEqual(["accountId", "status"]);
  });

  it("accepts a valid constraint against the board", () => {
    const { issues } = validateConstraintCardData(card.data, { elements: [accountState] });
    expect(issues).toHaveLength(0);
  });

  it("flags a state that is not on the board", () => {
    const { issues } = validateConstraintCardData(card.data, { elements: [] });
    expect(issues.map((i) => i.code)).toEqual(["state_not_found"]);
  });

  it("drops blank rules when normalizing", () => {
    const data: ConstraintCardData = {
      ...card.data,
      rules: ["AccountStatus.status must be active", "   "],
    };
    const normalized = constraintCardTool.normalizeData!(data, { elements: [accountState] });
    expect(normalized.rules).toHaveLength(1);
    expect(normalized.rules?.[0]).toBe("AccountStatus.status must be active");
  });

  it("validateData rejects a state that is not on the board", () => {
    const { issues } = constraintCardTool.validateData!(
      {
        name: "AccountMustBeActive",
        states: [{ name: "AccountStatus" }],
        rules: ["AccountStatus.status must be active"],
      },
      { elements: [] },
    );
    expect(issues.map((i) => i.code)).toEqual(["state_not_found"]);
  });

  it("creates the constraint once the state exists on the board", () => {
    useCanvasStore.getState().addElement(accountState);
    const element = constraintCardTool.ai!.onCreate(
      {
        name: "AccountMustBeActive",
        states: ["AccountStatus"],
        rules: ["AccountStatus.status must be active", "AccountStatus.status must not be banned"],
      },
      { x: 0, y: 0 },
    );
    expect(element.type).toBe("constraintCard");
    expect(element.data.states).toHaveLength(1);
    expect(element.data.rules).toHaveLength(2);
  });
});
