/**
 * Lowers a (hoisted) specification into the {@link IrCrate} the templates render.
 *
 * Responsibilities:
 *  - map spec primitives to Rust types (configurable via `typeMap`);
 *  - render each field's Rust type and identifier names;
 *  - decide each artifact's module path (domain folder + kind folder);
 *  - build the module tree that drives `mod.rs` emission;
 *  - detect the crate dependencies the generated code needs.
 */
import {
  dataTypeDefName,
  nameKey,
  pascalCase,
  snakeCase,
  type DataTypeDef,
  type Field,
  type QueryItem as SpecQueryItem,
  type Specification,
} from "@em/spec";
import type { CodegenConfig } from "../config";
import type {
  IrArtifact,
  IrCrate,
  IrDep,
  IrDomain,
  IrEnumVariant,
  IrEventImport,
  IrEventRef,
  IrField,
  IrMethod,
  IrModuleDir,
  IrQueryItem,
  IrQueryTag,
  RustType,
} from "./types";

/** Out-of-the-box primitive mapping. Overridden/extended by `config.typeMap`. */
const DEFAULT_TYPE_MAP: Record<string, string> = {
  string: "String",
  integer: "i64",
  float: "f64",
  boolean: "bool",
};

/** Folder name for each artifact kind. */
const KIND_FOLDER: Record<IrArtifact["kind"], string> = {
  event: "events",
  command: "commands",
  query: "queries",
  view: "views",
  state: "states",
  service: "services",
  type: "types",
};

/** Module used for artifacts that belong to no declared domain. */
const COMMON_MODULE = "common";

/** Git source of the `event-store` crate the generated projections depend on. */
const EVENT_STORE_GIT = "https://github.com/0m3kk/backend-kit.git";

export interface BuildIrInput {
  spec: Specification;
  types: DataTypeDef[];
  config: CodegenConfig;
}

export interface BuildIrResult {
  crate: IrCrate;
  /** The effective primitive map (defaults merged with config). */
  typeMap: Record<string, string>;
}

function normalizeTypeName(type: string): string {
  return type.trim().replace(/(\[\])+$/, "").trim();
}

/** Renders a structural Rust type back to source text. */
export function renderRustType(type: RustType): string {
  switch (type.kind) {
    case "primitive":
    case "named":
      return type.name;
    case "vec":
      return `Vec<${renderRustType(type.inner)}>`;
    case "option":
      return `Option<${renderRustType(type.inner)}>`;
  }
}

/** Builds the module tree from the artifacts' module paths. */
function buildModuleTree(artifacts: IrArtifact[]): IrModuleDir {
  const root: IrModuleDir = { name: "", files: [], dirs: [] };

  const childDir = (parent: IrModuleDir, name: string): IrModuleDir => {
    let dir = parent.dirs.find((d) => d.name === name);
    if (!dir) {
      dir = { name, files: [], dirs: [] };
      parent.dirs.push(dir);
    }
    return dir;
  };

  for (const artifact of artifacts) {
    let node = root;
    for (const segment of artifact.modulePath) node = childDir(node, segment);
    node.files.push(artifact);
  }

  const sort = (dir: IrModuleDir) => {
    dir.dirs.sort((a, b) => a.name.localeCompare(b.name));
    dir.files.sort((a, b) => a.fileName.localeCompare(b.fileName));
    dir.dirs.forEach(sort);
  };
  sort(root);
  return root;
}

/**
 * Resolves the source name of a (hoisted) field type. Defensive: if a field
 * still carries an inline definition, fall back to its declared name.
 */
function fieldTypeName(field: Field): string {
  return typeof field.type === "string" ? field.type : dataTypeDefName(field.type);
}

/**
 * `validator` format validators we can map directly from a field format preset.
 * `email` and `url` ship with the crate; `ip` distinguishes v4/v6 through the
 * `v4`/`v6` options of the derive attribute.
 */
const FORMAT_VALIDATORS: Record<string, string> = {
  email: "email",
  url: "url",
  ipv4: "ip(v4 = true)",
  ipv6: "ip(v6 = true)",
};

/**
 * Format presets `validator` has no built-in check for. They are routed to
 * hand-written helpers in the generated `validation` module instead, referenced
 * from the derive as `custom(function = "crate::validation::<helper>")`.
 */
const CUSTOM_FORMAT_VALIDATORS: Record<string, string> = {
  uuid: "validate_uuid",
  date: "validate_date",
  datetime: "validate_datetime",
  time: "validate_time",
};

