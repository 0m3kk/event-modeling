import type { Viewport } from "@/types";

export const GRID_SIZE = 10;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5.0;
export const APP_FONT_FAMILY = "Geist Mono, monospace";

/** Small visual gap between a connector endpoint and the card it attaches to. */
export const CONNECTOR_CONTACT_GAP = 5;

/** Screen-space pick tolerance (px) for selecting a connector line. */
export const CONNECTOR_HIT_SLOP = 8;

export const DEFAULT_VIEWPORT: Viewport = {
  x: 0,
  y: 0,
  zoom: 1,
  screenWidth: 0,
  screenHeight: 0,
};

export const Z_INDICES = {
  GRID: 0,
  GROUPS: 10,
  CONNECTORS: 20,
  VISUAL_LINKS: 25,
  CARDS: 30,
  GIZMOS: 40,
  DOM_OVERLAYS: 50,
};
