import { describe, it, expect } from "vitest";
import {
  STORM_KIND_COLORS,
  STORM_KIND_LABELS,
  STORM_PHASE_COLORS,
  stormAccentColor,
  stormHasFieldTypes,
  stormHasFields,
  stormHasPhase,
  stormHasQueryItems,
  stormHasTags,
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

  it("renders a typed, taggable field list on BDD cards", () => {
    expect(stormHasFieldTypes("bdd")).toBe(true);
    expect(stormHasTags("bdd")).toBe(true);
    expect(stormHasTags("command")).toBe(false);
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
});
