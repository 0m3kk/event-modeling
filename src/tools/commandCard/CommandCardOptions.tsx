import { Plus } from "lucide-react";
import type { CanvasElement } from "@/types";
import type { CommandCardData } from "./index";
import { commandCardTool } from "./index";
import { useCanvasStore } from "@/store";

interface CommandCardOptionsProps {
  element: CanvasElement<CommandCardData>;
  onUpdate: (partial: Partial<CommandCardData>) => void;
}

export function CommandCardOptions({ element, onUpdate }: CommandCardOptionsProps) {
  const handleAddField = () => {
    const fields = element.data.fields ? [...element.data.fields] : [];
    const newField = {
      name: `field${fields.length + 1}`,
      type: "string",
    };
    const nextFields = [...fields, newField];
    const nextData = { ...element.data, fields: nextFields };
    const nextSize = commandCardTool.computeSize ? commandCardTool.computeSize(nextData) : null;

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
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <Plus size={13} />
        <span>Field</span>
      </button>
    </div>
  );
}
