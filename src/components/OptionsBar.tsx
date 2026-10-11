import { useState, useMemo, useEffect } from "react";
import { Trash2, Copy, Palette, Link2, ChevronDown, Tag, Info } from "lucide-react";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "@/tools";
import { ColorPickerPopover } from "./ColorPickerPopover";
import { FieldTypePopover } from "./FieldTypePopover";
import { FieldTagPopover } from "./FieldTagPopover";
import { DescriptionPopover } from "./DescriptionPopover";
import type { CanvasElement } from "@/types";
import { isElementOriginal } from "@/utils/reference";
import { findDescriptionText } from "@/utils/description";

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
  const updateSelectedFieldType = useCanvasStore((s) => s.updateSelectedFieldType);
  const toggleSelectedFieldTag = useCanvasStore((s) => s.toggleSelectedFieldTag);
  const updateSelectedFieldTag = useCanvasStore((s) => s.updateSelectedFieldTag);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);

  // Collect all unique tags across events in the board for smart suggestions
  const existingTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const el of elements) {
      if (el.type === "eventCard" && Array.isArray(el.data?.fields)) {
        for (const f of el.data.fields) {
          if (f.tag && typeof f.tag === "string") {
            tagSet.add(f.tag);
          }
        }
      }
    }
    return Array.from(tagSet);
  }, [elements]);

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

  // Close the description panel when the element selection changes so it never
  // lingers on a different card.
  useEffect(() => {
    setIsDescriptionOpen(false);
  }, [selectedIds]);

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

  // Viewport-aware smart popover placement:
  // OptionsBar is ~44px tall. When isAbove is true, it is shifted up by -translate-y-full.
  const barTop = isAbove ? barY - 48 : barY;
  const barBottom = isAbove ? barY : barY + 48;
  const windowHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const spaceAbove = Math.max(0, barTop);
  const spaceBelow = Math.max(0, windowHeight - barBottom);

  // Popover needs ~280px height. Open upwards ('top') ONLY if there is ample space above (>= 280px)
  // and more space above than below. Otherwise, open downwards ('bottom') to prevent screen clipping.
  const popoverPlacement: "top" | "bottom" =
    spaceAbove >= 280 && spaceAbove >= spaceBelow ? "top" : "bottom";

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

  // Active selected field (if any)
  const currentField = (() => {
    if (!isSingle || !singleElement || !isFieldSelected || !selectedField) return null;
    if (toolDef?.getSelectedFieldItem) {
      return toolDef.getSelectedFieldItem(singleElement, selectedField);
    }
    if (singleElement.type === "commandCard") {
      const section =
        selectedField.sectionIndex === 1
          ? singleElement.data?.responses
          : singleElement.data?.inputs;
      if (Array.isArray(section) && section[selectedField.fieldIndex]) {
        return section[selectedField.fieldIndex];
      }
    }
    if (Array.isArray(singleElement.data?.fields)) {
      return (
        (singleElement.data.fields[selectedField.fieldIndex] as
          | { name: string; type: string; isTag?: boolean; tag?: string }
          | undefined) ?? null
      );
    }
    return null;
  })();

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

  // Description scope: a selected field row (if any) or the card itself.
  const descriptionScopeField =
    isSingle && singleElement && isFieldSelected ? selectedField : null;
  const hasDescription = Boolean(
    isSingle && singleElement
      ? findDescriptionText(singleElement, descriptionScopeField)?.trim()
      : false,
  );

  return (
    <div
      className="pointer-events-none absolute z-40"
      style={{
        left: `${barX}px`,
        top: `${barY}px`,
        // Scale the bar together with the canvas so it zooms in/out with the
        // selected element. The transform-origin is set to the anchor edge
        // (bottom-center when above, top-center when below) so the bar stays
        // pinned to the element while growing/shrinking from that point.
        transform: `translate(-50%, ${isAbove ? "-100%" : "0"}) scale(${zoom})`,
        transformOrigin: isAbove ? "50% 100%" : "50% 0%",
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="pointer-events-auto relative flex items-center gap-1.5 rounded-2xl border border-gray-200/90 bg-white/95 px-3 py-1.5 shadow-2xl backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/95 select-none"
      >
        {/* 1. FIRST OPTION: COLOR PICKER (Common to ALL tools) */}
        <div className="relative">
          <button
            onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
            title="Change Color"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200/80 p-1.5 hover:bg-gray-100 dark:border-zinc-800 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            <span
              className="h-4.5 w-4.5 rounded-full border border-black/10 shadow-xs"
              style={{ backgroundColor: currentColor }}
            />
            <Palette size={14} className="text-gray-500 dark:text-zinc-400" />
          </button>

          <ColorPickerPopover
            currentColor={currentColor}
            isOpen={isColorPickerOpen}
            onClose={() => setIsColorPickerOpen(false)}
            onSelectColor={handleColorChange}
            placement={popoverPlacement}
          />
        </div>

        {/* 2. FIELD TYPE SELECTOR & TAG TOGGLE (When a field is actively selected) */}
        {currentField && (
          <>
            <div className="h-4 w-px bg-gray-200 dark:bg-zinc-800" />
            <div className="relative">
              <button
                onClick={() => setIsTypePickerOpen(!isTypePickerOpen)}
                title="Change Field Type"
                className="flex items-center gap-1.5 rounded-xl border border-gray-200/80 px-2.5 py-1 text-xs font-mono font-medium text-gray-700 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                <span className="text-xs text-gray-400 dark:text-zinc-500 font-sans">type:</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold text-[13px]">{currentField.type}</span>
                <ChevronDown size={13} className="text-gray-400" />
              </button>

              <FieldTypePopover
                currentType={currentField.type}
                isOpen={isTypePickerOpen}
                onClose={() => setIsTypePickerOpen(false)}
                onSelectType={(newType) => updateSelectedFieldType(newType)}
                placement={popoverPlacement}
              />
            </div>

            {/* Event Card Field Tag Popover (DCB consistency boundary) */}
            {(singleElement?.type === "eventCard" || Boolean(toolDef?.onToggleSubSelectTag)) && (
              <div className="relative">
                <button
                  onClick={() => setIsTagPickerOpen(!isTagPickerOpen)}
                  title={
                    currentField.tag
                      ? `DCB Consistency Boundary Tag: #${currentField.tag} (Click to change)`
                      : "Attach DCB Consistency Boundary Tag"
                  }
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-mono font-medium transition-colors cursor-pointer border ${
                    currentField.tag || currentField.isTag
                      ? "border-amber-400 bg-amber-500/15 text-amber-600 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-400"
                      : "border-gray-200/80 text-gray-600 hover:bg-gray-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Tag
                    size={13}
                    className={
                      currentField.tag || currentField.isTag
                        ? "fill-amber-500 text-amber-500"
                        : "text-gray-400 dark:text-zinc-500"
                    }
                  />
                  <span>{currentField.tag ? `#${currentField.tag}` : "+ tag"}</span>
                  <ChevronDown size={13} className="text-gray-400" />
                </button>

                <FieldTagPopover
                  currentTag={currentField.tag}
                  fieldName={currentField.name}
                  suggestedTags={existingTags}
                  isOpen={isTagPickerOpen}
                  onClose={() => setIsTagPickerOpen(false)}
                  onSelectTag={(newTag) => updateSelectedFieldTag(newTag)}
                  placement={popoverPlacement}
                />
              </div>
            )}
          </>
        )}

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

        {/* DESCRIPTION (ⓘ) — edits the card, or the selected field row */}
        {isSingle && singleElement && (
          <div className="relative">
            <button
              onClick={() => setIsDescriptionOpen(!isDescriptionOpen)}
              title={hasDescription ? "Edit Description" : "Add Description"}
              className={`flex items-center justify-center rounded-xl border p-1.5 transition-colors cursor-pointer ${
                hasDescription
                  ? "border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40"
                  : "border-transparent hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Info size={16} className="text-sky-600 dark:text-sky-400" />
            </button>

            {isDescriptionOpen && (
              <DescriptionPopover
                element={singleElement}
                onClose={() => setIsDescriptionOpen(false)}
                placement={popoverPlacement}
              />
            )}
          </div>
        )}

        <div className="h-4 w-px bg-gray-200 dark:bg-zinc-800" />

        {/* Linked Reference status indicator (Original ❖ vs Ref Copy 🔗) */}
        {isSingle && singleElement?.referenceId && (
          <>
            {isElementOriginal(singleElement, elements) ? (
              <div
                className="flex items-center gap-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200/80 dark:border-purple-800/80 px-2.5 py-1 text-xs font-medium text-purple-600 dark:text-purple-400"
                title="Original (Master): content edits automatically synchronize to all reference copies."
              >
                <span className="text-[13px] leading-none">❖</span>
                <span>Original</span>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-200/80 dark:border-sky-800/80 px-2.5 py-1 text-xs font-medium text-sky-600 dark:text-sky-400"
                title="Reference Copy: linked to original entity. Content edits stay synchronized."
              >
                <Link2 size={13} className="stroke-[2.5]" />
                <span>Ref Copy</span>
              </div>
            )}
            <div className="h-4 w-px bg-gray-200 dark:bg-zinc-800" />
          </>
        )}

        {/* 3. COMMON ACTIONS: COPY REFERENCE & DELETE */}
        {isSingle && !isFieldSelected && (
          <button
            onClick={handleCopyReference}
            title="Copy Reference"
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
          >
            <Copy size={16} />
          </button>
        )}

        <button
          onClick={handleDelete}
          title={isFieldSelected ? "Delete Field" : "Delete"}
          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
