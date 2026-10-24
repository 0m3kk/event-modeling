/**
 * Human-readable rendering of change-log fields.
 *
 * The log speaks JSON Pointer (`/data/fields/0/type`) and stores membership by
 * id (`/groupId`). This module turns both into labels a modeller recognises:
 * the card/field name, the container name, and pretty values. It is kept free
 * of React and the tool registry so it can be unit-tested; the caller supplies
 * translation and type-label resolvers.
 */
import type { ModelElement } from "@/types";
import type { HistoryField, MembershipTarget } from "./changeHistory";
import { toDisplayName } from "./naming";

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface ChangeDisplayContext {
  t: Translate;
  /** Resolves an element type (`eventCard`) to its display name (`Event`). */
  typeLabel: (type: string) => string;
  /** Membership ids referenced by the change set, resolved by the replay. */
  targets: Record<string, MembershipTarget>;
}

export type FieldChangeKind = "added" | "removed" | "changed";

export interface FieldChangeDisplay {
  /** e.g. `Name`, `Field "id" · Type`, `In group`. */
  label: string;
  before: string;
  after: string;
  kind: FieldChangeKind;
}

/** Translation keys for top-level membership fields. */
const MEMBERSHIP_LABELS: Record<string, string> = {
  groupId: "changes.membership.group",
  sliceId: "changes.membership.slice",
  laneId: "changes.membership.lane",
  domainId: "changes.membership.domain",
};

/** List-valued data sections and their singular display label. */
const SECTION_LABELS: Record<string, string> = {
  fields: "changes.sections.field",
  params: "changes.sections.param",
  inputs: "changes.sections.input",
  responses: "changes.sections.response",
  returns: "changes.sections.return",
  states: "changes.sections.state",
  rules: "changes.sections.rule",
  permissions: "changes.sections.permission",
  queryItems: "changes.sections.query",
  lanes: "changes.sections.lane",
};

/** Data keys with a friendlier label than their raw property name. */
const KEY_LABELS: Record<string, string> = {
  name: "changes.labels.name",
  description: "changes.labels.description",
  type: "changes.labels.type",
  aliasedType: "changes.labels.type",
  isArray: "changes.labels.array",
  isRequired: "changes.labels.required",
  isTag: "changes.labels.tagged",
  tag: "changes.labels.tag",
  field: "changes.labels.field",
  action: "changes.labels.action",
  serviceName: "changes.labels.service",
  validation: "changes.labels.validation",
  childType: "changes.labels.cardType",
  types: "changes.labels.eventTypes",
  text: "changes.labels.text",
};

interface ParsedPath {
  membership?: keyof typeof MEMBERSHIP_LABELS;
  data: string[];
}

function parsePath(path: string): ParsedPath {
  const tokens = path
    .split("/")
    .slice(1)
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (tokens.length === 1 && MEMBERSHIP_LABELS[tokens[0]]) {
    return { membership: tokens[0] as keyof typeof MEMBERSHIP_LABELS, data: [] };
  }
  if (tokens[0] === "data") return { data: tokens.slice(1) };
  return { data: tokens };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIndex(token: string | undefined): boolean {
  return token !== undefined && /^\d+$/.test(token);
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function keyLabel(key: string, context: ChangeDisplayContext): string {
  const translation = KEY_LABELS[key];
  return translation ? context.t(translation) : toDisplayName(key);
}

function sectionLabel(section: string, context: ChangeDisplayContext): string {
  const translation = SECTION_LABELS[section];
  return translation ? context.t(translation) : toDisplayName(section);
}

function arrayItem(model: ModelElement, key: string, index: number): unknown {
  const list = model.data?.[key];
  return Array.isArray(list) ? list[index] : undefined;
}

/** A short identifier for a list item, or `undefined` when it has none. */
function itemName(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.name === "string" && value.name.trim()) return value.name.trim();
  if (typeof value.action === "string" && value.action) return value.action;
  if (typeof value.tag === "string" && typeof value.field === "string") {
    return `${value.tag}:${value.field}`;
  }
  if (Array.isArray(value.types)) {
    const types = value.types.filter((type): type is string => typeof type === "string");
    if (types.length > 0) return types.join(" | ");
  }
  if (typeof value.text === "string" && value.text.trim()) return truncate(value.text, 40);
  return undefined;
}

/** A compact, id-free summary of a list item or object value. */
function itemValue(value: unknown, context: ChangeDisplayContext): string {
  if (typeof value === "string") return truncate(value);
  if (typeof value === "boolean") return value ? context.t("changes.yes") : context.t("changes.no");
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return context.t("changes.labels.none");
    return truncate(value.map((entry) => itemValue(entry, context)).filter(Boolean).join(", "));
  }
  if (!isRecord(value)) return "";

  if (typeof value.name === "string" && typeof value.type === "string") {
    const markers = `${value.isArray === true ? "[]" : ""}${value.isRequired === true ? " *" : ""}`;
    return `${value.name}: ${value.type}${markers}`;
  }
  if (Array.isArray(value.types)) {
    const types = value.types.filter((type): type is string => typeof type === "string");
    const tags = Array.isArray(value.tags)
      ? value.tags
          .map((tag) =>
            isRecord(tag) && typeof tag.tag === "string" && typeof tag.field === "string"
              ? `${tag.tag}:${tag.field}`
              : "",
          )
          .filter(Boolean)
      : [];
    return truncate([types.join(" | "), tags.join(", ")].filter(Boolean).join(" · "));
  }
  if (typeof value.action === "string") return value.action;
  if (typeof value.tag === "string" && typeof value.field === "string") {
    return `${value.tag}:${value.field}`;
  }
  if (typeof value.childType === "string") return context.typeLabel(value.childType);
  if (typeof value.name === "string") return value.name;
  if (typeof value.text === "string") return truncate(value.text, 40);

  // A lane with no reserved type is just `{ id }`; never show the id itself.
  const entries = Object.entries(value).filter(
    ([key, child]) => key !== "id" && child !== undefined && child !== null && child !== "",
  );
  if (entries.length === 0) return context.t("changes.labels.emptyLane");
  return truncate(entries.map(([key, child]) => `${toDisplayName(key)}: ${itemValue(child, context)}`).join(", "));
}

