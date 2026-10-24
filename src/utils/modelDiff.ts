/**
 * Modeling diff + replay.
 *
 * Turns a pair of board states into a small list of {@link ModelEvent}s, and
 * rebuilds board state by replaying an event log. Only modeling fields are
 * compared: geometry (`x/y/width/height/zIndex/locked`) and colour
 * (`data.color`) are presentation state and never appear in the log.
 */
import type {
  CanvasElement,
  Viewport,
  ModelElement,
  ModelEvent,
  PatchOp,
  ChangeSet,
  UiSidecar,
  ElementGeometry,
} from "@/types";

/** Keys on a {@link CanvasElement} that describe modelling, not presentation. */
const MODEL_MEMBERSHIP_KEYS = [
  "referenceId",
  "isOriginal",
  "groupId",
  "sliceId",
  "laneId",
  "domainId",
] as const;

/** Presentation fields on a {@link CanvasElement} that the log ignores. */
export const UI_ELEMENT_KEYS = ["x", "y", "width", "height", "zIndex", "locked"] as const;

// ---------------------------------------------------------------------------
// Projection between CanvasElement and ModelElement
// ---------------------------------------------------------------------------

/** Strips presentation fields and colour from a card, keeping modeling only. */
export function toModelElement(el: CanvasElement): ModelElement {
  const { color: _color, ...data } = (el.data ?? {}) as Record<string, unknown>;
  const model: ModelElement = {
    id: el.id,
    type: el.type,
    data: data as Record<string, unknown>,
  };
  for (const key of MODEL_MEMBERSHIP_KEYS) {
    const value = (el as unknown as Record<string, unknown>)[key];
    if (value !== undefined) (model as unknown as Record<string, unknown>)[key] = value;
  }
  return model;
}

/** Merges a modeling element with its presentation sidecar into a card. */
export function fromModelElement(
  model: ModelElement,
  ui: UiSidecar,
): CanvasElement {
  const geometry: Partial<ElementGeometry> = ui.geometry[model.id] ?? {};
  const color = ui.color[model.id];
  const data = color ? { ...model.data, color } : { ...model.data };
  const el: CanvasElement = {
    id: model.id,
    type: model.type,
    x: geometry.x ?? 0,
    y: geometry.y ?? 0,
    width: geometry.width ?? 200,
    height: geometry.height ?? 100,
    data,
  };
  if (geometry.zIndex !== undefined) el.zIndex = geometry.zIndex;
  if (geometry.locked !== undefined) el.locked = geometry.locked;
  for (const key of MODEL_MEMBERSHIP_KEYS) {
    const value = (model as unknown as Record<string, unknown>)[key];
    if (value !== undefined) (el as unknown as Record<string, unknown>)[key] = value;
  }
  return el;
}

/** Splits board cards into the presentation sidecar (geometry + colour). */
export function extractUiSidecar(elements: CanvasElement[], viewport: Viewport): UiSidecar {
  const geometry: Record<string, ElementGeometry> = {};
  const color: Record<string, string> = {};
  for (const el of elements) {
    const geo: ElementGeometry = {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
    };
    if (el.zIndex !== undefined) geo.zIndex = el.zIndex;
    if (el.locked !== undefined) geo.locked = el.locked;
    geometry[el.id] = geo;
    const c = (el.data as Record<string, unknown> | undefined)?.color;
    if (typeof c === "string") color[el.id] = c;
  }
  return {
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    geometry,
    color,
  };
}

// ---------------------------------------------------------------------------
// JSON Pointer helpers
// ---------------------------------------------------------------------------

function escapeToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapeToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function pointerTokens(path: string): string[] {
  if (!path || path === "/") return [];
  return path.split("/").slice(1).map(unescapeToken);
}

function joinPointer(path: string, token: string | number): string {
  return `${path}/${escapeToken(String(token))}`;
}

/** Reads the value at a JSON Pointer, or `undefined` when the path is absent. */
export function getByPointer(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const token of pointerTokens(path)) {
    if (current === null || typeof current !== "object") return undefined;
    current = Array.isArray(current)
      ? current[Number(token)]
      : (current as Record<string, unknown>)[token];
  }
  return current;
}

