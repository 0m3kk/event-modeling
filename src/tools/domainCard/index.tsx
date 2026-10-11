import { BoxSelect } from "lucide-react";
import { z } from "zod";
import { Graphics, Text, type Container } from "pixi.js";
import type { ToolDefinition } from "../types";
import type { InlineEditState } from "@/types";
import { useCanvasStore } from "@/store";
import { isSameIdentifier, toDisplayName } from "@/utils/naming";
import {
  DOMAIN_DEFAULT_HEIGHT,
  DOMAIN_DEFAULT_WIDTH,
  DOMAIN_LABEL_HEIGHT,
  DOMAIN_TYPE,
  getDomainChildren,
  type DomainData,
} from "./layout";

export type { DomainData } from "./layout";

export const DomainCardSchema = z.object({
  name: z.string().default("Domain"),
  color: z.string().optional(),
});

/** Draws a dashed rectangle by emitting straight dash segments per edge. */
function drawDashedRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  dash: number,
  gap: number,
  color: string | number,
  width: number,
): void {
  const step = dash + gap;

  for (let px = x; px < x + w; px += step) {
    const len = Math.min(dash, x + w - px);
    g.moveTo(px, y);
    g.lineTo(px + len, y);
    g.moveTo(px, y + h);
    g.lineTo(px + len, y + h);
  }
  for (let py = y; py < y + h; py += step) {
    const len = Math.min(dash, y + h - py);
    g.moveTo(x, py);
    g.lineTo(x, py + len);
    g.moveTo(x + w, py);
    g.lineTo(x + w, py + len);
  }

  g.stroke({ color, width });
}

export const domainCardTool: ToolDefinition<DomainData> = {
  type: DOMAIN_TYPE,
  name: "Domain",
  description: "A Domain is a dashed boundary that groups any cards (slices, commands, queries, objects, …)",
  icon: BoxSelect,
  color: "#7c3aed",
  category: "modeling",
  // Auto-fits its children, so edge-resize is disabled.
  resizable: false,

  schema: DomainCardSchema,
  createDefaultData: () => ({ name: "Domain", color: "#7c3aed" }),

  defaultSize: { width: DOMAIN_DEFAULT_WIDTH, height: DOMAIN_DEFAULT_HEIGHT },

  render: (container: Container, element, context) => {
    container.removeChildren();

    const isDark = context.theme === "dark";
    const isSelected = context.isSelected;
    const w = element.width;
    const h = element.height;
    const color = element.data.color || domainCardTool.color;
    const strokeColor = isSelected ? 0x3b82f6 : color;

    const g = new Graphics();
    // Very light wash so the enclosed area is visible.
    g.roundRect(0, 0, w, h, 10);
    g.fill({ color, alpha: isDark ? 0.07 : 0.04 });
    drawDashedRect(g, 0, 0, w, h, 10, 6, strokeColor, isSelected ? 2 : 1.5);
    container.addChild(g);

    if (typeof document === "undefined") return;

    const all = useCanvasStore.getState().elements;
    const children = getDomainChildren(all, element.id);

    const label = new Text({
      text: toDisplayName(element.data.name) || "Domain",
      style: {
        fontSize: 12,
        fontWeight: "bold",
        fontFamily: '"Geist Mono", monospace',
        fill: color,
      },
      resolution: context.textResolution,
    });
    label.x = 12;
    label.y = (DOMAIN_LABEL_HEIGHT - 14) / 2 + 1;
    container.addChild(label);

    if (children.length === 0) {
      const hint = new Text({
        text: "Drop cards here",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x52525b : 0xc4c4c8,
        },
        resolution: context.textResolution,
      });
      hint.x = 12;
      hint.y = DOMAIN_LABEL_HEIGHT + 8;
      container.addChild(hint);
    }
  },

  getInlineEditTarget: (element, localPoint): InlineEditState | null => {
    if (localPoint.y > DOMAIN_LABEL_HEIGHT) return null;
    return {
      elementId: element.id,
      worldBounds: {
        x: element.x + 8,
        y: element.y + 4,
        width: Math.max(80, element.width - 16),
        height: 22,
      },
      initialValue: toDisplayName(element.data?.name) || "Domain",
      multiline: false,
      onCommit: (newValue) => {
        const trimmed = newValue.trim();
        if (trimmed && !isSameIdentifier(trimmed, element.data?.name)) {
          useCanvasStore.getState().updateElement(element.id, {
            data: { ...element.data, name: trimmed },
          });
        }
      },
    };
  },
};
