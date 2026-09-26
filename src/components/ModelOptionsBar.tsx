import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useCanvasStore } from "@/store";
import type { ModelNodeKind } from "@/types";
import { MODEL_KIND_COLORS, MODEL_KIND_LABELS } from "@/constants/model";
import { DescriptionPopover } from "./DescriptionPopover";
import {
  Boxes,
  ListTree,
  Brackets,
  Link2,
  ChevronDown,
  Plus,
  Trash2,
  Info,
} from "lucide-react";

const MODEL_KIND_ICONS: Record<ModelNodeKind, ReactNode> = {
  object: <Boxes size={16} />,
  enum: <ListTree size={16} />,
  array: <Brackets size={16} />,
  wrap: <Link2 size={16} />,
};

export function ModelOptionsBar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const deleteObjects = useCanvasStore((s) => s.deleteObjects);
  const addModelField = useCanvasStore((s) => s.addModelField);
  const addModelEnumValue = useCanvasStore((s) => s.addModelEnumValue);
  const createReferenceCopy = useCanvasStore((s) => s.createReferenceCopy);
  const isLocked = useCanvasStore((s) => s.isLocked);

  const [showKindDropdown, setShowKindDropdown] = useState(false);
  const [showDescriptionPopover, setShowDescriptionPopover] = useState(false);

  const selectedModel = useMemo(() => {
    if (selectedIds.length !== 1 || isLocked) return null;
    const obj = objects.find((o) => o.id === selectedIds[0]);
    if (obj && obj.type === "model" && obj.modelData) return obj;
    return null;
  }, [selectedIds, objects, isLocked]);

  if (!selectedModel || !selectedModel.modelData) return null;

  const data = selectedModel.modelData;
  const kind = data.kind;

  // Calculate screen position
  const zoom = viewport.zoom;
  const screenX = (selectedModel.x - viewport.x) * zoom;
  const screenY = (selectedModel.y - viewport.y) * zoom;
  const cardWidth = selectedModel.width * zoom;
  const cardHeight = (selectedModel.height || 140) * zoom;

  const barX = screenX + cardWidth / 2;
  const isAbove = screenY >= 50;
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

  const allKinds: ModelNodeKind[] = ["object", "enum", "array", "wrap"];

  return (
    <>
      <div
        className={`absolute z-40 flex -translate-x-1/2 ${
          isAbove ? "-translate-y-full" : ""
        } items-center gap-1.5 rounded-2xl border border-gray-200/90 bg-white/95 px-3.5 py-2 shadow-2xl backdrop-blur-md transition-all select-none`}
        style={{
          left: barX,
          top: barY,
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
              {allKinds.map((k) => (
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
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: MODEL_KIND_COLORS[k] }}
                  />
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

        {/* Card description ⓘ — panel mirrored from the storm options bar */}
        <button
          onClick={() => setShowDescriptionPopover((v) => !v)}
          title={
            data.description
              ? `Description: ${data.description}`
              : "Add Description"
          }
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
            data.description
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

        {/* Delete Model Button */}
        <button
          onClick={() => deleteObjects([selectedModel.id])}
          title="Delete Model"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Description Panel */}
      {showDescriptionPopover && (
        <DescriptionPopover
          target={selectedModel}
          onClose={() => setShowDescriptionPopover(false)}
          anchorPosition={{ x: barX, y: isAbove ? barY : barY + 44 }}
        />
      )}
    </>
  );
}
