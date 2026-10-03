import { useEffect, useMemo } from "react";
import { useCanvasStore } from "@/store";

/** Max width of the mapping tooltip box (px) */
const TOOLTIP_MAX_WIDTH = 320;

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

  return (
    <div
      className={`pointer-events-none absolute z-50 rounded-md px-3 py-2 text-sm leading-relaxed wrap-break-words whitespace-pre-wrap shadow-lg ${
        isWarning
          ? "bg-amber-950/90 border border-amber-600/50 text-amber-200"
          : "bg-gray-900 dark:bg-zinc-800 text-white dark:border dark:border-zinc-700"
      }`}
      style={{
        left: centerX,
        top: flip ? iconScreenY - 12 : iconScreenY + 16,
        maxWidth: TOOLTIP_MAX_WIDTH,
        transform: flip ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
    >
      <div
        className={`mb-0.5 text-[10px] font-bold tracking-wider uppercase ${
          isWarning ? "text-amber-400" : "text-cyan-400"
        }`}
      >
        {isWarning ? "Warning" : "Field Mapping"}
      </div>
      <div className="font-mono text-xs">{target.text}</div>
    </div>
  );
}
