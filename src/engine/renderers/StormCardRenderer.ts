import { Container, Graphics, Text } from "pixi.js";
import type { CanvasObject, StormData, StormField, StormKind } from "@/types";
import { APP_FONT_FAMILY } from "@/constants/canvas";
import {
  STORM_KIND_LABELS,
  STORM_PHASE_COLORS,
  STORM_PHASE_LABELS,
  stormAccentColor,
  stormHasFieldTypes,
  stormHasAction,
  stormHasInputFields,
  stormHasParamsSection,
  stormHasQueryItems,
  stormHasResponseFields,
  stormHasTags,
  stormHasValidation,
} from "@/constants/storm";
import type { CardHitZone, RenderResult } from "./types";
import { drawActionIcon, drawHeaderKindIcon } from "./headerIcons";
import { drawInfoBadge } from "./infoBadge";
import { drawLinkBadge } from "./linkBadge";
import { hasValidationRules, describeValidationRules } from "@/utils/fieldValidation";
import {
  computeTypeZoneWidth,
  drawFieldTypePill,
} from "./fieldTypePill";
import { resolveTargetModel } from "@/utils/modelResolution";
import {
  computeStormQueryItemHeight,
  computeStormConstraintItemLines,
} from "@/utils/cardDimensions";
import { getActorPermissions } from "@/utils/stormAuth";

