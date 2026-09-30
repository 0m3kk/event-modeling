import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvasStore } from "@/store";
import type { StormData } from "@/types";
import { stormHasInputFields } from "@/constants/storm";
import { MODEL_KIND_COLORS, MODEL_KIND_LABELS } from "@/constants/model";
import {
  DEFAULT_FIELD_TYPE,
  PRIMITIVE_TYPES,
  canonicalPrimitiveType,
  normalizeFieldType,
} from "@/constants/fieldType";
import { findModelByName } from "@/utils/modelResolution";
import {
  Box,
  Brackets,
  Check,
  Parentheses,
  List,
  Plus,
  Search,
  X,
} from "lucide-react";

/**
 * Which StormData field list a type change targets. State/Constraint split
 * fields into input params/output fields; Query and Command use params/response.
 */
function stormFieldListKey(
  data: StormData,
  section?: "params" | "response",
): "fields" | "inputFields" | "outputFields" | "responseFields" {
  if (stormHasInputFields(data.kind)) {
    return section === "response" ? "outputFields" : "inputFields";
  }
  return section === "response" ? "responseFields" : "fields";
}

export function TypeSelectPopover() {
  const typeSelect = useCanvasStore((s) => s.typeSelect);
  const setTypeSelect = useCanvasStore((s) => s.setTypeSelect);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const isLocked = useCanvasStore((s) => s.isLocked);

  const [search, setSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Model node names on the canvas
  const modelNames = useMemo(() => {
    return objects
      .filter((o) => o.type === "model" && o.modelData)
      .map(
        (o) =>
          o.modelData?.name?.trim() ||
          o.text?.trim() ||
          (o.modelData?.kind ? MODEL_KIND_LABELS[o.modelData.kind] : "Model"),
      )
      .filter(Boolean)
      .filter((name, idx, arr) => arr.indexOf(name) === idx);
  }, [objects]);

  const target = useMemo(() => {
    if (!typeSelect) return null;
    const obj = objects.find((o) => o.id === typeSelect.objectId);
    if (!obj) return null;

    let currentType = DEFAULT_FIELD_TYPE;
    let isRequired = false;
    let showRequired = false;

    if (obj.type === "storm" && obj.stormData) {
      const key = stormFieldListKey(obj.stormData, typeSelect.section);
      const list = obj.stormData[key] ?? [];
      const field = list.find((f) => f.id === typeSelect.fieldId);
      if (field) {
        currentType = field.fieldType || DEFAULT_FIELD_TYPE;
        isRequired = Boolean(field.required);
        showRequired = true;
      }
    } else if (obj.type === "model" && obj.modelData) {
      if (obj.modelData.kind === "array") {
        currentType = obj.modelData.itemType || DEFAULT_FIELD_TYPE;
      } else if (obj.modelData.kind === "wrap") {
        currentType = obj.modelData.innerType || DEFAULT_FIELD_TYPE;
      } else {
        const field = obj.modelData.fields?.find(
          (f) => f.id === typeSelect.fieldId,
        );
        if (field) {
          currentType = field.fieldType || DEFAULT_FIELD_TYPE;
          isRequired = Boolean(field.required);
          showRequired = true;
        }
      }
    }

    const isArray = currentType.endsWith("[]");
    const baseType = normalizeFieldType(
      isArray ? currentType.slice(0, -2) : currentType,
    );

    return {
      obj,
      currentType,
      baseType,
      isArray,
      isRequired,
      showRequired,
    };
  }, [typeSelect, objects]);

  useEffect(() => {
    if (typeSelect) {
      setSearch("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [typeSelect]);

  useEffect(() => {
    if (!typeSelect) return;

    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setTypeSelect(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTypeSelect(null);
      }
    };

    // Delay attaching click-outside listener so the event initiating this open
    // does not immediately close the popover.
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handleClickOutside);
    }, 100);

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [typeSelect, setTypeSelect]);

  if (!typeSelect || !target || isLocked) return null;

  const { obj, isArray, isRequired, showRequired, baseType } = target;
  const zoom = viewport.zoom;

  // Calculate screen position from anchor (relative to #canvas-container)
  const worldX = obj.x + typeSelect.anchor.x;
  const worldY = obj.y + typeSelect.anchor.y + typeSelect.anchor.height;
  const screenX = (worldX - viewport.x) * zoom;
  const screenY = (worldY - viewport.y) * zoom + 4;

  const container = document.getElementById("canvas-container");
  const cWidth = container
    ? container.clientWidth
    : typeof window !== "undefined"
      ? window.innerWidth
      : 800;
  const cHeight = container
    ? container.clientHeight
    : typeof window !== "undefined"
      ? window.innerHeight
      : 600;

  const popoverWidth = 256;
  const popoverHeight = 310;

  const clampedX = Math.max(12, Math.min(cWidth - popoverWidth - 12, screenX));
  let clampedY = screenY;
  if (screenY + popoverHeight > cHeight && screenY > popoverHeight + 20) {
    const anchorTopY = (obj.y + typeSelect.anchor.y - viewport.y) * zoom;
    clampedY = Math.max(12, anchorTopY - popoverHeight - 4);
  }

  const handleSelectType = (selectedBase: string) => {
    const base = normalizeFieldType(selectedBase);
    const finalType = isArray ? `${base}[]` : base;
    commitTypeChange(finalType, isRequired);
    setTypeSelect(null);
  };

  const handleToggleArray = () => {
    const nextIsArray = !isArray;
    const finalType = nextIsArray ? `${baseType}[]` : baseType;
    commitTypeChange(finalType, isRequired);
  };

  const handleToggleRequired = () => {
    const nextRequired = !isRequired;
    const finalType = isArray ? `${baseType}[]` : baseType;
    commitTypeChange(finalType, nextRequired);
  };

  const commitTypeChange = (newType: string, newRequired: boolean) => {
    if (obj.type === "storm" && obj.stormData) {
      const key = stormFieldListKey(obj.stormData, typeSelect.section);
      const list = obj.stormData[key] ?? [];
      const nextList = list.map((f) =>
        f.id === typeSelect.fieldId
          ? { ...f, fieldType: newType, required: newRequired }
          : f,
      );
      updateObject(obj.id, {
        stormData: { ...obj.stormData, [key]: nextList },
      });
    } else if (obj.type === "model" && obj.modelData) {
      if (obj.modelData.kind === "array") {
        updateObject(obj.id, {
          modelData: {
            ...obj.modelData,
            itemType: newType,
          },
        });
      } else if (obj.modelData.kind === "wrap") {
        updateObject(obj.id, {
          modelData: {
            ...obj.modelData,
            innerType: newType,
          },
        });
      } else {
        const list = obj.modelData.fields ?? [];
        const nextList = list.map((f) =>
          f.id === typeSelect.fieldId
            ? { ...f, fieldType: newType, required: newRequired }
            : f,
        );
        updateObject(obj.id, {
          modelData: {
            ...obj.modelData,
            fields: nextList,
          },
        });
      }
    }
  };

  const trimmedSearch = search.trim();
  const filteredPrimitives = PRIMITIVE_TYPES.filter((p) =>
    p.toLowerCase().includes(trimmedSearch.toLowerCase()),
  );
  const filteredModels = modelNames.filter((m) =>
    m.toLowerCase().includes(trimmedSearch.toLowerCase()),
  );

  const isExactPrimitive = canonicalPrimitiveType(trimmedSearch) !== null;
  const isExactModel = modelNames.includes(trimmedSearch);
  const showCustomOption =
    trimmedSearch.length > 0 && !isExactPrimitive && !isExactModel;

  const handleKeyDownSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (trimmedSearch) {
        handleSelectType(trimmedSearch);
      } else if (filteredPrimitives.length > 0) {
        handleSelectType(filteredPrimitives[0]);
      } else if (filteredModels.length > 0) {
        handleSelectType(filteredModels[0]);
      }
    }
  };

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 w-64 rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl"
      style={{
        left: `${clampedX}px`,
        top: `${clampedY}px`,
      }}
    >
      <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
        <span className="text-xs font-semibold text-gray-700">
          Select Field Type
        </span>
        <button
          onClick={() => setTypeSelect(null)}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      </div>

      {/* Modifiers: Array of [] & Required * */}
      <div className="mb-2.5 flex items-center gap-3 px-1 text-xs">
        <label className="flex cursor-pointer items-center gap-1.5 select-none font-medium text-gray-700">
          <input
            type="checkbox"
            checked={isArray}
            onChange={handleToggleArray}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>Array</span>
        </label>

        {showRequired && (
          <label className="flex cursor-pointer items-center gap-1.5 select-none font-medium text-gray-700">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={handleToggleRequired}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span>Required</span>
          </label>
        )}
      </div>

      {/* Search Input */}
      <div className="relative mb-2">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search or enter type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDownSearch}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2.5 text-xs text-gray-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="max-h-56 overflow-y-auto space-y-2">
        {/* Custom Type Option */}
        {showCustomOption && (
          <div>
            <div className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-600 uppercase">
              Custom Type
            </div>
            <button
              onClick={() => handleSelectType(trimmedSearch)}
              className="mt-0.5 flex w-full items-center justify-between rounded-md bg-emerald-50 px-2 py-1.5 text-xs font-mono font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
            >
              <span className="flex items-center gap-1">
                <Plus size={13} className="text-emerald-600" />
                <span>Use &ldquo;{trimmedSearch}&rdquo;</span>
              </span>
              <span className="text-[10px] text-emerald-600">Enter ↵</span>
            </button>
          </div>
        )}

        {/* Primitives Section */}
        {filteredPrimitives.length > 0 && (
          <div>
            <div className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
              Primitives
            </div>
            <div className="mt-0.5 space-y-0.5">
              {filteredPrimitives.map((prim) => {
                const isSelected = baseType === prim;
                return (
                  <button
                    key={prim}
                    onClick={() => handleSelectType(prim)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-mono transition-colors ${
                      isSelected
                        ? "bg-blue-50 font-bold text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>{prim}</span>
                    {isSelected && (
                      <Check size={13} className="text-blue-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Model References Section */}
        {filteredModels.length > 0 && (
          <div>
            <div className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Model Nodes
            </div>
            <div className="mt-0.5 space-y-0.5">
              {filteredModels.map((modelName) => {
                const isSelected = baseType === modelName;
                const targetModel = findModelByName(objects, modelName);
                const kind = targetModel?.modelData?.kind ?? "object";
                const kindColor = MODEL_KIND_COLORS[kind] ?? "#0891b2";

                return (
                  <button
                    key={modelName}
                    onClick={() => handleSelectType(modelName)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-mono transition-colors ${
                      isSelected
                        ? "font-bold shadow-xs"
                        : "text-slate-800 hover:bg-slate-50"
                    }`}
                    style={
                      isSelected
                        ? {
                            backgroundColor: `${kindColor}18`,
                            color: kindColor,
                          }
                        : undefined
                    }
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {kind === "object" && (
                        <Box size={13} style={{ color: kindColor }} className="shrink-0" />
                      )}
                      {kind === "enum" && (
                        <List size={13} style={{ color: kindColor }} className="shrink-0" />
                      )}
                      {kind === "array" && (
                        <Brackets size={13} style={{ color: kindColor }} className="shrink-0" />
                      )}
                      {kind === "wrap" && (
                        <Parentheses size={13} style={{ color: kindColor }} className="shrink-0" />
                      )}
                      <span className="truncate" style={{ color: isSelected ? kindColor : "#1e293b" }}>
                        {modelName}
                      </span>
                    </span>

                    <span className="flex items-center gap-1 shrink-0 ml-1">
                      <span
                        className="rounded px-1 py-0.2 text-[9px] font-semibold uppercase tracking-wider"
                        style={{
                          backgroundColor: `${kindColor}18`,
                          color: kindColor,
                        }}
                      >
                        {kind}
                      </span>
                      {isSelected && (
                        <Check size={13} style={{ color: kindColor }} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filteredPrimitives.length === 0 &&
          filteredModels.length === 0 &&
          !showCustomOption && (
            <div className="py-4 text-center text-xs text-gray-400">
              No matching types found
            </div>
          )}
      </div>
    </div>
  );
}
