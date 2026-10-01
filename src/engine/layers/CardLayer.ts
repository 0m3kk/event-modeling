import { Container } from "pixi.js";
import type { CanvasObject } from "@/types";
import { Z_INDICES } from "@/constants/canvas";
import { computeTextResolution } from "../textResolution";
import { buildModelMap } from "@/utils/modelResolution";
import {
  StormCardRenderer,
  ModelNodeRenderer,
  StickyNoteRenderer,
  TextBoxRenderer,
  type CardHitZone,
} from "../renderers";

/**
 * How many cards may be fully (re)drawn in one frame. Drawing a card
 * re-rasterizes every one of its Text nodes, so a zoom refine or a burst of
 * newly revealed cards is spread over a few frames instead of blocking one.
 */
export const CARD_DRAWS_PER_FRAME = 6;

export class CardLayer extends Container {
  private cardContainers: Map<string, Container> = new Map();
  private cardZones: Map<string, CardHitZone[]> = new Map();
  /**
   * Signature of the inputs each card was last drawn with. When it is unchanged
   * the card keeps its existing Text/Graphics children — a move only needs to
   * reposition the container, not re-rasterize every label.
   */
  private cardDrawKeys: Map<string, string> = new Map();
  /** Cursor shown while hovering a card; driven by the active tool. */
  private cardCursor: string = "default";
  /** Set when the draw budget cut a render short; the caller refines next frame. */
  private pendingDraws: boolean = false;

  // Stable identity tokens for storm/model data objects. Store updates replace
  // these objects on edit, so an identity change is exactly a content change.
  private dataTokens: WeakMap<object, number> = new WeakMap();
  private nextDataToken: number = 0;

  // Model lookup + fingerprint keyed by the source array reference. Pan frames
  // pass the same `allObjects`, so the O(all) map build is skipped entirely.
  private modelsCache: {
    source: CanvasObject[];
    map: ReturnType<typeof buildModelMap>;
    key: string;
  } | null = null;

  public onCardPointerDown?: (
    id: string,
    event: PointerEvent,
    zone: CardHitZone | null,
  ) => void;

  constructor() {
    super();
    this.zIndex = Z_INDICES.CARDS;
  }

  private tokenFor(data: object | undefined): number {
    if (!data) return 0;
    let token = this.dataTokens.get(data);
    if (token === undefined) {
      token = ++this.nextDataToken;
      this.dataTokens.set(data, token);
    }
    return token;
  }

  /**
   * Fingerprint of every model object's data. Field type pills resolve their
   * styling from other cards, so a model edit must still invalidate the cards
   * referencing it — without rebuilding the whole card set.
   */
  private computeModelsKey(objects: CanvasObject[]): string {
    let key = "";
    for (const obj of objects) {
      if (obj.type !== "model") continue;
      key += `${obj.id}:${this.tokenFor(obj.modelData)}:${obj.modelData?.name ?? ""};`;
    }
    return key;
  }

  /**
   * Forces the next render to redraw every card. Used by export, which needs
   * an unculled, unselected snapshot regardless of cached draw state.
   */
  public invalidateAllCards(): void {
    this.cardDrawKeys.clear();
  }

  /**
   * Sets the hover cursor for every card (existing and future). Keeps the
   * cursor consistent with the active tool — e.g. an arrow on the select tool,
   * grab on the hand tool — instead of always showing a pointer.
   */
  public setCursor(cursor: string): void {
    this.cardCursor = cursor;
    for (const container of this.cardContainers.values()) {
      container.cursor = cursor;
    }
  }

