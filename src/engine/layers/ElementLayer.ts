import { Container, Graphics } from "pixi.js";
import type { CanvasElement, ResolvedTheme } from "@/types";
import { toolRegistry, renderFallbackElement } from "@/tools";
import type { RenderContext } from "@/tools/types";
import { computeTextResolution } from "../textResolution";
import { useCanvasStore } from "@/store";
import { drawReferenceIndicator, drawMethodCopyBadge } from "./linkBadge";
import { isElementOriginal } from "@/utils/reference";
import { clearDescZones } from "@/tools/common/descZones";

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
    const selectedField = useCanvasStore.getState().selectedField;

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
      const fieldKey =
        selectedField && selectedField.elementId === element.id
          ? `${selectedField.sectionIndex ?? 0}_${selectedField.fieldIndex}`
          : -1;

      const isOriginal = isElementOriginal(element, elements);

      // Cache key: only re-render children when content, selection, selected field, theme, size, resolution, referenceId, or isOriginal changes
      const drawKey = `${element.id}_${element.width}x${element.height}_${isSelected}_${fieldKey}_${theme}_${textResolution}_${element.referenceId || ""}_${isOriginal}_${JSON.stringify(element.data)}`;

      if (container._drawKey !== drawKey) {
        container._drawKey = drawKey;

        const context: RenderContext = {
          theme,
          isSelected,
          selectedField,
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

        // Reference indicator badge — marks Original (Master ❖) vs Reference Copy (Link 🔗).
        // Method-execution copies (Service) get their own play badge instead.
        const methodRef = (element.data as { methodRef?: unknown } | undefined)?.methodRef;
        if (methodRef) {
          const badgeGraphics = new Graphics();
          badgeGraphics.eventMode = "none";
          drawMethodCopyBadge(badgeGraphics, element, {
            theme,
            radius: 9,
          });
          container.addChild(badgeGraphics);
        } else if (element.referenceId) {
          const badgeGraphics = new Graphics();
          badgeGraphics.eventMode = "none";
          drawReferenceIndicator(badgeGraphics, element, isOriginal, {
            theme,
            radius: 9,
          });
          container.addChild(badgeGraphics);
        }
      }
    }

    // Remove deleted elements
    for (const [id, container] of this.elementContainers.entries()) {
      if (!activeIds.has(id)) {
        this.removeChild(container);
        container.destroy({ children: true });
        this.elementContainers.delete(id);
        clearDescZones(id);
      }
    }
  }

  clear() {
    for (const [id, container] of this.elementContainers.entries()) {
      this.removeChild(container);
      container.destroy({ children: true });
      clearDescZones(id);
    }
    this.elementContainers.clear();
  }
}
