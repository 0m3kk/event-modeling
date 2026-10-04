import { stringify as stringifyYaml } from "yaml";
import type {
  CanvasObject,
  GroupInfo,
  ModelData,
  StormData,
  StormField,
  FieldValidation,
} from "@/types";
import { fullTagOf } from "@/utils/stormQuery";
import { coerceObjectArrays } from "@/constants/fieldType";
import {
  fieldNameMatches,
  normalizeExpressionForCodegen,
  toCamelCase,
} from "@/utils/naming";

export interface CodegenField {
  name: string;
  type: string;
  required?: boolean;
  tag?: string;
  description?: string;
  validation?: FieldValidation;
  mapping?: string;
}

export interface CodegenQueryItem {
  eventTypes: string[];
  tags: string[];
  set?: Record<string, string>;
}

export interface CodegenCommand {
  name: string;
  description?: string;
  slice?: string;
  action?: string;
  payload: CodegenField[];
  response?: CodegenField[];
}

export interface CodegenEvent {
  name: string;
  description?: string;
  slice?: string;
  fields: CodegenField[];
}

export interface CodegenReadModel {
  name: string;
  description?: string;
  slice?: string;
  isArray?: boolean;
  params: CodegenField[];
  queryItems: CodegenQueryItem[];
  outputFields: CodegenField[];
}

export interface CodegenQuery {
  name: string;
  description?: string;
  slice?: string;
  params: CodegenField[];
  response?: CodegenField[];
}

export interface CodegenConstraintRule {
  code?: string;
  description?: string;
  assert?: string;
  message?: string;
  severity?: "error" | "warning";
  status?: number;
}

export type CodegenConstraintRuleItem = string | CodegenConstraintRule;

export interface CodegenConstraint {
  name: string;
  description?: string;
  slice?: string;
  params: CodegenField[];
  queryItems: CodegenQueryItem[];
  outputFields: CodegenField[];
  rules: CodegenConstraintRuleItem[];
}

export interface CodegenActor {
  name: string;
  description?: string;
  slice?: string;
  permissions: string[];
}

export interface CodegenExternal {
  name: string;
  description?: string;
  slice?: string;
  fields: CodegenField[];
}

export interface CodegenScenarioStep {
  ref: "event" | "command" | "query" | "state" | "error" | "external";
  name: string;
  payload: Record<string, string>;
}

export interface CodegenScenario {
  name: string;
  phase: "given" | "when" | "then";
  description?: string;
  slice?: string;
  steps: CodegenScenarioStep[];
}

export interface CodegenModelField {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  validation?: FieldValidation;
}

export interface CodegenEnumValue {
  name: string;
  value?: string;
  description?: string;
}

export interface CodegenModelDef {
  kind: "object" | "enum" | "array" | "wrap";
  name: string;
  description?: string;
  slice?: string;
  group?: string;
  fields?: CodegenModelField[];
  values?: CodegenEnumValue[];
  itemType?: string;
  innerType?: string;
  validation?: FieldValidation;
}

export interface CodegenFlowEndpoint {
  name: string;
  kind: string;
  slice?: string;
}

export interface CodegenFlow {
  from: CodegenFlowEndpoint;
  to: CodegenFlowEndpoint;
  lineStyle?: string;
}

export interface CodegenSpec {
  version: "1.0";
  title: string;
  createdAt: string;
  slices?: string[];
  models: CodegenModelDef[];
  commands: CodegenCommand[];
  events: CodegenEvent[];
  readModels: CodegenReadModel[];
  queries: CodegenQuery[];
  constraints: CodegenConstraint[];
  actors: CodegenActor[];
  externals: CodegenExternal[];
  scenarios: CodegenScenario[];
  flows: CodegenFlow[];
}

export type CodegenExportFormat = "json" | "yaml";

export interface CodegenExportOptions {
  format?: CodegenExportFormat;
  projectName?: string;
}

function cleanField(field: StormField): CodegenField {
  const result: CodegenField = {
    name: field.name.trim(),
    type: field.fieldType.trim() || "string",
  };
  if (field.required) result.required = true;
  if ((field.tag ?? "").trim()) result.tag = field.tag!.trim();
  if ((field.description ?? "").trim()) result.description = field.description!.trim();
  if (field.validation && Object.keys(field.validation).length > 0) {
    result.validation = field.validation;
  }
  if ((field.mapping ?? "").trim()) {
    result.mapping = normalizeExpressionForCodegen(field.mapping!.trim());
  }
  return result;
}

function cleanOutputField(field: StormField): CodegenField {
  const f = cleanField(field);
  delete f.mapping;
  return f;
}

