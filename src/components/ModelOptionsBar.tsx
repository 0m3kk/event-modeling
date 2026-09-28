import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useCanvasStore } from "@/store";
import type { ModelNodeKind } from "@/types";
import { MODEL_KIND_COLORS, MODEL_KIND_LABELS } from "@/constants/model";
import { DescriptionPopover } from "./DescriptionPopover";
import { findDescriptionText } from "@/utils/description";
import {
  Box,
  List,
  Brackets,
  Parentheses,
  Link2,
  ChevronDown,
  Plus,
  Trash2,
  Info,
} from "lucide-react";

const MODEL_KIND_ICONS: Record<ModelNodeKind, ReactNode> = {
  object: <Box size={16} />,
  enum: <List size={16} />,
  array: <Brackets size={16} />,
  wrap: <Parentheses size={16} />,
};

const ALL_KINDS: ModelNodeKind[] = ["object", "enum", "array", "wrap"];

export function ModelOptionsBar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const deleteObjects = useCanvasStore((s) => s.deleteObjects);
  const deleteSelectedStormField = useCanvasStore(
    (s) => s.deleteSelectedStormField,
  );
  const addModelField = useCanvasStore((s) => s.addModelField);
  const addModelEnumValue = useCanvasStore((s) => s.addModelEnumValue);
  const createReferenceCopy = useCanvasStore((s) => s.createReferenceCopy);
  const isLocked = useCanvasStore((s) => s.isLocked);
  const stormSelectedField = useCanvasStore((s) => s.stormSelectedField);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const [showKindDropdown, setShowKindDropdown] = useState(false);
  const [showDescriptionPopover, setShowDescriptionPopover] = useState(false);

  const selectedModel = useMemo(() => {
    if (selectedIds.length !== 1 || isLocked) return null;
    const obj = objects.find((o) => o.id === selectedIds[0]);
    if (obj && obj.type === "model" && obj.modelData) return obj;
    return null;
  }, [selectedIds, objects, isLocked]);

  if (!selectedModel || !selectedModel.modelData || isDragging) return null;

  const data = selectedModel.modelData;
  const kind = data.kind;

  // Calculate screen position & zoom scale
  const zoom = viewport.zoom;
  const screenX = (selectedModel.x - viewport.x) * zoom;
  const screenY = (selectedModel.y - viewport.y) * zoom;
  const cardWidth = selectedModel.width * zoom;
  const cardHeight = (selectedModel.height || 140) * zoom;

  const barScale = Math.max(0.35, Math.min(2.0, zoom));

  const barX = screenX + cardWidth / 2;
  const isAbove = screenY >= 48 * barScale + 10;
  const barY = isAbove ? screenY - 10 : screenY + cardHeight + 10;

  const handleKindSelect = (nextKind: ModelNodeKind) => {
    if (!selectedModel.modelData) return;
    updateObject(selectedModel.id, {
      modelData: {
        ...selectedModel.modelData,
        kind: nextKind,
      },
    });
    setShowKindDropdown(false);
  };

  const handleAddRow = () => {
    if (kind === "object") {
      addModelField(selectedModel.id);
    } else if (kind === "enum") {
      addModelEnumValue(selectedModel.id);
    }
  };

  const sf = stormSelectedField;
  const isRowSelected = Boolean(
    sf &&
      sf.objectId === selectedModel.id &&
      sf.fieldId &&
      ((kind === "object" && data.fields?.some((f) => f.id === sf.fieldId)) ||
        (kind === "enum" && data.values?.some((v) => v.id === sf.fieldId))),
  );

  const selectedModelRow = (() => {
    if (!isRowSelected || !sf?.fieldId) return null;
    if (kind === "object") {
      return data.fields?.find((f) => f.id === sf.fieldId) ?? null;
    }
    if (kind === "enum") {
      return data.values?.find((v) => v.id === sf.fieldId) ?? null;
    }
    return null;
  })();

  const currentDescription =
    isRowSelected && sf?.fieldId
      ? findDescriptionText(selectedModel, sf.fieldId)
      : data.description;

  const infoTitle = currentDescription
    ? `Description: ${currentDescription}`
    : isRowSelected
      ? kind === "enum"
        ? "Add Value Description"
        : "Add Field Description"
      : "Add Description";

  const handleDelete = () => {
    if (isRowSelected) {
      deleteSelectedStormField();
    } else {
      deleteObjects([selectedModel.id]);
    }
  };

  const trashTitle = isRowSelected
    ? kind === "enum"
      ? selectedModelRow?.name
        ? `Delete Value "${selectedModelRow.name}"`
        : "Delete Value"
      : selectedModelRow?.name
        ? `Delete Field "${selectedModelRow.name}"`
        : "Delete Field"
    : "Delete Model";

  return (
    <>
      <div
        className={`pointer-events-none absolute z-40 -translate-x-1/2 ${
          isAbove ? "-translate-y-full" : ""
        }`}
        style={{
          left: barX,
          top: barY,
        }}
      >
        <div
          className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-gray-200/90 bg-white/95 px-3.5 py-2 shadow-2xl backdrop-blur-md select-none"
          style={{
            zoom: barScale,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
        {/* Kind Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowKindDropdown((v) => !v)}
            title={`Type: ${MODEL_KIND_LABELS[kind]}`}
            className="flex h-8 items-center gap-1 rounded-lg px-2 transition-all hover:bg-gray-100"
            style={{ color: MODEL_KIND_COLORS[kind] }}
          >
            {MODEL_KIND_ICONS[kind]}
            <ChevronDown size={13} className="text-gray-400" />
          </button>

          {showKindDropdown && (
            <div className="absolute top-full left-0 z-50 mt-1 flex w-32 flex-col rounded-xl border border-gray-200 bg-white p-1 shadow-2xl">
              {ALL_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => handleKindSelect(k)}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-all ${
                    kind === k
                      ? "bg-gray-100 font-bold"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  style={{ color: MODEL_KIND_COLORS[k] }}
                >
                  <span className="shrink-0">{MODEL_KIND_ICONS[k]}</span>
                  <span>{MODEL_KIND_LABELS[k]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add Field / Value */}
        {(kind === "object" || kind === "enum") && (
          <>
            <div className="h-5 w-px bg-gray-200" />
            <button
              onClick={handleAddRow}
              title={kind === "object" ? "Add Field" : "Add Value"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              <Plus size={16} />
            </button>
          </>
        )}

        <div className="h-5 w-px bg-gray-200" />

        {/* Card or field description ⓘ — panel mirrored from the storm options bar */}
        <button
          onClick={() => setShowDescriptionPopover((v) => !v)}
          title={infoTitle}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
            currentDescription
              ? "border border-sky-200 bg-sky-50 text-sky-700"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Info size={16} className="text-sky-600" />
        </button>

        <div className="h-5 w-px bg-gray-200" />

        {/* Create Reference Copy — linked duplicate, content stays in sync */}
        <button
          onClick={() => createReferenceCopy([selectedModel.id])}
          title="Create Reference Copy"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          <Link2 size={16} />
        </button>

        <div className="h-5 w-px bg-gray-200" />

        {/* Delete Field / Model Button */}
        <button
          onClick={handleDelete}
          title={trashTitle}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={15} />
        </button>
      </div>
      </div>

      {/* Description Panel */}
      {showDescriptionPopover && (
        <DescriptionPopover
          target={selectedModel}
          onClose={() => setShowDescriptionPopover(false)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 * barScale }}
        />
      )}
    </>
  );
}
