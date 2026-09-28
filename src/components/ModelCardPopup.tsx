import { useEffect, useMemo, useRef } from "react";
import { useCanvasStore } from "@/store";
import { MODEL_KIND_COLORS, MODEL_KIND_LABELS } from "@/constants/model";
import {
  findModelByName,
  isModelType,
} from "@/utils/modelResolution";
import { getActivePixiEngine } from "@/engine/PixiEngine";
import type { CanvasObject, ModelField } from "@/types";
import {
  ArrowRight,
  Brackets,
  Box,
  ChevronRight,
  Crosshair,
  List,
  Layers,
  X,
} from "lucide-react";

export function ModelCardPopup() {
  const modelPopupChain = useCanvasStore((s) => s.modelPopupChain);
  const closeModelPopup = useCanvasStore((s) => s.closeModelPopup);
  const clearModelPopups = useCanvasStore((s) => s.clearModelPopups);
  const openModelPopup = useCanvasStore((s) => s.openModelPopup);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const selectObject = useCanvasStore((s) => s.selectObject);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (modelPopupChain.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearModelPopups();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-model-popup]")) {
        return;
      }
      clearModelPopups();
    };

    window.addEventListener("keydown", handleKeyDown);
    // Delay adding pointerdown listener so initiating click does not dismiss immediately
    const timer = setTimeout(() => {
      window.addEventListener("pointerdown", handlePointerDown);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [modelPopupChain.length, clearModelPopups]);

  // Unified cascading layout calculation for all active popups
  const cardLayouts = useMemo(() => {
    if (modelPopupChain.length === 0) return [];

    const container = document.getElementById("canvas-container");
    const cWidth = container?.clientWidth || window.innerWidth || 1200;
    const cHeight = container?.clientHeight || window.innerHeight || 800;
    const popupWidth = 250;
    const gap = 8;

    // 1. Determine Level 0 root anchor
    const rootEntry = modelPopupChain[0];
    let baseLeft = 100;
    let baseTop = 100;

    if (rootEntry.worldAnchor) {
      baseLeft = (rootEntry.worldAnchor.x - viewport.x) * viewport.zoom + gap;
      baseTop = (rootEntry.worldAnchor.y - viewport.y) * viewport.zoom;
    } else if (rootEntry.anchorRect) {
      baseLeft = rootEntry.anchorRect.x + gap;
      baseTop = rootEntry.anchorRect.y;
    }

    // 2. Compute ideal positions for each level
    const idealLefts: number[] = [];
    const idealTops: number[] = [];

    for (let i = 0; i < modelPopupChain.length; i++) {
      idealLefts.push(baseLeft + i * (popupWidth + gap));
      if (i === 0) {
        idealTops.push(baseTop);
      } else {
        const offset = modelPopupChain[i].rowOffsetFromParent ?? 40;
        idealTops.push(idealTops[i - 1] + offset);
      }
    }

    // 3. Prevent chain from overflowing right edge by shifting the entire chain left
    const lastIndex = modelPopupChain.length - 1;
    const chainRight = idealLefts[lastIndex] + popupWidth;
    let shiftX = 0;
    if (chainRight > cWidth - 12) {
      shiftX = chainRight - (cWidth - 12);
      // Ensure we don't shift Level 0 further left than margin
      const maxShift = Math.max(0, idealLefts[0] - 12);
      shiftX = Math.min(shiftX, maxShift);
    }

    // 4. Output final clamped coordinates for each popup
    return modelPopupChain.map((_, i) => {
      const left = idealLefts[i] - shiftX;
      const top = Math.max(12, Math.min(cHeight - 220, idealTops[i]));
      return { left, top };
    });
  }, [modelPopupChain, viewport]);

  if (modelPopupChain.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-35 overflow-hidden"
    >
      {modelPopupChain.map((entry, index) => {
        const modelObj = objects.find((o) => o.id === entry.modelId);
        if (!modelObj || modelObj.type !== "model" || !modelObj.modelData) {
          return null;
        }

        const nextEntry = modelPopupChain[index + 1];
        const activeNextFieldId = nextEntry?.sourceFieldId;
        const layout = cardLayouts[index] ?? { left: 100, top: 100 };

        return (
          <SingleModelPopupCard
            key={entry.id}
            entry={entry}
            modelObj={modelObj}
            allObjects={objects}
            position={layout}
            activeNextFieldId={activeNextFieldId}
            onClose={() => closeModelPopup(entry.level)}
            onLocate={() => {
              const engine = getActivePixiEngine();
              if (engine) {
                const targetX = modelObj.x + (modelObj.width || 240) / 2;
                const targetY = modelObj.y + (modelObj.height || 120) / 2;
                engine.viewport.animate({
                  position: { x: targetX, y: targetY },
                  time: 300,
                });
                selectObject(modelObj.id);
              }
              clearModelPopups();
            }}
            onFieldClick={(field, rowElem, cardElem) => {
              const targetModel = findModelByName(objects, field.fieldType);
              if (!targetModel) return;

              const rowRect = rowElem.getBoundingClientRect();
              const cardRect = cardElem.getBoundingClientRect();
              const rowOffsetFromParent = rowRect.top - cardRect.top;

              openModelPopup({
                modelId: targetModel.id,
                sourceObjectId: modelObj.id,
                sourceFieldId: field.id,
                sourceFieldName: field.name,
                sourceFieldType: field.fieldType,
                rowOffsetFromParent,
                level: entry.level + 1,
              });
            }}
            onTypeClick={(typeName, elem, cardElem) => {
              const targetModel = findModelByName(objects, typeName);
              if (!targetModel) return;

              const elemRect = elem.getBoundingClientRect();
              const cardRect = cardElem.getBoundingClientRect();
              const rowOffsetFromParent = elemRect.top - cardRect.top;

              openModelPopup({
                modelId: targetModel.id,
                sourceObjectId: modelObj.id,
                sourceFieldId: "type",
                sourceFieldName: typeName,
                sourceFieldType: typeName,
                rowOffsetFromParent,
                level: entry.level + 1,
              });
            }}
          />
        );
      })}
    </div>
  );
}

