/**
 * Shared helpers for the AI tool executors: viewport spawning, the validation
 * error payload and description carry-over.
 */
import type { ValidationIssue } from "@/tools";
import { useCanvasStore } from "@/store";
import { collectBoardTags } from "@/utils/eventTags";
import { nameKey } from "@/utils/naming";
import { listDefinedTypeNames, PRIMITIVE_FIELD_TYPES } from "@/utils/typeCatalog";
import type { Point } from "@/types";
import { summarizeActions, summarizeActors } from "../canvasOverview";

export function getViewportCenter(): Point {
  const vp = useCanvasStore.getState().viewport;
  const zoom = vp.zoom || 1;
  return {
    x: -vp.x / zoom + (vp.screenWidth || 800) / (2 * zoom),
    y: -vp.y / zoom + (vp.screenHeight || 600) / (2 * zoom),
  };
}

/**
 * Shared error payload returned to the model when a creation is rejected, so
 * it can fix the data (create a missing event/tag/type first) and retry.
 */
export function buildValidationError(issues: ValidationIssue[]): string {
  const latest = useCanvasStore.getState();
  const eventTypes = latest.elements
    .filter((el) => el.type === "eventCard")
    .map((el) => el.data?.name)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  return JSON.stringify({
    status: "error",
    error: "validation_failed",
    message: "The card was NOT created or updated because its data breaks domain rules.",
    issues,
    tagCatalog: collectBoardTags(latest.elements),
    eventTypes,
    definedTypes: listDefinedTypeNames(latest.elements),
    primitiveTypes: Array.from(PRIMITIVE_FIELD_TYPES),
    actions: summarizeActions(latest.elements),
    actors: summarizeActors(latest.elements),
  });
}

/**
 * Carries an existing item's `description` over to a rebuilt array item with
 * the same `name` when the new item omits one. The overview omits descriptions
 * to stay small, so this keeps AI updates from wiping text the model never saw.
 */
export function carryOverDescriptions(next: any, prev: any): any {
  if (Array.isArray(next)) {
    return next.map((item) => {
      if (!item || typeof item !== "object" || typeof item.name !== "string") return item;
      const match = Array.isArray(prev)
        ? prev.find(
            (p: any) => p && typeof p.name === "string" && nameKey(p.name) === nameKey(item.name),
          )
        : undefined;
      if (match && item.description === undefined && typeof match.description === "string") {
        return { ...item, description: match.description };
      }
      return item;
    });
  }
  if (next && typeof next === "object") {
    const out: Record<string, any> = { ...next };
    for (const key of Object.keys(next)) {
      const prevValue = prev && typeof prev === "object" ? prev[key] : undefined;
      out[key] = carryOverDescriptions(next[key], prevValue);
    }
    return out;
  }
  return next;
}
