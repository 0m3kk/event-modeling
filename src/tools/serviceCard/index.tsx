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
import { resolveHeaderColor } from "@/utils/color";
import { toDisplayName, toDisplayType } from "@/utils/naming";
import { beginDescZones, addDescZone, hitDescZone } from "../common/descZones";
import { validateFieldTypes } from "../common/typeValidation";
import {
  SERVICE_DEFAULT_WIDTH,
  SERVICE_HEADER_HEIGHT,
  SERVICE_METHOD_HEADER_HEIGHT,
  SERVICE_GROUP_LABEL_HEIGHT,
  SERVICE_ROW_HEIGHT,
  bandIndex,
  bandToGroup,
  bandToMethodIndex,
  buildServiceItems,
  computeServiceCardSize,
  getMethodLayouts,
  itemToSelectedField,
  selectedFieldToItem,
  serviceItemsEqual,
  type ServiceCardData,
  type ServiceField,
  type ServiceGroup,
  type ServiceMethod,
} from "./layout";

export type {
  ServiceCardData,
  ServiceField,
  ServiceGroup,
  ServiceMethod,
} from "./layout";

export const ServiceCardSchema = z.object({
  name: z.string().default("ServiceName"),
  methods: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        params: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              isArray: z.boolean().optional(),
              isRequired: z.boolean().optional(),
              description: z.string().optional(),
            }),
          )
          .default([]),
        returns: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              isArray: z.boolean().optional(),
              isRequired: z.boolean().optional(),
              description: z.string().optional(),
            }),
          )
          .default([]),
        description: z.string().optional(),
      }),
    )
    .default([]),
  color: z.string().optional(),
  description: z.string().optional(),
  methodRef: z
    .object({
      serviceId: z.string(),
      methodId: z.string(),
    })
    .optional(),
});

export function createServiceMethod(index: number): ServiceMethod {
  return {
    id: `method-${nanoid(6)}`,
    name: `method${index}`,
    params: [],
    returns: [],
  };
}

