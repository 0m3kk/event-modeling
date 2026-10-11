import type { Point, Rect, ResolvedTheme } from "@/types";
import type { SpatialIndex } from "../SpatialIndex";
import type { GizmoLayer } from "../layers/GizmoLayer";
import type { ElementLayer } from "../layers/ElementLayer";

export interface InteractionContext {
  screenToWorld(screenX: number, screenY: number): Point;
  worldToScreen(worldX: number, worldY: number): Point;
  spatialIndex: SpatialIndex;
  gizmoLayer: GizmoLayer;
  elementLayer: ElementLayer;
  setCursor(cursor: string): void;
  theme: ResolvedTheme;
  isSpaceHeld(): boolean;
}

export interface CanvasInteraction {
  readonly id: string;
  isActive(): boolean;
  onPointerDown(e: PointerEvent, worldPoint: Point, ctx: InteractionContext): boolean;
  onPointerMove(e: PointerEvent, worldPoint: Point, ctx: InteractionContext): void;
  onPointerUp(e: PointerEvent, worldPoint: Point, ctx: InteractionContext): void;
  onCancel?(ctx: InteractionContext): void;
}
