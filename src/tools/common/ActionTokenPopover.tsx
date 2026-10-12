import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";

interface ActionTokenPopoverProps {
  /** Current action token on the card (undefined when unset). */
  value?: string;
  isOpen: boolean;
  onClose: () => void;
  /** Commits the edited token (empty string clears it). */
  onCommit: (value: string) => void;
  placement?: "top" | "bottom";
}

/**
 * ActionTokenPopover — edits the RBAC `action` token a Command/Query declares.
 * The token is the join key a Permission references, so it is entered as free
 * text in the `domain:verb` form (e.g. sales:placeOrder).
 */
export function ActionTokenPopover({
  value,
  isOpen,
  onClose,
  onCommit,
  placement = "top",
}: ActionTokenPopoverProps) {
  const [draft, setDraft] = useState(value ?? "");
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(value ?? "");
      // Focus after the popover mounts.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCommit(draft.trim());
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen, draft, onCommit, onClose]);

  if (!isOpen) return null;

  const positionClasses = placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2";

  const commit = () => {
    onCommit(draft.trim());
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      className={`absolute left-0 ${positionClasses} w-[300px] rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none`}
    >
      <div className="mb-2 flex items-center gap-1.5 px-0.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <KeyRound size={13} className="text-blue-500" />
        <span>Action Token</span>
      </div>

      <div className="mb-2.5 text-[11px] leading-tight text-gray-400 dark:text-zinc-500">
        The permission token this card declares, in <span className="font-mono">domain:verb</span> form
        (e.g. <span className="font-mono">sales:placeOrder</span>). Permissions reference it.
      </div>

      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder="sales:placeOrder"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        className="w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:text-zinc-100"
      />

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={commit}
          className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 cursor-pointer"
        >
          Save
        </button>
      </div>
    </div>
  );
}
