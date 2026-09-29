import type {
  CanvasObject,
  StormData,
  StormField,
  StormQueryItem,
} from "@/types";

/**
 * Visual linking between State cards and Event cards (DCB query semantics).
 *
 * Matching rules:
 * - `types` and tags are two INDEPENDENT filters: an Event matches an item
 *   when (types empty OR name in types) AND (no tag slots OR every slot matches)
 * - a tag slot matches when the Event carries a field with the same tag name
 *   and the same fieldType as the referenced State field (event field's name is ignored)
 */

export interface StormQueryTag {
  tag: string;
  fieldType: string;
  fieldName: string;
  fieldId: string;
}

/** Full-tag display string for a tagged field: "{tag}:{fieldName}" */
export function fullTagOf(field: StormField): string {
  return `${(field.tag ?? "").trim()}:${field.name.trim()}`;
}

/**
 * Resolves a Query Item's tag field references into concrete (tag, fieldType) slots.
 */
export function getStormQueryItemTags(
  item: StormQueryItem,
  stateData: StormData,
): StormQueryTag[] {
  const tags: StormQueryTag[] = [];
  const inputFields = stateData.inputFields ?? [];
  for (const fieldId of item.tagFieldIds) {
    const field = inputFields.find((f) => f.id === fieldId);
    const tag = (field?.tag ?? "").trim();
    if (!field || !tag) continue;
    tags.push({
      tag,
      fieldType: field.fieldType,
      fieldName: field.name.trim(),
      fieldId,
    });
  }
  return tags;
}

/** Does the Event carry a field with the same tag and type? (name ignored) */
export function matchesStormQueryTag(
  event: StormData,
  queryTag: StormQueryTag,
): boolean {
  return event.fields.some(
    (field) =>
      (field.tag ?? "").trim() === queryTag.tag &&
      field.fieldType === queryTag.fieldType,
  );
}

/**
 * Does one Event card match one Query Item?
 */
export function matchesStormQueryItem(
  event: StormData,
  item: StormQueryItem,
  stateData: StormData,
): boolean {
  if (item.types.length > 0 && !item.types.includes(event.name.trim())) {
    return false;
  }
  const tags = getStormQueryItemTags(item, stateData);
  return tags.every((queryTag) => matchesStormQueryTag(event, queryTag));
}

export interface StormTagOption {
  fieldId: string;
  tag: string;
  fieldName: string;
  fullTag: string;
  dedupeKey: string;
}

export function collectStateTagOptions(stateData: StormData): StormTagOption[] {
  const options: StormTagOption[] = [];
  const seen = new Set<string>();
  for (const field of stateData.inputFields ?? []) {
    const tag = (field.tag ?? "").trim();
    if (!tag) continue;
    const dedupeKey = `${tag}:${field.fieldType}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    options.push({
      fieldId: field.id,
      tag,
      fieldName: field.name.trim(),
      fullTag: `${tag}:${field.name.trim()}`,
      dedupeKey,
    });
  }
  return options;
}

export function collectEventTagNamesForType(
  objects: CanvasObject[],
  fieldType: string,
): string[] {
  return [
    ...new Set(
      objects
        .filter((o) => o.type === "storm" && o.stormData?.kind === "event")
        .flatMap((o) => o.stormData!.fields)
        .filter((f) => f.fieldType === fieldType)
        .map((f) => (f.tag ?? "").trim())
        .filter(Boolean),
    ),
  ].sort();
}

/**
 * All Event cards on the board that match ANY of the State card's Query Items
 */
export function collectMatchingEventIds(
  objects: CanvasObject[],
  stateObject: CanvasObject,
): string[] {
  const data = stateObject.type === "storm" ? stateObject.stormData : undefined;
  if (!data || (data.kind !== "state" && data.kind !== "constraint")) {
    return [];
  }
  const queryItems = data.queryItems ?? [];
  return objects
    .filter(
      (obj): obj is CanvasObject & { type: "storm"; stormData: StormData } =>
        obj.type === "storm" &&
        !!obj.stormData &&
        obj.stormData.kind === "event",
    )
    .filter((event) =>
      queryItems.some((item) =>
        matchesStormQueryItem(event.stormData, item, data),
      ),
    )
    .map((event) => event.id);
}

export function renameStormEventReferences(
  objects: CanvasObject[],
  oldName: string,
  newName: string,
): CanvasObject[] {
  if (!oldName || oldName === newName) return objects;
  let changed = false;
  const next = objects.map((obj) => {
    if (
      obj.type !== "storm" ||
      (obj.stormData?.kind !== "state" &&
        obj.stormData?.kind !== "constraint") ||
      !obj.stormData.queryItems?.some((item) => item.types.includes(oldName))
    ) {
      return obj;
    }
    changed = true;
    return {
      ...obj,
      stormData: {
        ...obj.stormData,
        queryItems: obj.stormData.queryItems.map((item) => ({
          ...item,
          types: item.types.map((type) => (type === oldName ? newName : type)),
        })),
      },
    };
  });
  return changed ? next : objects;
}
