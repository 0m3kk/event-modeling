import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPromptToHistory,
  getStoredPromptHistory,
  MAX_PROMPT_HISTORY,
  storePromptHistory,
} from "./promptHistory";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, val: string) {
    this.map.set(key, val);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

describe("promptHistory", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  it("prepends new prompts, de-duplicates, and ignores blanks", () => {
    expect(addPromptToHistory(["a", "b"], "c")).toEqual(["c", "a", "b"]);
    expect(addPromptToHistory(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(addPromptToHistory(["a"], "   ")).toEqual(["a"]);
  });

  it("caps the history at the max size", () => {
    const full = Array.from({ length: MAX_PROMPT_HISTORY }, (_, i) => `p${i}`);
    const next = addPromptToHistory(full, "fresh");
    expect(next[0]).toBe("fresh");
    expect(next).toHaveLength(MAX_PROMPT_HISTORY);
    expect(next).not.toContain(`p${MAX_PROMPT_HISTORY - 1}`);
  });

  it("round-trips through localStorage", () => {
    storePromptHistory(["one", "two"]);
    expect(getStoredPromptHistory()).toEqual(["one", "two"]);
  });

  it("returns an empty list for corrupted storage", () => {
    localStorage.setItem("storm-app-ai-prompt-history", "{not json");
    expect(getStoredPromptHistory()).toEqual([]);
  });
});
