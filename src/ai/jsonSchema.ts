/**
 * Zod -> JSON Schema conversion for the OpenAI tools API, plus the naming
 * helpers that pair each create tool with its generated update tool.
 */

function isZodOptional(schema: any): boolean {
  const typeName = schema?._def?.typeName;
  return typeName === "ZodOptional" || typeName === "ZodDefault";
}

/**
 * Recursively converts a Zod schema into a JSON Schema object understood by the
 * OpenAI tools API. Unlike a flat shape dump, this preserves nested arrays and
 * objects (e.g. `queryItems[].tags[] = { tag, field }`) so the model knows the
 * exact structure it must produce.
 */
export function zodToJsonSchema(schema: any): any {
  if (!schema) return { type: "object" };

  const def = schema._def;
  const typeName = def?.typeName;
  const description: string | undefined = schema.description;
  const withDesc = (obj: any) => (description ? { ...obj, description } : obj);

  switch (typeName) {
    case "ZodString":
      return withDesc({ type: "string" });
    case "ZodNumber":
      return withDesc({ type: "number" });
    case "ZodBoolean":
      return withDesc({ type: "boolean" });
    case "ZodBigInt":
      return withDesc({ type: "integer" });
    case "ZodEnum":
      return withDesc({ type: "string", enum: def.values });
    case "ZodNativeEnum":
      return withDesc({ type: "string", enum: Object.values(def.values) });
    case "ZodLiteral":
      return withDesc({ type: typeof def.value, enum: [def.value] });
    case "ZodArray":
      return withDesc({ type: "array", items: zodToJsonSchema(def.type) });
    case "ZodObject": {
      const shape = typeof def.shape === "function" ? def.shape() : def.shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries<any>(shape)) {
        properties[key] = zodToJsonSchema(value);
        if (!isZodOptional(value)) required.push(key);
      }
      return withDesc({
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      });
    }
    case "ZodOptional":
    case "ZodDefault":
      return withDesc(zodToJsonSchema(def.innerType));
    case "ZodEffects":
      return withDesc(zodToJsonSchema(def.schema));
    case "ZodRecord":
    case "ZodAny":
    case "ZodUnknown":
      return withDesc({ type: "object" });
    default:
      return withDesc({ type: "object" });
  }
}

/** Maps a create tool name to its generated update counterpart. */
export function toUpdateToolName(createToolName: string): string {
  return createToolName.startsWith("create_")
    ? `update_${createToolName.slice("create_".length)}`
    : `update_${createToolName}`;
}

/** Maps an update tool name back to the create tool name it was derived from. */
export function toCreateToolName(updateToolName: string): string {
  return updateToolName.startsWith("update_")
    ? `create_${updateToolName.slice("update_".length)}`
    : updateToolName;
}
