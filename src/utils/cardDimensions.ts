import type {
  CanvasObject,
  StormData,
  ModelData,
  StormQueryItem,
  StormField,
  BddStep,
} from "@/types";
import {
  stormHasInputFields,
  stormHasParamsSection,
  stormHasQueryItems,
  stormHasResponseFields,
  stormHasSteps,
  stormHasTags,
  stormHasFieldTypes,
  stormHasAction,
} from "@/constants/storm";
import { GRID_SIZE } from "@/constants/canvas";
import { snapToGrid } from "./snapping";
import { resolveTargetModel } from "./modelResolution";
import { getActorPermissions } from "./stormAuth";

/**
 * Computes how many vertical lines a Query Item row requires based on its
 * event types and tag filters (1 on left, 1 on right, expanding vertically).
 */
export function computeStormQueryItemLines(
  item: StormQueryItem,
  fields: StormField[] = [],
): number {
  const eventCount = item.types.length;
  const tagCount = (item.tagFieldIds ?? []).filter((id) =>
    fields.some((f) => f.id === id && Boolean(f.tag?.trim())),
  ).length;
  return Math.max(1, eventCount, tagCount);
}

/**
 * Calculates the exact pixel height for a Query Item row.
 */
export function computeStormQueryItemHeight(
  item: StormQueryItem,
  fields: StormField[] = [],
): number {
  const lines = computeStormQueryItemLines(item, fields);
  return 4 + lines * 22;
}

/**
 * Computes how many lines a constraint free-text rule requires based on card width.
 */
export function computeStormConstraintItemLines(
  text: string,
  cardWidth: number = 200,
): number {
  const textX = 22;
  const wrapWidth = Math.max(40, cardWidth - textX - 10);
  const charsPerLine = Math.max(10, Math.floor(wrapWidth / 6.0));
  const rawText = text || "";
  const displayText = rawText.startsWith("•")
    ? rawText.replace(/^•\s*/, "")
    : rawText;
  const rawLines = displayText.split("\n");
  let totalLines = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const lineLen = rawLines[i].length;
    totalLines += Math.max(1, Math.ceil(lineLen / charsPerLine));
  }
  return Math.max(1, totalLines);
}

/**
 * Calculates the exact pixel height for a constraint rule row based on card width.
 */
export function computeStormConstraintItemHeight(
  text: string,
  cardWidth: number = 200,
): number {
  const lines = computeStormConstraintItemLines(text, cardWidth);
  return Math.max(26, lines * 14 + 12);
}

/** Layout constants for BDD scenario step rows. */
export const BDD_STEP_HEADER_HEIGHT = 24;
export const BDD_STEP_PAYLOAD_ROW_HEIGHT = 18;
export const BDD_STEP_GAP = 6;
/** Muted placeholder row shown when a BDD card has no steps yet. */
export const BDD_STEP_PLACEHOLDER_HEIGHT = 26;

/**
 * Exact pixel height of one BDD scenario step: its name row plus one row per
 * payload example value. Payloads are partial, so this grows with whatever the
 * scenario actually fills in.
 */
export function computeBddStepHeight(step: BddStep): number {
  const payloadRows = step.payload?.length ?? 0;
  return BDD_STEP_HEADER_HEIGHT + payloadRows * BDD_STEP_PAYLOAD_ROW_HEIGHT;
}

/**
 * Calculates the exact pixel height required to display all fields,
 * query items, constraints, and section headers of a Storm card. The
 * authorization action is a header badge, so it adds no height.
 */
