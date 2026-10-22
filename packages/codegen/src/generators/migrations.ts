/**
 * Renders sqlx-style SQL migrations for the View read models.
 *
 * A **View** is a persisted read model, so when `views.migrations` is on the
 * generator emits SQL migrations under `migrations/` using sqlx's reversible
 * layout: `<version>_create_<table>.up.sql` + `.down.sql`.
 *
 * The schema mirrors the generated Rust struct:
 *
 *  - the View's `params` (its identity) become the primary key and are always
 *    `NOT NULL`, and the projected fields become `NOT NULL` columns only when
 *    the spec marks them required;
 *  - every root table also gets the backend read-model bookkeeping columns
 *    (`last_event_position`, `created_at`, `updated_at`) and an index on the
 *    position, so reducers can reject stale events and catch-up resumes cheaply;
 *  - one shared `view_checkpoints` table records how far each View has folded
 *    the stream; it is pinned to the version epoch so it always applies first;
 *  - a field whose type is an object is **flattened**: a `profile` of type
 *    `AccountProfile { firstName, lastName }` becomes `profile_first_name` and
 *    `profile_last_name`, recursively;
 *  - an array of objects cannot live in one row, so it becomes a **child table**
 *    (one row per element) with a foreign key back to its parent, plus a
 *    `<field>_index` column that preserves the array order;
 *  - scalar types map to `text`, `boolean`, `smallint` / `integer` / `bigint`,
 *    `real` / `double precision`; `uuid`, `timestamptz`, `date` and `time` are
 *    recognised from the configured `typeMap`, and arrays keep their scalar
 *    element type (`text[]`, `uuid[]`, ...).
 *
 * Nothing here is random: a View's version is derived from its table name and a
 * child table sits immediately after its parent, so file names (and the parent
 * before child order) stay stable across runs and `--check` never reports
 * spurious drift.
 */
import { createHash } from "node:crypto";
import type { IrArtifact, IrCrate, IrField, RustType } from "../ir/types";
import type { RenderJob } from "./contract";

/** A single `CREATE TABLE` column. */
export interface MigrationColumn {
  /** snake_case column name. */
  name: string;
  /** PostgreSQL column type. */
  type: string;
  /** True when the column accepts `NULL`. */
  nullable: boolean;
  /** SQL default expression, e.g. `0` or `NOW()`. */
  default?: string;
}

/** An index created alongside a table. */
export interface MigrationIndex {
  name: string;
  columns: string[];
}

/** A foreign key constraint (used by child tables for arrays of objects). */
export interface MigrationForeignKey {
  columns: string[];
  references: string;
  referencedColumns: string[];
}

/** One planned table: the View's own table or a child table for an object array. */
export interface PlannedTable {
  name: string;
  columns: MigrationColumn[];
  primaryKey: string[];
  foreignKeys: MigrationForeignKey[];
  /** Extra indexes beyond the primary key. */
  indexes: MigrationIndex[];
  /** True for the table that mirrors the View struct, false for child tables. */
  root: boolean;
  /** Notes about types with no direct SQL mapping. */
  notes: string[];
}

/** Rust primitive (as rendered) -> PostgreSQL column type. */
const PRIMITIVE_SQL: Record<string, string> = {
  String: "text",
  str: "text",
  bool: "boolean",
  i8: "smallint",
  i16: "smallint",
  i32: "integer",
  i64: "bigint",
  u8: "smallint",
  u16: "integer",
  u32: "bigint",
  u64: "bigint",
  isize: "bigint",
  usize: "bigint",
  f32: "real",
  f64: "double precision",
};

/**
 * Fixed date the generated versions count from. sqlx orders migrations by their
 * numeric version prefix; counting from a fixed, view-derived offset keeps a
 * migration's version (and therefore its file name) stable while still reading
 * as a timestamp.
 */
const MIGRATION_EPOCH = 20240101000000;

/** Width of the second-resolution window a View's version block starts in. */
const MIGRATION_SPREAD = 10_000_000;

/** Resolution state shared while mapping a single View's columns. */
interface SqlTypeContext {
  /** Every generated data type, keyed by Rust name. */
  types: Map<string, IrArtifact>;
  /** Notes about types that had no direct SQL mapping. */
  notes: string[];
}