function resolveQueryItems(
  items: StormData["queryItems"],
  inputFields: StormField[] = [],
  outputFields: StormField[] = [],
): CodegenQueryItem[] {
  if (!items || items.length === 0) return [];
  const fieldMap = new Map<string, StormField>();
  for (const f of inputFields) {
    fieldMap.set(f.id, f);
  }
  const outputFieldMap = new Map<string, string>();
  for (const f of outputFields) {
    outputFieldMap.set(f.id, f.name.trim());
    outputFieldMap.set(f.name.trim(), f.name.trim());
  }

  return items.map((item) => {
    const tags: string[] = [];
    for (const fieldId of item.tagFieldIds ?? []) {
      const field = fieldMap.get(fieldId);
      if (field) {
        if ((field.tag ?? "").trim()) {
          tags.push(fullTagOf(field));
        } else if (field.name.trim()) {
          tags.push(field.name.trim());
        }
      }
    }

    const queryItem: CodegenQueryItem = {
      eventTypes: (item.types ?? []).map((t) => t.trim()).filter(Boolean),
      tags,
    };

    if (item.set && Object.keys(item.set).length > 0) {
      const resolvedSet: Record<string, string> = {};
      for (const [key, expr] of Object.entries(item.set)) {
        const cleanExpr = expr.trim();
        if (!cleanExpr) continue;
        let fieldName = outputFieldMap.get(key);
        if (!fieldName) {
          for (const f of outputFields) {
            if (fieldNameMatches(f.name, key) || fieldNameMatches(f.id, key)) {
              fieldName = f.name.trim();
              break;
            }
          }
        }
        // In codegen spec, set keys are camelCase identifiers (e.g. "registeredEmail")
        const specKey = toCamelCase(fieldName || key.trim());
        resolvedSet[specKey] = normalizeExpressionForCodegen(cleanExpr);
      }
      if (Object.keys(resolvedSet).length > 0) {
        queryItem.set = resolvedSet;
      }
    }

    return queryItem;
  });
}

function toModelDef(
  model: ModelData,
  location?: { slice?: string; group?: string },
): CodegenModelDef {
  const def: CodegenModelDef = {
    kind: model.kind,
    name: model.name.trim(),
  };
  if (model.description?.trim()) def.description = model.description.trim();
  if (location?.slice) def.slice = location.slice;
  if (location?.group) def.group = location.group;

  switch (model.kind) {
    case "enum":
      def.values = (model.values ?? []).map((v) => {
        const val: CodegenEnumValue = { name: v.name.trim() };
        if (v.value?.trim()) val.value = v.value.trim();
        if (v.description?.trim()) val.description = v.description.trim();
        return val;
      });
      break;
    case "array":
      def.itemType = model.itemType?.trim() || "string";
      if (model.validation && Object.keys(model.validation).length > 0) {
        def.validation = model.validation;
      }
      break;
    case "wrap":
      def.innerType = model.innerType?.trim() || "string";
      if (model.validation && Object.keys(model.validation).length > 0) {
        def.validation = model.validation;
      }
      break;
    case "object":
    default:
      def.fields = (model.fields ?? []).map((f) => {
        const field: CodegenModelField = {
          name: f.name.trim(),
          type: f.fieldType.trim() || "string",
        };
        if (f.required) field.required = true;
        if (f.description?.trim()) field.description = f.description.trim();
        if (f.validation && Object.keys(f.validation).length > 0) {
          field.validation = f.validation;
        }
        return field;
      });
      break;
  }

  return def;
}

