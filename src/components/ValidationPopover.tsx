import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject, StormField } from "@/types";
import { ListChecks, X, Trash2 } from "lucide-react";
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

interface ValidationPopoverProps {
  card: CanvasObject;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

/**
 * ValidationPopover — panel for the input-validation rules of a Command field
 * or Query param, opened from the options-bar checklist button.
 *
 * Edits apply live (clearing every rule removes the validation object). Only
 * the card's primary `fields` list is targeted: on a Query card that is the
 * Params band, never the Response fields; on a Command it is the payload.
 */
export function ValidationPopover({
  card,
  onClose,
  anchorPosition,
}: ValidationPopoverProps) {
  const updateObject = useCanvasStore((s) => s.updateObject);
  const stormSelectedField = useCanvasStore((s) => s.stormSelectedField);
  const popoverRef = useRef<HTMLDivElement>(null);

  const field: StormField | null =
    card.stormData && stormSelectedField?.objectId === card.id
      ? (card.stormData.fields?.find(
          (f) => f.id === stormSelectedField.fieldId,
        ) ?? null)
      : null;

  const fieldId = field?.id ?? "";
  const [draft, setDraft] = useState<FieldValidationDraft>(() =>
    validationToDraft(field?.validation),
  );

  // Re-seed the inputs when the panel switches to another row.
  const lastFieldIdRef = useRef(fieldId);
  useEffect(() => {
    if (lastFieldIdRef.current !== fieldId) {
      lastFieldIdRef.current = fieldId;
      setDraft(validationToDraft(field?.validation));
    }
  }, [fieldId, field]);

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
    if (!field || !card.stormData) return;
    const validation = draftToValidation(nextDraft);
    const nextFields = (card.stormData.fields ?? []).map((f) =>
      f.id === field.id ? { ...f, validation } : f,
    );
    updateObject(card.id, {
      stormData: { ...card.stormData, fields: nextFields },
    });
  };

  const updateField =
    (key: keyof FieldValidationDraft) =>
    (value: string) => {
      commit({ ...draft, [key]: value });
    };

  if (!field) return null;

  const impliedFormat = formatFromFieldType(field.fieldType);

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
          <span className="truncate">Validate: {field.name || "field"}</span>
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
        {/* Well-known string format (email, uuid, …). Only string-like fields
            can carry a format, so it is hidden for numbers/booleans/models. */}
        {isStringLikeFieldType(field.fieldType) && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-gray-600">
              Format
            </span>
            <select
              value={draft.format}
              onChange={(e) => updateField("format")(e.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {STORM_VALIDATION_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {STORM_VALIDATION_FORMAT_LABELS[format] ?? format}
                </option>
              ))}
            </select>
            {impliedFormat && draft.format !== impliedFormat && (
              <span className="text-[10px] text-gray-400">
                Type &ldquo;{field.fieldType}&rdquo; already implies format{" "}
                {impliedFormat}.
              </span>
            )}
          </label>
        )}

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

        <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
          <span className="text-[10px] text-gray-400">
            Mapped into the exported JSON Schema.
          </span>
          <button
            type="button"
            onClick={() => commit(EMPTY_VALIDATION_DRAFT)}
            disabled={!field.validation}
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
