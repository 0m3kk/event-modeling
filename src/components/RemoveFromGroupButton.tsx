import { useCanvasStore } from "@/store";
import { FolderMinus } from "lucide-react";

interface RemoveFromGroupButtonProps {
  /** Id of the node to detach from its group. */
  objectId: string;
  /** Optional group name, used to make the tooltip concrete. */
  groupName?: string;
}

/**
 * Detaches a single node from its group while keeping the group (and its other
 * members) alive. Complements the Group bar's "Ungroup", which dissolves the
 * whole group.
 */
export function RemoveFromGroupButton({
  objectId,
  groupName,
}: RemoveFromGroupButtonProps) {
  const removeFromGroup = useCanvasStore((s) => s.removeFromGroup);

  return (
    <button
      onClick={() => removeFromGroup([objectId])}
      title={
        groupName ? `Remove from Group "${groupName}"` : "Remove from Group"
      }
      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-amber-50 hover:text-amber-600"
    >
      <FolderMinus size={16} />
    </button>
  );
}
