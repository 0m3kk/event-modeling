import type { CanvasInteraction, InteractionContext } from "./types";
import { PanInteraction } from "./PanInteraction";
import { MarqueeInteraction } from "./MarqueeInteraction";
import { DragElementsInteraction } from "./DragElementsInteraction";
import { CreateElementInteraction } from "./CreateElementInteraction";
import type { Point } from "@/types";
import { useCanvasStore } from "@/store";

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

  get isActive(): boolean {
    return this.activeInteraction !== null;
  }

  handlePointerDown(e: PointerEvent, worldPoint: Point): boolean {
    this.activeInteraction = null;

    // 1. Element creation tool
    if (this.createElement.onPointerDown(e, worldPoint, this.ctx)) {
      this.ctx.previewLayer.hidePreview();
      this.ctx.setCursor("default");
      return true;
    }

    // 2. Spacebar held or middle click forces Pan
    if (this.ctx.isSpaceHeld() || e.button === 1) {
      if (this.pan.onPointerDown(e, worldPoint, this.ctx)) {
        this.ctx.previewLayer.hidePreview();
        this.activeInteraction = this.pan;
        return true;
      }
    }

    // 3. Click/Drag on existing element
    if (this.dragElements.onPointerDown(e, worldPoint, this.ctx)) {
      this.ctx.previewLayer.hidePreview();
      this.activeInteraction = this.dragElements;
      return true;
    }

    // 4. Click/Drag on empty canvas:
    // If Command (Mac) or Ctrl (Windows) held -> Marquee selection box!
    if (e.metaKey || e.ctrlKey) {
      if (this.marquee.onPointerDown(e, worldPoint, this.ctx)) {
        this.ctx.previewLayer.hidePreview();
        this.activeInteraction = this.marquee;
        return true;
      }
    }

    // Otherwise -> Pan canvas (natural hand navigation on empty space)
    if (this.pan.onPointerDown(e, worldPoint, this.ctx)) {
      this.ctx.previewLayer.hidePreview();
      this.activeInteraction = this.pan;
      return true;
    }

    return false;
  }

  handlePointerMove(e: PointerEvent, worldPoint: Point): void {
    if (this.activeInteraction) {
      this.ctx.previewLayer.hidePreview();
      this.activeInteraction.onPointerMove(e, worldPoint, this.ctx);
      return;
    }

    // Spacebar held -> show grab cursor and hide ghost
    if (this.ctx.isSpaceHeld()) {
      this.ctx.previewLayer.hidePreview();
      this.ctx.setCursor("grab");
      return;
    }

    // Show ghost preview when a creation tool is active
    const currentTool = useCanvasStore.getState().tool;
    if (currentTool !== "select") {
      const zoom = useCanvasStore.getState().viewport.zoom;
      this.ctx.previewLayer.showPreview(currentTool, worldPoint, this.ctx.theme, zoom);
      this.ctx.setCursor("crosshair");
    } else {
      this.ctx.previewLayer.hidePreview();
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
    this.ctx.previewLayer.hidePreview();
  }
}
