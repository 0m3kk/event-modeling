import { useEffect, useMemo } from "react";
import { useCanvasStore } from "@/store";
import { getAuthorizedActors } from "@/utils/stormAuth";
import { Shield } from "lucide-react";

/** Max width of the action tooltip box (px) */
const TOOLTIP_MAX_WIDTH = 300;

/**
 * ActionTooltip — hover tooltip for the authorization-action shield badge on a
 * Command / Query card header.
 *
 * Driven by store.actionHover (set by PixiEngine hover hit-testing), which
 * carries the action string and the icon bounds. The action is revealed here
 * instead of occupying a row on the card. Lists the actors whose permissions
 * match the action, mirroring the highlight the visual link layer shows.
 *
 * Purely visual (pointer-events-none).
 */
export function ActionTooltip() {
  const actionHover = useCanvasStore((s) => s.actionHover);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const setActionHover = useCanvasStore((s) => s.setActionHover);

  const target = useMemo(() => {
    if (!actionHover || !actionHover.action) return null;
    const obj = objects.find((o) => o.id === actionHover.objectId);
    if (!obj) return null;
    const actorNames = getAuthorizedActors(objects, actionHover.action).map(
      (actor) => actor.stormData?.name || "Actor",
    );
    return {
      obj,
      action: actionHover.action,
      actorNames,
      bounds: actionHover.iconBounds,
    };
  }, [actionHover, objects]);

  // Close when the target disappears (undo, delete…)
  useEffect(() => {
    if (actionHover && !target) {
      setActionHover(null);
    }
  }, [actionHover, target, setActionHover]);

  if (!actionHover || !target) return null;

  const zoom = viewport.zoom;
  const iconCx = target.bounds.x + target.bounds.width / 2;
  const iconCy = target.bounds.y + target.bounds.height / 2;
  const iconScreenX = (target.obj.x + iconCx - viewport.x) * zoom;
  const iconScreenY = (target.obj.y + iconCy - viewport.y) * zoom;

  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : 1200;
  const centerX = Math.min(
    Math.max(iconScreenX, TOOLTIP_MAX_WIDTH / 2 + 8),
    viewportWidth - TOOLTIP_MAX_WIDTH / 2 - 8,
  );
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight : 800;
  const flip = iconScreenY + 80 > viewportHeight;

  return (
    <div
      className="pointer-events-none absolute z-50 max-w-75 rounded-md bg-gray-900 px-3 py-2 text-white shadow-lg"
      style={{
        left: centerX,
        top: flip ? iconScreenY - 12 : iconScreenY + 16,
        maxWidth: TOOLTIP_MAX_WIDTH,
        transform: flip ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-white/60 uppercase">
        <Shield size={11} />
        <span>Authorization Action</span>
      </div>
      <div className="mt-1 font-mono text-xs break-all">{target.action}</div>
      <div className="mt-1.5 border-t border-white/15 pt-1.5 text-[11px] text-white/80">
        {target.actorNames.length > 0 ? (
          <>
            <span className="text-white/50">Authorized: </span>
            {target.actorNames.join(", ")}
          </>
        ) : (
          <span className="text-white/50 italic">No authorized actors</span>
        )}
      </div>
    </div>
  );
}
