import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Check, Trash2, Braces } from "lucide-react";
import { toDisplayType } from "@/utils/naming";
import { optionsBarPopoverStyle } from "./optionsBarPopover";
import {
  FIELD_FORMAT_PRESETS,
  draftToValidation,
  validationKindFor,
  validationSummary,
  validationToDraft,
  type FieldValidation,
  type ValidationDraft,
} from "@/utils/fieldValidation";

interface FieldValidationPopoverProps {
  currentValidation?: FieldValidation;
  /** Declared type of the field / wrapped alias type, used to pick the group. */
  type?: string;
  isArray?: boolean;
  isOpen: boolean;
  onClose: () => void;
  /** Commit the edited rules. `null` clears any existing validation. */
  onApply: (validation: FieldValidation | null) => void;
  placement?: "top" | "bottom";
}

/** One labelled text/number input inside the editor. */
function RuleInput({
  label,
  hint,
  value,
  onChange,
  numeric,
  mono,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] font-medium text-gray-600 dark:text-zinc-300">
        <span>{label}</span>
        {hint && (
          <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-500">{hint}</span>
        )}
      </span>
      <input
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "numeric" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-blue-500 dark:focus:bg-zinc-800 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}

/**
 * Editor for a field's (or alias's) validation constraints. Structured bounds
 * are chosen from the declared type (string length/pattern, numeric range,
 * array item count) plus a free-text custom rule. Edits are local until
 * "Apply", so partially typed values never land on the canvas.
 */
export function FieldValidationPopover({
  currentValidation,
  type,
  isArray,
  isOpen,
  onClose,
  onApply,
  placement = "top",
}: FieldValidationPopoverProps) {
  const popoverRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<ValidationDraft>(() => validationToDraft(currentValidation));

  useEffect(() => {
    if (isOpen) {
      setDraft(validationToDraft(currentValidation));
    }
  }, [isOpen, currentValidation]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const kind = validationKindFor(type, isArray);
  const set = (key: keyof ValidationDraft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const parsed = draftToValidation(draft);
  const summary = validationSummary(parsed ?? undefined);
  const positionClasses = placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(parsed);
    onClose();
  };

  const groupLabel =
    kind === "array"
      ? "Array items"
      : kind === "number"
        ? "Numeric range"
        : kind === "json"
          ? "JSON"
          : "String";

  return (
    <form
      ref={popoverRef}
      onSubmit={handleSubmit}
      onWheel={(e) => e.stopPropagation()}
      style={optionsBarPopoverStyle(placement)}
      className={`absolute left-0 ${positionClasses} w-62 max-h-[min(420px,calc(100vh-120px))] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none`}
    >
      <div className="mb-1.5 flex items-center justify-between px-0.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-blue-500" />
          <span>Validation</span>
        </span>
        <span className="flex items-center gap-1 font-mono text-[11px] text-blue-600 dark:text-blue-400">
          <Braces size={11} />
          {toDisplayType(type, isArray) || "—"}
        </span>
      </div>

      <div className="mb-2.5 text-[11px] text-gray-400 dark:text-zinc-500 leading-tight">
        {groupLabel} constraints on this {type ? "type" : "value"}
      </div>

      <div className="flex flex-col gap-2">
        {kind === "string" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <RuleInput
                label="Min length"
                hint="≥ 0"
                numeric
                value={draft.minLength}
                onChange={set("minLength")}
                placeholder="0"
              />
              <RuleInput
                label="Max length"
                hint="≥ 0"
                numeric
                value={draft.maxLength}
                onChange={set("maxLength")}
                placeholder="∞"
              />
            </div>

            {/* Format presets: pick at most one; tap again to clear. */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-gray-600 dark:text-zinc-300">
                Format
              </span>
              <div className="flex flex-wrap gap-1">
                {FIELD_FORMAT_PRESETS.map((preset) => {
                  const active = draft.format === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => set("format")(active ? "" : preset.value)}
                      className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                        active
                          ? "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-400"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <RuleInput
              label="Pattern (regex)"
              mono
              value={draft.pattern}
              onChange={set("pattern")}
              placeholder="^[A-Za-z]+$"
            />
          </>
        )}

        {kind === "number" && (
          <div className="grid grid-cols-2 gap-2">
            <RuleInput
              label="Min"
              numeric
              value={draft.min}
              onChange={set("min")}
              placeholder="-∞"
            />
            <RuleInput
              label="Max"
              numeric
              value={draft.max}
              onChange={set("max")}
              placeholder="∞"
            />
          </div>
        )}

        {kind === "array" && (
          <div className="grid grid-cols-2 gap-2">
            <RuleInput
              label="Min items"
              hint="≥ 0"
              numeric
              value={draft.minItems}
              onChange={set("minItems")}
              placeholder="0"
            />
            <RuleInput
              label="Max items"
              hint="≥ 0"
              numeric
              value={draft.maxItems}
              onChange={set("maxItems")}
              placeholder="∞"
            />
          </div>
        )}

        {kind === "json" && (
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 leading-tight">
            JSON values have no built-in constraints. Add a custom rule when the
            payload must satisfy a specific shape.
          </p>
        )}

        <RuleInput
          label="Custom rule"
          mono
          value={draft.rule}
          onChange={set("rule")}
          placeholder="e.g. valid IBAN checksum"
        />
      </div>

      {/* Live preview of the rules that will be applied */}
      <div className="mt-2.5 flex min-h-4.5 flex-wrap gap-1 border-t border-gray-100 pt-2 dark:border-zinc-800">
        {summary.length > 0 ? (
          summary.map((part, i) => (
            <span
              key={i}
              className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
            >
              {part}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-gray-400 dark:text-zinc-500">
            No constraints yet
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        {(currentValidation || summary.length > 0) && (
          <button
            type="button"
            onClick={() => {
              onApply(null);
              onClose();
            }}
            title="Clear validation"
            className="flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>
        )}
        <button
          type="submit"
          title="Apply validation"
          className="ml-auto flex items-center justify-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 cursor-pointer transition-colors shadow-xs"
        >
          <Check size={14} className="stroke-[2.5]" />
          <span>Apply</span>
        </button>
      </div>
    </form>
  );
}
