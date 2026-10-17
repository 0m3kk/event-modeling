/**
 * Normalises a spec's data definitions (Object / Enum / Alias).
 *
 * A document may either declare its data types once in the top-level `types`
 * registry, with fields referencing them by name, or (legacy) expand a type
 * inline at the first field that references it. {@link hoistTypes} accepts both:
 * it seeds from an existing `types` registry, lifts every remaining inline
 * definition into it, de-duplicates by name, and rewrites fields to reference
 * the definition by name. The result is a spec whose field types are always
 * strings, ready for the IR builder.
 */
import { nameKey } from "./naming";
import {
  dataTypeDefName,
  isInlineType,
  type DataTypeDef,
  type Field,
  type Specification,
  type StateLikeDef,
} from "./types";

export interface HoistResult {
  /** The spec with every inline field type replaced by a plain name. */
  spec: Specification;
  /** Every data definition discovered, de-duplicated by name, in first-seen order. */
  types: DataTypeDef[];
}

/**
 * Lifts inline data definitions out of a spec. Pure: the input spec is not
 * mutated (definitions and the field arrays that are rewritten are copied).
 */
export function hoistTypes(spec: Specification): HoistResult {
  const byKey = new Map<string, DataTypeDef>();
  const order: string[] = [];

  function register(def: DataTypeDef): string {
    const key = nameKey(dataTypeDefName(def));
    if (!byKey.has(key)) {
      order.push(key);
      // Register a placeholder before descending so a (pathological)
      // self-reference terminates instead of recursing forever.
      byKey.set(key, def);
      byKey.set(key, hoistDef(def));
    }
    return dataTypeDefName(def);
  }

  /** Returns a hoisted copy of a definition (its field types are rewired). */
  function hoistDef(def: DataTypeDef): DataTypeDef {
    if ("fields" in def && Array.isArray(def.fields)) {
      return { ...def, fields: def.fields.map(hoistField) };
    }
    return { ...def };
  }

  function hoistField(field: Field): Field {
    if (!isInlineType(field.type)) return field;
    return { ...field, type: register(field.type) };
  }

  const hoistFields = (fields: Field[] | undefined): Field[] | undefined =>
    fields ? fields.map(hoistField) : fields;

  const out: Specification = { ...spec };

  // Seed with the explicit `types` registry, if the document has one, so that
  // its definitions and any field references to them are normalised too.
  if (spec.types) for (const def of spec.types) register(def);

  if (spec.events) {
    out.events = spec.events.map((e) => ({ ...e, fields: hoistFields(e.fields) }));
  }
  if (spec.commands) {
    out.commands = spec.commands.map((c) => ({
      ...c,
      inputs: hoistFields(c.inputs),
      responses: hoistFields(c.responses),
    }));
  }
  if (spec.queries) {
    out.queries = spec.queries.map((q) => ({
      ...q,
      params: hoistFields(q.params),
      responses: hoistFields(q.responses),
    }));
  }
  const hoistStateLike = (s: StateLikeDef): StateLikeDef => ({
    ...s,
    params: hoistFields(s.params),
    states: hoistFields(s.states),
  });
  if (spec.views) out.views = spec.views.map(hoistStateLike);
  if (spec.states) out.states = spec.states.map(hoistStateLike);
  if (spec.services) {
    out.services = spec.services.map((s) => ({
      ...s,
      methods: s.methods?.map((m) => ({
        ...m,
        params: hoistFields(m.params),
        returns: hoistFields(m.returns),
      })),
    }));
  }

  const types = order.map((key) => byKey.get(key)!);
  if (types.length > 0) out.types = types;

  return { spec: out, types };
}
