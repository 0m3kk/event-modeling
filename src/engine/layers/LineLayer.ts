import { Container, Graphics } from "pixi.js";
import type { CanvasObject, LineStyle, Point } from "@/types";
import { Z_INDICES } from "@/constants/canvas";
import { getLineEndpoints, parseLineColor } from "@/utils/lineGeometry";
import { calculateDashedPolyline } from "@/utils/dashedGraphics";

/** Live preview shown while the line tool is drawing a new line. */
export interface LinePreview {
  start: Point;
  end: Point;
}

/** Selected endpoint handle hit target. */
export interface LineEndpointHandle {
  lineId: string;
  endpoint: "start" | "end";
  point: Point;
}

/**
 * Draws freeform straight lines. Lines live below cards but above connectors,
 * mirroring connector rendering: selection is a soft glow plus endpoint
 * handles rather than a bounding box.
 */
export class LineLayer extends Container {
  private graphics: Graphics;
  private previewGraphics: Graphics;

  constructor() {
    super();
    this.zIndex = Z_INDICES.LINES;
    this.graphics = new Graphics();
    this.previewGraphics = new Graphics();
    this.addChild(this.graphics);
    this.addChild(this.previewGraphics);
  }

  public renderLines(
    objects: CanvasObject[],
    selectedIds: string[] = [],
  ): void {
    this.graphics.clear();

    for (const obj of objects) {
      if (obj.type !== "line" || !obj.lineData) continue;
      const ends = getLineEndpoints(obj);
      if (!ends) continue;

      const data = obj.lineData;
      const isSelected = selectedIds.includes(obj.id);
      const color = parseLineColor(data.stroke);
      const strokeWidth = data.strokeWidth ?? 2;
      const lineStyle: LineStyle = data.lineStyle ?? "solid";

      // Selection reads as a soft glow behind the line so its own color and
      // pattern stay visible while editing.
      if (isSelected) {
        this.drawStyledLine(
          this.graphics,
          ends.start,
          ends.end,
          0x2563eb,
          strokeWidth + 5,
          "solid",
          0.3,
        );
      }

      this.drawStyledLine(
        this.graphics,
        ends.start,
        ends.end,
        color,
        strokeWidth,
        lineStyle,
      );

      // Endpoint handles first, arrowheads after, so the arrow stays visible.
      if (isSelected) {
        this.drawEndpointHandles(this.graphics, ends.start, ends.end);
      }

      if (data.arrowStart) {
        this.drawArrowhead(this.graphics, ends.start, ends.end, color);
      }
      if (data.arrowEnd) {
        this.drawArrowhead(this.graphics, ends.end, ends.start, color);
      }
    }
  }

  /** Renders the in-progress line while the line tool is active. */
  public renderPreview(preview: LinePreview | null): void {
    this.previewGraphics.clear();
    if (!preview) return;

    const color = 0x3b82f6;
    this.previewGraphics
      .moveTo(preview.start.x, preview.start.y)
      .lineTo(preview.end.x, preview.end.y)
      .stroke({ color, width: 2, cap: "round" });

    for (const pt of [preview.start, preview.end]) {
      this.previewGraphics
        .circle(pt.x, pt.y, 4)
        .fill({ color: 0xffffff })
        .stroke({ color, width: 1.5 });
    }
  }

  private drawEndpointHandles(g: Graphics, start: Point, end: Point): void {
    for (const pt of [start, end]) {
      g.circle(pt.x, pt.y, 6)
        .fill({ color: 0xffffff })
        .stroke({ color: 0x2563eb, width: 2 });
      g.circle(pt.x, pt.y, 2.5).fill({ color: 0x2563eb });
    }
  }

  private drawStyledLine(
    g: Graphics,
    start: Point,
    end: Point,
    color: number,
    width: number,
    lineStyle: LineStyle,
    alpha: number = 1,
  ): void {
    if (lineStyle === "solid") {
      g.moveTo(start.x, start.y)
        .lineTo(end.x, end.y)
        .stroke({ color, width, alpha, cap: "round" });
      return;
    }

    const isDotted = lineStyle === "dotted";
    const dashLength = isDotted ? Math.max(0.5, width * 0.75) : 8;
    const gapLength = isDotted ? Math.max(3, width * 2) : 6;
    const segments = calculateDashedPolyline(
      [start, end],
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

  private drawArrowhead(
    g: Graphics,
    tip: Point,
    from: Point,
    color: number,
  ): void {
    const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
    const arrowLength = 9;
    const arrowAngle = Math.PI / 6;

    const left = {
      x: tip.x - arrowLength * Math.cos(angle - arrowAngle),
      y: tip.y - arrowLength * Math.sin(angle - arrowAngle),
    };
    const right = {
      x: tip.x - arrowLength * Math.cos(angle + arrowAngle),
      y: tip.y - arrowLength * Math.sin(angle + arrowAngle),
    };

    g.poly([tip.x, tip.y, left.x, left.y, right.x, right.y]).fill({ color });
  }

  public override destroy(
    options?: boolean | import("pixi.js").DestroyOptions,
  ): void {
    this.graphics.destroy();
    this.previewGraphics.destroy();
    super.destroy(options);
  }
}
