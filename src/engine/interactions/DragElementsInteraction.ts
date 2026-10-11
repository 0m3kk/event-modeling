import type { CanvasInteraction, InteractionContext } from "./types";
import type { Point, CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "@/tools";

export class DragElementsInteraction implements CanvasInteraction {
  readonly id = "dragElements";
  private active = false;
  private hasMoved = false;
  private dragStartWorld: Point = { x: 0, y: 0 };
  private initialPositions = new Map<string, Point>();
  private hitElementId: string | null = null;

  isActive(): boolean {
    return this.active;
  }

  onPointerDown(e: PointerEvent, worldPoint: Point, ctx: InteractionContext): boolean {
    if (e.button !== 0) return false;
    const tool = useCanvasStore.getState().tool;
    if (tool !== "select") return false;

    const hitId = ctx.spatialIndex.hitTest(worldPoint);
    if (!hitId) return false;

    this.active = true;
    this.hasMoved = false;
    this.hitElementId = hitId;
    this.dragStartWorld = worldPoint;
    this.initialPositions.clear();

    const { selectedIds, elements } = useCanvasStore.getState();
    const isAlreadySelected = selectedIds.includes(hitId);

    if (e.shiftKey) {
      if (isAlreadySelected) {
        useCanvasStore.getState().setSelectedIds(selectedIds.filter((id) => id !== hitId));
      } else {
        useCanvasStore.getState().setSelectedIds([...selectedIds, hitId]);
      }
    } else if (!isAlreadySelected) {
      useCanvasStore.getState().setSelectedIds([hitId]);
    }

    // Sub-element selection (e.g. fields)
    const hitElement = elements.find((item) => item.id === hitId);
    if (hitElement) {
      const tool = toolRegistry.get(hitElement.type);
      if (tool?.onSubSelect) {
        const localPoint: Point = {
          x: worldPoint.x - hitElement.x,
          y: worldPoint.y - hitElement.y,
        };
        const subResult = tool.onSubSelect(hitElement, localPoint);
        if (subResult !== null && subResult !== undefined) {
          if (typeof subResult === "object") {
            useCanvasStore.getState().setSelectedField(subResult);
          } else {
            useCanvasStore.getState().setSelectedField({
              elementId: hitId,
              fieldIndex: subResult,
            });
          }
        } else {
          useCanvasStore.getState().setSelectedField(null);
        }
      } else {
        useCanvasStore.getState().setSelectedField(null);
      }
    }

    // Capture initial positions of all items to drag
    const finalSelected = useCanvasStore.getState().selectedIds;
    for (const id of finalSelected) {
      const el = elements.find((item) => item.id === id);
      if (el) {
        this.initialPositions.set(id, { x: el.x, y: el.y });
      }
    }

    return true;
  }

  onPointerMove(_e: PointerEvent, worldPoint: Point, ctx: InteractionContext): void {
    if (!this.active) return;

    const dx = worldPoint.x - this.dragStartWorld.x;
    const dy = worldPoint.y - this.dragStartWorld.y;

    if (!this.hasMoved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      this.hasMoved = true;
      useCanvasStore.getState().setIsDragging(true);
    }

    const state = useCanvasStore.getState();
    const nextElements = state.elements.map((el) => {
      const initial = this.initialPositions.get(el.id);
      if (initial) {
        return {
          ...el,
          x: Math.round(initial.x + dx),
          y: Math.round(initial.y + dy),
        };
      }
      return el;
    });

    const selectedSet = new Set(state.selectedIds);
    ctx.elementLayer.renderElements(
      nextElements,
      selectedSet,
      ctx.theme,
      state.viewport.zoom,
    );

    const selected = nextElements.filter((el) => selectedSet.has(el.id));
    ctx.gizmoLayer.drawSelectionBounds(selected);
  }

  onPointerUp(_e: PointerEvent, worldPoint: Point, _ctx: InteractionContext): void {
    if (!this.active) return;
    this.active = false;

    if (this.hasMoved) {
      this.hasMoved = false;
      useCanvasStore.getState().setIsDragging(false);
    }

    const dx = worldPoint.x - this.dragStartWorld.x;
    const dy = worldPoint.y - this.dragStartWorld.y;

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      const updates: Array<{ id: string } & Partial<CanvasElement>> = [];
      for (const [id, initial] of this.initialPositions.entries()) {
        updates.push({
          id,
          x: Math.round(initial.x + dx),
          y: Math.round(initial.y + dy),
        });
      }
      useCanvasStore.getState().updateElements(updates);
    }

    this.initialPositions.clear();
    this.hitElementId = null;
  }

  onCancel(_ctx: InteractionContext): void {
    if (this.hasMoved) {
      this.hasMoved = false;
      useCanvasStore.getState().setIsDragging(false);
    }
    this.active = false;
    this.initialPositions.clear();
    this.hitElementId = null;
  }
}
