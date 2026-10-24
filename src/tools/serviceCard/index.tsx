import { Server } from "lucide-react";
import { z } from "zod";
import { Graphics, Text, Container } from "pixi.js";
import { nanoid } from "nanoid";
import type { ToolDefinition } from "../types";
import type { CanvasElement, InlineEditState, Point, SelectedField } from "@/types";
import { useCanvasStore } from "@/store";
import { ServiceCardOptions } from "./ServiceCardOptions";
import {
  renderStandardCardTitle,
  renderHeaderDescBadge,
  drawInfoBadge,
  CARD_CORNER_RADIUS,
  DESC_HIT_HALF,
  DESC_ROW_BADGE_GAP,
} from "../common/cardLayout";
import { hexToNumber, resolveHeaderColor } from "@/utils/color";
import { isSameIdentifier, toDisplayName, toDisplayType } from "@/utils/naming";
import { beginDescZones, addDescZone, hitDescZone } from "../common/descZones";
import { validateFieldTypes } from "../common/typeValidation";
import {
  SERVICE_DEFAULT_WIDTH,
  SERVICE_HEADER_HEIGHT,
  SERVICE_GROUP_LABEL_HEIGHT,
  SERVICE_ROW_HEIGHT,
  SERVICE_SECTION_INDEX,
  buildServiceItems,
  computeServiceCardSize,
  getServiceLayout,
  getServiceRows,
  groupFromSectionId,
  groupFromSectionIndex,
  itemToSelectedField,
  selectedFieldToItem,
  serviceItemsEqual,
  type ServiceCardData,
  type ServiceField,
  type ServiceGroup,
  type ServiceItem,
} from "./layout";

export type { ServiceCardData, ServiceField, ServiceGroup } from "./layout";

const ServiceFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  isArray: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  description: z.string().optional(),
});

export const ServiceCardSchema = z.object({
  name: z.string().default("ServiceName"),
  params: z.array(ServiceFieldSchema).default([]),
  returns: z.array(ServiceFieldSchema).default([]),
  color: z.string().optional(),
  description: z.string().optional(),
});

/** Immutably replaces one group's rows. */
function replaceRows(
  data: ServiceCardData,
  group: ServiceGroup,
  rows: ServiceField[],
): ServiceCardData {
  return { ...data, [group]: rows };
}

/** Muted uppercase label above a params/returns group (e.g. "PARAMS"). */
function renderServiceGroupLabel(
  container: Container,
  text: string,
  top: number,
  isDark: boolean,
  textResolution: number,
): void {
  const label = new Text({
    text,
    style: {
      fontSize: 9,
      fontWeight: "bold",
      letterSpacing: 0.6,
      fontFamily: '"Geist Mono", monospace',
      fill: isDark ? 0x71717a : 0xa1a1aa,
    },
    resolution: textResolution,
  });
  label.x = 14;
  label.y = top + 3;
  container.addChild(label);
}

interface ServiceRowRenderOptions {
  elementId: string;
  field: ServiceField;
  group: ServiceGroup;
  fieldIndex: number;
  rowY: number;
  width: number;
  isDark: boolean;
  isSelected: boolean;
  textResolution: number;
}

/** Renders one param/return row (name, required star, type, ⓘ badge). */
function renderServiceRow(
  container: Container,
  {
    elementId,
    field,
    group,
    fieldIndex,
    rowY,
    width,
    isDark,
    isSelected,
    textResolution,
  }: ServiceRowRenderOptions,
): void {
  const nameText = new Text({
    text: toDisplayName(field.name),
    style: {
      fontSize: 12,
      fontWeight: isSelected ? "bold" : "normal",
      fontFamily: '"Geist Mono", monospace',
      fill: isSelected
        ? isDark
          ? 0xf4f4f5
          : 0x09090b
        : isDark
          ? 0xe4e4e7
          : 0x27272a,
    },
    resolution: textResolution,
  });
  nameText.x = 14;
  nameText.y = rowY + 6;
  container.addChild(nameText);

  if (field.isRequired) {
    const requiredStar = new Text({
      text: "*",
      style: {
        fontSize: 13,
        fontWeight: "bold",
        fontFamily: '"Geist Mono", monospace',
        fill: isDark ? 0xf87171 : 0xdc2626,
      },
      resolution: textResolution,
    });
    requiredStar.x = nameText.x + nameText.width + 2;
    requiredStar.y = rowY + 5;
    container.addChild(requiredStar);
  }

  const typeText = toDisplayType(field.type, field.isArray);
  let rightAnchorX = width - 12;
  if (typeText) {
    const typeLabel = new Text({
      text: typeText,
      style: {
        fontSize: 11,
        fontFamily: '"Geist Mono", monospace',
        fill: isDark ? 0xa1a1aa : 0x71717a,
      },
      resolution: textResolution,
    });
    typeLabel.x = width - typeLabel.width - 12;
    typeLabel.y = rowY + 7;
    container.addChild(typeLabel);
    rightAnchorX = typeLabel.x;
  }

  if (field.description || isSelected) {
    const badgeCx = rightAnchorX - DESC_ROW_BADGE_GAP;
    const badgeCy = rowY + SERVICE_ROW_HEIGHT / 2;
    const badgeG = new Graphics();
    drawInfoBadge(badgeG, container, badgeCx, badgeCy, {
      radius: 6,
      stroke: 0x94a3b8,
      fill: 0x64748b,
      fontSize: 7,
      alpha: field.description ? 1 : 0.5,
      textResolution,
    });
    container.addChild(badgeG);

    if (field.description) {
      addDescZone(elementId, {
        elementId,
        sectionIndex: SERVICE_SECTION_INDEX[group],
        fieldIndex,
        text: field.description,
        iconBounds: {
          x: badgeCx - DESC_HIT_HALF,
          y: badgeCy - DESC_HIT_HALF,
          width: DESC_HIT_HALF * 2,
          height: DESC_HIT_HALF * 2,
        },
      });
    }
  }
}

