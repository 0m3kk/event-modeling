import type {
  ModelData,
  StormData,
  StormField,
  FieldValidation,
  CanvasObject,
} from "@/types";

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

export function sanitizeIdentifier(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9_$]/g, "_");
  if (!cleaned || /^[0-9]/.test(cleaned)) return `_${cleaned || "Model"}`;
  return cleaned;
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
    return { $ref: `#/${defsKey}/${sanitizeIdentifier(fieldType.trim())}` };
  }

  return { type: "string" };
}

export function generateModelJsonSchema(
  model: ModelData,
  allModelNames = new Set<string>(),
  defsKey: "definitions" | "$defs" = "definitions",
): JsonSchemaDefinition {
  const title = sanitizeIdentifier(model.name);
  const def: JsonSchemaDefinition = {
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
          title,
          description: model.description,
        },
        model.validation,
      );
    }
    case "object":
    default: {
      def.type = "object";
      def.properties = {};
      const required: string[] = [];

      for (const field of model.fields ?? []) {
        const propName = sanitizeIdentifier(field.name);
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
    const propName = sanitizeIdentifier(field.name);
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
  const title = sanitizeIdentifier(storm.name);
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
    title,
    description: storm.description,
    type: "object",
    properties,
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

  const title = sanitizeIdentifier(storm.name);
  const { properties, required } = buildFieldProperties(
    storm.fields,
    allModelNames,
    defsKey,
  );

  const def: JsonSchemaDefinition = {
    title,
    description: storm.description,
    type: "object",
    properties,
  };

  if (required.length > 0) {
    def.required = required;
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
      o.type === "storm" &&
      !!o.stormData &&
      (o.stormData.kind === "command" ||
        o.stormData.kind === "event" ||
        o.stormData.kind === "state" ||
        o.stormData.kind === "constraint"),
  );

  const modelNames = new Set(modelObjects.map((m) => m.modelData.name.trim()));

  const definitions: Record<string, JsonSchemaDefinition> = {};

  for (const obj of modelObjects) {
    const id = sanitizeIdentifier(obj.modelData.name);
    definitions[id] = generateModelJsonSchema(obj.modelData, modelNames, defsKey);
  }

  for (const obj of stormObjects) {
    const id = sanitizeIdentifier(obj.stormData.name);
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
