import type {
  ModelData,
  StormData,
  StormField,
  FieldValidation,
  CanvasObject,
  ModelNodeKind,
  StormKind,
} from "@/types";
import { BDD_STEP_REF_LABELS, STORM_PHASE_LABELS } from "@/constants/storm";
import { splitWords } from "@/utils/naming";

export interface JsonSchemaProperty {
  type?: string;
  format?: string;
  description?: string;
  $ref?: string;
  items?: JsonSchemaProperty;
  enum?: string[];
  [key: string]: unknown;
}

export interface JsonSchemaDefinition {
  $schema?: string;
  /**
   * Custom vendor-extension marker (ignored by standard validators) naming the
   * source domain kind: object/enum/array/wrap for Model nodes, or
   * command/event/state/constraint/query/actor/external/bdd for Storm cards.
   */
  "x-kind"?: ModelNodeKind | StormKind;
  title: string;
  description?: string;
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
  enum?: string[];
  minItems?: number;
  maxItems?: number;
  definitions?: Record<string, JsonSchemaDefinition>;
}

/**
 * Keyed by the lowercased canonical primitive name, so both the stored
 * canonical spelling ("UUID", "DateTime") and legacy lowercase input resolve
 * to the same JSON Schema shape.
 */
const JSON_SCHEMA_PRIMITIVES: Record<string, JsonSchemaProperty> = {
  string: { type: "string" },
  number: { type: "number" },
  boolean: { type: "boolean" },
  date: { type: "string", format: "date" },
  datetime: { type: "string", format: "date-time" },
  uuid: { type: "string", format: "uuid" },
  email: { type: "string", format: "email" },
  url: { type: "string", format: "uri" },
  uri: { type: "string", format: "uri" },
  json: {},
  any: {},
  void: {},
};

export type JsonSchemaDialect = "draft-07" | "2020-12";

export interface JsonSchemaExportOptions {
  dialect?: JsonSchemaDialect;
}

/**
 * Normalize a human-readable name into a camelCase identifier for the exported
 * schema: definition keys (component names), property names (field names) and
 * `$ref` targets all share it, so references stay consistent.
 */
export function toCamelCaseIdentifier(name: string): string {
  const camel = splitWords(name.trim())
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("")
    .replace(/[^A-Za-z0-9_$]/g, "");
  if (!camel || /^[0-9]/.test(camel)) return `_${camel || "Model"}`;
  return camel;
}

export function resolveFieldSchema(
  fieldType: string,
  modelNames: Set<string>,
  defsKey: "definitions" | "$defs" = "definitions",
): JsonSchemaProperty {
  const cleanType = (fieldType || "string").trim().toLowerCase();

  if (JSON_SCHEMA_PRIMITIVES[cleanType]) {
    return { ...JSON_SCHEMA_PRIMITIVES[cleanType] };
  }

  // Model reference
  if (modelNames.has(fieldType.trim())) {
    return { $ref: `#/${defsKey}/${toCamelCaseIdentifier(fieldType.trim())}` };
  }

  return { type: "string" };
}

export function generateModelJsonSchema(
  model: ModelData,
  allModelNames = new Set<string>(),
  defsKey: "definitions" | "$defs" = "definitions",
): JsonSchemaDefinition {
  const title = toCamelCaseIdentifier(model.name);
  const def: JsonSchemaDefinition = {
    "x-kind": model.kind,
    title,
    description: model.description,
  };

  switch (model.kind) {
    case "enum": {
      def.type = "string";
      def.enum = (model.values ?? []).map((v) => v.name.trim()).filter(Boolean);
      break;
    }
    case "array": {
      def.type = "array";
      def.items = resolveFieldSchema(
        model.itemType ?? "string",
        allModelNames,
        defsKey,
      );
      // Arrays only carry item-count (length) limits.
      if (typeof model.validation?.minItems === "number") {
        def.minItems = model.validation.minItems;
      }
      if (typeof model.validation?.maxItems === "number") {
        def.maxItems = model.validation.maxItems;
      }
      break;
    }
    case "wrap": {
      return applyFieldValidation(
        {
          ...resolveFieldSchema(
            model.innerType ?? "string",
            allModelNames,
            defsKey,
          ),
          "x-kind": model.kind,
          title,
          description: model.description,
        },
        model.validation,
      );
    }
    case "service": {
      def.type = "object";
      def.properties = {};
      for (const m of model.methods ?? []) {
        const mName = toCamelCaseIdentifier(m.name);
        def.properties[mName] = {
          type: "string",
          description: m.description || `Service method: ${m.name}(...) -> ${m.returnType}`,
        };
      }
      break;
    }
    case "object":
    default: {
      def.type = "object";
      def.properties = {};
      const required: string[] = [];

      for (const field of model.fields ?? []) {
        const propName = toCamelCaseIdentifier(field.name);
        def.properties[propName] = applyFieldValidation(
          {
            ...resolveFieldSchema(field.fieldType, allModelNames, defsKey),
            description: field.description,
          },
          field.validation,
        );
        if (field.required) {
          required.push(propName);
        }
      }

      if (required.length > 0) {
        def.required = required;
      }
      break;
    }
  }

  return def;
}