interface SingleModelPopupCardProps {
  entry: import("@/store").ModelPopupEntry;
  modelObj: CanvasObject;
  allObjects: CanvasObject[];
  position: { left: number; top: number };
  activeNextFieldId?: string;
  onClose: () => void;
  onLocate: () => void;
  onFieldClick: (
    field: ModelField,
    rowElem: HTMLElement,
    cardElem: HTMLElement,
  ) => void;
  onTypeClick: (
    typeName: string,
    elem: HTMLElement,
    cardElem: HTMLElement,
  ) => void;
}

function SingleModelPopupCard({
  entry,
  modelObj,
  allObjects,
  position,
  activeNextFieldId,
  onClose,
  onLocate,
  onFieldClick,
  onTypeClick,
}: SingleModelPopupCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const data = modelObj.modelData!;
  const kind = data.kind;
  const kindColor = MODEL_KIND_COLORS[kind] ?? "#2563eb";
  const kindLabel = MODEL_KIND_LABELS[kind] ?? kind;
  const modelName = data.name || modelObj.text || kindLabel;

  return (
    <div
      ref={cardRef}
      data-model-popup
      className="pointer-events-auto absolute flex flex-col rounded-lg border border-slate-200 bg-white shadow-2xl transition-all duration-150 animate-in fade-in zoom-in-95"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: "250px",
        maxHeight: "420px",
        zIndex: 35 + entry.level,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2 text-white select-none"
        style={{ backgroundColor: kindColor }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {kind === "object" && <Brackets className="h-4 w-4 shrink-0 opacity-90" />}
          {kind === "enum" && <List className="h-4 w-4 shrink-0 opacity-90" />}
          {kind === "array" && <Layers className="h-4 w-4 shrink-0 opacity-90" />}
          {kind === "wrap" && <Box className="h-4 w-4 shrink-0 opacity-90" />}
          <span className="truncate text-xs font-bold leading-tight" title={modelName}>
            {modelName}
          </span>
          <span className="shrink-0 rounded bg-white/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
            {kind}
          </span>
        </div>

        <div className="flex items-center gap-1 pl-1">
          <button
            type="button"
            onClick={onLocate}
            className="rounded p-1 hover:bg-white/20 text-white/90 hover:text-white transition-colors"
            title="Focus to target on canvas"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-white/20 text-white/90 hover:text-white transition-colors"
            title="Close preview"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Description if any */}
      {data.description && (
        <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[11px] text-slate-500 italic">
          {data.description}
        </div>
      )}

      {/* Body Rows */}
      <div className="flex-1 overflow-y-auto py-1">
        {kind === "object" && (
          <div className="divide-y divide-slate-100">
            {(data.fields ?? []).length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-slate-400 italic">
                (No fields)
              </div>
            ) : (
              (data.fields ?? []).map((field, idx) => {
                const isModel = isModelType(allObjects, field.fieldType);
                const isActive = activeNextFieldId === field.id;

                return (
                  <div
                    key={field.id ? `field-${field.id}` : `field-${idx}-${field.name || "unnamed"}`}
                    onClick={(e) => {
                      if (isModel && cardRef.current) {
                        onFieldClick(field, e.currentTarget, cardRef.current);
                      }
                    }}
                    className={`flex items-center justify-between px-3 py-1.5 text-xs transition-colors ${
                      isActive
                        ? "bg-blue-50 border-l-2 border-l-blue-600 font-medium"
                        : isModel
                          ? "hover:bg-slate-50 cursor-pointer"
                          : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5 pr-2">
                      <span className="text-slate-400 font-bold">•</span>
                      <span className="truncate text-slate-800" title={field.name}>
                        {field.name}
                      </span>
                      {field.required && (
                        <span className="text-red-500 font-bold text-xs" title="Required">
                          *
                        </span>
                      )}
                    </div>

                    <div className="shrink-0">
                      {isModel ? (
                        <div
                          className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50/90 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors shadow-xs"
                          title={`Click to preview model ${field.fieldType}`}
                        >
                          <span className="truncate max-w-[90px]">
                            {field.fieldType}
                          </span>
                          <ChevronRight className="h-3 w-3 shrink-0 text-blue-500" />
                        </div>
                      ) : (
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {field.fieldType || "string"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {kind === "enum" && (
          <div className="divide-y divide-slate-100">
            {(data.values ?? []).length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-slate-400 italic">
                (No enum values)
              </div>
            ) : (
              (data.values ?? []).map((val, idx) => (
                <div
                  key={val.id ? `val-${val.id}` : `val-${idx}-${val.name || val.value || "unnamed"}`}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700"
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: kindColor }}
                  />
                  <span className="truncate font-mono text-[11px]" title={val.name || val.value}>
                    {val.name || val.value}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {kind === "array" && (
          <div className="p-3">
            {(() => {
              const itemType = data.itemType || "any";
              const isModel = isModelType(allObjects, itemType);

              return (
                <div
                  onClick={(e) => {
                    if (isModel && cardRef.current) {
                      onTypeClick(itemType, e.currentTarget, cardRef.current);
                    }
                  }}
                  className={`rounded-md border p-2 text-xs transition-colors ${
                    isModel
                      ? "border-red-200 bg-red-50/60 hover:bg-red-50 cursor-pointer"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Array Element
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-red-700">
                      {itemType}[]
                    </span>
                    {isModel && (
                      <span className="flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Preview <ArrowRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {kind === "wrap" && (
          <div className="p-3">
            {(() => {
              const innerType = data.innerType || "any";
              const isModel = isModelType(allObjects, innerType);

              return (
                <div
                  onClick={(e) => {
                    if (isModel && cardRef.current) {
                      onTypeClick(innerType, e.currentTarget, cardRef.current);
                    }
                  }}
                  className={`rounded-md border p-2 text-xs transition-colors ${
                    isModel
                      ? "border-amber-200 bg-amber-50/60 hover:bg-amber-50 cursor-pointer"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Wrapped Target
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-700">
                      {innerType}
                    </span>
                    {isModel && (
                      <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        Preview <ArrowRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
