import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject } from "@/types";
import {
  applyDescription,
  findDescriptionText,
  findRowName,
} from "@/utils/description";
import { Info, X, Trash2 } from "lucide-react";

interface DescriptionPopoverProps {
  /** Storm card or model node whose description is edited. */
  target: CanvasObject;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

/**
 * DescriptionPopover — panel for the description, opened from the options-bar
 * ⓘ button so it sits alongside the authorization-action panel.
 *
 * Targets the card by default; when a field / enum-value row is selected it
 * edits that row's description instead, replacing the old on-canvas inline
 * editor. Edits apply live (empty removes the description).
 */
export function DescriptionPopover({
  target,
  onClose,
  anchorPosition,
}: DescriptionPopoverProps) {
  const updateObject = useCanvasStore((s) => s.updateObject);
  const stormSelectedField = useCanvasStore((s) => s.stormSelectedField);
  const popoverRef = useRef<HTMLDivElement>(null);

  // The selected row only applies when it belongs to this card.
  const fieldId =
    stormSelectedField?.objectId === target.id
      ? stormSelectedField.fieldId
      : undefined;
  const scopeKey = fieldId ?? "card";

  const [text, setText] = useState(
    () => findDescriptionText(target, fieldId) ?? "",
  );

  // Re-seed the textarea when the panel switches between the card and a row.
  const lastScopeRef = useRef(scopeKey);
  useEffect(() => {
    if (lastScopeRef.current !== scopeKey) {
      lastScopeRef.current = scopeKey;
      setText(findDescriptionText(target, fieldId) ?? "");
    }
  }, [scopeKey, target, fieldId]);

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

  const apply = (value: string) => {
    setText(value);
    applyDescription(target, fieldId, value || undefined, updateObject);
  };

  const rowName = findRowName(target, fieldId);
  const isEnumValue =
    target.type === "model" && target.modelData?.kind === "enum" && !!fieldId;
  const scopeLabel = !fieldId
    ? "Card Description"
    : `${isEnumValue ? "Value" : "Field"}: ${rowName ?? "—"}`;

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 flex w-88 flex-col rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xl"
      style={{
        left: Math.max(12, anchorPosition.x - 176),
        top: Math.max(12, anchorPosition.y + 8),
      }}
    >
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-zinc-100">
          <Info size={16} className="shrink-0 text-sky-600 dark:text-sky-400" />
          <span className="truncate">{scopeLabel}</span>
        </div>
        <button
          onClick={onClose}
          title="Close"
          className="rounded-lg p-1 text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-600 dark:hover:text-zinc-300 cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      <textarea
        autoFocus
        rows={4}
        value={text}
        onChange={(e) => apply(e.target.value)}
        placeholder={
          fieldId
            ? "Add context for this row — shown on its row ⓘ"
            : "Add context — shown when hovering the ⓘ badge"
        }
        className="mt-3 w-full resize-none rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-2 text-xs leading-relaxed text-gray-800 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-gray-400 dark:text-zinc-500">
          {text.trim().length} characters
        </span>
        <button
          onClick={() => apply("")}
          disabled={!text.trim()}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 dark:text-zinc-400 transition-all hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-red-500 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <Trash2 size={13} />
          Clear
        </button>
      </div>
    </div>
  );
}
