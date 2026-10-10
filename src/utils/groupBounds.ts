import type { CanvasObject, GroupBounds, GroupInfo } from "@/types";
import { getLineMidpoint, normalizeLineGeometry } from "./lineGeometry";

/** Padding between a group's boundary and its contents, in world units. */
export const GROUP_PADDING = 24;

/**
 * Tight, unpadded bounds around a set of member objects, ignoring connectors.
 * Returns `null` when there is nothing measurable.
 */
export function getObjectUnionBounds(
  objects: CanvasObject[],
): GroupBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasContent = false;

  for (const obj of objects) {
    if (obj.type === "connector") continue;
    hasContent = true;
    minX = Math.min(minX, obj.x);
    minY = Math.min(minY, obj.y);
    maxX = Math.max(maxX, obj.x + obj.width);
    maxY = Math.max(maxY, obj.y + obj.height);
  }

  if (!hasContent) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Free (ungrouped, unlocked) lines whose midpoint falls inside `bounds`. These
 * are the layer separators drawn across a section, so grouping that section
 * should adopt them — the frame then encloses them and they move with it.
 */
export function findAdoptableLines(
  objects: CanvasObject[],
  bounds: GroupBounds,
): CanvasObject[] {
  return objects.filter((obj) => {
    if (obj.type !== "line" || obj.groupId || obj.locked) return false;
    const mid = getLineMidpoint(obj);
    if (!mid) return false;
    return (
      mid.x >= bounds.x &&
      mid.x <= bounds.x + bounds.width &&
      mid.y >= bounds.y &&
      mid.y <= bounds.y + bounds.height
    );
  });
}

/**
 * Tight bounds that enclose a group's member objects and child groups,
 * ignoring the group's own cached `customBounds`.
 *
 * Child groups contribute their current `customBounds` when present so nested
 * layouts stay stable; otherwise they are measured recursively. Returns
 * `null` when the group has no measurable content.
 */
export function computeGroupContentBounds(
  group: GroupInfo,
  objects: CanvasObject[],
  groups: GroupInfo[],
  seen: Set<string> = new Set(),
): GroupBounds | null {
  if (seen.has(group.id)) return null;
  seen.add(group.id);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasContent = false;

  const include = (x: number, y: number, width: number, height: number) => {
    hasContent = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  };

  for (const obj of objects) {
    if (obj.groupId !== group.id || obj.type === "connector") continue;
    include(obj.x, obj.y, obj.width, obj.height);
  }

  for (const child of groups) {
    if (child.parentId !== group.id) continue;
    const childBounds =
      child.customBounds ??
      computeGroupContentBounds(child, objects, groups, seen);
    if (childBounds) {
      include(
        childBounds.x,
        childBounds.y,
        childBounds.width,
        childBounds.height,
      );
    }
  }

  if (!hasContent) return null;

  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING,
    width: maxX - minX + GROUP_PADDING * 2,
    height: maxY - minY + GROUP_PADDING * 2,
  };
}

/**
 * A group id plus every ancestor group id. Used when placing content *into* a
 * group: the target and all of its ancestors must be excluded from the group
 * obstacles so they don't block their own members.
 */
export function groupAndAncestorIds(
  groupId: string,
  groups: GroupInfo[],
): Set<string> {
  const groupsById = new Map<string, GroupInfo>(
    groups.map((g) => [g.id, g]),
  );
  const ids = new Set<string>();
  let current: string | undefined = groupId;
  while (current && !ids.has(current)) {
    ids.add(current);
    const parent: string | undefined = groupsById.get(current)?.parentId;
    current = parent && groupsById.has(parent) ? parent : undefined;
  }
  return ids;
}

/**
 * Recomputes `customBounds` for a set of affected groups and their ancestors,
 * so boundaries keep enclosing all of their members.
 *
 * Groups are processed deepest-first, letting a parent pick up the freshly
 * recomputed bounds of its child groups. Returns the original array when no
 * group is affected.
 */
