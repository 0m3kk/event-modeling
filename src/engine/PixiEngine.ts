import { Application, Container } from "pixi.js";
import { GridLayer } from "./layers/GridLayer";
import { ElementLayer } from "./layers/ElementLayer";
import { GizmoLayer } from "./layers/GizmoLayer";
import { SpatialIndex } from "./SpatialIndex";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "@/tools";
import type { CanvasElement, Point, Rect, ResolvedTheme } from "@/types";

let activeEngine: PixiEngine | null = null;
export const getActiveEngine = () => activeEngine;

export class PixiEngine {
  public app: Application;
  public worldContainer = new Container();

  public gridLayer = new GridLayer();
  public elementLayer = new ElementLayer();
  public gizmoLayer = new GizmoLayer();
  public spatialIndex = new SpatialIndex();

  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribeStore: (() => void) | null = null;

  // Interaction state
  private isSpaceHeld = false;
  private isPanning = false;
  private panStartScreen: Point = { x: 0, y: 0 };
  private panStartViewport: Point = { x: 0, y: 0 };

  private isDraggingElements = false;
  private dragStartWorld: Point = { x: 0, y: 0 };
  private initialElementPositions = new Map<string, Point>();

  private isMarqueeSelecting = false;
  private marqueeStartWorld: Point = { x: 0, y: 0 };

  public currentTheme: ResolvedTheme = "light";
  private isDestroyed = false;
  private initPromise: Promise<void> | null = null;

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

      // Build scene graph
      this.app.stage.addChild(this.worldContainer);
      this.worldContainer.addChild(this.gridLayer);
      this.worldContainer.addChild(this.elementLayer);
      this.worldContainer.addChild(this.gizmoLayer);

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

  setSpaceHeld(held: boolean) {
    this.isSpaceHeld = held;
    this.container.style.cursor = held ? "grab" : "default";
  }

