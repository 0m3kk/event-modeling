import type { CanvasObject, GroupInfo, Point, StormField } from "@/types";
import {
  computeResolvedConnectorPoints,
} from "./elbowRouting";
import { computeGroupBounds } from "@/engine/layers/GroupLayer";
import { CONNECTOR_CONTACT_GAP, APP_FONT_FAMILY } from "@/constants/canvas";
import {
  STORM_PHASE_LABELS,
  stormAccentColor,
  stormHasAction,
  stormHasFieldTypes,
  stormHasInputFields,
  stormHasParamsSection,
  stormHasQueryItems,
  stormHasResponseFields,
  stormHasTags,
} from "@/constants/storm";
import { MODEL_KIND_COLORS } from "@/constants/model";
import { findModelByName } from "./modelResolution";
import { getActorPermissions } from "./stormAuth";

/**
 * Font stack for the SVG export. The canvas renders every label in the bundled
 * Geist Mono font, so the SVG uses the same family (with monospace fallbacks).
 * Monospace keeps line wrapping stable even when Geist Mono is not installed.
 */
const SVG_FONT =
  "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * Canvas 2D context reused for text measurement. PixiJS sizes its `Text` nodes
 * with the same browser metrics, so measuring here lets the SVG wrap free-text
 * at the exact same points as the raster export.
 */
let measureContext: CanvasRenderingContext2D | null = null;

function measureTextWidth(text: string, fontSize: number): number {
  if (typeof document === "undefined") {
    // Non-DOM environments (unit tests): Geist Mono advance is ~0.6em.
    return text.length * fontSize * 0.6;
  }
  if (!measureContext) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) return text.length * fontSize * 0.6;
  measureContext.font = `${fontSize}px ${APP_FONT_FAMILY}`;
  return measureContext.measureText(text).width;
}

