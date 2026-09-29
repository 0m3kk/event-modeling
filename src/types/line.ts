/**
 * Freeform straight line drawn on the canvas.
 *
 * Endpoints are stored as offsets from the object's own `x`/`y` (the top-left
 * of its bounding box), so a line moves with its object like any other canvas
 * content. The bounding box is derived from the endpoints, which keeps the
 * line compatible with export bounds, grouping and search.
 */

import type { LineStyle } from "./group";
import type { Point } from "./connector";

export interface LineData {
  /** Start endpoint, relative to the object's x/y. */
  start: Point;
  /** End endpoint, relative to the object's x/y. */
  end: Point;
  stroke?: string;
  strokeWidth?: number;
  /** Stroke pattern: solid (default), dashed, or dotted. */
  lineStyle?: LineStyle;
  /** Draw an arrowhead at the start endpoint (defaults to false). */
  arrowStart?: boolean;
  /** Draw an arrowhead at the end endpoint (defaults to false). */
  arrowEnd?: boolean;
}
