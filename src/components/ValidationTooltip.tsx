import { useEffect, useMemo } from "react";
import { useCanvasStore } from "@/store";

/** Max width of the validation tooltip box (px) */
const TOOLTIP_MAX_WIDTH = 300;

/**
 * ValidationTooltip — hover tooltip for the validation ✓ badge on a Command
 * field / Query param row.
 *
 * Driven by store.validationHover (set by PixiEngine hover hit-testing). The
 * tooltip text is the pre-rendered rule summary carried on the hit zone, so no
 * field lookup is needed beyond confirming the card still exists.
 *
 * Purely visual (pointer-events-none).
 */
export function ValidationTooltip() {
  const validationHover = useCanvasStore((s) => s.validationHover);
  const validationTarget = useCanvasStore((s) => s.validationTarget);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const setValidationHover = useCanvasStore((s) => s.setValidationHover);

  const target = useMemo(() => {
    if (!validationHover || !validationHover.text) return null;
    const obj = objects.find((o) => o.id === validationHover.objectId);
    if (!obj) return null;
    return { obj, ...validationHover };
  }, [validationHover, objects]);

  // Close when the target disappears (undo, delete…)
  useEffect(() => {
    if (validationHover && !target) {
      setValidationHover(null);
    }
  }, [validationHover, target, setValidationHover]);

  if (!validationHover || !target) return null;

  // Suppress the tooltip while the panel it describes is already open.
  if (
    validationTarget?.objectId === target.objectId &&
    validationTarget?.fieldId === target.fieldId
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

  return (
    <div
      className="pointer-events-none absolute z-50 max-w-75 rounded-md bg-gray-900 px-3 py-2 text-sm leading-relaxed wrap-break-words whitespace-pre-wrap text-white shadow-lg"
      style={{
        left: centerX,
        top: flip ? iconScreenY - 12 : iconScreenY + 16,
        maxWidth: TOOLTIP_MAX_WIDTH,
        transform: flip ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
    >
      <div className="mb-0.5 text-[10px] font-bold tracking-wider text-emerald-300 uppercase">
        Validation
      </div>
      {target.text}
    </div>
  );
}
