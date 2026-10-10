import { useState, useMemo, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject } from "@/types";
import { Database, X, Check, Search, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ConstraintStatePopoverProps {
  card: CanvasObject;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function ConstraintStatePopover({
  card,
  onClose,
  anchorPosition,
}: ConstraintStatePopoverProps) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const objects = useCanvasStore((s) => s.objects);
  const setStormConstraintState = useCanvasStore(
    (s) => s.setStormConstraintState,
  );

  const [searchTerm, setSearchTerm] = useState("");

  const currentStateId = card.stormData?.stateId;

  // Find all State cards on the board
  const stateCards = useMemo(() => {
    return objects.filter(
      (o): o is CanvasObject & { stormData: NonNullable<CanvasObject["stormData"]> } =>
        o.type === "storm" && o.stormData?.kind === "state",
    );
  }, [objects]);

  // Filter state cards by search term
  const filteredStates = useMemo(() => {
    if (!searchTerm.trim()) return stateCards;
    const term = searchTerm.toLowerCase().trim();
    return stateCards.filter((s) => {
      const name = s.stormData.name.toLowerCase();
      const outputFields = (s.stormData.outputFields ?? [])
        .map((f) => f.name.toLowerCase())
        .join(" ");
      return name.includes(term) || outputFields.includes(term);
    });
  }, [stateCards, searchTerm]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
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
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const handleSelectState = (stateId?: string) => {
    setStormConstraintState(card.id, stateId);
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      style={{
        position: "absolute",
        left: `${anchorPosition.x}px`,
        top: `${anchorPosition.y}px`,
        zIndex: 50,
      }}
      className="w-80 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden text-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/50">
        <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400 font-semibold text-xs uppercase tracking-wider">
          <Database size={14} />
          <span>{t("popovers.constraintState.title", "Link State")}</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded p-0.5 cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-transparent focus-within:border-teal-500">
          <Search size={14} className="text-zinc-400 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t(
              "popovers.constraintState.searchPlaceholder",
              "Search state cards...",
            )}
            className="w-full bg-transparent text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
          />
        </div>
      </div>

      {/* List of States */}
      <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
        {/* Unlink option if currently linked */}
        {currentStateId && (
          <button
            onClick={() => handleSelectState(undefined)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
          >
            <Unlink size={14} className="shrink-0" />
            <span>{t("popovers.constraintState.unlink", "Unlink State")}</span>
          </button>
        )}

        {stateCards.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400">
            {t(
              "popovers.constraintState.noStates",
              "No State cards on canvas. Create a State card first.",
            )}
          </div>
        ) : filteredStates.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400">
            {t("popovers.constraintState.noMatches", "No matching State cards found.")}
          </div>
        ) : (
          filteredStates.map((s) => {
            const isSelected = s.id === currentStateId;
            const outputCount = s.stormData.outputFields?.length ?? 0;
            const outputSummary = (s.stormData.outputFields ?? [])
              .map((f) => f.name)
              .slice(0, 3)
              .join(", ");

            return (
              <button
                key={s.id}
                onClick={() => handleSelectState(s.id)}
                className={`w-full flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium text-xs">
                    <span className="text-violet-600 dark:text-violet-400 shrink-0">⟡</span>
                    <span className="truncate">{s.stormData.name}</span>
                  </div>
                  {outputCount > 0 && (
                    <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                      Fields: {outputSummary}
                      {outputCount > 3 ? ` +${outputCount - 3}` : ""}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <Check
                    size={14}
                    className="text-teal-600 dark:text-teal-400 shrink-0 mt-0.5"
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
