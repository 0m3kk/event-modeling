import RBush from "rbush";
import type { CanvasElement, Point, Rect } from "@/types";

interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
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
    const items: SpatialItem[] = elements.map((el) => ({
      minX: el.x,
      minY: el.y,
      maxX: el.x + el.width,
      maxY: el.y + el.height,
      id: el.id,
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
    // Return the last one (drawn on top)
    return results[results.length - 1].id;
  }
}
