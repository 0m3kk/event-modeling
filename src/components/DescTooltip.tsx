import { useEffect, useMemo } from "react";
import { useCanvasStore } from "@/store";
import { findDescriptionText } from "@/utils/description";

/** Max width of the description tooltip box (px) */
const TOOLTIP_MAX_WIDTH = 280;

/**
 * DescTooltip — hover tooltip for a description ⓘ icon.
 *
 * Driven by store.descHover (set by PixiEngine hover hit-testing):
 * - fieldId set → that field's description (row ⓘ)
 * - fieldId omitted → the card's own description (header ⓘ)
 *
 * Purely visual (pointer-events-none).
 */
export function DescTooltip() {
  const descHover = useCanvasStore((s) => s.descHover);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const setDescHover = useCanvasStore((s) => s.setDescHover);

  const target = useMemo(() => {
    if (!descHover) return null;
    const obj = objects.find((o) => o.id === descHover.objectId);
    if (!obj) return null;
    const text = findDescriptionText(obj, descHover.fieldId);
    if (!text) return null;
    return { obj, text, bounds: descHover.iconBounds };
  }, [descHover, objects]);

  // Close when the target disappears (undo, delete…)
  useEffect(() => {
    if (descHover && !target) {
      setDescHover(null);
    }
  }, [descHover, target, setDescHover]);

  if (!descHover || !target) return null;

  const zoom = viewport.zoom;
  const iconCx = target.bounds.x + target.bounds.width / 2;
  const iconCy = target.bounds.y + target.bounds.height / 2;
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
      className="pointer-events-none absolute z-50 max-w-70 rounded-md bg-gray-900 px-3 py-2 text-sm leading-relaxed wrap-break-words whitespace-pre-wrap text-white shadow-lg"
      style={{
        left: centerX,
        top: flip ? iconScreenY - 12 : iconScreenY + 16,
        maxWidth: TOOLTIP_MAX_WIDTH,
        transform: flip ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
    >
      {target.text}
    </div>
  );
}
