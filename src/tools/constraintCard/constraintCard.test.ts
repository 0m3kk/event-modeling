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
    expect(constraintCardTool.defaultSize).toEqual({ width: 260, height: 132 });
  });

  it("computes height for both sections", () => {
    // 32 + (22 + 1*28) + (22 + 1*28) = 132
    expect(computeConstraintCardSize(card.data).height).toBe(132);
  });

  it("grows with additional rules", () => {
    const multi: ConstraintCardData = {
      ...card.data,
      rules: ["a", "b", "c"],
    };
    // 32 + (22 + 28) + (22 + 3*28) = 188
    expect(computeConstraintCardSize(multi).height).toBe(188);
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
    // rule 0 [104, 132)
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
    expect(delRule?.height).toBe(132);

    const delState = constraintCardTool.onDeleteSubSelect!(card, 0, 0);
    expect(delState?.data?.states?.length).toBe(0);
    // Rules are free text, so they are not cascade-deleted with the state.
    expect(delState?.data?.rules?.length).toBe(1);
    expect(delState?.height).toBe(132);
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

  it("rejects AI creation when the referenced state is unknown", () => {
    useCanvasStore.getState().clearBoard();
    expect(() =>
      constraintCardTool.ai!.onCreate(
        {
          name: "AccountMustBeActive",
          states: ["AccountStatus"],
          rules: ["AccountStatus.status must be active"],
        },
        { x: 0, y: 0 },
      ),
    ).toThrow();
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
