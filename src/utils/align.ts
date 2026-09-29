import type { CanvasObject } from "@/types";

export type AlignDirection =
  "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

export type DistributeDirection = "horizontal" | "vertical";

export interface ObjectUpdate {
  id: string;
  changes: Partial<CanvasObject>;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isAlignable(obj: CanvasObject): boolean {
  if (obj.locked) return false;
  if (obj.type === "connector") return false;
  if (obj.type === "line") return false;
  return true;
}

export function getObjectBounds(obj: CanvasObject): Bounds {
  return {
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
  };
}

export function alignObjects(
  objects: CanvasObject[],
  direction: AlignDirection,
): ObjectUpdate[] {
  const targets = objects.filter(isAlignable);
  if (targets.length < 2) return [];

  const boundsList = targets.map((obj) => ({
    obj,
    bounds: getObjectBounds(obj),
  }));

  const minX = Math.min(...boundsList.map((b) => b.bounds.x));
  const minY = Math.min(...boundsList.map((b) => b.bounds.y));
  const maxX = Math.max(...boundsList.map((b) => b.bounds.x + b.bounds.width));
  const maxY = Math.max(...boundsList.map((b) => b.bounds.y + b.bounds.height));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const updates: ObjectUpdate[] = [];
  for (const { obj, bounds } of boundsList) {
    let dx = 0;
    let dy = 0;
    switch (direction) {
      case "left":
        dx = minX - bounds.x;
        break;
      case "centerX":
        dx = centerX - (bounds.x + bounds.width / 2);
        break;
      case "right":
        dx = maxX - (bounds.x + bounds.width);
        break;
      case "top":
        dy = minY - bounds.y;
        break;
      case "centerY":
        dy = centerY - (bounds.y + bounds.height / 2);
        break;
      case "bottom":
        dy = maxY - (bounds.y + bounds.height);
        break;
    }
    if (dx !== 0 || dy !== 0) {
      updates.push({
        id: obj.id,
        changes: {
          x: obj.x + dx,
          y: obj.y + dy,
        },
      });
    }
  }
  return updates;
}

export function distributeObjects(
  objects: CanvasObject[],
  direction: DistributeDirection,
): ObjectUpdate[] {
  const targets = objects.filter(isAlignable);
  if (targets.length < 3) return [];

  const horizontal = direction === "horizontal";
  const boundsList = targets
    .map((obj) => ({ obj, bounds: getObjectBounds(obj) }))
    .sort((a, b) =>
      horizontal ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y,
    );

  const first = boundsList[0]!.bounds;
  const last = boundsList[boundsList.length - 1]!.bounds;
  const spanStart = horizontal ? first.x : first.y;
  const spanEnd = horizontal ? last.x + last.width : last.y + last.height;
  const totalSize = boundsList.reduce(
    (sum, b) => sum + (horizontal ? b.bounds.width : b.bounds.height),
    0,
  );
  const gap = (spanEnd - spanStart - totalSize) / (boundsList.length - 1);

  const updates: ObjectUpdate[] = [];
  let cursor = spanStart;
  for (const { obj, bounds } of boundsList) {
    const current = horizontal ? bounds.x : bounds.y;
    const delta = cursor - current;
    if (delta !== 0) {
      updates.push({
        id: obj.id,
        changes: horizontal ? { x: obj.x + delta } : { y: obj.y + delta },
      });
    }
    cursor += (horizontal ? bounds.width : bounds.height) + gap;
  }
  return updates;
}