function truncateText(str: string, maxLen: number): string {
  if (!str) return "";
  if (maxLen <= 1) return str.slice(0, 1);
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

export class StormCardRenderer {
  public static draw(
    container: Container,
    obj: CanvasObject,
    textResolution: number,
    isSelected: boolean = false,
    selectedFieldId?: string,
    allObjects?: CanvasObject[] | Map<string, CanvasObject>,
  ): RenderResult {
    container.removeChildren();

    const data: StormData = obj.stormData ?? {
      kind: "command",
      name: obj.text || "Untitled",
      fields: [],
    };

    const kind: StormKind = data.kind;
    // BDD cards take the color of their phase so Given/When/Then reads at a glance
    const headerColor = parseInt(
      stormAccentColor(kind, data.phase).replace("#", "0x"),
      16,
    );
    const kindLabel = STORM_KIND_LABELS[kind] ?? kind;
    const rawTitle = data.name || obj.text || kindLabel;
    const isArray = Boolean(data.isArray);
    const fullTitle = isArray && rawTitle ? `${rawTitle}[]` : rawTitle;

    const w = obj.width || 260;
    const r = 8;
    const hitZones: CardHitZone[] = [];

    const bgGraphics = new Graphics();
    container.addChild(bgGraphics);

    const g = new Graphics();
    container.addChild(g);

    // Header dimensions
    const headerHeight = 36;
    let currentY = 0;

    // Header Hit Zone
    hitZones.push({
      type: "header",
      bounds: { x: 0, y: 0, width: w, height: headerHeight },
      currentText: data.name || "",
    });

    currentY += headerHeight;

    // Authorization action (Command / Query) is surfaced as a header badge
    // (left of the ⓘ description badge) instead of a dedicated row, so the
    // body starts right below the header. The action value is revealed on
    // hover by ActionTooltip.
    const hasAction = Boolean(data.action && stormHasAction(kind));

    // Measure body content
    const fields = data.fields ?? [];
    const inputFields = data.inputFields ?? [];
    const outputFields = data.outputFields ?? [];
    const responseFields = data.responseFields ?? [];
    const queryItems = data.queryItems ?? [];
    const constraints = data.constraints ?? [];

    // BDD (Given/When/Then) cards render the same field list as Event/Command —
    // types included — with the phase shown as their header badge.
    const hasTypes = stormHasFieldTypes(kind);
    const rowHeight = 26;
    const sectionLabelHeight = 22;

    const hasParams = stormHasParamsSection(kind);
    const hasResponse = stormHasResponseFields(kind);
    const hasInputOutput = stormHasInputFields(kind);
    const isActor = kind === "actor";
    const isConstraint = kind === "constraint";

    // Draw Header
    g.roundRect(0, 0, w, headerHeight, r).fill({ color: headerColor });
    g.rect(0, headerHeight - r, w, r).fill({ color: headerColor });

    // Header Right-edge elements: Kind Icon, BDD Badge, Description Icon
    const iconCX = w - 18;
    const iconCY = headerHeight / 2;
    drawHeaderKindIcon(g, kind, iconCX, iconCY, 0xffffff);

    let rightEdgeBoundary = iconCX - 12;

    // Header BDD Phase badge (GIVEN / WHEN / THEN)
    if (data.phase) {
      const phase = data.phase;
      const phaseLabel = STORM_PHASE_LABELS[phase] ?? phase.toUpperCase();
      const phaseColorHex = STORM_PHASE_COLORS[phase] ?? "#000000";

      const badgeWidth = phaseLabel.length * 6 + 12;
      const badgeX = rightEdgeBoundary - badgeWidth;
      const badgeY = 9;

      g.roundRect(badgeX, badgeY, badgeWidth, 18, 9)
        .fill({ color: 0xffffff })
        .stroke({
          color: parseInt(phaseColorHex.replace("#", "0x"), 16),
          width: 1.5,
        });

      const phaseText = new Text({
        text: phaseLabel,
        style: {
          fontSize: 9,
          fontWeight: "bold",
          fontFamily: APP_FONT_FAMILY,
          fill: parseInt(phaseColorHex.replace("#", "0x"), 16),
        },
        resolution: textResolution,
      });
      phaseText.x = badgeX + 6;
      phaseText.y = badgeY + 3;
      container.addChild(phaseText);

      rightEdgeBoundary = badgeX - 6;
    }

    if (data.description || isSelected) {
      // Header ⓘ description indicator. Muted "add info" affordance on the
      // selected card when no description exists yet.
      const hasDesc = Boolean(data.description);
      const infoX = rightEdgeBoundary - 18;
      const infoY = 11;
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

    // Header authorization-action indicator. Mirrors the ⓘ description badge:
    // it sits to its left and reveals the action on hover rather than taking a
    // row on the card. Setting the action stays in the options bar.
    if (hasAction && data.action) {
      const actionX = rightEdgeBoundary - 18;
      const actionY = 11;
      drawActionIcon(g, actionX + 7, actionY + 7, 0xffffff, 1);

      hitZones.push({
        type: "action",
        bounds: { x: actionX, y: actionY, width: 16, height: 16 },
        currentText: data.action,
      });

      rightEdgeBoundary = actionX - 6;
    }

    // Header Title on the left edge (vertically centered)
    const maxTitleChars = Math.max(
      8,
      Math.floor((rightEdgeBoundary - 14) / 7.5),
    );
    const displayTitle = truncateText(fullTitle, maxTitleChars);

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
    titleText.y = 9;
    container.addChild(titleText);

    // 4. Render Body Fields
    let renderY = currentY + 6;

    const renderFieldList = (
      fieldList: StormField[],
      section: "params" | "response",
      showTags: boolean,
    ) => {
      for (const field of fieldList) {
        const rowY = renderY;

        // Command payload fields / Query params can carry input validation;
        // the row shows a small green check badge when any rule is set. Query
        // Response fields are excluded by the `params` band check.
        const hasValidation =
          section === "params" &&
          stormHasValidation(kind) &&
          hasValidationRules(field.validation);

        // Draw selection highlight for this row
        if (selectedFieldId && field.id === selectedFieldId) {
          g.roundRect(4, rowY + 1, w - 8, rowHeight - 2, 4).fill({
            color: 0xdbeafe,
          });
        }

        // Dynamic widths for type zone and tag pill
        const rawType = field.fieldType || "string";
        const targetModel = resolveTargetModel(allObjects, rawType);
        const isModel = Boolean(targetModel && targetModel.modelData);
        const typeZoneW = hasTypes
          ? computeTypeZoneWidth(rawType, isModel)
          : 0;
        const typeZoneX = w - typeZoneW - 8;

        // Tag Pill (event, state, constraint, bdd) — only on the input band;
        // projected output fields never carry tags. The pill is sized to the
        // full tag text (never truncated): a long tag can run past the row, so
        // the user widens the card to give it room.
        const hasTag = Boolean(showTags && field.tag && stormHasTags(kind));
        const rawTag = field.tag || "";
        const tagPillW = hasTag
          ? Math.max(36, (rawTag.length + 1) * 6 + 14)
          : 0;
        const tagPillX = hasTag
          ? hasTypes
            ? typeZoneX - tagPillW - 6
            : w - tagPillW - 10
          : w - 10;

        // Calculate available space for field name
        const availableNameWidth = hasTag
          ? tagPillX - 22
          : hasTypes
            ? typeZoneX - 22
            : w - 24;

        const maxNameChars = Math.max(6, Math.floor(availableNameWidth / 7.2));
        const displayName = truncateText(field.name, maxNameChars);

        // Field Name Text
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
        // Full-row selection zone: clicking anywhere on the row selects the
        // field (specific zones below — tag, type, ⓘ — are pushed later and
        // therefore take priority in the reverse hit test).
        hitZones.push({
          type: "fieldName",
          bounds: {
            x: 0,
            y: rowY,
            width: w,
            height: rowHeight,
          },
          fieldId: field.id,
          section,
          currentText: field.name,
        });

        // Required asterisk
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

        // Draw Tag Pill (distinctive capsule badge with warm orange tint & # prefix)
        if (hasTag) {
          const displayTag = rawTag;
          const tagPillH = 18;
          const tagPillY = rowY + Math.round((rowHeight - tagPillH) / 2);

          g.roundRect(tagPillX, tagPillY, tagPillW, tagPillH, tagPillH / 2)
            .fill({ color: 0xffedd5 })
            .stroke({ color: 0xfdba74, width: 1 });

          const tagText = new Text({
            text: `#${displayTag}`,
            style: {
              fontSize: 9.5,
              fontWeight: "600",
              fontFamily: APP_FONT_FAMILY,
              fill: 0x9a3412,
            },
            resolution: textResolution,
          });
          tagText.anchor.set(0.5, 0.5);
          tagText.x = tagPillX + tagPillW / 2;
          tagText.y = tagPillY + tagPillH / 2;
          container.addChild(tagText);

          hitZones.push({
            type: "fieldTag",
            bounds: {
              x: tagPillX,
              y: rowY,
              width: tagPillW,
              height: rowHeight,
            },
            fieldId: field.id,
            section,
            currentText: field.tag,
          });
        }

        // Draw Type Zone
        if (hasTypes) {
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
            section,
            currentText: field.fieldType,
          });
        }

        // Row badges sit just left of the type zone and mirror the ⓘ
        // description affordance:
        // - ⓘ shows whenever the row has a description or is selected
        // - ✓ shows whenever the Command field / Query param has rules (or is
        //   selected), dimmed when no rules are set so it doubles as an
        //   "add validation" cue
        const showDescBadge =
          Boolean(field.description) || selectedFieldId === field.id;
        const showValidationBadge =
          stormHasValidation(kind) &&
          section === "params" &&
          (hasValidation || selectedFieldId === field.id);

        if (showDescBadge || showValidationBadge) {
          const hasDesc = Boolean(field.description);
          const rowInfoX = (hasTag ? tagPillX : typeZoneX) - 14;

          if (showValidationBadge && rowInfoX - 14 > 30) {
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

            // Hovering the badge reveals the rules; clicking opens the panel.
            hitZones.push({
              type: "validation",
              bounds: { x: validationX - 8, y: rowY + 5, width: 16, height: 16 },
              fieldId: field.id,
              section,
              currentText: hasValidation
                ? describeValidationRules(field.validation)
                : "Add validation rules",
            });
          }

          if (showDescBadge && rowInfoX > 30) {
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
              section,
              currentText: field.description,
            });
          }
        }

        renderY += rowHeight;
      }
    };

    if (isActor) {
      const actorPerms = getActorPermissions(data);
      const maxPermChars = Math.max(8, Math.floor((w - 32) / 6.5));
      for (let pIdx = 0; pIdx < actorPerms.length; pIdx++) {
        const perm = actorPerms[pIdx];
        const rowY = renderY;
        const displayPerm = truncateText(perm, maxPermChars);
        const permText = new Text({
          text: `🔑 ${displayPerm}`,
          style: {
            fontSize: 11,
            fontFamily: APP_FONT_FAMILY,
            fill: 0x334155,
          },
          resolution: textResolution,
        });
        permText.x = 10;
        permText.y = rowY + 5;
        container.addChild(permText);

        hitZones.push({
          type: "fieldName",
          bounds: { x: 0, y: rowY, width: w, height: rowHeight },
          fieldId: `perm-${pIdx}`,
          currentText: perm,
        });

        renderY += rowHeight;
      }
    } else if (hasInputOutput) {
      // State/Constraint INPUT params. Their tags are the only tags a Query
      // Item can filter on. Output fields render later, after Query Items.
      if (inputFields.length > 0) {
        const pLabel = new Text({
          text: "PARAMS",
          style: {
            fontSize: 9,
            fontWeight: "bold",
            fontFamily: APP_FONT_FAMILY,
            fill: 0x94a3b8,
            letterSpacing: 0.5,
          },
          resolution: textResolution,
        });
        pLabel.x = 10;
        pLabel.y = renderY + 2;
        container.addChild(pLabel);
        renderY += sectionLabelHeight;
      }

      renderFieldList(inputFields, "params", true);
    } else {
      // Render Params
      if (hasParams && (fields.length > 0 || hasResponse)) {
        const pLabel = new Text({
          text: "PARAMS",
          style: {
            fontSize: 9,
            fontWeight: "bold",
            fontFamily: APP_FONT_FAMILY,
            fill: 0x94a3b8,
            letterSpacing: 0.5,
          },
          resolution: textResolution,
        });
        pLabel.x = 10;
        pLabel.y = renderY + 2;
        container.addChild(pLabel);
        renderY += sectionLabelHeight;
      }

      renderFieldList(fields, "params", stormHasTags(kind));

      // Render Response — the band is always present on Query cards, matching
      // the Params band (the original keeps both sections visible even when empty).
      if (hasResponse) {
        const rLabel = new Text({
          text: "RESPONSE",
          style: {
            fontSize: 9,
            fontWeight: "bold",
            fontFamily: APP_FONT_FAMILY,
            fill: 0x94a3b8,
            letterSpacing: 0.5,
          },
          resolution: textResolution,
        });
        rLabel.x = 10;
        rLabel.y = renderY + 4;
        container.addChild(rLabel);
        renderY += sectionLabelHeight;

        renderFieldList(responseFields, "response", false);
      }
    }

    // Render DCB Query Items (State and Constraint cards — "Related Events")
    if (stormHasQueryItems(kind) && queryItems.length > 0) {
      const qLabel = new Text({
        text: "QUERY ITEMS",
        style: {
          fontSize: 9,
          fontWeight: "bold",
          fontFamily: APP_FONT_FAMILY,
          fill: 0x7c3aed,
          letterSpacing: 0.5,
        },
        resolution: textResolution,
      });
      qLabel.x = 10;
      qLabel.y = renderY + 4;
      container.addChild(qLabel);
      renderY += sectionLabelHeight;

      for (const item of queryItems) {
        const rowY = renderY;
        const itemHeight = computeStormQueryItemHeight(item, inputFields);

        // Draw selection highlight for this row
        if (selectedFieldId && item.id === selectedFieldId) {
          g.roundRect(4, rowY + 1, w - 8, itemHeight - 2, 4).fill({
            color: 0xdbeafe,
          });
        }

        const itemTaggedFields = (item.tagFieldIds ?? [])
          .map((id) => inputFields.find((f) => f.id === id))
          .filter((f): f is StormField => Boolean(f && f.tag && f.tag.trim()));

        // 1. Right side: render tags stacked vertically as {tag}:{field}
        let maxTagW = 0;
        for (let tIdx = 0; tIdx < itemTaggedFields.length; tIdx++) {
          const tf = itemTaggedFields[tIdx];
          const rawTagText = `${tf.tag!.trim()}:${tf.name.trim()}`;
          const tagPillW = Math.max(
            40,
            (rawTagText.length + 1) * 6.0 + 14,
          );
          maxTagW = Math.max(maxTagW, tagPillW);
          const tagPillX = w - tagPillW - 10;
          const tagY = rowY + 4 + tIdx * 22;

          g.roundRect(tagPillX, tagY, tagPillW, 18, 9)
            .fill({ color: 0xffedd5 })
            .stroke({ color: 0xfdba74, width: 1 });

          const tagText = new Text({
            text: rawTagText,
            style: {
              fontSize: 9.5,
              fontWeight: "600",
              fontFamily: APP_FONT_FAMILY,
              fill: 0x9a3412,
            },
            resolution: textResolution,
          });
          tagText.anchor.set(0.5, 0.5);
          tagText.x = tagPillX + tagPillW / 2;
          tagText.y = tagY + 9;
          container.addChild(tagText);
        }

        // 2. Left side: render event types stacked vertically
        const displayEvents = item.types.length > 0 ? item.types : ["*"];
        const availableEventWidth =
          itemTaggedFields.length > 0 ? w - maxTagW - 28 : w - 24;
        const maxEventChars = Math.max(6, Math.floor(availableEventWidth / 6.5));

        for (let eIdx = 0; eIdx < displayEvents.length; eIdx++) {
          const eventY = rowY + 5 + eIdx * 22;
          const isFirst = eIdx === 0;
          const evName = displayEvents[eIdx];
          const displayEv = truncateText(evName, maxEventChars);

          const qText = new Text({
            text: isFirst ? `◒ [${displayEv}]` : `[${displayEv}]`,
            style: {
              fontSize: 10,
              fontWeight: "bold",
              fontFamily: APP_FONT_FAMILY,
              fill: 0x6d28d9,
            },
            resolution: textResolution,
          });
          qText.x = isFirst ? 10 : 22;
          qText.y = eventY;
          container.addChild(qText);
        }

        const typesStr = item.types.length > 0 ? item.types.join(", ") : "*";
        hitZones.push({
          type: "queryItem",
          bounds: { x: 0, y: rowY, width: w, height: itemHeight },
          queryItemId: item.id,
          currentText: typesStr,
        });

        renderY += itemHeight;
      }
    }

    // OUTPUT fields (State/Constraint): the read-model shape obtained by
    // rehydrating the events selected by the Query Items. Rendered after the
    // Query Items, without tags (only input params carry tags).
    if (hasInputOutput && outputFields.length > 0) {
      const oLabel = new Text({
        text: "FIELDS",
        style: {
          fontSize: 9,
          fontWeight: "bold",
          fontFamily: APP_FONT_FAMILY,
          fill: 0x94a3b8,
          letterSpacing: 0.5,
        },
        resolution: textResolution,
      });
      oLabel.x = 10;
      oLabel.y = renderY + 4;
      container.addChild(oLabel);
      renderY += sectionLabelHeight;

      renderFieldList(outputFields, "response", false);
    }

    // Render Constraints
    if (isConstraint && constraints.length > 0) {
      const cLabel = new Text({
        text: "CONSTRAINTS",
        style: {
          fontSize: 9,
          fontWeight: "bold",
          fontFamily: APP_FONT_FAMILY,
          fill: 0x0f766e,
          letterSpacing: 0.5,
        },
        resolution: textResolution,
      });
      cLabel.x = 10;
      cLabel.y = renderY + 4;
      container.addChild(cLabel);
      renderY += sectionLabelHeight;

      const textX = 22;
      const wrapWidth = Math.max(40, w - textX - 10);
      for (const c of constraints) {
        const rowY = renderY;
        const rawText = c.text || "";
        const displayText = rawText.startsWith("•")
          ? rawText.replace(/^•\s*/, "")
          : rawText;

        const bullet = new Text({
          text: "•",
          style: {
            fontSize: 10,
            fontFamily: APP_FONT_FAMILY,
            fill: 0x134e4a,
          },
          resolution: textResolution,
        });
        bullet.x = 10;
        bullet.y = rowY + 5;

        const cText = new Text({
          text: displayText,
          style: {
            fontSize: 10,
            fontFamily: APP_FONT_FAMILY,
            fill: 0x134e4a,
            wordWrap: true,
            wordWrapWidth: wrapWidth,
            lineHeight: 14,
            breakWords: true,
          },
          resolution: textResolution,
        });

        const textHeight =
          typeof document !== "undefined"
            ? (() => {
                try {
                  return cText.height || 14;
                } catch {
                  return computeStormConstraintItemLines(displayText, w) * 14;
                }
              })()
            : computeStormConstraintItemLines(displayText, w) * 14;

        const itemHeight = Math.max(rowHeight, Math.ceil(textHeight) + 12);

        // Draw selection highlight for this row
        if (selectedFieldId && c.id === selectedFieldId) {
          g.roundRect(4, rowY + 1, w - 8, itemHeight - 2, 4).fill({
            color: 0xdbeafe,
          });
        }

        cText.x = textX;
        cText.y = rowY + 5;
        container.addChild(bullet);
        container.addChild(cText);

        hitZones.push({
          type: "constraint",
          bounds: { x: 0, y: rowY, width: w, height: itemHeight },
          constraintId: c.id,
          currentText: c.text,
        });

        renderY += itemHeight;
      }
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

    // Reference-copy badge — marks a card linked to a reference set (content
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