/** Maps a rendered Rust type name to a PostgreSQL type, when it has one. */
function primitiveSql(name: string): string | undefined {
  const known = PRIMITIVE_SQL[name];
  if (known) return known;
  // Config-preset types (uuid, datetime, ...) arrive here as Rust paths.
  if (/Uuid$/.test(name)) return "uuid";
  if (/DateTime|SystemTime/.test(name)) return "timestamptz";
  if (/NaiveDate$/.test(name)) return "date";
  if (/NaiveTime$/.test(name)) return "time";
  if (/Value$/.test(name)) return "jsonb";
  return undefined;
}

/** An array keeps its element type when scalar; composite elements need `jsonb`. */
function arraySql(inner: string): string {
  return inner === "jsonb" || inner.includes("[]") ? "jsonb" : `${inner}[]`;
}

/** Strips `Option` and `Vec` wrappers, leaving the element base type. */
function unwrapType(type: RustType): RustType {
  return type.kind === "option" || type.kind === "vec" ? unwrapType(type.inner) : type;
}

/**
 * Resolves a structural Rust type to an object data type (following aliases), so
 * its fields can be flattened. Returns undefined for scalars/enums.
 */
function resolveObject(
  type: RustType,
  types: Map<string, IrArtifact>,
  seen: Set<string> = new Set(),
): IrArtifact | undefined {
  if (type.kind !== "named") return undefined;
  const artifact = types.get(type.name);
  if (!artifact) return undefined;
  if (artifact.typeKind === "object") return artifact;
  if (artifact.typeKind === "alias" && artifact.aliasRefName && !seen.has(artifact.rustName)) {
    seen.add(artifact.rustName);
    return resolveObject({ kind: "named", name: artifact.aliasRefName }, types, seen);
  }
  return undefined;
}

/**
 * Resolves the PostgreSQL base type for a structural Rust type. `seen` guards
 * against alias cycles. Objects only reach here as View params (identity keys),
 * where flattening does not apply, and are stored as `jsonb`.
 */
function baseSqlType(type: RustType, ctx: SqlTypeContext, seen: Set<string>): string {
  if (type.kind === "vec") return arraySql(baseSqlType(type.inner, ctx, seen));
  if (type.kind === "option") return baseSqlType(type.inner, ctx, seen);

  const primitive = primitiveSql(type.name);
  if (primitive) return primitive;

  const artifact = ctx.types.get(type.name);
  if (!artifact) {
    ctx.notes.push(`no SQL mapping for \`${type.name}\`; stored as jsonb`);
    return "jsonb";
  }
  if (artifact.typeKind === "enum") return "text";
  if (artifact.typeKind === "object") return "jsonb";

  // Alias: follow it to the type it stands for.
  if (seen.has(artifact.rustName)) return "jsonb";
  seen.add(artifact.rustName);
  if (artifact.aliasRefName) {
    return baseSqlType({ kind: "named", name: artifact.aliasRefName }, ctx, seen);
  }
  const aliasOf = artifact.aliasOf ?? "String";
  const vec = /^Vec<(.+)>$/.exec(aliasOf);
  if (vec) return arraySql(primitiveSql(vec[1]) ?? "jsonb");
  const mapped = primitiveSql(aliasOf);
  if (mapped) return mapped;
  ctx.notes.push(`no SQL mapping for alias \`${artifact.rustName}\`; stored as jsonb`);
  return "jsonb";
}

interface PlanContext {
  types: Map<string, IrArtifact>;
  sql: SqlTypeContext;
  tables: PlannedTable[];
}

/** Creates a child table for an array-of-objects field and appends it to the plan. */
function createChildTable(
  owner: PlannedTable,
  field: IrField,
  prefix: string,
  plan: PlanContext,
): PlannedTable {
  // The child points back at the owner with the owner's primary key columns.
  const foreignKeyColumns: MigrationColumn[] = owner.primaryKey.map((name) => ({
    name,
    type: owner.columns.find((column) => column.name === name)?.type ?? "text",
    nullable: false,
  }));
  const index: MigrationColumn = { name: `${field.rustName}_index`, type: "bigint", nullable: false };
  const child: PlannedTable = {
    name: `${owner.name}_${prefix}${field.rustName}`,
    columns: [...foreignKeyColumns, index],
    primaryKey: [...owner.primaryKey, index.name],
    foreignKeys: [
      {
        columns: [...owner.primaryKey],
        references: owner.name,
        referencedColumns: [...owner.primaryKey],
      },
    ],
    indexes: [],
    root: false,
    notes: [],
  };
  plan.tables.push(child);
  return child;
}

