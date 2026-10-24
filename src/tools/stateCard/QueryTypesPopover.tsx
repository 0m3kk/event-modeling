import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

interface QueryTypesPopoverProps {
  /** Current event types of the query item. */
  types: string[];
  /** Event type names already present on the board (names of Event cards). */
  suggestedTypes?: string[];
  onChange: (types: string[]) => void;
  isOpen: boolean;
  onClose: () => void;
  placement?: "top" | "bottom";
}

/**
 * QueryTypesPopover — edits the event `types` matched by a single query item.
 *
 * Types are OR-combined within an item. Values can be picked from the event
 * types already used on the board or typed freely.
 */
export function QueryTypesPopover({
  types,
  suggestedTypes = [],
  onChange,
  isOpen,
  onClose,
  placement = "top",
}: QueryTypesPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (isOpen) {
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

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

  const positionClasses = placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2";

  const addType = (raw: string) => {
    const value = raw.trim();
    if (!value || types.includes(value)) return;
    onChange([...types, value]);
    setInput("");
  };

  const removeType = (value: string) => {
    onChange(types.filter((t) => t !== value));
  };

  const suggestions = suggestedTypes.filter(
    (t) => Boolean(t?.trim()) && !types.includes(t),
  );

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      className={`absolute left-0 ${positionClasses} w-[256px] max-h-[min(380px,calc(100vh-120px))] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none`}
    >
      <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <span>Event Types</span>
        <span className="text-[11px] font-normal text-gray-400 dark:text-zinc-500">
          {types.length > 0 ? `${types.length} selected` : "none"}
        </span>
      </div>

      <div className="mb-2.5 text-[11px] text-gray-400 dark:text-zinc-500 leading-tight">
        Matched with OR inside this query item
      </div>

      {types.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1">
          {types.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-md border border-teal-200/80 bg-teal-50/70 px-2 py-0.5 text-[11px] font-mono text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300"
            >
              {t}
              <button
                type="button"
                onClick={() => removeType(t)}
                className="cursor-pointer text-teal-600/70 hover:text-red-500 dark:text-teal-400/70"
                title="Remove"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addType(input);
        }}
        className="flex items-center gap-1.5"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. OrderPlaced"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-mono text-gray-800 placeholder-gray-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-teal-500 dark:focus:bg-zinc-800"
        />
        <button
          type="submit"
          title="Add type"
          className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-teal-700 cursor-pointer transition-colors shadow-xs"
        >
          <Plus size={14} className="stroke-[2.5]" />
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="mt-2.5 border-t border-gray-100 pt-2 dark:border-zinc-800">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
            Event types on board
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestions.slice(0, 12).map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => addType(sug)}
                className="rounded-md border border-gray-200 bg-gray-50/60 px-2 py-0.5 text-[11px] font-mono text-gray-600 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                {sug}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