export function buildCodegenSpec(
  objects: CanvasObject[],
  groups: GroupInfo[] = [],
  projectName?: string,
): CodegenSpec {
  // Repair any non-array field lists up front: this export runs from an
  // always-mounted modal's useMemo, so one malformed model must not crash the app.
  const safeObjects = objects.map(coerceObjectArrays);

  const groupNameMap = new Map<string, string>();
  for (const g of groups) {
    const name = g.name.trim();
    if (name) {
      groupNameMap.set(g.id, name);
    }
  }

  // Differentiate between actual slices (groups containing at least 1 storm card)
  // and shared model groups (groups containing only models, 0 storm cards).
  const sliceGroups = new Set<string>();
  const modelOnlyGroups = new Set<string>();

  for (const g of groups) {
    const members = safeObjects.filter((o) => o.groupId === g.id);
    const hasStorm = members.some((o) => o.type === "storm" && !!o.stormData);
    if (hasStorm) {
      sliceGroups.add(g.id);
    } else {
      const hasModel = members.some((o) => o.type === "model" && !!o.modelData);
      if (hasModel) {
        modelOnlyGroups.add(g.id);
      }
    }
  }

  const sliceNames: string[] = [];
  for (const g of groups) {
    if (sliceGroups.has(g.id)) {
      const name = groupNameMap.get(g.id);
      if (name && !sliceNames.includes(name)) {
        sliceNames.push(name);
      }
    }
  }

  const objectMap = new Map<string, CanvasObject>();
  for (const obj of safeObjects) {
    objectMap.set(obj.id, obj);
  }

  const spec: CodegenSpec = {
    version: "1.0",
    title: (projectName ?? "Domain Model").trim() || "Domain Model",
    createdAt: new Date().toISOString(),
    ...(sliceNames.length > 0 ? { slices: sliceNames } : {}),
    models: [],
    commands: [],
    events: [],
    readModels: [],
    queries: [],
    constraints: [],
    actors: [],
    externals: [],
    scenarios: [],
    flows: [],
  };

  // 1. Process Model and Storm cards
  for (const obj of safeObjects) {
    const groupId = obj.groupId;
    const isSlice = groupId ? sliceGroups.has(groupId) : false;
    const isModelOnly = groupId ? modelOnlyGroups.has(groupId) : false;
    const groupName = groupId ? groupNameMap.get(groupId) : undefined;

    if (obj.type === "model" && obj.modelData) {
      const location = isSlice
        ? { slice: groupName }
        : isModelOnly
        ? { group: groupName }
        : undefined;
      spec.models.push(toModelDef(obj.modelData, location));
      continue;
    }

    if (obj.type === "storm" && obj.stormData) {
      const slice = isSlice ? groupName : undefined;
      const storm = obj.stormData;
      const name = storm.name.trim();
      const desc = storm.description?.trim() || undefined;

      switch (storm.kind) {
        case "command": {
          const cmd: CodegenCommand = {
            name,
            ...(desc ? { description: desc } : {}),
            ...(slice ? { slice } : {}),
            ...(storm.action?.trim() ? { action: storm.action.trim() } : {}),
            payload: (storm.fields ?? []).map(cleanField),
          };
          if (storm.responseFields && storm.responseFields.length > 0) {
            cmd.response = storm.responseFields.map(cleanField);
          }
          spec.commands.push(cmd);
          break;
        }

        case "event": {
          spec.events.push({
            name,
            ...(desc ? { description: desc } : {}),
            ...(slice ? { slice } : {}),
            fields: (storm.fields ?? []).map(cleanField),
          });
          break;
        }

        case "state": {
          const inputFields = storm.inputFields ?? [];
          spec.readModels.push({
            name,
            ...(desc ? { description: desc } : {}),
            ...(slice ? { slice } : {}),
            ...(storm.isArray ? { isArray: true } : {}),
            params: inputFields.map(cleanField),
            queryItems: resolveQueryItems(
              storm.queryItems,
              inputFields,
              storm.outputFields ?? [],
            ),
            outputFields: (storm.outputFields ?? []).map(cleanOutputField),
          });
          break;
        }

        case "query": {
          const q: CodegenQuery = {
            name,
            ...(desc ? { description: desc } : {}),
            ...(slice ? { slice } : {}),
            params: (storm.fields ?? []).map(cleanField),
          };
          if (storm.responseFields && storm.responseFields.length > 0) {
            q.response = storm.responseFields.map(cleanField);
          }
          spec.queries.push(q);
          break;
        }

        case "constraint": {
          const inputFields = storm.inputFields ?? [];
          spec.constraints.push({
            name,
            ...(desc ? { description: desc } : {}),
            ...(slice ? { slice } : {}),
            params: inputFields.map(cleanField),
            queryItems: resolveQueryItems(
              storm.queryItems,
              inputFields,
              storm.outputFields ?? [],
            ),
            outputFields: (storm.outputFields ?? []).map(cleanOutputField),
            rules: (storm.constraints ?? [])
              .map((c) => {
                const hasStructured = Boolean(
                  (c.assert ?? "").trim() ||
                    (c.code ?? "").trim() ||
                    (c.message ?? "").trim() ||
                    c.status !== undefined ||
                    c.severity,
                );
                if (hasStructured) {
                  const ruleObj: CodegenConstraintRule = {};
                  if ((c.code ?? "").trim()) ruleObj.code = c.code!.trim();
                  if ((c.text ?? "").trim()) ruleObj.description = c.text.trim();
                  if ((c.assert ?? "").trim()) ruleObj.assert = normalizeExpressionForCodegen(c.assert!.trim());
                  if ((c.message ?? "").trim()) ruleObj.message = c.message!.trim();
                  if (c.severity) ruleObj.severity = c.severity;
                  if (typeof c.status === "number" && !Number.isNaN(c.status)) {
                    ruleObj.status = c.status;
                  }
                  return ruleObj;
                }
                return c.text?.trim() || "";
              })
              .filter((r): r is CodegenConstraintRuleItem => {
                if (typeof r === "string") return Boolean(r);
                return Boolean(
                  r && (r.assert || r.code || r.description || r.message),
                );
              }),
          });
          break;
        }

        case "actor": {
          spec.actors.push({
            name,
            ...(desc ? { description: desc } : {}),
            ...(slice ? { slice } : {}),
            permissions: (storm.permissions ?? [])
              .map((p) => p.trim())
              .filter(Boolean),
          });
          break;
        }

        case "external": {
          spec.externals.push({
            name,
            ...(desc ? { description: desc } : {}),
            ...(slice ? { slice } : {}),
            fields: (storm.fields ?? []).map(cleanField),
          });
          break;
        }

        case "bdd": {
          const steps: CodegenScenarioStep[] = (storm.steps ?? []).map((step) => {
            const payloadMap: Record<string, string> = {};
            for (const f of step.payload ?? []) {
              if (f.key?.trim()) {
                payloadMap[f.key.trim()] = f.value ?? "";
              }
            }
            return {
              ref: step.ref,
              name: step.name.trim(),
              payload: payloadMap,
            };
          });

          spec.scenarios.push({
            name,
            phase: storm.phase ?? "given",
            ...(desc ? { description: desc } : {}),
            ...(slice ? { slice } : {}),
            steps,
          });
          break;
        }
      }
    }
  }

  // 2. Process Connectors / Flows
  for (const obj of safeObjects) {
    if (obj.type === "connector" && obj.connectorData) {
      const { start, end, lineStyle } = obj.connectorData;
      const startObj = objectMap.get(start.objectId);
      const endObj = objectMap.get(end.objectId);
      if (!startObj || !endObj) continue;

      const getEndpointInfo = (target: CanvasObject): CodegenFlowEndpoint | null => {
        const slice = target.groupId && sliceGroups.has(target.groupId)
          ? groupNameMap.get(target.groupId)
          : undefined;
        if (target.type === "storm" && target.stormData) {
          return {
            name: target.stormData.name.trim(),
            kind: target.stormData.kind,
            ...(slice ? { slice } : {}),
          };
        }
        if (target.type === "model" && target.modelData) {
          return {
            name: target.modelData.name.trim(),
            kind: target.modelData.kind,
            ...(slice ? { slice } : {}),
          };
        }
        return null;
      };

      const fromInfo = getEndpointInfo(startObj);
      const toInfo = getEndpointInfo(endObj);

      if (fromInfo && toInfo) {
        spec.flows.push({
          from: fromInfo,
          to: toInfo,
          ...(lineStyle && lineStyle !== "solid" ? { lineStyle } : {}),
        });
      }
    }
  }

  return spec;
}

