import { Application, Rectangle } from "pixi.js";
import { Viewport as PixiViewport } from "pixi-viewport";
import { SpatialIndex } from "./SpatialIndex";
import { GridLayer } from "./layers/GridLayer";
import {
  GroupLayer,
  getGroupAt,
  computeGroupBounds,
} from "./layers/GroupLayer";
import {
  ElbowConnectorLayer,
  buildConnectorLookup,
  type AnchorMarker,
} from "./layers/ElbowConnectorLayer";
import { VisualLinkLayer } from "./layers/VisualLinkLayer";
import { LineLayer } from "./layers/LineLayer";
import { CardLayer, CARD_DRAWS_PER_FRAME } from "./layers/CardLayer";
import {
  computeExportTextResolution,
  computeTextResolution,
} from "./textResolution";
import {
  GizmoLayer,
  getCursorForHandle,
  type MarqueeBox,
} from "./layers/GizmoLayer";
import {
  useCanvasStore,
  type ActionTarget,
  type DescTarget,
  type ValidationTarget,
} from "@/store";
import { calculateSnapping } from "@/utils/snapping";
import {
  calculateResizedBounds,
  computeOptimalCardWidth,
  getCardMinDimensions,
  type ResizeHandle,
} from "@/utils/cardDimensions";
import { MIN_ZOOM, MAX_ZOOM, CONNECTOR_HIT_SLOP, LINE_HIT_SLOP, LINE_MIN_DRAW_LENGTH } from "@/constants/canvas";
import {
  getAllCardinalAnchors,
  findClosestAnchor,
  distanceToPolyline,
  getCardinalAnchorPoint,
  getOppositeAnchor,
} from "@/utils/elbowRouting";
import { collectMatchingEventIds } from "@/utils/stormQuery";
import { getAuthorizedActors } from "@/utils/stormAuth";
import { computeCanvasBounds } from "@/utils/imageExport";
import { findModelByName } from "@/utils/modelResolution";
import {
  getLineEndpoints,
  distanceToSegment,
  createLineObject,
  normalizeLineGeometry,
  lineIntersectsRect,
} from "@/utils/lineGeometry";
import type { CardHitZone } from "./renderers";
import type { CanvasObject, ElbowBend, Point } from "@/types";

let activePixiEngine: PixiEngine | null = null;

/** Idle time after the last zoom event before zoom-dependent redraw happens.
 * Long enough to coalesce a sequence of scroll flicks into one refine. */
const ZOOM_SETTLE_MS = 250;

export function getActivePixiEngine(): PixiEngine | null {
  return activePixiEngine;
}

export function setActivePixiEngine(engine: PixiEngine | null): void {
  activePixiEngine = engine;
}

export class PixiEngine {
  public app: Application;
  public viewport!: PixiViewport;
  public spatialIndex: SpatialIndex;

  // Layers
  public gridLayer: GridLayer;
  public groupLayer: GroupLayer;
  public connectorLayer: ElbowConnectorLayer;
  public lineLayer: LineLayer;
  public visualLinkLayer: VisualLinkLayer;
  public cardLayer: CardLayer;
  public gizmoLayer: GizmoLayer;

  // Container element
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private storeUnsubscribe: (() => void) | null = null;
  private isDestroyed: boolean = false;
  private initPromise: Promise<void> | null = null;

  // Render scheduling. Interaction handlers only flag *what* changed; the
  // actual redraw is coalesced into a single requestAnimationFrame tick so a
  // burst of pointermove/zoom events can never paint more than once per frame.
  private renderQueued: boolean = false;
  private viewDirty: boolean = false;
  private contentDirty: boolean = false;
  /** Zoom-dependent rasterization (card text, group labels, handles) is stale. */
  private cardRefineDirty: boolean = false;

  // Zoom-settle: while a zoom gesture runs, the camera matrix scales the
  // existing scene for free. Zoom-dependent rasterization (text resolution,
  // handle sizes) is rebuilt in one pass shortly after the gesture stops, so
  // crossing a text-resolution threshold mid-gesture never tears cards down.
  private zoomSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeTextResolution: number | null = null;

  // Snapshot of the geometry currently inside the spatial index, so moving a
  // handful of cards updates those entries instead of rebuilding the tree.
  private indexedGeometry: Map<
    string,
    { x: number; y: number; width: number; height: number }
  > = new Map();

  // Cached container rect: measuring it per pointermove forces a synchronous
  // layout read, so it is refreshed only on resize/scroll and gesture start.
  private cachedContainerRect: DOMRect | null = null;

  // Idle-hover hit-testing is coalesced to at most one pass per frame.
  private hoverRaf: number | null = null;
  private pendingHover: {
    worldPos: Point;
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    target: EventTarget | null;
  } | null = null;

  // Snapshot of the non-dragged boxes used for magnetic snapping, built once
  // per drag — only the dragged cards move while a drag is running.
  private dragSnapBoxes: {
    x: number;
    y: number;
    width: number;
    height: number;
  }[] | null = null;

  // Interaction State
  private isSpaceHeld: boolean = false;
  private isDraggingCards: boolean = false;
  private isMarqueeDragging: boolean = false;
  private marqueeInitialSelectedIds: string[] = [];
  private isPanningCanvas: boolean = false;
  private hasPannedCanvas: boolean = false;
  private panStartPointer: { x: number; y: number } = { x: 0, y: 0 };
  private lastPanPointer: { x: number; y: number } = { x: 0, y: 0 };
  private dragStartWorld: { x: number; y: number } = { x: 0, y: 0 };
  private cardDragStartScreen: { x: number; y: number } | null = null;
  private initialObjectPositions: Map<string, { x: number; y: number }> =
    new Map();
  private primaryDragId: string | null = null;
  private marqueeStartWorld: { x: number; y: number } = { x: 0, y: 0 };
  private cardPointerDownHandled: boolean = false;

  // Connector Creation State — armed by clicking the source anchor, completed
  // by clicking the target anchor (no drag / button-hold required).
  private isCreatingConnector: boolean = false;
  private connectorStartAnchor: AnchorMarker | null = null;
  private connectorWaypoints: Point[] = [];
  private lastWorldPos: Point = { x: 0, y: 0 };

  // Connector Endpoint Dragging State (modifying start or end endpoint after creation)
  private isDraggingConnectorEndpoint: boolean = false;
  private activeConnectorEndpoint: {
    connectorId: string;
    endpoint: "start" | "end";
    point: Point;
  } | null = null;

  // Freeform Line Interaction State — the line tool drags out a new segment;
  // the select tool moves a line body or drags one of its endpoints.
  private isDrawingLine: boolean = false;
  private lineDrawStart: Point | null = null;
  private isDraggingLineEndpoint: boolean = false;
  private activeLineEndpoint: {
    lineId: string;
    endpoint: "start" | "end";
  } | null = null;
  private lineEndpointFixed: Point | null = null;
  private isDraggingLineBody: boolean = false;
  private draggedLineId: string | null = null;
  private lineBodyDragStartWorld: Point = { x: 0, y: 0 };
  private lineBodyInitial: { x: number; y: number } | null = null;

  // Group Dragging & Click State
  private isDraggingGroup: boolean = false;
  private draggedGroupId: string | null = null;
  private groupDragStartScreen: { x: number; y: number } | null = null;
  private lastGroupClickTime: number = 0;
  private lastGroupClickId: string | null = null;
  private hadPopoverOnPointerDown: boolean = false;

  // Card Resizing State
  private isResizingCard: boolean = false;
  private resizingHandle: ResizeHandle | null = null;
  private resizingObjectId: string | null = null;
  private resizeStartWorld: { x: number; y: number } = { x: 0, y: 0 };
  private initialObjectBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
  private hoveredHandle: { handle: ResizeHandle; objectId: string } | null =
    null;
  /** True while the pointer sits on a connector/line endpoint handle. */
  private hoveringEndpoint: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.app = new Application();
    // Guard Pixi v8 Application resize plugin bug when destroyed during async init
    (this.app as unknown as { _cancelResize?: () => void })._cancelResize =
      () => {};
    this.spatialIndex = new SpatialIndex();