export function computeStormCardHeight(
  data: StormData,
  cardWidth: number = 200,
): number {
  const kind = data.kind;
  const headerHeight = 36;
  let h = headerHeight + 6;

  const rowHeight = 26;
  const sectionLabelHeight = 22;
  const hasParams = stormHasParamsSection(kind);
  const hasResponse = stormHasResponseFields(kind);
  const hasInputOutput = stormHasInputFields(kind);
  const fields = data.fields ?? [];
  const inputFields = data.inputFields ?? [];
  const outputFields = data.outputFields ?? [];
  const responseFields = data.responseFields ?? [];
  const queryItems = data.queryItems ?? [];
  const constraints = data.constraints ?? [];

  if (kind === "actor") {
    const actorPerms = getActorPermissions(data);
    h += actorPerms.length * rowHeight;
    return Math.max(h, 80);
  }

  if (stormHasSteps(kind)) {
    // BDD cards list scenario steps instead of field rows. Each step is its
    // name row plus one row per concrete payload value it fills in.
    const steps = data.steps ?? [];
    if (steps.length === 0) {
      h += BDD_STEP_PLACEHOLDER_HEIGHT;
    } else {
      for (const step of steps) {
        h += computeBddStepHeight(step);
      }
      h += (steps.length - 1) * BDD_STEP_GAP;
    }
    h += 10; // bottom padding
    return Math.max(80, h);
  }

  if (hasInputOutput) {
    // Order mirrors the canvas: INPUT params -> Query Items -> OUTPUT fields.
    if (inputFields.length > 0) {
      h += sectionLabelHeight + inputFields.length * rowHeight;
    }

    if (queryItems.length > 0) {
      let queryItemsTotalHeight = 0;
      for (const item of queryItems) {
        queryItemsTotalHeight += computeStormQueryItemHeight(item, inputFields);
      }
      h += sectionLabelHeight + queryItemsTotalHeight;
    }

    if (outputFields.length > 0) {
      h += sectionLabelHeight + outputFields.length * rowHeight;
    }

    if (kind === "constraint" && constraints.length > 0) {
      let constraintsTotalHeight = 0;
      for (const c of constraints) {
        constraintsTotalHeight += computeStormConstraintItemHeight(
          c.text,
          cardWidth,
        );
      }
      h += sectionLabelHeight + constraintsTotalHeight;
    }

    h += 10; // bottom padding
    return Math.max(80, h);
  }

  if (hasParams && (fields.length > 0 || hasResponse)) {
    h += sectionLabelHeight;
  }
  h += fields.length * rowHeight;

  if (hasResponse) {
    h += sectionLabelHeight + responseFields.length * rowHeight;
  }

  if (stormHasQueryItems(kind) && queryItems.length > 0) {
    let queryItemsTotalHeight = 0;
    for (const item of queryItems) {
      queryItemsTotalHeight += computeStormQueryItemHeight(item, fields);
    }
    h += sectionLabelHeight + queryItemsTotalHeight;
  }

  if (kind === "constraint" && constraints.length > 0) {
    let constraintsTotalHeight = 0;
    for (const c of constraints) {
      constraintsTotalHeight += computeStormConstraintItemHeight(c.text, cardWidth);
    }
    h += sectionLabelHeight + constraintsTotalHeight;
  }

  h += 10; // bottom padding
  return Math.max(80, h);
}

/**
 * Calculates the exact pixel height required for a Model node.
 */
export function computeModelNodeHeight(data: ModelData): number {
  const headerHeight = 34;
  const rowHeight = 26;
  let h = headerHeight + 6;

  const kind = data.kind;
  const fields = data.fields ?? [];
  const values = data.values ?? [];

  if (kind === "object") {
    h += fields.length * rowHeight;
  } else if (kind === "enum") {
    h += values.length * rowHeight;
  } else if (kind === "array" || kind === "wrap") {
    h += rowHeight;
  }

  h += 10; // bottom padding
  return Math.max(80, h);
}

export type ResizeHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

export const MIN_CARD_WIDTH = {
  storm: 180,
  model: 160,
  stickyNote: 100,
  textBox: 60,
} as const;

export const MIN_CARD_HEIGHT = {
  storm: 80,
  model: 80,
  stickyNote: 80,
  textBox: 30,
} as const;

export function getCardMinDimensions(obj: CanvasObject): {
  minWidth: number;
  minHeight: number;
} {
  if (obj.type === "storm" && obj.stormData) {
    return {
      minWidth: MIN_CARD_WIDTH.storm,
      minHeight: computeStormCardHeight(obj.stormData, obj.width),
    };
  }
  if (obj.type === "model" && obj.modelData) {
    return {
      minWidth: MIN_CARD_WIDTH.model,
      minHeight: computeModelNodeHeight(obj.modelData),
    };
  }
  if (obj.type === "stickyNote") {
    return {
      minWidth: MIN_CARD_WIDTH.stickyNote,
      minHeight: MIN_CARD_HEIGHT.stickyNote,
    };
  }
  if (obj.type === "textBox") {
    return {
      minWidth: MIN_CARD_WIDTH.textBox,
      minHeight: MIN_CARD_HEIGHT.textBox,
    };
  }
  return { minWidth: 100, minHeight: 60 };
}

