import { Container } from "pixi.js";
import type { CanvasElement, ResolvedTheme } from "@/types";
import { toolRegistry, renderFallbackElement } from "@/tools";
import type { RenderContext } from "@/tools/types";

export class ElementLayer extends Container {
  private elementContainers = new Map<string, Container>();

  renderElements(
    elements: CanvasElement[],
    selectedIds: Set<string>,
    theme: ResolvedTheme,
    zoom: number,
  ) {
    const activeIds = new Set<string>();

    for (const element of elements) {
      activeIds.add(element.id);
      let container = this.elementContainers.get(element.id);
      if (!container) {
        container = new Container();
        this.addChild(container);
        this.elementContainers.set(element.id, container);
      }

      container.x = element.x;
      container.y = element.y;

      const isSelected = selectedIds.has(element.id);
      const context: RenderContext = {
        theme,
        isSelected,
        isHovered: false,
        zoom,
      };

      const tool = toolRegistry.get(element.type);
      if (tool) {
        tool.render(container, element, context);
      } else {
        renderFallbackElement(container, element, context);
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
