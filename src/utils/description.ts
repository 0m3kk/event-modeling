import type {
  CanvasObject,
  StormField,
  ModelField,
  ModelEnumValue,
} from "@/types";

/**
 * Reads the description text for a card header (`fieldId` omitted) or one of
 * its field / enum-value rows. Returns undefined when the target or its
 * description does not exist, so callers can skip rendering tooltips/editors.
 */
export function findDescriptionText(
  obj: CanvasObject,
  fieldId?: string,
): string | undefined {
  if (obj.type === "storm" && obj.stormData) {
    const data = obj.stormData;
    if (!fieldId) return data.description;
    const field =
      data.fields.find((f) => f.id === fieldId) ??
      (data.responseFields ?? []).find((f) => f.id === fieldId);
    return field?.description;
  }

  if (obj.type === "model" && obj.modelData) {
    const data = obj.modelData;
    if (!fieldId) return data.description;
    if (data.kind === "object") {
      return (data.fields ?? []).find((f) => f.id === fieldId)?.description;
    }
    if (data.kind === "enum") {
      return (data.values ?? []).find((v) => v.id === fieldId)?.description;
    }
  }

  return undefined;
}

/**
 * Reads the display name of a field / enum-value row, used to label the
 * description panel when it targets a row rather than the card.
 */
export function findRowName(
  obj: CanvasObject,
  fieldId?: string,
): string | undefined {
  if (!fieldId) return undefined;

  if (obj.type === "storm" && obj.stormData) {
    const data = obj.stormData;
    const field =
      data.fields.find((f) => f.id === fieldId) ??
      (data.responseFields ?? []).find((f) => f.id === fieldId);
    return field?.name;
  }

  if (obj.type === "model" && obj.modelData) {
    const data = obj.modelData;
    if (data.kind === "object") {
      return (data.fields ?? []).find((f) => f.id === fieldId)?.name;
    }
    if (data.kind === "enum") {
      return (data.values ?? []).find((v) => v.id === fieldId)?.name;
    }
  }

  return undefined;
}

/**
 * Writes (or removes, when `value` is undefined) a card/field description.
 * `fieldId` omitted targets the card-level description.
 */
export function applyDescription(
  obj: CanvasObject,
  fieldId: string | undefined,
  value: string | undefined,
  updateObject: (id: string, patch: Partial<CanvasObject>) => void,
): void {
  if (obj.type === "storm" && obj.stormData) {
    const data = obj.stormData;

    if (!fieldId) {
      if (value) {
        updateObject(obj.id, {
          stormData: { ...data, description: value },
        });
      } else if (data.description) {
        const { description: _omit, ...rest } = data;
        updateObject(obj.id, { stormData: rest });
      }
      return;
    }

    const updateFields = (fields: StormField[]) =>
      fields.map((f) => {
        if (f.id !== fieldId) return f;
        if (value) return { ...f, description: value };
        const { description: _omit, ...rest } = f;
        return rest;
      });

    const nextFields = updateFields(data.fields);
    const nextResponse = data.responseFields
      ? updateFields(data.responseFields)
      : data.responseFields;
    if (
      nextFields.some((f, i) => f !== data.fields[i]) ||
      (nextResponse &&
        data.responseFields &&
        nextResponse.some((f, i) => f !== data.responseFields![i]))
    ) {
      updateObject(obj.id, {
        stormData: {
          ...data,
          fields: nextFields,
          responseFields: nextResponse,
        },
      });
    }
    return;
  }

  if (obj.type === "model" && obj.modelData) {
    const data = obj.modelData;

    if (!fieldId) {
      if (value) {
        updateObject(obj.id, {
          modelData: { ...data, description: value },
        });
      } else if (data.description) {
        const { description: _omit, ...rest } = data;
        updateObject(obj.id, { modelData: rest });
      }
      return;
    }

    if (data.kind === "object") {
      const fields = data.fields ?? [];
      const nextFields = fields.map((f: ModelField) => {
        if (f.id !== fieldId) return f;
        if (value) return { ...f, description: value };
        const { description: _omit, ...rest } = f;
        return rest;
      });
      if (nextFields.some((f, i) => f !== fields[i])) {
        updateObject(obj.id, {
          modelData: { ...data, fields: nextFields },
        });
      }
    } else if (data.kind === "enum") {
      const values = data.values ?? [];
      const nextValues = values.map((v: ModelEnumValue) => {
        if (v.id !== fieldId) return v;
        if (value) return { ...v, description: value };
        const { description: _omit, ...rest } = v;
        return rest;
      });
      if (nextValues.some((v, i) => v !== values[i])) {
        updateObject(obj.id, {
          modelData: { ...data, values: nextValues },
        });
      }
    }
  }
}
