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
  computeElbowPath,
  getCardinalAnchorPoint,
  getOppositeAnchor,
  resolveConnectionAnchors,
} from "@/utils/elbowRouting";
import { computeGroupBounds } from "./GroupLayer";

export interface PreviewConnector {
  start: { objectId: string; anchor: CardinalAnchor; point: Point };
  currentPoint: Point;
  targetAnchor?: CardinalAnchor;
}

export interface AnchorMarker {
  objectId: string;
  anchor: CardinalAnchor;
  point: Point;
  isHovered?: boolean;
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
  ): void {
    this.graphics.clear();

    const connectors = objects.filter(
      (o) => o.type === "connector" && o.connectorData,
    );

    for (const conn of connectors) {
      const data = conn.connectorData!;
      const points = this.getConnectorPoints(conn, objects, groups);
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
  ): Point[] | null {
    const data = conn.connectorData;
    if (!data) return null;

    const startBounds = this.findBounds(data.start.objectId, objects, groups);
    const endBounds = this.findBounds(data.end.objectId, objects, groups);
    if (!startBounds || !endBounds) return null;

    // Auto-pick the facing anchors so the connector re-routes itself as the
    // objects move (the stored anchors are only the user's initial intent).
    const { start, end } = resolveConnectionAnchors(startBounds, endBounds, {
      startGap: CONNECTOR_CONTACT_GAP,
      endGap: CONNECTOR_CONTACT_GAP,
    });

    const startPoint = getCardinalAnchorPoint(startBounds, start);
    const endPoint = getCardinalAnchorPoint(endBounds, end);

    const points = computeElbowPath(startPoint, start, endPoint, end, {
      startGap: CONNECTOR_CONTACT_GAP,
      endGap: CONNECTOR_CONTACT_GAP,
    });

    return points.length >= 2 ? points : null;
  }

  /**
   * Renders the interactive drag preview connector.
   */
  public renderPreview(preview: PreviewConnector | null): void {
    this.previewGraphics.clear();
    if (!preview) return;

    const startDir = preview.start.anchor;
    const endDir = preview.targetAnchor ?? getOppositeAnchor(startDir);
    const points = computeElbowPath(
      preview.start.point,
      startDir,
      preview.currentPoint,
      endDir,
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

  private findBounds(
    id: string,
    objects: CanvasObject[],
    groups: GroupInfo[],
  ): GroupBounds | null {
    const cleanId = id.startsWith("__group:") ? id.replace("__group:", "") : id;

    // 1. Check objects
    const obj = objects.find((o) => o.id === cleanId);
    if (obj) {
      return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    }

    // 2. Check groups
    const grp = groups.find((g) => g.id === cleanId);
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