export const serviceCardTool: ToolDefinition<ServiceCardData> = {
  type: "serviceCard",
  name: "Service",
  description:
    "A service method execution with params and returns; Services may share a name",
  icon: Server,
  color: "#0ea5e9",
  category: "modeling",

  schema: ServiceCardSchema,
  createDefaultData: () => ({
    name: "NewService",
    params: [],
    returns: [],
    color: "#0ea5e9",
  }),

  defaultSize: {
    width: SERVICE_DEFAULT_WIDTH,
    height: getServiceLayout({ name: "", params: [], returns: [] }).bottom,
  },

  computeSize: (data, width) => computeServiceCardSize(data, width),

  autoFitWidth: true,

  optionsBar: ServiceCardOptions,

  validateData: (data, context) => {
    const elements = context.elements ?? [];
    const issues = [
      ...validateFieldTypes(data.params, "params", elements),
      ...validateFieldTypes(data.returns, "returns", elements),
    ];
    return { data, issues };
  },

  // Older boards stored a Service as a list of methods; a Service card is now a
  // single method execution, so collapse the legacy shape to its first method.
  normalizeData: (data) => {
    const legacy = (data as unknown as { methods?: unknown }).methods;
    if (!Array.isArray(legacy)) return data;
    const first = (legacy[0] ?? {}) as {
      name?: string;
      params?: ServiceField[];
      returns?: ServiceField[];
    };
    const { methods: _legacy, ...rest } = data as ServiceCardData & { methods?: unknown };
    return {
      ...rest,
      name: first.name || data.name,
      params: Array.isArray(data.params) ? data.params : first.params ?? [],
      returns: Array.isArray(data.returns) ? data.returns : first.returns ?? [],
    };
  },

  render: (container, element, context) => {
    container.removeChildren();
    beginDescZones(element.id);

    const isDark = context.theme === "dark";
    const isSelected = context.isSelected;
    const w = element.width;
    const h = element.height;
    const r = CARD_CORNER_RADIUS;
    const headerColor = resolveHeaderColor(element.data.color || serviceCardTool.color, isDark);
    const data = element.data;
    const layout = getServiceLayout(data);

    const selectedField =
      context.selectedField?.elementId === element.id ? context.selectedField : null;

    const cardBg = isDark ? 0x18181b : 0xffffff;
    const groupLabelBg = isDark ? 0x1f1f23 : 0xfafafa;
    const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;
    const sunkenColor = isDark ? 0x121214 : 0xf1f5f9;
    const accentColor = hexToNumber(headerColor);

    const g = new Graphics();

    // 1. Header banner (rounded top corners, flat bottom)
    g.moveTo(0, r);
    g.arcTo(0, 0, r, 0, r);
    g.lineTo(w - r, 0);
    g.arcTo(w, 0, w, r, r);
    g.lineTo(w, SERVICE_HEADER_HEIGHT);
    g.lineTo(0, SERVICE_HEADER_HEIGHT);
    g.closePath();
    g.fill({ color: headerColor });

    // 2. Card body (flat top, rounded bottom corners)
    g.moveTo(0, SERVICE_HEADER_HEIGHT);
    g.lineTo(w, SERVICE_HEADER_HEIGHT);
    g.lineTo(w, h - r);
    g.arcTo(w, h, w - r, h, r);
    g.lineTo(r, h);
    g.arcTo(0, h, 0, h - r, r);
    g.closePath();
    g.fill({ color: cardBg });

    // 3. Params/returns group label bands
    g.rect(0, layout.paramsLabelTop, w, SERVICE_GROUP_LABEL_HEIGHT);
    g.fill({ color: groupLabelBg });
    g.rect(0, layout.returnsLabelTop, w, SERVICE_GROUP_LABEL_HEIGHT);
    g.fill({ color: groupLabelBg });

    // 4. Selection highlight for the active row.
    let selectedRowTop: number | null = null;
    if (selectedField && selectedField.fieldIndex >= 0) {
      const group = groupFromSectionId(selectedField.sectionId);
      const rows = getServiceRows(data, group);
      if (selectedField.fieldIndex < rows.length) {
        const base = group === "params" ? layout.paramsRowsTop : layout.returnsRowsTop;
        const rowY = base + selectedField.fieldIndex * SERVICE_ROW_HEIGHT;
        const isVeryLast =
          group === "returns" && selectedField.fieldIndex === rows.length - 1;
        if (isVeryLast) {
          g.moveTo(0, rowY);
          g.lineTo(w, rowY);
          g.lineTo(w, h - r);
          g.arcTo(w, h, w - r, h, r);
          g.lineTo(r, h);
          g.arcTo(0, h, 0, h - r, r);
          g.closePath();
          g.fill({ color: sunkenColor });
        } else {
          g.rect(0, rowY, w, SERVICE_ROW_HEIGHT);
          g.fill({ color: sunkenColor });
        }
        selectedRowTop = rowY;
      }
    }

    // 5. Accent stripes mark the two groups; the selected row's stripe is drawn
    //    full-strength on top.
    for (const top of [layout.paramsLabelTop, layout.returnsLabelTop]) {
      g.rect(0, top, 3, SERVICE_GROUP_LABEL_HEIGHT);
      g.fill({ color: accentColor, alpha: 0.55 });
    }
    if (selectedRowTop !== null) {
      g.rect(0, selectedRowTop, 3, SERVICE_ROW_HEIGHT);
      g.fill({ color: accentColor, alpha: 0.9 });
    }

    // 6. Border stroke
    g.roundRect(0, 0, w, h, r);
    g.stroke({ color: borderCol, width: isSelected ? 2 : 1 });
    container.addChild(g);

    // 7. Header title + ⓘ badge
    renderStandardCardTitle(
      container,
      data.name || "Service",
      headerColor,
      context.textResolution,
    );
    renderHeaderDescBadge(container, {
      elementId: element.id,
      width: w,
      isDark,
      isSelected,
      hasDescription: Boolean(data.description),
      hasReference: Boolean(element.referenceId),
      text: data.description,
      textResolution: context.textResolution,
    });

    if (typeof document === "undefined") return;

    // 8. Params + returns groups
    renderServiceGroupLabel(
      container,
      "PARAMS",
      layout.paramsLabelTop,
      isDark,
      context.textResolution,
    );
    (data.params ?? []).forEach((field, fieldIndex) => {
      renderServiceRow(container, {
        elementId: element.id,
        field,
        group: "params",
        fieldIndex,
        rowY: layout.paramsRowsTop + fieldIndex * SERVICE_ROW_HEIGHT,
        width: w,
        isDark,
        isSelected: Boolean(
          selectedField &&
            selectedField.sectionId === "params" &&
            selectedField.fieldIndex === fieldIndex,
        ),
        textResolution: context.textResolution,
      });
    });
    if ((data.params ?? []).length === 0) {
      renderEmptyGroupHint(container, layout.paramsRowsTop, isDark, context.textResolution);
    }

    renderServiceGroupLabel(
      container,
      "RETURNS",
      layout.returnsLabelTop,
      isDark,
      context.textResolution,
    );
    (data.returns ?? []).forEach((field, fieldIndex) => {
      renderServiceRow(container, {
        elementId: element.id,
        field,
        group: "returns",
        fieldIndex,
        rowY: layout.returnsRowsTop + fieldIndex * SERVICE_ROW_HEIGHT,
        width: w,
        isDark,
        isSelected: Boolean(
          selectedField &&
            selectedField.sectionId === "returns" &&
            selectedField.fieldIndex === fieldIndex,
        ),
        textResolution: context.textResolution,
      });
    });
    if ((data.returns ?? []).length === 0) {
      renderEmptyGroupHint(container, layout.returnsRowsTop, isDark, context.textResolution);
    }
  },

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  onSubSelect: (element, localPoint): SelectedField | null => {
    const layout = getServiceLayout(element.data);
    const y = localPoint.y;

    // Params rows
    const paramsEnd = layout.paramsRowsTop + layout.paramsRowCount * SERVICE_ROW_HEIGHT;
    if (y >= layout.paramsRowsTop && y < paramsEnd) {
      const index = Math.floor((y - layout.paramsRowsTop) / SERVICE_ROW_HEIGHT);
      if (index < (element.data.params?.length || 0)) {
        return itemToSelectedField(element.id, { group: "params", fieldIndex: index });
      }
      return null;
    }

    // Returns rows
    const returnsEnd = layout.returnsRowsTop + layout.returnsRowCount * SERVICE_ROW_HEIGHT;
    if (y >= layout.returnsRowsTop && y < returnsEnd) {
      const index = Math.floor((y - layout.returnsRowsTop) / SERVICE_ROW_HEIGHT);
      if (index < (element.data.returns?.length || 0)) {
        return itemToSelectedField(element.id, { group: "returns", fieldIndex: index });
      }
      return null;
    }

    return null;
  },

  onDeleteSubSelect: (element, fieldIndex, sectionIndex = 0) => {
    if (fieldIndex < 0) return null;
    const group = groupFromSectionIndex(sectionIndex);
    const rows = getServiceRows(element.data, group);
    if (fieldIndex >= rows.length) return null;

    const nextData = replaceRows(
      element.data,
      group,
      rows.filter((_, i) => i !== fieldIndex),
    );
    const size = computeServiceCardSize(nextData, element.width);
    return { width: size.width, height: size.height, data: nextData };
  },

  onUpdateSubSelectType: (element, field, type) => {
    if (field.fieldIndex < 0) return null;
    const group = groupFromSectionId(field.sectionId);
    const rows = getServiceRows(element.data, group);
    if (field.fieldIndex >= rows.length) return null;

    const trimmed = type.trim();
    if (!trimmed) return null;
    const nextRows = [...rows];
    nextRows[field.fieldIndex] = { ...rows[field.fieldIndex], type: trimmed };
    return { data: replaceRows(element.data, group, nextRows) };
  },

  onToggleSubSelectArray: (element, field) => {
    if (field.fieldIndex < 0) return null;
    const group = groupFromSectionId(field.sectionId);
    const rows = getServiceRows(element.data, group);
    if (field.fieldIndex >= rows.length) return null;

    const nextRows = [...rows];
    nextRows[field.fieldIndex] = {
      ...rows[field.fieldIndex],
      isArray: !rows[field.fieldIndex].isArray,
    };
    return { data: replaceRows(element.data, group, nextRows) };
  },

  onToggleSubSelectRequired: (element, field) => {
    if (field.fieldIndex < 0) return null;
    const group = groupFromSectionId(field.sectionId);
    const rows = getServiceRows(element.data, group);
    if (field.fieldIndex >= rows.length) return null;

    const nextRows = [...rows];
    nextRows[field.fieldIndex] = {
      ...rows[field.fieldIndex],
      isRequired: !rows[field.fieldIndex].isRequired,
    };
    return { data: replaceRows(element.data, group, nextRows) };
  },

  getSelectedFieldItem: (element, field) => {
    if (field.fieldIndex < 0) return null;
    const group = groupFromSectionId(field.sectionId);
    return getServiceRows(element.data, group)[field.fieldIndex] ?? null;
  },

  getSubSelectSections: (element) => [
    { id: "params", name: "params", count: element.data.params?.length || 0 },
    { id: "returns", name: "returns", count: element.data.returns?.length || 0 },
  ],

  onNavigateSubSelect: (element, current, direction) => {
    const items: ServiceItem[] = buildServiceItems(element.data);
    if (items.length === 0) return null;

    const cur = selectedFieldToItem(current);
    let index = cur ? items.findIndex((item) => serviceItemsEqual(item, cur)) : -1;
    if (index < 0) {
      index = direction === "down" ? -1 : items.length;
    }

    const nextIndex =
      direction === "down"
        ? Math.min(items.length - 1, index + 1)
        : Math.max(0, index - 1);

    return itemToSelectedField(element.id, items[nextIndex]);
  },

  getInlineEditTarget: (element, localPoint): InlineEditState | null => {
    // 1. Card header → rename the service method
    if (localPoint.y <= SERVICE_HEADER_HEIGHT) {
      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 8,
          y: element.y + 4,
          width: element.width - 16,
          height: 24,
        },
        initialValue: toDisplayName(element.data?.name) || "Service",
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

    const layout = getServiceLayout(element.data);

    // 2. Param rows → rename the row
    const paramTarget = resolveRowEditTarget(
      element,
      "params",
      layout.paramsRowsTop,
      layout.paramsRowCount,
      element.data.params ?? [],
      localPoint.y,
    );
    if (paramTarget) return paramTarget;

    // 3. Return rows → rename the row
    const returnTarget = resolveRowEditTarget(
      element,
      "returns",
      layout.returnsRowsTop,
      layout.returnsRowCount,
      element.data.returns ?? [],
      localPoint.y,
    );
    if (returnTarget) return returnTarget;

    return null;
  },

  ai: {
    toolName: "create_service_card",
    description:
      "Create a Service card in the Event Model. Each Service card is ONE method execution with params (inputs) and returns (outputs). Services may share a name.",
    parameters: z.object({
      name: z
        .string()
        .describe("camelCase method name (e.g. placeOrder, chargeCard)"),
      params: z
        .array(
          z.object({
            name: z.string().describe("Param field name in camelCase"),
            type: z.string().describe("Field type (primitive or defined type name)"),
            isArray: z.boolean().optional().describe("Array of this type"),
            isRequired: z.boolean().optional().describe("Required"),
            description: z.string().optional().describe("What this param means"),
          }),
        )
        .optional()
        .describe("Param fields of the method"),
      returns: z
        .array(
          z.object({
            name: z.string().describe("Return field name (camelCase)"),
            type: z.string().describe("Field type (primitive or defined type name)"),
            isArray: z.boolean().optional().describe("Array of this type"),
            isRequired: z.boolean().optional().describe("Required"),
            description: z.string().optional().describe("What this return field means"),
          }),
        )
        .optional()
        .describe("Return fields of the method"),
      color: z.string().optional().describe("Optional hex color"),
      description: z.string().optional().describe("Description of the service method"),
    }),
    onCreate: (params, center: Point): CanvasElement<ServiceCardData> => {
      const data: ServiceCardData = {
        name: params.name || "serviceMethod",
        params: params.params || [],
        returns: params.returns || [],
        color: params.color || serviceCardTool.color,
        ...(params.description ? { description: params.description } : {}),
      };
      const size = computeServiceCardSize(data);
      return {
        id: `service-${nanoid(6)}`,
        type: "serviceCard",
        x: Math.round(center.x - size.width / 2),
        y: Math.round(center.y - size.height / 2),
        width: size.width,
        height: size.height,
        data,
      };
    },
  },
};

