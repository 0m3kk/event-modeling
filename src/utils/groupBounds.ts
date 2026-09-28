import type { CanvasObject, GroupBounds, GroupInfo } from "@/types";

/** Padding between a group's boundary and its contents, in world units. */
export const GROUP_PADDING = 24;

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
