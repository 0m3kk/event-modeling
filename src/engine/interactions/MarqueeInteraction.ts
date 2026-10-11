import type { CanvasInteraction, InteractionContext } from "./types";
import type { Point, Rect } from "@/types";
import { useCanvasStore } from "@/store";

export class MarqueeInteraction implements CanvasInteraction {
  readonly id = "marquee";
  private active = false;
  private startWorld: Point = { x: 0, y: 0 };
  private initialSelectedIds: string[] = [];

  isActive(): boolean {
    return this.active;
  }

  onPointerDown(e: PointerEvent, worldPoint: Point, ctx: InteractionContext): boolean {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const tool = useCanvasStore.getState().tool;

    // Only activated when Cmd/Ctrl is held on empty space with select tool
    if (tool === "select" && isCmdOrCtrl && e.button === 0) {
      this.active = true;
      this.startWorld = worldPoint;

      const currentSelected = useCanvasStore.getState().selectedIds;
      this.initialSelectedIds = e.shiftKey ? [...currentSelected] : [];

      if (!e.shiftKey) {
        useCanvasStore.getState().clearSelection();
      }

      ctx.gizmoLayer.drawMarquee({
        x: worldPoint.x,
        y: worldPoint.y,
        width: 0,
        height: 0,
      });

      return true;
    }

    return false;
  }

  onPointerMove(_e: PointerEvent, worldPoint: Point, ctx: InteractionContext): void {
    if (!this.active) return;

    const rect: Rect = {
      x: this.startWorld.x,
      y: this.startWorld.y,
      width: worldPoint.x - this.startWorld.x,
      height: worldPoint.y - this.startWorld.y,
    };

    ctx.gizmoLayer.drawMarquee(rect);

    // Search elements in marquee box
    const foundIds = ctx.spatialIndex.searchRect(rect);
    const combined = new Set([...this.initialSelectedIds, ...foundIds]);
    useCanvasStore.getState().setSelectedIds(Array.from(combined));
  }

  onPointerUp(_e: PointerEvent, _worldPoint: Point, ctx: InteractionContext): void {
    if (!this.active) return;
    this.active = false;
    ctx.gizmoLayer.drawMarquee(null);
  }

  onCancel(ctx: InteractionContext): void {
    this.active = false;
    ctx.gizmoLayer.drawMarquee(null);
  }
}