export interface ResizeBoundsParams {
  handle: ResizeHandle;
  initialBounds: { x: number; y: number; width: number; height: number };
  deltaX: number;
  deltaY: number;
  minWidth: number;
  minHeight: number;
  gridSize?: number;
}

export function calculateResizedBounds({
  handle,
  initialBounds,
  deltaX,
  deltaY,
  minWidth,
  minHeight,
  gridSize = GRID_SIZE,
}: ResizeBoundsParams): { x: number; y: number; width: number; height: number } {
  const { x: x0, y: y0, width: w0, height: h0 } = initialBounds;
  let newX = x0;
  let newY = y0;
  let newWidth = w0;
  let newHeight = h0;

  // Horizontal resizing
  if (handle.includes("e")) {
    const rawW = w0 + deltaX;
    newWidth = Math.max(minWidth, snapToGrid(rawW, gridSize));
  } else if (handle.includes("w")) {
    const rawW = w0 - deltaX;
    const snappedW = Math.max(minWidth, snapToGrid(rawW, gridSize));
    newWidth = snappedW;
    newX = x0 + (w0 - snappedW);
  }

  // Vertical resizing
  if (handle.includes("s")) {
    const rawH = h0 + deltaY;
    newHeight = Math.max(minHeight, snapToGrid(rawH, gridSize));
  } else if (handle.includes("n")) {
    const rawH = h0 - deltaY;
    const snappedH = Math.max(minHeight, snapToGrid(rawH, gridSize));
    newHeight = snappedH;
    newY = y0 + (h0 - snappedH);
  }

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
  };
}

/**
 * Calculates the optimal pixel width required to display all text
 * (title, field names, types, tags, constraints, query items)
 * without truncation.
 */
export function computeOptimalStormCardWidth(
  data: StormData,
  minWidth: number = 220,
  maxWidth: number = 700,
  objects?: CanvasObject[],
): number {
  const kind = data.kind;
  let requiredWidth = minWidth;

  // 1. Header Title width
  const title = (data.isArray ? `${data.name || ""}[]` : data.name) || "";
  if (title.length > 0) {
    const titleWidth = title.length * 7.5 + 14;
    let rightElementsWidth = 36;
    if (data.phase) rightElementsWidth += data.phase.length * 6 + 18;
    if (data.description) rightElementsWidth += 24;
    if (data.action && stormHasAction(kind)) rightElementsWidth += 24;
    requiredWidth = Math.max(requiredWidth, titleWidth + rightElementsWidth + 16);
  }

  // 2. Field rows
  const hasTypes = stormHasFieldTypes(kind);
  const hasTags = stormHasTags(kind);
  const allFields = [
    ...(data.fields ?? []),
    ...(data.inputFields ?? []),
    ...(data.outputFields ?? []),
    ...(data.responseFields ?? []),
  ];

  for (const f of allFields) {
    const rawType = f.fieldType || "string";
    const targetModel = objects ? resolveTargetModel(objects, rawType) : null;
    const isModel = Boolean(targetModel && targetModel.modelData);
    const typeZoneW = hasTypes
      ? Math.max(isModel ? 72 : 65, rawType.length * 6.5 + (isModel ? 24 : 14))
      : 0;
    const rawTag = f.tag || "";
    const hasTag = Boolean(f.tag && hasTags);
    // Size to the full `#tag` label (matches the renderer; no truncation cap),
    // so fitting the card width always gives long tags room.
    const tagPillW = hasTag ? Math.max(36, (rawTag.length + 1) * 6 + 14) : 0;
    const nameWidth =
      f.name.length * 7.2 + 24 + (f.required ? 12 : 0) + (f.description ? 20 : 0);

    const rowWidth =
      nameWidth +
      (hasTag ? tagPillW + 6 : 0) +
      (hasTypes ? typeZoneW + 8 : 0) +
      24;
    requiredWidth = Math.max(requiredWidth, rowWidth);
  }

  // 3. BDD scenario steps — name row plus one `key = value` row per payload
  // example. Payloads are partial, so only filled fields contribute width.
  for (const step of data.steps ?? []) {
    const nameWidth = (step.name?.length ?? 0) * 7.2 + 56;
    requiredWidth = Math.max(requiredWidth, nameWidth);
    for (const p of step.payload ?? []) {
      const payloadWidth = (p.key.length + p.value.length + 4) * 6.4 + 48;
      requiredWidth = Math.max(requiredWidth, payloadWidth);
    }
  }

  // 4. Query items
  for (const q of data.queryItems ?? []) {
    const maxTypeLen =
      q.types.length > 0 ? Math.max(...q.types.map((t) => t.length)) : 1;
    const taggedFields = (q.tagFieldIds ?? [])
      .map((id) => (data.inputFields ?? []).find((f) => f.id === id))
      .filter((f): f is StormField => Boolean(f && f.tag && f.tag.trim()));
    const maxTagTextLen =
      taggedFields.length > 0
        ? Math.max(
            ...taggedFields.map(
              (f) => `${f.tag!.trim()}:${f.name.trim()}`.length,
            ),
          )
        : 0;
    const tagPillW =
      maxTagTextLen > 0
        ? Math.max(40, (maxTagTextLen + 1) * 6.0 + 14)
        : 0;
    const eventW = maxTypeLen * 6.5 + 28;
    const qWidth = eventW + (tagPillW > 0 ? tagPillW + 12 : 0) + 24;
    requiredWidth = Math.max(requiredWidth, qWidth);
  }

  // 4. Constraints
  for (const c of data.constraints ?? []) {
    const cWidth = c.text.length * 6.0 + 44;
    requiredWidth = Math.max(requiredWidth, cWidth);
  }

  // 5. Actor permissions
  if (kind === "actor") {
    for (const p of getActorPermissions(data)) {
      const pWidth = p.length * 6.5 + 44;
      requiredWidth = Math.max(requiredWidth, pWidth);
    }
  }

  const snapped = snapToGrid(Math.ceil(requiredWidth), GRID_SIZE);
  return Math.min(maxWidth, Math.max(minWidth, snapped));
}