function setByPointer(root: unknown, path: string, value: unknown): void {
  const tokens = pointerTokens(path);
  if (tokens.length === 0) return;
  let current: any = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    const next = Array.isArray(current) ? current[Number(token)] : current[token];
    if (next === undefined || next === null || typeof next !== "object") {
      // Missing intermediate container: create an object to keep the write safe.
      const created: Record<string, unknown> = {};
      if (Array.isArray(current)) current[Number(token)] = created;
      else current[token] = created;
      current = created;
    } else {
      current = next;
    }
  }
  const last = tokens[tokens.length - 1];
  if (Array.isArray(current)) {
    const index = Number(last);
    current[index] = value;
  } else {
    current[last] = value;
  }
}

function removeByPointer(root: unknown, path: string): void {
  const tokens = pointerTokens(path);
  if (tokens.length === 0) return;
  let current: any = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    current = Array.isArray(current) ? current[Number(token)] : current[token];
    if (current === undefined || current === null) return;
  }
  const last = tokens[tokens.length - 1];
  if (Array.isArray(current)) {
    const index = Number(last);
    if (index >= 0 && index < current.length) current.splice(index, 1);
  } else if (current && typeof current === "object") {
    delete current[last];
  }
}

// ---------------------------------------------------------------------------
// Deep equality + diff
// ---------------------------------------------------------------------------

/** Structural equality for the plain JSON shapes used in card data. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bo, key)) return false;
    if (!deepEqual(ao[key], bo[key])) return false;
  }
  return true;
}

/** The stable identity of an array item, or `null` when it has none. */
function itemKey(item: unknown): string | null {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (typeof record.name === "string") return record.name;
  return null;
}

/** True when `b` is `a` with every item moved to a different position. */
function isFullReorder(a: unknown[], b: unknown[]): boolean {
  const keysA = a.map(itemKey);
  const keysB = b.map(itemKey);
  if (keysA.some((key) => key === null) || keysB.some((key) => key === null)) return false;
  if (keysA.some((key, index) => key === keysB[index])) return false;
  const sortedA = [...keysA].sort();
  const sortedB = [...keysB].sort();
  return sortedA.every((key, index) => key === sortedB[index]);
}

function diffValue(a: unknown, b: unknown, path: string, ops: PatchOp[]): void {
  if (deepEqual(a, b)) return;

  const bothObjects =
    a !== null && b !== null && typeof a === "object" && typeof b === "object";
  if (bothObjects && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    for (const key of Object.keys(bo)) {
      const childPath = joinPointer(path, key);
      if (!Object.prototype.hasOwnProperty.call(ao, key)) {
        ops.push({ op: "add", path: childPath, value: bo[key] });
      } else {
        diffValue(ao[key], bo[key], childPath, ops);
      }
    }
    for (const key of Object.keys(ao)) {
      if (!Object.prototype.hasOwnProperty.call(bo, key)) {
        ops.push({ op: "remove", path: joinPointer(path, key) });
      }
    }
    return;
  }

  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.length > 0) {
    if (isFullReorder(a, b)) {
      // A pure reorder would otherwise read as every row changing at once;
      // replace the list so the panel can show one ordered before/after.
      ops.push({ op: "replace", path, value: b });
      return;
    }
    // Same-length arrays are diffed position by position. This keeps edits to
    // list items (a field row, a lane, a query item) small and replayable even
    // when an item is renamed, instead of replacing the whole array — which
    // would also make the change panel dump raw JSON.
    for (let i = 0; i < a.length; i++) {
      diffValue(a[i], b[i], joinPointer(path, i), ops);
    }
    return;
  }

  // Different length (an item was added/removed): replace the whole value.
  ops.push({ op: "replace", path, value: b });
}

/** Computes the JSON-Pointer edits that turn `prev` into `next`. */
export function diffModelElement(prev: ModelElement, next: ModelElement): PatchOp[] {
  const ops: PatchOp[] = [];
  diffValue(toShape(prev), toShape(next), "", ops);
  return ops;
}

/** The diffable shape of a modeling element: data plus membership links. */
function toShape(model: ModelElement): Record<string, unknown> {
  const shape: Record<string, unknown> = { data: model.data };
  for (const key of MODEL_MEMBERSHIP_KEYS) {
    const value = (model as unknown as Record<string, unknown>)[key];
    if (value !== undefined) shape[key] = value;
  }
  return shape;
}