/** Flattens `fields` into `owner`, recursing into objects and creating child tables. */
function planFields(
  fields: IrField[],
  owner: PlannedTable,
  prefix: string,
  parentNullable: boolean,
  plan: PlanContext,
): void {
  for (const field of fields) {
    const nullable = parentNullable || field.optional;
    const base = unwrapType(field.type);
    const object = resolveObject(base, plan.types);

    if (field.array) {
      if (object) {
        const child = createChildTable(owner, field, prefix, plan);
        planFields(object.fields ?? [], child, "", false, plan);
      } else {
        owner.columns.push({
          name: prefix + field.rustName,
          type: arraySql(baseSqlType(base, plan.sql, new Set())),
          nullable,
        });
      }
      continue;
    }

    if (object) {
      planFields(object.fields ?? [], owner, `${prefix}${field.rustName}_`, nullable, plan);
      continue;
    }

    owner.columns.push({
      name: prefix + field.rustName,
      type: baseSqlType(base, plan.sql, new Set()),
      nullable,
    });
  }
}

/**
 * Columns every materialized View table carries, mirroring the backend read
 * models: reducers advance `last_event_position` with the event they applied so
 * a replayed or out-of-order event cannot overwrite newer data, while the
 * timestamps make a row's age visible. They are skipped when the spec already
 * declares a column with the same name.
 */
const VIEW_SYSTEM_COLUMNS: MigrationColumn[] = [
  { name: "last_event_position", type: "bigint", nullable: false, default: "0" },
  { name: "created_at", type: "timestamptz", nullable: false, default: "NOW()" },
  { name: "updated_at", type: "timestamptz", nullable: false, default: "NOW()" },
];

/** Plans every table a View generates: its own table plus a table per object array. */
export function planView(view: IrArtifact, types: Map<string, IrArtifact>): PlannedTable[] {
  const sql: SqlTypeContext = { types, notes: [] };
  const plan: PlanContext = { types, sql, tables: [] };

  const primaryKey: MigrationColumn[] = (view.params ?? []).map((field) => ({
    name: field.rustName,
    type: baseSqlType(field.type, sql, new Set()),
    nullable: false,
  }));
  const root: PlannedTable = {
    name: view.fileName,
    columns: primaryKey.map((column) => ({ ...column })),
    primaryKey: primaryKey.map((column) => column.name),
    foreignKeys: [],
    indexes: [],
    root: true,
    notes: [],
  };
  plan.tables.push(root);

  planFields(view.fields ?? [], root, "", false, plan);

  // Add the bookkeeping columns after the projected fields so the spec's own
  // columns keep their natural order, and skip any name the spec already uses.
  const taken = new Set(root.columns.map((column) => column.name));
  for (const column of VIEW_SYSTEM_COLUMNS) {
    if (taken.has(column.name)) {
      root.notes.push(`the spec already declares \`${column.name}\`; generated bookkeeping skipped`);
      continue;
    }
    root.columns.push({ ...column });
    taken.add(column.name);
  }
  root.indexes.push({
    name: `idx_${view.fileName}_last_event_pos`,
    columns: ["last_event_position"],
  });

  if (root.primaryKey.length === 0) root.notes.push("the view declares no params; the table has no primary key");
  root.notes.push(...sql.notes);
  return plan.tables;
}

/** A deterministic version block of `count` consecutive versions, free of collisions. */
function allocateBlock(viewTable: string, count: number, taken: Set<number>): number {
  const digest = createHash("sha1").update(viewTable).digest();
  const offset = Number(digest.readBigUInt64BE(0) % BigInt(MIGRATION_SPREAD));
  let base = MIGRATION_EPOCH + offset;
  const isFree = (start: number): boolean => {
    for (let i = 0; i < count; i += 1) if (taken.has(start + i)) return false;
    return true;
  };
  while (!isFree(base)) base += count;
  for (let i = 0; i < count; i += 1) taken.add(base + i);
  return base;
}

