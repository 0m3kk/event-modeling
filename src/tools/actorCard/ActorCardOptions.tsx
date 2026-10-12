import { useMemo, useState } from "react";
import { ShieldPlus, Link2 } from "lucide-react";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { collectBoardActions } from "@/utils/rbac";
import { computeActorCardSize } from "./layout";
import { getActorPermissions, type ActorCardData } from "./rules";
import { ActorPermissionPopover } from "./ActorPermissionPopover";

interface ActorCardOptionsProps {
  element: CanvasElement<ActorCardData>;
  onUpdate: (partial: Partial<ActorCardData>) => void;
}

/**
 * Options bar for an Actor card:
 * - "Add Permission" opens a picker with a free-form pattern field (wildcards
 *   allowed) plus the Command/Query actions declared on the board.
 * - When a permission row is selected it can be repointed.
 */
export function ActorCardOptions({ element }: ActorCardOptionsProps) {
  const selectedField = useCanvasStore((s) => s.selectedField);
  const elements = useCanvasStore((s) => s.elements);

  const [permissionPicker, setPermissionPicker] = useState<{ open: boolean; index: number }>({
    open: false,
    index: -1,
  });

  const permissions = getActorPermissions(element.data);
  const boardActions = useMemo(() => collectBoardActions(elements), [elements]);

  const isThisSelected = selectedField?.elementId === element.id;
  const activeIndex =
    isThisSelected && selectedField?.sectionId === "permissions"
      ? selectedField?.fieldIndex ?? -1
      : -1;

  const commit = (data: ActorCardData) => {
    const size = computeActorCardSize(data, element.width);
    useCanvasStore.getState().updateElement(element.id, { height: size.height, data });
  };

  const handlePickPermission = (action: string) => {
    if (permissionPicker.index >= 0 && permissionPicker.index < permissions.length) {
      const next = [...permissions];
      next[permissionPicker.index] = { action };
      commit({ ...element.data, permissions: next });
    } else {
      const next = [...permissions, { action }];
      commit({ ...element.data, permissions: next });
      useCanvasStore.getState().setSelectedField({
        elementId: element.id,
        sectionIndex: 0,
        sectionId: "permissions",
        fieldIndex: next.length - 1,
      });
    }
    setPermissionPicker({ open: false, index: -1 });
  };

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <button
          onClick={() => setPermissionPicker({ open: !permissionPicker.open, index: -1 })}
          title="Add Permission"
          className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <ShieldPlus size={16} />
        </button>

        <ActorPermissionPopover
          boardActions={boardActions}
          currentAction={
            permissionPicker.index >= 0 ? permissions[permissionPicker.index]?.action : undefined
          }
          usedActions={permissions
            .filter((_, i) => i !== permissionPicker.index)
            .map((p) => p.action)}
          isOpen={permissionPicker.open}
          onClose={() => setPermissionPicker((prev) => ({ ...prev, open: false }))}
          onSelect={handlePickPermission}
        />
      </div>

      {activeIndex >= 0 && (
        <>
          <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-zinc-800" />

          <div className="relative">
            <button
              onClick={() =>
                setPermissionPicker({ open: !permissionPicker.open, index: activeIndex })
              }
              title="Change Permission"
              className="flex items-center justify-center rounded-lg p-1.5 text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/40 cursor-pointer transition-colors"
            >
              <Link2 size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
