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
  type AnchorMarker,
} from "./layers/ElbowConnectorLayer";
import { VisualLinkLayer } from "./layers/VisualLinkLayer";
import { CardLayer } from "./layers/CardLayer";
import { GizmoLayer, type MarqueeBox } from "./layers/GizmoLayer";
import { useCanvasStore, type ActionTarget, type DescTarget } from "@/store";
import { calculateSnapping } from "@/utils/snapping";
import { MIN_ZOOM, MAX_ZOOM, CONNECTOR_HIT_SLOP } from "@/constants/canvas";
import {
  getAllCardinalAnchors,
  findClosestAnchor,
  distanceToPolyline,
} from "@/utils/elbowRouting";
import { collectMatchingEventIds } from "@/utils/stormQuery";
import { getAuthorizedActors } from "@/utils/stormAuth";
import { computeCanvasBounds } from "@/utils/imageExport";
import type { CardHitZone } from "./renderers";
import type { CanvasObject } from "@/types";

let activePixiEngine: PixiEngine | null = null;

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
  public visualLinkLayer: VisualLinkLayer;
  public cardLayer: CardLayer;
  public gizmoLayer: GizmoLayer;

  // Container element
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private storeUnsubscribe: (() => void) | null = null;
  private isDestroyed: boolean = false;
  private initPromise: Promise<void> | null = null;

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
  private initialObjectPositions: Map<string, { x: number; y: number }> =
    new Map();
  private primaryDragId: string | null = null;
  private marqueeStartWorld: { x: number; y: number } = { x: 0, y: 0 };
  private cardPointerDownHandled: boolean = false;

  // Connector Creation State — armed by clicking the source anchor, completed
  // by clicking the target anchor (no drag / button-hold required).
  private isCreatingConnector: boolean = false;
  private connectorStartAnchor: AnchorMarker | null = null;

  // Group Dragging & Click State
  private isDraggingGroup: boolean = false;
  private draggedGroupId: string | null = null;
  private lastGroupClickTime: number = 0;
  private lastGroupClickId: string | null = null;

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
      this.viewport.addChild(this.visualLinkLayer);
      this.viewport.addChild(this.cardLayer);
      this.viewport.addChild(this.gizmoLayer);

      // Sync viewport position with store initial state
      const { viewport: savedVp, tool } = useCanvasStore.getState();
      this.viewport.moveCorner(savedVp.x, savedVp.y);
      this.viewport.setZoom(savedVp.zoom);

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
      this.render();
    })();

    return this.initPromise;
  }

  private setupViewportEvents(): void {
    this.viewport.on("moved", () => {
      this.syncViewportToStore();
      this.render();
    });

    this.viewport.on("zoomed", () => {
      this.syncViewportToStore();
      this.render();
    });
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
    } else if (tool === "connector") {
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

  private createConnector(start: AnchorMarker, end: AnchorMarker): void {
    const id = `connector-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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
        stroke: "#475569",
        strokeWidth: 2,
        arrowEnd: true,
      },
    };
    useCanvasStore.getState().addObject(newConnector);
    useCanvasStore.getState().setTool("select");
  }

  /** Clears a pending connector (source picked, destination not yet chosen). */
  public cancelConnectorCreation(): void {
    this.isCreatingConnector = false;
    this.connectorStartAnchor = null;
    this.connectorLayer.renderPreview(null);
    this.connectorLayer.renderAnchors([]);
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
      if (obj.type === "connector" || !candidateIds.has(obj.id)) continue;
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
    const { objects, groups } = useCanvasStore.getState();
    const threshold = CONNECTOR_HIT_SLOP / (this.viewport.scaled || 1);
    const point = { x: worldX, y: worldY };

    let best: CanvasObject | null = null;
    let bestDist = threshold;

    // Later connectors paint on top → scan backwards so the topmost wins.
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i]!;
      if (obj.type !== "connector") continue;
      const points = this.connectorLayer.getConnectorPoints(
        obj,
        objects,
        groups,
      );
      if (!points) continue;

      const dist = distanceToPolyline(point, points);
      if (dist <= bestDist) {
        bestDist = dist;
        best = obj;
      }
    }

    return best;
  }

  private setupInteractionHandlers(): void {
    // Card pointerdown handler
    this.cardLayer.onCardPointerDown = (id: string, e: PointerEvent, zone) => {
      const state = useCanvasStore.getState();
      if (this.isSpaceHeld) return;

      // In connector tool mode, anchors handle connections
      if (state.tool === "connector") return;

      this.cardPointerDownHandled = true;

      const obj = state.objects.find((o) => o.id === id);
      if (!obj) return;

      // Calculate precise local coordinates inside the card
      const rect = this.container.getBoundingClientRect();
      const worldPos = this.viewport.toWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      const localX = worldPos.x - obj.x;
      const localY = worldPos.y - obj.y;
      const accurateZone =
        this.cardLayer.getHitZoneAt(id, localX, localY) || zone;

      // Click on type zone opens type selector
      if (
        accurateZone?.type === "fieldType" ||
        accurateZone?.type === "itemType" ||
        accurateZone?.type === "innerType"
      ) {
        state.selectObject(id);
        state.setStormSelectedField({
          objectId: id,
          fieldId: accurateZone.fieldId,
        });
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

      // Single-click row selection
      if (
        accurateZone?.type === "fieldName" ||
        accurateZone?.type === "fieldTag" ||
        accurateZone?.type === "enumValue" ||
        accurateZone?.type === "queryItem" ||
        accurateZone?.type === "constraint"
      ) {
        state.setStormSelectedField({
          objectId: id,
          fieldId:
            accurateZone.fieldId ||
            accurateZone.valueId ||
            accurateZone.queryItemId ||
            accurateZone.constraintId,
        });
      } else {
        state.setStormSelectedField(null);
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
    });

    // Double-click handling uses the browser's native dblclick so it never
    // races with the clicks that select a card/row. Hit-tests the card under
    // the pointer and opens the matching inline editor (header title, field /
    // enum value name, query item, constraint, sticky or text box).
    canvas.addEventListener("dblclick", (e: MouseEvent) => {
      const state = useCanvasStore.getState();
      if (this.isSpaceHeld) return;
      if (state.tool === "connector" || state.isLocked) return;
      if (e.target !== canvas) return;

      const rect = this.container.getBoundingClientRect();
      const worldPos = this.viewport.toWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      const hit = this.findCardZoneAtWorld(worldPos.x, worldPos.y);
      if (!hit) return;
      const { obj, zone } = hit;

      // Description ⓘ icons are not edited inline — the options-bar panel
      // handles both the card and the selected row. Type zones and the action
      // badge are also not edited here.
      if (
        zone?.type === "desc" ||
        zone?.type === "fieldType" ||
        zone?.type === "itemType" ||
        zone?.type === "innerType" ||
        zone?.type === "action"
      ) {
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
      if (this.isSpaceHeld) {
        this.container.style.cursor = "grabbing";
        this.cardLayer.setCursor("grabbing");
        return;
      }

      const rect = this.container.getBoundingClientRect();
      const worldPos = this.viewport.toWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );

      // 1. Connector Tool Mode — click the source anchor, then click the target
      // anchor. The connection is a two-click interaction, so the left mouse
      // button does not need to be held between the two anchors.
      if (state.tool === "connector") {
        if (!this.isCreatingConnector) {
          const hitAnchor = findClosestAnchor(
            worldPos,
            this.collectAllAnchors(),
            25,
          );
          if (hitAnchor) {
            this.isCreatingConnector = true;
            this.connectorStartAnchor = hitAnchor;
            this.connectorLayer.renderPreview({
              start: hitAnchor,
              currentPoint: { ...worldPos },
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

        // Second click: complete at the target anchor. A click that misses
        // every anchor cancels the pending connection.
        const targetAnchor = findClosestAnchor(
          worldPos,
          this.getConnectorTargetAnchors(),
          25,
        );
        if (this.connectorStartAnchor && targetAnchor) {
          this.createConnector(this.connectorStartAnchor, targetAnchor);
        }
        this.cancelConnectorCreation();
        return;
      }

      // If a card is under the pointer, a card handler owns this event —
      // regardless of whether it ran before or after this native listener.
      if (this.findCardZoneAtWorld(worldPos.x, worldPos.y)) {
        return;
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

        // Select and prepare to drag the group
        state.selectGroup(hitGroup.group.id);
        this.isDraggingGroup = true;
        this.draggedGroupId = hitGroup.group.id;
        this.dragStartWorld = { x: worldPos.x, y: worldPos.y };
        return;
      }

      // 4. Clicked on empty space
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
      const rect = this.container.getBoundingClientRect();
      const worldPos = this.viewport.toWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );

      const state = useCanvasStore.getState();

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
          this.syncViewportToStore();
          this.render();
          return;
        }
      }

      // Handle Group Dragging
      if (this.isDraggingGroup && this.draggedGroupId) {
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

          // Target boxes for magnetic alignment
          const selectedIds = useCanvasStore.getState().selectedIds;
          const otherBoxes = useCanvasStore
            .getState()
            .objects.filter(
              (o) => !selectedIds.includes(o.id) && o.type !== "connector",
            )
            .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));

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
        if (this.marqueeInitialSelectedIds.length > 0) {
          const merged = Array.from(
            new Set([...this.marqueeInitialSelectedIds, ...hits]),
          );
          useCanvasStore.getState().setSelectedIds(merged);
        } else {
          useCanvasStore.getState().setSelectedIds(hits);
        }
      }

      // Description ⓘ / authorization-action hover tooltips — only while idle
      // on the select tool.
      const isBusy =
        this.isDraggingCards ||
        this.isDraggingGroup ||
        this.isMarqueeDragging ||
        this.isCreatingConnector ||
        this.isPanningCanvas;
      let nextHover: DescTarget | null = null;
      let nextActionHover: ActionTarget | null = null;
      if (
        !isBusy &&
        !this.isSpaceHeld &&
        state.tool === "select" &&
        e.target === this.app.canvas
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
    });

    window.addEventListener("pointerup", () => {
      this.cardPointerDownHandled = false;

      if (this.isSpaceHeld) {
        this.container.style.cursor = "grab";
        this.cardLayer.setCursor("grab");
      }

      // Finish Canvas Panning
      if (this.isPanningCanvas) {
        if (!this.hasPannedCanvas) {
          // User clicked on empty space without dragging -> clear selection
          useCanvasStore.getState().clearSelection();
        }
        this.isPanningCanvas = false;
        this.hasPannedCanvas = false;
        if (!this.isSpaceHeld) {
          this.container.style.cursor = "default";
          this.cardLayer.setCursor("default");
        }
      }

      // Connector creation is a two-click interaction finished on the next
      // pointerdown, so pointerup only releases the other drag states.

      // Finish Group Dragging
      if (this.isDraggingGroup) {
        this.isDraggingGroup = false;
        this.draggedGroupId = null;
      }

      // Finish Card Dragging
      if (this.isDraggingCards) {
        this.isDraggingCards = false;
        this.primaryDragId = null;
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
    });
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.app.renderer.resize(width, height);
          this.viewport.resize(width, height);
          this.syncViewportToStore();
          this.render();
        }
      }
    });
    this.resizeObserver.observe(this.container);
  }

  private setupStoreSubscription(): void {
    let prevObjects = useCanvasStore.getState().objects;
    let prevSelectedIds = useCanvasStore.getState().selectedIds;
    let prevTool = useCanvasStore.getState().tool;
    let prevGroups = useCanvasStore.getState().groups;
    let prevStormSelectedField = useCanvasStore.getState().stormSelectedField;
    let prevStormActionHover = useCanvasStore.getState().stormActionHover;
    let prevViewport = useCanvasStore.getState().viewport;

    this.storeUnsubscribe = useCanvasStore.subscribe((state) => {
      let needsRender = false;

      if (state.objects !== prevObjects) {
        prevObjects = state.objects;
        this.syncSpatialIndex();
        needsRender = true;
      }

      if (state.selectedIds !== prevSelectedIds) {
        prevSelectedIds = state.selectedIds;
        needsRender = true;
      }

      if (state.groups !== prevGroups) {
        prevGroups = state.groups;
        needsRender = true;
      }

      if (state.stormSelectedField !== prevStormSelectedField) {
        prevStormSelectedField = state.stormSelectedField;
        needsRender = true;
      }

      // Hovering an action badge toggles the authorized-actor highlights
      if (state.stormActionHover !== prevStormActionHover) {
        prevStormActionHover = state.stormActionHover;
        needsRender = true;
      }

      if (state.tool !== prevTool) {
        prevTool = state.tool;
        this.updateToolMode(state.tool);
        if (state.tool !== "connector") {
          this.cancelConnectorCreation();
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
              this.viewport.moveCorner(vp.x, vp.y);
              this.viewport.setZoom(vp.zoom);
            } else {
              // Zoom changed only (e.g. Header Zoom buttons); keep center stable
              this.viewport.setZoom(vp.zoom, true);
              this.syncViewportToStore();
            }
            needsRender = true;
          }
        }
      }

      if (needsRender) {
        this.render();
      }
    });
  }

  public syncSpatialIndex(): void {
    const objects = useCanvasStore.getState().objects;
    // Connectors are derived from their endpoint anchors and have no box of
    // their own, so they stay out of the card spatial index (hit-testing them
    // happens against their resolved elbow path instead).
    this.spatialIndex.load(objects.filter((o) => o.type !== "connector"));
  }

  public render(): void {
    if (!this.viewport) return;

    const vb = this.viewport.getVisibleBounds();
    const visibleBounds = {
      left: vb.x,
      top: vb.y,
      right: vb.x + vb.width,
      bottom: vb.y + vb.height,
    };
    const zoom = this.viewport.scaled;

    // 1. Grid
    this.gridLayer.renderGrid(visibleBounds, zoom);

    // 2. Spatial Culling for Cards
    const visibleIds = new Set(
      this.spatialIndex.search({
        minX: visibleBounds.left - 50,
        minY: visibleBounds.top - 50,
        maxX: visibleBounds.right + 50,
        maxY: visibleBounds.bottom + 50,
      }),
    );

    const { objects, selectedIds, groups, stormSelectedField } =
      useCanvasStore.getState();
    const visibleObjects = objects.filter((o) => visibleIds.has(o.id));

    // 3. Render Cards
    this.cardLayer.renderCards(
      visibleObjects,
      zoom,
      selectedIds,
      stormSelectedField?.fieldId,
    );

    // 4. Render Connectors & Groups
    this.connectorLayer.renderConnectors(objects, groups, selectedIds);
    this.groupLayer.renderGroups(groups, objects, zoom, selectedIds);

    // 5. Visual Link Layer (Real-time DCB highlights or Actor Hover highlights)
    const stormActionHover = useCanvasStore.getState().stormActionHover;
    const selectedStateCard = objects.find(
      (o) =>
        selectedIds.includes(o.id) &&
        o.type === "storm" &&
        (o.stormData?.kind === "state" || o.stormData?.kind === "constraint"),
    );

    if (stormActionHover) {
      const authorizedActors = getAuthorizedActors(objects, stormActionHover);
      this.visualLinkLayer.renderHighlights(authorizedActors);
    } else if (selectedStateCard) {
      const matchingIds = collectMatchingEventIds(objects, selectedStateCard);
      const matchingEvents = objects.filter((o) => matchingIds.includes(o.id));
      this.visualLinkLayer.renderHighlights(matchingEvents);
    } else {
      this.visualLinkLayer.clearHighlights();
    }

    // 6. Render Selection Gizmos for Cards
    const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));
    this.gizmoLayer.renderSelection(selectedObjects);
  }

  public async destroy(): Promise<void> {
    this.isDestroyed = true;

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

    // Render all cards, connectors and groups unculled
    this.cardLayer.renderCards(objects, 1, []);
    this.connectorLayer.renderConnectors(objects, groups, []);
    this.groupLayer.renderGroups(groups, objects, 1, []);

    const scale = options?.scale ?? 2;
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
