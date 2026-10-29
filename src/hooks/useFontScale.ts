import { useState } from "react";

/**
 * Discrete font-size multipliers shared by the app's text-heavy panels (the AI
 * panel). `1` is the neutral/default step.
 */
export const FONT_SCALE_LEVELS = [0.85, 1, 1.15, 1.3, 1.5];
export const DEFAULT_FONT_SCALE = 1;

/** Restores a panel's font scale from storage, snapped to a known level. */
function getStoredFontScale(storageKey: string): number {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
    if (Number.isFinite(parsed)) {
      // Snap to the closest level so stale/free-form values stay in-sync.
      return FONT_SCALE_LEVELS.reduce((best, level) =>
        Math.abs(level - parsed) < Math.abs(best - parsed) ? level : best,
      );
    }
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
  return DEFAULT_FONT_SCALE;
}

export interface FontScaleState {
  /** Current multiplier, applied to the panel's base text sizes. */
  fontScale: number;
  /** Step up to the next level and persist it. */
  increase: () => void;
  /** Step down to the previous level and persist it. */
  decrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
}

/**
 * Steps a panel's text size up/down between the shared {@link FONT_SCALE_LEVELS}
 * and remembers the choice under `storageKey`. Panels wire the returned
 * `fontScale` into a CSS variable (see `index.css`) and the two flags into the
 * disabled state of their A-/A+ buttons.
 */
export function useFontScale(storageKey: string): FontScaleState {
  const [fontScale, setFontScale] = useState(() => getStoredFontScale(storageKey));

  const change = (direction: 1 | -1) => {
    setFontScale((prev) => {
      const currentIndex = FONT_SCALE_LEVELS.indexOf(prev);
      const nextIndex = Math.min(
        FONT_SCALE_LEVELS.length - 1,
        Math.max(0, currentIndex + direction),
      );
      const next = FONT_SCALE_LEVELS[nextIndex];
      if (next !== prev) {
        try {
          localStorage.setItem(storageKey, String(next));
        } catch {
          // Ignore storage errors
        }
      }
      return next;
    });
  };

  return {
    fontScale,
    increase: () => change(1),
    decrease: () => change(-1),
    canDecrease: fontScale > FONT_SCALE_LEVELS[0],
    canIncrease: fontScale < FONT_SCALE_LEVELS[FONT_SCALE_LEVELS.length - 1],
  };
}
