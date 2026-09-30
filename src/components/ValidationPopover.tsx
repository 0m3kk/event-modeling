import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvasStore } from "@/store";
import type {
  CanvasObject,
  ModelData,
  ModelField,
  StormField,
} from "@/types";
import { ListChecks, X, Trash2, ChevronDown } from "lucide-react";
import {
  EMPTY_VALIDATION_DRAFT,
  draftToValidation,
  formatFromFieldType,
  isStringLikeFieldType,
  validationToDraft,
  type FieldValidationDraft,
} from "@/utils/fieldValidation";
import {
  STORM_VALIDATION_FORMATS,
  STORM_VALIDATION_FORMAT_LABELS,
} from "@/constants/storm";
import { MODEL_KIND_LABELS } from "@/constants/model";

interface ValidationPopoverProps {
  /** Storm card or model node whose validation is edited. */
  target: CanvasObject;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

/** What the panel currently edits. */
type ValidationEditor =
  | { scope: "stormField"; field: StormField }
  | { scope: "modelField"; field: ModelField }
  | { scope: "array"; data: ModelData }
  | { scope: "wrap"; data: ModelData };

/**
 * ValidationPopover — panel for input-validation rules, opened from the
 * options-bar checklist button.
 *
 * Targets, by selection:
 * - a Command payload field / Query param (storm field rows)
 * - an object model field row
 * - an array model node (item count only)
 * - a wrap model node (rules for the whole wrapped value)
 *
 * Enum nodes and Command/Query response fields have no validation. Edits apply live;
 * clearing every rule removes the validation object.
 */
export function ValidationPopover({
  target,
  onClose,
  anchorPosition,
}: ValidationPopoverProps) {
  const updateObject = useCanvasStore((s) => s.updateObject);
  const stormSelectedField = useCanvasStore((s) => s.stormSelectedField);
  const popoverRef = useRef<HTMLDivElement>(null);

  const editor = useMemo<ValidationEditor | null>(() => {
    const selectedFieldId =
      stormSelectedField?.objectId === target.id
        ? stormSelectedField.fieldId
        : undefined;

    if (target.type === "storm" && target.stormData) {
      const field = target.stormData.fields?.find(
        (f) => f.id === selectedFieldId,
      );
      return field ? { scope: "stormField", field } : null;
    }

    if (target.type === "model" && target.modelData) {
      const data = target.modelData;
      if (data.kind === "object") {
        const field = data.fields?.find((f) => f.id === selectedFieldId);
        return field ? { scope: "modelField", field } : null;
      }
      if (data.kind === "array") return { scope: "array", data };
      if (data.kind === "wrap") return { scope: "wrap", data };
    }
    return null;
  }, [target, stormSelectedField]);

  const scopeKey = editor
    ? editor.scope === "stormField" || editor.scope === "modelField"
      ? `${editor.scope}:${editor.field.id}`
      : `${editor.scope}:${editor.data.name}`
    : "";
  const currentValidation =
    editor && (editor.scope === "stormField" || editor.scope === "modelField")
      ? editor.field.validation
      : editor?.data.validation;

  const [draft, setDraft] = useState<FieldValidationDraft>(() =>
    validationToDraft(currentValidation),
  );
  const [showFormatList, setShowFormatList] = useState(false);

  // Re-seed the inputs when the panel switches to another target.
  const lastScopeRef = useRef(scopeKey);
  useEffect(() => {
    if (lastScopeRef.current !== scopeKey) {
      lastScopeRef.current = scopeKey;
      setDraft(validationToDraft(currentValidation));
      setShowFormatList(false);
    }
  }, [scopeKey, currentValidation]);

  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const commit = (nextDraft: FieldValidationDraft) => {
    setDraft(nextDraft);
    if (!editor) return;
    const validation = draftToValidation(nextDraft);

    if (editor.scope === "stormField" && target.stormData) {
      const nextFields = (target.stormData.fields ?? []).map((f) =>
        f.id === editor.field.id ? { ...f, validation } : f,
      );
      updateObject(target.id, {
        stormData: { ...target.stormData, fields: nextFields },
      });
      return;
    }

    if (editor.scope === "modelField" && target.modelData) {
      const nextFields = (target.modelData.fields ?? []).map((f) =>
        f.id === editor.field.id ? { ...f, validation } : f,
      );
      updateObject(target.id, {
        modelData: { ...target.modelData, fields: nextFields },
      });
      return;
    }

    if (
      (editor.scope === "array" || editor.scope === "wrap") &&
      target.modelData
    ) {
      updateObject(target.id, {
        modelData: { ...target.modelData, validation },
      });
    }
  };

  const updateField =
    (key: keyof FieldValidationDraft) =>
    (value: string) => {
      commit({ ...draft, [key]: value });
    };

  if (!editor) return null;

  const isArrayScope = editor.scope === "array";
  const valueType =
    editor.scope === "stormField" || editor.scope === "modelField"
      ? editor.field.fieldType
      : editor.scope === "wrap"
        ? editor.data.innerType
        : undefined;
  const impliedFormat = formatFromFieldType(valueType);
  const showFormat = !isArrayScope && isStringLikeFieldType(valueType);

  const title =
    editor.scope === "stormField" || editor.scope === "modelField"
      ? editor.field.name || "field"
      : editor.data.name || MODEL_KIND_LABELS[editor.data.kind];

  const inputClass =
    "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:outline-none";

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 flex w-84 flex-col rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xl"
      style={{
        left: Math.max(12, anchorPosition.x - 165),
        top: Math.max(12, anchorPosition.y + 8),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-gray-800">
          <ListChecks size={15} className="shrink-0 text-emerald-600" />
          <span className="truncate">Validate: {title}</span>
        </div>
        <button
          onClick={onClose}
          title="Close"
          className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {/* Well-known string format (email, uuid, …). Only string-like values
            can carry a format, so it is hidden for numbers/booleans/models.
            A custom dropdown (not a native <select>) keeps a single outside
            click enough to dismiss the whole panel. */}
        {showFormat && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-gray-600">
              Format
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFormatList((v) => !v)}
                className={`${inputClass} flex items-center justify-between text-left`}
              >
                <span>
                  {draft.format
                    ? (STORM_VALIDATION_FORMAT_LABELS[draft.format] ??
                      draft.format)
                    : "None"}
                </span>
                <ChevronDown size={13} className="shrink-0 text-gray-400" />
              </button>

              {showFormatList && (
                <div className="absolute top-full left-0 z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-2xl">
                  {["", ...STORM_VALIDATION_FORMATS].map((format) => {
                    const isSelected = draft.format === format;
                    return (
                      <button
                        key={format || "none"}
                        type="button"
                        onClick={() => {
                          updateField("format")(format);
                          setShowFormatList(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          isSelected
                            ? "bg-emerald-50 font-semibold text-emerald-700"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <span>
                          {format
                            ? (STORM_VALIDATION_FORMAT_LABELS[format] ?? format)
                            : "None"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {impliedFormat && draft.format !== impliedFormat && (
              <span className="text-[10px] text-gray-400">
                Type &ldquo;{valueType}&rdquo; already implies format{" "}
                {impliedFormat}.
              </span>
            )}
          </div>
        )}

        {/* Array nodes only bound the item count. */}
        {isArrayScope ? (
          <div>
            <div className="mb-1 text-[11px] font-semibold text-gray-600">
              Array length
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400">Min items</span>
                <input
                  type="number"
                  min={0}
                  value={draft.minItems}
                  onChange={(e) => updateField("minItems")(e.target.value)}
                  placeholder="e.g. 1"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400">Max items</span>
                <input
                  type="number"
                  min={0}
                  value={draft.maxItems}
                  onChange={(e) => updateField("maxItems")(e.target.value)}
                  placeholder="e.g. 100"
                  className={inputClass}
                />
              </label>
            </div>
          </div>
        ) : (
          <>
            {/* String length bounds */}
            <div>
              <div className="mb-1 text-[11px] font-semibold text-gray-600">
                String length
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">Min length</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.minLength}
                    onChange={(e) => updateField("minLength")(e.target.value)}
                    placeholder="e.g. 1"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">Max length</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.maxLength}
                    onChange={(e) => updateField("maxLength")(e.target.value)}
                    placeholder="e.g. 255"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>

            {/* Regex pattern */}
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-600">
                Pattern (regex)
              </span>
              <input
                type="text"
                value={draft.pattern}
                onChange={(e) => updateField("pattern")(e.target.value)}
                placeholder="e.g. ^[A-Z]{3}-\\d{4}$"
                className={`${inputClass} font-mono`}
              />
            </label>

            {/* Numeric bounds */}
            <div>
              <div className="mb-1 text-[11px] font-semibold text-gray-600">
                Numeric range
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">Min</span>
                  <input
                    type="number"
                    value={draft.min}
                    onChange={(e) => updateField("min")(e.target.value)}
                    placeholder="e.g. 0"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400">Max</span>
                  <input
                    type="number"
                    value={draft.max}
                    onChange={(e) => updateField("max")(e.target.value)}
                    placeholder="e.g. 100"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>

            {/* Allowed values (enum) */}
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-600">
                Allowed values
              </span>
              <input
                type="text"
                value={draft.allowedValues}
                onChange={(e) => updateField("allowedValues")(e.target.value)}
                placeholder="Comma separated, e.g. pending, paid, shipped"
                className={inputClass}
              />
            </label>
          </>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
          <span className="text-[10px] text-gray-400">
            Mapped into the exported JSON Schema.
          </span>
          <button
            type="button"
            onClick={() => commit(EMPTY_VALIDATION_DRAFT)}
            disabled={!currentValidation}
            title="Clear validation"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-all hover:bg-gray-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={13} />
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
