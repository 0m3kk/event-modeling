import { useState, useMemo } from "react";
import { Trash2, Copy, Palette } from "lucide-react";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "@/tools";
import { ColorPickerPopover } from "./ColorPickerPopover";
import type { CanvasElement } from "@/types";

export function OptionsBar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const elements = useCanvasStore((s) => s.elements);
  const viewport = useCanvasStore((s) => s.viewport);
  const updateElement = useCanvasStore((s) => s.updateElement);
  const updateElements = useCanvasStore((s) => s.updateElements);
  const createReferenceCopy = useCanvasStore((s) => s.createReferenceCopy);
  const deleteElements = useCanvasStore((s) => s.deleteElements);
  const selectedField = useCanvasStore((s) => s.selectedField);
  const deleteSelectedField = useCanvasStore((s) => s.deleteSelectedField);

  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  // Compute selected items and bounding rect
  const { selectedElements, bounds } = useMemo(() => {
    if (selectedIds.length === 0) {
      return { selectedElements: [], bounds: null };
    }

    const selectedSet = new Set(selectedIds);
    const selected = elements.filter((el) => selectedSet.has(el.id));

    if (selected.length === 0) {
      return { selectedElements: [], bounds: null };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of selected) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }

    return {
      selectedElements: selected,
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  }, [selectedIds, elements]);

  const isDragging = useCanvasStore((s) => s.isDragging);

  if (isDragging || !bounds || selectedElements.length === 0) return null;

  const isSingle = selectedElements.length === 1;
  const singleElement = isSingle ? selectedElements[0] : null;
  const toolDef = singleElement ? toolRegistry.get(singleElement.type) : null;

  // Screen coordinates
  const zoom = viewport.zoom || 1;
  const screenX = bounds.x * zoom + viewport.x;
  const screenY = bounds.y * zoom + viewport.y;
  const screenW = bounds.width * zoom;
  const screenH = bounds.height * zoom;

  const barX = screenX + screenW / 2;
  const isAbove = screenY >= 56;
  const barY = isAbove ? screenY - 12 : screenY + screenH + 12;
  const popoverPlacement: "top" | "bottom" = isAbove && barY >= 140 ? "top" : "bottom";

  // Active color
  const currentColor =
    (singleElement?.data as any)?.color || toolDef?.color || "#f97316";

  const handleColorChange = (newColor: string) => {
    if (isSingle && singleElement) {
      updateElement(singleElement.id, {
        data: { ...singleElement.data, color: newColor },
      });
    } else {
      const updates = selectedElements.map((el) => ({
        id: el.id,
        data: { ...el.data, color: newColor },
      }));
      updateElements(updates);
    }
  };

  const isFieldSelected = Boolean(selectedField && selectedIds.includes(selectedField.elementId));

  const handleCopyReference = () => {
    if (isSingle && singleElement) {
      createReferenceCopy(singleElement.id);
    }
  };

  const handleDelete = () => {
    if (isFieldSelected) {
      deleteSelectedField();
    } else {
      deleteElements(selectedIds);
    }
  };

  const ToolCustomOptions = toolDef?.optionsBar;

  return (
    <div
      className={`pointer-events-none absolute z-40 -translate-x-1/2 ${
        isAbove ? "-translate-y-full" : ""
      }`}
      style={{
        left: `${barX}px`,
        top: `${barY}px`,
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="pointer-events-auto relative flex items-center gap-1.5 rounded-2xl border border-gray-200/90 bg-white/95 px-2.5 py-1.5 shadow-2xl backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/95 select-none"
      >
        {/* 1. FIRST OPTION: COLOR PICKER (Common to ALL tools) */}
        <div className="relative">
          <button
            onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
            title="Change Color"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200/80 p-1.5 hover:bg-gray-100 dark:border-zinc-800 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            <span
              className="h-4 w-4 rounded-full border border-black/10 shadow-xs"
              style={{ backgroundColor: currentColor }}
            />
            <Palette size={13} className="text-gray-500 dark:text-zinc-400" />
          </button>

          <ColorPickerPopover
            currentColor={currentColor}
            isOpen={isColorPickerOpen}
            onClose={() => setIsColorPickerOpen(false)}
            onSelectColor={handleColorChange}
            placement={popoverPlacement}
          />
        </div>

        {/* 2. TOOL-SPECIFIC CUSTOM OPTIONS (if defined by tool plugin) */}
        {isSingle && singleElement && ToolCustomOptions && (
          <>
            <div className="h-4 w-px bg-gray-200 dark:bg-zinc-800" />
            <ToolCustomOptions
              element={singleElement}
              onUpdate={(patch) =>
                updateElement(singleElement.id, {
                  data: { ...singleElement.data, ...patch },
                })
              }
            />
          </>
        )}

        <div className="h-4 w-px bg-gray-200 dark:bg-zinc-800" />

        {/* 3. COMMON ACTIONS: COPY REFERENCE & DELETE */}
        {isSingle && !isFieldSelected && (
          <button
            onClick={handleCopyReference}
            title="Copy Reference"
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            <Copy size={15} />
          </button>
        )}

        <button
          onClick={handleDelete}
          title={isFieldSelected ? "Delete Field" : "Delete"}
          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
