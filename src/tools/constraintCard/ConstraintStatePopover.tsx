import { useEffect, useMemo, useRef } from "react";
import { Database, Link2 } from "lucide-react";
import type { BoardStateCard } from "./rules";
import { optionsBarPopoverStyle } from "@/components/optionsBarPopover";

interface ConstraintStatePopoverProps {
  /** State cards currently on the board (the only valid `states` source). */
  boardStates: BoardStateCard[];
  /** Name currently set on the row being edited (when editing). */
  currentName?: string;
  /** Names already used by other rows, shown dimmed so they aren't duplicated. */
  usedNames: string[];
  onSelect: (name: string) => void;
  isOpen: boolean;
  onClose: () => void;
  placement?: "top" | "bottom";
}

/**
 * ConstraintStatePopover — picks a State card on the board to reference from the
 * constraint's STATES section. Only real State cards are offered, so the list
 * can never reference something that does not exist.
 */
export function ConstraintStatePopover({
  boardStates,
  currentName,
  usedNames,
  onSelect,
  isOpen,
  onClose,
  placement = "top",
}: ConstraintStatePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  const usedKeys = useMemo(
    () => new Set(usedNames.map((n) => n.trim().toLowerCase()).filter(Boolean)),
    [usedNames],
  );

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

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      style={optionsBarPopoverStyle(placement)}
      className={`absolute left-0 ${positionClasses} w-[280px] max-h-[min(420px,calc(100vh-120px))] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none`}
    >
      <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Link2 size={13} className="text-rose-500" />
          <span>Constraint States</span>
        </span>
        <span className="text-[11px] font-normal text-gray-400 dark:text-zinc-500">
          {boardStates.length > 0 ? `${boardStates.length}` : "none"}
        </span>
      </div>

      <div className="mb-2.5 text-[11px] leading-tight text-gray-400 dark:text-zinc-500">
        Pick the State cards this constraint reads from.
      </div>

      {boardStates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-[11px] text-gray-400 dark:border-zinc-700 dark:text-zinc-500">
          No State cards on the board yet. Add a State card first.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {boardStates.map((card) => {
            const isCurrent = currentName?.trim() === card.name;
            const isUsed = !isCurrent && usedKeys.has(card.name.trim().toLowerCase());
            return (
              <button
                key={card.id}
                type="button"
                disabled={isUsed}
                onClick={() => onSelect(card.name)}
                title={card.fields.length > 0 ? card.fields.join(", ") : "No fields"}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                  isCurrent
                    ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    : isUsed
                      ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
                      : "cursor-pointer border-gray-200 bg-gray-50/60 text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="flex items-center gap-1.5 font-mono">
                  <Database size={12} className="text-teal-500" />
                  {card.name}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                  {card.fields.length} field{card.fields.length === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
