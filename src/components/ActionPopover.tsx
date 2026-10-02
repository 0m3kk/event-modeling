import { useState, useMemo, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject, StormKind } from "@/types";
import {
  COMMON_VERBS,
  COMMON_SCOPES,
  getAllDefinedActions,
  getAuthorizedActors,
  suggestActionForCard,
  formatAction,
  parseAction,
} from "@/utils/stormAuth";
import { X, Sparkles, Shield, User, Check } from "lucide-react";

interface ActionPopoverProps {
  card: CanvasObject;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function ActionPopover({
  card,
  onClose,
  anchorPosition,
}: ActionPopoverProps) {
  const objects = useCanvasStore((s) => s.objects);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const setStormActionHover = useCanvasStore((s) => s.setStormActionHover);

  const initialAction = card.stormData?.action || "";
  const [actionInput, setActionInput] = useState(initialAction);
  const popoverRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => parseAction(actionInput), [actionInput]);

  const existingActions = useMemo(() => {
    return getAllDefinedActions(objects).filter((a) => a !== actionInput);
  }, [objects, actionInput]);

  const authorizedActors = useMemo(() => {
    return getAuthorizedActors(objects, actionInput);
  }, [objects, actionInput]);

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
      setStormActionHover(null);
    };
  }, [onClose, setStormActionHover]);

  const handleApplyAction = (newAction: string) => {
    setActionInput(newAction);
    if (!card.stormData) return;
    updateObject(card.id, {
      stormData: {
        ...card.stormData,
        action: newAction.trim() || undefined,
      },
    });
  };

  const handleSuggest = () => {
    const kind = card.stormData?.kind || "command";
    const name = card.stormData?.name || "";
    const suggested = suggestActionForCard(kind as StormKind, name);
    handleApplyAction(suggested);
  };

  const handleSelectVerb = (v: string) => {
    const resource = parsed.resource || "resource";
    const scope = parsed.scope || "own";
    handleApplyAction(formatAction(resource, v, scope));
  };

  const handleSelectScope = (s: string) => {
    const resource = parsed.resource || "resource";
    const verb = parsed.verb || "create";
    handleApplyAction(formatAction(resource, verb, s));
  };

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 flex w-88 flex-col rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xl"
      style={{
        left: Math.max(12, anchorPosition.x - 176),
        top: Math.max(12, anchorPosition.y + 8),
      }}
      onPointerEnter={() => {
        if (actionInput) setStormActionHover(actionInput);
      }}
      onPointerLeave={() => {
        setStormActionHover(null);
      }}
    >
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-zinc-100">
          <Shield size={16} className="text-blue-600 dark:text-blue-400" />
          <span>RBAC Authorization Action</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-600 dark:hover:text-zinc-300 cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={actionInput}
            onChange={(e) => handleApplyAction(e.target.value)}
            placeholder="resource:verb:scope"
            className="flex-1 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 font-mono text-xs text-gray-800 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSuggest}
            title="Auto-suggest action from title"
            className="flex items-center gap-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-2 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer"
          >
            <Sparkles size={13} />
            Suggest
          </button>
        </div>

        {/* Verbs Chips */}
        <div className="mt-1">
          <div className="text-[11px] font-medium tracking-wider text-gray-500 dark:text-zinc-400 uppercase">
            Verb
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {COMMON_VERBS.map((v) => (
              <button
                key={v}
                onClick={() => handleSelectVerb(v)}
                className={`rounded px-2 py-0.5 font-mono text-[11px] transition-all cursor-pointer ${
                  parsed.verb === v
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Scope Chips */}
        <div className="mt-1">
          <div className="text-[11px] font-medium tracking-wider text-gray-500 dark:text-zinc-400 uppercase">
            Scope
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {COMMON_SCOPES.map((s) => (
              <button
                key={s}
                onClick={() => handleSelectScope(s)}
                className={`rounded px-2 py-0.5 font-mono text-[11px] transition-all cursor-pointer ${
                  parsed.scope === s
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Existing Canvas Actions */}
        {existingActions.length > 0 && (
          <div className="mt-1">
            <div className="text-[11px] font-medium tracking-wider text-gray-500 dark:text-zinc-400 uppercase">
              Used on Canvas
            </div>
            <div className="mt-1 flex max-h-24 flex-col gap-1 overflow-y-auto pr-1">
              {existingActions.map((act) => (
                <button
                  key={act}
                  onClick={() => handleApplyAction(act)}
                  className="flex items-center justify-between rounded px-2 py-1 text-left font-mono text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <span>{act}</span>
                  {actionInput === act && (
                    <Check size={12} className="text-blue-600 dark:text-blue-400" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Authorized Actors Inspection */}
        <div className="mt-2 rounded-lg border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/60 p-2.5">
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-zinc-300">
            <span className="font-medium">Authorized Actors</span>
            <span className="py-0.2 rounded-full bg-blue-100 dark:bg-blue-950/60 px-1.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
              {authorizedActors.length}
            </span>
          </div>

          <div className="mt-1.5 max-h-20 overflow-y-auto">
            {authorizedActors.length === 0 ? (
              <div className="text-[11px] text-gray-400 dark:text-zinc-500 italic">
                No actor on canvas has permissions matching this action
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {authorizedActors.map((actor) => (
                  <span
                    key={actor.id}
                    className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-0.5 text-xs text-gray-800 dark:text-zinc-200 shadow-2xs"
                  >
                    <User size={11} className="text-pink-600 dark:text-pink-400" />
                    {actor.stormData?.name || "Actor"}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
