import { useState, useMemo, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject, StormField } from "@/types";
import { ArrowLeftRight, X, Trash2, Sparkles } from "lucide-react";

interface FieldMappingPopoverProps {
  card: CanvasObject;
  fieldId: string;
  section?: "params" | "response";
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function FieldMappingPopover({
  card,
  fieldId,
  section,
  onClose,
  anchorPosition,
}: FieldMappingPopoverProps) {
  const updateStormFieldMapping = useCanvasStore((s) => s.updateStormFieldMapping);

  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const data = card.stormData;

  const targetField: StormField | null = useMemo(() => {
    if (!data) return null;
    if (section === "response") {
      return (
        data.responseFields?.find((f) => f.id === fieldId) ??
        data.outputFields?.find((f) => f.id === fieldId) ??
        null
      );
    }
    return (
      data.fields.find((f) => f.id === fieldId) ??
      data.inputFields?.find((f) => f.id === fieldId) ??
      data.outputFields?.find((f) => f.id === fieldId) ??
      data.responseFields?.find((f) => f.id === fieldId) ??
      null
    );
  }, [data, fieldId, section]);

  const [mapping, setMapping] = useState(() => targetField?.mapping ?? "");

  useEffect(() => {
    setMapping(targetField?.mapping ?? "");
  }, [targetField]);

  // Click outside listener & Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Quick suggestions based on context
  // If Event: find commands or constraints on the board or generic tokens
  const suggestions = useMemo(() => {
    const list: { label: string; value: string }[] = [];

    if (targetField) {
      const fieldName = targetField.name.trim();
      if (fieldName) {
        list.push({ label: `command.${fieldName}`, value: `command.${fieldName}` });
        if (targetField.fieldType === "UUID") {
          list.push({ label: "uuid()", value: "uuid()" });
        }
        if (targetField.fieldType === "DateTime") {
          list.push({ label: "now()", value: "now()" });
        }
      }
    }

    list.push(
      { label: "now()", value: "now()" },
      { label: "uuid()", value: "uuid()" },
      { label: "constraint.<state>", value: "constraint." },
      { label: "hashPassword(...)", value: "hashPassword(command.password)" },
    );

    // Filter duplicates
    const seen = new Set<string>();
    return list.filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
  }, [targetField]);

  const handleApply = () => {
    updateStormFieldMapping(card.id, fieldId, mapping, section);
    onClose();
  };

  const handleClear = () => {
    setMapping("");
    updateStormFieldMapping(card.id, fieldId, undefined, section);
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-96 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: `${anchorPosition.x}px`,
        top: `${anchorPosition.y}px`,
        transform: "translateX(-50%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 px-4 py-3 bg-gradient-to-r from-cyan-50/50 to-transparent dark:from-cyan-950/20">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400">
            <ArrowLeftRight size={15} />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-900 dark:text-zinc-100">
              Field Mapping (Codegen)
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-zinc-400">
              Field: <span className="font-semibold text-cyan-600 dark:text-cyan-400">{targetField?.name || "Untitled"}</span>
              {targetField?.fieldType ? ` (${targetField.fieldType})` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X size={15} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Warning if empty */}
        {!mapping.trim() && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <span className="font-bold text-amber-600 dark:text-amber-400 text-xs">⚠️</span>
            <span>
              Explicit mapping is required for code generation. Without a mapping, codegen will fail on this field.
            </span>
          </div>
        )}

        {/* Input */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 dark:text-zinc-300 mb-1">
            Source Expression
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={mapping}
              onChange={(e) => setMapping(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleApply();
                }
              }}
              placeholder="e.g. command.title, now(), uuid()"
              className="w-full font-mono text-xs rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400"
            />
          </div>
        </div>

        {/* Suggestions chips */}
        <div>
          <div className="text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Sparkles size={11} className="text-cyan-500" />
            Quick Presets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setMapping(s.value)}
                className="rounded-md border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-gray-700 dark:text-zinc-300 hover:border-cyan-400 hover:bg-cyan-50 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/40 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 dark:bg-zinc-800/60 p-2 text-[10px] text-gray-500 dark:text-zinc-400 space-y-1">
          <p className="font-semibold text-gray-700 dark:text-zinc-300">Supported Formats:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><code className="text-cyan-600 dark:text-cyan-400">command.&lt;field&gt;</code> — pass through command payload</li>
            <li><code className="text-cyan-600 dark:text-cyan-400">constraint.&lt;output&gt;</code> — value calculated by constraint</li>
            <li><code className="text-cyan-600 dark:text-cyan-400">uuid()</code>, <code className="text-cyan-600 dark:text-cyan-400">now()</code> — system generators</li>
            <li><code className="text-cyan-600 dark:text-cyan-400">func(command.a)</code> — transformation expression</li>
          </ul>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-gray-100 dark:border-zinc-800 pt-3">
          {targetField?.mapping ? (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <Trash2 size={13} />
              Clear Mapping
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
            >
              Apply Mapping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
