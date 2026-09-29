import { describe, expect, it } from "vitest";
import {
  EMPTY_VALIDATION_DRAFT,
  countValidationRules,
  describeValidationRules,
  draftToValidation,
  formatFromFieldType,
  hasValidationRules,
  isStringLikeFieldType,
  parseAllowedValues,
  validationToDraft,
} from "./fieldValidation";

describe("fieldValidation", () => {
  it("round-trips stored validation through an editable draft", () => {
    const validation = {
      minLength: 1,
      maxLength: 255,
      pattern: "^[A-Z]{3}-\\d{4}$",
      format: "email",
      min: 0,
      max: 100,
      allowedValues: ["pending", "paid"],
    };

    const draft = validationToDraft(validation);
    expect(draft).toEqual({
      minLength: "1",
      maxLength: "255",
      pattern: "^[A-Z]{3}-\\d{4}$",
      format: "email",
      min: "0",
      max: "100",
      allowedValues: "pending, paid",
    });
    expect(draftToValidation(draft)).toEqual(validation);
  });

  it("treats blank and invalid inputs as unset rules", () => {
    expect(validationToDraft(undefined)).toEqual(EMPTY_VALIDATION_DRAFT);
    expect(
      draftToValidation({
        minLength: "",
        maxLength: "abc",
        pattern: "   ",
        format: "",
        min: "",
        max: "",
        allowedValues: " , ,",
      }),
    ).toBeUndefined();
  });

  it("keeps a known string format", () => {
    expect(
      draftToValidation({ ...EMPTY_VALIDATION_DRAFT, format: "uuid" }),
    ).toEqual({ format: "uuid" });
  });

  it("parses length bounds as non-negative integers and keeps numeric signs", () => {
    const validation = draftToValidation({
      ...EMPTY_VALIDATION_DRAFT,
      minLength: "2.9",
      maxLength: "-5",
      min: "-1.5",
      max: "10.25",
    });
    expect(validation).toEqual({
      minLength: 2,
      maxLength: 0,
      min: -1.5,
      max: 10.25,
    });
  });

  it("splits allowed values on commas and newlines", () => {
    expect(parseAllowedValues("a, b\nc ,, d")).toEqual(["a", "b", "c", "d"]);
    expect(
      draftToValidation({
        ...EMPTY_VALIDATION_DRAFT,
        allowedValues: "pending,\npaid",
      }),
    ).toEqual({ allowedValues: ["pending", "paid"] });
  });

  it("counts and describes rules", () => {
    expect(countValidationRules(undefined)).toBe(0);
    expect(hasValidationRules(undefined)).toBe(false);

    const validation = {
      minLength: 1,
      pattern: "^x$",
      format: "email",
      allowedValues: ["a", "b"],
    };
    expect(countValidationRules(validation)).toBe(4);
    expect(hasValidationRules(validation)).toBe(true);
    expect(describeValidationRules(validation)).toBe(
      "min length 1, pattern ^x$, format email, one of a, b",
    );
    expect(describeValidationRules(undefined)).toBe("");
  });

  it("does not count blank patterns, formats or empty allowed-value lists", () => {
    expect(
      countValidationRules({ pattern: "   ", format: "", allowedValues: [] }),
    ).toBe(0);
    expect(hasValidationRules({ pattern: "   " })).toBe(false);
  });

  it("only treats string-like field types as format-capable", () => {
    expect(isStringLikeFieldType("string")).toBe(true);
    expect(isStringLikeFieldType("email")).toBe(true);
    expect(isStringLikeFieldType("uuid")).toBe(true);
    expect(isStringLikeFieldType("datetime")).toBe(true);
    expect(isStringLikeFieldType("string[]")).toBe(true);
    expect(isStringLikeFieldType(undefined)).toBe(true);
    expect(isStringLikeFieldType("number")).toBe(false);
    expect(isStringLikeFieldType("boolean")).toBe(false);
    expect(isStringLikeFieldType("OrderLine")).toBe(false);
  });

  it("maps a field type to the format it already implies", () => {
    expect(formatFromFieldType("email")).toBe("email");
    expect(formatFromFieldType("uuid")).toBe("uuid");
    expect(formatFromFieldType("url")).toBe("uri");
    expect(formatFromFieldType("datetime")).toBe("date-time");
    expect(formatFromFieldType("string")).toBeUndefined();
    expect(formatFromFieldType(undefined)).toBeUndefined();
  });
});