/**
 * Merge a field's input-validation rules into its resolved property. Each rule
 * maps to a JSON Schema keyword; unset rules add nothing, so an un-validated
 * field keeps the base shape untouched.
 */
export function applyFieldValidation<T extends JsonSchemaProperty>(
  base: T,
  validation?: FieldValidation,
): T {
  if (!validation) return base;

  const next: JsonSchemaProperty = { ...base };
  if (typeof validation.minLength === "number") {
    next.minLength = validation.minLength;
  }
  if (typeof validation.maxLength === "number") {
    next.maxLength = validation.maxLength;
  }
  if ((validation.pattern ?? "").trim()) {
    next.pattern = validation.pattern;
  }
  if ((validation.format ?? "").trim()) {
    next.format = validation.format;
  }
  if (typeof validation.min === "number") {
    next.minimum = validation.min;
  }
  if (typeof validation.max === "number") {
    next.maximum = validation.max;
  }
  if (typeof validation.minItems === "number") {
    next.minItems = validation.minItems;
  }
  if (typeof validation.maxItems === "number") {
    next.maxItems = validation.maxItems;
  }
  const allowedValues = (validation.allowedValues ?? []).filter(
    (value) => value.trim().length > 0,
  );
  if (allowedValues.length > 0) {
    next.enum = allowedValues;
  }
  return next as T;
}

function buildFieldProperties(
  fields: StormField[],
  allModelNames: Set<string>,
  defsKey: "definitions" | "$defs",
): { properties: Record<string, JsonSchemaProperty>; required: string[] } {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const field of fields) {
    const propName = toCamelCaseIdentifier(field.name);
    properties[propName] = applyFieldValidation(
      {
        ...resolveFieldSchema(field.fieldType, allModelNames, defsKey),
        description: field.description,
      },
      field.validation,
    );
    if (field.required) {
      required.push(propName);
    }
  }
  return { properties, required };
}

function buildFieldGroup(
  fields: StormField[],
  description: string,
  allModelNames: Set<string>,
  defsKey: "definitions" | "$defs",
): JsonSchemaProperty {
  const { properties, required } = buildFieldProperties(
    fields,
    allModelNames,
    defsKey,
  );
  const group: JsonSchemaProperty = {
    type: "object",
    description,
    properties,
  };
  if (required.length > 0) group.required = required;
  return group;
}

/**
 * JSON schema for a State / Constraint projection card. Unlike Command/Event
 * (a flat object of fields), a projection card keeps its INPUT params, its DCB
 * query items, and its OUTPUT (rehydrated) fields as three distinct parts, so
 * the exported schema preserves the input/output split. Constraint cards add
 * their free-text invariant rules.
 */
function generateProjectionCardJsonSchema(
  storm: StormData,
  allModelNames: Set<string>,
  defsKey: "definitions" | "$defs",
): JsonSchemaDefinition {
  const title = toCamelCaseIdentifier(storm.name);
  const inputFields = storm.inputFields ?? [];
  const outputFields = storm.outputFields ?? [];

  const properties: Record<string, JsonSchemaProperty> = {
    inputFields: buildFieldGroup(
      inputFields,
      "INPUT params of the projection. Their tags are the only tags a query item can filter on.",
      allModelNames,
      defsKey,
    ),
    queryItems: {
      type: "array",
      description:
        "DCB query items selecting the events projected into this card (combined with OR).",
      items: {
        type: "object",
        properties: {
          types: {
            type: "array",
            items: { type: "string" },
            description:
              "Event type names selected by this item (empty matches all types).",
          },
          tagFields: {
            type: "array",
            items: { type: "string" },
            description:
              'Tagged INPUT params of this card, formatted "tag:field" (empty matches all tags).',
          },
        },
      },
    },
    outputFields: buildFieldGroup(
      outputFields,
      "OUTPUT fields produced by rehydrating the matching events.",
      allModelNames,
      defsKey,
    ),
  };

  if (storm.kind === "constraint") {
    properties.constraints = {
      type: "array",
      description:
        "Business invariant rules evaluated against the queried events.",
      items: { type: "string" },
    };
  }

  return {
    "x-kind": storm.kind,
    title,
    description: storm.description,
    type: "object",
    properties,
  };
}