/**
 * Calculates the optimal pixel width required for a Model node to
 * display its title, fields, and values without truncation.
 */
export function computeOptimalModelNodeWidth(
  data: ModelData,
  minWidth: number = 200,
  maxWidth: number = 700,
  objects?: CanvasObject[],
): number {
  let requiredWidth = minWidth;

  const title = data.name || "";
  if (title.length > 0) {
    const titleWidth = title.length * 7.5 + 50;
    requiredWidth = Math.max(requiredWidth, titleWidth);
  }

  for (const f of data.fields ?? []) {
    const rawType = f.fieldType || "string";
    const targetModel = objects ? resolveTargetModel(objects, rawType) : null;
    const isModel = Boolean(targetModel && targetModel.modelData);
    const typeZoneW = Math.max(isModel ? 72 : 65, rawType.length * 6.5 + (isModel ? 24 : 14));
    const nameWidth = f.name.length * 7.2 + 20 + (f.description ? 20 : 0);
    const rowWidth = nameWidth + typeZoneW + 24;
    requiredWidth = Math.max(requiredWidth, rowWidth);
  }

  for (const v of data.values ?? []) {
    const text = v.name || v.value || "";
    const vWidth = text.length * 7.0 + 40;
    requiredWidth = Math.max(requiredWidth, vWidth);
  }

  if (data.itemType) {
    requiredWidth = Math.max(requiredWidth, data.itemType.length * 7.0 + 50);
  }
  if (data.innerType) {
    requiredWidth = Math.max(requiredWidth, data.innerType.length * 7.0 + 50);
  }

  const snapped = snapToGrid(Math.ceil(requiredWidth), GRID_SIZE);
  return Math.min(maxWidth, Math.max(minWidth, snapped));
}

/**
 * Resolves optimal width for any canvas object.
 */
export function computeOptimalCardWidth(
  obj: CanvasObject,
  minWidth?: number,
  maxWidth?: number,
  objects?: CanvasObject[],
): number {
  if (obj.type === "storm" && obj.stormData) {
    return computeOptimalStormCardWidth(obj.stormData, minWidth, maxWidth, objects);
  }
  if (obj.type === "model" && obj.modelData) {
    return computeOptimalModelNodeWidth(obj.modelData, minWidth, maxWidth, objects);
  }
  return obj.width || 200;
}


