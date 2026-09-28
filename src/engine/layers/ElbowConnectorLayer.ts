import { Container, Graphics } from "pixi.js";
import type {
  CanvasObject,
  CardinalAnchor,
  GroupInfo,
  GroupBounds,
  Point,
} from "@/types";
import { Z_INDICES, CONNECTOR_CONTACT_GAP } from "@/constants/canvas";
import {
  computeElbowPathWithBends,
  computeResolvedConnectorPoints,
  getOppositeAnchor,
} from "@/utils/elbowRouting";
import { computeGroupBounds } from "./GroupLayer";

export interface PreviewConnector {
  start: { objectId: string; anchor: CardinalAnchor; point: Point };
  currentPoint: Point;
  targetAnchor?: CardinalAnchor;
  waypoints?: Point[];
}

export interface AnchorMarker {
  objectId: string;
  anchor: CardinalAnchor;
  point: Point;
  isHovered?: boolean;
}

/**
 * Prebuilt id lookups so resolving many connectors stays O(C) instead of
 * O(C × N) when each endpoint would otherwise scan the objects/groups arrays.
 */
export interface ConnectorLookup {
  objectsById: Map<string, CanvasObject>;
  groupsById: Map<string, GroupInfo>;
}

export function buildConnectorLookup(
  objects: CanvasObject[],
  groups: GroupInfo[],
): ConnectorLookup {
  const objectsById = new Map<string, CanvasObject>();
  for (const o of objects) objectsById.set(o.id, o);
  const groupsById = new Map<string, GroupInfo>();
  for (const g of groups) groupsById.set(g.id, g);
  return { objectsById, groupsById };
}

export class ElbowConnectorLayer extends Container {
  private graphics: Graphics;
  private previewGraphics: Graphics;
  private anchorsGraphics: Graphics;

  constructor() {
    super();
    this.zIndex = Z_INDICES.CONNECTORS;
    this.graphics = new Graphics();
    this.previewGraphics = new Graphics();
    this.anchorsGraphics = new Graphics();

    this.addChild(this.graphics);
    this.addChild(this.previewGraphics);
    this.addChild(this.anchorsGraphics);
  }

  public renderConnectors(
    objects: CanvasObject[],
    groups: GroupInfo[] = [],
    selectedIds: string[] = [],
    hiddenConnectorId?: string | null,
  ): void {
    this.graphics.clear();

    const connectors = objects.filter(
      (o) => o.type === "connector" && o.connectorData,
    );
    if (connectors.length === 0) return;

    const lookup = buildConnectorLookup(objects, groups);

    for (const conn of connectors) {
      if (hiddenConnectorId && conn.id === hiddenConnectorId) continue;

      const data = conn.connectorData!;
      const points = this.getConnectorPoints(conn, objects, groups, lookup);
      if (!points) continue;

      const isSelected = selectedIds.includes(conn.id);
      const strokeColor = isSelected
        ? 0x2563eb
        : data.stroke
          ? parseInt(data.stroke.replace("#", "0x"), 16)
          : 0x475569;
      const strokeWidth = isSelected
        ? (data.strokeWidth ?? 2) + 1.5
        : (data.strokeWidth ?? 2);

      this.drawElbowPath(this.graphics, points, strokeColor, strokeWidth);

      if (data.arrowEnd !== false) {
        this.drawArrowhead(this.graphics, points, strokeColor, strokeWidth);
      }

      if (isSelected) {
        this.drawEndpointHandles(this.graphics, points);
      }
    }
  }

  private drawEndpointHandles(g: Graphics, points: Point[]): void {
    const startPt = points[0]!;
    const endPt = points[points.length - 1]!;

    for (const pt of [startPt, endPt]) {
      g.circle(pt.x, pt.y, 6)
        .fill({ color: 0xffffff })
        .stroke({ color: 0x2563eb, width: 2 });
      g.circle(pt.x, pt.y, 2.5)
        .fill({ color: 0x2563eb });
    }
  }

