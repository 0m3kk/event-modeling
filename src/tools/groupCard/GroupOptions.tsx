import { LayoutGrid } from "lucide-react";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import type { GroupData } from "./layout";

interface GroupOptionsProps {
  element: CanvasElement<GroupData>;
  onUpdate?: (partial: Partial<GroupData>) => void;
}

/**
 * Options bar for a Group: a single "Arrange" action that packs the Group's child
 * cards into a compact grid. Useful for a free-standing Group (e.g. a board-wide
 * "Actors" group) or to tidy one Group without arranging its whole Domain.
 */
export function GroupOptions({ element }: GroupOptionsProps) {
  const arrangeGroup = useCanvasStore((s) => s.arrangeGroup);

  return (
    <button
      onClick={() => arrangeGroup(element.id)}
      title="Arrange Group (cards in a grid)"
      className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
    >
      <LayoutGrid size={16} />
    </button>
  );
}
