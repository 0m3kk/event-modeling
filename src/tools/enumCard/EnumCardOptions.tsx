import { Plus } from "lucide-react";
import type { CanvasElement } from "@/types";
import type { EnumCardData } from "./index";
import { enumCardTool } from "./index";
import { useCanvasStore } from "@/store";

interface EnumCardOptionsProps {
  element: CanvasElement<EnumCardData>;
  onUpdate: (partial: Partial<EnumCardData>) => void;
}

export function EnumCardOptions({ element, onUpdate }: EnumCardOptionsProps) {
  const handleAddValue = () => {
    const fields = element.data.fields ? [...element.data.fields] : [];
    const newValue = {
      name: `value${fields.length + 1}`,
    };
    const nextFields = [...fields, newValue];
    const nextData = { ...element.data, fields: nextFields };
    const nextSize = enumCardTool.computeSize ? enumCardTool.computeSize(nextData) : null;

    if (nextSize) {
      useCanvasStore.getState().updateElement(element.id, {
        width: nextSize.width,
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
        onClick={handleAddValue}
        title="Add Value"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
