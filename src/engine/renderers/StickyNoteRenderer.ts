import { Container, Graphics, Text } from "pixi.js";
import type { CanvasObject } from "@/types";
import { APP_FONT_FAMILY } from "@/constants/canvas";
import type { CardHitZone, RenderResult } from "./types";

export class StickyNoteRenderer {
  public static draw(
    container: Container,
    obj: CanvasObject,
    textResolution: number,
    isSelected: boolean = false,
  ): RenderResult {
    container.removeChildren();

    const w = obj.width || 180;
    const h = obj.height || 140;
    const r = 6;

    const g = new Graphics();
    container.addChild(g);

    // Default yellow fill if not specified
    const fillColorHex = obj.fill || "#fef08a";
    const strokeColorHex = obj.stroke || "#eab308";
    const fill = parseInt(fillColorHex.replace("#", "0x"), 16);
    const stroke = parseInt(strokeColorHex.replace("#", "0x"), 16);

    const noteText = obj.text || "Sticky Note";
    const text = new Text({
      text: noteText,
      style: {
        fontSize: 13,
        fontFamily: APP_FONT_FAMILY,
        fill: 0x713f12,
        wordWrap: true,
        wordWrapWidth: w - 20,
        lineHeight: 18,
      },
      resolution: textResolution,
    });
    text.x = 10;
    text.y = 10;

    const estimatedTextHeight =
      typeof document !== "undefined" ? text.height : 24;
    const totalHeight = Math.max(h, estimatedTextHeight + 20);

    // Subtle drop shadow
    g.roundRect(2, 2, w, totalHeight, r).fill({ color: 0x000000, alpha: 0.08 });

    // Note body
    g.roundRect(0, 0, w, totalHeight, r)
      .fill({ color: fill })
      .stroke({ color: isSelected ? 0x3b82f6 : stroke, width: isSelected ? 2 : 1 });

    container.addChild(text);

    const hitZones: CardHitZone[] = [
      {
        type: "stickyText",
        bounds: { x: 0, y: 0, width: w, height: totalHeight },
        currentText: noteText,
      },
    ];

    return {
      height: totalHeight,
      hitZones,
    };
  }
}
