import { describe, it, expect } from "vitest";
import {
  BDD_STEP_REF_COLORS,
  BDD_STEP_REF_LABELS,
  STORM_KIND_COLORS,
  STORM_KIND_LABELS,
  STORM_PHASE_COLORS,
  bddDefaultRefForPhase,
  bddRefsForPhase,
  stormAccentColor,
  stormHasFieldTypes,
  stormHasFields,
  stormHasPhase,
  stormHasQueryItems,
  stormHasSteps,
  stormHasTags,
  stormHasValidation,
} from "./storm";

describe("storm kind helpers", () => {
  it("exposes a color and label for the Given/When/Then kind", () => {
    expect(STORM_KIND_COLORS.bdd).toBeTruthy();
    expect(STORM_KIND_LABELS.bdd).toBe("Given/When/Then");
  });

  it("treats only bdd as a phase (Given/When/Then) kind", () => {
    expect(stormHasPhase("bdd")).toBe(true);
    expect(stormHasPhase("event")).toBe(false);
    expect(stormHasPhase("command")).toBe(false);
    expect(stormHasPhase("actor")).toBe(false);
  });

  it("colors BDD cards by phase and every other kind by kind color", () => {
    expect(stormAccentColor("bdd", "given")).toBe(STORM_PHASE_COLORS.given);
    expect(stormAccentColor("bdd", "when")).toBe(STORM_PHASE_COLORS.when);
    expect(stormAccentColor("bdd", "then")).toBe(STORM_PHASE_COLORS.then);
    // Falls back to the kind color when a BDD card somehow has no phase
    expect(stormAccentColor("bdd")).toBe(STORM_KIND_COLORS.bdd);
    expect(stormAccentColor("command")).toBe(STORM_KIND_COLORS.command);
  });

  it("renders scenario steps instead of a field list on BDD cards", () => {
    expect(stormHasSteps("bdd")).toBe(true);
    expect(stormHasSteps("command")).toBe(false);
    // BDD no longer carries a typed, taggable field list.
    expect(stormHasFieldTypes("bdd")).toBe(true); // still typed for other kinds
    expect(stormHasTags("bdd")).toBe(false);
    expect(stormHasTags("command")).toBe(false);
    expect(stormHasTags("event")).toBe(true);
  });

  it("constrains step refs by phase", () => {
    expect(bddRefsForPhase("given")).toEqual(["event"]);
    expect(bddRefsForPhase("when")).toEqual(["command", "query"]);
    expect(bddRefsForPhase("then")).toEqual([
      "event",
      "state",
      "error",
      "external",
    ]);
    expect(bddDefaultRefForPhase("given")).toBe("event");
    expect(bddDefaultRefForPhase("when")).toBe("command");
    expect(bddDefaultRefForPhase("then")).toBe("event");
    // Error is a scenario-only outcome with its own label/color.
    expect(BDD_STEP_REF_LABELS.error).toBe("Error");
    expect(BDD_STEP_REF_COLORS.error).toBeTruthy();
  });

  it("treats only the actor chip as fieldless (constraint carries fields)", () => {
    expect(stormHasFields("actor")).toBe(false);
    expect(stormHasFields("constraint")).toBe(true);
    expect(stormHasFields("state")).toBe(true);
    expect(stormHasFields("command")).toBe(true);
    // Constraint fields are typed and taggable, feeding DCB matching
    expect(stormHasFieldTypes("constraint")).toBe(true);
    expect(stormHasTags("constraint")).toBe(true);
  });

  it("gives State and Constraint cards a DCB Query Items section", () => {
    expect(stormHasQueryItems("state")).toBe(true);
    expect(stormHasQueryItems("constraint")).toBe(true);
    expect(stormHasQueryItems("command")).toBe(false);
    expect(stormHasQueryItems("event")).toBe(false);
  });

  it("only lets Command payloads and Query params carry validation", () => {
    expect(stormHasValidation("command")).toBe(true);
    expect(stormHasValidation("query")).toBe(true);
    expect(stormHasValidation("event")).toBe(false);
    expect(stormHasValidation("state")).toBe(false);
    expect(stormHasValidation("constraint")).toBe(false);
    expect(stormHasValidation("actor")).toBe(false);
    expect(stormHasValidation("bdd")).toBe(false);
  });
});