/** Applies a patch to a modeling element, returning a new object. */
export function applyOps(model: ModelElement, ops: PatchOp[]): ModelElement {
  // Clone `data` before writing: the shape below is shallow, so writing through
  // it would otherwise mutate the caller's element (and, during replay, the
  // very log entries being replayed).
  const shape: Record<string, unknown> = {
    data: JSON.parse(JSON.stringify(model.data ?? {})),
  };
  for (const key of MODEL_MEMBERSHIP_KEYS) {
    const value = (model as unknown as Record<string, unknown>)[key];
    if (value !== undefined) shape[key] = value;
  }
  for (const op of ops) {
    if (op.op === "remove") removeByPointer(shape, op.path);
    else setByPointer(shape, op.path, op.value);
  }
  const next: ModelElement = {
    id: model.id,
    type: model.type,
    data: (shape.data as Record<string, unknown>) ?? {},
  };
  for (const key of MODEL_MEMBERSHIP_KEYS) {
    if (shape[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = shape[key];
  }
  return next;
}

// ---------------------------------------------------------------------------
// Element-list diff (what the recorder commits)
// ---------------------------------------------------------------------------

/** The modeling events that turn `prev` into `next`. Presentation is ignored. */
export function diffElements(prev: CanvasElement[], next: CanvasElement[]): ModelEvent[] {
  const prevById = new Map(prev.map((el) => [el.id, el]));
  const nextById = new Map(next.map((el) => [el.id, el]));
  const events: ModelEvent[] = [];

  for (const el of prev) {
    if (!nextById.has(el.id)) events.push({ t: "deleted", id: el.id });
  }
  for (const el of next) {
    const before = prevById.get(el.id);
    if (!before) {
      events.push({ t: "created", el: toModelElement(el) });
      continue;
    }
    const ops = diffModelElement(toModelElement(before), toModelElement(el));
    if (ops.length > 0) events.push({ t: "patched", id: el.id, ops });
  }
  return events;
}

/** Returns true when two cards differ only in presentation (geometry/colour). */
export function isPresentationOnlyChange(prev: CanvasElement, next: CanvasElement): boolean {
  return diffModelElement(toModelElement(prev), toModelElement(next)).length === 0;
}

/** Element keys that are modelling rather than presentation. */
const MODELING_PATCH_KEYS = new Set([
  "data",
  "type",
  "referenceId",
  "isOriginal",
  "groupId",
  "sliceId",
  "laneId",
  "domainId",
]);

/**
 * Whether an update patch can change modelling. Lets geometry-only actions
 * (drag, resize, arrange) skip diffing on every frame.
 */
export function patchTouchesModeling(patch: Partial<CanvasElement>): boolean {
  return Object.keys(patch).some((key) => MODELING_PATCH_KEYS.has(key));
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

function cloneModel(model: ModelElement): ModelElement {
  return {
    ...model,
    data: JSON.parse(JSON.stringify(model.data ?? {})),
  };
}

/** Applies one event to an in-place id → ModelElement map. */
export function applyEvent(map: Map<string, ModelElement>, event: ModelEvent): void {
  switch (event.t) {
    case "created":
      map.set(event.el.id, cloneModel(event.el));
      return;
    case "patched": {
      const current = map.get(event.id);
      if (current) map.set(event.id, applyOps(current, event.ops));
      return;
    }
    case "deleted":
      map.delete(event.id);
      return;
    case "board.cleared":
      map.clear();
      return;
  }
}

/**
 * Rebuilds modeling state by replaying a log. Events with `seq <= afterSeq`
 * are skipped, so a snapshot can seed the replay.
 */
export function replayModel(
  log: ChangeSet[],
  base: ModelElement[] = [],
  afterSeq = 0,
): Map<string, ModelElement> {
  const map = new Map<string, ModelElement>();
  for (const el of base) map.set(el.id, cloneModel(el));
  for (const cs of log) {
    if (cs.seq <= afterSeq) continue;
    for (const event of cs.events) applyEvent(map, event);
  }
  return map;
}

/** Merges a replayed modeling state with the presentation sidecar. */
export function toCanvasElements(
  model: Map<string, ModelElement>,
  ui: UiSidecar,
): CanvasElement[] {
  const out: CanvasElement[] = [];
  for (const el of model.values()) out.push(fromModelElement(el, ui));
  return out;
}