export function recomputeGroupBoundsForGroupIds(
  objects: CanvasObject[],
  groups: GroupInfo[],
  affectedGroupIds: Iterable<string>,
): GroupInfo[] {
  if (groups.length === 0) return groups;

  const targetGroupIds = new Set(affectedGroupIds);
  if (targetGroupIds.size === 0) return groups;

  const groupsById = new Map(groups.map((g) => [g.id, g]));

  // Walk each affected group up through its ancestors.
  const allAffectedGroupIds = new Set<string>();
  for (const id of targetGroupIds) {
    let currentId: string | undefined = id;
    while (currentId && !allAffectedGroupIds.has(currentId)) {
      allAffectedGroupIds.add(currentId);
      currentId = groupsById.get(currentId)?.parentId;
    }
  }
  if (allAffectedGroupIds.size === 0) return groups;

  const depthOf = (group: GroupInfo): number => {
    let depth = 0;
    let current: GroupInfo | undefined = group;
    const guard = new Set<string>();
    while (current?.parentId && !guard.has(current.id)) {
      guard.add(current.id);
      current = groupsById.get(current.parentId);
      depth += 1;
    }
    return depth;
  };

  const nextGroups = new Map(groupsById);
  const ordered = [...allAffectedGroupIds]
    .map((id) => groupsById.get(id))
    .filter((g): g is GroupInfo => Boolean(g))
    .sort((a, b) => depthOf(b) - depthOf(a));

  for (const group of ordered) {
    const bounds = computeGroupContentBounds(group, objects, [
      ...nextGroups.values(),
    ]);
    if (!bounds) continue;
    nextGroups.set(group.id, { ...group, customBounds: bounds });
  }

  return groups.map((g) => nextGroups.get(g.id) ?? g);
}

/**
 * True when a group still holds member objects or child groups. A group that
 * loses both should be dissolved so no empty boundary lingers on the canvas.
 */
export function groupHasContent(
  groupId: string,
  objects: CanvasObject[],
  groups: GroupInfo[],
): boolean {
  const g = groups.find((group) => group.id === groupId);
  if (g?.isSlice) return true;
  return (
    objects.some((o) => o.groupId === groupId) ||
    groups.some((g) => g.parentId === groupId)
  );
}

/**
 * Re-parents children of removed groups to the nearest surviving ancestor (or
 * to the root when none exists), so dissolving or deleting a parent never
 * leaves a dangling `parentId` behind.
 *
 * Removed groups are returned unchanged; callers filter them out afterwards.
 */
export function reparentChildrenOfRemovedGroups(
  groups: GroupInfo[],
  removedGroupIds: Iterable<string>,
): GroupInfo[] {
  const removed = new Set(removedGroupIds);
  if (removed.size === 0) return groups;

  const groupsById = new Map(groups.map((g) => [g.id, g]));

  /** Nearest ancestor of `groupId` that is not itself being removed. */
  const survivingAncestorOf = (groupId: string): string | undefined => {
    let current = groupsById.get(groupId)?.parentId;
    const guard = new Set<string>();
    while (current && !guard.has(current)) {
      if (!removed.has(current)) return current;
      guard.add(current);
      current = groupsById.get(current)?.parentId;
    }
    return undefined;
  };

  const survivors = new Map<string, string | undefined>();
  for (const id of removed) survivors.set(id, survivingAncestorOf(id));

  return groups.map((g) =>
    g.parentId && removed.has(g.parentId)
      ? { ...g, parentId: survivors.get(g.parentId) }
      : g,
  );
}

/**
 * Recomputes `customBounds` for every group that directly or transitively
 * contains one of the affected objects, so boundaries keep enclosing all of
 * their members after those objects move or resize.
 *
 * Groups are processed deepest-first, letting a parent pick up the freshly
 * recomputed bounds of its child groups. Returns the original array when no
 * group is affected.
 */
