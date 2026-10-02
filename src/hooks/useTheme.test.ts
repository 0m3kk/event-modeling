import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getStoredTheme,
  resolveTheme,
  applyThemeToDOM,
  THEME_STORAGE_KEY,
} from "./useTheme";

describe("useTheme logic", () => {
  const classListSet = new Set<string>();

  beforeEach(() => {
    classListSet.clear();
    const mockClassList = {
      add: (cls: string) => classListSet.add(cls),
      remove: (cls: string) => classListSet.delete(cls),
      contains: (cls: string) => classListSet.has(cls),
    };

    const storageMap = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, value: string) => storageMap.set(key, value),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
    };

    vi.stubGlobal("document", {
      documentElement: {
        classList: mockClassList,
      },
    });

    vi.stubGlobal("window", {
      localStorage: mockLocalStorage,
      matchMedia: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to system when localStorage is empty", () => {
    expect(getStoredTheme()).toBe("system");
  });

  it("reads stored valid theme from localStorage", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(getStoredTheme()).toBe("dark");

    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(getStoredTheme()).toBe("light");

    window.localStorage.setItem(THEME_STORAGE_KEY, "invalid");
    expect(getStoredTheme()).toBe("system");
  });

  it("resolves explicit light and dark themes directly", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves system theme matching prefers-color-scheme", () => {
    expect(resolveTheme("system")).toBe("light");

    vi.stubGlobal("window", {
      ...window,
      matchMedia: () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    expect(resolveTheme("system")).toBe("dark");
  });

  it("applies dark theme to document root", () => {
    const resolved = applyThemeToDOM("dark");
    expect(resolved).toBe("dark");
    expect(classListSet.has("dark")).toBe(true);
  });

  it("removes dark theme from document root when light is applied", () => {
    classListSet.add("dark");
    const resolved = applyThemeToDOM("light");
    expect(resolved).toBe("light");
    expect(classListSet.has("dark")).toBe(false);
  });
});
