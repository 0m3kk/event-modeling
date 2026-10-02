import { useState, useMemo, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject } from "@/types";
import { getActorPermissions } from "@/utils/stormAuth";
import { X, Plus, Shield, Trash2, KeyRound } from "lucide-react";

interface PermissionsPopoverProps {
  actor: CanvasObject;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function PermissionsPopover({
  actor,
  onClose,
  anchorPosition,
}: PermissionsPopoverProps) {
  const updateObject = useCanvasStore((s) => s.updateObject);

  const permissions = useMemo(() => {
    return getActorPermissions(actor.stormData);
  }, [actor.stormData]);

  const [customInput, setCustomInput] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

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

  const handleUpdatePermissions = (nextPermissions: string[]) => {
    if (!actor.stormData) return;
    updateObject(actor.id, {
      stormData: {
        ...actor.stormData,
        permissions: nextPermissions,
        fields: [],
      },
    });
  };

  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (!permissions.includes(trimmed)) {
      handleUpdatePermissions([...permissions, trimmed]);
    }
    setCustomInput("");
  };

  const handleRemove = (perm: string) => {
    handleUpdatePermissions(permissions.filter((p) => p !== perm));
  };

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
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-zinc-100">
          <Shield size={16} className="text-pink-600 dark:text-pink-400" />
          <span>Actor Permissions</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-600 dark:hover:text-zinc-300 cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {/* Add Permission */}
      <div className="mt-3 flex items-center gap-1.5">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
          placeholder="e.g. *:register:public or order:*"
          className="flex-1 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 font-mono text-xs text-gray-800 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:border-pink-500 focus:outline-none"
        />
        <button
          onClick={handleAddCustom}
          disabled={!customInput.trim()}
          className="flex items-center gap-1 rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-40 cursor-pointer"
        >
          <Plus size={13} />
          Add
        </button>
      </div>

      {/* Current Permissions */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-medium tracking-wider text-gray-500 dark:text-zinc-400 uppercase">
          <span>Granted Permissions ({permissions.length})</span>
        </div>
        <div className="mt-1.5 flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
          {permissions.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-400 dark:text-zinc-500 italic">
              No permissions granted
            </div>
          ) : (
            permissions.map((perm) => (
              <div
                key={perm}
                className="flex items-center justify-between rounded-lg border border-pink-100 dark:border-pink-900/50 bg-pink-50/50 dark:bg-pink-950/30 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <KeyRound size={12} className="shrink-0 text-pink-600 dark:text-pink-400" />
                  <span className="truncate font-mono text-gray-800 dark:text-zinc-200">
                    {perm}
                  </span>
                </div>
                <button
                  onClick={() => handleRemove(perm)}
                  className="rounded p-1 text-gray-400 dark:text-zinc-500 hover:bg-pink-100 dark:hover:bg-pink-900/50 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                  title="Remove permission"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
