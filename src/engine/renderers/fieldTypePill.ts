import type { Container, Graphics } from "pixi.js";
import { Text } from "pixi.js";
import { APP_FONT_FAMILY } from "@/constants/canvas";
import { MODEL_KIND_COLORS } from "@/constants/model";
import type { CanvasObject, ModelNodeKind } from "@/types";

export function truncateText(str: string, maxLen: number): string {
  if (!str) return "";
  if (maxLen <= 1) return str.slice(0, 1);
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

/**
 * Returns numeric hex color for a given model kind.
 */
export function getModelKindHex(kind?: string): number {
  if (!kind || !(kind in MODEL_KIND_COLORS)) return 0x0891b2;
  const hex = MODEL_KIND_COLORS[kind as ModelNodeKind];
  return parseInt(hex.replace("#", ""), 16);
}

/**
 * Computes the width for the type pill on a field row so the full type name is
 * always visible. Model types keep extra room for the kind micro-icon on the
 * left. The pill is never capped or truncated — when a long type (or the tag /
 * name beside it) runs out of room, the user widens the node to give it space,
 * exactly like tag pills.
 */
export function computeTypeZoneWidth(rawType: string, isModel: boolean): number {
  if (isModel) {
    return Math.max(72, rawType.length * 6.5 + 24);
  }
  return Math.max(60, rawType.length * 6.5 + 14);
}

/**
 * Draws a sharp, vector micro-icon representing the model kind (object, enum, array, wrap)
 * inside a field type pill, centered at (cx, cy).
 */
export function drawFieldKindIcon(
  g: Graphics,
  kind: string,
  cx: number,
  cy: number,
  color: number,
): void {
  switch (kind) {
    case "object": {
      // 3D Isometric Cube (approx 8.5x9 px)
      const topY = cy - 4.5;
      const botY = cy + 4.5;
      const leftX = cx - 4.2;
      const rightX = cx + 4.2;
      const leftMidY = cy - 2.2;
      const rightMidY = cy - 2.2;
      const leftBotY = cy + 2.2;
      const rightBotY = cy + 2.2;

      g.poly([
        cx, topY,
        rightX, rightMidY,
        rightX, rightBotY,
        cx, botY,
        leftX, leftBotY,
        leftX, leftMidY,
      ]).stroke({ color, width: 1.1, join: "round" });

      g.moveTo(cx, cy).lineTo(cx, botY).stroke({ color, width: 1.1 });
      g.moveTo(cx, cy).lineTo(leftX, leftMidY).stroke({ color, width: 1.1 });
      g.moveTo(cx, cy).lineTo(rightX, rightMidY).stroke({ color, width: 1.1 });
      break;
    }

    case "enum": {
      // ListTree / bullet list
      const y1 = cy - 3.5;
      const y2 = cy;
      const y3 = cy + 3.5;
      const dotX = cx - 3.5;
      const lineStartX = cx - 1;
      const lineEndX = cx + 4.5;

      g.circle(dotX, y1, 1).fill({ color });
      g.moveTo(lineStartX, y1).lineTo(lineEndX, y1).stroke({ color, width: 1.1, cap: "round" });

      g.circle(dotX, y2, 1).fill({ color });
      g.moveTo(lineStartX, y2).lineTo(lineEndX, y2).stroke({ color, width: 1.1, cap: "round" });

      g.circle(dotX, y3, 1).fill({ color });
      g.moveTo(lineStartX, y3).lineTo(lineEndX, y3).stroke({ color, width: 1.1, cap: "round" });
      break;
    }

    case "array": {
      // Square Brackets [ ]
      const topY = cy - 4;
      const botY = cy + 4;

      // Left bracket [
      g.moveTo(cx - 1.2, topY)
        .lineTo(cx - 3.8, topY)
        .lineTo(cx - 3.8, botY)
        .lineTo(cx - 1.2, botY)
        .stroke({ color, width: 1.2, cap: "square" });

      // Right bracket ]
      g.moveTo(cx + 1.2, topY)
        .lineTo(cx + 3.8, topY)
        .lineTo(cx + 3.8, botY)
        .lineTo(cx + 1.2, botY)
        .stroke({ color, width: 1.2, cap: "square" });
      break;
    }

    case "wrap": {
      // Parentheses () (matching Lucide Parentheses icon)
      // Left parenthesis (
      g.moveTo(cx - 1.5, cy - 3.8)
        .bezierCurveTo(cx - 4.2, cy - 1.8, cx - 4.2, cy + 1.8, cx - 1.5, cy + 3.8)
        .stroke({ color, width: 1.2, cap: "round" });

      // Right parenthesis )
      g.moveTo(cx + 1.5, cy - 3.8)
        .bezierCurveTo(cx + 4.2, cy - 1.8, cx + 4.2, cy + 1.8, cx + 1.5, cy + 3.8)
        .stroke({ color, width: 1.2, cap: "round" });
      break;
    }
  }
}

export interface DrawFieldTypePillOptions {
  g: Graphics;
  container: Container;
  rawType: string;
  x: number;
  y: number;
  w: number;
  h?: number;
  targetModel?: CanvasObject | null;
  textResolution?: number;
  isDark?: boolean;
}

/**
 * Draws the field type badge on a card row.
 * - Primitive types render as neutral slate pills.
 * - Model types render with model kind tint, border, kind micro-icon, and kind-colored text.
 */
export function drawFieldTypePill(options: DrawFieldTypePillOptions): void {
  const {
    g,
    container,
    rawType,
    x,
    y,
    w,
    h = 20,
    targetModel,
    textResolution = 2,
    isDark = false,
  } = options;

  const isModel = Boolean(targetModel && targetModel.modelData);
  const targetKind = targetModel?.modelData?.kind || "object";

  if (isModel) {
    const kindHex = getModelKindHex(targetKind);

    // Pill background & border with model kind tint
    g.roundRect(x, y, w, h, 3)
      .fill({ color: kindHex, alpha: isDark ? 0.22 : 0.12 })
      .stroke({ color: kindHex, alpha: isDark ? 0.55 : 0.45, width: 1 });

    // Kind icon
    const iconCX = x + 9;
    const iconCY = y + h / 2;
    drawFieldKindIcon(g, targetKind, iconCX, iconCY, kindHex);

    // Text with kind color and semibold weight. Rendered in full (never
    // truncated) so long model names stay readable; the node widens around it.
    const typeText = new Text({
      text: rawType,
      style: {
        fontSize: 10,
        fontWeight: "600",
        fontFamily: APP_FONT_FAMILY,
        fill: kindHex,
      },
      resolution: textResolution,
    });
    typeText.x = x + 18;
    typeText.y = y + 3;
    container.addChild(typeText);
  } else {
    // Primitive type: neutral slate pill. The full type text is rendered so
    // custom / long type names are never cut off.
    const pillBg = isDark ? 0x27272a : 0xf8fafc;
    const pillStroke = isDark ? 0x3f3f46 : 0xe2e8f0;
    const pillTextColor = isDark ? 0xa1a1aa : 0x64748b;

    g.roundRect(x, y, w, h, 3)
      .fill({ color: pillBg })
      .stroke({ color: pillStroke, width: 1 });

    const typeText = new Text({
      text: rawType,
      style: {
        fontSize: 10,
        fontFamily: APP_FONT_FAMILY,
        fill: pillTextColor,
      },
      resolution: textResolution,
    });
    typeText.x = x + 6;
    typeText.y = y + 3;
    container.addChild(typeText);
  }
}
