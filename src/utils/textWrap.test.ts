import { describe, it, expect } from "vitest";
import { measureMonospaceText, wrapMonospaceText } from "./textWrap";

// At font size 10 the Geist Mono advance is 6px, so 100px fits 16 characters.
const FONT = 10;
const WIDTH = 100;

describe("measureMonospaceText", () => {
  it("uses the 0.6em monospace advance", () => {
    expect(measureMonospaceText("abcd", FONT)).toBe(24);
    expect(measureMonospaceText("", FONT)).toBe(0);
  });
});

describe("wrapMonospaceText", () => {
  it("keeps short text on a single line", () => {
    expect(wrapMonospaceText("hello world", WIDTH, FONT)).toEqual(["hello world"]);
  });

  it("always returns at least one line", () => {
    expect(wrapMonospaceText("", WIDTH, FONT)).toEqual([""]);
  });

  it("breaks greedily on word boundaries", () => {
    // 16 chars per line: "aaaa bbbb cccc" (14) then "dddd eeee" (9).
    const lines = wrapMonospaceText("aaaa bbbb cccc dddd eeee", WIDTH, FONT);
    expect(lines).toEqual(["aaaa bbbb cccc", "dddd eeee"]);
  });

  it("hard-splits words longer than a line so nothing overflows", () => {
    const lines = wrapMonospaceText("abcdefghijklmnopqrstuvwxyz", WIDTH, FONT);
    expect(lines).toEqual(["abcdefghijklmnop", "qrstuvwxyz"]);
    for (const line of lines) {
      expect(measureMonospaceText(line, FONT)).toBeLessThanOrEqual(WIDTH);
    }
  });

  it("honours explicit newlines as hard breaks", () => {
    expect(wrapMonospaceText("first\nsecond", WIDTH, FONT)).toEqual(["first", "second"]);
  });

  it("never produces a line wider than the wrap width", () => {
    const text = "AccountStatus.status must be active and AccountStatus.owner must be set";
    const lines = wrapMonospaceText(text, 90, FONT);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureMonospaceText(line, FONT)).toBeLessThanOrEqual(90);
    }
  });
});
