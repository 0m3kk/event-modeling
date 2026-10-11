import { Container, Graphics } from "pixi.js";
import type { CanvasElement, Point, ResolvedTheme } from "@/types";
import { toolRegistry } from "@/tools";
import { computeTextResolution } from "../textResolution";
import type { RenderContext } from "@/tools/types";
import { useCanvasStore } from "@/store";
import { ensureUniqueElement, getElementName } from "@/utils/naming";

export class PreviewLayer extends Container {
  private ghostCardContainer = new Container();
  private borderAndShadow = new Graphics();

  private currentTool: string | null = null;
  private currentTheme: ResolvedTheme | null = null;
  private currentResolution: number = 1;
  private currentName: string | null = null;

  constructor() {
    super();
    this.addChild(this.borderAndShadow);
    this.addChild(this.ghostCardContainer);
    this.visible = false;
    this.eventMode = "none";
  }

  showPreview(
    toolType: string,
    worldPoint: Point,
    theme: ResolvedTheme,
    zoom: number,
  ) {
    if (toolType === "select") {
      this.hidePreview();
      return;
    }

    const toolDef = toolRegistry.get(toolType);
    if (!toolDef) {
      this.hidePreview();
      return;
    }

    // Compute unique name matching the exact name that will be created
    const existingElements = useCanvasStore.getState().elements;
    const defaultData = toolDef.createDefaultData();
    const candidateElement: CanvasElement = {
      id: "__ghost_preview__",
      type: toolType,
      x: 0,
      y: 0,
      width: toolDef.defaultSize.width,
      height: toolDef.defaultSize.height,
      data: defaultData,
    };
    const uniqueGhost = ensureUniqueElement(candidateElement, existingElements);
    const data = uniqueGhost.data;
    const size = toolDef.computeSize ? toolDef.computeSize(data) : toolDef.defaultSize;
    const candidateName = getElementName(uniqueGhost) || "";

    const x = Math.round(worldPoint.x - size.width / 2);
    const y = Math.round(worldPoint.y - size.height / 2);

    this.position.set(x, y);

    const textResolution = computeTextResolution(zoom);

    // Re-render ghost card content if tool, theme, resolution, or unique name changed
    if (
      this.currentTool !== toolType ||
      this.currentTheme !== theme ||
      this.currentResolution !== textResolution ||
      this.currentName !== candidateName
    ) {
      this.currentTool = toolType;
      this.currentTheme = theme;
      this.currentResolution = textResolution;
      this.currentName = candidateName;

      this.renderGhostCard(toolDef, data, size, theme, zoom, textResolution);
    }

    this.visible = true;
  }

  hidePreview() {
    this.visible = false;
    this.currentTool = null;
    this.currentName = null;
    this.ghostCardContainer.removeChildren();
    this.borderAndShadow.clear();
  }

  private renderGhostCard(
    toolDef: any,
    data: any,
    size: { width: number; height: number },
    theme: ResolvedTheme,
    zoom: number,
    textResolution: number,
  ) {
    this.ghostCardContainer.removeChildren();
    this.borderAndShadow.clear();

    // 1. Crisp outline around the ghost preview card (vibrant blue)
    const accentColor = 0x3b82f6;
    this.borderAndShadow.roundRect(0, 0, size.width, size.height, 8);
    this.borderAndShadow.stroke({
      color: accentColor,
      width: 2,
      alpha: 0.85,
    });

    // 2. Subtle outer glow ring (2px offset)
    this.borderAndShadow.roundRect(-2, -2, size.width + 4, size.height + 4, 10);
    this.borderAndShadow.stroke({
      color: accentColor,
      width: 1,
      alpha: 0.25,
    });

    // 3. Render ghost card content via tool plugin with 65% opacity (no underlying dark fill)
    if (typeof document !== "undefined") {
      const ghostElement: CanvasElement = {
        id: "__ghost_preview__",
        type: toolDef.type,
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        data,
      };

      const context: RenderContext = {
        theme,
        isSelected: false,
        isHovered: false,
        zoom,
        textResolution,
      };

      toolDef.render(this.ghostCardContainer, ghostElement, context);
      this.ghostCardContainer.alpha = 0.65;
    }
  }

  override destroy(options?: any) {
    this.ghostCardContainer.removeChildren();
    this.borderAndShadow.clear();
    super.destroy(options ?? { children: true });
  }
}
