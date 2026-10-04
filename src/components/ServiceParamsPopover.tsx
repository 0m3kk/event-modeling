import { useEffect, useRef, useState, useMemo } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject, ServiceMethod } from "@/types";
import { PRIMITIVE_TYPES, DEFAULT_FIELD_TYPE } from "@/constants/fieldType";
import { computeOptimalCardWidth } from "@/utils/cardDimensions";
import { X, Plus, Trash2, Sliders } from "lucide-react";
import { nanoid } from "nanoid";

interface ServiceParamsPopoverProps {
  card: CanvasObject;
  method: ServiceMethod;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function ServiceParamsPopover({
  card,
  method,
  onClose,
  anchorPosition,
}: ServiceParamsPopoverProps) {
  const updateServiceModelMethod = useCanvasStore((s) => s.updateServiceModelMethod);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const objects = useCanvasStore((s) => s.objects);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [params, setParams] = useState(() => method.params ?? []);
  const [returnType, setReturnType] = useState(() => method.returnType || DEFAULT_FIELD_TYPE);

  // Available types: primitives + model objects
  const availableTypes = useMemo(() => {
    const modelNames = objects
      .filter((o) => o.type === "model" && o.modelData && o.id !== card.id)
      .map((o) => o.modelData!.name.trim())
      .filter(Boolean);
    return [...PRIMITIVE_TYPES, ...modelNames];
  }, [objects, card.id]);

  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Helper to sync changes and auto-resize card width if not locked
  const syncChanges = (nextParams: typeof params, nextReturn: string = returnType) => {
    updateServiceModelMethod(card.id, method.id, { params: nextParams, returnType: nextReturn });

    if (!card.widthLocked && card.modelData) {
      const currentMethods = card.modelData.methods ?? [];
      const updatedMethods = currentMethods.map((m) =>
        m.id === method.id ? { ...m, params: nextParams, returnType: nextReturn } : m
      );
      const updatedCard: CanvasObject = {
        ...card,
        modelData: {
          ...card.modelData,
          methods: updatedMethods,
        },
      };
      const optimalWidth = computeOptimalCardWidth(updatedCard, undefined, undefined, objects);
      if (optimalWidth > card.width) {
        updateObject(card.id, { width: optimalWidth });
      }
    }
  };

  const handleParamNameChange = (id: string, name: string) => {
    const next = params.map((p) => (p.id === id ? { ...p, name } : p));
    setParams(next);
    syncChanges(next);
  };

  const handleParamTypeChange = (id: string, paramType: string) => {
    const next = params.map((p) => (p.id === id ? { ...p, paramType } : p));
    setParams(next);
    syncChanges(next);
  };

  const handleAddParam = () => {
    const newP = {
      id: nanoid(),
      name: `param${params.length + 1}`,
      paramType: DEFAULT_FIELD_TYPE,
    };
    const next = [...params, newP];
    setParams(next);
    syncChanges(next);
  };

  const handleDeleteParam = (id: string) => {
    const next = params.filter((p) => p.id !== id);
    setParams(next);
    syncChanges(next);
  };

  const handleReturnTypeChange = (newType: string) => {
    setReturnType(newType);
    syncChanges(params, newType);
  };

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 flex w-[440px] max-w-[90vw] flex-col gap-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md text-xs text-gray-800 dark:text-zinc-200 overflow-x-hidden"
      style={{
        left: `${anchorPosition.x}px`,
        top: `${anchorPosition.y}px`,
        transform: "translate(-50%, -100%) translateY(-12px)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-zinc-100 text-sm">
          <Sliders size={15} className="text-indigo-500 shrink-0" />
          <span className="truncate">Method: {method.name || "Untitled"}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {/* Return Type Row */}
      <div className="flex items-center justify-between gap-3 bg-gray-50/70 dark:bg-zinc-800/40 p-2 rounded-lg border border-gray-100 dark:border-zinc-800">
        <label className="text-[11px] font-medium text-gray-600 dark:text-zinc-400 shrink-0">
          Return Type:
        </label>
        <select
          value={returnType}
          onChange={(e) => handleReturnTypeChange(e.target.value)}
          className="flex-1 max-w-[200px] rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 font-mono text-[11px] outline-none focus:border-indigo-500"
        >
          {availableTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Params Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-gray-600 dark:text-zinc-400">
            Parameters ({params.length}):
          </span>
          <button
            onClick={handleAddParam}
            className="flex items-center gap-1.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
          >
            <Plus size={13} />
            Add Param
          </button>
        </div>

        {params.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-zinc-800 p-3 text-center text-[11px] text-gray-400 dark:text-zinc-500">
            No parameters yet. Click &quot;Add Param&quot; above to add one.
          </div>
        ) : (
          <div className="flex max-h-60 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1">
            {params.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-800/40 p-2"
              >
                <input
                  type="text"
                  placeholder="param name"
                  value={p.name}
                  onChange={(e) => handleParamNameChange(p.id, e.target.value)}
                  className="flex-1 min-w-0 rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 font-mono text-[11px] outline-none focus:border-indigo-500"
                />
                <span className="text-gray-400 shrink-0">:</span>
                <select
                  value={p.paramType}
                  onChange={(e) => handleParamTypeChange(p.id, e.target.value)}
                  className="w-32 shrink-0 rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 font-mono text-[11px] outline-none focus:border-indigo-500"
                >
                  {availableTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleDeleteParam(p.id)}
                  className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                  title="Delete parameter"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
