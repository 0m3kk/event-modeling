import { Container, Graphics, Text } from "pixi.js";
import type { CanvasObject } from "@/types";
import { APP_FONT_FAMILY } from "@/constants/canvas";
import type { CardHitZone, RenderResult } from "./types";

export class TextBoxRenderer {
  public static draw(
    container: Container,
    obj: CanvasObject,
    textResolution: number,
    isSelected: boolean = false,
  ): RenderResult {
    container.removeChildren();

    const w = obj.width || 200;
    const h = obj.height || 40;

    const g = new Graphics();
    container.addChild(g);

    // If selected or hovered, show subtle outline
    if (isSelected) {
      g.roundRect(0, 0, w, h, 4).stroke({ color: 0x3b82f6, width: 1.5, alpha: 0.8 });
    }

    const content = obj.text || "Double click to edit";
    const text = new Text({
      text: content,
      style: {
        fontSize: 14,
        fontFamily: APP_FONT_FAMILY,
        fill: 0x1e293b,
        wordWrap: true,
        wordWrapWidth: w - 8,
        lineHeight: 20,
      },
      resolution: textResolution,
    });
    text.x = 4;
    text.y = 4;
    container.addChild(text);

    const hitZones: CardHitZone[] = [
      {
        type: "textBoxText",
        bounds: { x: 0, y: 0, width: w, height: h },
        currentText: content,
      },
    ];

    const estimatedTextHeight =
      typeof document !== "undefined" ? text.height : 24;

    return {
      height: Math.max(h, estimatedTextHeight + 8),
      hitZones,
    };
  }
}
