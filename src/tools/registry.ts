import type { ToolDefinition, ToolAIOperation } from "./types";
import { Graphics, Text } from "pixi.js";

class ToolRegistryImpl {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition) {
    this.tools.set(tool.type, tool);
  }

  get(type: string): ToolDefinition | undefined {
    return this.tools.get(type);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getAITools(): ToolAIOperation<any>[] {
    const list: ToolAIOperation<any>[] = [];
    for (const tool of this.tools.values()) {
      if (tool.ai) {
        list.push(tool.ai);
      }
    }
    return list;
  }

  /** Finds the tool definition backing an AI operation (by tool name). */
  getByAIToolName(toolName: string): ToolDefinition | undefined {
    for (const tool of this.tools.values()) {
      if (tool.ai?.toolName === toolName) return tool;
    }
    return undefined;
  }
}

export const toolRegistry = new ToolRegistryImpl();

/**
 * Fallback renderer when an element type is not recognized in the registry.
 */
export function renderFallbackElement(
  container: import("pixi.js").Container,
  element: import("@/types").CanvasElement,
  context: import("./types").RenderContext,
) {
  container.removeChildren();

  const isDark = context.theme === "dark";
  const g = new Graphics();
  g.rect(0, 0, element.width, element.height);
  g.fill({ color: isDark ? 0x27272a : 0xf4f4f5 });
  g.stroke({
    color: context.isSelected ? 0x3b82f6 : isDark ? 0x52525b : 0xd4d4d8,
    width: context.isSelected ? 2 : 1,
  });
  container.addChild(g);

  const label = new Text({
    text: `Unknown: ${element.type}`,
    style: {
      fontSize: 12,
      fontFamily: '"Geist Mono", monospace',
      fill: isDark ? 0xa1a1aa : 0x71717a,
    },
    resolution: context.textResolution,
  });
  label.x = 8;
  label.y = 8;
  container.addChild(label);
}
