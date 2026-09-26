import { useState, useMemo, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject } from "@/types";
import {
  getAllDefinedActions,
  getActorPermissions,
  matchesPermission,
} from "@/utils/stormAuth";
import { X, Plus, Shield, Trash2, Check } from "lucide-react";

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
  const objects = useCanvasStore((s) => s.objects);
  const updateObject = useCanvasStore((s) => s.updateObject);

  const permissions = useMemo(() => {
    return getActorPermissions(actor.stormData);
  }, [actor.stormData]);

  const [customInput, setCustomInput] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const canvasActions = useMemo(() => {
    return getAllDefinedActions(objects);
  }, [objects]);

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

  const handleToggleAction = (action: string) => {
    if (permissions.includes(action)) {
      handleRemove(action);
    } else {
      handleUpdatePermissions([...permissions, action]);
    }
  };

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 flex w-92 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
      style={{
        left: Math.max(12, anchorPosition.x - 184),
        top: Math.max(12, anchorPosition.y + 8),
      }}
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <Shield size={16} className="text-pink-600" />
          <span>Actor Permissions Manager</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={15} />
        </button>
      </div>

      {/* Add Custom Permission */}
      <div className="mt-3 flex items-center gap-1.5">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
          placeholder="order:* or resource:read:own"
          className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 font-mono text-xs text-gray-800 focus:border-pink-500 focus:outline-none"
        />
        <button
          onClick={handleAddCustom}
          disabled={!customInput.trim()}
          className="flex items-center gap-1 rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-40"
        >
          <Plus size={13} />
          Add
        </button>
      </div>

      {/* Current Permissions */}
      <div className="mt-3">
        <div className="text-[11px] font-medium tracking-wider text-gray-500 uppercase">
          Current Permissions ({permissions.length})
        </div>
        <div className="mt-1.5 flex max-h-36 flex-col gap-1 overflow-y-auto pr-1">
          {permissions.length === 0 ? (
            <div className="py-2 text-center text-xs text-gray-400 italic">
              No permissions granted
            </div>
          ) : (
            permissions.map((perm) => (
              <div
                key={perm}
                className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs"
              >
                <span className="font-mono text-gray-700">{perm}</span>
                <button
                  onClick={() => handleRemove(perm)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-500"
                  title="Remove permission"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Canvas Actions to grant */}
      {canvasActions.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-2.5">
          <div className="text-[11px] font-medium tracking-wider text-gray-500 uppercase">
            Actions on Board
          </div>
          <div className="mt-1.5 flex max-h-36 flex-col gap-1 overflow-y-auto pr-1">
            {canvasActions.map((act) => {
              const isDirectlyGranted = permissions.includes(act);
              const isCoveredByWildcard =
                !isDirectlyGranted &&
                permissions.some((p) => matchesPermission(p, act));

              return (
                <button
                  key={act}
                  onClick={() => handleToggleAction(act)}
                  className={`flex items-center justify-between rounded px-2.5 py-1 text-left font-mono text-xs transition-all ${
                    isDirectlyGranted
                      ? "border border-pink-200 bg-pink-50 text-pink-700"
                      : isCoveredByWildcard
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span>{act}</span>
                  {isDirectlyGranted ? (
                    <Check size={12} className="text-pink-600" />
                  ) : isCoveredByWildcard ? (
                    <span className="font-sans text-[10px] font-medium text-emerald-600">
                      via wildcard
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
