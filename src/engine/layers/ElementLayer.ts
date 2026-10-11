import { Container } from "pixi.js";
import type { CanvasElement, ResolvedTheme } from "@/types";
import { toolRegistry, renderFallbackElement } from "@/tools";
import type { RenderContext } from "@/tools/types";
import { computeTextResolution } from "../textResolution";

interface CacheableContainer extends Container {
  _drawKey?: string;
}

export class ElementLayer extends Container {
  private elementContainers = new Map<string, CacheableContainer>();

  renderElements(
    elements: CanvasElement[],
    selectedIds: Set<string>,
    theme: ResolvedTheme,
    zoom: number,
  ) {
    const activeIds = new Set<string>();
    const textResolution = computeTextResolution(zoom);

    for (const element of elements) {
      activeIds.add(element.id);
      let container = this.elementContainers.get(element.id);
      if (!container) {
        container = new Container() as CacheableContainer;
        this.addChild(container);
        this.elementContainers.set(element.id, container);
      }

      container.x = element.x;
      container.y = element.y;

      const isSelected = selectedIds.has(element.id);

      // Cache key: only re-render children when content, selection, theme, size, or resolution changes
      const drawKey = `${element.id}_${element.width}x${element.height}_${isSelected}_${theme}_${textResolution}_${JSON.stringify(element.data)}`;

      if (container._drawKey !== drawKey) {
        container._drawKey = drawKey;

        const context: RenderContext = {
          theme,
          isSelected,
          isHovered: false,
          zoom,
          textResolution,
        };

        const tool = toolRegistry.get(element.type);
        if (tool) {
          tool.render(container, element, context);
        } else {
          renderFallbackElement(container, element, context);
        }
      }
    }

    // Remove deleted elements
    for (const [id, container] of this.elementContainers.entries()) {
      if (!activeIds.has(id)) {
        this.removeChild(container);
        container.destroy({ children: true });
        this.elementContainers.delete(id);
      }
    }
  }

  clear() {
    for (const container of this.elementContainers.values()) {
      this.removeChild(container);
      container.destroy({ children: true });
    }
    this.elementContainers.clear();
  }
}
