import { useState, useMemo, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject } from "@/types";
import { Tag, X, Check, Trash2, Plus } from "lucide-react";

interface TagPopoverProps {
  card: CanvasObject;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function TagPopover({ card, onClose, anchorPosition }: TagPopoverProps) {
  const objects = useCanvasStore((s) => s.objects);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const addStormField = useCanvasStore((s) => s.addStormField);
  const stormSelectedField = useCanvasStore((s) => s.stormSelectedField);
  const setStormSelectedField = useCanvasStore((s) => s.setStormSelectedField);

  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fields = useMemo(() => {
    return card.stormData?.fields ?? [];
  }, [card.stormData?.fields]);

  // Determine which field is selected
  const initialFieldId = useMemo(() => {
    if (
      stormSelectedField?.objectId === card.id &&
      stormSelectedField.fieldId &&
      fields.some((f) => f.id === stormSelectedField.fieldId)
    ) {
      return stormSelectedField.fieldId;
    }
    return fields[0]?.id ?? "";
  }, [card.id, fields, stormSelectedField]);

  const [currentFieldId, setCurrentFieldId] = useState(initialFieldId);
  const [appliedFeedback, setAppliedFeedback] = useState(false);

  const currentField = useMemo(() => {
    return fields.find((f) => f.id === currentFieldId) ?? fields[0] ?? null;
  }, [fields, currentFieldId]);

  const [tagInput, setTagInput] = useState(() => currentField?.tag ?? "");

  // Update tagInput when selected field changes
  useEffect(() => {
    if (currentField) {
      setTagInput(currentField.tag ?? "");
    }
  }, [currentField]);

  // Listen to external field selection changes on canvas
  useEffect(() => {
    if (
      stormSelectedField?.objectId === card.id &&
      stormSelectedField.fieldId &&
      fields.some((f) => f.id === stormSelectedField.fieldId)
    ) {
      setCurrentFieldId(stormSelectedField.fieldId);
    }
  }, [stormSelectedField, card.id, fields]);

  // Collect all unique tags across the board
  const existingTags = useMemo(() => {
    const tags = new Set<string>();
    for (const obj of objects) {
      if (obj.type === "storm" && obj.stormData?.fields) {
        for (const f of obj.stormData.fields) {
          const t = (f.tag ?? "").trim();
          if (t) tags.add(t);
        }
      }
    }
    return Array.from(tags).sort();
  }, [objects]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [currentField?.id]);

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
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleApply = (valueToApply: string) => {
    if (!currentField || !card.stormData) return;
    const trimmed = valueToApply.trim();
    const nextTag = trimmed || undefined;
    const nextFields = card.stormData.fields.map((f) =>
      f.id === currentField.id ? { ...f, tag: nextTag } : f,
    );
    updateObject(card.id, {
      stormData: {
        ...card.stormData,
        fields: nextFields,
      },
    });
    setTagInput(trimmed);
    setAppliedFeedback(true);
    setTimeout(() => setAppliedFeedback(false), 1200);
  };

  const handleRemoveTag = () => {
    handleApply("");
  };

  const handleFieldChange = (newFieldId: string) => {
    setCurrentFieldId(newFieldId);
    setStormSelectedField({ objectId: card.id, fieldId: newFieldId });
    const f = fields.find((field) => field.id === newFieldId);
    setTagInput(f?.tag ?? "");
  };

  const handleAddField = () => {
    addStormField(card.id);
  };

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 flex w-80 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
      style={{
        left: Math.max(12, anchorPosition.x - 160),
        top: Math.max(12, anchorPosition.y + 8),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-gray-800">
          <Tag size={16} className="shrink-0 text-orange-600" />
          <span className="truncate">
            {currentField ? `Field Tag: ${currentField.name}` : "Set Field Tag"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      </div>

      {fields.length === 0 ? (
        <div className="py-4 text-center text-xs text-gray-500">
          <p>This card has no fields to tag.</p>
          <button
            onClick={handleAddField}
            className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
          >
            <Plus size={14} />
            Add First Field
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Target Field Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Target Field
              </label>
              <button
                onClick={handleAddField}
                title="Add another field"
                className="flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-700"
              >
                <Plus size={12} />
                <span>New Field</span>
              </button>
            </div>
            <select
              value={currentField?.id ?? ""}
              onChange={(e) => handleFieldChange(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-800 focus:border-orange-500 focus:bg-white focus:outline-none"
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.fieldType || "string"})
                  {f.tag ? ` • [${f.tag}]` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Tag Name Input */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Tag Name
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApply(tagInput);
                    }
                  }}
                  placeholder="e.g. order, user, payment..."
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => handleApply(tagInput)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  appliedFeedback
                    ? "bg-green-600 text-white"
                    : "bg-orange-600 text-white hover:bg-orange-700"
                }`}
              >
                <Check size={13} />
                {appliedFeedback ? "Saved" : "Apply"}
              </button>
              {currentField?.tag && (
                <button
                  type="button"
                  onClick={handleRemoveTag}
                  title="Remove tag"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Preview */}
          {currentField && (
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-500">
              <span>Preview:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-700">
                  • {currentField.name}
                </span>
                {tagInput.trim() ? (
                  <span className="inline-flex items-center rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-700">
                    {tagInput.trim()}
                  </span>
                ) : (
                  <span className="text-[10px] italic text-gray-400">
                    (no tag)
                  </span>
                )}
                <span className="rounded bg-gray-200 px-1 py-0.5 text-[10px] text-gray-600">
                  {currentField.fieldType || "string"}
                </span>
              </div>
            </div>
          )}

          {/* Existing Tags on Board */}
          {existingTags.length > 0 && (
            <div className="border-t border-gray-100 pt-2.5">
              <div className="mb-1.5 text-[11px] font-semibold text-gray-500">
                Existing Tags on Board:
              </div>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {existingTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleApply(tag)}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                      tagInput.trim() === tag
                        ? "border border-orange-300 bg-orange-100 font-bold text-orange-800"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
