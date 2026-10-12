import { Users } from "lucide-react";
import { z } from "zod";
import { Graphics, Text, Container } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, InlineEditState, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { isSameIdentifier, isSameAction, toDisplayName, toDisplayAction } from "@/utils/naming";
import { ActorCardOptions } from "./ActorCardOptions";
import {
  renderStandardCardTitle,
  renderHeaderDescBadge,
  CARD_CORNER_RADIUS,
} from "../common/cardLayout";
import { resolveHeaderColor } from "@/utils/color";
import { beginDescZones, hitDescZone } from "../common/descZones";
import {
  collectBoardActions,
  isWildcard,
  matchesAction,
} from "@/utils/rbac";
import {
  getActorPermissions,
  overlappingPermissionIndices,
  validateActorCardData,
  type ActorCardData,
  type ActorPermission,
} from "./rules";
import {
  ACTOR_HEADER_HEIGHT,
  ACTOR_SECTION_HEADER_HEIGHT,
  ACTOR_ROW_HEIGHT,
  ACTOR_DEFAULT_WIDTH,
  computeActorCardLayout,
  computeActorCardSize,
} from "./layout";

export type { ActorCardData, ActorPermission } from "./rules";
export { getActorPermissions, collectBoardActors } from "./rules";
export { computeActorCardSize, computeActorCardLayout } from "./layout";

/** One PERMISSIONS row: the action pattern plus its resolution status. */
function renderPermissionRow(
  container: Container,
  opts: {
    permission: ActorPermission;
    rowY: number;
    width: number;
    isDark: boolean;
    isSelectedRow: boolean;
    overlaps: boolean;
    matchedCount: number;
    textResolution: number;
  },
): void {
  const {
    permission,
    rowY,
    width,
    isDark,
    isSelectedRow,
    overlaps,
    matchedCount,
    textResolution,
  } = opts;

  const actionText = new Text({
    text: toDisplayAction(permission.action),
    style: {
      fontSize: 12,
      fontWeight: isSelectedRow ? "bold" : "normal",
      fontFamily: '"Geist Mono", monospace',
      fill: isSelectedRow
        ? isDark
          ? 0xf4f4f5
          : 0x09090b
        : isDark
          ? 0xe4e4e7
          : 0x27272a,
    },
    resolution: textResolution,
  });
  actionText.x = 12;
  actionText.y = rowY + 7;
  container.addChild(actionText);

  // Trailing status hint: overlap warning, wildcard reach, or a missing exact
  // action. A resolved exact permission shows nothing beyond the token itself.
  let statusText: string | null;
  let statusColor: number;
  if (overlaps) {
    statusText = "overlap";
    statusColor = isDark ? 0xf87171 : 0xdc2626;
  } else if (isWildcard(permission.action)) {
    statusText = `${matchedCount} action${matchedCount === 1 ? "" : "s"}`;
    statusColor = isDark ? 0x71717a : 0xa1a1aa;
  } else if (matchedCount === 0) {
    statusText = "missing";
    statusColor = isDark ? 0xf87171 : 0xdc2626;
  } else {
    statusText = null;
    statusColor = isDark ? 0x71717a : 0xa1a1aa;
  }

  if (!statusText) return;

  const status = new Text({
    text: statusText,
    style: {
      fontSize: 10,
      fontFamily: '"Geist Mono", monospace',
      fill: statusColor,
    },
    resolution: textResolution,
  });
  status.x = width - status.width - 12;
  status.y = rowY + 8;
  container.addChild(status);
}

export const ActorCardSchema = z.object({
  name: z.string().default("NewActor"),
  description: z.string().optional(),
  permissions: z
    .array(
      z.object({
        action: z.string(),
      }),
    )
    .default([]),
  color: z.string().optional(),
});