function renderEmptyGroupHint(
  container: Container,
  rowsTop: number,
  isDark: boolean,
  textResolution: number,
): void {
  const hint = new Text({
    text: "(none)",
    style: {
      fontSize: 11,
      fontFamily: '"Geist Mono", monospace',
      fill: isDark ? 0x52525b : 0xc4c4c8,
    },
    resolution: textResolution,
  });
  hint.x = 14;
  hint.y = rowsTop + 7;
  container.addChild(hint);
}

/**
 * Resolves the inline-edit target for a params/returns row under `localY`, or
 * null when the point is not on a populated row. Also parks the sub-selection on
 * the row so the options bar follows the edit.
 */
function resolveRowEditTarget(
  element: CanvasElement<ServiceCardData>,
  group: ServiceGroup,
  rowsTop: number,
  rowCount: number,
  rows: ServiceField[],
  localY: number,
): InlineEditState | null {
  const end = rowsTop + rowCount * SERVICE_ROW_HEIGHT;
  if (localY < rowsTop || localY >= end) return null;
  const index = Math.floor((localY - rowsTop) / SERVICE_ROW_HEIGHT);
  if (index < 0 || index >= rows.length) return null;

  const field = rows[index];
  useCanvasStore.getState().setSelectedField({
    elementId: element.id,
    sectionId: group,
    sectionIndex: SERVICE_SECTION_INDEX[group],
    fieldIndex: index,
  });

  return {
    elementId: element.id,
    worldBounds: {
      x: element.x + 12,
      y: element.y + rowsTop + index * SERVICE_ROW_HEIGHT + 2,
      width: Math.max(80, element.width - 60),
      height: 22,
    },
    initialValue: toDisplayName(field.name),
    multiline: false,
    onCommit: (newName) => {
      const trimmed = newName.trim();
      if (trimmed && !isSameIdentifier(trimmed, field.name)) {
        const nextRows = [...rows];
        nextRows[index] = { ...field, name: trimmed };
        useCanvasStore.getState().updateElement(element.id, {
          data: replaceRows(element.data, group, nextRows),
        });
      }
    },
  };
}
