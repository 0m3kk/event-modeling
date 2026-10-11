import type { CanvasInteraction, InteractionContext } from "./types";
import type { Point, CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "@/tools";
import { findSliceDropTarget, SLICE_TYPE } from "@/tools/sliceCard/layout";
import { DOMAIN_TYPE, findDomainDropTarget, findDomainFreeSpot } from "@/tools/domainCard/layout";

export class DragElementsInteraction implements CanvasInteraction {
  readonly id = "dragElements";
  private active = false;
  private hasMoved = false;
  private dragStartWorld: Point = { x: 0, y: 0 };
  private initialPositions = new Map<string, Point>();
  private hitElementId: string | null = null;
  /** The single element being dragged, when exactly one is selected. */
  private singleDragged: { id: string; type: string } | null = null;

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
    this.singleDragged = null;
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

    // Sub-element selection (e.g. fields, slice lanes)
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

    // Capture initial positions of all items to drag. Dragging a container
    // (Slice or Domain) also carries everything it contains, recursively.
    const finalSelected = useCanvasStore.getState().selectedIds;
    const dragIds = new Set<string>(finalSelected);
    const queue = [...finalSelected];
    while (queue.length > 0) {
      const id = queue.pop()!;
      const el = elements.find((item) => item.id === id);
      if (!el) continue;
      if (el.type === SLICE_TYPE) {
        for (const child of elements) {
          if (child.sliceId === id && !dragIds.has(child.id)) {
            dragIds.add(child.id);
            queue.push(child.id);
          }
        }
      } else if (el.type === DOMAIN_TYPE) {
        for (const child of elements) {
          if (child.domainId === id && !dragIds.has(child.id)) {
            dragIds.add(child.id);
            queue.push(child.id);
          }
        }
      }
    }
    for (const id of dragIds) {
      const el = elements.find((item) => item.id === id);
      if (el) {
        this.initialPositions.set(id, { x: el.x, y: el.y });
      }
    }

    if (finalSelected.length === 1) {
      const el = elements.find((item) => item.id === finalSelected[0]);
      if (el) this.singleDragged = { id: el.id, type: el.type };
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
    // Slices carry their cards, so keep the cards visible while dragging.
    for (const id of this.initialPositions.keys()) selectedSet.add(id);

    ctx.elementLayer.renderElements(
      nextElements,
      selectedSet,
      ctx.theme,
      state.viewport.zoom,
    );

    const selected = nextElements.filter((el) => selectedSet.has(el.id));
    ctx.gizmoLayer.drawSelectionBounds(selected, state.viewport.zoom);
    this.updateDropTarget(worldPoint, ctx);
  }

  /** Shows/clears the drop highlight for a single dragged card/slice. */
  private updateDropTarget(worldPoint: Point, ctx: InteractionContext): void {
    if (!this.hasMoved || !this.singleDragged || this.singleDragged.type === DOMAIN_TYPE) {
      ctx.gizmoLayer.drawDropTarget(null);
      return;
    }

    const elements = useCanvasStore.getState().elements;

    // Cards prefer a slice lane; a lane of the wrong type shows no highlight.
    if (this.singleDragged.type !== SLICE_TYPE) {
      const lane = findSliceDropTarget(
        elements,
        worldPoint,
        this.singleDragged.id,
        this.singleDragged.type,
      );
      if (lane) {
        ctx.gizmoLayer.drawDropTarget(lane.allowed ? lane.rect : null);
        return;
      }
    }

    const domain = findDomainDropTarget(
      elements,
      worldPoint,
      this.singleDragged.id,
      this.singleDragged.type,
    );
    ctx.gizmoLayer.drawDropTarget(domain ? domain.rect : null);
  }

  /**
   * Attaches a dragged element to a domain. When the element first enters the
   * domain it is auto-placed in a free spot so cards never overlap; moving
   * within the same domain keeps the position the user dropped it at.
   */
  private placeInDomain(
    updates: Array<{ id: string } & Partial<CanvasElement>>,
    index: number,
    elements: CanvasElement[],
    dragged: CanvasElement,
    domainId: string,
  ): void {
    let x = updates[index].x as number;
    let y = updates[index].y as number;

    if (dragged.domainId !== domainId) {
      const children = elements.filter((el) => el.domainId === domainId && el.id !== dragged.id);
      const spot = findDomainFreeSpot(children, {
        x,
        y,
        width: dragged.width,
        height: dragged.height,
      });
      x = spot.x;
      y = spot.y;
    }

    updates[index] = {
      ...updates[index],
      x,
      y,
      domainId,
      sliceId: undefined,
      laneId: undefined,
    };
  }

  onPointerUp(_e: PointerEvent, worldPoint: Point, ctx: InteractionContext): void {
    if (!this.active) return;
    this.active = false;
    ctx.gizmoLayer.drawDropTarget(null);

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

      const single = this.singleDragged;
      if (single && single.type !== DOMAIN_TYPE) {
        const elements = useCanvasStore.getState().elements;
        const dragged = elements.find((el) => el.id === single.id);
        const index = updates.findIndex((u) => u.id === single.id);

        if (dragged && index >= 0) {
          if (single.type === SLICE_TYPE) {
            // Slices never join a lane, but may join/leave a Domain.
            const domain = findDomainDropTarget(elements, worldPoint, single.id, single.type);
            if (domain) {
              this.placeInDomain(updates, index, elements, dragged, domain.domainId);
            } else {
              updates[index] = { ...updates[index], domainId: undefined };
            }
          } else {
            const lane = findSliceDropTarget(elements, worldPoint, single.id, single.type);
            if (lane && !lane.allowed) {
              // Invalid lane type: snap back to where it was.
              updates.splice(index, 1);
            } else if (lane && lane.allowed) {
              updates[index] = {
                ...updates[index],
                sliceId: lane.sliceId,
                laneId: lane.laneId,
                domainId: undefined,
              };
            } else {
              // Not over a lane: maybe a Domain, otherwise detach from everything.
              const domain = findDomainDropTarget(elements, worldPoint, single.id, single.type);
              if (domain) {
                this.placeInDomain(updates, index, elements, dragged, domain.domainId);
              } else {
                updates[index] = {
                  ...updates[index],
                  domainId: undefined,
                  sliceId: undefined,
                  laneId: undefined,
                };
              }
            }
          }
        }
      }

      if (updates.length > 0) {
        useCanvasStore.getState().updateElements(updates);
      }
    }

    this.initialPositions.clear();
    this.singleDragged = null;
    this.hitElementId = null;
  }

  onCancel(ctx: InteractionContext): void {
    if (this.hasMoved) {
      this.hasMoved = false;
      useCanvasStore.getState().setIsDragging(false);
    }
    ctx.gizmoLayer.drawDropTarget(null);
    this.active = false;
    this.initialPositions.clear();
    this.singleDragged = null;
    this.hitElementId = null;
  }
}
