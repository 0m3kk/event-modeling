/**
 * Canvas overview for the AI: a compact, id-free projection of the board plus
 * the board-wide catalogs the model needs to build valid references. Also
 * exposes the within-turn cache that collapses repeated identical reads.
 */
import type { CanvasElement } from "@/types";
import { collectBoardTags } from "@/utils/eventTags";
import { collectBoardActions } from "@/utils/rbac";
import { collectBoardActors } from "@/tools/actorCard";
import { getElementName } from "@/utils/naming";
import { listDefinedTypeNames, PRIMITIVE_FIELD_TYPES } from "@/utils/typeCatalog";
import { SLICE_TYPE, type SliceLane } from "@/tools/sliceCard/layout";
import { DOMAIN_TYPE } from "@/tools/domainCard/layout";
import { GROUP_TYPE } from "@/tools/groupCard/layout";

/** Compact slice + lane summary for the model (identifies lanes by type/index). */
export function summarizeSlices(elements: CanvasElement[]): any[] {
  return elements
    .filter((el) => el.type === SLICE_TYPE)
    .map((el) => {
      const lanes: SliceLane[] = (el.data as any)?.lanes ?? [];
      return {
        name: getElementName(el) ?? "Slice",
        lanes: lanes.map((lane, index) => ({
          index: index + 1,
          type: lane.childType ?? null,
          cards: elements
            .filter((child) => child.sliceId === el.id && child.laneId === lane.id)
            .map((child) => getElementName(child) ?? child.id),
        })),
      };
    });
}

/** Compact Domain summary for the model (name + the cards/slices it contains). */
export function summarizeDomains(elements: CanvasElement[]): any[] {
  return elements
    .filter((el) => el.type === DOMAIN_TYPE)
    .map((el) => ({
      name: getElementName(el) ?? "Domain",
      cards: elements
        .filter((child) => child.domainId === el.id)
        .map((child) => getElementName(child) ?? child.id),
    }));
}

/** Compact Group summary for the model (name + the reusable cards it clusters). */
export function summarizeGroups(elements: CanvasElement[]): any[] {
  return elements
    .filter((el) => el.type === GROUP_TYPE)
    .map((el) => ({
      name: getElementName(el) ?? "Group",
      domain: el.domainId
        ? getElementName(elements.find((d) => d.id === el.domainId) ?? {}) ?? null
        : null,
      cards: elements
        .filter((child) => child.groupId === el.id)
        .map((child) => getElementName(child) ?? child.id),
    }));
}

/** Compact RBAC action summary: every action token a Command/Query declares. */
export function summarizeActions(elements: CanvasElement[]): any[] {
  return collectBoardActions(elements).map((a) => ({
    action: a.action,
    type: a.cardType,
    card: a.cardName,
  }));
}

/** Compact Actor summary: name and the action patterns it grants. */
export function summarizeActors(elements: CanvasElement[]): any[] {
  return collectBoardActors(elements).map((a) => ({
    name: a.name,
    permissions: ((a.data as any)?.permissions ?? [])
      .map((p: any) => p?.action)
      .filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
  }));
}

/**
 * Fields dropped from every card's data in the canvas overview to keep the
 * tool result small: internal ids and cosmetic colour. When
 * {@link OVERVIEW_INCLUDE_DESCRIPTIONS} is false, `description` strings are
 * dropped too — updates carry an existing description over by name (see
 * `carryOverDescriptions`), so the model never needs their current text.
 */
const OVERVIEW_INCLUDE_DESCRIPTIONS = false;
const OVERVIEW_DROP_KEYS = new Set(
  OVERVIEW_INCLUDE_DESCRIPTIONS ? ["id", "color"] : ["id", "color", "description"],
);

/**
 * Recursively strips overview noise from a value: drops the keys in
 * {@link OVERVIEW_DROP_KEYS}, omits falsy flags (`false`/`null`) and empty
 * arrays/objects. Returns `undefined` when nothing is left, so the caller can
 * omit the key entirely.
 */