export function recomputeGroupBoundsForObjects(
  objects: CanvasObject[],
  groups: GroupInfo[],
  affectedObjectIds: Iterable<string>,
): GroupInfo[] {
  if (groups.length === 0) return groups;

  const affectedObjectIdSet = new Set(affectedObjectIds);
  if (affectedObjectIdSet.size === 0) return groups;

  const affectedGroupIds = new Set<string>();
  for (const obj of objects) {
    if (affectedObjectIdSet.has(obj.id) && obj.groupId) {
      affectedGroupIds.add(obj.groupId);
    }
  }

  return recomputeGroupBoundsForGroupIds(objects, groups, affectedGroupIds);
}

/** Horizontal overhang beyond the adjacent cards for a refitted separator. */
export const SEPARATOR_PADDING = 40;

const HORIZONTAL_LINE_EPSILON = 1;

function isHorizontalLine(obj: CanvasObject): boolean {
  if (obj.type !== "line" || !obj.lineData) return false;
  return (
    Math.abs(obj.lineData.end.y - obj.lineData.start.y) < HORIZONTAL_LINE_EPSILON
  );
}

/**
 * Re-fit a group's horizontal separator lines into the current gaps between its
 * card rows, so editing a card never leaves it overflowing past a separator.
 *
 * Cards keep their positions; only the lines move. Layer boundaries are
 * re-derived from the largest vertical gaps between the cards, so a card that
 * has grown into the next row still gets a clean line below it. Nested groups,
 * locked lines and non-horizontal lines are left alone.
 */
export function refitGroupSeparators(
  objects: CanvasObject[],
  groups: GroupInfo[],
  groupId: string,
): CanvasObject[] {
  if (!groups.some((g) => g.id === groupId)) return objects;
  if (groups.some((g) => g.parentId === groupId)) return objects;

  const lines = objects
    .filter((o) => o.groupId === groupId && !o.locked && isHorizontalLine(o))
    .sort((a, b) => a.y - b.y);
  if (lines.length === 0) return objects;

  const cards = objects
    .filter(
      (o) =>
        o.groupId === groupId &&
        !o.locked &&
        o.type !== "connector" &&
        o.type !== "line",
    )
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  if (cards.length < 2) return objects;

  // Pick the widest inter-card gaps as the layer boundaries, so a card that has
  // crossed into the next row pushes the boundary (and its line) down instead.
  const boundaries = cards
    .slice(0, -1)
    .map((upper, index) => ({
      index,
      gap: (cards[index + 1]!.y - (upper.y + upper.height)),
    }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, lines.length)
    .map((b) => b.index)
    .sort((a, b) => a - b);
  if (boundaries.length === 0) return objects;

  const replaced = new Map<string, CanvasObject>();
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i]!;
    const line = lines[i]!;
    const upper = cards.slice(0, boundary + 1);
    const lower = cards.slice(boundary + 1);
    if (upper.length === 0 || lower.length === 0) continue;

    const upperMaxY = Math.max(...upper.map((c) => c.y + c.height));
    const lowerMinY = Math.min(...lower.map((c) => c.y));
    const gap = lowerMinY - upperMaxY;
    const y = gap > 0 ? upperMaxY + gap / 2 : upperMaxY + 6;

    const left =
      Math.min(...upper.map((c) => c.x), ...lower.map((c) => c.x)) -
      SEPARATOR_PADDING;
    const right =
      Math.max(
        ...upper.map((c) => c.x + c.width),
        ...lower.map((c) => c.x + c.width),
      ) + SEPARATOR_PADDING;

    const geometry = normalizeLineGeometry(
      { x: left, y },
      { x: right, y },
      line.lineData,
    );
    replaced.set(line.id, { ...line, ...geometry });
  }

  if (replaced.size === 0) return objects;
  return objects.map((o) => replaced.get(o.id) ?? o);
}
