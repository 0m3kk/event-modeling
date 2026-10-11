import { Container, Graphics } from "pixi.js";
import type { CanvasElement, Point, ResolvedTheme } from "@/types";
import { toolRegistry } from "@/tools";
import { computeTextResolution } from "../textResolution";
import type { RenderContext } from "@/tools/types";

export class PreviewLayer extends Container {
  private ghostCardContainer = new Container();
  private borderAndShadow = new Graphics();

  private currentTool: string | null = null;
  private currentTheme: ResolvedTheme | null = null;
  private currentResolution: number = 1;

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

    const data = toolDef.createDefaultData();
    const size = toolDef.computeSize ? toolDef.computeSize(data) : toolDef.defaultSize;

    const x = Math.round(worldPoint.x - size.width / 2);
    const y = Math.round(worldPoint.y - size.height / 2);

    this.position.set(x, y);

    const textResolution = computeTextResolution(zoom);

    // Re-render ghost card content only if tool, theme, or text resolution changed
    if (
      this.currentTool !== toolType ||
      this.currentTheme !== theme ||
      this.currentResolution !== textResolution
    ) {
      this.currentTool = toolType;
      this.currentTheme = theme;
      this.currentResolution = textResolution;

      this.renderGhostCard(toolDef, data, size, theme, zoom, textResolution);
    }

    this.visible = true;
  }

  hidePreview() {
    this.visible = false;
    this.currentTool = null;
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

    const isDark = theme === "dark";

    // 1. Soft drop shadow under the ghost card (offset y + 4)
    const shadowColor = isDark ? 0x000000 : 0x0f172a;
    this.borderAndShadow.roundRect(0, 4, size.width, size.height, 8);
    this.borderAndShadow.fill({ color: shadowColor, alpha: isDark ? 0.35 : 0.1 });

    // 2. Translucent preview accent border
    const accentColor = 0x3b82f6; // vibrant blue outline
    this.borderAndShadow.roundRect(0, 0, size.width, size.height, 8);
    this.borderAndShadow.stroke({
      color: accentColor,
      width: 1.5,
      alpha: 0.75,
    });

    // 3. Render ghost card content via tool plugin with 55% opacity (guarded for browser)
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
      this.ghostCardContainer.alpha = 0.55;
    }
  }

  override destroy(options?: any) {
    this.ghostCardContainer.removeChildren();
    this.borderAndShadow.clear();
    super.destroy(options ?? { children: true });
  }
}