  public renderCards(
    objects: CanvasObject[],
    zoom: number = 1,
    selectedIds: string[] = [],
    selectedField?: string | { objectId: string; fieldId?: string } | null,
    allObjects: CanvasObject[] = objects,
    textResolutionOverride?: number,
    geometryOnly: boolean = false,
    maxDraws: number = Infinity,
  ): void {
    this.pendingDraws = false;
    const currentIds = new Set(objects.map((o) => o.id));

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    // Export supplies an explicit resolution because it rasterizes into a
    // RenderTexture whose resolution is independent of the device pixel ratio.
    const textResolution =
      textResolutionOverride ?? computeTextResolution(zoom, dpr);

    // Remove cards no longer in visible set
    for (const [id, container] of this.cardContainers.entries()) {
      if (!currentIds.has(id)) {
        this.removeChild(container);
        container.destroy({ children: true });
        this.cardContainers.delete(id);
        this.cardZones.delete(id);
        this.cardDrawKeys.delete(id);
      }
    }

    if (objects.length === 0) return;

    // Model lookup is built from every object — not just the visible ones — so
    // a card styles its field pills correctly even when the model it points at
    // is off-screen, and so the key below stays stable while panning.
    let modelsCache = this.modelsCache;
    if (modelsCache?.source !== allObjects) {
      modelsCache = {
        source: allObjects,
        map: buildModelMap(allObjects),
        key: this.computeModelsKey(allObjects),
      };
      this.modelsCache = modelsCache;
    }
    const modelsMap = modelsCache.map;
    const modelsKey = modelsCache.key;

    // Render or update each card
    let draws = 0;
    for (const obj of objects) {
      if (obj.type === "connector") continue;

      let card = this.cardContainers.get(obj.id);
      if (!card) {
        card = new Container();
        card.eventMode = "static";
        card.cursor = this.cardCursor;

        card.on("pointerdown", (e) => {
          const native = e.nativeEvent as PointerEvent;
          const localPos = card!.toLocal(e.global);
          const zone = this.getHitZoneAt(obj.id, localPos.x, localPos.y);

          if (this.onCardPointerDown) {
            this.onCardPointerDown(obj.id, native, zone);
          }
        });

        this.addChild(card);
        this.cardContainers.set(obj.id, card);
      }

      // Moving a card is just a transform change — no need to redraw it.
      card.x = obj.x;
      card.y = obj.y;

      // View-only frames (pan) cannot change anything else about an already
      // drawn card — skip the draw-key work; newly revealed cards fall through.
      if (geometryOnly && this.cardDrawKeys.has(obj.id)) continue;

      const isSelected = selectedIds.includes(obj.id);
      const cardSelectedFieldId =
        typeof selectedField === "string"
          ? selectedField
          : selectedField?.objectId === obj.id
            ? selectedField.fieldId
            : undefined;

      // Everything the renderers read, folded into one signature. Only when it
      // changes do we throw away and rebuild the card's children.
      const drawKey = [
        textResolution,
        isSelected ? 1 : 0,
        cardSelectedFieldId ?? "",
        obj.width,
        obj.type,
        obj.text ?? "",
        obj.fill ?? "",
        obj.stroke ?? "",
        obj.referenceId ?? "",
        obj.type === "storm"
          ? this.tokenFor(obj.stormData)
          : obj.type === "model"
            ? this.tokenFor(obj.modelData)
            : 0,
        modelsKey,
      ].join("|");

      if (this.cardDrawKeys.get(obj.id) === drawKey) continue;

      // Drawing re-rasterizes every Text of the card — cap it per frame and let
      // the remaining cards follow on the next ones.
      if (draws >= maxDraws) {
        this.pendingDraws = true;
        continue;
      }
      draws++;

      // Delegate drawing to specialized renderers
      let result;
      if (obj.type === "storm") {
        result = StormCardRenderer.draw(
          card,
          obj,
          textResolution,
          isSelected,
          cardSelectedFieldId,
          modelsMap,
        );
      } else if (obj.type === "model") {
        result = ModelNodeRenderer.draw(
          card,
          obj,
          textResolution,
          isSelected,
          cardSelectedFieldId,
          modelsMap,
        );
      } else if (obj.type === "stickyNote") {
        result = StickyNoteRenderer.draw(card, obj, textResolution, isSelected);
      } else if (obj.type === "textBox") {
        result = TextBoxRenderer.draw(card, obj, textResolution, isSelected);
      }

      this.cardDrawKeys.set(obj.id, drawKey);

      if (result) {
        this.cardZones.set(obj.id, result.hitZones);
        if (result.height && result.height !== obj.height) {
          obj.height = result.height;
        }
      }
    }
  }

  /** True when the draw budget left cards undrawn; render again next frame. */
  public hasPendingDraws(): boolean {
    return this.pendingDraws;
  }

  public getHitZoneAt(
    id: string,
    localX: number,
    localY: number,
  ): CardHitZone | null {
    const zones = this.cardZones.get(id);
    if (!zones) return null;

    // Search in reverse order so top-most elements hit first
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (
        localX >= z.bounds.x &&
        localX <= z.bounds.x + z.bounds.width &&
        localY >= z.bounds.y &&
        localY <= z.bounds.y + z.bounds.height
      ) {
        return z;
      }
    }
    return null;
  }

  public getCardHitZones(id: string): CardHitZone[] {
    return this.cardZones.get(id) || [];
  }

  public override destroy(
    options?: boolean | import("pixi.js").DestroyOptions,
  ): void {
    for (const container of this.cardContainers.values()) {
      container.destroy({ children: true });
    }
    this.cardContainers.clear();
    this.cardZones.clear();
    this.cardDrawKeys.clear();
    super.destroy(options);
  }
}