/** Renders the `up`/`down` SQL for one planned table. */
function renderTableJobs(view: IrArtifact, table: PlannedTable, version: number, crate: IrCrate): RenderJob[] {
  const lines = table.columns.map((column) => {
    const suffix = column.nullable ? "" : " NOT NULL";
    const fallback = column.default ? ` DEFAULT ${column.default}` : "";
    return `"${column.name}" ${column.type}${suffix}${fallback}`;
  });
  if (table.primaryKey.length > 0) {
    lines.push(`PRIMARY KEY (${table.primaryKey.map((key) => `"${key}"`).join(", ")})`);
  }
  for (const foreignKey of table.foreignKeys) {
    const columns = foreignKey.columns.map((column) => `"${column}"`).join(", ");
    const referenced = foreignKey.referencedColumns.map((column) => `"${column}"`).join(", ");
    lines.push(`FOREIGN KEY (${columns}) REFERENCES "${foreignKey.references}" (${referenced})`);
  }

  const indexSql = table.indexes.map(
    (index) =>
      `CREATE INDEX IF NOT EXISTS "${index.name}" ON "${table.name}" (${index.columns
        .map((column) => `"${column}"`)
        .join(", ")});`,
  );

  const name = `${version}_create_${table.name}`;
  const origin =
    view.name === "ViewCheckpoints"
      ? "the shared View checkpoint table"
      : `the \`${view.name}\` view`;
  const context = {
    crate,
    artifact: view,
    table: table.name,
    version: String(version),
    origin,
    lines,
    indexSql,
    primaryKey: table.primaryKey,
    notes: table.notes,
  };
  return [
    { template: "migration_up.sql.njk", outPath: `migrations/${name}.up.sql`, context },
    { template: "migration_down.sql.njk", outPath: `migrations/${name}.down.sql`, context },
  ];
}

/**
 * The shared checkpoint table. It replaces the backend's generic `kv` lookup
 * with a dedicated table, so a View's progress is readable (and queryable)
 * without decoding JSON blobs.
 */
function checkpointTable(): PlannedTable {
  return {
    name: "view_checkpoints",
    columns: [
      { name: "view_name", type: "text", nullable: false },
      { name: "position", type: "bigint", nullable: false, default: "0" },
      { name: "updated_at", type: "timestamptz", nullable: false, default: "NOW()" },
    ],
    primaryKey: ["view_name"],
    foreignKeys: [],
    indexes: [],
    root: true,
    notes: [],
  };
}

/** One `up`/`down` migration pair per table across every View. */
export function migrationJobs(crate: IrCrate): RenderJob[] {
  const views = crate.artifacts.filter((artifact) => artifact.kind === "view");
  if (views.length === 0) return [];

  const types = new Map(
    crate.artifacts
      .filter((artifact) => artifact.kind === "type")
      .map((artifact) => [artifact.rustName, artifact] as const),
  );

  // Sort by table name so the version blocks (and collision bumps) are stable.
  const ordered = [...views].sort((a, b) => a.fileName.localeCompare(b.fileName));
  const taken = new Set<number>();
  const jobs: RenderJob[] = [];

  // Checkpoints are infrastructure for every View, so pin their version to the
  // epoch: it always sorts before the view blocks allocated after it.
  const checkpoint = checkpointTable();
  const checkpointArtifact: IrArtifact = {
    kind: "view",
    name: "ViewCheckpoints",
    rustName: "ViewCheckpoints",
    fileName: checkpoint.name,
    modulePath: [],
    doc: "Per-view catch-up checkpoints.",
  };
  taken.add(MIGRATION_EPOCH);
  jobs.push(...renderTableJobs(checkpointArtifact, checkpoint, MIGRATION_EPOCH, crate));

  for (const view of ordered) {
    const tables = planView(view, types);
    const base = allocateBlock(view.fileName, tables.length, taken);
    tables.forEach((table, index) => {
      jobs.push(...renderTableJobs(view, table, base + index, crate));
    });
  }
  return jobs;
}