  setTheme(theme: ResolvedTheme) {
    this.currentTheme = theme;
    this.app.renderer.background.color = theme === "dark" ? 0x121214 : 0xf9fafb;
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

  public syncFromStore() {
    const state = useCanvasStore.getState();
    const { elements, selectedIds, viewport } = state;
    const selectedSet = new Set(selectedIds);

    this.applyViewportTransform(viewport.x, viewport.y, viewport.zoom);

    // Spatial Index
    this.spatialIndex.rebuild(elements);

    // Grid
    this.gridLayer.renderGrid(viewport, this.currentTheme);

    // Elements
    this.elementLayer.renderElements(elements, selectedSet, this.currentTheme, viewport.zoom);

    // Gizmo
    const selectedElements = elements.filter((el) => selectedSet.has(el.id));
    this.gizmoLayer.drawSelectionBounds(selectedElements);
  }

  private setupListeners() {
    const el = this.container;

    // Resize observer
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.app.renderer.resize(width, height);
          useCanvasStore.getState().setViewport({
            screenWidth: width,
            screenHeight: height,
          });
          this.syncFromStore();
        }
      }
    });
    this.resizeObserver.observe(el);

    // Pointer Down
    el.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    el.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return; // Only left or middle button
    const rect = this.container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = this.screenToWorld(screenX, screenY);

    // Panning with Middle Click or Space + Left Click
    if (e.button === 1 || this.isSpaceHeld) {
      this.isPanning = true;
      this.panStartScreen = { x: e.clientX, y: e.clientY };
      const vp = useCanvasStore.getState().viewport;
      this.panStartViewport = { x: vp.x, y: vp.y };
      this.container.style.cursor = "grabbing";
      return;
    }

    const { tool, selectedIds, elements } = useCanvasStore.getState();

    // Check if active tool is an element creation tool
    if (tool !== "select") {
      const toolDef = toolRegistry.get(tool);
      if (toolDef) {
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
        return;
      }
    }

    // Select Tool Hit Testing
    const hitId = this.spatialIndex.hitTest(worldPoint);
    if (hitId) {
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

      // Start dragging selected elements
      this.isDraggingElements = true;
      this.dragStartWorld = worldPoint;
      this.initialElementPositions.clear();

      const currentSelected = useCanvasStore.getState().selectedIds;
      for (const id of currentSelected) {
        const element = elements.find((el) => el.id === id);
        if (element) {
          this.initialElementPositions.set(id, { x: element.x, y: element.y });
        }
      }
    } else {
      // Clicked on empty space
      if (!e.shiftKey) {
        useCanvasStore.getState().clearSelection();
      }
      // Start marquee selection
      this.isMarqueeSelecting = true;
      this.marqueeStartWorld = worldPoint;
      this.gizmoLayer.drawMarquee(null);
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    const rect = this.container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPoint = this.screenToWorld(screenX, screenY);

    if (this.isPanning) {
      const dx = e.clientX - this.panStartScreen.x;
      const dy = e.clientY - this.panStartScreen.y;
      useCanvasStore.getState().setViewport({
        x: this.panStartViewport.x + dx,
        y: this.panStartViewport.y + dy,
      });
      return;
    }

    if (this.isDraggingElements) {
      const dx = worldPoint.x - this.dragStartWorld.x;
      const dy = worldPoint.y - this.dragStartWorld.y;

      // Update positions live (without undo pollution during dragging)
      const state = useCanvasStore.getState();
      const nextElements = state.elements.map((el) => {
        const initial = this.initialElementPositions.get(el.id);
        if (initial) {
          return {
            ...el,
            x: Math.round(initial.x + dx),
            y: Math.round(initial.y + dy),
          };
        }
        return el;
      });

      // Update elementLayer and gizmoLayer directly for high FPS performance
      const selectedSet = new Set(state.selectedIds);
      this.elementLayer.renderElements(
        nextElements,
        selectedSet,
        this.currentTheme,
        state.viewport.zoom,
      );
      const selected = nextElements.filter((el) => selectedSet.has(el.id));
      this.gizmoLayer.drawSelectionBounds(selected);
      return;
    }

    if (this.isMarqueeSelecting) {
      const rect: Rect = {
        x: this.marqueeStartWorld.x,
        y: this.marqueeStartWorld.y,
        width: worldPoint.x - this.marqueeStartWorld.x,
        height: worldPoint.y - this.marqueeStartWorld.y,
      };
      this.gizmoLayer.drawMarquee(rect);

      // Realtime search elements in marquee
      const intersectedIds = this.spatialIndex.searchRect(rect);
      useCanvasStore.getState().setSelectedIds(intersectedIds);
      return;
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (this.isPanning) {
      this.isPanning = false;
      this.container.style.cursor = this.isSpaceHeld ? "grab" : "default";
    }

    if (this.isDraggingElements) {
      this.isDraggingElements = false;
      const rect = this.container.getBoundingClientRect();
      const worldPoint = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const dx = worldPoint.x - this.dragStartWorld.x;
      const dy = worldPoint.y - this.dragStartWorld.y;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        // Commit drag movement to store with snapshot for Undo!
        const updates: Array<{ id: string } & Partial<CanvasElement>> = [];
        for (const [id, initial] of this.initialElementPositions.entries()) {
          updates.push({
            id,
            x: Math.round(initial.x + dx),
            y: Math.round(initial.y + dy),
          });
        }
        useCanvasStore.getState().updateElements(updates);
      }
      this.initialElementPositions.clear();
    }

    if (this.isMarqueeSelecting) {
      this.isMarqueeSelecting = false;
      this.gizmoLayer.drawMarquee(null);
    }
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
    el.removeEventListener("wheel", this.handleWheel);

    this.gridLayer.destroy();
    this.elementLayer.destroy();
    this.gizmoLayer.destroy();

    if (activeEngine === this) {
      activeEngine = null;
    }

    this.cleanupApp();
  }
}
