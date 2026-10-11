import { Application, Container } from "pixi.js";
import { GridLayer } from "./layers/GridLayer";
import { ElementLayer } from "./layers/ElementLayer";
import { PreviewLayer } from "./layers/PreviewLayer";
import { GizmoLayer } from "./layers/GizmoLayer";
import { SpatialIndex } from "./SpatialIndex";
import { InteractionManager } from "./interactions/InteractionManager";
import type { InteractionContext } from "./interactions/types";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "@/tools";
import type {
  Point,
  ResolvedTheme,
  DescHoverTarget,
  CanvasElement,
  SelectedField,
  Viewport,
} from "@/types";

let activeEngine: PixiEngine | null = null;
export const getActiveEngine = () => activeEngine;

export class PixiEngine {
  public app: Application;
  public worldContainer = new Container();

  public gridLayer = new GridLayer();
  public elementLayer = new ElementLayer();
  public previewLayer = new PreviewLayer();
  public gizmoLayer = new GizmoLayer();
  public spatialIndex = new SpatialIndex();

  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private interactionManager!: InteractionManager;

  private isSpaceHeld = false;
  public currentTheme: ResolvedTheme = "light";
  private isDestroyed = false;
  private initPromise: Promise<void> | null = null;

  // Last rendered slices, used to skip redundant work when only the viewport
  // position changed (e.g. while panning). `null` means "not rendered yet".
  private prevElements: CanvasElement[] | null = null;
  private prevSelectedIds: string[] | null = null;
  private prevSelectedField: SelectedField | null | undefined = undefined;
  private prevViewport: Viewport = {
    x: NaN,
    y: NaN,
    zoom: NaN,
    screenWidth: NaN,
    screenHeight: NaN,
  };
  private prevTheme: ResolvedTheme | null = null;
  private prevTool: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.app = new Application();
    activeEngine = this;
  }

  async init(): Promise<void> {
    this.initPromise = (async () => {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;

      if (typeof document !== "undefined" && document.fonts) {
        await document.fonts.ready;
      }

      await this.app.init({
        width,
        height,
        backgroundColor: this.currentTheme === "dark" ? 0x121214 : 0xf9fafb,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true,
      });

      if (this.isDestroyed) {
        this.cleanupApp();
        return;
      }

      this.container.appendChild(this.app.canvas);

      // Build scene graph. The grid is a screen-space layer (it slides itself
      // instead of being re-drawn while panning), so it sits directly on the
      // stage behind the zoomed world container.
      this.app.stage.addChild(this.gridLayer);
      this.app.stage.addChild(this.worldContainer);
      this.worldContainer.addChild(this.elementLayer);
      this.worldContainer.addChild(this.previewLayer);
      this.worldContainer.addChild(this.gizmoLayer);

      // Initialize Interaction Manager with decoupled context
      this.interactionManager = new InteractionManager(this.createInteractionContext());

      // Sync initial viewport state
      const currentViewport = useCanvasStore.getState().viewport;
      useCanvasStore.getState().setViewport({
        screenWidth: width,
        screenHeight: height,
      });
      this.applyViewportTransform(currentViewport.x, currentViewport.y, currentViewport.zoom);

      // Initial render
      this.syncFromStore();

      // Subscribe to store updates
      this.unsubscribeStore = useCanvasStore.subscribe(() => {
        this.syncFromStore();
      });

      // Setup DOM Listeners
      this.setupListeners();
    })();

    return this.initPromise;
  }

  private createInteractionContext(): InteractionContext {
    return {
      screenToWorld: (sx, sy) => this.screenToWorld(sx, sy),
      worldToScreen: (wx, wy) => this.worldToScreen(wx, wy),
      spatialIndex: this.spatialIndex,
      gizmoLayer: this.gizmoLayer,
      elementLayer: this.elementLayer,
      previewLayer: this.previewLayer,
      setCursor: (cursor) => {
        this.container.style.cursor = cursor;
      },
      get theme() {
        return activeEngine?.currentTheme || "light";
      },
      isSpaceHeld: () => this.isSpaceHeld,
    };
  }

  setSpaceHeld(held: boolean) {
    this.isSpaceHeld = held;
    this.container.style.cursor = held ? "grab" : "default";
  }

  setTheme(theme: ResolvedTheme) {
    this.currentTheme = theme;
    if (this.app?.renderer) {
      this.app.renderer.background.color = theme === "dark" ? 0x121214 : 0xf9fafb;
    }
    this.syncFromStore();
  }

  screenToWorld(screenX: number, screenY: number): Point {
    const vp = useCanvasStore.getState().viewport;
    return {
      x: (screenX - vp.x) / vp.zoom,
      y: (screenY - vp.y) / vp.zoom,
    };
  }

  worldToScreen(worldX: number, worldY: number): Point {
    const vp = useCanvasStore.getState().viewport;
    return {
      x: worldX * vp.zoom + vp.x,
      y: worldY * vp.zoom + vp.y,
    };
  }

  private applyViewportTransform(x: number, y: number, zoom: number) {
    this.worldContainer.x = x;
    this.worldContainer.y = y;
    this.worldContainer.scale.set(zoom);
  }

  /**
   * Reconciles the scene with the store. Work is split by what actually
   * changed: panning only slides the world/grid transform, while new data or a
   * zoom/selection/theme change triggers the heavier element and gizmo passes.
   */
  public syncFromStore() {
    const state = useCanvasStore.getState();
    const { elements, selectedIds, selectedField, viewport, tool } = state;

    const firstRun = this.prevElements === null;
    const elementsChanged = this.prevElements !== elements;
    const selectionChanged =
      this.prevSelectedIds !== selectedIds || this.prevSelectedField !== selectedField;
    const zoomChanged = this.prevViewport.zoom !== viewport.zoom;
    const sizeChanged =
      this.prevViewport.screenWidth !== viewport.screenWidth ||
      this.prevViewport.screenHeight !== viewport.screenHeight;
    const themeChanged = this.prevTheme !== this.currentTheme;
    const toolChanged = this.prevTool !== tool;

    // Cheap on every change: move the world and slide the grid pattern.
    this.applyViewportTransform(viewport.x, viewport.y, viewport.zoom);
    this.gridLayer.updatePosition(viewport);

    // Grid geometry only depends on zoom, viewport size and theme (it is a
    // no-op otherwise, so panning never rebuilds it).
    if (firstRun || zoomChanged || sizeChanged || themeChanged) {
      this.gridLayer.renderGrid(viewport, this.currentTheme);
    }

    if (firstRun || elementsChanged) {
      this.spatialIndex.rebuild(elements);
    }

    if (firstRun || elementsChanged || selectionChanged || zoomChanged || themeChanged) {
      const selectedSet = new Set(selectedIds);
      this.elementLayer.renderElements(elements, selectedSet, this.currentTheme, viewport.zoom);

      const selectedElements = elements.filter((el) => selectedSet.has(el.id));
      this.gizmoLayer.drawSelectionBounds(selectedElements, viewport.zoom);
    }

    // Hide preview if tool was reset to select
    if ((firstRun || toolChanged) && tool === "select") {
      this.previewLayer.hidePreview();
    }

    this.prevElements = elements;
    this.prevSelectedIds = selectedIds;
    this.prevSelectedField = selectedField;
    this.prevViewport = viewport;
    this.prevTheme = this.currentTheme;
    this.prevTool = tool;
  }

  private setupListeners() {
    const el = this.container;

    // Resize observer
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.app.renderer?.resize(width, height);
          useCanvasStore.getState().setViewport({
            screenWidth: width,
            screenHeight: height,
          });
          this.syncFromStore();
        }
      }
    });
    this.resizeObserver.observe(el);

    // Pointer events
    el.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    el.addEventListener("pointerleave", this.handlePointerLeave);
    el.addEventListener("wheel", this.handleWheel, { passive: false });
    el.addEventListener("dblclick", this.handleDblClick);
  }

  private handlePointerLeave = () => {
    this.previewLayer.hidePreview();
    if (useCanvasStore.getState().descHover) {
      useCanvasStore.getState().setDescHover(null);
    }
  };

  private handleDblClick = (e: MouseEvent) => {
    const rect = this.container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = this.screenToWorld(screenX, screenY);

    const hitId = this.spatialIndex.hitTest(worldPoint);
    if (!hitId) return;

    const element = useCanvasStore.getState().elements.find((el) => el.id === hitId);
    if (!element) return;

    const tool = toolRegistry.get(element.type);
    if (!tool?.getInlineEditTarget) return;

    const localPoint: Point = {
      x: worldPoint.x - element.x,
      y: worldPoint.y - element.y,
    };

    const target = tool.getInlineEditTarget(element, localPoint);
    if (target) {
      useCanvasStore.getState().setInlineEdit(target);
    }
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (useCanvasStore.getState().descHover) {
      useCanvasStore.getState().setDescHover(null);
    }
    const rect = this.container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = this.screenToWorld(screenX, screenY);

    this.interactionManager.handlePointerDown(e, worldPoint);
  };

  private handlePointerMove = (e: PointerEvent) => {
    const rect = this.container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = this.screenToWorld(screenX, screenY);

    this.interactionManager.handlePointerMove(e, worldPoint);
    this.updateDescHover(e, worldPoint);
  };

  /**
   * Tracks the hovered description ⓘ badge (set by tool hit-testing) so the
   * React tooltip can anchor to it. Only active in select mode, when no drag /
   * pan is in progress, and while the pointer is over the canvas.
   */
  private updateDescHover(e: PointerEvent, worldPoint: Point): void {
    const state = useCanvasStore.getState();
    let next: DescHoverTarget | null = null;

    const canHover =
      !this.interactionManager.isActive &&
      !this.isSpaceHeld &&
      state.tool === "select" &&
      this.container.contains(e.target as Node);

    if (canHover) {
      const hitId = this.spatialIndex.hitTest(worldPoint);
      const element = hitId ? state.elements.find((el) => el.id === hitId) : undefined;
      const tool = element ? toolRegistry.get(element.type) : null;
      if (element && tool?.getDescHoverTarget) {
        const localPoint: Point = {
          x: worldPoint.x - element.x,
          y: worldPoint.y - element.y,
        };
        next = tool.getDescHoverTarget(element, localPoint);
      }
    }

    const current = state.descHover;
    const same =
      current && next
        ? current.elementId === next.elementId &&
          current.fieldIndex === next.fieldIndex &&
          current.sectionIndex === next.sectionIndex
        : current === null && next === null;
    if (!same) {
      useCanvasStore.getState().setDescHover(next);
    }
  }

  private handlePointerUp = (e: PointerEvent) => {
    const rect = this.container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = this.screenToWorld(screenX, screenY);

    this.interactionManager.handlePointerUp(e, worldPoint);
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const vp = useCanvasStore.getState().viewport;

    // Trackpad pinch-zoom or Ctrl+Wheel zoom
    if (e.ctrlKey || e.metaKey || !e.shiftKey) {
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(5, Math.max(0.1, vp.zoom * zoomFactor));

      // Zoom towards cursor
      const worldX = (mouseX - vp.x) / vp.zoom;
      const worldY = (mouseY - vp.y) / vp.zoom;

      const newX = mouseX - worldX * newZoom;
      const newY = mouseY - worldY * newZoom;

      useCanvasStore.getState().setViewport({
        zoom: newZoom,
        x: newX,
        y: newY,
      });
    } else {
      // 2D Pan with trackpad
      useCanvasStore.getState().setViewport({
        x: vp.x - e.deltaX,
        y: vp.y - e.deltaY,
      });
    }
  };

  public cancelInteraction(): void {
    this.interactionManager?.cancelActive();
  }

  private cleanupApp(): void {
    try {
      if (this.app.canvas && this.app.canvas.parentNode) {
        this.app.canvas.parentNode.removeChild(this.app.canvas);
      }
      if (this.app.renderer) {
        this.app.destroy(true, { children: true });
      }
    } catch (e) {
      console.warn("PixiEngine cleanup warning:", e);
    }
  }

  async destroy(): Promise<void> {
    this.isDestroyed = true;

    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch {
        // Ignore initialization cancellation errors
      }
    }

    this.resizeObserver?.disconnect();
    this.unsubscribeStore?.();

    const el = this.container;
    el.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    el.removeEventListener("pointerleave", this.handlePointerLeave);
    el.removeEventListener("wheel", this.handleWheel);
    el.removeEventListener("dblclick", this.handleDblClick);

    this.gridLayer.destroy();
    this.elementLayer.destroy();
    this.previewLayer.destroy();
    this.gizmoLayer.destroy();

    if (activeEngine === this) {
      activeEngine = null;
    }

    this.cleanupApp();
  }
}
