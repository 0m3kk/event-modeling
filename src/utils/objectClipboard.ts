import { nanoid } from "nanoid";
import type { CanvasObject, GroupInfo, ObjectType } from "@/types";

/**
 * Object-level clipboard helpers — pure functions behind the Cmd/Ctrl+C /
 * Cmd/Ctrl+V shortcuts that duplicate the current selection (storm cards,
 * model nodes, sticky notes, text boxes, lines, connectors and whole groups).
 *
 * Unlike reference copies (utils/reference.ts) these duplicates are fully
 * independent: they get fresh ids, a remapped group tree and no `referenceId`,
 * so editing a paste never reaches back into the source.
 */

/** Offset applied per paste so repeated pastes do not stack on each other. */
export const OBJECT_PASTE_OFFSET = 32;

const GROUP_SELECTION_PREFIX = "__group:";

export interface ObjectClipboard {
  /** Cloned source objects (original ids kept until paste remaps them). */
  objects: CanvasObject[];
  /** Cloned source groups, including any nested descendants. */
  groups: GroupInfo[];
  /** Paste count for this snapshot, used to step the placement offset. */
  pasteIndex: number;
}

/** Raw group id behind a `__group:` selection entry, or null for object ids. */
export function selectedGroupId(id: string): string | null {
  return id.startsWith(GROUP_SELECTION_PREFIX)
    ? id.slice(GROUP_SELECTION_PREFIX.length)
    : null;
}

/**
 * `seed` plus every group nested beneath it, following `parentId`. Copying a
 * Section frame brings its sub-Sections along.
 */
function expandGroupSubtree(
  seed: Iterable<string>,
  groups: GroupInfo[],
): Set<string> {
  const result = new Set(seed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (group.parentId && result.has(group.parentId) && !result.has(group.id)) {
        result.add(group.id);
        changed = true;
      }
    }
  }
  return result;
}

/**
 * Deep clone for clipboard payloads. A JSON round-trip is enough here: every
 * field on these objects is JSON-safe plain data, and dropping `undefined`
 * optionals is harmless.
 */
function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Snapshot the current selection into a clipboard payload. Resolves a
 * selection of object ids and `__group:` entries into:
 * - every explicitly selected object,
 * - every member (and nested group) of a selected group, and
 * - connectors whose two endpoints both live inside the copied set, so copied
 *   flows keep their wiring. A connector selected on its own (endpoints left
 *   behind) is dropped rather than pasted dangling.
 *
 * Returns null when nothing copyable was selected.
 */
export function buildObjectClipboard(
  selectedIds: string[],
  objects: CanvasObject[],
  groups: GroupInfo[],
): ObjectClipboard | null {
  const existingObjectIds = new Set(objects.map((o) => o.id));
  const explicitObjectIds = new Set<string>();
  const seedGroupIds = new Set<string>();

  for (const id of selectedIds) {
    const groupId = selectedGroupId(id);
    if (groupId) {
      if (groups.some((g) => g.id === groupId)) seedGroupIds.add(groupId);
    } else if (existingObjectIds.has(id)) {
      explicitObjectIds.add(id);
    }
  }

  const groupIds = expandGroupSubtree(seedGroupIds, groups);
  const objectIds = new Set(explicitObjectIds);
  for (const obj of objects) {
    if (obj.groupId && groupIds.has(obj.groupId)) objectIds.add(obj.id);
  }

  const endpointInside = (id: string) =>
    objectIds.has(id) || groupIds.has(id);

  for (const obj of objects) {
    if (obj.type !== "connector" || !obj.connectorData) continue;
    const { start, end } = obj.connectorData;
    if (endpointInside(start.objectId) && endpointInside(end.objectId)) {
      objectIds.add(obj.id);
    }
  }

  const copiedObjects = objects.filter((obj) => {
    if (!objectIds.has(obj.id)) return false;
    if (obj.type !== "connector" || !obj.connectorData) return true;
    const { start, end } = obj.connectorData;
    return endpointInside(start.objectId) && endpointInside(end.objectId);
  });
  const copiedGroups = groups.filter((g) => groupIds.has(g.id));

  if (copiedObjects.length === 0 && copiedGroups.length === 0) return null;

  return {
    objects: copiedObjects.map(jsonClone),
    groups: copiedGroups.map(jsonClone),
    pasteIndex: 0,
  };
}

/** Fresh id for a pasted object, matching the prefixes used across the app. */
function newObjectId(type: ObjectType): string {
  switch (type) {
    case "storm":
      return `storm-${nanoid()}`;
    case "model":
      return `model-${nanoid()}`;
    case "connector":
      return `conn-${nanoid()}`;
    case "line":
      return `line-${nanoid()}`;
    case "stickyNote":
      return `sticky-${nanoid()}`;
    case "textBox":
      return `text-${nanoid()}`;
  }
}

export interface ObjectPastePayload {
  objects: CanvasObject[];
  groups: GroupInfo[];
}

/**
 * Materialize a clipboard snapshot into new, independent objects and groups:
 * fresh ids everywhere, group membership and connector endpoints remapped onto
 * the new ids, the whole selection shifted by `OBJECT_PASTE_OFFSET` per paste,
 * and `referenceId` stripped so a paste never links back to its source.
 */
export function buildPastedObjects(
  clipboard: ObjectClipboard,
): ObjectPastePayload | null {
  const offset = OBJECT_PASTE_OFFSET * (clipboard.pasteIndex + 1);

  const objectIdMap = new Map<string, string>();
  for (const obj of clipboard.objects) {
    objectIdMap.set(obj.id, newObjectId(obj.type));
  }
  const groupIdMap = new Map<string, string>();
  for (const group of clipboard.groups) {
    groupIdMap.set(group.id, `group-${nanoid()}`);
  }
  const resolveEndpoint = (id: string) =>
    objectIdMap.get(id) ?? groupIdMap.get(id);

  const groups: GroupInfo[] = clipboard.groups.map((group) => {
    const copy: GroupInfo = { ...jsonClone(group), id: groupIdMap.get(group.id)! };
    const parentId = group.parentId ? groupIdMap.get(group.parentId) : undefined;
    if (parentId) {
      copy.parentId = parentId;
    } else {
      delete copy.parentId;
    }
    // Cached bounds shift with the paste; the store recomputes them from the
    // pasted members anyway, but this keeps an empty Source frame aligned.
    if (copy.customBounds) {
      copy.customBounds = {
        ...copy.customBounds,
        x: copy.customBounds.x + offset,
        y: copy.customBounds.y + offset,
      };
    }
    return copy;
  });

  const objects: CanvasObject[] = [];
  for (const source of clipboard.objects) {
    const copy: CanvasObject = jsonClone(source);
    copy.id = objectIdMap.get(source.id)!;
    copy.x += offset;
    copy.y += offset;
    copy.locked = false;
    delete copy.referenceId;

    if (copy.groupId) {
      const groupId = groupIdMap.get(copy.groupId);
      if (groupId) {
        copy.groupId = groupId;
      } else {
        delete copy.groupId;
      }
    }

    if (copy.connectorData) {
      const start = resolveEndpoint(copy.connectorData.start.objectId);
      const end = resolveEndpoint(copy.connectorData.end.objectId);
      if (!start || !end) continue; // dangles — drop
      copy.connectorData = {
        ...copy.connectorData,
        start: { ...copy.connectorData.start, objectId: start },
        end: { ...copy.connectorData.end, objectId: end },
      };
    }

    objects.push(copy);
  }

  if (objects.length === 0 && groups.length === 0) return null;
  return { objects, groups };
}
