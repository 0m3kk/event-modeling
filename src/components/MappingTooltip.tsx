import { useEffect, useMemo } from "react";
import { useCanvasStore } from "@/store";
import { ArrowLeftRight, AlertTriangle } from "lucide-react";
import { fieldNameMatches } from "@/utils/naming";

/** Max width of the mapping tooltip box (px) */
const TOOLTIP_MAX_WIDTH = 380;

/**
 * MappingTooltip — hover tooltip for the field mapping [⇄] or warning [!] badge
 * on Event fields, Command/Query response fields, and State/Constraint output fields.
 *
 * Driven by store.mappingHover (set by PixiEngine hover hit-testing).
 * Purely visual (pointer-events-none).
 */
export function MappingTooltip() {
  const mappingHover = useCanvasStore((s) => s.mappingHover);
  const mappingTarget = useCanvasStore((s) => s.mappingTarget);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const setMappingHover = useCanvasStore((s) => s.setMappingHover);

  const target = useMemo(() => {
    if (!mappingHover || !mappingHover.text) return null;
    const obj = objects.find((o) => o.id === mappingHover.objectId);
    if (!obj) return null;
    return { obj, ...mappingHover };
  }, [mappingHover, objects]);

  // Close when target disappears
  useEffect(() => {
    if (mappingHover && !target) {
      setMappingHover(null);
    }
  }, [mappingHover, target, setMappingHover]);

  const targetField = useMemo(() => {
    if (!target) return null;
    const sd = target.obj.stormData;
    if (!sd) return null;
    return (
      sd.fields?.find((f) => f.id === target.fieldId) ??
      sd.inputFields?.find((f) => f.id === target.fieldId) ??
      sd.outputFields?.find((f) => f.id === target.fieldId) ??
      sd.responseFields?.find((f) => f.id === target.fieldId) ??
      null
    );
  }, [target]);

  const matchedMappings = useMemo(() => {
    if (!target) return [];
    const sd = target.obj.stormData;
    if (!sd || !targetField) return [];
    const list: { eventLabel: string; expr: string }[] = [];
    for (const q of sd.queryItems ?? []) {
      if (!q.set) continue;
      for (const [key, expr] of Object.entries(q.set)) {
        if (
          fieldNameMatches(targetField.name, key) ||
          fieldNameMatches(targetField.id, key)
        ) {
          const evLabel = q.types?.length ? q.types.join(", ") : "Query Item";
          list.push({ eventLabel: evLabel, expr });
          break;
        }
      }
    }
    return list;
  }, [target, targetField]);

  if (!mappingHover || !target) return null;

  // Suppress tooltip if popover is open on this field
  if (
    mappingTarget?.objectId === target.objectId &&
    mappingTarget?.fieldId === target.fieldId
  ) {
    return null;
  }

  const zoom = viewport.zoom;
  const iconCx = target.iconBounds.x + target.iconBounds.width / 2;
  const iconCy = target.iconBounds.y + target.iconBounds.height / 2;
  const iconScreenX = (target.obj.x + iconCx - viewport.x) * zoom;
  const iconScreenY = (target.obj.y + iconCy - viewport.y) * zoom;

  const containerWidth =
    viewport.screenWidth > 0
      ? viewport.screenWidth
      : typeof window !== "undefined"
        ? window.innerWidth
        : 1200;
  const centerX = Math.min(
    Math.max(iconScreenX, TOOLTIP_MAX_WIDTH / 2 + 8),
    containerWidth - TOOLTIP_MAX_WIDTH / 2 - 8,
  );
  const containerHeight =
    viewport.screenHeight > 0
      ? viewport.screenHeight
      : typeof window !== "undefined"
        ? window.innerHeight
        : 800;
  const flip = iconScreenY + 60 > containerHeight;

  const isWarning = target.text.startsWith("Warning");
  const isOutputField = Boolean(
    (target.obj.stormData?.kind === "state" ||
      target.obj.stormData?.kind === "constraint") &&
      targetField &&
      (target.obj.stormData?.outputFields ?? []).some(
        (f) => f.id === targetField.id,
      ),
  );
  const isParamField = Boolean(
    (target.obj.stormData?.kind === "constraint" ||
      target.obj.stormData?.kind === "state") &&
      targetField &&
      (target.obj.stormData?.inputFields ?? []).some(
        (f) => f.id === targetField.id,
      ),
  );

  return (
    <div
      className={`pointer-events-none absolute z-50 rounded-lg p-2.5 shadow-2xl transition-opacity animate-in fade-in duration-75 ${
        isWarning
          ? "bg-amber-950/95 border border-amber-500/50 text-amber-200"
          : "bg-gray-900/95 dark:bg-zinc-900/95 text-white border border-gray-700/80 dark:border-zinc-700/80 backdrop-blur-sm"
      }`}
      style={{
        left: centerX,
        top: flip ? iconScreenY - 12 : iconScreenY + 16,
        width: "max-content",
        maxWidth: TOOLTIP_MAX_WIDTH,
        minWidth: 240,
        transform: flip ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
    >
      {isWarning ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-amber-400">
            <AlertTriangle size={13} className="shrink-0 text-amber-400" />
            <span>Missing Mapping</span>
          </div>
          <div className="text-xs text-amber-200/90 leading-snug">
            {target.text.replace(/^Warning:\s*/i, "")}
          </div>
          <div className="text-[10px] text-amber-400/70 italic pt-1 border-t border-amber-800/50">
            Click badge to configure
          </div>
        </div>
      ) : isOutputField && matchedMappings.length > 0 ? (
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-800 dark:border-zinc-800">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-wider uppercase text-cyan-400 flex items-center gap-1">
                <ArrowLeftRight size={11} />
                <span>Field Projections</span>
              </div>
              <div className="text-xs font-semibold text-white dark:text-zinc-100 truncate">
                {targetField?.name || "Field"}
                {targetField?.fieldType && (
                  <span className="text-[10px] font-normal text-gray-400 dark:text-zinc-400 ml-1.5">
                    ({targetField.fieldType})
                  </span>
                )}
              </div>
            </div>
            <span className="shrink-0 text-[10px] rounded bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 px-1.5 py-0.5 font-medium">
              {matchedMappings.length} {matchedMappings.length === 1 ? "event" : "events"}
            </span>
          </div>

          {/* List of event projections */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {matchedMappings.map((m, idx) => (
              <div
                key={idx}
                className="rounded-md bg-gray-950/70 dark:bg-zinc-950/80 border border-gray-800/80 dark:border-zinc-800/80 p-1.5 text-xs font-mono space-y-0.5"
              >
                <div className="text-[10px] font-semibold text-orange-400 dark:text-orange-300 flex items-center gap-1">
                  <span>⚡</span>
                  <span className="truncate">{m.eventLabel}</span>
                </div>
                <div className="text-cyan-300 dark:text-cyan-200 pl-3.5 break-all">
                  {m.expr}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[10px] text-gray-400 dark:text-zinc-500 italic pt-1 border-t border-gray-800 dark:border-zinc-800">
            Click badge to edit projections
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-800 dark:border-zinc-800">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-wider uppercase text-cyan-400 flex items-center gap-1">
                <ArrowLeftRight size={11} />
                <span>
                  {isParamField
                    ? target.obj.stormData?.kind === "state"
                      ? "State Param Mapping"
                      : "Constraint Param Mapping"
                    : "Field Mapping"}
                </span>
              </div>
              <div className="text-xs font-semibold text-white dark:text-zinc-100 truncate">
                {targetField?.name || "Field"}
                {targetField?.fieldType && (
                  <span className="text-[10px] font-normal text-gray-400 dark:text-zinc-400 ml-1.5">
                    ({targetField.fieldType})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Source Expression multiline */}
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-gray-400 dark:text-zinc-400">
              Source Expression:
            </div>
            <div className="rounded-md bg-gray-950/70 dark:bg-zinc-950/80 border border-gray-800/80 dark:border-zinc-800/80 px-2 py-1.5 font-mono text-xs text-cyan-300 dark:text-cyan-200 break-all select-text">
              {targetField?.mapping || target.text.replace(/^Mapping:\s*/i, "")}
            </div>
          </div>

          <div className="text-[10px] text-gray-400 dark:text-zinc-500 italic pt-1 border-t border-gray-800 dark:border-zinc-800">
            Click badge to edit mapping
          </div>
        </div>
      )}
    </div>
  );
}
