import type { CanvasInteraction, InteractionContext } from "./types";
import type { Point } from "@/types";
import { useCanvasStore } from "@/store";

export class PanInteraction implements CanvasInteraction {
  readonly id = "pan";
  private active = false;
  private hasMoved = false;
  private startClient: Point = { x: 0, y: 0 };
  private startViewport: Point = { x: 0, y: 0 };

  isActive(): boolean {
    return this.active;
  }

  onPointerDown(e: PointerEvent, _worldPoint: Point, ctx: InteractionContext): boolean {
    // Active if:
    // 1. Middle mouse button (button === 1)
    // 2. Spacebar held
    // 3. Or left click on empty canvas with tool === "select" AND neither Cmd nor Ctrl held!
    const isMiddle = e.button === 1;
    const isSpace = ctx.isSpaceHeld();
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const tool = useCanvasStore.getState().tool;

    if (isMiddle || isSpace || (tool === "select" && !isCmdOrCtrl)) {
      this.active = true;
      this.hasMoved = false;
      this.startClient = { x: e.clientX, y: e.clientY };

      const vp = useCanvasStore.getState().viewport;
      this.startViewport = { x: vp.x, y: vp.y };

      ctx.setCursor("grabbing");
      return true;
    }

    return false;
  }

  onPointerMove(e: PointerEvent, _worldPoint: Point, _ctx: InteractionContext): void {
    if (!this.active) return;

    const dx = e.clientX - this.startClient.x;
    const dy = e.clientY - this.startClient.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      this.hasMoved = true;
    }

    useCanvasStore.getState().setViewport({
      x: this.startViewport.x + dx,
      y: this.startViewport.y + dy,
    });
  }

  onPointerUp(e: PointerEvent, _worldPoint: Point, ctx: InteractionContext): void {
    if (!this.active) return;
    this.active = false;

    ctx.setCursor(ctx.isSpaceHeld() ? "grab" : "default");

    // If clicked empty canvas without panning, clear selection (like native canvas apps)
    if (!this.hasMoved && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      useCanvasStore.getState().clearSelection();
    }
  }

  onCancel(ctx: InteractionContext): void {
    this.active = false;
    ctx.setCursor(ctx.isSpaceHeld() ? "grab" : "default");
  }
}