  /**
   * Resolves a connector's drawn elbow path in world coordinates, or null when
   * either endpoint's object/group can no longer be found. Used for rendering
   * and for hit-testing (selection).
   */
  public getConnectorPoints(
    conn: CanvasObject,
    objects: CanvasObject[],
    groups: GroupInfo[] = [],
    lookup?: ConnectorLookup,
  ): Point[] | null {
    const data = conn.connectorData;
    if (!data) return null;

    const resolved = lookup ?? buildConnectorLookup(objects, groups);

    const startBounds = this.findBounds(
      data.start.objectId,
      objects,
      groups,
      resolved,
    );
    const endBounds = this.findBounds(
      data.end.objectId,
      objects,
      groups,
      resolved,
    );
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

  /**
   * Renders the interactive drag preview connector.
   */
  public renderPreview(preview: PreviewConnector | null): void {
    this.previewGraphics.clear();
    if (!preview) return;

    const startDir = preview.start.anchor;
    const endDir = preview.targetAnchor ?? getOppositeAnchor(startDir);
    const points = computeElbowPathWithBends(
      preview.start.point,
      startDir,
      preview.currentPoint,
      endDir,
      preview.waypoints,
      {
        startGap: CONNECTOR_CONTACT_GAP,
        // While the pointer is still floating (no target anchor), keep the
        // preview attached to the cursor; only inset once a card is targeted.
        endGap: preview.targetAnchor ? CONNECTOR_CONTACT_GAP : 0,
      },
    );
    if (points.length < 2) return;

    // Draw active preview path with vivid blue color
    const previewColor = 0x3b82f6;
    this.drawElbowPath(this.previewGraphics, points, previewColor, 2);
    this.drawArrowhead(this.previewGraphics, points, previewColor, 2);

    if (preview.waypoints && preview.waypoints.length > 0) {
      for (const wp of preview.waypoints) {
        this.previewGraphics
          .circle(wp.x, wp.y, 4)
          .fill({ color: 0x3b82f6 })
          .stroke({ color: 0xffffff, width: 1.5 });
      }
    }
  }

  /**
   * Renders cardinal magnetic anchor dots.
   */
  public renderAnchors(anchors: AnchorMarker[]): void {
    this.anchorsGraphics.clear();
    if (anchors.length === 0) return;

    for (const a of anchors) {
      if (a.isHovered) {
        // Glowing active anchor
        this.anchorsGraphics
          .circle(a.point.x, a.point.y, 8)
          .fill({ color: 0x3b82f6, alpha: 0.35 })
          .circle(a.point.x, a.point.y, 5)
          .fill({ color: 0x2563eb })
          .stroke({ color: 0xffffff, width: 2 });
      } else {
        // Idle anchor
        this.anchorsGraphics
          .circle(a.point.x, a.point.y, 4)
          .fill({ color: 0xffffff })
          .stroke({ color: 0x3b82f6, width: 1.5 });
      }
    }
  }

  private drawElbowPath(
    g: Graphics,
    points: Point[],
    color: number,
    width: number,
  ): void {
    const cornerRadius = 8;
    g.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      g.lineTo(points[1].x, points[1].y);
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        g.arcTo(curr.x, curr.y, next.x, next.y, cornerRadius);
      }
      g.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    }

    g.stroke({ color, width });
  }

  private drawArrowhead(
    g: Graphics,
    points: Point[],
    color: number,
    _width: number,
  ): void {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const arrowLength = 9;
    const arrowAngle = Math.PI / 6;

    const pLeft = {
      x: last.x - arrowLength * Math.cos(angle - arrowAngle),
      y: last.y - arrowLength * Math.sin(angle - arrowAngle),
    };
    const pRight = {
      x: last.x - arrowLength * Math.cos(angle + arrowAngle),
      y: last.y - arrowLength * Math.sin(angle + arrowAngle),
    };

    g.poly([last.x, last.y, pLeft.x, pLeft.y, pRight.x, pRight.y]).fill({
      color,
    });
  }

  public findBounds(
    id: string,
    objects: CanvasObject[],
    groups: GroupInfo[],
    lookup: ConnectorLookup,
  ): GroupBounds | null {
    const cleanId = id.startsWith("__group:") ? id.replace("__group:", "") : id;

    // 1. Check objects
    const obj = lookup.objectsById.get(cleanId);
    if (obj) {
      return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    }

    // 2. Check groups
    const grp = lookup.groupsById.get(cleanId);
    if (grp) {
      return computeGroupBounds(grp, objects, groups);
    }

    return null;
  }

  public override destroy(
    options?: boolean | import("pixi.js").DestroyOptions,
  ): void {
    this.graphics.destroy();
    this.previewGraphics.destroy();
    this.anchorsGraphics.destroy();
    super.destroy(options);
  }
}
