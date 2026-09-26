import RBush from "rbush";

export interface SpatialBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SpatialItem extends SpatialBounds {
  id: string;
}

export interface ObjectGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class SpatialIndex {
  private tree: RBush<SpatialItem>;
  private itemMap: Map<string, SpatialItem>;

  constructor() {
    this.tree = new RBush<SpatialItem>();
    this.itemMap = new Map<string, SpatialItem>();
  }

  private toSpatialItem(obj: ObjectGeometry): SpatialItem {
    const minX = Math.min(obj.x, obj.x + obj.width);
    const maxX = Math.max(obj.x, obj.x + obj.width);
    const minY = Math.min(obj.y, obj.y + obj.height);
    const maxY = Math.max(obj.y, obj.y + obj.height);

    return {
      id: obj.id,
      minX,
      minY,
      maxX,
      maxY,
    };
  }

  public insert(obj: ObjectGeometry): void {
    const existing = this.itemMap.get(obj.id);
    if (existing) {
      this.update(obj);
      return;
    }
    const item = this.toSpatialItem(obj);
    this.itemMap.set(obj.id, item);
    this.tree.insert(item);
  }

  public update(obj: ObjectGeometry): void {
    const existing = this.itemMap.get(obj.id);
    if (existing) {
      this.tree.remove(existing, (a, b) => a.id === b.id);
    }
    const newItem = this.toSpatialItem(obj);
    this.itemMap.set(obj.id, newItem);
    this.tree.insert(newItem);
  }

  public remove(id: string): void {
    const existing = this.itemMap.get(id);
    if (!existing) return;
    this.tree.remove(existing, (a, b) => a.id === b.id);
    this.itemMap.delete(id);
  }

  public load(objects: ObjectGeometry[]): void {
    this.clear();
    const items = objects.map((obj) => {
      const item = this.toSpatialItem(obj);
      this.itemMap.set(obj.id, item);
      return item;
    });
    this.tree.load(items);
  }

  public clear(): void {
    this.tree.clear();
    this.itemMap.clear();
  }

  public search(bbox: SpatialBounds): string[] {
    const results = this.tree.search(bbox);
    return results.map((item) => item.id);
  }

  public searchItems(bbox: SpatialBounds): SpatialItem[] {
    return this.tree.search(bbox);
  }

  public get(id: string): SpatialItem | undefined {
    return this.itemMap.get(id);
  }

  public all(): SpatialItem[] {
    return this.tree.all();
  }

  public get size(): number {
    return this.itemMap.size;
  }
}
