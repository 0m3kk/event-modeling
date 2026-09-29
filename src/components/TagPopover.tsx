import { useState, useMemo, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject } from "@/types";
import { stormHasInputFields } from "@/constants/storm";
import { Tag, X, Trash2 } from "lucide-react";

interface TagPopoverProps {
  card: CanvasObject;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function TagPopover({ card, onClose, anchorPosition }: TagPopoverProps) {
  const objects = useCanvasStore((s) => s.objects);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const stormSelectedField = useCanvasStore((s) => s.stormSelectedField);

  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Taggable rows: on State/Constraint only the INPUT params carry tags;
  // every other taggable kind tags its primary field list.
  const fields = useMemo(() => {
    const sd = card.stormData;
    if (!sd) return [];
    return stormHasInputFields(sd.kind)
      ? (sd.inputFields ?? [])
      : (sd.fields ?? []);
  }, [card.stormData]);

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
    const trimmed = valueToApply.trim().replace(/^#+/, "");
    const nextTag = trimmed || undefined;
    const data = card.stormData;
    const key = stormHasInputFields(data.kind) ? "inputFields" : "fields";
    const list = data[key] ?? [];
    const nextFields = list.map((f) =>
      f.id === currentField.id ? { ...f, tag: nextTag } : f,
    );
    updateObject(card.id, {
      stormData: {
        ...data,
        [key]: nextFields,
      },
    });
    setTagInput(trimmed);
    onClose();
  };

  const handleRemoveTag = () => {
    handleApply("");
  };

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 flex w-76 flex-col rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xl"
      style={{
        left: Math.max(12, anchorPosition.x - 150),
        top: Math.max(12, anchorPosition.y + 8),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-gray-800">
          <Tag size={15} className="shrink-0 text-orange-600" />
          <span className="truncate">
            {currentField ? `Tag: ${currentField.name}` : "Set Tag"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-2.5 space-y-2.5">
        {/* Tag Name Input */}
        <div>
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
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition-colors"
            >
              Apply
            </button>
            {currentField?.tag && (
              <button
                type="button"
                onClick={handleRemoveTag}
                title="Delete tag"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Existing Tags on Board */}
        {existingTags.length > 0 && (
          <div className="border-t border-gray-100 pt-2">
            <div className="mb-1 text-[11px] font-semibold text-gray-500">
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
    </div>
  );
}
