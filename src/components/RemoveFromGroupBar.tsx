import { useMemo } from "react";
import { useCanvasStore } from "@/store";
import { RemoveFromGroupButton } from "./RemoveFromGroupButton";

/**
 * Floating "Remove from Group" button for grouped annotations (sticky notes,
 * text boxes) that have no options bar of their own. Storm cards, model nodes
 * and lines expose the same action inside their dedicated options bars.
 */
export function RemoveFromGroupBar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const objects = useCanvasStore((s) => s.objects);
  const groups = useCanvasStore((s) => s.groups);
  const viewport = useCanvasStore((s) => s.viewport);
  const isLocked = useCanvasStore((s) => s.isLocked);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const target = useMemo(() => {
    if (selectedIds.length !== 1 || isLocked) return null;
    const obj = objects.find((o) => o.id === selectedIds[0]);
    if (!obj || !obj.groupId || obj.type === "connector") return null;
    // Cards, model nodes and lines already show this action in their own bars.
    if (obj.type === "storm" || obj.type === "model" || obj.type === "line") {
      return null;
    }
    return obj;
  }, [selectedIds, objects, isLocked]);

  if (!target || isDragging) return null;

  const group = groups.find((g) => g.id === target.groupId);
  if (!group || group.locked) return null;

  const zoom = viewport.zoom;
  const screenX = (target.x - viewport.x) * zoom;
  const screenY = (target.y - viewport.y) * zoom;
  const cardWidth = target.width * zoom;
  const cardHeight = (target.height || 0) * zoom;

  const barScale = Math.max(0.35, Math.min(2.0, zoom));
  const barX = screenX + cardWidth / 2;
  const isAbove = screenY >= 40 * barScale + 10;
  const barY = isAbove ? screenY - 10 : screenY + cardHeight + 10;

  return (
    <div
      className={`pointer-events-none absolute z-40 -translate-x-1/2 ${
        isAbove ? "-translate-y-full" : ""
      }`}
      style={{ left: barX, top: barY }}
    >
      <div
        className="pointer-events-auto flex items-center rounded-2xl border border-gray-200/90 dark:border-zinc-800/90 bg-white/95 dark:bg-zinc-900/95 px-2 py-1.5 shadow-2xl backdrop-blur-md select-none"
        style={{ zoom: barScale }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <RemoveFromGroupButton objectId={target.id} groupName={group.name} />
      </div>
    </div>
  );
}
