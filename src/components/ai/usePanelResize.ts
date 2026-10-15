/**
 * Panel width resizing for the AI panel, persisted across sessions.
 */
import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

const WIDTH_STORAGE_KEY = "event_modeling_ai_panel_width";
export const MIN_PANEL_WIDTH = 320;
export const MAX_PANEL_WIDTH = 800;
export const DEFAULT_PANEL_WIDTH = 480;

/** Restores the panel width from the last session, clamped to sane bounds. */
function getStoredPanelWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, parsed));
    }
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
  return DEFAULT_PANEL_WIDTH;
}

export function usePanelResize() {
  const [panelWidth, setPanelWidth] = useState(getStoredPanelWidth);
  const isResizingRef = useRef(false);
  const panelWidthRef = useRef(panelWidth);

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const newWidth = Math.max(
      MIN_PANEL_WIDTH,
      Math.min(MAX_PANEL_WIDTH, window.innerWidth - e.clientX),
    );
    panelWidthRef.current = newWidth;
    setPanelWidth(newWidth);
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(panelWidthRef.current));
    } catch {
      // Ignore storage errors
    }
  };

  const handleStartResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return { panelWidth, handleStartResize };
}