    this.gridLayer = new GridLayer();
    this.groupLayer = new GroupLayer();
    this.connectorLayer = new ElbowConnectorLayer();
    this.lineLayer = new LineLayer();
    this.visualLinkLayer = new VisualLinkLayer();
    this.cardLayer = new CardLayer();
    this.gizmoLayer = new GizmoLayer();
  }

  public async init(): Promise<void> {
    this.initPromise = (async () => {
      const width = this.container.clientWidth || window.innerWidth || 800;
      const height =
        this.container.clientHeight || window.innerHeight - 48 || 600;

      await this.app.init({
        width,
        height,
        backgroundColor: 0xf9fafb,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true,
      });

      if (this.isDestroyed) {
        this.cleanupApp();
        return;
      }

      this.app.canvas.style.display = "block";
      this.app.canvas.style.width = "100%";
      this.app.canvas.style.height = "100%";
      this.container.appendChild(this.app.canvas);
      setActivePixiEngine(this);

      // Initialize Pixi Viewport
      this.viewport = new PixiViewport({
        screenWidth: width,
        screenHeight: height,
        worldWidth: null,
        worldHeight: null,
        events: this.app.renderer.events,
        disableOnContextMenu: true,
      });

      this.app.stage.addChild(this.viewport);

      // Configure Viewport plugins
      this.viewport
        .drag({ mouseButtons: "middle-left" })
        .pinch()
        .wheel({ percent: 0.1 })
        .clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM });

      // Add layers to viewport
      this.viewport.addChild(this.gridLayer);
      this.viewport.addChild(this.groupLayer);
      this.viewport.addChild(this.connectorLayer);
      this.viewport.addChild(this.lineLayer);
      this.viewport.addChild(this.visualLinkLayer);
      this.viewport.addChild(this.cardLayer);
      this.viewport.addChild(this.gizmoLayer);

      // Sync viewport position with store initial state. Apply the zoom first:
      // moveCorner converts the world corner to a screen position using the
      // current scale, so panning before zooming scales the corner by
      // oldZoom / newZoom and the restored view lands off-center.
      const { viewport: savedVp, tool } = useCanvasStore.getState();
      this.viewport.setZoom(savedVp.zoom);
      this.viewport.moveCorner(savedVp.x, savedVp.y);

      // Publish the real canvas size so new objects can be centered on it.
      this.syncViewportToStore();

      // Initial tool configuration
      this.updateToolMode(tool);

      // Setup event listeners
      this.setupViewportEvents();
      this.setupInteractionHandlers();
      this.setupResizeObserver();
      this.setupStoreSubscription();

      // Add ticker for visual linking animations
      this.app.ticker.add((ticker) => {
        this.visualLinkLayer.updateAnimation(ticker.deltaMS);
      });

      // Initial render
      this.syncSpatialIndex();
      this.flushRender();
    })();

    return this.initPromise;
  }

  private setupViewportEvents(): void {
    // A pan only changes the camera transform — the layers already live inside
    // the viewport, so cards/connectors/groups need no redraw. Only the grid
    // (which is generated for the visible region) and the culling set follow.
    this.viewport.on("moved", () => {
      this.invalidateView();
    });

    // A zoom only changes the camera matrix — every layer rides along. Zoom-
    // dependent rasterization (text resolution, handle sizes) is deferred to a
    // single rebuild once the gesture settles.
    this.viewport.on("zoomed", () => {
      this.invalidateView();
      this.armZoomSettle();
    });
  }

  /**
   * Coalesces a burst of zoom events into one deferred content rebuild. Until
   * it fires, text keeps the last settled rasterization (slightly soft while
   * zooming, re-sharpened once the gesture ends) instead of being re-rasterized
   * every time the resolution threshold flips.
   */
  private armZoomSettle(): void {
    if (this.zoomSettleTimer !== null) {
      clearTimeout(this.zoomSettleTimer);
    }
    this.zoomSettleTimer = setTimeout(() => {
      this.zoomSettleTimer = null;
      // Only the zoom-dependent rasterization needs refining: card text, group
      // labels and handle sizes. Connector and line geometry is world-space —
      // re-routing every path here is what used to hitch after scrolling.
      this.cardRefineDirty = true;
      this.scheduleRender();
    }, ZOOM_SETTLE_MS);
  }

  /** Flags a camera-only change (pan/resize). */
  public invalidateView(): void {
    this.viewDirty = true;
    this.scheduleRender();
  }

  /** Flags a change to card/connector/group content or styling. */
  public invalidateContent(): void {
    this.contentDirty = true;
    this.scheduleRender();
  }

  /** Flags anything that needs a full repaint. */
  public invalidateAll(): void {
    this.viewDirty = true;
    this.contentDirty = true;
    this.scheduleRender();
  }

  /**
   * Coalesces every invalidation that happens within a frame into one paint.
   * Replaces direct `render()` calls so a 1000 Hz mouse can't outrun the
   * display refresh.
   */
  private scheduleRender(): void {
    if (this.renderQueued || this.isDestroyed) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.flushRender();
    });
  }

  /** Public entry point kept for callers that want a repaint scheduled. */
  public render(): void {
    this.invalidateAll();
  }

  private syncViewportToStore(): void {
    const corner = this.viewport.corner;
    useCanvasStore.getState().setViewport({
      x: corner.x,
      y: corner.y,
      zoom: this.viewport.scaled,
      screenWidth: this.viewport.screenWidth,
      screenHeight: this.viewport.screenHeight,
    });
  }

  public updateToolMode(tool: string): void {
    if (this.isSpaceHeld) {
      this.viewport.plugins.resume("drag");
      this.container.style.cursor = "grab";
      this.cardLayer.setCursor("grab");
    } else if (tool === "connector" || tool === "line") {
      this.viewport.plugins.pause("drag");
      this.container.style.cursor = "crosshair";
      this.cardLayer.setCursor("crosshair");
    } else {
      this.viewport.plugins.pause("drag");
      this.container.style.cursor = "default";
      // Select tool keeps the arrow cursor even over cards
      this.cardLayer.setCursor("default");
    }
  }

  public setSpaceHeld(held: boolean): void {
    if (this.isSpaceHeld === held) return;
    this.isSpaceHeld = held;
    this.updateToolMode(useCanvasStore.getState().tool);
  }

  private getContainerRect(): DOMRect {
    if (!this.cachedContainerRect) {
      this.cachedContainerRect = this.container.getBoundingClientRect();
    }
    return this.cachedContainerRect;
  }

  private invalidateContainerRect(): void {
    this.cachedContainerRect = null;
  }

  private collectAllAnchors(): AnchorMarker[] {
    const { objects, groups } = useCanvasStore.getState();
    const anchors: AnchorMarker[] = [];

    // 1. Cards
    for (const obj of objects) {
      if (obj.type !== "connector") {
        anchors.push(...getAllCardinalAnchors(obj.id, obj));
      }
    }

    // 2. Groups
    for (const grp of groups) {
      const bounds = computeGroupBounds(grp, objects, groups);
      anchors.push(...getAllCardinalAnchors(grp.id, bounds));
    }

    return anchors;
  }

  /**
   * Anchors that can still be chosen as the destination for the pending
   * connector — every anchor except the armed source anchor.
   */
  private getConnectorTargetAnchors(): AnchorMarker[] {
    const start = this.connectorStartAnchor;
    return this.collectAllAnchors().filter(
      (a) =>
        !start || a.objectId !== start.objectId || a.anchor !== start.anchor,
    );
  }

  private createConnector(
    start: AnchorMarker,
    end: AnchorMarker,
    waypoints: Point[] = [],
  ): void {
    const id = `connector-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const bends: ElbowBend[] = waypoints.map((p, idx) => ({
      id: `bend-${idx}-${Date.now().toString(36)}`,
      x: p.x,
      y: p.y,
    }));
    const newConnector: CanvasObject = {
      id,
      type: "connector",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      connectorData: {
        start: { objectId: start.objectId, anchor: start.anchor },
        end: { objectId: end.objectId, anchor: end.anchor },
        bends: bends.length > 0 ? bends : undefined,
        stroke: "#475569",
        strokeWidth: 2,
        arrowEnd: true,
      },
    };
    useCanvasStore.getState().addObject(newConnector);
    useCanvasStore.getState().setTool("select");
  }

  /** Commits a drawn line to the board. */
  private createLine(start: Point, end: Point): void {
    const id = `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    useCanvasStore.getState().addObject(createLineObject(id, start, end));
  }

  /** Clears an in-progress line drag (tool switched away, Escape, …). */
  public cancelLineDrawing(): void {
    if (!this.isDrawingLine) return;
    this.isDrawingLine = false;
    this.lineDrawStart = null;
    this.lineLayer.renderPreview(null);
  }

  /**
   * Topmost line whose segment lies within a screen-space pick tolerance of a
   * world-space point, or null when the point is not near any line.
   */
  private findLineAtWorld(
    worldX: number,
    worldY: number,
  ): CanvasObject | null {
    const { objects } = useCanvasStore.getState();
    const threshold = LINE_HIT_SLOP / (this.viewport.scaled || 1);
    const point = { x: worldX, y: worldY };

    let best: CanvasObject | null = null;
    let bestDist = threshold;

    // Later lines paint on top → scan backwards so the topmost wins.
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i]!;
      if (obj.type !== "line") continue;
      const ends = getLineEndpoints(obj);
      if (!ends) continue;
      const dist = distanceToSegment(point, ends.start, ends.end);
      if (dist <= bestDist) {
        bestDist = dist;
        best = obj;
      }
    }

    return best;
  }

  /**
   * Finds a line endpoint handle within hit radius of a world point, preferring
   * currently selected lines so handles are easy to grab.
   */
  public findLineEndpointHandleAtWorld(
    worldX: number,
    worldY: number,
    hitRadius: number = 14,
  ): { lineId: string; endpoint: "start" | "end"; point: Point } | null {
    const { objects, selectedIds } = useCanvasStore.getState();
    const effectiveRadius = hitRadius / (this.viewport.scaled || 1);

    const lines = objects.filter((o) => o.type === "line" && o.lineData);
    if (lines.length === 0) return null;

    const selectedLines = lines.filter((l) => selectedIds.includes(l.id));
    const otherLines = lines.filter((l) => !selectedIds.includes(l.id));

    for (const line of [...selectedLines, ...otherLines]) {
      const ends = getLineEndpoints(line);
      if (!ends) continue;

      if (
        Math.hypot(worldX - ends.start.x, worldY - ends.start.y) <=
        effectiveRadius
      ) {
        return { lineId: line.id, endpoint: "start", point: ends.start };
      }
      if (
        Math.hypot(worldX - ends.end.x, worldY - ends.end.y) <= effectiveRadius
      ) {
        return { lineId: line.id, endpoint: "end", point: ends.end };
      }
    }

    return null;
  }

  /** Clears a pending connector (source picked, destination not yet chosen). */
  public cancelConnectorCreation(): void {
    this.isCreatingConnector = false;
    this.connectorStartAnchor = null;
    this.connectorWaypoints = [];
    this.connectorLayer.renderPreview(null);
    this.connectorLayer.renderAnchors([]);
  }

  /**
   * Handles Escape key when interacting with tools like connector creation or endpoint dragging.
   * Returns true if the key press was consumed.
   */
  public handleEscape(): boolean {
    if (this.isDrawingLine) {
      this.cancelLineDrawing();
      return true;
    }
    if (this.isDraggingConnectorEndpoint) {
      this.cancelConnectorEndpointDrag();
      return true;
    }
    if (this.isCreatingConnector) {
      if (this.connectorWaypoints.length > 0) {
        this.connectorWaypoints.pop();
        if (this.connectorStartAnchor) {
          this.connectorLayer.renderPreview({
            start: this.connectorStartAnchor,
            currentPoint: { ...this.lastWorldPos },
            waypoints: this.connectorWaypoints,
          });
        }
        return true;
      }
      this.cancelConnectorCreation();
      return true;
    }
    return false;
  }

  /** Clears pending connector endpoint dragging without modifying connector. */
  public cancelConnectorEndpointDrag(): void {
    if (this.isDraggingConnectorEndpoint) {
      this.isDraggingConnectorEndpoint = false;
      this.activeConnectorEndpoint = null;
      this.connectorLayer.renderPreview(null);
      this.connectorLayer.renderAnchors([]);
      const state = useCanvasStore.getState();
      this.connectorLayer.renderConnectors(
        state.objects,
        state.groups,
        state.selectedIds,
      );
      this.invalidateContent();
    }
  }

  /**
   * Topmost card under a world-space point plus the hit zone at that point.
   * Used for description ⓘ hover detection.
   */
  private findCardZoneAtWorld(
    worldX: number,
    worldY: number,
  ): { obj: CanvasObject; zone: CardHitZone | null } | null {
    const candidateIds = new Set(
      this.spatialIndex.search({
        minX: worldX,
        minY: worldY,
        maxX: worldX,
        maxY: worldY,
      }),
    );
    if (candidateIds.size === 0) return null;

    const objects = useCanvasStore.getState().objects;
    // Later objects paint on top → scan backwards for the topmost hit
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i]!;
      if (
        obj.type === "connector" ||
        obj.type === "line" ||
        !candidateIds.has(obj.id)
      )
        continue;
      const zone = this.cardLayer.getHitZoneAt(
        obj.id,
        worldX - obj.x,
        worldY - obj.y,
      );
      return { obj, zone };
    }
    return null;
  }

  /**
   * Topmost connector whose resolved elbow path lies within a screen-space pick
   * tolerance of a world-space point, or null when the point is not near any
   * connector. Enables click-selecting (and deleting) connectors.
   */
  private findConnectorAtWorld(
    worldX: number,
    worldY: number,
  ): CanvasObject | null {
    const { objects } = useCanvasStore.getState();
    const threshold = CONNECTOR_HIT_SLOP / (this.viewport.scaled || 1);
    const point = { x: worldX, y: worldY };

    let best: CanvasObject | null = null;
    let bestDist = threshold;

    // Later connectors paint on top → scan backwards so the topmost wins.
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i]!;
      if (obj.type !== "connector") continue;
      const points = this.connectorLayer.getCachedConnectorPoints(obj.id);
      if (!points) continue;

      const dist = distanceToPolyline(point, points);
      if (dist <= bestDist) {
        bestDist = dist;
        best = obj;
      }
    }

    return best;
  }

  /**
   * Finds any connector endpoint handle (start or end) within hit radius of world point.
   * Prioritizes currently selected connectors so handles are easy to grab.
   */
  public findConnectorEndpointHandleAtWorld(
    worldX: number,
    worldY: number,
    hitRadius: number = 14,
  ): { connectorId: string; endpoint: "start" | "end"; point: Point } | null {
    const { objects, selectedIds } = useCanvasStore.getState();
    const effectiveRadius = hitRadius / (this.viewport.scaled || 1);

    const connectors = objects.filter(
      (o) => o.type === "connector" && o.connectorData,
    );
    if (connectors.length === 0) return null;

    const selectedConnectors = connectors.filter((c) =>
      selectedIds.includes(c.id),
    );
    const otherConnectors = connectors.filter(
      (c) => !selectedIds.includes(c.id),
    );

    for (const conn of [...selectedConnectors, ...otherConnectors]) {
      const points = this.connectorLayer.getCachedConnectorPoints(conn.id);
      if (!points || points.length < 2) continue;

      const startPt = points[0]!;
      const endPt = points[points.length - 1]!;

      if (Math.hypot(worldX - startPt.x, worldY - startPt.y) <= effectiveRadius) {
        return { connectorId: conn.id, endpoint: "start", point: startPt };
      }
      if (Math.hypot(worldX - endPt.x, worldY - endPt.y) <= effectiveRadius) {
        return { connectorId: conn.id, endpoint: "end", point: endPt };
      }
    }

    return null;
  }

  private setupInteractionHandlers(): void {
    // Card pointerdown handler
    this.cardLayer.onCardPointerDown = (
      id: string,
      e: PointerEvent,
      zone: CardHitZone | null,
    ) => {
      const state = useCanvasStore.getState();
      if (this.isSpaceHeld) return;

      // In connector tool mode, anchors handle connections
      if (state.tool === "connector") return;

      this.cardPointerDownHandled = true;

      this.invalidateContainerRect();
      const rect = this.getContainerRect();
      const worldPos = this.viewport.toWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );

      if (this.hoveredHandle) {
        this.isResizingCard = true;
        this.resizingHandle = this.hoveredHandle.handle;
        this.resizingObjectId = this.hoveredHandle.objectId;
        this.resizeStartWorld = { x: worldPos.x, y: worldPos.y };
        const targetObj = state.objects.find(
          (o) => o.id === this.resizingObjectId,
        );
        if (targetObj) {
          this.initialObjectBounds = {
            x: targetObj.x,
            y: targetObj.y,
            width: targetObj.width,
            height: targetObj.height,
          };
        }
        return;
      }

      const obj = state.objects.find((o) => o.id === id);
      if (!obj) return;
      const localX = worldPos.x - obj.x;
      const localY = worldPos.y - obj.y;
      const accurateZone =
        this.cardLayer.getHitZoneAt(id, localX, localY) || zone;

      // Check if this field points to a Model
      let fieldType: string | undefined;
      let fieldName: string | undefined;
      if (obj.type === "model" && obj.modelData) {
        if (obj.modelData.kind === "object") {
          const f = obj.modelData.fields?.find(
            (field) => field.id === accurateZone?.fieldId,
          );
          fieldType = f?.fieldType;
          fieldName = f?.name;
        } else if (obj.modelData.kind === "array") {
          fieldType = obj.modelData.itemType;
          fieldName = "item";
        } else if (obj.modelData.kind === "wrap") {
          fieldType = obj.modelData.innerType;
          fieldName = "inner";
        }
      } else if (obj.type === "storm" && obj.stormData) {
        const f =
          obj.stormData.fields?.find(
            (field) => field.id === accurateZone?.fieldId,
          ) ||
          obj.stormData.inputFields?.find(
            (field) => field.id === accurateZone?.fieldId,
          ) ||
          obj.stormData.outputFields?.find(
            (field) => field.id === accurateZone?.fieldId,
          ) ||
          obj.stormData.responseFields?.find(
            (field) => field.id === accurateZone?.fieldId,
          );
        fieldType = f?.fieldType;
        fieldName = f?.name;
      }

      const targetModel = fieldType
        ? findModelByName(state.objects, fieldType)
        : null;

      // Clicking on the type zone opens type selector IF the row is already selected
      // and it's not a model field.
      const currentSelectedField = state.stormSelectedField;
      const isFieldAlreadySelected =
        currentSelectedField?.objectId === id &&
        currentSelectedField?.fieldId === accurateZone?.fieldId;

      if (
        (accurateZone?.type === "fieldType" ||
          accurateZone?.type === "itemType" ||
          accurateZone?.type === "innerType") &&
        isFieldAlreadySelected &&
        !targetModel
      ) {
        state.clearModelPopups();
        state.setTypeSelect({
          objectId: id,
          fieldId: accurateZone.fieldId,
          section: accurateZone.section,
          isModel: obj.type === "model",
          kind: accurateZone.type,
          anchor: {
            x: accurateZone.bounds.x,
            y: accurateZone.bounds.y,
            width: accurateZone.bounds.width,
            height: accurateZone.bounds.height,
          },
        });
        return;
      }

      // Click on the ⓘ description icon opens the info panel — card info when
      // the header icon was hit (no fieldId), field info for a row icon.
      if (accurateZone?.type === "desc") {
        state.clearModelPopups();
        state.selectObject(id, e.shiftKey || e.metaKey || e.ctrlKey);
        state.setStormSelectedField({
          objectId: id,
          fieldId:
            accurateZone.fieldId ||
            accurateZone.valueId ||
            accurateZone.queryItemId ||
            accurateZone.constraintId,
        });
        return;
      }

      // Click on a row's validation ✓ badge selects the target and opens the
      // validation panel in the options bar. Array / wrap nodes have no field
      // row, so their badge targets the node itself.
      if (accurateZone?.type === "validation") {
        state.clearModelPopups();
        state.selectObject(id, e.shiftKey || e.metaKey || e.ctrlKey);
        state.setStormSelectedField(
          accurateZone.fieldId ? { objectId: id, fieldId: accurateZone.fieldId } : null,
        );
        state.setValidationTarget({
          objectId: id,
          fieldId: accurateZone.fieldId,
        });
        return;
      }

      // Click on a BDD card's "add step" placeholder opens the step editor
      // directly, so an empty scenario card has a visible entry point.
      if (accurateZone?.type === "bddAddStep") {
        state.clearModelPopups();
        state.selectObject(id, e.shiftKey || e.metaKey || e.ctrlKey);
        state.setStormSelectedField(null);
        state.setBddStepPopup({ objectId: id });
        return;
      }

      // Single-click row selection: clicking anywhere on a field row (name, tag, type,
      // enum value, query item, constraint, BDD scenario step) selects and
      // highlights that row.
      if (
        accurateZone?.type === "fieldName" ||
        accurateZone?.type === "fieldTag" ||
        accurateZone?.type === "fieldType" ||
        accurateZone?.type === "itemType" ||
        accurateZone?.type === "innerType" ||
        accurateZone?.type === "enumValue" ||
        accurateZone?.type === "queryItem" ||
        accurateZone?.type === "constraint" ||
        accurateZone?.type === "bddStep" ||
        accurateZone?.type === "bddStepName" ||
        accurateZone?.type === "bddPayloadKey" ||
        accurateZone?.type === "bddPayloadValue"
      ) {
        // BDD zones carry the owning step in `fieldId`; payload zones must not
        // fall through to `valueId` (that is the payload row, not the step).
        const isBddZone = accurateZone.type.startsWith("bdd");
        state.setStormSelectedField({
          objectId: id,
          fieldId: isBddZone
            ? accurateZone.fieldId
            : accurateZone.fieldId ||
              accurateZone.valueId ||
              accurateZone.queryItemId ||
              accurateZone.constraintId,
        });
        // Selecting a row normally dismisses the validation panel; it is only
        // (re)opened by clicking the row's ✓ badge above.
        state.setValidationTarget(null);

        if (targetModel) {
          const worldRightX = obj.x + (obj.width || 240);
          const worldRowY = obj.y + (accurateZone.bounds?.y ?? 0);
          const rowH = accurateZone.bounds?.height ?? 26;

          state.openModelPopup({
            modelId: targetModel.id,
            sourceObjectId: obj.id,
            sourceFieldId:
              accurateZone.fieldId ??
              (accurateZone.type === "itemType" ? "item" : "inner"),
            sourceFieldName: fieldName,
            sourceFieldType: fieldType,
            worldAnchor: {
              x: worldRightX,
              y: worldRowY,
              height: rowH,
            },
            level: 0,
          });
        } else {
          state.clearModelPopups();
        }
      } else {
        state.setStormSelectedField(null);
        state.setValidationTarget(null);
        state.clearModelPopups();
      }

      const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!state.selectedIds.includes(id)) {
        state.selectObject(id, isMulti);
      } else if (isMulti) {
        state.deselectObject(id);
        return;
      }

      // Begin dragging selected cards
      this.isDraggingCards = true;
      this.primaryDragId = id;
      this.dragStartWorld = { x: worldPos.x, y: worldPos.y };
      this.cardDragStartScreen = { x: e.clientX, y: e.clientY };

      const currentSelected = useCanvasStore.getState().selectedIds;
      this.initialObjectPositions.clear();
      for (const o of useCanvasStore.getState().objects) {
        if (currentSelected.includes(o.id)) {
          this.initialObjectPositions.set(o.id, { x: o.x, y: o.y });
        }
      }
    };

    // Canvas background pointer events
    const canvas = this.app.canvas;

    // Clear the description / action tooltips when the pointer leaves the canvas
    canvas.addEventListener("pointerleave", () => {
      useCanvasStore.getState().setDescHover(null);
      useCanvasStore.getState().setActionHover(null);
      useCanvasStore.getState().setStormActionHover(null);
      useCanvasStore.getState().setValidationHover(null);
    });

    // Double-click handling uses the browser's native dblclick so it never
    // races with the clicks that select a card/row. Hit-tests the card under
    // the pointer and opens the matching inline editor (header title, field /
    // enum value name, query item, constraint, sticky or text box).
    canvas.addEventListener("dblclick", (e: MouseEvent) => {
      const state = useCanvasStore.getState();
      if (this.isSpaceHeld) return;
      if (state.tool === "connector" || state.tool === "line" || state.isLocked)
        return;
      if (e.target !== canvas) return;

      if (state.modelPopupChain.length > 0) {
        state.clearModelPopups();
      }

      // Double-click on resize handle auto-fits card width to its content
      if (this.hoveredHandle) {
        const targetObj = state.objects.find(
          (o) => o.id === this.hoveredHandle!.objectId,
        );
        if (targetObj) {
          const optimalWidth = computeOptimalCardWidth(targetObj);
          state.updateObject(targetObj.id, { width: optimalWidth });
          return;
        }
      }

      const rect = this.container.getBoundingClientRect();
      const worldPos = this.viewport.toWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      const hit = this.findCardZoneAtWorld(worldPos.x, worldPos.y);
      if (!hit) return;
      const { obj, zone } = hit;

      // Double-click on a BDD card's add-step placeholder opens the step
      // editor instead of an inline text field.
      if (zone?.type === "bddAddStep") {
        state.selectObject(obj.id);
        state.setBddStepPopup({ objectId: obj.id });
        return;
      }

      // Double-click on type zone directly opens type selector
      if (
        zone?.type === "fieldType" ||
        zone?.type === "itemType" ||
        zone?.type === "innerType"
      ) {
        state.selectObject(obj.id);
        state.setStormSelectedField({
          objectId: obj.id,
          fieldId: zone.fieldId,
        });
        state.setTypeSelect({
          objectId: obj.id,
          fieldId: zone.fieldId,
          section: zone.section,
          isModel: obj.type === "model",
          kind: zone.type,
          anchor: {
            x: zone.bounds.x,
            y: zone.bounds.y,
            width: zone.bounds.width,
            height: zone.bounds.height,
          },
        });
        return;
      }

      // Description ⓘ icons are not edited inline — the options-bar panel
      // handles both the card and the selected row. The action badge is also
      // not edited here.
      if (zone?.type === "desc" || zone?.type === "action") {
        return;
      }

      const targetZone = zone || {
        type: "header",
        bounds: { x: 0, y: 0, width: obj.width, height: 36 },
        currentText:
          obj.stormData?.name || obj.modelData?.name || obj.text || "",
      };

      state.setInlineEdit({
        objectId: obj.id,
        zone: targetZone,
        initialValue: targetZone.currentText || "",
      });
    });

    canvas.addEventListener("pointerdown", (e: PointerEvent) => {
      const state = useCanvasStore.getState();
      // The user taking over clears the AI's highlight ring.
      if (state.aiHighlightIds.length > 0) state.setAIHighlight([]);
      this.hadPopoverOnPointerDown = Boolean(
        state.typeSelect || state.inlineEdit,
      );
      if (this.isSpaceHeld) {
        this.container.style.cursor = "grabbing";
        this.cardLayer.setCursor("grabbing");
        return;
      }

      this.invalidateContainerRect();
      const rect = this.getContainerRect();
      const worldPos = this.viewport.toWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      // Cmd/Ctrl/Shift marks a click as multi-select: it must only toggle the
      // object, never start a handle drag that would replace the selection.
      const isMultiSelect = e.shiftKey || e.metaKey || e.ctrlKey;

      // Line Tool Mode — click the start point, then click the end point
      // (like the connector tool; no drag required). Handled before the
      // resize-handle check so a stale handle hover cannot hijack it.
      if (state.tool === "line") {
        if (e.button === 2) {
          this.cancelLineDrawing();
          return;
        }
        if (e.button !== 0) return;

        if (!this.isDrawingLine || !this.lineDrawStart) {
          this.isDrawingLine = true;
          this.lineDrawStart = { x: worldPos.x, y: worldPos.y };
          this.lineLayer.renderPreview({
            start: this.lineDrawStart,
            end: { ...worldPos },
          });
          return;
        }

        // Second click: commit the segment.
        const start = this.lineDrawStart;
        this.isDrawingLine = false;
        this.lineDrawStart = null;
        this.lineLayer.renderPreview(null);
        const screenLength =
          Math.hypot(worldPos.x - start.x, worldPos.y - start.y) *
          (this.viewport.scaled || 1);
        if (screenLength >= LINE_MIN_DRAW_LENGTH) {
          this.createLine(start, { x: worldPos.x, y: worldPos.y });
          useCanvasStore.getState().setTool("select");
        }
        return;
      }

      if (this.hoveredHandle) {
        this.cardPointerDownHandled = true;
        this.isResizingCard = true;
        this.resizingHandle = this.hoveredHandle.handle;
        this.resizingObjectId = this.hoveredHandle.objectId;
        this.resizeStartWorld = { x: worldPos.x, y: worldPos.y };
        const targetObj = state.objects.find(
          (o) => o.id === this.resizingObjectId,
        );
        if (targetObj) {
          this.initialObjectBounds = {
            x: targetObj.x,
            y: targetObj.y,
            width: targetObj.width,
            height: targetObj.height,
          };
        }
        return;
      }

      // 1. Connector Tool Mode — click the source anchor, then click optional
      // waypoints on the canvas, and finally click the target anchor.
      // Right-click or escape cancels creation.
      if (state.tool === "connector") {
        if (e.button === 2) {
          this.cancelConnectorCreation();
          return;
        }

        if (!this.isCreatingConnector) {
          const hitAnchor = findClosestAnchor(
            worldPos,
            this.collectAllAnchors(),
            25,
          );
          if (hitAnchor) {
            this.isCreatingConnector = true;
            this.connectorStartAnchor = hitAnchor;
            this.connectorWaypoints = [];
            this.connectorLayer.renderPreview({
              start: hitAnchor,
              currentPoint: { ...worldPos },
              waypoints: [],
            });
            // Show every anchor the user can still pick as the destination.
            this.connectorLayer.renderAnchors(
              this.getConnectorTargetAnchors().map((a) => ({
                ...a,
                isHovered: false,
              })),
            );
          }
          return;
        }

        // Active connector creation: complete at the target anchor, or click
        // empty space / canvas to insert an intermediate waypoint.
        const targetAnchor = findClosestAnchor(
          worldPos,
          this.getConnectorTargetAnchors(),
          25,
        );
        if (this.connectorStartAnchor && targetAnchor) {
          this.createConnector(
            this.connectorStartAnchor,
            targetAnchor,
            this.connectorWaypoints,
          );
          this.cancelConnectorCreation();
          return;
        }

        // Clicked canvas: record intermediate waypoint
        this.connectorWaypoints.push({ x: worldPos.x, y: worldPos.y });
        this.connectorLayer.renderPreview({
          start: this.connectorStartAnchor!,
          currentPoint: { ...worldPos },
          waypoints: this.connectorWaypoints,
        });
        return;
      }

      // 1.5. Check Connector Endpoint Handle hit (drag to re-connect start or end)
      if (state.tool === "select" && !this.isSpaceHeld && !state.isLocked) {
        const hitEndpoint = this.findConnectorEndpointHandleAtWorld(
          worldPos.x,
          worldPos.y,
        );
        if (hitEndpoint) {
          if (state.modelPopupChain.length > 0) {
            state.clearModelPopups();
          }
          state.setStormSelectedField(null);
          // A modified click just toggles membership; the endpoint stays put.
          if (isMultiSelect) {
            state.selectObject(hitEndpoint.connectorId, true);
            return;
          }
          state.selectObject(hitEndpoint.connectorId, false);
          this.isDraggingConnectorEndpoint = true;
          this.activeConnectorEndpoint = hitEndpoint;

          const candidateAnchors = this.collectAllAnchors();
          this.connectorLayer.renderAnchors(
            candidateAnchors.map((a) => ({ ...a, isHovered: false })),
          );
          return;
        }
      }

      // 1.6. Line endpoint handle hit (drag to extend / shorten the line)
      if (state.tool === "select" && !this.isSpaceHeld && !state.isLocked) {
        const hitLineEndpoint = this.findLineEndpointHandleAtWorld(
          worldPos.x,
          worldPos.y,
        );
        if (hitLineEndpoint) {
          if (state.modelPopupChain.length > 0) {
            state.clearModelPopups();
          }
          state.setStormSelectedField(null);
          // A modified click just toggles membership; the endpoint stays put.
          if (isMultiSelect) {
            state.selectObject(hitLineEndpoint.lineId, true);
            return;
          }
          state.selectObject(hitLineEndpoint.lineId, false);
          this.isDraggingLineEndpoint = true;
          this.activeLineEndpoint = {
            lineId: hitLineEndpoint.lineId,
            endpoint: hitLineEndpoint.endpoint,
          };
          const lineObj = state.objects.find(
            (o) => o.id === hitLineEndpoint.lineId,
          );
          const ends = lineObj ? getLineEndpoints(lineObj) : null;
          this.lineEndpointFixed = ends
            ? hitLineEndpoint.endpoint === "start"
              ? ends.end
              : ends.start
            : null;
          return;
        }
      }

      // If a card is under the pointer, a card handler owns this event —
      // regardless of whether it ran before or after this native listener.
      if (this.findCardZoneAtWorld(worldPos.x, worldPos.y)) {
        return;
      }

      // 1.7. Line body hit — click-select, then drag to move the whole line.
      if (state.tool === "select" && !this.isSpaceHeld && !state.isLocked) {
        const hitLine = this.findLineAtWorld(worldPos.x, worldPos.y);
        if (hitLine) {
          if (state.modelPopupChain.length > 0) {
            state.clearModelPopups();
          }
          state.setStormSelectedField(null);
          state.selectObject(
            hitLine.id,
            e.shiftKey || e.metaKey || e.ctrlKey,
          );
          this.isDraggingLineBody = true;
          this.draggedLineId = hitLine.id;
          this.lineBodyDragStartWorld = { x: worldPos.x, y: worldPos.y };
          this.lineBodyInitial = { x: hitLine.x, y: hitLine.y };
          return;
        }
      }

      // If card pointerdown was handled, do not clear selection or start marquee/group
      if (this.cardPointerDownHandled) {
        this.cardPointerDownHandled = false;
        return;
      }

      // 2. Connector hit — thin lines sit above groups but below cards, so the
      // user can click-select (and then delete) a connector.
      const hitConnector = this.findConnectorAtWorld(worldPos.x, worldPos.y);
      if (hitConnector) {
        if (state.modelPopupChain.length > 0) {
          state.clearModelPopups();
        }
        // Drop any row selection so Delete targets the connector, not a field.
        state.setStormSelectedField(null);
        state.selectObject(
          hitConnector.id,
          e.shiftKey || e.metaKey || e.ctrlKey,
        );
        return;
      }

      // 3. Check Group hit (header, border, or interior)
      const hitGroup = getGroupAt(
        worldPos.x,
        worldPos.y,
        state.groups,
        state.objects,
      );

      if (hitGroup) {
        if (state.modelPopupChain.length > 0) {
          state.clearModelPopups();
        }
        // Double-click detection on group header badge
        const now = Date.now();
        if (
          hitGroup.hitType === "header" &&
          this.lastGroupClickId === hitGroup.group.id &&
          now - this.lastGroupClickTime < 350
        ) {
          state.setInlineEdit({
            objectId: hitGroup.group.id,
            zone: {
              type: "header",
              bounds: hitGroup.badgeBounds,
              currentText: hitGroup.group.name,
            },
            initialValue: hitGroup.group.name,
          });
          return;
        }
        this.lastGroupClickTime = now;
        this.lastGroupClickId = hitGroup.group.id;

        const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;
        const gid = `__group:${hitGroup.group.id}`;
        const wasSelected = state.selectedIds.includes(gid);
        state.selectGroup(hitGroup.group.id, isMulti);
        if (isMulti && wasSelected) {
          return;
        }

        // Prepare to drag the group
        this.isDraggingGroup = true;
        this.draggedGroupId = hitGroup.group.id;
        this.dragStartWorld = { x: worldPos.x, y: worldPos.y };
        this.groupDragStartScreen = { x: e.clientX, y: e.clientY };
        return;
      }

      // 4. Clicked on empty space
      if (state.modelPopupChain.length > 0) {
        state.clearModelPopups();
      }
      if (!this.isDraggingCards && state.tool === "select") {
        const isControlOrMeta = e.ctrlKey || e.metaKey;
        if (isControlOrMeta) {
          // Multi-select mode: start marquee selection box
          this.marqueeInitialSelectedIds = e.shiftKey
            ? [...state.selectedIds]
            : [];
          if (!e.shiftKey) {
            state.clearSelection();
          }

          this.isMarqueeDragging = true;
          this.marqueeStartWorld = { x: worldPos.x, y: worldPos.y };
          this.gizmoLayer.renderMarquee({
            x: worldPos.x,
            y: worldPos.y,
            width: 0,
            height: 0,
          });
        } else {
          // Hand tool behavior: dragging empty space pans the canvas
          this.isPanningCanvas = true;
          this.hasPannedCanvas = false;
          this.panStartPointer = { x: e.clientX, y: e.clientY };
          this.lastPanPointer = { x: e.clientX, y: e.clientY };
        }
      }
    });

    window.addEventListener("pointermove", (e: PointerEvent) => {
      const rect = this.getContainerRect();
      const worldPos = this.viewport.toWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );

      const state = useCanvasStore.getState();
      this.lastWorldPos = { ...worldPos };

      // Line tool: live preview of the segment being dragged out.
      if (this.isDrawingLine && this.lineDrawStart) {
        this.lineLayer.renderPreview({
          start: this.lineDrawStart,
          end: { ...worldPos },
        });
        return;
      }

      // Handle Connector Creation Live Preview (pending after the source click)
      if (this.isCreatingConnector && this.connectorStartAnchor) {
        const candidateAnchors = this.getConnectorTargetAnchors();
        const targetCandidate = findClosestAnchor(
          worldPos,
          candidateAnchors,
          25,
        );
        const currentPoint = targetCandidate ? targetCandidate.point : worldPos;

        this.connectorLayer.renderPreview({
          start: this.connectorStartAnchor,
          currentPoint,
          targetAnchor: targetCandidate?.anchor,
          waypoints: this.connectorWaypoints,
        });
        this.connectorLayer.renderAnchors(
          candidateAnchors.map((a) => ({
            ...a,
            isHovered:
              a.objectId === targetCandidate?.objectId &&
              a.anchor === targetCandidate?.anchor,
          })),
        );
        return;
      }

      // Handle Connector Tool Hover (show cardinal magnetic anchors)
      if (state.tool === "connector" && !this.isCreatingConnector) {
        const allAnchors = this.collectAllAnchors();
        const hovered = findClosestAnchor(worldPos, allAnchors, 25);
        this.connectorLayer.renderAnchors(
          allAnchors.map((a) => ({
            ...a,
            isHovered:
              a.objectId === hovered?.objectId && a.anchor === hovered?.anchor,
          })),
        );
        return;
      }

      // Handle Connector Endpoint Dragging (reconnecting start or end anchor)
      if (this.isDraggingConnectorEndpoint && this.activeConnectorEndpoint) {
        const conn = state.objects.find(
          (o) => o.id === this.activeConnectorEndpoint!.connectorId,
        );
        if (conn && conn.connectorData) {
          const lookup = buildConnectorLookup(state.objects, state.groups);
          const candidateAnchors = this.collectAllAnchors();
          const targetCandidate = findClosestAnchor(
            worldPos,
            candidateAnchors,
            25,
          );
          const currentPoint = targetCandidate
            ? targetCandidate.point
            : worldPos;

          if (this.activeConnectorEndpoint.endpoint === "end") {
            // Start is fixed, end is moving to currentPoint
            const startBounds = this.connectorLayer.findBounds(
              conn.connectorData.start.objectId,
              state.objects,
              state.groups,
              lookup,
            );
            if (startBounds) {
              const startPt = getCardinalAnchorPoint(
                startBounds,
                conn.connectorData.start.anchor,
              );
              this.connectorLayer.renderPreview({
                start: {
                  objectId: conn.connectorData.start.objectId,
                  anchor: conn.connectorData.start.anchor,
                  point: startPt,
                },
                currentPoint,
                targetAnchor: targetCandidate?.anchor,
              });
            }
          } else {
            // End is fixed, start is moving to currentPoint
            const endBounds = this.connectorLayer.findBounds(
              conn.connectorData.end.objectId,
              state.objects,
              state.groups,
              lookup,
            );
            if (endBounds) {
              const endPt = getCardinalAnchorPoint(
                endBounds,
                conn.connectorData.end.anchor,
              );
              const startDir =
                targetCandidate?.anchor ??
                getOppositeAnchor(conn.connectorData.end.anchor);
              this.connectorLayer.renderPreview({
                start: {
                  objectId: targetCandidate?.objectId ?? "",
                  anchor: startDir,
                  point: currentPoint,
                },
                currentPoint: endPt,
                targetAnchor: conn.connectorData.end.anchor,
              });
            }
          }

          // Redraw connectors hiding the one being dragged
          this.connectorLayer.renderConnectors(
            state.objects,
            state.groups,
            state.selectedIds,
            conn.id,
          );

          // Highlight target anchor if hovered
          this.connectorLayer.renderAnchors(
            candidateAnchors.map((a) => ({
              ...a,
              isHovered:
                targetCandidate !== null &&
                a.objectId === targetCandidate.objectId &&
                a.anchor === targetCandidate.anchor,
            })),
          );

          this.container.style.cursor = "grabbing";
          this.cardLayer.setCursor("grabbing");
        }
        return;
      }

      // Line endpoint dragging — the opposite endpoint stays anchored while
      // the grabbed one follows the pointer.
      if (
        this.isDraggingLineEndpoint &&
        this.activeLineEndpoint &&
        this.lineEndpointFixed
      ) {
        const lineObj = state.objects.find(
          (o) => o.id === this.activeLineEndpoint!.lineId,
        );
        if (lineObj && lineObj.lineData) {
          const isStart = this.activeLineEndpoint.endpoint === "start";
          const start = isStart ? worldPos : this.lineEndpointFixed;
          const end = isStart ? this.lineEndpointFixed : worldPos;
          state.updateObject(
            lineObj.id,
            normalizeLineGeometry(start, end, lineObj.lineData),
          );
        }
        return;
      }

      // Line body dragging — translate x/y; endpoints ride along as local
      // offsets, so the line keeps its size and angle.
      if (
        this.isDraggingLineBody &&
        this.draggedLineId &&
        this.lineBodyInitial
      ) {
        const dx = worldPos.x - this.lineBodyDragStartWorld.x;
        const dy = worldPos.y - this.lineBodyDragStartWorld.y;
        state.updateObject(this.draggedLineId, {
          x: this.lineBodyInitial.x + dx,
          y: this.lineBodyInitial.y + dy,
        });
        return;
      }

      // Handle Canvas Panning (empty space drag)
      if (this.isPanningCanvas) {
        const dx = e.clientX - this.panStartPointer.x;
        const dy = e.clientY - this.panStartPointer.y;
        if (!this.hasPannedCanvas && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          this.hasPannedCanvas = true;
          this.container.style.cursor = "grabbing";
          this.cardLayer.setCursor("grabbing");
        }
        if (this.hasPannedCanvas) {
          const moveX =
            (e.clientX - this.lastPanPointer.x) / (this.viewport.scaled || 1);
          const moveY =
            (e.clientY - this.lastPanPointer.y) / (this.viewport.scaled || 1);
          this.viewport.moveCorner(
            this.viewport.corner.x - moveX,
            this.viewport.corner.y - moveY,
          );
          this.lastPanPointer = { x: e.clientX, y: e.clientY };
          this.invalidateView();
          return;
        }
      }

      // Handle Card Resizing
      if (
        this.isResizingCard &&
        this.resizingObjectId &&
        this.resizingHandle &&
        this.initialObjectBounds
      ) {
        if (!state.isDragging) {
          state.setIsDragging(true);
        }
        const dx = worldPos.x - this.resizeStartWorld.x;
        const dy = worldPos.y - this.resizeStartWorld.y;
        const targetObj = state.objects.find(
          (o) => o.id === this.resizingObjectId,
        );
        if (targetObj) {
          const minDims = getCardMinDimensions(targetObj);
          const newBounds = calculateResizedBounds({
            handle: this.resizingHandle,
            initialBounds: this.initialObjectBounds,
            deltaX: dx,
            deltaY: dy,
            minWidth: minDims.minWidth,
            minHeight: minDims.minHeight,
          });
          // Horizontal-only handles must not pin the height. A storm card's
          // height is content-driven and reflows with the new width, so
          // committing the pre-drag height here would freeze the card's
          // selection gizmo at the old size while the card itself shrinks or
          // grows. Omitting height lets updateObject re-derive it for the new
          // width. Vertical handles (none exposed today) still commit theirs.
          const patch: Partial<CanvasObject> = {
            x: newBounds.x,
            y: newBounds.y,
            width: newBounds.width,
          };
          // A deliberate width drag is a user choice: flag it so later AI
          // edits keep this width instead of refitting the card to content.
          if (
            this.resizingHandle.includes("e") ||
            this.resizingHandle.includes("w")
          ) {
            patch.widthLocked = true;
          }
          if (
            this.resizingHandle.includes("n") ||
            this.resizingHandle.includes("s")
          ) {
            patch.height = newBounds.height;
          }
          useCanvasStore.getState().updateObject(this.resizingObjectId, patch);
        }
        return;
      }

      // Handle Group Dragging
      if (this.isDraggingGroup && this.draggedGroupId) {
        const screenDist = this.groupDragStartScreen
          ? Math.hypot(
              e.clientX - this.groupDragStartScreen.x,
              e.clientY - this.groupDragStartScreen.y,
            )
          : 10;
        if (screenDist > 3 && !state.isDragging) {
          state.setIsDragging(true);
        }
        const dx = worldPos.x - this.dragStartWorld.x;
        const dy = worldPos.y - this.dragStartWorld.y;
        state.moveGroupObjects(this.draggedGroupId, dx, dy, false);
        this.dragStartWorld = { x: worldPos.x, y: worldPos.y };
        return;
      }

      // Handle Card Dragging
      if (this.isDraggingCards && this.primaryDragId) {
        const totalDx = worldPos.x - this.dragStartWorld.x;
        const totalDy = worldPos.y - this.dragStartWorld.y;

        const screenDist = this.cardDragStartScreen
          ? Math.hypot(
              e.clientX - this.cardDragStartScreen.x,
              e.clientY - this.cardDragStartScreen.y,
            )
          : Math.hypot(totalDx, totalDy);

        if (screenDist > 3 && !state.isDragging) {
          state.setIsDragging(true);
        }

        if (
          screenDist > 6 &&
          useCanvasStore.getState().modelPopupChain.length > 0
        ) {
          useCanvasStore.getState().clearModelPopups();
        }

        const primaryInit = this.initialObjectPositions.get(this.primaryDragId);
        const primaryObj = useCanvasStore
          .getState()
          .objects.find((o) => o.id === this.primaryDragId);

        if (primaryInit && primaryObj) {
          const candidateMovingBox = {
            x: primaryInit.x + totalDx,
            y: primaryInit.y + totalDy,
            width: primaryObj.width,
            height: primaryObj.height,
          };

          // Target boxes for magnetic alignment — non-selected boxes cannot
          // move during a drag, so the list is built once per drag.
          if (!this.dragSnapBoxes) {
            const selectedIds = useCanvasStore.getState().selectedIds;
            this.dragSnapBoxes = useCanvasStore
              .getState()
              .objects.filter(
                (o) => !selectedIds.includes(o.id) && o.type !== "connector",
              )
              .map((o) => ({
                x: o.x,
                y: o.y,
                width: o.width,
                height: o.height,
              }));
          }
          const otherBoxes = this.dragSnapBoxes;

          const snapResult = calculateSnapping(
            candidateMovingBox,
            otherBoxes,
            6,
            true,
          );

          // Calculate effective delta from initial position
          const finalDx = snapResult.x - primaryInit.x;
          const finalDy = snapResult.y - primaryInit.y;

          // Update all dragged cards
          const updates: { id: string; patch: Partial<CanvasObject> }[] = [];
          for (const [id, initPos] of this.initialObjectPositions.entries()) {
            updates.push({
              id,
              patch: {
                x: initPos.x + finalDx,
                y: initPos.y + finalDy,
              },
            });
          }
          useCanvasStore.getState().updateObjects(updates);

          // Render magnetic guidelines
          const vb = this.viewport.getVisibleBounds();
          this.gizmoLayer.renderGuides(snapResult.guides, {
            left: vb.x,
            top: vb.y,
            right: vb.x + vb.width,
            bottom: vb.y + vb.height,
          });
        }
      } else if (this.isMarqueeDragging) {
        const mx = this.marqueeStartWorld.x;
        const my = this.marqueeStartWorld.y;
        const mw = worldPos.x - mx;
        const mh = worldPos.y - my;

        const marqueeBox: MarqueeBox = { x: mx, y: my, width: mw, height: mh };
        this.gizmoLayer.renderMarquee(marqueeBox);

        // Find intersecting objects using SpatialIndex
        const minX = Math.min(mx, mx + mw);
        const maxX = Math.max(mx, mx + mw);
        const minY = Math.min(my, my + mh);
        const maxY = Math.max(my, my + mh);

        const hits = this.spatialIndex.search({ minX, minY, maxX, maxY });

        // Freeform lines stay out of the card spatial index (clicks hit-test
        // their segment instead), so add any line the marquee actually crosses.
        for (const obj of useCanvasStore.getState().objects) {
          if (
            obj.type === "line" &&
            lineIntersectsRect(obj, minX, minY, maxX, maxY)
          ) {
            hits.push(obj.id);
          }
        }

        if (this.marqueeInitialSelectedIds.length > 0) {
          const merged = Array.from(
            new Set([...this.marqueeInitialSelectedIds, ...hits]),
          );
          useCanvasStore.getState().setSelectedIds(merged);
        } else {
          useCanvasStore.getState().setSelectedIds(hits);
        }
      }

      // Cursor/handle and tooltip hover hit-testing is coalesced to one pass
      // per frame so a high-rate mouse doesn't re-run it on every raw event.
      this.scheduleIdleHover(worldPos, e);
    });

    const handlePointerUp = () => {
      this.cardPointerDownHandled = false;
      this.dragSnapBoxes = null;

      if (useCanvasStore.getState().isDragging) {
        useCanvasStore.getState().setIsDragging(false);
      }
      this.groupDragStartScreen = null;

      if (this.isSpaceHeld) {
        this.container.style.cursor = "grab";
        this.cardLayer.setCursor("grab");
      }

      // Finish Canvas Panning
      if (this.isPanningCanvas) {
        if (!this.hasPannedCanvas && !this.hadPopoverOnPointerDown) {
          // User clicked on empty space without dragging -> clear selection
          useCanvasStore.getState().clearSelection();
        }
        this.hadPopoverOnPointerDown = false;
        this.isPanningCanvas = false;
        this.hasPannedCanvas = false;
        if (!this.isSpaceHeld) {
          this.container.style.cursor = "default";
          this.cardLayer.setCursor("default");
        }
      }

      // Connector creation and line drawing are two-click interactions
      // finished on the next pointerdown, so pointerup only releases the
      // other drag states.

      // Finish Line Endpoint / Body Dragging (positions already committed)
      if (this.isDraggingLineEndpoint) {
        this.isDraggingLineEndpoint = false;
        this.activeLineEndpoint = null;
        this.lineEndpointFixed = null;
      }
      if (this.isDraggingLineBody) {
        this.isDraggingLineBody = false;
        this.draggedLineId = null;
        this.lineBodyInitial = null;
      }

      // Finish Group Dragging
      if (this.isDraggingGroup) {
        this.isDraggingGroup = false;
        this.draggedGroupId = null;
      }

      // Finish Card Resizing
      if (this.isResizingCard) {
        this.isResizingCard = false;
        this.resizingHandle = null;
        this.resizingObjectId = null;
        this.initialObjectBounds = null;
        this.syncSpatialIndex();
        if (!this.hoveredHandle && !this.isSpaceHeld) {
          this.container.style.cursor = "default";
          this.cardLayer.setCursor("default");
        }
      }

      // Finish Card Dragging
      if (this.isDraggingCards) {
        this.isDraggingCards = false;
        this.primaryDragId = null;
        this.cardDragStartScreen = null;
        this.initialObjectPositions.clear();
        const vb = this.viewport.getVisibleBounds();
        this.gizmoLayer.renderGuides([], {
          left: vb.x,
          top: vb.y,
          right: vb.x + vb.width,
          bottom: vb.y + vb.height,
        });
      }

      // Finish Marquee Dragging
      if (this.isMarqueeDragging) {
        this.isMarqueeDragging = false;
        this.marqueeInitialSelectedIds = [];
        this.gizmoLayer.renderMarquee(null);
      }

      // Finish Connector Endpoint Dragging
      if (this.isDraggingConnectorEndpoint && this.activeConnectorEndpoint) {
        const state = useCanvasStore.getState();
        const candidateAnchors = this.collectAllAnchors();
        const targetAnchor = findClosestAnchor(
          this.lastWorldPos,
          candidateAnchors,
          25,
        );

        if (targetAnchor) {
          const conn = state.objects.find(
            (o) => o.id === this.activeConnectorEndpoint!.connectorId,
          );
          if (conn && conn.connectorData) {
            const updatedData = { ...conn.connectorData };
            if (this.activeConnectorEndpoint.endpoint === "start") {
              updatedData.start = {
                objectId: targetAnchor.objectId,
                anchor: targetAnchor.anchor,
              };
            } else {
              updatedData.end = {
                objectId: targetAnchor.objectId,
                anchor: targetAnchor.anchor,
              };
            }
            state.updateObject(conn.id, { connectorData: updatedData });
          }
        }

        this.isDraggingConnectorEndpoint = false;
        this.activeConnectorEndpoint = null;
        this.connectorLayer.renderPreview(null);
        this.connectorLayer.renderAnchors([]);
        this.connectorLayer.renderConnectors(
          state.objects,
          state.groups,
          state.selectedIds,
        );
        this.invalidateContent();
        if (!this.isSpaceHeld) {
          this.container.style.cursor = "default";
          this.cardLayer.setCursor("default");
        }
      }
    };

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  /**
   * Coalesces idle-hover hit-testing to at most one pass per animation frame,
   * always using the most recent pointer position.
   */
  private scheduleIdleHover(worldPos: Point, e: PointerEvent): void {
    this.pendingHover = {
      worldPos: { x: worldPos.x, y: worldPos.y },
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      target: e.target,
    };
    if (this.hoverRaf !== null) return;
    this.hoverRaf = requestAnimationFrame(() => {
      this.hoverRaf = null;
      const pending = this.pendingHover;
      this.pendingHover = null;
      if (!pending || this.isDestroyed) return;
      this.updateIdleHover(pending);
    });
  }

  /**
   * Resize-handle / connector-endpoint cursor and description ⓘ / action /
   * validation tooltip hover hit-testing — only while idle on the select tool.
   */
  private updateIdleHover(p: {
    worldPos: Point;
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    target: EventTarget | null;
  }): void {
    const state = useCanvasStore.getState();
    const worldPos = p.worldPos;

    const isBusy =
      this.isDraggingCards ||
      this.isDraggingGroup ||
      this.isMarqueeDragging ||
      this.isCreatingConnector ||
      this.isPanningCanvas ||
      this.isResizingCard ||
      this.isDraggingConnectorEndpoint ||
      this.isDrawingLine ||
      this.isDraggingLineEndpoint ||
      this.isDraggingLineBody;

    // Check resize handle or connector endpoint handle hover when idle on select tool
    if (
      !isBusy &&
      !this.isSpaceHeld &&
      state.tool === "select" &&
      !state.isLocked
    ) {
      const hitHandle = this.gizmoLayer.getHandleAt(
        worldPos.x,
        worldPos.y,
        this.viewport.scaled || 1,
      );
      const hitEndpoint = this.findConnectorEndpointHandleAtWorld(
        worldPos.x,
        worldPos.y,
      );
      const hitLineEndpoint = this.findLineEndpointHandleAtWorld(
        worldPos.x,
        worldPos.y,
      );

      if (hitHandle) {
        this.hoveredHandle = hitHandle;
        this.hoveringEndpoint = false;
        const cursor = getCursorForHandle(hitHandle.handle);
        this.container.style.cursor = cursor;
        this.cardLayer.setCursor(cursor);
      } else if (hitEndpoint || hitLineEndpoint) {
        this.hoveredHandle = null;
        this.hoveringEndpoint = true;
        // With a selection modifier held a click toggles the object rather
        // than grabbing the handle, so keep the pointer cursor.
        const cursor =
          p.shiftKey || p.metaKey || p.ctrlKey ? "default" : "grab";
        this.container.style.cursor = cursor;
        this.cardLayer.setCursor(cursor);
      } else if (this.hoveredHandle || this.hoveringEndpoint) {
        this.hoveredHandle = null;
        this.hoveringEndpoint = false;
        this.container.style.cursor = "default";
        this.cardLayer.setCursor("default");
      }
    }

    let nextHover: DescTarget | null = null;
    let nextActionHover: ActionTarget | null = null;
    let nextValidationHover: ValidationTarget | null = null;
    if (
      !isBusy &&
      !this.isSpaceHeld &&
      state.tool === "select" &&
      p.target === this.app.canvas
    ) {
      const hit = this.findCardZoneAtWorld(worldPos.x, worldPos.y);
      const zone = hit?.zone;
      if (hit && zone?.type === "desc" && zone.currentText) {
        nextHover = {
          objectId: hit.obj.id,
          fieldId: zone.fieldId || zone.valueId,
          iconBounds: zone.bounds,
        };
      } else if (hit && zone?.type === "action" && zone.currentText) {
        nextActionHover = {
          objectId: hit.obj.id,
          action: zone.currentText,
          iconBounds: zone.bounds,
        };
      } else if (hit && zone?.type === "validation" && zone.currentText) {
        nextValidationHover = {
          objectId: hit.obj.id,
          fieldId: zone.fieldId,
          text: zone.currentText,
          iconBounds: zone.bounds,
        };
      }
    }
    const current = useCanvasStore.getState().descHover;
    const same =
      current && nextHover
        ? current.objectId === nextHover.objectId &&
          current.fieldId === nextHover.fieldId
        : current === null && nextHover === null;
    if (!same) {
      useCanvasStore.getState().setDescHover(nextHover);
    }

    // Hovering the action badge also highlights the authorized actors on the
    // canvas (stormActionHover drives the visual link layer).
    const currentAction = useCanvasStore.getState().actionHover;
    const sameAction =
      currentAction && nextActionHover
        ? currentAction.objectId === nextActionHover.objectId &&
          currentAction.action === nextActionHover.action
        : currentAction === null && nextActionHover === null;
    if (!sameAction) {
      useCanvasStore.getState().setActionHover(nextActionHover);
      useCanvasStore
        .getState()
        .setStormActionHover(nextActionHover ? nextActionHover.action : null);
    }

    const currentValidation = useCanvasStore.getState().validationHover;
    const sameValidation =
      currentValidation && nextValidationHover
        ? currentValidation.objectId === nextValidationHover.objectId &&
          currentValidation.fieldId === nextValidationHover.fieldId
        : currentValidation === null && nextValidationHover === null;
    if (!sameValidation) {
      useCanvasStore.getState().setValidationHover(nextValidationHover);
    }
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.invalidateContainerRect();
          this.app.renderer.resize(width, height);
          this.viewport.resize(width, height);
          this.invalidateAll();
        }
      }
    });
    this.resizeObserver.observe(this.container);
    window.addEventListener("resize", () => this.invalidateContainerRect());
    window.addEventListener(
      "scroll",
      () => this.invalidateContainerRect(),
      true,
    );
  }

  private setupStoreSubscription(): void {
    let prevObjects = useCanvasStore.getState().objects;
    let prevSelectedIds = useCanvasStore.getState().selectedIds;
    let prevTool = useCanvasStore.getState().tool;
    let prevGroups = useCanvasStore.getState().groups;
    let prevStormSelectedField = useCanvasStore.getState().stormSelectedField;
    let prevStormActionHover = useCanvasStore.getState().stormActionHover;
    let prevAIHighlightIds = useCanvasStore.getState().aiHighlightIds;
    let prevViewport = useCanvasStore.getState().viewport;

    this.storeUnsubscribe = useCanvasStore.subscribe((state) => {
      let contentChanged = false;

      if (state.objects !== prevObjects) {
        prevObjects = state.objects;
        this.syncSpatialIndexIncremental(state.objects);
        contentChanged = true;
      }

      if (state.selectedIds !== prevSelectedIds) {
        prevSelectedIds = state.selectedIds;
        contentChanged = true;
      }

      if (state.groups !== prevGroups) {
        prevGroups = state.groups;
        contentChanged = true;
      }

      if (state.stormSelectedField !== prevStormSelectedField) {
        prevStormSelectedField = state.stormSelectedField;
        contentChanged = true;
      }

      // Hovering an action badge toggles the authorized-actor highlights
      if (state.stormActionHover !== prevStormActionHover) {
        prevStormActionHover = state.stormActionHover;
        contentChanged = true;
      }

      // The AI pointing at objects toggles its own highlight ring
      if (state.aiHighlightIds !== prevAIHighlightIds) {
        prevAIHighlightIds = state.aiHighlightIds;
        contentChanged = true;
      }

      if (state.tool !== prevTool) {
        prevTool = state.tool;
        this.updateToolMode(state.tool);
        if (state.tool !== "connector") {
          this.cancelConnectorCreation();
        }
        if (state.tool !== "line") {
          this.cancelLineDrawing();
        }
      }

      if (state.viewport !== prevViewport) {
        const vp = state.viewport;
        prevViewport = vp;

        if (this.viewport) {
          const corner = this.viewport.corner;
          const currentZoom = this.viewport.scaled || 1;
          const zoomDiff = Math.abs(currentZoom - vp.zoom);
          const xDiff = Math.abs(corner.x - vp.x);
          const yDiff = Math.abs(corner.y - vp.y);

          if (zoomDiff > 0.001 || xDiff > 0.5 || yDiff > 0.5) {
            if (xDiff > 0.5 || yDiff > 0.5) {
              // Zoom first, then pan. moveCorner derives the screen position
              // from the current scale, so setting the corner before the zoom
              // leaves it scaled by oldZoom / newZoom and the target drifts
              // (this is what made focus_viewport / search jumps land off-center).
              this.viewport.setZoom(vp.zoom);
              this.viewport.moveCorner(vp.x, vp.y);
            } else {
              // Zoom changed only (e.g. Header Zoom buttons); keep center stable
              this.viewport.setZoom(vp.zoom, true);
            }
            // A camera-only change needs no content rebuild — re-cull and
            // refine the zoom-dependent rasterization (card text, group
            // labels, handle sizes).
            this.invalidateView();
            this.cardRefineDirty = true;
            this.scheduleRender();
            return;
          }
        }
      }

      if (contentChanged) {
        this.invalidateContent();
      }
    });
  }

  public syncSpatialIndex(): void {
    const objects = useCanvasStore.getState().objects;
    // Connectors are derived from their endpoint anchors and have no box of
    // their own, so they stay out of the card spatial index (hit-testing them
    // happens against their resolved elbow path instead). Freeform lines are
    // likewise hit-tested against their segment, not a bounding box.
    this.spatialIndex.load(
      objects.filter((o) => o.type !== "connector" && o.type !== "line"),
    );
    this.indexedGeometry.clear();
    for (const o of objects) {
      if (o.type === "connector" || o.type === "line") continue;
      this.indexedGeometry.set(o.id, {
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
      });
    }
  }

  /**
   * Keeps the spatial index in step with a new objects array without rebuilding
   * the whole RBush tree. Store updates are immutable, so an entry only needs
   * touching when its object reference — or its geometry — actually changed.
   */
  private syncSpatialIndexIncremental(objects: CanvasObject[]): void {
    const nextIds = new Set<string>();

    for (const obj of objects) {
      if (obj.type === "connector" || obj.type === "line") continue;
      nextIds.add(obj.id);

      const prev = this.indexedGeometry.get(obj.id);
      if (!prev) {
        this.spatialIndex.insert(obj);
      } else if (
        prev.x !== obj.x ||
        prev.y !== obj.y ||
        prev.width !== obj.width ||
        prev.height !== obj.height
      ) {
        this.spatialIndex.update(obj);
      } else {
        continue;
      }

      this.indexedGeometry.set(obj.id, {
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
      });
    }

    for (const id of this.indexedGeometry.keys()) {
      if (!nextIds.has(id)) {
        this.spatialIndex.remove(id);
        this.indexedGeometry.delete(id);
      }
    }
  }

  /**
   * The single paint pass. Runs at most once per animation frame; the dirty
   * flags decide how much of the scene has to be rebuilt:
   *
   * - view-only (pan/resize): grid + culling. Cards keep their geometry and
   *   styling; scrolling simply reveals/hides them.
   * - content (objects, selection, zoom): cards redraw their contents, plus
   *   connectors, groups, visual links and gizmos.
   */
  private flushRender(): void {
    if (!this.viewport || this.isDestroyed) return;

    const zoom = this.viewport.scaled || 1;

    // Text rasterization must follow the zoom level. During a wheel/pinch
    // gesture the zoom-settle timer keeps the last settled resolution (blur is
    // cheaper than re-rasterizing at every threshold) and refines once the
    // gesture stops. Any other zoom change — store-driven jumps like
    // focus_viewport, the zoom buttons or search jumps, which emit no "zoomed"
    // event — refines immediately, or the text would stay blurry at the old
    // resolution forever.
    const neededTextResolution = computeTextResolution(
      zoom,
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    if (
      this.zoomSettleTimer === null &&
      this.activeTextResolution !== neededTextResolution
    ) {
      this.cardRefineDirty = true;
    }
    if (this.cardRefineDirty && this.zoomSettleTimer === null) {
      this.activeTextResolution = neededTextResolution;
    }

    // Zoom does not force content: the camera matrix scales the existing scene
    // and the zoom-settle timer refines zoom-dependent rasterization once.
    const viewDirty = this.viewDirty;
    const contentDirty = this.contentDirty;
    const refineDirty = this.cardRefineDirty;

    this.viewDirty = false;
    this.contentDirty = false;

    const vb = this.viewport.getVisibleBounds();
    const visibleBounds = {
      left: vb.x,
      top: vb.y,
      right: vb.x + vb.width,
      bottom: vb.y + vb.height,
    };

    // 1. Grid follows the visible region.
    this.gridLayer.renderGrid(visibleBounds, zoom, this.app.renderer);

    // 2. Publish the camera once per frame (coalesced).
    if (viewDirty) {
      this.syncViewportToStore();
    }

    const { objects, selectedIds, groups, stormSelectedField } =
      useCanvasStore.getState();

    // 3. Cull cards, then render. A viewport-and-a-half of margin keeps
    // off-screen cards alive across small pans so they don't get destroyed and
    // re-rasterized every frame; only newly revealed cards are drawn.
    if (viewDirty || contentDirty || refineDirty) {
      const margin = Math.max(vb.width, vb.height) * 0.5;
      const visibleIds = new Set(
        this.spatialIndex.search({
          minX: visibleBounds.left - margin,
          minY: visibleBounds.top - margin,
          maxX: visibleBounds.right + margin,
          maxY: visibleBounds.bottom + margin,
        }),
      );
      const visibleObjects = objects.filter(
        (o) =>
          o.type !== "connector" &&
          o.type !== "line" &&
          visibleIds.has(o.id),
      );

      this.cardLayer.renderCards(
        visibleObjects,
        zoom,
        selectedIds,
        stormSelectedField,
        objects,
        this.activeTextResolution ?? neededTextResolution,
        !contentDirty && !refineDirty,
        // A content repaint restores everything at once (undo, export return);
        // view/refine frames trickle heavy re-rasterization across frames.
        contentDirty ? Infinity : CARD_DRAWS_PER_FRAME,
      );

      // Card drawing is budgeted — keep refining on the next frames instead of
      // blocking one long frame.
      this.cardRefineDirty = this.cardLayer.hasPendingDraws();
      if (this.cardRefineDirty) this.scheduleRender();
    }

    // 4. Connector, line and highlight geometry is world-space and rides on
    // the camera transform — only content changes rebuild it.
    if (contentDirty) {
      this.connectorLayer.renderConnectors(objects, groups, selectedIds);
      this.lineLayer.renderLines(objects, selectedIds);

      // Visual Link Layer (Real-time DCB highlights or Actor Hover highlights)
      const stormActionHover = useCanvasStore.getState().stormActionHover;
      const aiHighlightIds = useCanvasStore.getState().aiHighlightIds;
      const selectedStateCard = objects.find(
        (o) =>
          selectedIds.includes(o.id) &&
          o.type === "storm" &&
          (o.stormData?.kind === "state" || o.stormData?.kind === "constraint"),
      );

      if (stormActionHover) {
        const authorizedActors = getAuthorizedActors(objects, stormActionHover);
        this.visualLinkLayer.renderHighlights(authorizedActors);
      } else if (aiHighlightIds.length > 0) {
        // The AI is pointing at objects without selecting them.
        const aiHighlighted = objects.filter((o) =>
          aiHighlightIds.includes(o.id),
        );
        this.visualLinkLayer.renderHighlights(aiHighlighted, "ai");
      } else if (selectedStateCard) {
        const matchingIds = collectMatchingEventIds(objects, selectedStateCard);
        const matchingEvents = objects.filter((o) =>
          matchingIds.includes(o.id),
        );
        this.visualLinkLayer.renderHighlights(matchingEvents);
      } else {
        this.visualLinkLayer.clearHighlights();
      }

    }

    // 5. Group labels and selection handles depend on the zoom level, so they
    // are re-drawn when a zoom settles as well.
    if (contentDirty || refineDirty) {
      this.groupLayer.renderGroups(
        groups,
        objects,
        zoom,
        selectedIds,
        this.activeTextResolution ?? neededTextResolution,
      );

      // Selection gizmos for cards
      const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));
      this.gizmoLayer.renderSelection(selectedObjects, zoom);
    }
  }

  public async destroy(): Promise<void> {
    this.isDestroyed = true;

    if (this.zoomSettleTimer !== null) {
      clearTimeout(this.zoomSettleTimer);
      this.zoomSettleTimer = null;
    }
    if (this.hoverRaf !== null) {
      cancelAnimationFrame(this.hoverRaf);
      this.hoverRaf = null;
    }
    this.pendingHover = null;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }

    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch {
        // Ignore errors during cancel
      }
    }

    if (activePixiEngine === this) {
      setActivePixiEngine(null);
    }
    this.cleanupApp();
  }

  public async exportPng(options?: {
    scale?: number;
    padding?: number;
  }): Promise<Blob> {
    const objects = useCanvasStore.getState().objects;
    const groups = useCanvasStore.getState().groups;
    const bounds = computeCanvasBounds(objects, groups, options?.padding ?? 40);

    const prevGrid = this.gridLayer.visible;
    const prevGizmo = this.gizmoLayer.visible;
    const prevLink = this.visualLinkLayer.visible;

    this.gridLayer.visible = false;
    this.gizmoLayer.visible = false;
    this.visualLinkLayer.visible = false;

    const scale = options?.scale ?? 2;
    // Text is a pre-rasterized texture, so it must be rendered at the export's
    // device scale — `zoom` only captures the live camera, which is irrelevant
    // here. Without this, text is magnified from a low-res texture and looks
    // blurry at every export resolution.
    const textResolution = computeExportTextResolution(scale);

    // Render all cards, connectors and groups unculled. Cards may currently be
    // styled for the live selection/zoom, so force a full redraw for the export.
    this.cardLayer.invalidateAllCards();
    this.cardLayer.renderCards(
      objects,
      1,
      [],
      undefined,
      objects,
      textResolution,
    );
    this.connectorLayer.renderConnectors(objects, groups, []);
    this.lineLayer.renderLines(objects, []);
    this.groupLayer.renderGroups(groups, objects, 1, [], textResolution);

    const frame = new Rectangle(
      bounds.minX,
      bounds.minY,
      bounds.width,
      bounds.height,
    );

    try {
      const canvas = this.app.renderer.extract.canvas({
        target: this.viewport,
        frame,
        resolution: scale,
        // Match the on-screen board background instead of emitting a
        // transparent PNG, and keep vector edges smooth at the export scale.
        clearColor: "#f9fafb",
        antialias: true,
      });

      return await new Promise<Blob>((resolve, reject) => {
        const htmlCanvas = canvas as HTMLCanvasElement;
        if (typeof htmlCanvas.toBlob === "function") {
          htmlCanvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to generate image blob"));
          }, "image/png");
        } else if (
          "convertToBlob" in canvas &&
          typeof (canvas as OffscreenCanvas).convertToBlob === "function"
        ) {
          (canvas as OffscreenCanvas)
            .convertToBlob({ type: "image/png" })
            .then(resolve)
            .catch(reject);
        } else {
          reject(new Error("Canvas does not support blob extraction"));
        }
      });
    } finally {
      this.gridLayer.visible = prevGrid;
      this.gizmoLayer.visible = prevGizmo;
      this.visualLinkLayer.visible = prevLink;
      // Cards were just redrawn for the export; the next frame restores the
      // live selection/zoom styling.
      this.cardLayer.invalidateAllCards();
      this.render();
    }
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
}
