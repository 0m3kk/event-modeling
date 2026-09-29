import { useMemo } from "react";
import { useCanvasStore } from "@/store";
import type { ElbowConnectorData, LineStyle } from "@/types";
import {
  getPolylineMidpointInfo,
  resolveConnectorPoints,
} from "@/utils/connectorGeometry";
import { Trash2 } from "lucide-react";

const CONNECTOR_COLORS = [
  "#475569", // Slate (default)
  "#2563eb", // Blue
  "#0891b2", // Cyan
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
];

const STROKE_WIDTHS = [
  { value: 1, label: "Thin" },
  { value: 2, label: "Normal" },
  { value: 4, label: "Bold" },
];

/** Small line-preview glyph so the stroke pattern reads without a text label. */
function LineStyleIcon({ style }: { style: LineStyle }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <line
        x1="2"
        y1="9"
        x2="16"
        y2="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap={style === "dotted" ? "round" : "butt"}
        strokeDasharray={
          style === "dashed" ? "4 3" : style === "dotted" ? "0.5 3" : undefined
        }
      />
    </svg>
  );
}

/** Line thickness preview. */
function WidthIcon({ width }: { width: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <line
        x1="2"
        y1="9"
        x2="16"
        y2="9"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Endpoint arrowhead preview with the head on the requested side. */
function ArrowIcon({ direction }: { direction: "start" | "end" }) {
  const isEnd = direction === "end";
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <line
        x1="3"
        y1="9"
        x2="15"
        y2="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d={isEnd ? "M15 9 L10 5.5 M15 9 L10 12.5" : "M3 9 L8 5.5 M3 9 L8 12.5"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ConnectorOptionsBar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const objects = useCanvasStore((s) => s.objects);
  const groups = useCanvasStore((s) => s.groups);
  const viewport = useCanvasStore((s) => s.viewport);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const deleteObjects = useCanvasStore((s) => s.deleteObjects);
  const isLocked = useCanvasStore((s) => s.isLocked);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const selectedConnector = useMemo(() => {
    if (selectedIds.length !== 1 || isLocked) return null;
    const obj = objects.find((o) => o.id === selectedIds[0]);
    return obj && obj.type === "connector" && obj.connectorData ? obj : null;
  }, [selectedIds, objects, isLocked]);

  const midpointInfo = useMemo(() => {
    if (!selectedConnector) return null;
    const points = resolveConnectorPoints(selectedConnector, objects, groups);
    return points && points.length >= 2
      ? getPolylineMidpointInfo(points)
      : null;
  }, [selectedConnector, objects, groups]);

  if (!selectedConnector || !selectedConnector.connectorData || !midpointInfo) {
    return null;
  }
  if (isDragging) return null;

  const data = selectedConnector.connectorData;
  const lineStyle: LineStyle = data.lineStyle ?? "solid";
  const strokeWidth = data.strokeWidth ?? 2;
  const color = data.stroke ?? "#475569";
  const arrowStart = data.arrowStart === true;
  const arrowEnd = data.arrowEnd !== false;

  const zoom = viewport.zoom;
  const screenX = (midpointInfo.point.x - viewport.x) * zoom;
  const screenY = (midpointInfo.point.y - viewport.y) * zoom;

  const barScale = Math.max(0.35, Math.min(2.0, zoom));

  // Offset the bar clear of the line: above a horizontal run, beside a
  // vertical one, so it never sits on top of the connector it controls.
  const offset = 14;
  const isHorizontal = midpointInfo.isHorizontal;
  const placeAbove = isHorizontal && screenY >= 48 * barScale + offset;
  const barClass = isHorizontal
    ? `-translate-x-1/2 ${placeAbove ? "-translate-y-full" : ""}`
    : "-translate-y-1/2";
  const barX = isHorizontal
    ? screenX
    : screenX + offset;
  const barY = isHorizontal
    ? placeAbove
      ? screenY - offset
      : screenY + offset
    : screenY;

  const patchData = (partial: Partial<ElbowConnectorData>) => {
    updateObject(selectedConnector.id, {
      connectorData: { ...data, ...partial },
    });
  };

  return (
    <div
      className={`pointer-events-none absolute z-40 ${barClass}`}
      style={{ left: barX, top: barY }}
    >
      <div
        className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-gray-200/90 bg-white/95 px-3.5 py-2 shadow-2xl backdrop-blur-md select-none"
        style={{ zoom: barScale }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Stroke Color Swatches */}
        <div className="flex items-center gap-1">
          {CONNECTOR_COLORS.map((swatch) => (
            <button
              key={swatch}
              onClick={() => patchData({ stroke: swatch })}
              className={`h-5 w-5 rounded-full border border-black/10 transition-transform ${
                color === swatch
                  ? "scale-125 ring-2 ring-blue-500 ring-offset-1"
                  : "hover:scale-110"
              }`}
              style={{ backgroundColor: swatch }}
              title={swatch}
            />
          ))}
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* Stroke Pattern (Solid / Dashed / Dotted) */}
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
          {(["solid", "dashed", "dotted"] as LineStyle[]).map((style) => (
            <button
              key={style}
              onClick={() => patchData({ lineStyle: style })}
              title={`${style[0].toUpperCase()}${style.slice(1)} line`}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                lineStyle === style
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <LineStyleIcon style={style} />
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* Stroke Width */}
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
          {STROKE_WIDTHS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => patchData({ strokeWidth: value })}
              title={`${label} line`}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                strokeWidth === value
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <WidthIcon width={value} />
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* Arrowhead toggles */}
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => patchData({ arrowStart: !arrowStart })}
            title={arrowStart ? "Hide start arrow" : "Show start arrow"}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
              arrowStart
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <ArrowIcon direction="start" />
          </button>
          <button
            onClick={() => patchData({ arrowEnd: !arrowEnd })}
            title={arrowEnd ? "Hide end arrow" : "Show end arrow"}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
              arrowEnd
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <ArrowIcon direction="end" />
          </button>
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* Delete Connector */}
        <button
          onClick={() => deleteObjects([selectedConnector.id])}
          title="Delete Connector"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
