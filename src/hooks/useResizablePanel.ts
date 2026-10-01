import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Resize directions supported by a panel anchored to the bottom-right corner.
 * Only the top and left edges can move; the right/bottom stay pinned.
 */
export type ResizeDirection = "top" | "left" | "top-left";

export interface PanelSize {
  width: number;
  height: number;
}

export const MIN_PANEL_WIDTH = 360;
export const MIN_PANEL_HEIGHT = 320;
export const DEFAULT_PANEL_WIDTH = 576; // 36rem, matches the previous w-xl
export const DEFAULT_PANEL_HEIGHT = 704; // 44rem, matches the previous h-176

/** Page margin kept free around the panel on each side (3rem). */
const VIEWPORT_MARGIN = 48;
/** Vertical chrome (header + top margin) the panel must not grow into. */
const VIEWPORT_TOP_GAP = 80;

const PANEL_SIZE_KEY = "storm-app-ai-panel-size";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, max), Math.max(min, value));
}

/**
 * Largest size the panel may take without overflowing the viewport. The floor
 * is the minimum size so the constraint never drops below what we allow.
 */
export function maxPanelSize(viewportWidth: number, viewportHeight: number): PanelSize {
  return {
    width: Math.max(MIN_PANEL_WIDTH, viewportWidth - VIEWPORT_MARGIN),
    height: Math.max(MIN_PANEL_HEIGHT, viewportHeight - VIEWPORT_TOP_GAP),
  };
}

export function clampPanelSize(size: PanelSize, max: PanelSize): PanelSize {
  return {
    width: clamp(size.width, MIN_PANEL_WIDTH, max.width),
    height: clamp(size.height, MIN_PANEL_HEIGHT, max.height),
  };
}

/**
 * Applies a pointer drag to the panel size. The panel is pinned to the
 * bottom-right, so dragging the top edge up or the left edge left grows it.
 */
export function applyResize(
  direction: ResizeDirection,
  start: PanelSize,
  deltaX: number,
  deltaY: number,
): PanelSize {
  let width = start.width;
  let height = start.height;

  if (direction === "left" || direction === "top-left") {
    width = start.width - deltaX;
  }
  if (direction === "top" || direction === "top-left") {
    height = start.height - deltaY;
  }

  return { width, height };
}

export function getStoredPanelSize(): PanelSize {
  try {
    const raw = localStorage.getItem(PANEL_SIZE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PanelSize>;
      if (typeof parsed.width === "number" && typeof parsed.height === "number") {
        return clampPanelSize(
          { width: parsed.width, height: parsed.height },
          maxPanelSize(window.innerWidth, window.innerHeight),
        );
      }
    }
  } catch {
    /* ignore corrupted or unavailable storage */
  }
  return { width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
}

function storePanelSize(size: PanelSize): void {
  try {
    localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(size));
  } catch {
    /* ignore storage errors */
  }
}

interface DragState {
  direction: ResizeDirection;
  startX: number;
  startY: number;
  startSize: PanelSize;
}

/**
 * Tracks a user-resizable panel size, persisting it to localStorage and
 * clamping it to the current viewport. Returns the size plus a factory that
 * builds pointer-down handlers for each resize direction.
 */
export function useResizablePanel() {
  const [size, setSize] = useState<PanelSize>(() => getStoredPanelSize());
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    // Debounced so a resize drag doesn't hit localStorage on every pointermove.
    const timer = setTimeout(() => storePanelSize(size), 200);
    return () => clearTimeout(timer);
  }, [size]);

  // Keep the panel inside the viewport when the window shrinks.
  useEffect(() => {
    const onWindowResize = () => {
      setSize((current) =>
        clampPanelSize(current, maxPanelSize(window.innerWidth, window.innerHeight)),
      );
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = applyResize(
        drag.direction,
        drag.startSize,
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );
      setSize(clampPanelSize(next, maxPanelSize(window.innerWidth, window.innerHeight)));
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  const beginResize = useCallback(
    (direction: ResizeDirection) => (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startSize: sizeRef.current,
      };
    },
    [],
  );

  return { size, beginResize };
}
