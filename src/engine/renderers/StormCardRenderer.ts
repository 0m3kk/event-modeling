import { Container, Graphics, Text } from "pixi.js";
import type { CanvasObject, StormData, StormField, StormKind } from "@/types";
import { APP_FONT_FAMILY } from "@/constants/canvas";
import { DEFAULT_FIELD_TYPE } from "@/constants/fieldType";
import {
  STORM_KIND_LABELS,
  STORM_PHASE_COLORS,
  STORM_PHASE_DARK_COLORS,
  STORM_PHASE_LABELS,
  BDD_STEP_REF_COLORS,
  BDD_STEP_REF_LABELS,
  stormAccentColor,
  stormHasFieldTypes,
  stormHasAction,
  stormHasInputFields,
  stormHasParamsSection,
  stormHasQueryItems,
  stormHasResponseFields,
  stormHasSteps,
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
  computeBddStepHeight,
  BDD_STEP_HEADER_HEIGHT,
  BDD_STEP_PAYLOAD_ROW_HEIGHT,
  BDD_STEP_GAP,
  BDD_STEP_PLACEHOLDER_HEIGHT,
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
    isDark: boolean = false,
    objectsById?: Map<string, CanvasObject>,
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
      stormAccentColor(kind, data.phase, isDark).replace("#", "0x"),
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
    drawHeaderKindIcon(g, kind, iconCX, iconCY, isDark ? 0xe4e4e7 : 0xffffff);

    let rightEdgeBoundary = iconCX - 12;

    // Header BDD Phase badge (GIVEN / WHEN / THEN)
    if (data.phase) {
      const phase = data.phase;
      const phaseLabel = STORM_PHASE_LABELS[phase] ?? phase.toUpperCase();
      const phaseColorHex = isDark
        ? (STORM_PHASE_DARK_COLORS[phase] ?? "#000000")
        : (STORM_PHASE_COLORS[phase] ?? "#000000");

      const badgeWidth = phaseLabel.length * 6 + 12;
      const badgeX = rightEdgeBoundary - badgeWidth;
      const badgeY = 9;

      g.roundRect(badgeX, badgeY, badgeWidth, 18, 9)
        .fill({ color: isDark ? 0x27272a : 0xffffff })
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
        stroke: isDark ? 0xe4e4e7 : 0xffffff,
        strokeWidth: 1.2,
        fill: isDark ? 0xe4e4e7 : 0xffffff,
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
      drawActionIcon(g, actionX + 7, actionY + 7, isDark ? 0xe4e4e7 : 0xffffff, 1);

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
        fill: isDark ? 0xe4e4e7 : 0xffffff,
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
            color: isDark ? 0x1e3a8a : 0xdbeafe,
          });
        }

        // Dynamic widths for type zone and tag pill
        const rawType = field.fieldType || DEFAULT_FIELD_TYPE;
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
            fill: isDark ? 0xd4d4d8 : 0x1e293b,
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

          const tagBg = isDark ? 0x431407 : 0xffedd5;
          const tagStroke = isDark ? 0x9a3412 : 0xfdba74;
          const tagTextColor = isDark ? 0xfdba74 : 0x9a3412;

          g.roundRect(tagPillX, tagPillY, tagPillW, tagPillH, tagPillH / 2)
            .fill({ color: tagBg })
            .stroke({ color: tagStroke, width: 1 });

          const tagText = new Text({
            text: `#${displayTag}`,
            style: {
              fontSize: 9.5,
              fontWeight: "600",
              fontFamily: APP_FONT_FAMILY,
              fill: tagTextColor,
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
          let currentBadgeX = (hasTag ? tagPillX : typeZoneX) - 14;

          if (showValidationBadge && currentBadgeX > 30) {
            const validationX = currentBadgeX;
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

            currentBadgeX -= 14;
          }

          if (showDescBadge && currentBadgeX > 30) {
            const descX = currentBadgeX;
            drawInfoBadge(g, container, descX, rowY + 13, {
              radius: 5,
              stroke: 0x94a3b8,
              fill: 0x64748b,
              fontSize: 7,
              alpha: hasDesc ? 1 : 0.5,
              textResolution,
            });

            hitZones.push({
              type: "desc",
              bounds: { x: descX - 8, y: rowY + 5, width: 16, height: 16 },
              fieldId: field.id,
              section,
              currentText: field.description,
            });
          }
        }

        renderY += rowHeight;
      }
    };

    if (stormHasSteps(kind)) {
      // BDD (Given/When/Then) cards list scenario steps rather than field rows.
      // Each step is a named Event/Command/Query/State/Error plus the concrete
      // example values that describe the scenario (payloads are partial).
      const steps = data.steps ?? [];
      const refLabelMaxWidth = w - 40;

      if (steps.length === 0) {
        const hint = new Text({
          text: isSelected ? "+ Add step…" : "No steps yet",
          style: {
            fontSize: 11,
            fontFamily: APP_FONT_FAMILY,
            fill: isSelected ? 0x3b82f6 : (isDark ? 0x71717a : 0x94a3b8),
            fontStyle: isSelected ? "normal" : "italic",
          },
          resolution: textResolution,
        });
        hint.x = 12;
        hint.y = renderY + 6;
        container.addChild(hint);

        hitZones.push({
          type: "bddAddStep",
          bounds: {
            x: 0,
            y: renderY,
            width: w,
            height: BDD_STEP_PLACEHOLDER_HEIGHT,
          },
        });
        renderY += BDD_STEP_PLACEHOLDER_HEIGHT;
      }

      steps.forEach((step, stepIndex) => {
        const rowY = renderY;
        const stepHeight = computeBddStepHeight(step);
        const refColorHex = BDD_STEP_REF_COLORS[step.ref] ?? "#64748b";

        // Selection highlight for the whole step block.
        if (selectedFieldId && step.id === selectedFieldId) {
          g.roundRect(4, rowY - 1, w - 8, stepHeight + 2, 4).fill({
            color: isDark ? 0x1e3a8a : 0xdbeafe,
          });
        }

        // Ref icon + name row.
        const iconCX = 18;
        const iconCY = rowY + BDD_STEP_HEADER_HEIGHT / 2 - 2;
        drawHeaderKindIcon(
          g,
          step.ref,
          iconCX,
          iconCY,
          parseInt(refColorHex.replace("#", "0x"), 16),
        );

        // Ref label on the right edge, echoing the icon's meaning.
        const refLabel = (
          BDD_STEP_REF_LABELS[step.ref] ?? step.ref
        ).toUpperCase();
        const refLabelW = refLabel.length * 5.2;
        const refLabelText = new Text({
          text: refLabel,
          style: {
            fontSize: 8.5,
            fontWeight: "bold",
            fontFamily: APP_FONT_FAMILY,
            fill: parseInt(refColorHex.replace("#", "0x"), 16),
            letterSpacing: 0.4,
          },
          resolution: textResolution,
        });
        refLabelText.x = w - 10 - refLabelW;
        refLabelText.y = rowY + 7;
        container.addChild(refLabelText);

        const nameAvailable = Math.min(
          refLabelMaxWidth,
          refLabelText.x - 34,
        );
        const maxNameChars = Math.max(6, Math.floor(nameAvailable / 7.0));
        const stepName = step.name?.trim() || "Untitled";
        const nameText = new Text({
          text: truncateText(stepName, maxNameChars),
          style: {
            fontSize: 12,
            fontWeight: "bold",
            fontFamily: APP_FONT_FAMILY,
            fill: step.name?.trim() ? (isDark ? 0xd4d4d8 : 0x1e293b) : (isDark ? 0x71717a : 0x94a3b8),
          },
          resolution: textResolution,
        });
        nameText.x = 30;
        nameText.y = rowY + 5;
        container.addChild(nameText);

        // Whole-step zone for selection (pushed first so payload/name zones win).
        hitZones.push({
          type: "bddStep",
          bounds: { x: 0, y: rowY, width: w, height: stepHeight },
          fieldId: step.id,
          currentText: stepName,
        });

        // Double-click target for renaming the step.
        hitZones.push({
          type: "bddStepName",
          bounds: {
            x: 24,
            y: rowY,
            width: Math.max(20, w - 34),
            height: BDD_STEP_HEADER_HEIGHT,
          },
          fieldId: step.id,
          currentText: step.name,
        });

        // Payload example rows: `key = value`.
        const payload = step.payload ?? [];
        payload.forEach((entry, payloadIndex) => {
          const payloadY =
            rowY + BDD_STEP_HEADER_HEIGHT + payloadIndex * BDD_STEP_PAYLOAD_ROW_HEIGHT;

          const keyText = new Text({
            text: `${entry.key || "key"} =`,
            style: {
              fontSize: 10,
              fontWeight: "600",
              fontFamily: APP_FONT_FAMILY,
              fill: isDark ? 0xa1a1aa : 0x64748b,
            },
            resolution: textResolution,
          });
          keyText.x = 30;
          keyText.y = payloadY + 2;
          container.addChild(keyText);

          const keyWidth = (entry.key?.length ?? 0) * 6.1 + 16;
          const valueX = 30 + keyWidth;
          const valueAvailable = Math.max(20, w - 12 - valueX);
          const maxValueChars = Math.max(4, Math.floor(valueAvailable / 6.2));
          const valueText = new Text({
            text: truncateText(entry.value ?? "", maxValueChars),
            style: {
              fontSize: 10,
              fontWeight: "500",
              fontFamily: APP_FONT_FAMILY,
              fill: entry.value ? (isDark ? 0xd4d4d8 : 0x0f172a) : (isDark ? 0x52525b : 0xcbd5e1),
            },
            resolution: textResolution,
          });
          valueText.x = valueX;
          valueText.y = payloadY + 2;
          container.addChild(valueText);

          hitZones.push({
            type: "bddPayloadKey",
            bounds: {
              x: 24,
              y: payloadY,
              width: keyWidth,
              height: BDD_STEP_PAYLOAD_ROW_HEIGHT,
            },
            fieldId: step.id,
            valueId: entry.id,
            currentText: entry.key,
          });
          hitZones.push({
            type: "bddPayloadValue",
            bounds: {
              x: valueX,
              y: payloadY,
              width: Math.max(20, w - 12 - valueX),
              height: BDD_STEP_PAYLOAD_ROW_HEIGHT,
            },
            fieldId: step.id,
            valueId: entry.id,
            currentText: entry.value,
          });
        });

        renderY += stepHeight;
        if (stepIndex < steps.length - 1) renderY += BDD_STEP_GAP;
      });
    } else if (isActor) {
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
            fill: isDark ? 0xd4d4d8 : 0x334155,
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
    } else if (isConstraint) {
      const findObjectById = (id?: string): CanvasObject | undefined => {
        if (!id) return undefined;
        // The canonical lookup is id-keyed; `allObjects` is a name-keyed model
        // map in production, so it is only a fallback for callers passing an
        // array of objects.
        const direct = objectsById?.get(id);
        if (direct) return direct;
        if (!allObjects) return undefined;
        if (allObjects instanceof Map) return allObjects.get(id);
        if (Array.isArray(allObjects)) return allObjects.find((o) => o.id === id);
        return undefined;
      };

      const stateObj = findObjectById(data.stateId);
      const stateName = stateObj?.stormData?.name;

      if (stateName) {
        const stateDisplayText = `⟡ ${stateName}`;
        const statePillY = renderY + 4;
        const statePillHeight = 22;
        const statePillWidth = w - 16;

        g.roundRect(8, statePillY, statePillWidth, statePillHeight, 4)
          .fill({
            color: isDark ? 0x134e4a : 0xf0fdfa,
          })
          .stroke({
            color: isDark ? 0x14b8a6 : 0x99f6e4,
            width: 1,
          });

        const stateText = new Text({
          text: stateDisplayText,
          style: {
            fontSize: 10,
            fontWeight: "bold",
            fontFamily: APP_FONT_FAMILY,
            fill: isDark ? 0x2dd4bf : 0x0f766e,
          },
          resolution: textResolution,
        });
        stateText.x = 16;
        stateText.y = statePillY + 4;
        container.addChild(stateText);

        hitZones.push({
          type: "constraintState",
          bounds: {
            x: 8,
            y: statePillY,
            width: statePillWidth,
            height: statePillHeight,
          },
          currentText: stateName,
        });

        renderY += statePillHeight + 8;
      }

      if (constraints.length > 0) {
        const cLabel = new Text({
          text: "RULES",
          style: {
            fontSize: 9,
            fontWeight: "bold",
            fontFamily: APP_FONT_FAMILY,
            fill: isDark ? 0x14b8a6 : 0x0f766e,
            letterSpacing: 0.5,
          },
          resolution: textResolution,
        });
        cLabel.x = 10;
        cLabel.y = renderY + 2;
        container.addChild(cLabel);
        renderY += sectionLabelHeight;

        const textX = 22;
        const wrapWidth = Math.max(40, w - textX - 10);
        for (const c of constraints) {
          const rowY = renderY;
          const rawText = c.text || c.code || c.assert || "";
          const displayText = rawText.startsWith("•")
            ? rawText.replace(/^•\s*/, "")
            : rawText;
          const hasStructured = Boolean(c.assert);
          const itemWrapWidth = hasStructured
            ? Math.max(30, wrapWidth - 14)
            : wrapWidth;

          const bullet = new Text({
            text: "•",
            style: {
              fontSize: 10,
              fontFamily: APP_FONT_FAMILY,
              fill: isDark ? 0x14b8a6 : 0x134e4a,
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
              fill: isDark ? 0xd4d4d8 : 0x134e4a,
              wordWrap: true,
              wordWrapWidth: itemWrapWidth,
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
              color: isDark ? 0x1e3a8a : 0xdbeafe,
            });
          }

          cText.x = textX;
          cText.y = rowY + 5;
          container.addChild(bullet);
          container.addChild(cText);

          if (hasStructured) {
            drawInfoBadge(g, container, w - 14, rowY + 12, {
              radius: 6,
              stroke: isDark ? 0x14b8a6 : 0x0f766e,
              fill: isDark ? 0x2dd4bf : 0x0f766e,
              fontSize: 8,
              glyph: "ƒ",
              bold: true,
              textResolution,
            });
          }

          hitZones.push({
            type: "constraint",
            bounds: { x: 0, y: rowY, width: w, height: itemHeight },
            constraintId: c.id,
            currentText: c.text,
          });

          renderY += itemHeight;
        }
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
            fill: isDark ? 0x71717a : 0x94a3b8,
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
            fill: isDark ? 0x71717a : 0x94a3b8,
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

      // Render Response — the band is always present on Query/Command cards,
      // matching the Params band (Query) so both sections stay visible even
      // when empty.
      if (hasResponse) {
        const rLabel = new Text({
          text: "RESPONSE",
          style: {
            fontSize: 9,
            fontWeight: "bold",
            fontFamily: APP_FONT_FAMILY,
            fill: isDark ? 0x71717a : 0x94a3b8,
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
          fill: isDark ? 0x8b5cf6 : 0x7c3aed,
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
            color: isDark ? 0x1e3a8a : 0xdbeafe,
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
            .fill({ color: isDark ? 0x431407 : 0xffedd5 })
            .stroke({ color: isDark ? 0x9a3412 : 0xfdba74, width: 1 });

          const tagText = new Text({
            text: rawTagText,
            style: {
              fontSize: 9.5,
              fontWeight: "600",
              fontFamily: APP_FONT_FAMILY,
              fill: isDark ? 0xfb923c : 0x9a3412,
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
              fill: isDark ? 0xa78bfa : 0x6d28d9,
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
          fill: isDark ? 0x71717a : 0x94a3b8,
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

    const finalHeight = Math.max(renderY + 10, 80);
    const bodyBgColor = isDark ? 0x18181b : 0xffffff;
    const bodyStrokeColor = isSelected
      ? 0x3b82f6
      : isDark
        ? 0x27272a
        : 0xe2e8f0;
    bgGraphics
      .roundRect(0, 0, w, finalHeight, r)
      .fill({ color: bodyBgColor })
      .stroke({
        color: bodyStrokeColor,
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
