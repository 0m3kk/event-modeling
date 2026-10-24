import { useEffect, useRef, useState } from "react";
import { Tag, Check, Trash2, Hash } from "lucide-react";
import { toDisplayName } from "@/utils/naming";
import { optionsBarPopoverStyle } from "./optionsBarPopover";

interface FieldTagPopoverProps {
  currentTag?: string;
  fieldName?: string;
  suggestedTags?: string[];
  onSelectTag: (tag: string | null) => void;
  isOpen: boolean;
  onClose: () => void;
  placement?: "top" | "bottom";
  /** Heading shown at the top of the popover. */
  title?: string;
  /** One-line explanation under the heading. */
  hint?: string;
  /** Prefix rendered before the value (e.g. `#` for DCB tags; empty for names). */
  prefix?: string;
  /** Placeholder of the free-text input. */
  placeholder?: string;
  /** Heading above the suggested existing values. */
  suggestionsLabel?: string;
  /** Label of the remove action. */
  removeLabel?: string;
}

export function FieldTagPopover({
  currentTag,
  fieldName,
  suggestedTags = [],
  onSelectTag,
  isOpen,
  onClose,
  placement = "top",
  title = "Field Tag (DCB)",
  hint = "Consistency boundary partition key",
  prefix = "#",
  placeholder = "e.g. user, email...",
  suggestionsLabel = "Existing Tags",
  removeLabel = "Remove tag",
}: FieldTagPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tagInput, setTagInput] = useState(currentTag || "");

  useEffect(() => {
    if (isOpen) {
      setTagInput(currentTag || "");
      // Focus input after render
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, currentTag]);

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

  const positionClasses =
    placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tagInput.trim();
    if (trimmed) {
      const cleanTag = trimmed.startsWith("#") ? trimmed.slice(1).trim() : trimmed;
      onSelectTag(cleanTag);
    } else {
      onSelectTag(null);
    }
    onClose();
  };

  // Only show tags that already exist on the board
  const suggestions = suggestedTags.filter(
    (st) => Boolean(st?.trim()) && st !== currentTag,
  );

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      style={optionsBarPopoverStyle(placement)}
      className={`absolute left-0 ${positionClasses} w-59 max-h-[min(380px,calc(100vh-120px))] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none`}
    >
      <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Tag size={13} className="text-amber-500 fill-amber-500" />
          <span>{title}</span>
        </span>
        {currentTag ? (
          <span className="font-mono text-xs text-amber-600 dark:text-amber-400 font-bold">
            {prefix}{toDisplayName(currentTag)}
          </span>
        ) : (
          <span className="text-[11px] text-gray-400 dark:text-zinc-500 font-normal">
            none
          </span>
        )}
      </div>

      <div className="mb-2.5 text-[11px] text-gray-400 dark:text-zinc-500 leading-tight">
        {hint}
      </div>

      {/* Tag Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
        <div className="relative flex-1">
          {prefix && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 font-mono text-xs">
              {prefix}
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder={placeholder}
            className={`w-full rounded-lg border border-gray-200 bg-gray-50 ${prefix ? "pl-6" : "pl-2.5"} pr-2.5 py-1.5 text-xs font-mono text-gray-800 placeholder-gray-400 focus:border-amber-500 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-amber-500 dark:focus:bg-zinc-800`}
          />
        </div>
        <button
          type="submit"
          title="Apply Tag"
          className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600 cursor-pointer transition-colors shadow-xs"
        >
          <Check size={14} className="stroke-[2.5]" />
        </button>
      </form>

      {/* Existing Tags Suggestions */}
      {suggestions.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-zinc-800">
          <div className="mb-1.5 text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
            {suggestionsLabel}
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestions.slice(0, 8).map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => {
                  onSelectTag(sug);
                  onClose();
                }}
                className="flex items-center gap-0.5 rounded-md border border-amber-200/80 bg-amber-50/60 px-2 py-0.5 text-[11px] font-mono font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950 cursor-pointer transition-colors"
              >
                <Hash size={10} className="text-amber-500" />
                <span>{prefix}{toDisplayName(sug)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Remove Tag Button */}
      {currentTag && (
        <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => {
              onSelectTag(null);
              onClose();
            }}
            className="flex items-center justify-center gap-1.5 w-full rounded-lg py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
          >
            <Trash2 size={12} />
            <span>{removeLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
}
