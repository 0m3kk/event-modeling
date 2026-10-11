import { Plus } from "lucide-react";
import type { CanvasElement } from "@/types";
import type { EventCardData } from "./index";
import { eventCardTool } from "./index";
import { useCanvasStore } from "@/store";

interface EventCardOptionsProps {
  element: CanvasElement<EventCardData>;
  onUpdate: (partial: Partial<EventCardData>) => void;
}

export function EventCardOptions({ element, onUpdate }: EventCardOptionsProps) {
  const handleAddField = () => {
    const fields = element.data.fields ? [...element.data.fields] : [];
    const newField = {
      name: `field${fields.length + 1}`,
      type: "string",
    };
    const nextFields = [...fields, newField];
    const nextData = { ...element.data, fields: nextFields };
    const nextSize = eventCardTool.computeSize ? eventCardTool.computeSize(nextData) : null;

    if (nextSize) {
      useCanvasStore.getState().updateElement(element.id, {
        height: nextSize.height,
        data: nextData,
      });
    } else {
      onUpdate({ fields: nextFields });
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleAddField}
        title="Add Field"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
