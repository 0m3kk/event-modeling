import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
    "w-full h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500";

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 flex w-96 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      style={{
        left: Math.max(12, anchorPosition.x - 192),
        top: Math.max(12, anchorPosition.y + 8),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800 dark:text-zinc-100">
          <ListChecks size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">{t("popovers.validation.title")}: {title}</span>
        </div>
        <button
          onClick={onClose}
          title={t("common.close")}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-3.5 space-y-3.5">
        {/* Well-known string format (email, uuid, …). Only string-like values
            can carry a format, so it is hidden for numbers/booleans/models.
            A custom dropdown (not a native <select>) keeps a single outside
            click enough to dismiss the whole panel. */}
        {showFormat && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
              Format
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFormatList((v) => !v)}
                className={`${inputClass} flex items-center justify-between text-left cursor-pointer`}
              >
                <span>
                  {draft.format
                    ? (STORM_VALIDATION_FORMAT_LABELS[draft.format] ??
                      draft.format)
                    : "None"}
                </span>
                <ChevronDown size={14} className="shrink-0 text-gray-400 dark:text-zinc-500" />
              </button>

              {showFormatList && (
                <div className="absolute top-full left-0 z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-2xl dark:border-zinc-700 dark:bg-zinc-800">
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
                        className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                Type &ldquo;{valueType}&rdquo; already implies format{" "}
                {impliedFormat}.
              </span>
            )}
          </div>
        )}

        {/* Array nodes only bound the item count. */}
        {isArrayScope ? (
          <div>
            <div className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-300">
              Array length
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Min items</span>
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
                <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Max items</span>
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
              <div className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-300">
                String length
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">{t("popovers.validation.minLength")}</span>
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
                  <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">{t("popovers.validation.maxLength")}</span>
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
              <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                {t("popovers.validation.pattern")}
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
              <div className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-300">
                Numeric range
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">{t("popovers.validation.minVal")}</span>
                  <input
                    type="number"
                    value={draft.min}
                    onChange={(e) => updateField("min")(e.target.value)}
                    placeholder="e.g. 0"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">{t("popovers.validation.maxVal")}</span>
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
              <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                {t("popovers.validation.enumVals")}
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

        <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-zinc-800">
          <span className="text-xs text-gray-400 dark:text-zinc-500">
            Mapped into the exported JSON Schema.
          </span>
          <button
            type="button"
            onClick={() => commit(EMPTY_VALIDATION_DRAFT)}
            disabled={!currentValidation}
            title={t("popovers.validation.clearValidation")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-all hover:bg-gray-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400 cursor-pointer"
          >
            <Trash2 size={14} />
            {t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
