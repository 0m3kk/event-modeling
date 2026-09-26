import type { ModelData, StormData, CanvasObject } from "@/types";

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
  definitions?: Record<string, JsonSchemaDefinition>;
}

const JSON_SCHEMA_PRIMITIVES: Record<string, JsonSchemaProperty> = {
  string: { type: "string" },
  number: { type: "number" },
  boolean: { type: "boolean" },
  date: { type: "string", format: "date" },
  datetime: { type: "string", format: "date-time" },
  uuid: { type: "string", format: "uuid" },
  email: { type: "string", format: "email" },
  url: { type: "string", format: "uri" },
  json: {},
  any: {},
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
      break;
    }
    case "wrap": {
      return {
        ...resolveFieldSchema(
          model.innerType ?? "string",
          allModelNames,
          defsKey,
        ),
        title,
        description: model.description,
      };
    }
    case "object":
    default: {
      def.type = "object";
      def.properties = {};
      const required: string[] = [];

      for (const field of model.fields ?? []) {
        const propName = sanitizeIdentifier(field.name);
        def.properties[propName] = {
          ...resolveFieldSchema(field.fieldType, allModelNames, defsKey),
          description: field.description,
        };
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

export function generateStormCardJsonSchema(
  storm: StormData,
  allModelNames = new Set<string>(),
  defsKey: "definitions" | "$defs" = "definitions",
): JsonSchemaDefinition {
  const title = sanitizeIdentifier(storm.name);
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const field of storm.fields) {
    const propName = sanitizeIdentifier(field.name);
    properties[propName] = {
      ...resolveFieldSchema(field.fieldType, allModelNames, defsKey),
      description: field.description,
    };
    if (field.required) {
      required.push(propName);
    }
  }

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
        o.stormData.kind === "state"),
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
