import type { DescHoverTarget, Point } from "@/types";

/**
 * Per-element registry of the ⓘ badge hit boxes recorded while rendering.
 *
 * The badge x-position for a field row depends on the rendered type-label
 * width, so hit-testing cannot re-derive it cheaply. Recording the exact boxes
 * during render keeps hover detection perfectly aligned with what is drawn.
 * Elements are re-registered on every (re)render and dropped when removed.
 */
const zonesByElement = new Map<string, DescHoverTarget[]>();

/** Clears an element's zones at the start of its render pass. */
export function beginDescZones(elementId: string): void {
  zonesByElement.set(elementId, []);
}

/** Appends a hoverable ⓘ zone (call from within the render pass). */
export function addDescZone(elementId: string, zone: DescHoverTarget): void {
  const list = zonesByElement.get(elementId);
  if (list) list.push(zone);
  else zonesByElement.set(elementId, [zone]);
}

/** Drops an element's zones (on delete/destroy). */
export function clearDescZones(elementId: string): void {
  zonesByElement.delete(elementId);
}

/** Returns the ⓘ zone under a local point, or null. */
export function hitDescZone(elementId: string, localPoint: Point): DescHoverTarget | null {
  const list = zonesByElement.get(elementId);
  if (!list) return null;
  for (const zone of list) {
    const b = zone.iconBounds;
    if (
      localPoint.x >= b.x &&
      localPoint.x <= b.x + b.width &&
      localPoint.y >= b.y &&
      localPoint.y <= b.y + b.height
    ) {
      return zone;
    }
  }
  return null;
}
