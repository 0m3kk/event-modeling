import { Container, Graphics, Text } from "pixi.js";
import type { CanvasObject, ModelData, ModelNodeKind } from "@/types";
import { APP_FONT_FAMILY } from "@/constants/canvas";
import { MODEL_KIND_COLORS, MODEL_KIND_LABELS } from "@/constants/model";
import type { CardHitZone, RenderResult } from "./types";
import { drawHeaderKindIcon } from "./headerIcons";
import { drawInfoBadge } from "./infoBadge";
import { drawLinkBadge } from "./linkBadge";

function truncateText(str: string, maxLen: number): string {
  if (!str) return "";
  if (maxLen <= 1) return str.slice(0, 1);
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

export class ModelNodeRenderer {
  public static draw(
    container: Container,
    obj: CanvasObject,
    textResolution: number,
    isSelected: boolean = false,
    selectedFieldId?: string,
  ): RenderResult {
    container.removeChildren();

    const data: ModelData = obj.modelData ?? {
      kind: "object",
      name: obj.text || "UntitledModel",
      fields: [],
    };

    const kind: ModelNodeKind = data.kind;
    const kindColorHex = MODEL_KIND_COLORS[kind] ?? "#0891b2";
    const headerColor = parseInt(kindColorHex.replace("#", "0x"), 16);
    const kindLabel = MODEL_KIND_LABELS[kind] ?? kind;
    const rawTitle = data.name || obj.text || kindLabel;

    const w = obj.width || 240;
    const r = 8;
    const hitZones: CardHitZone[] = [];

    const bgGraphics = new Graphics();
    container.addChild(bgGraphics);

    const g = new Graphics();
    container.addChild(g);

    const headerHeight = 34;
    const rowHeight = 26;

    // Header Hit Zone
    hitZones.push({
      type: "header",
      bounds: { x: 0, y: 0, width: w, height: headerHeight },
      currentText: data.name || "",
    });

    const fields = data.fields ?? [];
    const values = data.values ?? [];

    // Draw Header
    g.roundRect(0, 0, w, headerHeight, r).fill({ color: headerColor });
    g.rect(0, headerHeight - r, w, r).fill({ color: headerColor });

    // Header Right-edge elements: Kind Icon, Description Icon
    const iconCX = w - 18;
    const iconCY = headerHeight / 2;
    drawHeaderKindIcon(g, kind, iconCX, iconCY, 0xffffff);

    let rightEdgeBoundary = iconCX - 12;

    // Header Description Indicator — muted "add info" affordance on the
    // selected node when no description exists yet.
    if (data.description || isSelected) {
      const hasDesc = Boolean(data.description);
      const infoX = rightEdgeBoundary - 18;
      const infoY = 9;
      drawInfoBadge(g, container, infoX + 7, infoY + 7, {
        radius: 7,
        stroke: 0xffffff,
        strokeWidth: 1.2,
        fill: 0xffffff,
        fontSize: 9,
        bold: true,
        alpha: hasDesc ? 1 : 0.5,
        textResolution,
      });

      hitZones.push({
        type: "desc",
        bounds: { x: infoX, y: infoY, width: 16, height: 16 },
        currentText: data.description,
      });

      rightEdgeBoundary = infoX - 6;
    }

    // Header Title on left edge (vertically centered)
    const maxTitleChars = Math.max(
      8,
      Math.floor((rightEdgeBoundary - 14) / 7.5),
    );
    const displayTitle = truncateText(rawTitle, maxTitleChars);

    const titleText = new Text({
      text: displayTitle,
      style: {
        fontSize: 13,
        fontWeight: "bold",
        fontFamily: APP_FONT_FAMILY,
        fill: 0xffffff,
      },
      resolution: textResolution,
    });
    titleText.x = 12;
    titleText.y = 8;
    container.addChild(titleText);

    // 3. Draw Body Rows
    let renderY = headerHeight + 6;

    if (kind === "object") {
      for (const field of fields) {
        const rowY = renderY;

        // Draw selection highlight for this row
        if (selectedFieldId && field.id === selectedFieldId) {
          g.roundRect(4, rowY + 1, w - 8, rowHeight - 2, 4).fill({
            color: 0xdbeafe,
          });
        }

        // Dynamic width for type zone
        const rawType = field.fieldType || "string";
        const typeZoneW = Math.min(88, Math.max(65, rawType.length * 6.5 + 14));
        const typeZoneX = w - typeZoneW - 8;

        // Available space for field name
        const availableNameWidth = typeZoneX - 24;
        const maxNameChars = Math.max(6, Math.floor(availableNameWidth / 7.2));
        const displayName = truncateText(field.name, maxNameChars);

        // Field Name
        const nameText = new Text({
          text: `• ${displayName}`,
          style: {
            fontSize: 11,
            fontWeight: "500",
            fontFamily: APP_FONT_FAMILY,
            fill: 0x1e293b,
          },
          resolution: textResolution,
        });
        nameText.x = 10;
        nameText.y = rowY + 5;
        container.addChild(nameText);

        const renderedNameWidth = displayName.length * 6.8 + 14;
        // Full-row selection zone (specific zones pushed later take priority)
        hitZones.push({
          type: "fieldName",
          bounds: {
            x: 0,
            y: rowY,
            width: w,
            height: rowHeight,
          },
          fieldId: field.id,
          currentText: field.name,
        });

        // Required Asterisk
        if (field.required) {
          const reqText = new Text({
            text: "*",
            style: {
              fontSize: 12,
              fontWeight: "bold",
              fontFamily: APP_FONT_FAMILY,
              fill: 0xef4444,
            },
            resolution: textResolution,
          });
          reqText.x = nameText.x + renderedNameWidth + 2;
          reqText.y = rowY + 3;
          container.addChild(reqText);
        }

        // Field Type zone
        const maxTypeChars = Math.floor((typeZoneW - 12) / 6.2);
        const displayType = truncateText(rawType, maxTypeChars);

        g.roundRect(typeZoneX, rowY + 3, typeZoneW, 20, 3)
          .fill({ color: 0xf8fafc })
          .stroke({ color: 0xe2e8f0, width: 1 });

        const typeText = new Text({
          text: displayType,
          style: {
            fontSize: 10,
            fontFamily: APP_FONT_FAMILY,
            fill: 0x475569,
          },
          resolution: textResolution,
        });
        typeText.x = typeZoneX + 6;
        typeText.y = rowY + 6;
        container.addChild(typeText);

        hitZones.push({
          type: "fieldType",
          bounds: {
            x: typeZoneX,
            y: rowY,
            width: typeZoneW,
            height: rowHeight,
          },
          fieldId: field.id,
          currentText: field.fieldType,
        });

        if (field.description || selectedFieldId === field.id) {
          const hasDesc = Boolean(field.description);
          const rowInfoX = typeZoneX - 16;
          if (rowInfoX > 30) {
            drawInfoBadge(g, container, rowInfoX, rowY + 13, {
              radius: 5,
              stroke: 0x94a3b8,
              fill: 0x64748b,
              fontSize: 7,
              alpha: hasDesc ? 1 : 0.5,
              textResolution,
            });

            hitZones.push({
              type: "desc",
              bounds: { x: rowInfoX - 8, y: rowY + 5, width: 16, height: 16 },
              fieldId: field.id,
              currentText: field.description,
            });
          }
        }

        renderY += rowHeight;
      }
    } else if (kind === "enum") {
      const maxValChars = Math.max(8, Math.floor((w - 38) / 6.5));
      for (const val of values) {
        const rowY = renderY;

        // Draw selection highlight for this row
        if (selectedFieldId && val.id === selectedFieldId) {
          g.roundRect(4, rowY + 1, w - 8, rowHeight - 2, 4).fill({
            color: 0xdbeafe,
          });
        }

        const rawVal = val.name || val.value || "(empty)";
        const displayVal = truncateText(rawVal, maxValChars);

        // Colored enum bullet
        g.circle(16, rowY + 12, 3.5).fill({ color: headerColor });

        const valText = new Text({
          text: displayVal,
          style: {
            fontSize: 11,
            fontFamily: APP_FONT_FAMILY,
            fill: 0x1e293b,
          },
          resolution: textResolution,
        });
        valText.x = 26;
        valText.y = rowY + 5;
        container.addChild(valText);

        hitZones.push({
          type: "enumValue",
          bounds: { x: 0, y: rowY, width: w, height: rowHeight },
          valueId: val.id,
          currentText: rawVal,
        });

        if (val.description || selectedFieldId === val.id) {
          const hasDesc = Boolean(val.description);
          const rowInfoX = w - 20;
          drawInfoBadge(g, container, rowInfoX, rowY + 13, {
            radius: 5,
            stroke: 0x94a3b8,
            fill: 0x64748b,
            fontSize: 7,
            alpha: hasDesc ? 1 : 0.5,
            textResolution,
          });

          hitZones.push({
            type: "desc",
            bounds: { x: rowInfoX - 8, y: rowY + 5, width: 16, height: 16 },
            valueId: val.id,
            currentText: val.description,
          });
        }

        renderY += rowHeight;
      }
    } else if (kind === "array") {
      const rowY = renderY;
      const itemType = data.itemType || "any";
      const maxItemChars = Math.max(6, Math.floor((w - 80) / 6.5));
      const displayType = `${truncateText(itemType, maxItemChars)}[]`;

      g.roundRect(10, rowY + 3, w - 20, 24, 4)
        .fill({ color: 0xfef2f2 })
        .stroke({ color: 0xfecaca, width: 1 });

      const arrayText = new Text({
        text: `Array of: ${displayType}`,
        style: {
          fontSize: 11,
          fontWeight: "bold",
          fontFamily: APP_FONT_FAMILY,
          fill: 0xb91c1c,
        },
        resolution: textResolution,
      });
      arrayText.x = 18;
      arrayText.y = rowY + 7;
      container.addChild(arrayText);

      hitZones.push({
        type: "itemType",
        bounds: { x: 10, y: rowY, width: w - 20, height: rowHeight },
        currentText: itemType,
      });
    } else if (kind === "wrap") {
      const rowY = renderY;
      const innerType = data.innerType || "any";
      const maxInnerChars = Math.max(6, Math.floor((w - 60) / 6.5));
      const displayInner = truncateText(innerType, maxInnerChars);

      g.roundRect(10, rowY + 3, w - 20, 24, 4)
        .fill({ color: 0xfefce8 })
        .stroke({ color: 0xfef08a, width: 1 });

      const wrapText = new Text({
        text: `Wrap: ${displayInner}`,
        style: {
          fontSize: 11,
          fontWeight: "bold",
          fontFamily: APP_FONT_FAMILY,
          fill: 0xa16207,
        },
        resolution: textResolution,
      });
      wrapText.x = 18;
      wrapText.y = rowY + 7;
      container.addChild(wrapText);

      hitZones.push({
        type: "innerType",
        bounds: { x: 10, y: rowY, width: w - 20, height: rowHeight },
        currentText: innerType,
      });
    }

    const finalHeight = Math.max(renderY + 10, 80);
    bgGraphics
      .roundRect(0, 0, w, finalHeight, r)
      .fill({ color: 0xffffff })
      .stroke({
        color: isSelected ? 0x3b82f6 : 0xe2e8f0,
        width: isSelected ? 2 : 1.5,
      });

    obj.height = finalHeight;

    // Reference-copy badge — marks a node linked to a reference set (content
    // stays in sync across copies). Drawn last so it sits above the header.
    if (obj.referenceId) {
      drawLinkBadge(g, w - 3, 3, {
        radius: 9,
        fill: 0x0d99ff,
        glyph: 0xffffff,
      });
    }

    return {
      height: finalHeight,
      hitZones,
    };
  }
}
