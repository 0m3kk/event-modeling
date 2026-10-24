import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Trash2, X } from "lucide-react";
import { useCanvasStore } from "@/store";
import type { CanvasElement } from "@/types";
import { applyDescription, findDescriptionText, findRowName } from "@/utils/description";
import { optionsBarPopoverStyle } from "./optionsBarPopover";

interface DescriptionPopoverProps {
  /** Card whose description (or selected row's) is being edited. */
  element: CanvasElement;
  onClose: () => void;
  placement?: "top" | "bottom";
}

/**
 * DescriptionPopover — panel for the card / field description, opened from the
 * options-bar ⓘ button.
 *
 * Targets the card by default; when one of its field rows is selected it edits
 * that row's description instead. Edits apply live (empty removes the text).
 */
export function DescriptionPopover({
  element,
  onClose,
  placement = "top",
}: DescriptionPopoverProps) {
  const { t } = useTranslation();
  const updateElement = useCanvasStore((s) => s.updateElement);
  const selectedField = useCanvasStore((s) => s.selectedField);
  const popoverRef = useRef<HTMLDivElement>(null);

  // The selected row only applies when it belongs to this card.
  const field = selectedField?.elementId === element.id ? selectedField : null;
  const scopeKey = field ? `${field.sectionIndex ?? 0}_${field.fieldIndex}` : "card";

  const [text, setText] = useState(
    () => findDescriptionText(element, field) ?? "",
  );

  // Re-seed the textarea when the panel switches between card and rows.
  const lastScopeRef = useRef(scopeKey);
  useEffect(() => {
    if (lastScopeRef.current !== scopeKey) {
      lastScopeRef.current = scopeKey;
      setText(findDescriptionText(element, field) ?? "");
    }
  }, [scopeKey, element, field]);

  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
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
    const patch = applyDescription(element, field, value || undefined);
    if (patch) updateElement(element.id, patch);
  };

  const rowName = findRowName(element, field);
  const scopeLabel = !field
    ? t("description.title")
    : t("description.field", { name: rowName ?? "—" });

  const positionClasses = placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2";

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      style={optionsBarPopoverStyle(placement, { centered: true })}
      className={`absolute left-1/2 z-50 flex w-80 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 ${positionClasses}`}
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800 dark:text-zinc-100">
          <Info size={16} className="shrink-0 text-sky-600 dark:text-sky-400" />
          <span className="truncate">{scopeLabel}</span>
        </div>
        <button
          onClick={onClose}
          title={t("common.close")}
          className="cursor-pointer rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X size={16} />
        </button>
      </div>

      <textarea
        autoFocus
        rows={4}
        value={text}
        onChange={(e) => apply(e.target.value)}
        placeholder={t("description.placeholder")}
        className="mt-3.5 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
      />

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-zinc-500">
          {t("description.characters", { count: text.trim().length })}
        </span>
        <button
          onClick={() => apply("")}
          disabled={!text.trim()}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-all hover:bg-gray-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
        >
          <Trash2 size={14} />
          {t("common.delete")}
        </button>
      </div>
    </div>
  );
}