/** Immutably replaces one group's rows within a method. */
function replaceRows(
  methods: ServiceMethod[],
  methodIndex: number,
  group: ServiceGroup,
  rows: ServiceField[],
): ServiceMethod[] {
  const next = [...methods];
  next[methodIndex] = { ...next[methodIndex], [group]: rows };
  return next;
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
  methodIndex: number;
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
    methodIndex,
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
        sectionIndex: bandIndex(methodIndex, group),
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
    "A Service that exposes methods; each method lists params and returns fields, and can be placed as a live method-execution copy",
  icon: Server,
  color: "#0ea5e9",
  category: "modeling",

  schema: ServiceCardSchema,
  createDefaultData: () => ({
    name: "NewService",
    methods: [],
    color: "#0ea5e9",
  }),

  defaultSize: { width: SERVICE_DEFAULT_WIDTH, height: SERVICE_HEADER_HEIGHT + SERVICE_ROW_HEIGHT },

  computeSize: (data) => computeServiceCardSize(data),

  optionsBar: ServiceCardOptions,

  validateData: (data, context) => {
    const elements = context.elements ?? [];
    const issues = (data.methods ?? []).flatMap((method, methodIndex) => [
      ...validateFieldTypes(method.params, `methods[${methodIndex}].params`, elements),
      ...validateFieldTypes(method.returns, `methods[${methodIndex}].returns`, elements),
    ]);
    return { data, issues };
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
    const methods = element.data.methods ?? [];
    const layouts = getMethodLayouts(element.data);

    const selectedField =
      context.selectedField?.elementId === element.id ? context.selectedField : null;

    const cardBg = isDark ? 0x18181b : 0xffffff;
    const sectionHeaderBg = isDark ? 0x27272a : 0xf4f4f5;
    const groupLabelBg = isDark ? 0x1f1f23 : 0xfafafa;
    const borderCol = isSelected ? 0x3b82f6 : isDark ? 0x3f3f46 : 0xe4e4e7;
    const sunkenColor = isDark ? 0x121214 : 0xf1f5f9;

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

    // 3. Method header + group label bands
    layouts.forEach((layout) => {
      g.rect(0, layout.headerTop, w, SERVICE_METHOD_HEADER_HEIGHT);
      g.fill({ color: sectionHeaderBg });
      g.rect(0, layout.paramsLabelTop, w, SERVICE_GROUP_LABEL_HEIGHT);
      g.fill({ color: groupLabelBg });
      g.rect(0, layout.returnsLabelTop, w, SERVICE_GROUP_LABEL_HEIGHT);
      g.fill({ color: groupLabelBg });
    });

    // 4. Sunken highlight for the active sub-selection
    if (selectedField) {
      if (selectedField.sectionId === "method" && selectedField.fieldIndex < 0) {
        const layout = layouts[selectedField.sectionIndex ?? 0];
        if (layout) {
          g.rect(0, layout.headerTop, w, SERVICE_METHOD_HEADER_HEIGHT);
          g.fill({ color: sunkenColor });
        }
      } else if (selectedField.fieldIndex >= 0) {
        const mi = bandToMethodIndex(selectedField.sectionIndex ?? 0);
        const group = bandToGroup(selectedField.sectionIndex ?? 0);
        const layout = layouts[mi];
        const rows = group === "params" ? layout?.method.params : layout?.method.returns;
        if (layout && rows && selectedField.fieldIndex < rows.length) {
          const base = group === "params" ? layout.paramsRowsTop : layout.returnsRowsTop;
          const rowY = base + selectedField.fieldIndex * SERVICE_ROW_HEIGHT;
          const isVeryLast =
            layout.methodIndex === methods.length - 1 &&
            group === "returns" &&
            selectedField.fieldIndex === rows.length - 1;
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
        }
      }
    }

    // 5. Border stroke
    g.roundRect(0, 0, w, h, r);
    g.stroke({ color: borderCol, width: isSelected ? 2 : 1 });
    container.addChild(g);

    // 6. Header title + ⓘ badge
    renderStandardCardTitle(
      container,
      element.data.name || "Service",
      headerColor,
      context.textResolution,
    );
    renderHeaderDescBadge(container, {
      elementId: element.id,
      width: w,
      isDark,
      isSelected,
      hasDescription: Boolean(element.data.description),
      hasReference: Boolean(element.referenceId) || Boolean(element.data.methodRef),
      text: element.data.description,
      textResolution: context.textResolution,
    });

    if (typeof document === "undefined") return;

    // 7. Empty hint
    if (methods.length === 0) {
      const empty = new Text({
        text: "(no methods)",
        style: {
          fontSize: 11,
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0x71717a : 0xa1a1aa,
        },
        resolution: context.textResolution,
      });
      empty.x = 12;
      empty.y = SERVICE_HEADER_HEIGHT + 7;
      container.addChild(empty);
      return;
    }

    // 8. Methods
    layouts.forEach((layout) => {
      const { method, methodIndex } = layout;
      const isMethodSelected = Boolean(
        selectedField &&
          selectedField.sectionId === "method" &&
          selectedField.fieldIndex < 0 &&
          selectedField.sectionIndex === methodIndex,
      );

      const nameText = new Text({
        text: toDisplayName(method.name),
        style: {
          fontSize: 12,
          fontWeight: "bold",
          fontFamily: '"Geist Mono", monospace',
          fill: isDark ? 0xf4f4f5 : 0x18181b,
        },
        resolution: context.textResolution,
      });
      nameText.x = 14;
      nameText.y = layout.headerTop + 5;
      container.addChild(nameText);

      if (method.description || isMethodSelected) {
        const cx = w - 16;
        const cy = layout.headerTop + SERVICE_METHOD_HEADER_HEIGHT / 2;
        const badgeG = new Graphics();
        drawInfoBadge(badgeG, container, cx, cy, {
          radius: 6,
          stroke: 0x94a3b8,
          fill: 0x64748b,
          fontSize: 7,
          alpha: method.description ? 1 : 0.5,
          textResolution: context.textResolution,
        });
        container.addChild(badgeG);

        if (method.description) {
          addDescZone(element.id, {
            elementId: element.id,
            sectionIndex: methodIndex,
            fieldIndex: -1,
            text: method.description,
            iconBounds: {
              x: cx - DESC_HIT_HALF,
              y: cy - DESC_HIT_HALF,
              width: DESC_HIT_HALF * 2,
              height: DESC_HIT_HALF * 2,
            },
          });
        }
      }

      renderServiceGroupLabel(
        container,
        "PARAMS",
        layout.paramsLabelTop,
        isDark,
        context.textResolution,
      );
      renderServiceGroupLabel(
        container,
        "RETURNS",
        layout.returnsLabelTop,
        isDark,
        context.textResolution,
      );

      (method.params ?? []).forEach((field, fieldIndex) => {
        renderServiceRow(container, {
          elementId: element.id,
          field,
          methodIndex,
          group: "params",
          fieldIndex,
          rowY: layout.paramsRowsTop + fieldIndex * SERVICE_ROW_HEIGHT,
          width: w,
          isDark,
          isSelected: Boolean(
            selectedField &&
              selectedField.sectionId === "params" &&
              selectedField.sectionIndex === bandIndex(methodIndex, "params") &&
              selectedField.fieldIndex === fieldIndex,
          ),
          textResolution: context.textResolution,
        });
      });
      if ((method.params ?? []).length === 0) {
        renderEmptyGroupHint(container, layout.paramsRowsTop, isDark, context.textResolution);
      }

      (method.returns ?? []).forEach((field, fieldIndex) => {
        renderServiceRow(container, {
          elementId: element.id,
          field,
          methodIndex,
          group: "returns",
          fieldIndex,
          rowY: layout.returnsRowsTop + fieldIndex * SERVICE_ROW_HEIGHT,
          width: w,
          isDark,
          isSelected: Boolean(
            selectedField &&
              selectedField.sectionId === "returns" &&
              selectedField.sectionIndex === bandIndex(methodIndex, "returns") &&
              selectedField.fieldIndex === fieldIndex,
          ),
          textResolution: context.textResolution,
        });
      });
      if ((method.returns ?? []).length === 0) {
        renderEmptyGroupHint(container, layout.returnsRowsTop, isDark, context.textResolution);
      }
    });
  },

  getDescHoverTarget: (element, localPoint) => hitDescZone(element.id, localPoint),

  onSubSelect: (element, localPoint): SelectedField | null => {
    const layouts = getMethodLayouts(element.data);
    const y = localPoint.y;

    for (const layout of layouts) {
      // Method header row
      if (y >= layout.headerTop && y < layout.paramsLabelTop) {
        return itemToSelectedField(element.id, {
          kind: "method",
          methodIndex: layout.methodIndex,
        });
      }
      // Params rows
      const paramsEnd = layout.paramsRowsTop + layout.paramsRowCount * SERVICE_ROW_HEIGHT;
      if (y >= layout.paramsRowsTop && y < paramsEnd) {
        const index = Math.floor((y - layout.paramsRowsTop) / SERVICE_ROW_HEIGHT);
        if (index < (layout.method.params?.length || 0)) {
          return itemToSelectedField(element.id, {
            kind: "field",
            methodIndex: layout.methodIndex,
            group: "params",
            fieldIndex: index,
          });
        }
        return null;
      }
      // Returns rows
      const returnsEnd = layout.returnsRowsTop + layout.returnsRowCount * SERVICE_ROW_HEIGHT;
      if (y >= layout.returnsRowsTop && y < returnsEnd) {
        const index = Math.floor((y - layout.returnsRowsTop) / SERVICE_ROW_HEIGHT);
        if (index < (layout.method.returns?.length || 0)) {
          return itemToSelectedField(element.id, {
            kind: "field",
            methodIndex: layout.methodIndex,
            group: "returns",
            fieldIndex: index,
          });
        }
        return null;
      }
    }
    return null;
  },

  onDeleteSubSelect: (element, fieldIndex, sectionIndex = 0) => {
    const methods = element.data.methods ?? [];

    // A selected method header (fieldIndex < 0) deletes the whole method.
    if (fieldIndex < 0) {
      const methodIndex = sectionIndex;
      if (methodIndex < 0 || methodIndex >= methods.length) return null;
      const nextData: ServiceCardData = {
        ...element.data,
        methods: methods.filter((_, i) => i !== methodIndex),
      };
      const size = computeServiceCardSize(nextData);
      return { height: size.height, data: nextData };
    }

    const methodIndex = bandToMethodIndex(sectionIndex);
    const method = methods[methodIndex];
    if (!method) return null;

    const group = bandToGroup(sectionIndex);
    const rows = method[group] ?? [];
    if (fieldIndex >= rows.length) return null;

    const nextData: ServiceCardData = {
      ...element.data,
      methods: replaceRows(
        methods,
        methodIndex,
        group,
        rows.filter((_, i) => i !== fieldIndex),
      ),
    };
    const size = computeServiceCardSize(nextData);
    return { height: size.height, data: nextData };
  },

  onUpdateSubSelectType: (element, field, type) => {
    if (field.fieldIndex < 0) return null;
    const methods = element.data.methods ?? [];
    const methodIndex = bandToMethodIndex(field.sectionIndex ?? 0);
    const group = bandToGroup(field.sectionIndex ?? 0);
    const method = methods[methodIndex];
    if (!method) return null;
    const rows = method[group] ?? [];
    if (field.fieldIndex >= rows.length) return null;

    const trimmed = type.trim();
    if (!trimmed) return null;
    const nextRows = [...rows];
    nextRows[field.fieldIndex] = { ...rows[field.fieldIndex], type: trimmed };
    return { data: { ...element.data, methods: replaceRows(methods, methodIndex, group, nextRows) } };
  },

  onToggleSubSelectArray: (element, field) => {
    if (field.fieldIndex < 0) return null;
    const methods = element.data.methods ?? [];
    const methodIndex = bandToMethodIndex(field.sectionIndex ?? 0);
    const group = bandToGroup(field.sectionIndex ?? 0);
    const method = methods[methodIndex];
    if (!method) return null;
    const rows = method[group] ?? [];
    if (field.fieldIndex >= rows.length) return null;

    const nextRows = [...rows];
    nextRows[field.fieldIndex] = {
      ...rows[field.fieldIndex],
      isArray: !rows[field.fieldIndex].isArray,
    };
    return { data: { ...element.data, methods: replaceRows(methods, methodIndex, group, nextRows) } };
  },

  onToggleSubSelectRequired: (element, field) => {
    if (field.fieldIndex < 0) return null;
    const methods = element.data.methods ?? [];
    const methodIndex = bandToMethodIndex(field.sectionIndex ?? 0);
    const group = bandToGroup(field.sectionIndex ?? 0);
    const method = methods[methodIndex];
    if (!method) return null;
    const rows = method[group] ?? [];
    if (field.fieldIndex >= rows.length) return null;

    const nextRows = [...rows];
    nextRows[field.fieldIndex] = {
      ...rows[field.fieldIndex],
      isRequired: !rows[field.fieldIndex].isRequired,
    };
    return { data: { ...element.data, methods: replaceRows(methods, methodIndex, group, nextRows) } };
  },

  getSelectedFieldItem: (element, field) => {
    if (field.sectionId === "method" || field.fieldIndex < 0) return null;
    const methodIndex = bandToMethodIndex(field.sectionIndex ?? 0);
    const group = bandToGroup(field.sectionIndex ?? 0);
    return element.data.methods?.[methodIndex]?.[group]?.[field.fieldIndex] ?? null;
  },

  getSubSelectSections: (element) => {
    const sections: { id: string; name: string; count: number }[] = [];
    (element.data.methods ?? []).forEach((method) => {
      sections.push({ id: "params", name: "params", count: method.params?.length || 0 });
      sections.push({ id: "returns", name: "returns", count: method.returns?.length || 0 });
    });
    return sections;
  },

  onNavigateSubSelect: (element, current, direction) => {
    const items = buildServiceItems(element.data);
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
    // 1. Card header → rename the service
    if (localPoint.y <= SERVICE_HEADER_HEIGHT) {
      return {
        elementId: element.id,
        worldBounds: {
          x: element.x + 8,
          y: element.y + 4,
          width: element.width - 16,
          height: 24,
        },
        initialValue: element.data?.name || "Service",
        multiline: false,
        onCommit: (newValue) => {
          const trimmed = newValue.trim();
          if (trimmed && trimmed !== element.data?.name) {
            useCanvasStore.getState().updateElement(element.id, {
              data: { ...element.data, name: trimmed },
            });
          }
        },
      };
    }

    const layouts = getMethodLayouts(element.data);

    for (const layout of layouts) {
      const method = layout.method;

      // 2. Method header → rename the method
      if (localPoint.y >= layout.headerTop && localPoint.y < layout.paramsLabelTop) {
        useCanvasStore.getState().setSelectedField({
          elementId: element.id,
          sectionId: "method",
          sectionIndex: layout.methodIndex,
          fieldIndex: -1,
        });
        return {
          elementId: element.id,
          worldBounds: {
            x: element.x + 12,
            y: element.y + layout.headerTop + 1,
            width: Math.max(80, element.width - 40),
            height: 22,
          },
          initialValue: method.name,
          multiline: false,
          onCommit: (newName) => {
            const trimmed = newName.trim();
            if (trimmed && trimmed !== method.name) {
              const methods = [...(element.data.methods ?? [])];
              methods[layout.methodIndex] = { ...method, name: trimmed };
              useCanvasStore.getState().updateElement(element.id, {
                data: { ...element.data, methods },
              });
            }
          },
        };
      }

      // 3. Param / return rows → rename the row
      const rowTarget = resolveRowEditTarget(
        element,
        layout.paramsRowsTop,
        layout.paramsRowCount,
        method.params ?? [],
        "params",
        layout.methodIndex,
        localPoint.y,
      );
      if (rowTarget) return rowTarget;

      const returnTarget = resolveRowEditTarget(
        element,
        layout.returnsRowsTop,
        layout.returnsRowCount,
        method.returns ?? [],
        "returns",
        layout.methodIndex,
        localPoint.y,
      );
      if (returnTarget) return returnTarget;
    }

    return null;
  },

  ai: {
    toolName: "create_service_card",
    description:
      "Create a Service card in the Event Model. A service exposes methods; each method has params (inputs) and returns (outputs).",
    parameters: z.object({
      name: z.string().describe("PascalCase service name (e.g. OrderService, PaymentGateway)"),
      methods: z
        .array(
          z.object({
            name: z.string().describe("Method name in camelCase (e.g. placeOrder)"),
            params: z
              .array(
                z.object({
                  name: z.string().describe("Param field name in camelCase"),
                  type: z
                    .string()
                    .describe(
                      "Field data type (e.g. string, number, boolean, or a defined Object/Enum/Alias name)",
                    ),
                  isArray: z.boolean().optional().describe("True when the field is an array of the type"),
                  isRequired: z.boolean().optional().describe("True when the field is required"),
                }),
              )
              .optional()
              .describe("Param fields of the method"),
            returns: z
              .array(
                z.object({
                  name: z.string().describe("Return field name in camelCase"),
                  type: z
                    .string()
                    .describe(
                      "Field data type (e.g. string, number, boolean, or a defined Object/Enum/Alias name)",
                    ),
                  isArray: z.boolean().optional().describe("True when the field is an array of the type"),
                  isRequired: z.boolean().optional().describe("True when the field is required"),
                }),
              )
              .optional()
              .describe("Return fields of the method"),
            description: z.string().optional().describe("Optional method description"),
          }),
        )
        .optional()
        .describe("Methods exposed by the service"),
      color: z.string().optional().describe("Optional header color hex code"),
      description: z
        .string()
        .optional()
        .describe("Optional plain-language description of the service"),
    }),
    onCreate: (params, center: Point): CanvasElement<ServiceCardData> => {
      const methods: ServiceMethod[] = (params.methods || []).map(
        (m: { name: string; params?: ServiceField[]; returns?: ServiceField[]; description?: string }) => ({
          id: `method-${nanoid(6)}`,
          name: m.name || "method",
          params: m.params || [],
          returns: m.returns || [],
          ...(m.description ? { description: m.description } : {}),
        }),
      );
      const data: ServiceCardData = {
        name: params.name || "Service",
        methods,
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
 * Resolves the inline-edit target for a param/return row under `localY`, or null
 * when the point is not on a populated row. Also parks the sub-selection on the
 * row so the options bar follows the edit.
 */
function resolveRowEditTarget(
  element: CanvasElement<ServiceCardData>,
  rowsTop: number,
  rowCount: number,
  rows: ServiceField[],
  group: ServiceGroup,
  methodIndex: number,
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
    sectionIndex: bandIndex(methodIndex, group),
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
    initialValue: field.name,
    multiline: false,
    onCommit: (newName) => {
      const trimmed = newName.trim();
      if (trimmed && trimmed !== field.name) {
        const methods = [...(element.data.methods ?? [])];
        const nextRows = [...rows];
        nextRows[index] = { ...field, name: trimmed };
        methods[methodIndex] = { ...methods[methodIndex], [group]: nextRows };
        useCanvasStore.getState().updateElement(element.id, {
          data: { ...element.data, methods },
        });
      }
    },
  };
}