/** Prefix marking a `validator` attribute that calls a generated helper. */
const CUSTOM_VALIDATOR_PREFIX = "custom(function = \"crate::validation::";

/** Matches a `custom(function = "crate::validation::<helper>")` attribute. */
const CUSTOM_VALIDATOR_RE = /^custom\(function = "crate::validation::(\w+)"\)$/;

/** Builds the attribute that calls a generated validation helper. */
function customValidatorAttr(helper: string): string {
  return `${CUSTOM_VALIDATOR_PREFIX}${helper}")`;
}

/** Renders a numeric bound, keeping a decimal point for float fields. */
function formatBound(value: number, isFloat: boolean): string {
  return isFloat && Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function rangeArgs(
  min: number | undefined,
  max: number | undefined,
  isFloat: boolean,
): string {
  const parts: string[] = [];
  if (min !== undefined) parts.push(`min = ${formatBound(min, isFloat)}`);
  if (max !== undefined) parts.push(`max = ${formatBound(max, isFloat)}`);
  return parts.join(", ");
}

/**
 * Turns a field's spec validation into `validator` attribute expressions.
 * Named formats with no built-in check (uuid/date/datetime/time) become
 * `custom(...)` attributes that call the generated `validation` helpers.
 * Anything `validator` cannot express from the spec alone (a raw regex, a
 * free-text rule) is reported as a note and skipped.
 */
function buildValidations(
  field: Field,
  typeMap: Record<string, string>,
  isArray: boolean,
): { attrs: string[]; notes: string[] } {
  const validation = field.validation;
  if (!validation) return { attrs: [], notes: [] };

  const attrs: string[] = [];
  const notes: string[] = [];
  const num = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const normalized = normalizeTypeName(fieldTypeName(field)).toLowerCase();
  const mappedRust = typeMap[normalized];
  const isFloat = Boolean(mappedRust && /f32|f64/.test(mappedRust));
  const isInteger = Boolean(mappedRust && /^[iu](8|16|32|64|128|size)$/.test(mappedRust));

  if (isArray) {
    const min = num(validation.minItems);
    const max = num(validation.maxItems);
    if (min !== undefined || max !== undefined) attrs.push(`length(${rangeArgs(min, max, false)})`);
  } else if (isFloat || isInteger) {
    const min = num(validation.min);
    const max = num(validation.max);
    if (min !== undefined || max !== undefined) attrs.push(`range(${rangeArgs(min, max, isFloat)})`);
  } else {
    const min = num(validation.minLength);
    const max = num(validation.maxLength);
    if (min !== undefined || max !== undefined) attrs.push(`length(${rangeArgs(min, max, false)})`);
    if (validation.format) {
      const format = validation.format.toLowerCase();
      const native = FORMAT_VALIDATORS[format];
      const custom = CUSTOM_FORMAT_VALIDATORS[format];
      if (native) attrs.push(native);
      else if (custom) attrs.push(customValidatorAttr(custom));
      else notes.push(`custom format "${validation.format}" has no validator mapping`);
    }
  }

  if (validation.pattern) {
    notes.push(`custom pattern ${JSON.stringify(validation.pattern)} needs a Regex`);
  }
  if (validation.rule) {
    notes.push(`custom rule ${JSON.stringify(validation.rule)}`);
  }
  return { attrs, notes };
}

function makeField(field: Field, typeMap: Record<string, string>): IrField {
  const rawName = fieldTypeName(field);
  const normalized = normalizeTypeName(rawName);
  const isPrimitive = normalized.toLowerCase() in typeMap;

  let base: RustType;
  if (isPrimitive) {
    base = { kind: "primitive", name: typeMap[normalized.toLowerCase()] };
  } else {
    base = { kind: "named", name: pascalCase(normalized) };
  }

  const array = Boolean(field.array);
  const optional = !field.required;
  let type: RustType = array ? { kind: "vec", inner: base } : base;
  if (optional) type = { kind: "option", inner: type };

  const rustName = snakeCase(field.name) || field.name;
  const { attrs, notes } = buildValidations(field, typeMap, array);

  return {
    name: field.name,
    rustName,
    rustType: renderRustType(type),
    type,
    needsRename: rustName !== field.name,
    optional,
    array,
    tag: field.tag,
    doc: field.description,
    validations: attrs,
    validationNotes: notes,
    refName: isPrimitive ? undefined : base.kind === "named" ? base.name : undefined,
  };
}

function makeFields(fields: Field[] | undefined, typeMap: Record<string, string>): IrField[] {
  return (fields ?? []).map((field) => makeField(field, typeMap));
}

/**
 * Projection params are the identity/query inputs, so they are always required
 * (rendered as the bare type, never `Option`). This also lets a query tag format
 * the param directly with `format!("tag:{}", self.param)`.
 */
function makeProjectionParams(
  fields: Field[] | undefined,
  typeMap: Record<string, string>,
): IrField[] {
  return makeFields(
    (fields ?? []).map((field) => ({ ...field, required: true })),
    typeMap,
  );
}

/** Every field a generated item carries, across all of its field lists. */
function artifactFields(artifact: IrArtifact): IrField[] {
  return [
    ...(artifact.fields ?? []),
    ...(artifact.inputs ?? []),
    ...(artifact.responses ?? []),
    ...(artifact.params ?? []),
    ...((artifact.methods ?? []).flatMap((method) => [...method.params, ...method.returns])),
  ];
}

function makeMethods(
  methods: NonNullable<Specification["services"]>[number]["methods"],
  typeMap: Record<string, string>,
): IrMethod[] {
  return (methods ?? []).map((method) => ({
    name: method.name,
    rustName: snakeCase(method.name) || method.name,
    doc: method.description,
    params: makeFields(method.params, typeMap),
    returns: makeFields(method.returns, typeMap),
  }));
}

/** Builds projection query items; event refs are resolved later (module paths unknown yet). */
function makeRawQueryItems(query: SpecQueryItem[] | undefined): IrQueryItem[] {
  return (query ?? []).map((item) => ({
    types: item.types ?? [],
    typeRefs: [],
    tags: (item.tags ?? []).map((tag) => ({
      tag: tag.tag,
      field: tag.field,
      rustName: snakeCase(tag.field) || tag.field,
    })),
    doc: item.description,
    events: [],
    notes: [],
  }));
}

/**
 * Resolves a projection's query items against the generated events and params:
 * collects the unique events to fold, groups their import paths, and drops
 * tags that do not bind to a param (recording a note for each).
 */
function resolveProjection(artifact: IrArtifact, eventIndex: Map<string, IrArtifact>): void {
  const params = artifact.params ?? [];
  const paramByKey = new Map(params.map((field) => [nameKey(field.name), field]));
  const events = new Map<string, IrEventRef>();
  const imports = new Map<string, { modulePath: string[]; names: Set<string> }>();
  const notes: string[] = [];

  for (const item of artifact.queryItems ?? []) {
    const seenTypes = new Set<string>();
    for (const type of item.types) {
      const key = nameKey(type);
      if (seenTypes.has(key)) continue;
      seenTypes.add(key);
      const event = eventIndex.get(key);
      if (!event) {
        item.typeRefs.push({ literal: snakeCase(type) || type });
        item.notes.push(`event \`${type}\` is not defined in the spec`);
        continue;
      }
      item.typeRefs.push({ literal: event.fileName, rustName: event.rustName });
      const ref: IrEventRef = {
        rustName: event.rustName,
        eventType: event.fileName,
        modulePath: event.modulePath,
      };
      item.events.push(ref);
      if (!events.has(event.rustName)) events.set(event.rustName, ref);
      const importKey = event.modulePath.join("/");
      const entry =
        imports.get(importKey) ?? { modulePath: event.modulePath, names: new Set<string>() };
      entry.names.add(event.rustName);
      imports.set(importKey, entry);
    }

    const resolvedTags: IrQueryTag[] = [];
    for (const tag of item.tags) {
      const param = paramByKey.get(nameKey(tag.field));
      if (!param) {
        item.notes.push(`tag \`${tag.tag}\` binds to unknown param \`${tag.field}\``);
        continue;
      }
      resolvedTags.push({ tag: tag.tag, field: param.name, rustName: param.rustName });
    }
    item.tags = resolvedTags;
  }

  for (const item of artifact.queryItems ?? []) notes.push(...item.notes);
  if ((artifact.queryItems ?? []).length === 0) {
    notes.push("no query items declared; the query matches nothing");
  }

  artifact.projectionEvents = Array.from(events.values());
  artifact.eventImports = Array.from(imports.values())
    .map((entry) => ({
      modulePath: entry.modulePath,
      names: Array.from(entry.names).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.modulePath.join("/").localeCompare(b.modulePath.join("/")));
  artifact.projectionNotes = notes.length > 0 ? notes : undefined;
}

/** Builds the `type` artifacts from the hoisted data-type registry. */
function buildTypeArtifacts(types: DataTypeDef[], typeMap: Record<string, string>): IrArtifact[] {
  return types.map((def) => {
    const name = dataTypeDefName(def);
    const base = {
      kind: "type" as const,
      name,
      rustName: pascalCase(name),
      fileName: snakeCase(name) || pascalCase(name).toLowerCase(),
      modulePath: [] as string[],
    };

    if ("object" in def) {
      return {
        ...base,
        doc: def.description,
        typeKind: "object" as const,
        fields: makeFields(def.fields, typeMap),
      };
    }
    if ("enum" in def) {
      const variants: IrEnumVariant[] = (def.values ?? []).map((value) => {
        const memberName = typeof value === "string" ? value : value.name;
        const doc = typeof value === "string" ? undefined : value.description;
        return { name: memberName, rustName: pascalCase(memberName), doc };
      });
      return { ...base, doc: def.description, typeKind: "enum" as const, variants };
    }
    // alias
    const normalized = normalizeTypeName(def.of);
    const isPrimitive = normalized.toLowerCase() in typeMap;
    const inner: RustType = isPrimitive
      ? { kind: "primitive", name: typeMap[normalized.toLowerCase()] }
      : { kind: "named", name: pascalCase(normalized) };
    const wrapped: RustType = def.array ? { kind: "vec", inner } : inner;
    const hasAliasValidation =
      def.validation !== undefined &&
      Object.values(def.validation).some((value) => value !== undefined && value !== "");
    return {
      ...base,
      doc: def.description,
      typeKind: "alias" as const,
      aliasOf: renderRustType(wrapped),
      aliasRefName: isPrimitive ? undefined : inner.kind === "named" ? inner.name : undefined,
      validationNotes: hasAliasValidation
        ? ["alias validation is not enforceable on a type alias; use a newtype to enforce it"]
        : undefined,
    };
  });
}

/**
 * Builds a `name -> domain module` index from every place the spec records
 * membership, in priority order:
 *
 *   1. a card listed directly under a domain (`domains[].cards`);
 *   2. a card listed under a group that belongs to a domain (`groups[].cards`);
 *   3. a card named in a slice lane (`slices[].lanes[].cards`).
 *
 * Boards commonly attach cards to slices and groups rather than to the domain
 * directly, so all three sources matter. Earlier sources win; within a source,
 * the first occurrence wins (document order), which keeps a card shared across
 * slices in one, stable domain.
 */
function domainIndex(spec: Specification): Map<string, string> {
  const map = new Map<string, string>();
  const moduleByDomain = new Map<string, string>();
  for (const domain of spec.domains ?? []) {
    moduleByDomain.set(nameKey(domain.name), snakeCase(domain.name) || COMMON_MODULE);
  }

  const assign = (card: string, domainName: string): void => {
    const module = moduleByDomain.get(nameKey(domainName));
    const key = nameKey(card);
    if (module && key && !map.has(key)) map.set(key, module);
  };

  for (const domain of spec.domains ?? []) {
    for (const card of domain.cards ?? []) assign(card, domain.name);
  }
  for (const group of spec.groups ?? []) {
    if (!group.domain) continue;
    for (const card of group.cards ?? []) assign(card, group.domain);
  }
  for (const slice of spec.slices ?? []) {
    if (!slice.domain) continue;
    for (const lane of slice.lanes ?? []) {
      for (const card of lane.cards ?? []) assign(card, slice.domain);
    }
  }

  return map;
}

/**
 * Assigns a domain to every data type by usage: a type used by exactly one
 * domain lives in that domain; a type used by several (or none) goes to
 * `common`. Usage propagates through nested type references.
 */
function inferTypeDomains(
  artifacts: IrArtifact[],
  cardDomain: (artifact: IrArtifact) => string,
): Map<string, Set<string>> {
  const domainsByName = new Map<string, Set<string>>();
  const typeNames = new Set(
    artifacts.filter((a) => a.kind === "type").map((a) => nameKey(a.name)),
  );

  const refs = (artifact: IrArtifact): string[] => {
    const names: string[] = [];
    for (const field of artifactFields(artifact)) if (field.refName) names.push(field.refName);
    if (artifact.aliasRefName) names.push(artifact.aliasRefName);
    return names;
  };

  // Seed from cards (events/commands/...), which already know their domain.
  for (const artifact of artifacts) {
    if (artifact.kind === "type") continue;
    const module = cardDomain(artifact);
    for (const ref of refs(artifact)) {
      const key = nameKey(ref);
      if (!typeNames.has(key)) continue;
      const set = domainsByName.get(key) ?? new Set<string>();
      set.add(module);
      domainsByName.set(key, set);
    }
  }

  // Propagate: if a type is used by a domain, whatever it references is too.
  const typeArtifacts = artifacts.filter((a) => a.kind === "type");
  let changed = true;
  while (changed) {
    changed = false;
    for (const artifact of typeArtifacts) {
      const key = nameKey(artifact.name);
      const set = domainsByName.get(key);
      if (!set || set.size === 0) continue;
      for (const ref of refs(artifact)) {
        const refKey = nameKey(ref);
        if (!typeNames.has(refKey)) continue;
        const refSet = domainsByName.get(refKey) ?? new Set<string>();
        const before = refSet.size;
        for (const module of set) refSet.add(module);
        if (refSet.size !== before || !domainsByName.has(refKey)) {
          domainsByName.set(refKey, refSet);
          changed = true;
        }
      }
    }
  }

  return domainsByName;
}

function hasRustMarker(artifacts: IrArtifact[], marker: string): boolean {
  for (const artifact of artifacts) {
    if (artifact.aliasOf && artifact.aliasOf.includes(marker)) return true;
    if (artifactFields(artifact).some((field) => field.rustType.includes(marker))) return true;
  }
  return false;
}

function needsValidator(artifacts: IrArtifact[]): boolean {
  return artifacts.some((artifact) =>
    artifactFields(artifact).some((field) => field.validations.length > 0),
  );
}

/**
 * Names of the generated `validation` helpers any field refers to, sorted.
 * Drives both the crate-level `validation` module and the `pub mod` line.
 */
function collectValidationHelpers(artifacts: IrArtifact[]): string[] {
  const helpers = new Set<string>();
  for (const artifact of artifacts) {
    for (const field of artifactFields(artifact)) {
      for (const attr of field.validations) {
        const match = CUSTOM_VALIDATOR_RE.exec(attr);
        if (match) helpers.add(match[1]);
      }
    }
  }
  return Array.from(helpers).sort((a, b) => a.localeCompare(b));
}

function collectDeps(artifacts: IrArtifact[], extra: IrDep[]): IrDep[] {
  const deps: IrDep[] = [{ name: "serde", version: "1", features: ["derive"] }];
  const hasState = artifacts.some((artifact) => artifact.kind === "state");
  const hasView = artifacts.some((artifact) => artifact.kind === "view");
  if (hasState || hasView) {
    // Projections read the event store and fold JSON payloads.
    deps.push({ name: "event-store", git: EVENT_STORE_GIT });
    deps.push({ name: "futures-util", version: "0.3" });
    deps.push({ name: "serde_json", version: "1" });
    // Only Views persist through async reducer methods, wired with async-trait.
    if (hasView) deps.push({ name: "async-trait", version: "0.1" });
  }
  if (needsValidator(artifacts)) {
    deps.push({ name: "validator", version: "0.18", features: ["derive"] });
  }
  if (hasRustMarker(artifacts, "Uuid")) deps.push({ name: "uuid", version: "1", features: ["serde"] });
  if (hasRustMarker(artifacts, "Decimal")) deps.push({ name: "rust_decimal", version: "1" });
  if (
    hasRustMarker(artifacts, "NaiveDate") ||
    hasRustMarker(artifacts, "NaiveTime") ||
    hasRustMarker(artifacts, "DateTime")
  ) {
    deps.push({ name: "chrono", version: "0.4", features: ["serde"] });
  }

  const byName = new Map(deps.map((dep) => [dep.name, dep]));
  for (const dep of extra) byName.set(dep.name, dep);
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Builds the crate IR from a hoisted specification. */
export function buildIr({ spec, types, config }: BuildIrInput): BuildIrResult {
  const typeMap: Record<string, string> = { ...DEFAULT_TYPE_MAP };
  for (const [key, value] of Object.entries(config.typeMap ?? {})) {
    typeMap[key.toLowerCase()] = value;
  }

  const crateName = config.crate?.name?.trim() || snakeCase(spec.name) || "domain";

  const artifacts: IrArtifact[] = [...buildTypeArtifacts(types, typeMap)];

  const push = (
    kind: IrArtifact["kind"],
    name: string,
    extra: Partial<IrArtifact> = {},
  ): void => {
    artifacts.push({
      kind,
      name,
      rustName: pascalCase(name),
      fileName: snakeCase(name) || pascalCase(name).toLowerCase(),
      modulePath: [],
      ...extra,
    });
  };

  for (const event of spec.events ?? []) {
    push("event", event.name, { doc: event.description, fields: makeFields(event.fields, typeMap) });
  }
  for (const command of spec.commands ?? []) {
    push("command", command.name, {
      doc: command.description,
      action: command.action,
      inputs: makeFields(command.inputs, typeMap),
      responses: makeFields(command.responses, typeMap),
    });
  }
  for (const query of spec.queries ?? []) {
    push("query", query.name, {
      doc: query.description,
      action: query.action,
      inputs: makeFields(query.params, typeMap),
      responses: makeFields(query.responses, typeMap),
    });
  }
  for (const view of spec.views ?? []) {
    push("view", view.name, {
      doc: view.description,
      params: makeProjectionParams(view.params, typeMap),
      fields: makeFields(view.states, typeMap),
      queryItems: makeRawQueryItems(view.query),
    });
  }
  for (const state of spec.states ?? []) {
    push("state", state.name, {
      doc: state.description,
      params: makeProjectionParams(state.params, typeMap),
      fields: makeFields(state.states, typeMap),
      queryItems: makeRawQueryItems(state.query),
    });
  }
  for (const service of spec.services ?? []) {
    push("service", service.name, {
      doc: service.description,
      methods: makeMethods(service.methods, typeMap),
    });
  }

  // Module assignment: cards come from the domain membership lists; types are
  // inferred from usage.
  const byName = domainIndex(spec);
  const cardDomain = (artifact: IrArtifact): string =>
    byName.get(nameKey(artifact.name)) ?? COMMON_MODULE;
  const typeDomains = inferTypeDomains(artifacts, cardDomain);

  for (const artifact of artifacts) {
    let module: string;
    if (artifact.kind === "type") {
      const domains = typeDomains.get(nameKey(artifact.name));
      module = domains && domains.size === 1 ? Array.from(domains)[0] : COMMON_MODULE;
    } else {
      module = cardDomain(artifact);
    }
    artifact.modulePath = [module, KIND_FOLDER[artifact.kind]];
  }

  // Resolve each projection's DCB query now that every module path is known.
  const eventIndex = new Map(
    artifacts.filter((a) => a.kind === "event").map((a) => [nameKey(a.name), a]),
  );
  for (const artifact of artifacts) {
    if (artifact.kind === "view" || artifact.kind === "state") {
      resolveProjection(artifact, eventIndex);
    }
  }

  artifacts.sort((a, b) => {
    const pathA = a.modulePath.join("/");
    const pathB = b.modulePath.join("/");
    return pathA === pathB ? a.fileName.localeCompare(b.fileName) : pathA.localeCompare(pathB);
  });

  // A prelude re-exports every data type flat, so items can reference one
  // another by bare name without cross-module paths. Flag which items need it.
  for (const artifact of artifacts) {
    const refs: string[] = [];
    for (const field of artifactFields(artifact)) if (field.refName) refs.push(field.refName);
    if (artifact.aliasRefName) refs.push(artifact.aliasRefName);
    artifact.usesPrelude = refs.length > 0;
    artifact.validates = artifactFields(artifact).some((field) => field.validations.length > 0);
  }

  const typeModules = Array.from(
    new Set(artifacts.filter((a) => a.kind === "type").map((a) => a.modulePath[0])),
  ).sort((a, b) => a.localeCompare(b));

  const domains: IrDomain[] = (spec.domains ?? []).map((domain) => ({
    name: domain.name,
    module: snakeCase(domain.name) || COMMON_MODULE,
  }));

  const extraDeps: IrDep[] = (config.crate?.deps ?? []).map((dep) => ({ ...dep }));

  return {
    typeMap,
    crate: {
      name: crateName,
      edition: config.crate?.edition ?? "2024",
      version: config.crate?.version ?? "0.1.0",
      domains,
      artifacts,
      modules: buildModuleTree(artifacts),
      typeModules,
      deps: collectDeps(artifacts, extraDeps),
      tags: spec.tags ?? [],
      validationHelpers: collectValidationHelpers(artifacts),
    },
  };
}

export { DEFAULT_TYPE_MAP, COMMON_MODULE, KIND_FOLDER };
