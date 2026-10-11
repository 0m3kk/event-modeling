import { useState, useEffect, useCallback } from "react";
import { getActiveEngine } from "@/engine/PixiEngine";
import type { ThemeMode, ResolvedTheme } from "@/types";

export const THEME_STORAGE_KEY = "event-modeling-theme";

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined" || !window.localStorage) return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function resolveTheme(theme: ThemeMode): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

export function applyThemeToDOM(theme: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (resolved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
  try {
    getActiveEngine()?.setTheme(resolved);
  } catch {
    // Engine not mounted yet
  }
  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredTheme()),
  );

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Ignore storage errors
    }
    const resolved = applyThemeToDOM(newTheme);
    setResolvedTheme(resolved);
  }, []);

  useEffect(() => {
    const resolved = applyThemeToDOM(theme);
    setResolvedTheme(resolved);

    if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const next = applyThemeToDOM("system");
      setResolvedTheme(next);
    };

    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, [theme]);

  return { theme, resolvedTheme, setTheme };
}
