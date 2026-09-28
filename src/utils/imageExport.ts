import type { CanvasObject, GroupInfo, Point } from "@/types";
import {
  computeElbowPath,
  getCardinalAnchorPoint,
  resolveConnectionAnchors,
} from "./elbowRouting";
import { computeGroupBounds } from "@/engine/layers/GroupLayer";
import { CONNECTOR_CONTACT_GAP } from "@/constants/canvas";
import {
  STORM_PHASE_LABELS,
  stormAccentColor,
} from "@/constants/storm";
import { MODEL_KIND_COLORS } from "@/constants/model";

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
        <text x="20" y="16" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" fill="#334155">${escapeXml(group.name)}</text>
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

    const { start, end } = resolveConnectionAnchors(startBounds, endBounds, {
      startGap: CONNECTOR_CONTACT_GAP,
      endGap: CONNECTOR_CONTACT_GAP,
    });
    const startPoint = getCardinalAnchorPoint(startBounds, start);
    const endPoint = getCardinalAnchorPoint(endBounds, end);
    const points: Point[] = computeElbowPath(startPoint, start, endPoint, end, {
      startGap: CONNECTOR_CONTACT_GAP,
      endGap: CONNECTOR_CONTACT_GAP,
    });

    if (points.length >= 2) {
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

      const fieldElements: string[] = [];
      let rowY = y + 44;

      // Storm Fields
      for (const f of storm.fields ?? []) {
        const requiredMark = f.required ? `<tspan fill="#ef4444">*</tspan>` : "";
        const tagPill = f.tag
          ? `<rect x="${x + 12}" y="${rowY - 11}" width="${Math.max(28, f.tag.length * 6 + 10)}" height="16" rx="4" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="0.5"/>
             <text x="${x + 17}" y="${rowY + 1}" font-size="9" font-family="monospace" fill="#64748b">${escapeXml(f.tag)}</text>`
          : "";
        const nameX = f.tag ? x + Math.max(28, f.tag.length * 6 + 10) + 18 : x + 14;

        fieldElements.push(`
        <g>
          ${tagPill}
          <text x="${nameX}" y="${rowY + 2}" font-size="11" font-family="sans-serif" font-weight="500" fill="#1e293b">${escapeXml(f.name)}${requiredMark}</text>
          <text x="${x + w - 14}" y="${rowY + 2}" text-anchor="end" font-size="10" font-family="monospace" fill="#64748b">${escapeXml(f.fieldType || "string")}</text>
        </g>`);
        rowY += 22;
      }

      // Action badge for Command / Query
      let actionBadge = "";
      if (storm.action) {
        actionBadge = `
        <rect x="${x + 12}" y="${rowY - 10}" width="${Math.max(80, storm.action.length * 6 + 16)}" height="18" rx="4" fill="#eff6ff" stroke="#bfdbfe" stroke-width="0.8"/>
        <text x="${x + 18}" y="${rowY + 3}" font-size="10" font-family="monospace" font-weight="500" fill="#1d4ed8">${escapeXml(storm.action)}</text>`;
      }

      // BDD Phase Pill in header
      let bddPhasePill = "";
      if (storm.phase) {
        const phaseLabel = STORM_PHASE_LABELS[storm.phase];
        bddPhasePill = `
        <rect x="${x + w - 60}" y="${y + 7}" width="48" height="18" rx="9" fill="rgba(255, 255, 255, 0.25)" />
        <text x="${x + w - 36}" y="${y + 20}" text-anchor="middle" font-size="9" font-family="sans-serif" font-weight="700" fill="#ffffff">${phaseLabel}</text>`;
      }

      elements.push(`
    <!-- Storm Card: ${storm.name} (${storm.kind}) -->
    <g id="card-${obj.id}" filter="url(#drop-shadow)">
      <!-- Body card -->
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ry="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5" />
      <!-- Header clip -->
      <path d="M ${x + 8} ${y} H ${x + w - 8} A 8 8 0 0 1 ${x + w} ${y + 8} V ${y + 32} H ${x} V ${y + 8} A 8 8 0 0 1 ${x + 8} ${y} Z" fill="${headerColor}" />
      <!-- Header Title -->
      <text x="${x + 12}" y="${y + 21}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${title}${storm.isArray ? " []" : ""}</text>
      ${bddPhasePill}
      <!-- Field Rows & Badges -->
      ${actionBadge}
      ${fieldElements.join("\n")}
    </g>`);
    } else if (obj.type === "model" && obj.modelData) {
      const model = obj.modelData;
      const headerColor = MODEL_KIND_COLORS[model.kind] || "#0891b2";
      const title = escapeXml(model.name);

      const fieldElements: string[] = [];
      let rowY = y + 44;

      if (model.kind === "object") {
        for (const f of model.fields ?? []) {
          const req = f.required ? `<tspan fill="#ef4444">*</tspan>` : "";
          fieldElements.push(`
          <g>
            <text x="${x + 14}" y="${rowY + 2}" font-size="11" font-family="sans-serif" font-weight="500" fill="#1e293b">${escapeXml(f.name)}${req}</text>
            <text x="${x + w - 14}" y="${rowY + 2}" text-anchor="end" font-size="10" font-family="monospace" fill="#64748b">${escapeXml(f.fieldType || "string")}</text>
          </g>`);
          rowY += 22;
        }
      } else if (model.kind === "enum") {
        for (const v of model.values ?? []) {
          fieldElements.push(`
          <g>
            <text x="${x + 14}" y="${rowY + 2}" font-size="11" font-family="monospace" font-weight="600" fill="#365314">• ${escapeXml(v.name)}</text>
          </g>`);
          rowY += 22;
        }
      }

      elements.push(`
    <!-- Model Node: ${model.name} (${model.kind}) -->
    <g id="model-${obj.id}" filter="url(#drop-shadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ry="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5" />
      <path d="M ${x + 8} ${y} H ${x + w - 8} A 8 8 0 0 1 ${x + w} ${y + 8} V ${y + 32} H ${x} V ${y + 8} A 8 8 0 0 1 ${x + 8} ${y} Z" fill="${headerColor}" />
      <text x="${x + 12}" y="${y + 21}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${title} (${model.kind})</text>
      ${fieldElements.join("\n")}
    </g>`);
    } else if (obj.type === "stickyNote") {
      const fill = obj.fill || "#fef08a"; // yellow-200
      const stroke = obj.stroke || "#fde047";
      elements.push(`
    <!-- Sticky Note -->
    <g id="sticky-${obj.id}" filter="url(#drop-shadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ry="4" fill="${fill}" stroke="${stroke}" stroke-width="1" />
      <text x="${x + 12}" y="${y + 24}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#1e293b">${escapeXml(obj.text || "")}</text>
    </g>`);
    } else if (obj.type === "textBox") {
      elements.push(`
    <!-- TextBox -->
    <g id="text-${obj.id}">
      <text x="${x + 4}" y="${y + 20}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="500" fill="#0f172a">${escapeXml(obj.text || "")}</text>
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
