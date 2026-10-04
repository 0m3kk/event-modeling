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

import { useTranslation } from "react-i18next";

export function TagPopover({ card, onClose, anchorPosition }: TagPopoverProps) {
  const { t } = useTranslation();
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
      className="absolute z-50 flex w-88 flex-col rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xl"
      style={{
        left: Math.max(12, anchorPosition.x - 176),
        top: Math.max(12, anchorPosition.y + 8),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800 dark:text-zinc-100">
          <Tag size={16} className="shrink-0 text-orange-600 dark:text-orange-400" />
          <span className="truncate">
            {currentField ? t("popovers.tag.titleNamed", { name: currentField.name }) : t("popovers.tag.title")}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-600 dark:hover:text-zinc-300 cursor-pointer"
          title={t("common.close")}
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {/* Tag Name Input */}
        <div>
          <div className="flex items-center gap-2">
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
                placeholder={t("popovers.tag.placeholder")}
                className="w-full h-9 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-sm text-gray-800 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => handleApply(tagInput)}
              className="h-9 rounded-lg bg-orange-600 px-3.5 text-xs font-semibold text-white hover:bg-orange-700 transition-colors cursor-pointer shrink-0"
            >
              {t("common.apply")}
            </button>
            {currentField?.tag && (
              <button
                type="button"
                onClick={handleRemoveTag}
                title={t("popovers.tag.deleteTag")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-400 dark:text-zinc-400 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Existing Tags on Board */}
        {existingTags.length > 0 && (
          <div className="border-t border-gray-100 dark:border-zinc-800 pt-2.5">
            <div className="mb-1.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
              {t("popovers.tag.existingTags")}
            </div>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {existingTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleApply(tag)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                    tagInput.trim() === tag
                      ? "border border-orange-300 dark:border-orange-700 bg-orange-100 dark:bg-orange-950/60 font-bold text-orange-800 dark:text-orange-300"
                      : "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
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
