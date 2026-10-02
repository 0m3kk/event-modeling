import { Container, Graphics, Text } from "pixi.js";
import type { CanvasObject, ModelData, ModelNodeKind } from "@/types";
import { APP_FONT_FAMILY } from "@/constants/canvas";
import { MODEL_KIND_COLORS, MODEL_KIND_LABELS } from "@/constants/model";
import { DEFAULT_ANY_TYPE, DEFAULT_FIELD_TYPE } from "@/constants/fieldType";
import type { CardHitZone, RenderResult } from "./types";
import { drawHeaderKindIcon } from "./headerIcons";
import { drawInfoBadge } from "./infoBadge";
import { drawLinkBadge } from "./linkBadge";
import {
  computeTypeZoneWidth,
  drawFieldKindIcon,
  drawFieldTypePill,
  getModelKindHex,
} from "./fieldTypePill";
import { resolveTargetModel } from "@/utils/modelResolution";
import {
  describeValidationRules,
  hasValidationRules,
} from "@/utils/fieldValidation";

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
    allObjects?: CanvasObject[] | Map<string, CanvasObject>,
    isDark: boolean = false,
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
            color: isDark ? 0x1e3a8a : 0xdbeafe,
          });
        }

        // Dynamic width for type zone
        const rawType = field.fieldType || DEFAULT_FIELD_TYPE;
        const targetModel = resolveTargetModel(allObjects, rawType);
        const isModel = Boolean(targetModel && targetModel.modelData);
        const typeZoneW = computeTypeZoneWidth(rawType, isModel);
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
            fill: isDark ? 0xf4f4f5 : 0x1e293b,
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
        drawFieldTypePill({
          g,
          container,
          rawType,
          x: typeZoneX,
          y: rowY + 3,
          w: typeZoneW,
          h: 20,
          targetModel,
          textResolution,
          isDark,
        });

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

        if (
          field.description ||
          hasValidationRules(field.validation) ||
          selectedFieldId === field.id
        ) {
          const hasDesc = Boolean(field.description);
          const hasValidation = hasValidationRules(field.validation);
          const rowInfoX = typeZoneX - 16;

          if (
            (hasValidation || selectedFieldId === field.id) &&
            rowInfoX - 14 > 30
          ) {
            const validationX = rowInfoX - 14;
            drawInfoBadge(g, container, validationX, rowY + 13, {
              radius: 5,
              stroke: hasValidation ? 0x86efac : 0x94a3b8,
              fill: hasValidation ? 0x15803d : 0x64748b,
              fontSize: 8,
              bold: true,
              glyph: "✓",
              alpha: hasValidation ? 1 : 0.5,
              textResolution,
            });

            hitZones.push({
              type: "validation",
              bounds: { x: validationX - 8, y: rowY + 5, width: 16, height: 16 },
              fieldId: field.id,
              currentText: hasValidation
                ? describeValidationRules(field.validation)
                : "Add validation rules",
            });
          }

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
            color: isDark ? 0x1e3a8a : 0xdbeafe,
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
            fill: isDark ? 0xf4f4f5 : 0x1e293b,
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
      const itemType = data.itemType || DEFAULT_ANY_TYPE;
      const targetModel = resolveTargetModel(allObjects, itemType);
      const isModel = Boolean(targetModel && targetModel.modelData);
      const targetKind = targetModel?.modelData?.kind || "object";
      const kindHex = isModel ? getModelKindHex(targetKind) : (isDark ? 0xf87171 : 0xb91c1c);
      const bgHex = isModel ? kindHex : (isDark ? 0x450a0a : 0xfef2f2);
      const strokeHex = isModel ? kindHex : (isDark ? 0x7f1d1d : 0xfecaca);
      const hasValidation = hasValidationRules(data.validation);
      const showValidationBadge = hasValidation || isSelected;
      const maxItemChars = Math.max(
        6,
        Math.floor(
          (w - (isModel ? 96 : 80) - (showValidationBadge ? 20 : 0)) / 6.5,
        ),
      );
      const displayType = `${truncateText(itemType, maxItemChars)}[]`;

      g.roundRect(10, rowY + 3, w - 20, 24, 4)
        .fill({ color: bgHex, alpha: isModel ? (isDark ? 0.22 : 0.12) : 1 })
        .stroke({ color: strokeHex, alpha: isModel ? (isDark ? 0.55 : 0.45) : 1, width: 1 });

      let textStartX = 18;
      if (isModel) {
        drawFieldKindIcon(g, targetKind, 20, rowY + 15, kindHex);
        textStartX = 32;
      }

      const arrayText = new Text({
        text: `Array of: ${displayType}`,
        style: {
          fontSize: 11,
          fontWeight: "bold",
          fontFamily: APP_FONT_FAMILY,
          fill: kindHex,
        },
        resolution: textResolution,
      });
      arrayText.x = textStartX;
      arrayText.y = rowY + 7;
      container.addChild(arrayText);

      hitZones.push({
        type: "itemType",
        bounds: { x: 10, y: rowY, width: w - 20, height: rowHeight },
        currentText: itemType,
      });

      if (showValidationBadge) {
        const validationX = w - 18;
        drawInfoBadge(g, container, validationX, rowY + 15, {
          radius: 5,
          stroke: hasValidation ? 0x86efac : 0x94a3b8,
          fill: hasValidation ? 0x15803d : 0x64748b,
          fontSize: 8,
          bold: true,
          glyph: "✓",
          alpha: hasValidation ? 1 : 0.5,
          textResolution,
        });

        hitZones.push({
          type: "validation",
          bounds: { x: validationX - 8, y: rowY + 2, width: 16, height: rowHeight },
          currentText: hasValidation
            ? describeValidationRules(data.validation)
            : "Add validation rules",
        });
      }
    } else if (kind === "wrap") {
      const rowY = renderY;
      const innerType = data.innerType || DEFAULT_ANY_TYPE;
      const targetModel = resolveTargetModel(allObjects, innerType);
      const isModel = Boolean(targetModel && targetModel.modelData);
      const targetKind = targetModel?.modelData?.kind || "object";
      const kindHex = isModel ? getModelKindHex(targetKind) : (isDark ? 0xfacc15 : 0xa16207);
      const bgHex = isModel ? kindHex : (isDark ? 0x422006 : 0xfefce8);
      const strokeHex = isModel ? kindHex : (isDark ? 0x713f12 : 0xfef08a);
      const hasValidation = hasValidationRules(data.validation);
      const showValidationBadge = hasValidation || isSelected;
      const maxInnerChars = Math.max(
        6,
        Math.floor(
          (w - (isModel ? 76 : 60) - (showValidationBadge ? 20 : 0)) / 6.5,
        ),
      );
      const displayInner = truncateText(innerType, maxInnerChars);

      g.roundRect(10, rowY + 3, w - 20, 24, 4)
        .fill({ color: bgHex, alpha: isModel ? (isDark ? 0.22 : 0.12) : 1 })
        .stroke({ color: strokeHex, alpha: isModel ? (isDark ? 0.55 : 0.45) : 1, width: 1 });

      let textStartX = 18;
      if (isModel) {
        drawFieldKindIcon(g, targetKind, 20, rowY + 15, kindHex);
        textStartX = 32;
      }

      const wrapText = new Text({
        text: `Wrap: ${displayInner}`,
        style: {
          fontSize: 11,
          fontWeight: "bold",
          fontFamily: APP_FONT_FAMILY,
          fill: kindHex,
        },
        resolution: textResolution,
      });
      wrapText.x = textStartX;
      wrapText.y = rowY + 7;
      container.addChild(wrapText);

      hitZones.push({
        type: "innerType",
        bounds: { x: 10, y: rowY, width: w - 20, height: rowHeight },
        currentText: innerType,
      });

      if (showValidationBadge) {
        const validationX = w - 18;
        drawInfoBadge(g, container, validationX, rowY + 15, {
          radius: 5,
          stroke: hasValidation ? 0x86efac : 0x94a3b8,
          fill: hasValidation ? 0x15803d : 0x64748b,
          fontSize: 8,
          bold: true,
          glyph: "✓",
          alpha: hasValidation ? 1 : 0.5,
          textResolution,
        });

        hitZones.push({
          type: "validation",
          bounds: { x: validationX - 8, y: rowY + 2, width: 16, height: rowHeight },
          currentText: hasValidation
            ? describeValidationRules(data.validation)
            : "Add validation rules",
        });
      }
    }

    const finalHeight = Math.max(renderY + 10, 80);
    const bodyBgColor = isDark ? 0x18181b : 0xffffff;
    const bodyStrokeColor = isSelected ? 0x3b82f6 : isDark ? 0x27272a : 0xe2e8f0;
    bgGraphics
      .roundRect(0, 0, w, finalHeight, r)
      .fill({ color: bodyBgColor })
      .stroke({
        color: bodyStrokeColor,
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
