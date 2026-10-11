import type { CanvasInteraction, InteractionContext } from "./types";
import type { Point, CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "@/tools";

export class CreateElementInteraction implements CanvasInteraction {
  readonly id = "createElement";

  isActive(): boolean {
    return false; // Instantaneous action on pointer down
  }

  onPointerDown(e: PointerEvent, worldPoint: Point, _ctx: InteractionContext): boolean {
    if (e.button !== 0) return false;
    const tool = useCanvasStore.getState().tool;
    if (tool === "select") return false;

    const toolDef = toolRegistry.get(tool);
    if (!toolDef) return false;

    const data = toolDef.createDefaultData();
    const size = toolDef.computeSize ? toolDef.computeSize(data) : toolDef.defaultSize;

    const newElement: CanvasElement = {
      id: `${tool}-${Date.now().toString(36)}`,
      type: tool,
      x: Math.round(worldPoint.x - size.width / 2),
      y: Math.round(worldPoint.y - size.height / 2),
      width: size.width,
      height: size.height,
      data,
    };

    useCanvasStore.getState().addElement(newElement);
    useCanvasStore.getState().setTool("select");
    return true;
  }

  onPointerMove(): void {}
  onPointerUp(): void {}
}
