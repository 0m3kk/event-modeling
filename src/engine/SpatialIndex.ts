import RBush from "rbush";
import type { CanvasElement, Point, Rect } from "@/types";
import { orderForRender } from "@/tools/sliceCard/layout";

interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  /** Render order; a higher value is drawn on top. */
  order: number;
}

export class SpatialIndex {
  private tree = new RBush<SpatialItem>();
  private itemsById = new Map<string, SpatialItem>();

  clear() {
    this.tree.clear();
    this.itemsById.clear();
  }

  rebuild(elements: CanvasElement[]) {
    this.clear();
    // Index in render order (slices before their cards) so hit-testing can pick
    // the top-most element without relying on rbush's internal ordering.
    const ordered = orderForRender(elements);
    const items: SpatialItem[] = ordered.map((el, index) => ({
      minX: el.x,
      minY: el.y,
      maxX: el.x + el.width,
      maxY: el.y + el.height,
      id: el.id,
      order: index,
    }));

    for (const item of items) {
      this.itemsById.set(item.id, item);
    }
    this.tree.load(items);
  }

  searchRect(rect: Rect): string[] {
    const minX = rect.width < 0 ? rect.x + rect.width : rect.x;
    const maxX = rect.width < 0 ? rect.x : rect.x + rect.width;
    const minY = rect.height < 0 ? rect.y + rect.height : rect.y;
    const maxY = rect.height < 0 ? rect.y : rect.y + rect.height;

    const results = this.tree.search({ minX, minY, maxX, maxY });
    return results.map((r) => r.id);
  }

  hitTest(point: Point): string | null {
    const results = this.tree.search({
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    });

    if (results.length === 0) return null;

    // Return the top-most item (highest render order).
    let top = results[0];
    for (const item of results) {
      if (item.order > top.order) top = item;
    }
    return top.id;
  }
}
