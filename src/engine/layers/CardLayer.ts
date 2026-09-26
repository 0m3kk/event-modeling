import { Container } from "pixi.js";
import type { CanvasObject } from "@/types";
import { Z_INDICES } from "@/constants/canvas";
import { computeTextResolution } from "../textResolution";
import {
  StormCardRenderer,
  ModelNodeRenderer,
  StickyNoteRenderer,
  TextBoxRenderer,
  type CardHitZone,
} from "../renderers";

export class CardLayer extends Container {
  private cardContainers: Map<string, Container> = new Map();
  private cardZones: Map<string, CardHitZone[]> = new Map();
  /** Cursor shown while hovering a card; driven by the active tool. */
  private cardCursor: string = "default";

  public onCardPointerDown?: (
    id: string,
    event: PointerEvent,
    zone: CardHitZone | null,
  ) => void;

  constructor() {
    super();
    this.zIndex = Z_INDICES.CARDS;
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
    selectedFieldId?: string,
  ): void {
    const currentIds = new Set(objects.map((o) => o.id));

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const textResolution = computeTextResolution(zoom, dpr);

    // Remove cards no longer in visible set
    for (const [id, container] of this.cardContainers.entries()) {
      if (!currentIds.has(id)) {
        this.removeChild(container);
        container.destroy({ children: true });
        this.cardContainers.delete(id);
        this.cardZones.delete(id);
      }
    }

    // Render or update each card
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

      // Update position
      card.x = obj.x;
      card.y = obj.y;

      const isSelected = selectedIds.includes(obj.id);

      // Delegate drawing to specialized renderers
      let result;
      if (obj.type === "storm") {
        result = StormCardRenderer.draw(
          card,
          obj,
          textResolution,
          isSelected,
          selectedFieldId,
        );
      } else if (obj.type === "model") {
        result = ModelNodeRenderer.draw(
          card,
          obj,
          textResolution,
          isSelected,
          selectedFieldId,
        );
      } else if (obj.type === "stickyNote") {
        result = StickyNoteRenderer.draw(card, obj, textResolution, isSelected);
      } else if (obj.type === "textBox") {
        result = TextBoxRenderer.draw(card, obj, textResolution, isSelected);
      }

      if (result) {
        this.cardZones.set(obj.id, result.hitZones);
        if (result.height && result.height !== obj.height) {
          obj.height = result.height;
        }
      }
    }
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
    super.destroy(options);
  }
}
