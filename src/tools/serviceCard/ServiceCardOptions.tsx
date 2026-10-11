import { Copy, LogIn, LogOut, Plus, Trash2 } from "lucide-react";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import {
  bandToMethodIndex,
  computeServiceCardSize,
  type ServiceCardData,
  type ServiceField,
  type ServiceGroup,
} from "./layout";
import { createServiceMethod } from "./index";

interface ServiceCardOptionsProps {
  element: CanvasElement<ServiceCardData>;
  onUpdate: (partial: Partial<ServiceCardData>) => void;
}

/**
 * Options bar for a Service card:
 * - "Add Method" always (unless this element is a method-execution copy).
 * - When a method is selected: add param / add return, copy the method as a
 *   live execution copy, and delete the method.
 */
export function ServiceCardOptions({ element }: ServiceCardOptionsProps) {
  const selectedField = useCanvasStore((s) => s.selectedField);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const createMethodCopy = useCanvasStore((s) => s.createMethodCopy);

  const isMethodCopy = Boolean(element.data.methodRef);
  const methods = element.data.methods ?? [];

  // Which method the current selection points at (header or one of its rows).
  let activeMethodIndex: number | null = null;
  if (
    selectedField &&
    selectedField.elementId === element.id &&
    selectedIds.includes(element.id)
  ) {
    if (selectedField.sectionId === "method") {
      activeMethodIndex = selectedField.sectionIndex ?? null;
    } else if (selectedField.fieldIndex >= 0) {
      activeMethodIndex = bandToMethodIndex(selectedField.sectionIndex ?? 0);
    }
  }
  if (activeMethodIndex !== null && (activeMethodIndex < 0 || activeMethodIndex >= methods.length)) {
    activeMethodIndex = null;
  }

  const commit = (nextMethods: ServiceCardData["methods"]) => {
    const nextData: ServiceCardData = { ...element.data, methods: nextMethods };
    const nextSize = computeServiceCardSize(nextData);
    // Only the content-driven height changes; a user-resized width is preserved.
    useCanvasStore.getState().updateElement(element.id, {
      height: nextSize.height,
      data: nextData,
    });
  };

  const handleAddMethod = () => {
    const nextMethods = [...methods, createServiceMethod(methods.length + 1)];
    commit(nextMethods);
    useCanvasStore.getState().setSelectedField({
      elementId: element.id,
      sectionId: "method",
      sectionIndex: nextMethods.length - 1,
      fieldIndex: -1,
    });
  };

  const handleAddRow = (group: ServiceGroup) => {
    if (activeMethodIndex === null) return;
    const method = methods[activeMethodIndex];
    if (!method) return;
    const rows = method[group] ?? [];
    const newRow: ServiceField = {
      name: group === "params" ? `param${rows.length + 1}` : `res${rows.length + 1}`,
      type: "string",
    };
    const nextMethods = [...methods];
    nextMethods[activeMethodIndex] = { ...method, [group]: [...rows, newRow] };
    commit(nextMethods);
  };

  const handleDeleteMethod = () => {
    if (activeMethodIndex === null) return;
    const nextMethods = methods.filter((_, i) => i !== activeMethodIndex);
    commit(nextMethods);
    useCanvasStore.getState().setSelectedField(null);
  };

  const handleCopyMethod = () => {
    if (activeMethodIndex === null) return;
    const method = methods[activeMethodIndex];
    if (!method) return;
    createMethodCopy(element.id, method.id);
  };

  const hasActiveMethod = activeMethodIndex !== null;

  return (
    <div className="flex items-center gap-1">
      {!isMethodCopy && (
        <button
          onClick={handleAddMethod}
          title="Add Method"
          className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <Plus size={16} />
        </button>
      )}

      {!isMethodCopy && hasActiveMethod && (
        <>
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

          <button
            onClick={handleDeleteMethod}
            title="Delete Method"
            className="flex items-center justify-center rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </>
      )}

      {hasActiveMethod && (
        <button
          onClick={handleCopyMethod}
          title="Copy Method as Execution"
          className="flex items-center justify-center rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40 cursor-pointer transition-colors"
        >
          <Copy size={16} />
        </button>
      )}
    </div>
  );
}
