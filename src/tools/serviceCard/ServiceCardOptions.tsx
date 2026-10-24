import { LogIn, LogOut } from "lucide-react";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import {
  computeServiceCardSize,
  getServiceRows,
  type ServiceCardData,
  type ServiceField,
  type ServiceGroup,
} from "./layout";

interface ServiceCardOptionsProps {
  element: CanvasElement<ServiceCardData>;
  onUpdate: (partial: Partial<ServiceCardData>) => void;
}

/**
 * Options bar for a Service card. A Service card is a single method execution,
 * so the only structural actions are adding a param or a return field.
 */
export function ServiceCardOptions({ element }: ServiceCardOptionsProps) {
  const handleAddRow = (group: ServiceGroup) => {
    const rows = getServiceRows(element.data, group);
    const newRow: ServiceField = {
      name: group === "params" ? `param${rows.length + 1}` : `res${rows.length + 1}`,
      type: "string",
    };
    const nextData: ServiceCardData = { ...element.data, [group]: [...rows, newRow] };
    const nextSize = computeServiceCardSize(nextData, element.width);
    // Only the content-driven height changes; a user-resized width is preserved.
    useCanvasStore.getState().updateElement(element.id, {
      height: nextSize.height,
      data: nextData,
    });
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleAddRow("params")}
        title="Add Param Field"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <LogIn size={16} />
      </button>

      <button
        onClick={() => handleAddRow("returns")}
        title="Add Return Field"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}