function valueLabel(value: unknown, context: ChangeDisplayContext): string {
  if (value === undefined || value === null) return "";
  return itemValue(value, context);
}

/** Detail shown next to a whole list item (its name is already in the label). */
function itemDetail(value: unknown, context: ChangeDisplayContext): string {
  if (!isRecord(value)) return itemValue(value, context);

  if (typeof value.name === "string" && typeof value.type === "string") {
    const markers = `${value.isArray === true ? "[]" : ""}${value.isRequired === true ? " *" : ""}`;
    return `${value.type}${markers}`;
  }
  if (Array.isArray(value.types)) {
    const tags = Array.isArray(value.tags)
      ? value.tags
          .map((tag) =>
            isRecord(tag) && typeof tag.tag === "string" && typeof tag.field === "string"
              ? `${tag.tag}:${tag.field}`
              : "",
          )
          .filter(Boolean)
          .join(", ")
      : "";
    return tags;
  }
  if (typeof value.childType === "string") return context.typeLabel(value.childType);

  // `name`, `action`, `tag`/`field` and free text are already in the label.
  if (
    typeof value.name === "string" ||
    typeof value.action === "string" ||
    typeof value.text === "string" ||
    (typeof value.tag === "string" && typeof value.field === "string")
  ) {
    return "";
  }
  return itemValue(value, context);
}

function membershipLabel(
  value: unknown,
  context: ChangeDisplayContext,
): string {
  if (typeof value !== "string" || !value) return "";
  const target = context.targets[value];
  if (!target) return context.t("changes.labels.unknown");
  if (target.kind !== "lane") {
    return target.name?.trim() ? target.name : context.t("changes.labels.unknown");
  }
  if (target.childType) return context.typeLabel(target.childType);
  return context.t("changes.labels.emptyLane");
}

function pathLabel(
  path: ParsedPath,
  before: ModelElement,
  after: ModelElement,
  context: ChangeDisplayContext,
  preferAfterItem: boolean,
): string {
  const data = path.data;
  if (data.length === 0) return context.t("changes.labels.cardData");

  const [head, second, ...rest] = data;
  const section = SECTION_LABELS[head];

  if (section && isIndex(second)) {
    const index = Number(second);
    // Prefer the after-item when it exists (so renames show the new name), but
    // use the before-item for removals, where the index now points elsewhere.
    const item = preferAfterItem
      ? (arrayItem(after, head, index) ?? arrayItem(before, head, index))
      : (arrayItem(before, head, index) ?? arrayItem(after, head, index));
    const name = itemName(item);
    const base = name
      ? `${sectionLabel(head, context)} "${truncate(name, 32)}"`
      : `${sectionLabel(head, context)} ${index + 1}`;
    return rest.length === 0 ? base : `${base} · ${keyLabel(rest[0], context)}`;
  }

  if (section) return sectionLabel(head, context);

  const label = keyLabel(head, context);
  if (second === undefined) return label;
  return [label, ...data.slice(1).map((token) => (isIndex(token) ? `#${Number(token) + 1}` : keyLabel(token, context)))].join(
    " · ",
  );
}

/** Turns one resolved patch field into something readable in the panel. */
export function describeFieldChange(
  field: HistoryField,
  before: ModelElement,
  after: ModelElement,
  context: ChangeDisplayContext,
): FieldChangeDisplay {
  const kind: FieldChangeKind =
    field.before === undefined ? "added" : field.after === undefined ? "removed" : "changed";
  const path = parsePath(field.path);

  if (path.membership) {
    return {
      kind,
      label: context.t(MEMBERSHIP_LABELS[path.membership]),
      before: membershipLabel(field.before, context),
      after: membershipLabel(field.after, context),
    };
  }

  const wholeItem =
    path.data.length === 2 &&
    SECTION_LABELS[path.data[0]] !== undefined &&
    isIndex(path.data[1]);
  const format = wholeItem
    ? (value: unknown) => (value === undefined || value === null ? "" : itemDetail(value, context))
    : (value: unknown) => valueLabel(value, context);

  return {
    kind,
    label: pathLabel(path, before, after, context, kind !== "removed"),
    before: format(field.before),
    after: format(field.after),
  };
}
