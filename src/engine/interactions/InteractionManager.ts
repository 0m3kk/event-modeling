import type { CanvasInteraction, InteractionContext } from "./types";
import { PanInteraction } from "./PanInteraction";
import { MarqueeInteraction } from "./MarqueeInteraction";
import { DragElementsInteraction } from "./DragElementsInteraction";
import { CreateElementInteraction } from "./CreateElementInteraction";
import type { Point } from "@/types";

export class InteractionManager {
  private pan = new PanInteraction();
  private marquee = new MarqueeInteraction();
  private dragElements = new DragElementsInteraction();
  private createElement = new CreateElementInteraction();

  private activeInteraction: CanvasInteraction | null = null;
  private ctx: InteractionContext;

  constructor(ctx: InteractionContext) {
    this.ctx = ctx;
  }

  handlePointerDown(e: PointerEvent, worldPoint: Point): boolean {
    this.activeInteraction = null;

    // 1. Element creation tool
    if (this.createElement.onPointerDown(e, worldPoint, this.ctx)) {
      return true;
    }

    // 2. Spacebar held or middle click forces Pan
    if (this.ctx.isSpaceHeld() || e.button === 1) {
      if (this.pan.onPointerDown(e, worldPoint, this.ctx)) {
        this.activeInteraction = this.pan;
        return true;
      }
    }

    // 3. Click/Drag on existing element
    if (this.dragElements.onPointerDown(e, worldPoint, this.ctx)) {
      this.activeInteraction = this.dragElements;
      return true;
    }

    // 4. Click/Drag on empty canvas:
    // If Command (Mac) or Ctrl (Windows) held -> Marquee selection box!
    if (e.metaKey || e.ctrlKey) {
      if (this.marquee.onPointerDown(e, worldPoint, this.ctx)) {
        this.activeInteraction = this.marquee;
        return true;
      }
    }

    // Otherwise -> Pan canvas (natural hand navigation on empty space)
    if (this.pan.onPointerDown(e, worldPoint, this.ctx)) {
      this.activeInteraction = this.pan;
      return true;
    }

    return false;
  }

  handlePointerMove(e: PointerEvent, worldPoint: Point): void {
    if (this.activeInteraction) {
      this.activeInteraction.onPointerMove(e, worldPoint, this.ctx);
    }
  }

  handlePointerUp(e: PointerEvent, worldPoint: Point): void {
    if (this.activeInteraction) {
      this.activeInteraction.onPointerUp(e, worldPoint, this.ctx);
      this.activeInteraction = null;
    }
  }

  cancelActive(): void {
    if (this.activeInteraction) {
      this.activeInteraction.onCancel?.(this.ctx);
      this.activeInteraction = null;
    }
  }
}
