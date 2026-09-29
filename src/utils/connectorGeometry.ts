import type {
  CanvasObject,
  GroupInfo,
  GroupBounds,
  Point,
} from "@/types";
import { CONNECTOR_CONTACT_GAP } from "@/constants/canvas";
import { computeResolvedConnectorPoints } from "./elbowRouting";
import { computeGroupBounds } from "@/engine/layers/GroupLayer";

/**
 * Shared geometry for elbow connectors.
 *
 * Both the Pixi renderer (hit-testing, painting) and DOM overlays (the
 * connector options bar) need the same resolved path for a connector, so the
 * resolution logic lives here instead of inside the render layer.
 */

/**
 * Prebuilt id lookups so resolving many connectors stays O(C) instead of
 * O(C × N) when each endpoint would otherwise scan the objects/groups arrays.
 */
export interface ConnectorLookup {
  objectsById: Map<string, CanvasObject>;
  groupsById: Map<string, GroupInfo>;
  /** Original arrays, kept so group bounds can be computed without re-scanning. */
  objects: CanvasObject[];
  groups: GroupInfo[];
}

export function buildConnectorLookup(
  objects: CanvasObject[],
  groups: GroupInfo[],
): ConnectorLookup {
  const objectsById = new Map<string, CanvasObject>();
  for (const o of objects) objectsById.set(o.id, o);
  const groupsById = new Map<string, GroupInfo>();
  for (const g of groups) groupsById.set(g.id, g);
  return { objectsById, groupsById, objects, groups };
}

/**
 * Bounds of a connector endpoint's target. Accepts the `__group:` selection
 * prefix as well as a plain id.
 */
export function findConnectorEndpointBounds(
  id: string,
  lookup: ConnectorLookup,
): GroupBounds | null {
  const cleanId = id.startsWith("__group:") ? id.replace("__group:", "") : id;

  const obj = lookup.objectsById.get(cleanId);
  if (obj) {
    return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
  }

  const grp = lookup.groupsById.get(cleanId);
  if (grp) {
    return computeGroupBounds(grp, lookup.objects, lookup.groups);
  }

  return null;
}

/**
 * Resolves a connector's drawn elbow path in world coordinates, or null when
 * either endpoint's object/group can no longer be found.
 */
export function resolveConnectorPoints(
  conn: CanvasObject,
  objects: CanvasObject[],
  groups: GroupInfo[] = [],
  lookup?: ConnectorLookup,
): Point[] | null {
  const data = conn.connectorData;
  if (!data) return null;

  const resolved = lookup ?? buildConnectorLookup(objects, groups);

  const startBounds = findConnectorEndpointBounds(
    data.start.objectId,
    resolved,
  );
  const endBounds = findConnectorEndpointBounds(data.end.objectId, resolved);
  if (!startBounds || !endBounds) return null;

  // Filter obstacles (all other objects/groups in proximity)
  const obstacleBounds: GroupBounds[] = [];
  const minX = Math.min(startBounds.x, endBounds.x) - 100;
  const maxX =
    Math.max(startBounds.x + startBounds.width, endBounds.x + endBounds.width) +
    100;
  const minY = Math.min(startBounds.y, endBounds.y) - 100;
  const maxY =
    Math.max(
      startBounds.y + startBounds.height,
      endBounds.y + endBounds.height,
    ) + 100;

  for (const obj of objects) {
    if (
      obj.type !== "connector" &&
      obj.id !== data.start.objectId &&
      obj.id !== data.end.objectId
    ) {
      if (
        obj.x + obj.width >= minX &&
        obj.x <= maxX &&
        obj.y + obj.height >= minY &&
        obj.y <= maxY
      ) {
        obstacleBounds.push({
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
        });
      }
    }
  }

  return computeResolvedConnectorPoints(
    conn,
    startBounds,
    endBounds,
    obstacleBounds,
    {
      startGap: CONNECTOR_CONTACT_GAP,
      endGap: CONNECTOR_CONTACT_GAP,
    },
  );
}

/** Point halfway along a polyline's total length. */
export function getPolylineMidpoint(points: Point[]): Point {
  return getPolylineMidpointInfo(points).point;
}

/**
 * Midpoint of a polyline plus the orientation of the segment it lands on.
 * Overlays use the orientation to offset themselves clear of the line.
 */
export function getPolylineMidpointInfo(points: Point[]): {
  point: Point;
  isHorizontal: boolean;
} {
  if (points.length === 0) return { point: { x: 0, y: 0 }, isHorizontal: true };
  if (points.length === 1) {
    return { point: { ...points[0]! }, isHorizontal: true };
  }

  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(
      points[i + 1]!.x - points[i]!.x,
      points[i + 1]!.y - points[i]!.y,
    );
  }

  const target = total / 2;
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (travelled + seg >= target) {
      const t = seg > 0 ? (target - travelled) / seg : 0;
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        isHorizontal: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y),
      };
    }
    travelled += seg;
  }

  const last = points[points.length - 1]!;
  const prev = points[points.length - 2]!;
  return {
    point: { ...last },
    isHorizontal: Math.abs(last.x - prev.x) >= Math.abs(last.y - prev.y),
  };
}