export const actorCardTool: ToolDefinition<ActorCardData> = {
  type: "actorCard",
  name: "Actor",
  description:
    "An Actor: holds permissions (action patterns) that grant the ability to execute Command/Query actions. Supports `*` wildcards (e.g. sales:*).",
  icon: Users,
  color: "#7c3aed",
  category: "modeling",

  schema: ActorCardSchema,
  createDefaultData: () => ({
    name: "NewActor",
    permissions: [],
    color: "#7c3aed",
  }),

  defaultSize: {
    width: ACTOR_DEFAULT_WIDTH,
    height: ACTOR_HEADER_HEIGHT + ACTOR_SECTION_HEADER_HEIGHT + ACTOR_ROW_HEIGHT,
  },

  computeSize: (data) => computeActorCardSize(data),

  optionsBar: ActorCardOptions,

  normalizeData: (data, context) => validateActorCardData(data, context).data,

  validateData: (data, context) => validateActorCardData(data, context),

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isSelected = context.isSelected;
    const isDark = context.theme === "dark";
    const headerColor = resolveHeaderColor(element.data.color || actorCardTool.color, isDark);
    const w = element.width;
    const h = element.height;
    const r = CARD_CORNER_RADIUS;

    const elements = useCanvasStore.getState().elements;
    const boardActions = collectBoardActions(elements);
    const boardKeys = boardActions.map((a) => a.key);

    const layout = computeActorCardLayout(element.data);
    const { permissions, rowsStartY } = layout;
    const overlapping = overlappingPermissionIndices(permissions, boardKeys);

    const cardBg = isDark ? 0x18181b : 0xffffff;
    const sectionHeaderBg = isDark ? 0x27272a : 0xf4f4f5;
    const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;
    const sunkenColor = isDark ? 0x121214 : 0xf1f5f9;

    const isThisElement = context.selectedField?.elementId === element.id;
    const activeFieldIndex =
      isThisElement && context.selectedField?.sectionId === "permissions"
        ? context.selectedField?.fieldIndex ?? -1
        : -1;

    const g = new Graphics();

    // 1. Header banner.
    g.moveTo(0, r);
    g.arcTo(0, 0, r, 0, r);
    g.lineTo(w - r, 0);
    g.arcTo(w, 0, w, r, r);
    g.lineTo(w, ACTOR_HEADER_HEIGHT);
    g.lineTo(0, ACTOR_HEADER_HEIGHT);
    g.closePath();
    g.fill({ color: headerColor });

    // 2. Body.
    g.moveTo(0, ACTOR_HEADER_HEIGHT);
    g.lineTo(w, ACTOR_HEADER_HEIGHT);
    g.lineTo(w, h - r);
    g.arcTo(w, h, w - r, h, r);
    g.lineTo(r, h);
    g.arcTo(0, h, 0, h - r, r);
    g.closePath();
    g.fill({ color: cardBg });

    // 3. Permissions section banner.
    g.rect(0, ACTOR_HEADER_HEIGHT, w, ACTOR_SECTION_HEADER_HEIGHT);
    g.fill({ color: sectionHeaderBg });

    // 4. Sunken highlight for the active permission row.
    if (activeFieldIndex >= 0 && activeFieldIndex < permissions.length) {
      const highlightY = rowsStartY + activeFieldIndex * ACTOR_ROW_HEIGHT;
      const isLastRow = activeFieldIndex === permissions.length - 1;
      if (isLastRow) {
        g.moveTo(0, highlightY);
        g.lineTo(w, highlightY);
        g.lineTo(w, h - r);
        g.arcTo(w, h, w - r, h, r);
        g.lineTo(r, h);
        g.arcTo(0, h, 0, h - r, r);
        g.closePath();
        g.fill({ color: sunkenColor });
      } else {
        g.rect(0, highlightY, w, ACTOR_ROW_HEIGHT);
        g.fill({ color: sunkenColor });
      }
    }

    // 5. Border.
    g.roundRect(0, 0, w, h, r);
    g.stroke({ color: borderCol, width: isSelected ? 2 : 1 });
    container.addChild(g);

    // 6. Header title + ⓘ badge.
    renderStandardCardTitle(
      container,
      element.data.name || "Actor",
      headerColor,
      context.textResolution,
    );
    renderHeaderDescBadge(container, {
      elementId: element.id,
      width: w,
      isDark,
      isSelected,
      hasDescription: Boolean(element.data.description),
      hasReference: Boolean(element.referenceId),
      text: element.data.description,
      textResolution: context.textResolution,
    });

    if (typeof document === "undefined") return;

    // 7. Section label.
    const sectionLabel = new Text({
      text: "PERMISSIONS",
      style: {
        fontSize: 10,
        fontWeight: "bold",
        fontFamily: '"Geist Mono", monospace',
        fill: isDark ? 0xa1a1aa : 0x71717a,
      },
      resolution: context.textResolution,
    });
    sectionLabel.x = 12;
    sectionLabel.y = ACTOR_HEADER_HEIGHT + 4;
    container.addChild(sectionLabel);

    // 8. Permission rows.
    if (permissions.length === 0) {
      const empty = new Text({
        text: "(no permissions)",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x71717a : 0xa1a1aa,
        },
        resolution: context.textResolution,
      });
      empty.x = 12;
      empty.y = rowsStartY + 7;
      container.addChild(empty);
      return;
    }

    permissions.forEach((permission, index) => {
      const matched = boardKeys.filter((k) => matchesAction(permission.action, k)).length;
      renderPermissionRow(container, {
        permission,
        rowY: rowsStartY + index * ACTOR_ROW_HEIGHT,
        width: w,
        isDark,
        isSelectedRow: activeFieldIndex === index,
        overlaps: overlapping.has(index),
        matchedCount: matched,
        textResolution: context.textResolution,
      });
    });
  },

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  onSubSelect: (element, localPoint): SelectedField | null => {
    const permissions = getActorPermissions(element.data);
    const rowsStartY = ACTOR_HEADER_HEIGHT + ACTOR_SECTION_HEADER_HEIGHT;
    const rowsEndY = rowsStartY + Math.max(1, permissions.length) * ACTOR_ROW_HEIGHT;
    if (localPoint.y < rowsStartY || localPoint.y >= rowsEndY) return null;
    if (permissions.length === 0) return null;
    const index = Math.floor((localPoint.y - rowsStartY) / ACTOR_ROW_HEIGHT);
    if (index < 0 || index >= permissions.length) return null;
    return { elementId: element.id, sectionIndex: 0, sectionId: "permissions", fieldIndex: index };
  },

  onDeleteSubSelect: (element, fieldIndex) => {
    const permissions = getActorPermissions(element.data);
    if (fieldIndex < 0 || fieldIndex >= permissions.length) return null;
    const nextData: ActorCardData = {
      ...element.data,
      permissions: permissions.filter((_, i) => i !== fieldIndex),
    };
    return { height: computeActorCardSize(nextData, element.width).height, data: nextData };
  },

  getSubSelectSections: (element) => [
    { id: "permissions", name: "permissions", count: getActorPermissions(element.data).length },
  ],

  getSelectedFieldItem: () => null,

  getInlineEditTarget: (element, localPoint): InlineEditState | null => {
    // 1. Header -> rename the actor.
    if (localPoint.y <= ACTOR_HEADER_HEIGHT) {
      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 8,
          y: element.y + 4,
          width: element.width - 16,
          height: 24,
        },
        initialValue: toDisplayName(element.data?.name) || "Actor",
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
    }

    // 2. Permission row -> edit its action pattern (exact or wildcard).
    const permissions = getActorPermissions(element.data);
    const rowsStartY = ACTOR_HEADER_HEIGHT + ACTOR_SECTION_HEADER_HEIGHT;
    const rowsEndY = rowsStartY + Math.max(1, permissions.length) * ACTOR_ROW_HEIGHT;
    if (localPoint.y >= rowsStartY && localPoint.y < rowsEndY) {
      const index = Math.floor((localPoint.y - rowsStartY) / ACTOR_ROW_HEIGHT);
      if (index >= 0 && index < permissions.length) {
        const current = permissions[index];
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionIndex: 0,
          sectionId: "permissions",
          fieldIndex: index,
        });
        return {
          elementId: element.id,
          worldBounds: {
            x: element.x + 10,
            y: element.y + rowsStartY + index * ACTOR_ROW_HEIGHT + 2,
            width: Math.max(80, element.width - 24),
            height: 24,
          },
          initialValue: toDisplayAction(current.action),
          multiline: false,
          onCommit: (newValue) => {
            const trimmed = newValue.trim();
            if (!trimmed || isSameAction(trimmed, current.action)) return;
            const nextPermissions = [...permissions];
            nextPermissions[index] = { ...current, action: trimmed };
            useCanvasStore.getState().updateElement(element.id, {
              data: { ...element.data, permissions: nextPermissions },
            });
          },
        };
      }
    }

    return null;
  },

  ai: {
    toolName: "create_actor_card",
    description:
      "Create an RBAC Actor card. An actor holds `permissions` — action patterns that grant the ability to " +
      "execute Command/Query actions (each Command/Query declares an `action` token such as sales:placeOrder). " +
      "A permission is either an exact token or a `*` wildcard (sales:*, *:getOrder); a bare match-all (`*`, `*:*`) " +
      "is forbidden and every pattern must match at least one existing action. Permissions within one actor must " +
      "not overlap. Call get_canvas_overview first to discover existing actions and actors.",
    parameters: z.object({
      name: z.string().describe("PascalCase actor name (e.g. Customer, Admin)"),
      permissions: z
        .array(
          z.object({
            action: z
              .string()
              .describe("Exact action token (sales:placeOrder) or wildcard pattern (sales:*)"),
          }),
        )
        .optional()
        .describe("Actions this actor may execute"),
      color: z.string().optional().describe("Optional hex color"),
      description: z.string().optional().describe("Description of the actor"),
    }),
    onCreate: (params, center: Point): CanvasElement<ActorCardData> => {
      const permissions: ActorPermission[] = (params.permissions || [])
        .map((p: { action?: string }) => ({ action: (p.action || "").trim() }))
        .filter((p: ActorPermission) => p.action.length > 0);

      const data: ActorCardData = {
        name: params.name || "Actor",
        permissions,
        color: params.color || actorCardTool.color,
        ...(params.description ? { description: params.description } : {}),
      };
      const size = computeActorCardSize(data);
      return {
        id: `actor-${nanoid(6)}`,
        type: "actorCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};
