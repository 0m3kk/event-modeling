import { Container, Graphics } from "pixi.js";
import type {
  CanvasObject,
  CardinalAnchor,
  GroupInfo,
  GroupBounds,
  LineStyle,
  Point,
} from "@/types";
import { Z_INDICES, CONNECTOR_CONTACT_GAP } from "@/constants/canvas";
import {
  computeElbowPathWithBends,
  getOppositeAnchor,
} from "@/utils/elbowRouting";
import {
  buildConnectorLookup,
  findConnectorEndpointBounds,
  resolveConnectorPoints,
  type ConnectorLookup,
} from "@/utils/connectorGeometry";
import {
  calculateDashedPolyline,
  getRoundedPolylinePoints,
} from "@/utils/dashedGraphics";

export type { ConnectorLookup };
export { buildConnectorLookup };

/** Corner radius used for solid elbow paths; dashed paths flatten the same arc. */
const ELBOW_CORNER_RADIUS = 8;

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

export class ElbowConnectorLayer extends Container {
  private graphics: Graphics;
  private previewGraphics: Graphics;
  private anchorsGraphics: Graphics;
  /**
   * Resolved elbow path of every drawn connector from the last renderConnectors
   * pass. Hit-testing reuses these instead of re-running the obstacle-avoiding
   * routing for every connector on every pointer move.
   */
  private resolvedPoints: Map<string, Point[]> = new Map();

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
    this.resolvedPoints.clear();

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
      this.resolvedPoints.set(conn.id, points);

      const isSelected = selectedIds.includes(conn.id);
      const strokeColor = data.stroke
        ? parseInt(data.stroke.replace("#", "0x"), 16)
        : 0x475569;
      const strokeWidth = data.strokeWidth ?? 2;
      const lineStyle: LineStyle = data.lineStyle ?? "solid";

      // Selection reads as a soft glow behind the line, so the connector keeps
      // its own color/style and property edits are visible immediately.
      if (isSelected) {
        this.drawStyledElbowPath(
          this.graphics,
          points,
          0x2563eb,
          strokeWidth + 5,
          "solid",
          0.3,
        );
      }

      this.drawStyledElbowPath(
        this.graphics,
        points,
        strokeColor,
        strokeWidth,
        lineStyle,
      );

      // Endpoint handles first, arrowheads after: both sit on the same point,
      // and a handle painted on top hid the arrow, so the arrow toggles on the
      // options bar were impossible to verify.
      if (isSelected) {
        this.drawEndpointHandles(this.graphics, points);
      }

      if (data.arrowStart) {
        this.drawArrowhead(this.graphics, points, strokeColor, strokeWidth, "start");
      }
      if (data.arrowEnd !== false) {
        this.drawArrowhead(this.graphics, points, strokeColor, strokeWidth, "end");
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
    return resolveConnectorPoints(conn, objects, groups, lookup);
  }

  /**
   * Path of a connector as drawn by the last renderConnectors pass, or null
   * when it was not drawn (missing endpoints, hidden, or no render yet).
   */
  public getCachedConnectorPoints(id: string): Point[] | null {
    return this.resolvedPoints.get(id) ?? null;
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

  /**
   * Paints a connector path in the requested stroke pattern. Solid paths keep
   * Pixi's native arc corners; dashed/dotted paths are flattened so the dash
   * run can follow the same rounded corners.
   */
  private drawStyledElbowPath(
    g: Graphics,
    points: Point[],
    color: number,
    width: number,
    lineStyle: LineStyle,
    alpha: number = 1,
  ): void {
    if (lineStyle === "solid") {
      this.drawElbowPath(g, points, color, width, alpha);
      return;
    }

    const flattened = getRoundedPolylinePoints(
      points,
      ELBOW_CORNER_RADIUS,
      6,
    );
    const isDotted = lineStyle === "dotted";
    const dashLength = isDotted ? Math.max(0.5, width * 0.75) : 8;
    const gapLength = isDotted ? Math.max(3, width * 2) : 6;
    const segments = calculateDashedPolyline(
      flattened,
      dashLength,
      gapLength,
      false,
    );

    for (const seg of segments) {
      g.moveTo(seg.p1.x, seg.p1.y);
      g.lineTo(seg.p2.x, seg.p2.y);
    }
    g.stroke({ color, width, alpha, cap: isDotted ? "round" : "butt" });
  }

  private drawElbowPath(
    g: Graphics,
    points: Point[],
    color: number,
    width: number,
    alpha: number = 1,
  ): void {
    const cornerRadius = ELBOW_CORNER_RADIUS;
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

    g.stroke({ color, width, alpha, cap: "round" });
  }

  private drawArrowhead(
    g: Graphics,
    points: Point[],
    color: number,
    _width: number,
    at: "start" | "end" = "end",
  ): void {
    if (points.length < 2) return;

    const last = at === "end" ? points[points.length - 1] : points[0];
    const prev = at === "end" ? points[points.length - 2] : points[1];
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
    _objects: CanvasObject[],
    _groups: GroupInfo[],
    lookup: ConnectorLookup,
  ): GroupBounds | null {
    return findConnectorEndpointBounds(id, lookup);
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