export function exportCodegenSpec(
  objects: CanvasObject[],
  groups: GroupInfo[] = [],
  options?: CodegenExportOptions,
): string {
  const spec = buildCodegenSpec(objects, groups, options?.projectName);
  const format = options?.format ?? "json";

  if (format === "yaml") {
    return stringifyYaml(spec, { indent: 2 });
  }

  return JSON.stringify(spec, null, 2);
}

export function downloadCodegenSpec(
  content: string,
  fileName: string,
  format: "yaml" | "json",
): void {
  const mimeType = format === "yaml" ? "text/yaml;charset=utf-8" : "application/json";
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function saveCodegenSpec(
  content: string,
  fileName: string,
  format: "yaml" | "json",
): Promise<boolean> {
  // In Tauri desktop environment, show the native Save As dialog
  if (
    typeof window !== "undefined" &&
    (Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) ||
      Boolean((window as unknown as Record<string, unknown>).__TAURI__))
  ) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");

      const filterName = format === "yaml" ? "YAML Spec" : "JSON Spec";

      const filePath = await save({
        defaultPath: fileName,
        filters: [
          {
            name: filterName,
            extensions: format === "yaml" ? ["yaml", "yml"] : ["json"],
          },
        ],
      });

      if (!filePath) {
        // User cancelled dialog
        return false;
      }

      await writeTextFile(filePath, content);
      return true;
    } catch (err) {
      console.error("Failed to save spec via native dialog, falling back to download:", err);
    }
  }

  // Web fallback or failure fallback: trigger browser download
  downloadCodegenSpec(content, fileName, format);
  return true;
}
