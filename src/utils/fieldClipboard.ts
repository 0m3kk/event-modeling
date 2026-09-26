import type {
  CanvasObject,
  FieldClipboard,
  FieldClipboardEntry,
} from "@/types";
import { stormHasFields } from "@/constants/storm";

/**
 * Field-level clipboard helpers — pure functions shared by the clipboard
 * actions (copySelectedFields/pasteFields) and keyboard shortcuts.
 */

/**
 * Builds the field clipboard payload from the selected rows of one
 * model/storm card. Rows that don't resolve to a copyable field (unknown
 * ids, wrap/array type rows, State card Query Items) are skipped.
 * Returns null when nothing copyable was selected.
 */
export function buildFieldClipboard(
  obj: CanvasObject,
  fieldIds: string[],
): FieldClipboard | null {
  const idSet = new Set(fieldIds);
  let entries: FieldClipboardEntry[] = [];
  let sourceKind: FieldClipboard["sourceKind"] = "storm";

  if (obj.type === "model" && obj.modelData) {
    if (obj.modelData.kind === "enum") {
      sourceKind = "model-enum";
      entries = (obj.modelData.values ?? [])
        .filter((v) => idSet.has(v.id))
        .map((v) => ({
          name: v.value ?? v.name ?? "",
          fieldType: "",
          description: v.description,
        }));
    } else {
      sourceKind = "model-object";
      entries = (obj.modelData.fields ?? [])
        .filter((f) => idSet.has(f.id))
        .map((f) => ({
          name: f.name,
          fieldType: f.fieldType,
          required: f.required,
          description: f.description,
        }));
    }
  } else if (obj.type === "storm" && obj.stormData) {
    sourceKind = "storm";
    entries = obj.stormData.fields
      .filter((f) => idSet.has(f.id))
      .map((f) => ({
        name: f.name,
        fieldType: f.fieldType,
        required: f.required,
        description: f.description,
        ...(f.tag ? { tag: f.tag } : {}),
      }));
  }

  if (entries.length === 0) return null;
  return { sourceKind, entries };
}

/**
 * Whether the field clipboard can be pasted into the given target card.
 * Rules:
 * - object models and storm cards accept field entries (model ↔ storm cross
 *   paste is allowed; tags survive into storm cards, are dropped into models)
 * - enum models accept enum value entries only
 * - locked cards and cards without field rows (array/wrap) reject
 */
export function canPasteFields(
  target: CanvasObject | undefined,
  clipboard: FieldClipboard | null,
): boolean {
  if (!clipboard || clipboard.entries.length === 0 || !target) return false;
  if (target.locked) return false;

  if (target.type === "model" && target.modelData) {
    if (clipboard.sourceKind === "model-enum") {
      return target.modelData.kind === "enum";
    }
    return target.modelData.kind === "object";
  }

  if (target.type === "storm" && target.stormData) {
    return (
      clipboard.sourceKind !== "model-enum" &&
      stormHasFields(target.stormData.kind)
    );
  }

  return false;
}
