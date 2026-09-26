import type { CanvasObject, StormData, StormKind } from "@/types";

export const COMMON_VERBS = [
  "create",
  "read",
  "update",
  "delete",
  "manage",
  "list",
  "execute",
  "*",
] as const;

export const COMMON_SCOPES = [
  "own",
  "any",
  "all",
  "team",
  "org",
  "public",
  "system",
  "*",
] as const;

/**
 * Checks whether an actor's permission pattern matches a command/query action.
 * Supports:
 * - Exact matching: "order:create:own" === "order:create:own"
 * - Global wildcards: "*", "*:*", "*:*:*"
 * - Trailing wildcards: "order:*" matches "order:create", "order:create:own"
 * - Intermediate wildcards: "*:read:*" matches "order:read:own"
 * - Scope wildcards: "order:create:*" matches "order:create:own"
 */
export function matchesPermission(permission: string, action: string): boolean {
  const p = permission.trim().toLowerCase();
  const a = action.trim().toLowerCase();

  if (!p || !a) return false;
  if (p === "*" || p === "*:*" || p === "*:*:*") return true;
  if (p === a) return true;

  const pParts = p.split(":");
  const aParts = a.split(":");

  for (let i = 0; i < pParts.length; i++) {
    const pPart = pParts[i];

    if (pPart === "*" && i === pParts.length - 1) {
      return true;
    }

    const aPart = aParts[i];
    if (aPart === undefined) {
      return false;
    }

    if (pPart === "*") {
      continue;
    }

    if (pPart !== aPart) {
      return false;
    }
  }

  return pParts.length === aParts.length;
}

export function parseAction(actionStr: string): {
  resource: string;
  verb: string;
  scope: string;
} {
  const parts = actionStr
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    resource: parts[0] ?? "",
    verb: parts[1] ?? "",
    scope: parts[2] ?? "",
  };
}

export function formatAction(
  resource: string,
  verb: string,
  scope?: string,
): string {
  const cleanResource = resource.trim().toLowerCase();
  const cleanVerb = verb.trim().toLowerCase();
  const cleanScope = (scope || "").trim().toLowerCase();

  const parts = [cleanResource, cleanVerb, cleanScope].filter(Boolean);
  return parts.join(":");
}

export function getActorPermissions(data?: StormData): string[] {
  if (!data) return [];
  const set = new Set<string>();
  if (data.permissions) {
    for (const p of data.permissions) {
      const clean = p.trim();
      if (clean) set.add(clean);
    }
  }
  if (data.fields) {
    for (const f of data.fields) {
      const clean = f.name.trim();
      if (clean) set.add(clean);
    }
  }
  return Array.from(set);
}

export function getAuthorizedActors(
  objects: readonly CanvasObject[],
  action: string,
): CanvasObject[] {
  if (!action.trim()) return [];

  const seenKeys = new Set<string>();
  const result: CanvasObject[] = [];

  for (const obj of objects) {
    if (obj.type !== "storm" || obj.stormData?.kind !== "actor") continue;
    const permissions = getActorPermissions(obj.stormData);
    if (!permissions.some((perm) => matchesPermission(perm, action))) continue;

    const nameKey = (obj.stormData.name || "").trim().toLowerCase();
    const roleKey = nameKey ? `name:${nameKey}` : `id:${obj.id}`;

    if (seenKeys.has(roleKey)) continue;
    seenKeys.add(roleKey);
    result.push(obj);
  }

  return result;
}

export function getAllDefinedActions(
  objects: readonly CanvasObject[],
): string[] {
  const set = new Set<string>();

  for (const obj of objects) {
    if (obj.type !== "storm" || !obj.stormData) continue;

    const action = obj.stormData.action?.trim();
    if (action) {
      set.add(action);
    }

    const permissions =
      obj.stormData.kind === "actor"
        ? getActorPermissions(obj.stormData)
        : (obj.stormData.permissions ?? []);

    for (const p of permissions) {
      const clean = p.trim();
      if (clean && !clean.includes("*")) {
        set.add(clean);
      }
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function suggestActionForCard(kind: StormKind, name: string): string {
  if (!name.trim()) {
    return kind === "query" ? "resource:read:own" : "resource:create:own";
  }

  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return kind === "query" ? "resource:read:own" : "resource:create:own";
  }

  let verb = "";
  let scope = "own";
  const resourceWords: string[] = [];

  const verbMap: Record<string, string> = {
    create: "create",
    add: "create",
    make: "create",
    new: "create",
    get: "read",
    read: "read",
    find: "read",
    view: "read",
    fetch: "read",
    search: "read",
    list: "list",
    update: "update",
    edit: "update",
    modify: "update",
    change: "update",
    set: "update",
    delete: "delete",
    remove: "delete",
    cancel: "delete",
  };

  for (const word of words) {
    if (word === "all") {
      scope = "all";
      continue;
    }
    if (!verb && verbMap[word]) {
      verb = verbMap[word];
      continue;
    }
    resourceWords.push(word);
  }

  if (!verb) {
    verb = kind === "query" ? "read" : "create";
  }

  const resource =
    resourceWords.length > 0 ? resourceWords.join("-") : "resource";

  return `${resource}:${verb}:${scope}`;
}