/** Splits a single word that is wider than the wrap width into chunks. */
function breakLongWord(word: string, maxWidth: number, fontSize: number): string[] {
  const chunks: string[] = [];
  let chunk = "";
  for (const char of word) {
    if (chunk && measureTextWidth(chunk + char, fontSize) > maxWidth) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk += char;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

/**
 * Greedy word wrap matching Pixi's `wordWrap`, with a hard character break for
 * words that cannot fit on their own line. Explicit newlines start new lines.
 */
export function wrapTextLines(
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const safeWidth = Math.max(1, maxWidth);
  const lines: string[] = [];
  const paragraphs = (text ?? "").replace(/\r\n?/g, "\n").split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureTextWidth(candidate, fontSize) <= safeWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
      }
      if (measureTextWidth(word, fontSize) > safeWidth) {
        const chunks = breakLongWord(word, safeWidth, fontSize);
        for (let i = 0; i < chunks.length - 1; i++) lines.push(chunks[i]);
        current = chunks[chunks.length - 1] ?? "";
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

/** Renders wrapped lines as a single SVG `<text>` using `<tspan>` line breaks. */
function svgMultilineText(
  lines: string[],
  x: number,
  firstBaseline: number,
  lineHeight: number,
  fontSize: number,
  fill: string,
  extraAttrs = "",
): string {
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${x}"${i === 0 ? "" : ` dy="${lineHeight}"`}>${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${firstBaseline}" font-size="${fontSize}" font-family="${SVG_FONT}" fill="${fill}"${extraAttrs}>${tspans}</text>`;
}

export function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function computeCanvasBounds(
  objects: CanvasObject[],
  groups: GroupInfo[] = [],
  padding = 40,
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of objects) {
    if (obj.type === "connector") continue;
    const w = obj.width ?? 200;
    const h = obj.height ?? 120;
    minX = Math.min(minX, obj.x);
    minY = Math.min(minY, obj.y);
    maxX = Math.max(maxX, obj.x + w);
    maxY = Math.max(maxY, obj.y + h);
  }

  for (const group of groups) {
    const gb = group.customBounds || computeGroupBounds(group, objects, groups);
    if (gb) {
      minX = Math.min(minX, gb.x);
      minY = Math.min(minY, gb.y);
      maxX = Math.max(maxX, gb.x + gb.width);
      maxY = Math.max(maxY, gb.y + gb.height);
    }
  }

  if (!isFinite(minX) || !isFinite(minY)) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
  }

  const pMinX = minX - padding;
  const pMinY = minY - padding;
  const pMaxX = maxX + padding;
  const pMaxY = maxY + padding;

  return {
    minX: pMinX,
    minY: pMinY,
    maxX: pMaxX,
    maxY: pMaxY,
    width: Math.max(200, pMaxX - pMinX),
    height: Math.max(200, pMaxY - pMinY),
  };
}

function findObjectOrGroupBounds(
  id: string,
  objects: CanvasObject[],
  groups: GroupInfo[],
): { x: number; y: number; width: number; height: number } | null {
  const obj = objects.find((o) => o.id === id);
  if (obj) {
    return {
      x: obj.x,
      y: obj.y,
      width: obj.width ?? 200,
      height: obj.height ?? 120,
    };
  }
  const group = groups.find((g) => g.id === id);
  if (group) {
    return group.customBounds || computeGroupBounds(group, objects, groups);
  }
  return null;
}

/**
 * Right-aligned type pill for a field row. Model references get a tinted pill
 * colored by the referenced node's kind; primitives are plain monospace text.
 */
function svgTypePill(
  objects: CanvasObject[],
  x: number,
  w: number,
  rowY: number,
  rawType: string,
): string {
  const targetModel = findModelByName(objects, rawType);
  const targetKind = targetModel?.modelData?.kind;
  if (!targetKind) {
    return `<text x="${x + w - 14}" y="${rowY + 2}" text-anchor="end" font-size="10" font-family="${SVG_FONT}" fill="#64748b">${escapeXml(rawType)}</text>`;
  }
  const kindColor = MODEL_KIND_COLORS[targetKind] || "#0891b2";
  const pillW = Math.min(108, Math.max(72, rawType.length * 6.5 + 20));
  return `<rect x="${x + w - pillW - 10}" y="${rowY - 11}" width="${pillW}" height="17" rx="3" fill="${kindColor}18" stroke="${kindColor}60" stroke-width="0.8"/>
      <text x="${x + w - 14}" y="${rowY + 2}" text-anchor="end" font-size="10" font-family="${SVG_FONT}" font-weight="600" fill="${kindColor}">${escapeXml(rawType)}</text>`;
}

/** One field row: optional tag pill, name (with required marker), optional type pill. */
function svgFieldRow(
  objects: CanvasObject[],
  x: number,
  w: number,
  rowY: number,
  field: StormField,
  showTag: boolean,
  showType: boolean,
): string {
  const rawTag = showTag && field.tag ? field.tag : "";
  const tagPillW = rawTag ? Math.max(28, rawTag.length * 6 + 18) : 0;
  const tagPill = rawTag
    ? `<rect x="${x + 12}" y="${rowY - 11}" width="${tagPillW}" height="16" rx="4" fill="#ffedd5" stroke="#fdba74" stroke-width="0.8"/>
       <text x="${x + 17}" y="${rowY + 1}" font-size="9" font-family="${SVG_FONT}" fill="#9a3412">#${escapeXml(rawTag)}</text>`
    : "";
  const nameX = rawTag ? x + 12 + tagPillW + 8 : x + 14;
  const requiredMark = field.required ? `<tspan fill="#ef4444">*</tspan>` : "";
  const typePill = showType
    ? svgTypePill(objects, x, w, rowY, field.fieldType || "string")
    : "";
  return `<g>${tagPill}<text x="${nameX}" y="${rowY + 2}" font-size="11" font-family="${SVG_FONT}" font-weight="500" fill="#1e293b">${escapeXml(field.name)}${requiredMark}</text>${typePill}</g>`;
}

function svgSectionLabel(
  x: number,
  y: number,
  label: string,
  color: string,
): string {
  return `<text x="${x}" y="${y}" font-size="9" font-weight="700" letter-spacing="0.5" font-family="${SVG_FONT}" fill="${color}">${escapeXml(label)}</text>`;
}

/**
 * Renders the full body of a storm card (action badge, params/response fields,
 * DCB query items, free-text constraints, actor permissions) so the SVG matches
 * what the live canvas shows. Returns the markup plus the Y it ended at.
 */
function svgStormBody(
  objects: CanvasObject[],
  storm: NonNullable<CanvasObject["stormData"]>,
  x: number,
  y: number,
  w: number,
): { svg: string; endY: number } {
  const kind = storm.kind;
  const parts: string[] = [];
  let rowY = y + 44;

  // Authorization action (Command / Query), shown as a badge at the top of the body.
  if (storm.action && stormHasAction(kind)) {
    const badgeW = Math.max(80, storm.action.length * 6 + 16);
    parts.push(`<rect x="${x + 12}" y="${rowY - 10}" width="${badgeW}" height="18" rx="4" fill="#eff6ff" stroke="#bfdbfe" stroke-width="0.8"/>
      <text x="${x + 18}" y="${rowY + 3}" font-size="10" font-family="${SVG_FONT}" font-weight="500" fill="#1d4ed8">${escapeXml(storm.action)}</text>`);
    rowY += 22;
  }

  // Actor cards list role permissions instead of fields.
  if (kind === "actor") {
    for (const perm of getActorPermissions(storm)) {
      parts.push(
        `<text x="${x + 14}" y="${rowY + 2}" font-size="11" font-family="${SVG_FONT}" fill="#334155">🔑 ${escapeXml(perm)}</text>`,
      );
      rowY += 22;
    }
    return { svg: parts.join("\n"), endY: rowY };
  }

  const fields = storm.fields ?? [];
  const inputFields = storm.inputFields ?? [];
  const outputFields = storm.outputFields ?? [];
  const responseFields = storm.responseFields ?? [];
  const queryItems = storm.queryItems ?? [];
  const constraints = storm.constraints ?? [];
  const showTag = stormHasTags(kind);
  const showType = stormHasFieldTypes(kind);
  const hasParams = stormHasParamsSection(kind);
  const hasResponse = stormHasResponseFields(kind);
  const hasInputOutput = stormHasInputFields(kind);

  if (hasInputOutput) {
    // State/Constraint: INPUT params -> Query Items -> OUTPUT fields.
    if (inputFields.length > 0) {
      parts.push(svgSectionLabel(x + 14, rowY + 2, "PARAMS", "#94a3b8"));
      rowY += 18;
      for (const field of inputFields) {
        parts.push(svgFieldRow(objects, x, w, rowY, field, showTag, showType));
        rowY += 22;
      }
    }
  } else {
    if (hasParams && (fields.length > 0 || hasResponse)) {
      parts.push(svgSectionLabel(x + 14, rowY + 2, "PARAMS", "#94a3b8"));
      rowY += 18;
    }
    for (const field of fields) {
      parts.push(svgFieldRow(objects, x, w, rowY, field, showTag, showType));
      rowY += 22;
    }

    if (hasResponse) {
      parts.push(svgSectionLabel(x + 14, rowY + 4, "RESPONSE", "#94a3b8"));
      rowY += 18;
      for (const field of responseFields) {
        parts.push(svgFieldRow(objects, x, w, rowY, field, showTag, showType));
        rowY += 22;
      }
    }
  }

  // DCB Query Items ("Related Events") on State / Constraint cards.
  if (stormHasQueryItems(kind) && queryItems.length > 0) {
    parts.push(svgSectionLabel(x + 14, rowY + 4, "QUERY ITEMS", "#7c3aed"));
    rowY += 18;
    for (const item of queryItems) {
      const types = item.types.length > 0 ? item.types : ["*"];
      const taggedFields = (item.tagFieldIds ?? [])
        .map((id) => inputFields.find((f) => f.id === id))
        .filter((f): f is StormField => Boolean(f && f.tag && f.tag.trim()));
      const rows = Math.max(types.length, taggedFields.length, 1);
      const itemTop = rowY;

      types.forEach((type, i) => {
        const label = i === 0 ? `◒ [${type}]` : `[${type}]`;
        parts.push(
          `<text x="${x + (i === 0 ? 14 : 26)}" y="${rowY + 12 + i * 20}" font-size="10" font-weight="700" font-family="${SVG_FONT}" fill="#6d28d9">${escapeXml(label)}</text>`,
        );
      });

      taggedFields.forEach((tf, i) => {
        const label = `${tf.tag!.trim()}:${tf.name.trim()}`;
        const pillW = Math.min(110, Math.max(40, label.length * 6 + 16));
        const pillY = rowY + 4 + i * 22;
        parts.push(`<rect x="${x + w - pillW - 10}" y="${pillY}" width="${pillW}" height="18" rx="9" fill="#ffedd5" stroke="#fdba74" stroke-width="0.8"/>
          <text x="${x + w - pillW / 2 - 10}" y="${pillY + 12}" text-anchor="middle" font-size="9" font-family="${SVG_FONT}" font-weight="600" fill="#9a3412">${escapeXml(label)}</text>`);
      });

      rowY = itemTop + rows * 20 + 4;
    }
  }

  // OUTPUT fields (State/Constraint): the projected read-model shape.
  if (hasInputOutput && outputFields.length > 0) {
    parts.push(svgSectionLabel(x + 14, rowY + 4, "FIELDS", "#94a3b8"));
    rowY += 18;
    for (const field of outputFields) {
      parts.push(svgFieldRow(objects, x, w, rowY, field, false, showType));
      rowY += 22;
    }
  }

  // Free-text constraints on Constraint cards. Rules wrap across multiple lines
  // exactly like the live canvas, so long rules never overflow the card.
  if (kind === "constraint" && constraints.length > 0) {
    parts.push(svgSectionLabel(x + 14, rowY + 4, "CONSTRAINTS", "#0f766e"));
    rowY += 18;
    const constraintTextX = 22;
    const constraintWrapWidth = Math.max(40, w - constraintTextX - 10);
    for (const c of constraints) {
      const text = (c.text || "").replace(/^•\s*/, "");
      const lines = wrapTextLines(text, constraintWrapWidth, 10);
      const itemHeight = Math.max(26, lines.length * 14 + 12);
      const firstBaseline = rowY + 13;
      parts.push(
        `<text x="${x + 10}" y="${firstBaseline}" font-size="10" font-family="${SVG_FONT}" fill="#134e4a">•</text>`,
      );
      parts.push(
        svgMultilineText(
          lines,
          x + constraintTextX,
          firstBaseline,
          14,
          10,
          "#134e4a",
        ),
      );
      rowY += itemHeight;
    }
  }

  return { svg: parts.join("\n"), endY: rowY };
}

/** Renders the full body of a model node (object fields, enum values, array/wrap item). */
function svgModelBody(
  objects: CanvasObject[],
  model: NonNullable<CanvasObject["modelData"]>,
  x: number,
  y: number,
  w: number,
): { svg: string; endY: number } {
  const parts: string[] = [];
  let rowY = y + 44;

  if (model.kind === "object") {
    for (const f of model.fields ?? []) {
      const requiredMark = f.required ? `<tspan fill="#ef4444">*</tspan>` : "";
      parts.push(
        `<text x="${x + 14}" y="${rowY + 2}" font-size="11" font-family="${SVG_FONT}" font-weight="500" fill="#1e293b">• ${escapeXml(f.name)}${requiredMark}</text>${svgTypePill(objects, x, w, rowY, f.fieldType || "string")}`,
      );
      rowY += 22;
    }
  } else if (model.kind === "enum") {
    const enumColor = MODEL_KIND_COLORS.enum || "#0891b2";
    for (const v of model.values ?? []) {
      parts.push(
        `<circle cx="${x + 18}" cy="${rowY - 2}" r="3" fill="${enumColor}"/><text x="${x + 28}" y="${rowY + 2}" font-size="11" font-family="${SVG_FONT}" fill="#1e293b">${escapeXml(v.name)}</text>`,
      );
      rowY += 22;
    }
  } else if (model.kind === "array") {
    const itemType = model.itemType || "any";
    const target = findModelByName(objects, itemType);
    const isModel = Boolean(target?.modelData);
    const color = isModel
      ? MODEL_KIND_COLORS[target!.modelData!.kind] || "#0891b2"
      : "#b91c1c";
    parts.push(
      `<rect x="${x + 10}" y="${rowY - 8}" width="${w - 20}" height="22" rx="4" fill="${color}18" stroke="${color}80" stroke-width="0.8"/><text x="${x + 18}" y="${rowY + 6}" font-size="11" font-weight="700" font-family="${SVG_FONT}" fill="${color}">Array of: ${escapeXml(itemType)}[]</text>`,
    );
    rowY += 26;
  } else if (model.kind === "wrap") {
    const innerType = model.innerType || "any";
    const target = findModelByName(objects, innerType);
    const isModel = Boolean(target?.modelData);
    const color = isModel
      ? MODEL_KIND_COLORS[target!.modelData!.kind] || "#0891b2"
      : "#a16207";
    parts.push(
      `<rect x="${x + 10}" y="${rowY - 8}" width="${w - 20}" height="22" rx="4" fill="${color}18" stroke="${color}80" stroke-width="0.8"/><text x="${x + 18}" y="${rowY + 6}" font-size="11" font-weight="700" font-family="${SVG_FONT}" fill="${color}">Wrap: ${escapeXml(innerType)}</text>`,
    );
    rowY += 26;
  }

  return { svg: parts.join("\n"), endY: rowY };
}

export function exportCanvasToSvg(
  objects: CanvasObject[],
  groups: GroupInfo[] = [],
  options?: { padding?: number },
): string {
  const bounds = computeCanvasBounds(objects, groups, options?.padding ?? 40);
  const elements: string[] = [];

  // 1. Groups (rendered at back)
  for (const group of groups) {
    const gb = group.customBounds || computeGroupBounds(group, objects, groups);
    if (!gb) continue;

    const strokeDash =
      group.lineStyle === "dashed"
        ? 'stroke-dasharray="8,6"'
        : group.lineStyle === "dotted"
          ? 'stroke-dasharray="3,3"'
          : "";
    const stroke = group.stroke || "#94a3b8";
    const strokeWidth = group.strokeWidth ?? 2;
    const fill = group.fill || "rgba(241, 245, 249, 0.4)";
    const tagColor = group.tagColor || "#3b82f6";

    elements.push(`
    <!-- Group: ${escapeXml(group.name)} -->
    <g id="group-${group.id}">
      <rect x="${gb.x}" y="${gb.y}" width="${gb.width}" height="${gb.height}" rx="12" ry="12" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${strokeDash} />
      <!-- Group Header Badge -->
      <g transform="translate(${gb.x + 14}, ${gb.y - 12})">
        <rect x="0" y="0" width="${Math.max(80, group.name.length * 8 + 24)}" height="24" rx="12" ry="12" fill="white" stroke="${stroke}" stroke-width="1.5" />
        <circle cx="10" cy="12" r="4.5" fill="${tagColor}" />
        <text x="20" y="16" font-family="${SVG_FONT}" font-size="11" font-weight="600" fill="#334155">${escapeXml(group.name)}</text>
      </g>
    </g>`);
  }

  // 2. Connectors
  const connectors = objects.filter(
    (o) => o.type === "connector" && !!o.connectorData,
  );
  for (const conn of connectors) {
    const data = conn.connectorData!;
    const startBounds = findObjectOrGroupBounds(
      data.start.objectId,
      objects,
      groups,
    );
    const endBounds = findObjectOrGroupBounds(
      data.end.objectId,
      objects,
      groups,
    );
    if (!startBounds || !endBounds) continue;

    const obstacleBounds: { x: number; y: number; width: number; height: number }[] = [];
    for (const obj of objects) {
      if (
        obj.type !== "connector" &&
        obj.id !== data.start.objectId &&
        obj.id !== data.end.objectId
      ) {
        obstacleBounds.push({
          x: obj.x,
          y: obj.y,
          width: obj.width ?? 200,
          height: obj.height ?? 120,
        });
      }
    }

    const points: Point[] | null = computeResolvedConnectorPoints(
      conn,
      startBounds,
      endBounds,
      obstacleBounds,
      {
        startGap: CONNECTOR_CONTACT_GAP,
        endGap: CONNECTOR_CONTACT_GAP,
      },
    );

    if (points && points.length >= 2) {
      const pathData = points
        .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
        .join(" ");
      const stroke = data.stroke || "#475569";
      const strokeWidth = data.strokeWidth ?? 2;

      elements.push(`
    <!-- Connector: ${conn.id} -->
    <path d="${pathData}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" marker-end="url(#arrow)" />`);
    }
  }

  // 3. Cards & Shapes
  for (const obj of objects) {
    if (obj.type === "connector") continue;

    const x = obj.x;
    const y = obj.y;
    const w = obj.width ?? 200;
    const h = obj.height ?? 120;

    if (obj.type === "storm" && obj.stormData) {
      const storm = obj.stormData;
      const headerColor = stormAccentColor(storm.kind, storm.phase);
      const title = escapeXml(storm.name);
      const body = svgStormBody(objects, storm, x, y, w);
      const cardHeight = Math.max(h, body.endY - y + 6);

      // BDD Phase Pill in header
      let bddPhasePill = "";
      if (storm.phase) {
        const phaseLabel = STORM_PHASE_LABELS[storm.phase];
        bddPhasePill = `
        <rect x="${x + w - 60}" y="${y + 7}" width="48" height="18" rx="9" fill="rgba(255, 255, 255, 0.25)" />
        <text x="${x + w - 36}" y="${y + 20}" text-anchor="middle" font-size="9" font-family="${SVG_FONT}" font-weight="700" fill="#ffffff">${phaseLabel}</text>`;
      }

      elements.push(`
    <!-- Storm Card: ${storm.name} (${storm.kind}) -->
    <g id="card-${obj.id}" filter="url(#drop-shadow)">
      <!-- Body card -->
      <rect x="${x}" y="${y}" width="${w}" height="${cardHeight}" rx="8" ry="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5" />
      <!-- Header clip -->
      <path d="M ${x + 8} ${y} H ${x + w - 8} A 8 8 0 0 1 ${x + w} ${y + 8} V ${y + 32} H ${x} V ${y + 8} A 8 8 0 0 1 ${x + 8} ${y} Z" fill="${headerColor}" />
      <!-- Header Title -->
      <text x="${x + 12}" y="${y + 21}" font-family="${SVG_FONT}" font-size="12" font-weight="700" fill="#ffffff">${title}${storm.isArray ? " []" : ""}</text>
      ${bddPhasePill}
      <!-- Body: fields, query items, constraints, permissions -->
      ${body.svg}
    </g>`);
    } else if (obj.type === "model" && obj.modelData) {
      const model = obj.modelData;
      const headerColor = MODEL_KIND_COLORS[model.kind] || "#0891b2";
      const title = escapeXml(model.name);
      const body = svgModelBody(objects, model, x, y, w);
      const cardHeight = Math.max(h, body.endY - y + 6);

      elements.push(`
    <!-- Model Node: ${model.name} (${model.kind}) -->
    <g id="model-${obj.id}" filter="url(#drop-shadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${cardHeight}" rx="8" ry="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5" />
      <path d="M ${x + 8} ${y} H ${x + w - 8} A 8 8 0 0 1 ${x + w} ${y + 8} V ${y + 32} H ${x} V ${y + 8} A 8 8 0 0 1 ${x + 8} ${y} Z" fill="${headerColor}" />
      <text x="${x + 12}" y="${y + 21}" font-family="${SVG_FONT}" font-size="12" font-weight="700" fill="#ffffff">${title} (${model.kind})</text>
      ${body.svg}
    </g>`);
    } else if (obj.type === "stickyNote") {
      const fill = obj.fill || "#fef08a"; // yellow-200
      const stroke = obj.stroke || "#fde047";
      const lines = wrapTextLines(obj.text || "", w - 20, 13);
      const noteHeight = Math.max(h, lines.length * 18 + 20);
      elements.push(`
    <!-- Sticky Note -->
    <g id="sticky-${obj.id}" filter="url(#drop-shadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${noteHeight}" rx="6" ry="6" fill="${fill}" stroke="${stroke}" stroke-width="1" />
      ${svgMultilineText(lines, x + 10, y + 20, 18, 13, "#713f12")}
    </g>`);
    } else if (obj.type === "textBox") {
      const lines = wrapTextLines(obj.text || "", w - 8, 14);
      elements.push(`
    <!-- TextBox -->
    <g id="text-${obj.id}">
      ${svgMultilineText(lines, x + 4, y + 15, 20, 14, "#0f172a", ' font-weight="500"')}
    </g>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">
  <defs>
    <!-- Arrowhead marker -->
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#475569" />
    </marker>
    <!-- Subtle drop shadow -->
    <filter id="drop-shadow" x="-10%" y="-10%" width="125%" height="125%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.08" />
    </filter>
  </defs>

  <!-- Background Canvas -->
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="#f9fafb" />

  ${elements.join("\n")}
</svg>`;
}

export function downloadSvg(svgContent: string, filename?: string): void {
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const baseName = (filename || "storm-board").replace(/[^A-Za-z0-9_-]/g, "_");
  a.href = url;
  a.download = `${baseName}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadBlob(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const baseName = (filename || "storm-board").replace(/[^A-Za-z0-9_-]/g, "_");
  a.href = url;
  a.download = `${baseName}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