function stripOverviewValue(value: any): any {
  if (Array.isArray(value)) {
    const arr = value.map((item) => stripOverviewValue(item)).filter((item) => item !== undefined);
    return arr.length > 0 ? arr : undefined;
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      if (OVERVIEW_DROP_KEYS.has(key)) continue;
      if (val === false || val === null) continue;
      const cleaned = stripOverviewValue(val);
      if (cleaned === undefined) continue;
      out[key] = cleaned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return value;
}

/**
 * Compact, id-free projection of one canvas element for the model: its type
 * plus its semantic data. Board position and size are deliberately omitted —
 * the model reasons about the domain model, not pixel layout.
 */
function summarizeElement(el: CanvasElement): any {
  const data = stripOverviewValue(el.data) ?? {};
  return { type: el.type, ...data };
}

/** Name-only projection used by the default (non-`detail`) overview. */
function summarizeElementCompact(el: CanvasElement): any {
  const name = getElementName(el);
  return name ? { type: el.type, name } : { type: el.type };
}

export interface OverviewFilters {
  type?: string;
  name?: string;
  detail?: boolean;
}

/** Reads the filter/detail arguments the model passed to get_canvas_overview. */
export function readOverviewFilters(args: any): OverviewFilters {
  const asString = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  return {
    type: asString(args?.type),
    name: asString(args?.name),
    detail: args?.detail === true,
  };
}

/**
 * Builds the canvas overview. Per-card detail is opt-in (`detail`): by default
 * each element is reduced to `{ type, name }`, which keeps the tool result
 * small. `type`/`name` narrow the element list; the board-wide catalogs
 * (eventTypes, tagCatalog, slices, groups, domains, actions, actors) are only
 * attached for an unfiltered read, since a filtered read is a targeted lookup.
 */
export function buildCanvasOverview(elements: CanvasElement[], filters: OverviewFilters): string {
  const needle = filters.name?.toLowerCase();
  const matches = elements.filter((el) => {
    if (filters.type && el.type !== filters.type) return false;
    if (needle) {
      const name = (getElementName(el) ?? "").toLowerCase();
      if (!name.includes(needle)) return false;
    }
    return true;
  });

  const summary = matches.map((el) =>
    filters.detail ? summarizeElement(el) : summarizeElementCompact(el),
  );

  if (filters.type || filters.name) {
    return JSON.stringify({ count: summary.length, elements: summary });
  }

  const eventTypes = elements
    .filter((el) => el.type === "eventCard")
    .map((el) => el.data?.name)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0);

  return JSON.stringify({
    count: summary.length,
    elements: summary,
    eventTypes,
    tagCatalog: collectBoardTags(elements),
    definedTypes: listDefinedTypeNames(elements),
    primitiveTypes: Array.from(PRIMITIVE_FIELD_TYPES),
    slices: summarizeSlices(elements),
    groups: summarizeGroups(elements),
    domains: summarizeDomains(elements),
    actions: summarizeActions(elements),
    actors: summarizeActors(elements),
  });
}

/**
 * Within a single agent turn the model often asks for the overview more than
 * once. When the board is unchanged and the same filters are requested, we
 * answer with a tiny `unchanged` marker instead of re-sending the whole board,
 * since the earlier result is already in the conversation. The cache is keyed
 * by the store's `elements` array identity, which zustand replaces on every
 * mutation.
 */
let overviewCache: { elementsRef: CanvasElement[]; filterKey: string; payload: string } | null =
  null;

/** Clears the within-turn overview cache so a fresh turn never sees a stale hit. */
export function resetOverviewCache(): void {
  overviewCache = null;
}

/** Returns the overview payload for the given board/filters, memoized within a turn. */
export function resolveCanvasOverview(elements: CanvasElement[], filters: OverviewFilters): string {
  const filterKey = JSON.stringify(filters);

  if (
    overviewCache &&
    overviewCache.elementsRef === elements &&
    overviewCache.filterKey === filterKey
  ) {
    return JSON.stringify({
      unchanged: true,
      note: "The board has not changed since your last get_canvas_overview call; the overview you already received is still current.",
    });
  }

  const payload = buildCanvasOverview(elements, filters);
  overviewCache = { elementsRef: elements, filterKey, payload };
  return payload;
}
