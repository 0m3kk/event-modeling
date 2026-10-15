/**
 * Hoists inline data definitions (Object / Enum / Alias) out of fields.
 *
 * The board spec expands a data type *inline* at the first field that
 * references it; later references stay as the plain name. That reads well in a
 * document but is awkward to generate from, because a field's `type` is either
 * a name or an arbitrary nested object.
 *
 * {@link hoistTypes} walks every field list, lifts each inline definition into
 * a single de-duplicated `types` registry, and rewrites the field to reference
 * it by name. The result is a spec whose field types are always strings, ready
 * for the IR builder.
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
 * mutated (nested field arrays that are rewritten are copied).
 */
export function hoistTypes(spec: Specification): HoistResult {
  const byKey = new Map<string, DataTypeDef>();
  const order: string[] = [];

  function register(def: DataTypeDef): string {
    const key = nameKey(dataTypeDefName(def));
    if (!byKey.has(key)) {
      // Register before descending so a (pathological) self-reference
      // terminates instead of recursing forever.
      byKey.set(key, def);
      order.push(key);
      if ("fields" in def && Array.isArray(def.fields)) {
        def.fields = def.fields.map(hoistField);
      }
    }
    return dataTypeDefName(def);
  }

  function hoistField(field: Field): Field {
    if (!isInlineType(field.type)) return field;
    return { ...field, type: register(field.type) };
  }

  const hoistFields = (fields: Field[] | undefined): Field[] | undefined =>
    fields ? fields.map(hoistField) : fields;

  const out: Specification = { ...spec };

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

  return { spec: out, types: order.map((key) => byKey.get(key)!) };
}
