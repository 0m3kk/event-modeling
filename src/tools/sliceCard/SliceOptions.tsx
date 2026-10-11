import { Plus, Trash2 } from "lucide-react";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { createSliceLane, type SliceData } from "./layout";

interface SliceOptionsProps {
  element: CanvasElement<SliceData>;
  onUpdate?: (partial: Partial<SliceData>) => void;
}

/**
 * Options bar for a Slice:
 * - "Add Lane" appends an empty lane.
 * - When a lane is selected (click its label / empty area), "Remove Lane"
 *   deletes it. Its cards are pushed out of the slice by the store's reflow.
 */
export function SliceOptions({ element }: SliceOptionsProps) {
  const selectedField = useCanvasStore((s) => s.selectedField);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const updateElement = useCanvasStore((s) => s.updateElement);

  const lanes = element.data.lanes ?? [];

  let activeLaneIndex: number | null = null;
  if (
    selectedField &&
    selectedField.elementId === element.id &&
    selectedIds.includes(element.id) &&
    selectedField.sectionId === "lane"
  ) {
    activeLaneIndex = selectedField.sectionIndex ?? null;
  }
  if (activeLaneIndex !== null && (activeLaneIndex < 0 || activeLaneIndex >= lanes.length)) {
    activeLaneIndex = null;
  }

  const handleAddLane = () => {
    const nextData: SliceData = { ...element.data, lanes: [...lanes, createSliceLane()] };
    updateElement(element.id, { data: nextData });
  };

  const handleRemoveLane = () => {
    if (activeLaneIndex === null) return;
    const nextData: SliceData = {
      ...element.data,
      lanes: lanes.filter((_, i) => i !== activeLaneIndex),
    };
    updateElement(element.id, { data: nextData });
    useCanvasStore.getState().setSelectedField(null);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleAddLane}
        title="Add Lane"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <Plus size={16} />
      </button>

      {activeLaneIndex !== null && (
        <button
          onClick={handleRemoveLane}
          title="Remove Lane (pushes its cards out)"
          className="flex items-center justify-center rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
