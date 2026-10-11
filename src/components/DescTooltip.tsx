import { useEffect, useMemo } from "react";
import { useCanvasStore } from "@/store";

/**
 * Base metrics of the description tooltip box at zoom = 1. The whole box
 * (font, padding, radius, width, gap) is scaled by the canvas zoom so the
 * tooltip grows/shrinks together with the content.
 */
const BASE_MAX_WIDTH = 280;
const BASE_FONT_SIZE = 14;
const BASE_PAD_X = 12;
const BASE_PAD_Y = 8;
const BASE_RADIUS = 6;
/** Gap between the ⓘ badge and the tooltip box, above / below it. */
const BASE_GAP_ABOVE = 12;
const BASE_GAP_BELOW = 16;
/** Rough height budget used to decide whether to flip the tooltip above the badge. */
const BASE_FLIP_BUDGET = 60;

/**
 * DescTooltip — hover tooltip for a description ⓘ badge.
 *
 * Driven by `store.descHover` (set by PixiEngine hover hit-testing):
 * - `fieldIndex`/`sectionIndex` set → that row's description
 * - omitted → the card's own description
 *
 * Purely visual (pointer-events-none).
 */
export function DescTooltip() {
  const descHover = useCanvasStore((s) => s.descHover);
  const elements = useCanvasStore((s) => s.elements);
  const viewport = useCanvasStore((s) => s.viewport);
  const setDescHover = useCanvasStore((s) => s.setDescHover);

  const target = useMemo(() => {
    if (!descHover) return null;
    const element = elements.find((el) => el.id === descHover.elementId);
    if (!element) return null;
    return { element, text: descHover.text, bounds: descHover.iconBounds };
  }, [descHover, elements]);

  // Close when the target disappears (undo, delete…).
  useEffect(() => {
    if (descHover && !target) {
      setDescHover(null);
    }
  }, [descHover, target, setDescHover]);

  if (!descHover || !target) return null;

  const zoom = viewport.zoom || 1;
  const iconCx = target.bounds.x + target.bounds.width / 2;
  const iconCy = target.bounds.y + target.bounds.height / 2;
  const iconScreenX = (target.element.x + iconCx) * zoom + viewport.x;
  const iconScreenY = (target.element.y + iconCy) * zoom + viewport.y;

  // Scale the whole box with the canvas zoom.
  const maxWidth = BASE_MAX_WIDTH * zoom;
  const gapAbove = BASE_GAP_ABOVE * zoom;
  const gapBelow = BASE_GAP_BELOW * zoom;

  const containerWidth =
    viewport.screenWidth > 0
      ? viewport.screenWidth
      : typeof window !== "undefined"
        ? window.innerWidth
        : 1200;
  // Keep the box fully on-screen, but fall back to the raw icon position when
  // the (zoomed) box is wider than the viewport.
  const halfWidth = maxWidth / 2 + 8;
  const centerX =
    containerWidth > halfWidth * 2
      ? Math.min(Math.max(iconScreenX, halfWidth), containerWidth - halfWidth)
      : iconScreenX;
  const containerHeight =
    viewport.screenHeight > 0
      ? viewport.screenHeight
      : typeof window !== "undefined"
        ? window.innerHeight
        : 800;
  const flip = iconScreenY + BASE_FLIP_BUDGET * zoom > containerHeight;

  return (
    <div
      className="pointer-events-none absolute z-50 bg-gray-900 leading-relaxed whitespace-pre-wrap break-words text-white shadow-lg dark:border dark:border-zinc-700 dark:bg-zinc-800"
      style={{
        left: centerX,
        top: flip ? iconScreenY - gapAbove : iconScreenY + gapBelow,
        maxWidth,
        padding: `${BASE_PAD_Y * zoom}px ${BASE_PAD_X * zoom}px`,
        fontSize: BASE_FONT_SIZE * zoom,
        borderRadius: BASE_RADIUS * zoom,
        transform: flip ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
    >
      {target.text}
    </div>
  );
}
