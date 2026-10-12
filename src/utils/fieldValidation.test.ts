import { describe, it, expect } from "vitest";
import {
  cleanValidation,
  draftToValidation,
  emptyValidationDraft,
  formatLabel,
  hasValidation,
  validationKindFor,
  validationSummary,
  validationToDraft,
} from "./fieldValidation";

describe("fieldValidation helpers", () => {
  it("treats absent or empty validations as none", () => {
    expect(hasValidation(undefined)).toBe(false);
    expect(hasValidation({})).toBe(false);
    expect(hasValidation({ rule: "   " })).toBe(false);
    expect(hasValidation({ pattern: "" })).toBe(false);
    expect(hasValidation({ format: "  " })).toBe(false);
    expect(hasValidation({ minLength: NaN })).toBe(false);
  });

  it("treats zero as a meaningful constraint", () => {
    expect(hasValidation({ minLength: 0 })).toBe(true);
    expect(hasValidation({ min: 0 })).toBe(true);
    expect(hasValidation({ minItems: 0 })).toBe(true);
  });

  it("drops empty keys while keeping real values", () => {
    expect(cleanValidation({ minLength: 3, maxLength: undefined, pattern: "", rule: " " })).toEqual({
      minLength: 3,
    });
    expect(cleanValidation({ min: 0, max: 10 })).toEqual({ min: 0, max: 10 });
    expect(cleanValidation({ format: "email" })).toEqual({ format: "email" });
    expect(cleanValidation({})).toBeUndefined();
    expect(cleanValidation(undefined)).toBeUndefined();
  });

  it("picks the validation group from the declared type", () => {
    expect(validationKindFor("string")).toBe("string");
    expect(validationKindFor("integer")).toBe("number");
    expect(validationKindFor("float")).toBe("number");
    expect(validationKindFor("Money")).toBe("string");
    expect(validationKindFor("CustomerId")).toBe("string");
    expect(validationKindFor("float", true)).toBe("array");
    expect(validationKindFor(undefined)).toBe("string");
  });

  it("round-trips through the editor draft", () => {
    const validation = { minLength: 3, maxLength: 32, pattern: "^\\w+$", format: "email", rule: "no spaces" };
    const draft = validationToDraft(validation);
    expect(draft.minLength).toBe("3");
    expect(draft.maxLength).toBe("32");
    expect(draft.pattern).toBe("^\\w+$");
    expect(draft.format).toBe("email");
    expect(draft.rule).toBe("no spaces");
    expect(draftToValidation(draft)).toEqual(validation);
  });

  it("ignores non-numeric text and empty inputs when parsing a draft", () => {
    expect(draftToValidation(emptyValidationDraft())).toBeNull();
    const draft = { ...emptyValidationDraft(), min: "abc", max: "10", rule: "  " };
    expect(draftToValidation(draft)).toEqual({ max: 10 });
  });

  it("summarizes active constraints for display", () => {
    expect(
      validationSummary({ minLength: 3, maxLength: 8, format: "url", min: 0, rule: "luhn" }),
    ).toEqual(["length ≥ 3", "length ≤ 8", "format URL", "≥ 0", "luhn"]);
    expect(validationSummary(undefined)).toEqual([]);
  });

  it("maps format values to their preset labels", () => {
    expect(formatLabel("uuid")).toBe("UUID");
    expect(formatLabel("email")).toBe("Email");
    // Unknown/AI-authored formats fall back to the raw value.
    expect(formatLabel("custom-format")).toBe("custom-format");
  });
});