/**
 * JSON schema for a BDD (Given/When/Then) card. Instead of typed fields it
 * carries a phase plus scenario steps, each a named Event/Command/Query/State/
 * Error with concrete example payload values.
 */
function generateBddCardJsonSchema(storm: StormData): JsonSchemaDefinition {
  return {
    "x-kind": "bdd",
    title: toCamelCaseIdentifier(storm.name),
    description: storm.description,
    type: "object",
    properties: {
      phase: {
        type: "string",
        enum: Object.keys(STORM_PHASE_LABELS),
        description: "Given/When/Then step this card represents.",
      },
      steps: {
        type: "array",
        description:
          "Scenario steps: a named ref plus the concrete payload example.",
        items: {
          type: "object",
          properties: {
            ref: {
              type: "string",
              enum: Object.keys(BDD_STEP_REF_LABELS),
              description:
                "What the step stands for (Event, Command, Query, State, Error, External).",
            },
            name: {
              type: "string",
              description: "Name of the referenced card.",
            },
            payload: {
              type: "array",
              description: "Concrete key/value example values for this step.",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
}

/**
 * JSON schema for an Actor card. An actor is fieldless: its payload is the set
 * of authorization permissions (wildcard patterns) granted to the role.
 */
function generateActorCardJsonSchema(storm: StormData): JsonSchemaDefinition {
  return {
    "x-kind": "actor",
    title: toCamelCaseIdentifier(storm.name),
    description: storm.description,
    type: "object",
    properties: {
      permissions: {
        type: "array",
        items: { type: "string" },
        description:
          "Authorization permissions (resource:verb:scope wildcard patterns) granted to this actor.",
      },
    },
  };
}

export function generateStormCardJsonSchema(
  storm: StormData,
  allModelNames = new Set<string>(),
  defsKey: "definitions" | "$defs" = "definitions",
): JsonSchemaDefinition {
  if (storm.kind === "state" || storm.kind === "constraint") {
    return generateProjectionCardJsonSchema(storm, allModelNames, defsKey);
  }
  if (storm.kind === "bdd") {
    return generateBddCardJsonSchema(storm);
  }
  if (storm.kind === "actor") {
    return generateActorCardJsonSchema(storm);
  }

  const title = toCamelCaseIdentifier(storm.name);
  const { properties, required } = buildFieldProperties(
    storm.fields,
    allModelNames,
    defsKey,
  );

  const def: JsonSchemaDefinition = {
    "x-kind": storm.kind,
    title,
    description: storm.description,
    type: "object",
    properties,
  };

  if (required.length > 0) {
    def.required = required;
  }

  // Command and Query carry a RESPONSE section below their payload/params.
  // It is exported as its own object group, mirroring State's OUTPUT split.
  if (storm.kind === "command" || storm.kind === "query") {
    def.properties!.responseFields = buildFieldGroup(
      storm.responseFields ?? [],
      storm.kind === "query"
        ? "RESPONSE read-model fields returned to the caller."
        : "RESPONSE fields the handler returns.",
      allModelNames,
      defsKey,
    );
  }

  return def;
}

export function exportCanvasJsonSchema(
  objects: CanvasObject[],
  options?: JsonSchemaExportOptions,
): string {
  const dialect = options?.dialect ?? "draft-07";
  const defsKey = dialect === "2020-12" ? "$defs" : "definitions";

  const modelObjects = objects.filter(
    (o): o is CanvasObject & { modelData: ModelData } =>
      o.type === "model" && !!o.modelData,
  );
  const stormObjects = objects.filter(
    (o): o is CanvasObject & { stormData: StormData } =>
      o.type === "storm" && !!o.stormData,
  );

  const modelNames = new Set(modelObjects.map((m) => m.modelData.name.trim()));

  const definitions: Record<string, JsonSchemaDefinition> = {};

  for (const obj of modelObjects) {
    const id = toCamelCaseIdentifier(obj.modelData.name);
    definitions[id] = generateModelJsonSchema(obj.modelData, modelNames, defsKey);
  }

  for (const obj of stormObjects) {
    const id = toCamelCaseIdentifier(obj.stormData.name);
    definitions[id] = generateStormCardJsonSchema(
      obj.stormData,
      modelNames,
      defsKey,
    );
  }

  if (dialect === "2020-12") {
    const rootSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "DomainSchema",
      description: "Exported Event Storming & Domain Model JSON Schema",
      type: "object",
      $defs: definitions,
    };
    return JSON.stringify(rootSchema, null, 2);
  }

  const rootSchema: JsonSchemaDefinition = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "DomainSchema",
    description: "Exported Event Storming & Domain Model JSON Schema",
    type: "object",
    definitions,
  };

  return JSON.stringify(rootSchema, null, 2);
}
