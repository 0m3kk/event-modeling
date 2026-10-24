import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, ShieldHalf } from "lucide-react";
import type { BoardAction } from "@/utils/rbac";
import { toDisplayAction } from "@/utils/naming";

interface ActorPermissionPopoverProps {
  /** Actions declared by Command/Query cards on the board. */
  boardActions: BoardAction[];
  /** Permission currently set on the row being edited (when editing). */
  currentAction?: string;
  /** Patterns already used by other rows, shown dimmed so they aren't duplicated. */
  usedActions: string[];
  onSelect: (action: string) => void;
  isOpen: boolean;
  onClose: () => void;
  placement?: "top" | "bottom";
}

/** Splits an action token into its namespace and verb (`sales:placeOrder`). */
function splitAction(action: string): { ns: string; verb: string } {
  const idx = action.indexOf(":");
  if (idx < 0) return { ns: "", verb: action };
  return { ns: action.slice(0, idx), verb: action.slice(idx + 1) };
}

/**
 * ActorPermissionPopover — sets the action pattern a permission grants.
 *
 * A permission may be a concrete action token (sales:placeOrder) or a wildcard
 * pattern that matches many actions (sales:*, *:getOrder). The text field at the
 * top accepts any pattern; the list below offers the actions declared on the
 * board plus a per-namespace wildcard shortcut.
 */
export function ActorPermissionPopover({
  boardActions,
  currentAction,
  usedActions,
  onSelect,
  isOpen,
  onClose,
  placement = "top",
}: ActorPermissionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(currentAction ?? "");

  useEffect(() => {
    if (isOpen) {
      setDraft(currentAction ?? "");
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen, currentAction]);

  const usedKeys = useMemo(
    () => new Set(usedActions.map((a) => a.trim().toLowerCase()).filter(Boolean)),
    [usedActions],
  );

  const groups = useMemo(() => {
    const map = new Map<string, BoardAction[]>();
    for (const entry of boardActions) {
      const { ns } = splitAction(entry.action);
      const list = map.get(ns);
      if (list) list.push(entry);
      else map.set(ns, [entry]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [boardActions]);

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
  const currentKey = currentAction?.trim().toLowerCase();

  const commitDraft = () => {
    const value = draft.trim();
    if (value) onSelect(value);
    else onClose();
  };

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      className={`absolute left-0 ${positionClasses} w-[320px] max-h-[min(460px,calc(100vh-120px))] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none`}
    >
      <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <ShieldHalf size={13} className="text-violet-500" />
          <span>Actor Permissions</span>
        </span>
        <span className="text-[11px] font-normal text-gray-400 dark:text-zinc-500">
          {boardActions.length > 0 ? `${boardActions.length} actions` : "no actions"}
        </span>
      </div>

      {/* Free-form pattern: exact token or wildcard. */}
      <div className="mb-3">
        <div className="mb-1 text-[11px] leading-tight text-gray-400 dark:text-zinc-500">
          Enter an action token or a wildcard pattern (<span className="font-mono">sales:*</span>,{" "}
          <span className="font-mono">*:getOrder</span>).
        </div>
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            placeholder="sales:*"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            className="w-full rounded-xl border border-gray-300 bg-transparent px-3 py-1.5 font-mono text-xs outline-none focus:border-violet-500 dark:border-zinc-700 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={commitDraft}
            className="shrink-0 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 cursor-pointer"
          >
            Use
          </button>
        </div>
      </div>

      {boardActions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-[11px] text-gray-400 dark:border-zinc-700 dark:text-zinc-500">
          No Command/Query actions on the board yet. Give a Command or Query an action first.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(([ns, entries]) => {
            const wildcard = ns ? `${ns}:*` : "*";
            const wildcardKey = wildcard.toLowerCase();
            const wildcardUsed = wildcardKey !== currentKey && usedKeys.has(wildcardKey);
            return (
              <div key={ns || "__default"} className="flex flex-col gap-1">
                <div className="flex items-center justify-between px-0.5">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                    {ns ? toDisplayAction(ns) : "(no namespace)"}
                  </span>
                  {ns && (
                    <button
                      type="button"
                      disabled={wildcardUsed}
                      onClick={() => onSelect(wildcard)}
                      className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                        wildcardKey === currentKey
                          ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                          : wildcardUsed
                            ? "cursor-not-allowed border-gray-200 text-gray-300 dark:border-zinc-800 dark:text-zinc-600"
                            : "cursor-pointer border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                      title={`Grant every action in "${ns}"`}
                    >
                      {toDisplayAction(wildcard)}
                    </button>
                  )}
                </div>

                {entries.map((entry) => {
                  const isCurrent = entry.action.trim().toLowerCase() === currentKey;
                  const isUsed = !isCurrent && usedKeys.has(entry.action.trim().toLowerCase());
                  return (
                    <button
                      key={entry.cardId + entry.action}
                      type="button"
                      disabled={isUsed}
                      onClick={() => onSelect(entry.action)}
                      title={`${entry.cardType === "commandCard" ? "Command" : "Query"} ${entry.cardName}`}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isCurrent
                          ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                          : isUsed
                            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
                            : "cursor-pointer border-gray-200 bg-gray-50/60 text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-mono">
                        <Link2 size={12} className="text-violet-500" />
                        {toDisplayAction(entry.action)}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                        {entry.cardName}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
