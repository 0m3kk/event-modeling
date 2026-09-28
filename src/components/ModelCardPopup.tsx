import { useEffect, useMemo, useRef } from "react";
import { useCanvasStore } from "@/store";
import { MODEL_KIND_COLORS, MODEL_KIND_LABELS } from "@/constants/model";
import { findModelByName } from "@/utils/modelResolution";
import { computeOptimalModelNodeWidth } from "@/utils/cardDimensions";
import { getActivePixiEngine } from "@/engine/PixiEngine";
import type { CanvasObject, ModelField } from "@/types";
import {
  ArrowRight,
  Boxes,
  Brackets,
  ChevronRight,
  Crosshair,
  Link2,
  ListTree,
  X,
} from "lucide-react";

function computePopupDimensions(
  data: import("@/types").ModelData,
  customWidth?: number,
) {
  const optimalWidth = computeOptimalModelNodeWidth(data, 260);
  const width = Math.max(customWidth || 240, optimalWidth, 260);

  let height = 44; // header height + border
  if (data.description) {
    height += 28;
  }
  const kind = data.kind;
  if (kind === "object") {
    const fieldCount = Math.max(1, (data.fields ?? []).length);
    height += fieldCount * 32 + 12;
  } else if (kind === "enum") {
    const valCount = Math.max(1, (data.values ?? []).length);
    height += valCount * 30 + 12;
  } else if (kind === "array" || kind === "wrap") {
    height += 80;
  }

  return { width, height };
}

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
      // Do not dismiss if clicking inside any popup card
      if (target.closest("[data-model-popup]")) {
        return;
      }
      // Do not dismiss if clicking on the canvas, since PixiEngine's pointerdown handler
      // handles canvas clicks (opening popups for model fields, clearing for empty/other zones).
      if (target.closest("canvas")) {
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

  // Unified cascading layout calculation for all active popups with zoom scaling & content-fit
  const cardLayouts = useMemo(() => {
    if (modelPopupChain.length === 0) return [];

    const container = document.getElementById("canvas-container");
    const cWidth = container?.clientWidth || window.innerWidth || 1200;
    const cHeight = container?.clientHeight || window.innerHeight || 800;
    const zoom = viewport.zoom || 1;
    const gap = 8;

    // 1. Calculate unscaled dimensions for each popup in chain
    const popupDims = modelPopupChain.map((entry) => {
      const modelObj = objects.find((o) => o.id === entry.modelId);
      if (!modelObj?.modelData) {
        return { width: 260, height: 200 };
      }
      return computePopupDimensions(modelObj.modelData, modelObj.width);
    });

    // 2. Determine Level 0 root anchor
    const rootEntry = modelPopupChain[0];
    let baseLeft = 100;
    let baseTop = 100;

    if (rootEntry.worldAnchor) {
      baseLeft = (rootEntry.worldAnchor.x - viewport.x) * zoom + gap * zoom;
      baseTop = (rootEntry.worldAnchor.y - viewport.y) * zoom;
    } else if (rootEntry.anchorRect) {
      baseLeft = rootEntry.anchorRect.x + gap * zoom;
      baseTop = rootEntry.anchorRect.y;
    }

    // 3. Compute ideal positions for each level
    const idealLefts: number[] = [];
    const idealTops: number[] = [];

    let currentLeft = baseLeft;
    for (let i = 0; i < modelPopupChain.length; i++) {
      idealLefts.push(currentLeft);
      if (i === 0) {
        idealTops.push(baseTop);
      } else {
        const offset = (modelPopupChain[i].rowOffsetFromParent ?? 40) * zoom;
        idealTops.push(idealTops[i - 1] + offset);
      }
      currentLeft += (popupDims[i].width + gap) * zoom;
    }

    // 4. Prevent chain from overflowing right edge by shifting the entire chain left
    const lastIndex = modelPopupChain.length - 1;
    const lastPopupRight =
      idealLefts[lastIndex] + popupDims[lastIndex].width * zoom;
    let shiftX = 0;
    if (lastPopupRight > cWidth - 12) {
      shiftX = lastPopupRight - (cWidth - 12);
      const maxShift = Math.max(0, idealLefts[0] - 12);
      shiftX = Math.min(shiftX, maxShift);
    }

    // 5. Output final clamped coordinates, dimensions and zoom scale for each popup
    return modelPopupChain.map((_, i) => {
      const left = Math.max(12, idealLefts[i] - shiftX);
      const idealTop = idealTops[i];
      const hScreen = popupDims[i].height * zoom;

      // Vertical position clamping: shift up if it would overflow container bottom
      let top = idealTop;
      if (top + hScreen > cHeight - 16) {
        top = Math.max(12, cHeight - hScreen - 16);
      }
      top = Math.max(12, top);

      // Available unscaled height in screen viewport
      const availScreenH = Math.max(200, cHeight - top - 12);
      // If the estimated card height fits on screen, give generous headroom to prevent accidental scrolling
      const maxHeight =
        hScreen <= cHeight - 16
          ? Math.max(popupDims[i].height + 80, availScreenH / zoom)
          : availScreenH / zoom;

      return {
        left,
        top,
        width: popupDims[i].width,
        maxHeight,
        zoom,
      };
    });
  }, [modelPopupChain, viewport, objects]);

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
        const layout = cardLayouts[index] ?? {
          left: 100,
          top: 100,
          width: 260,
          maxHeight: 600,
          zoom: 1,
        };

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
              selectObject(modelObj.id);
              const engine = getActivePixiEngine();
              if (engine) {
                const targetX = modelObj.x + (modelObj.width || 240) / 2;
                const targetY = modelObj.y + (modelObj.height || 120) / 2;
                engine.viewport.animate({
                  position: { x: targetX, y: targetY },
                  time: 300,
                });
              }
              clearModelPopups();
            }}
            onFieldClick={(field, rowElem, cardElem) => {
              const targetModel = findModelByName(objects, field.fieldType);
              if (!targetModel) return;

              const rowRect = rowElem.getBoundingClientRect();
              const cardRect = cardElem.getBoundingClientRect();
              const zoom = viewport.zoom || 1;
              const rowOffsetFromParent = (rowRect.top - cardRect.top) / zoom;

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
              const zoom = viewport.zoom || 1;
              const rowOffsetFromParent = (elemRect.top - cardRect.top) / zoom;

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
  position: {
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    zoom: number;
  };
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
  const kindColor = MODEL_KIND_COLORS[kind] ?? "#0891b2";
  const kindLabel = MODEL_KIND_LABELS[kind] ?? kind;
  const modelName = data.name || modelObj.text || kindLabel;

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.left}px`,
        top: `${position.top}px`,
        zIndex: 35 + entry.level,
      }}
    >
      <div
        ref={cardRef}
        data-model-popup
        className="pointer-events-auto flex flex-col rounded-lg border border-slate-200 bg-white shadow-2xl animate-in fade-in"
        style={{
          zoom: position.zoom,
          width: `${position.width}px`,
          maxHeight: `${position.maxHeight}px`,
        }}
      >
      {/* Header */}
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2 text-white select-none"
        style={{ backgroundColor: kindColor }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {kind === "object" && <Boxes className="h-4 w-4 shrink-0 opacity-90" />}
          {kind === "enum" && <ListTree className="h-4 w-4 shrink-0 opacity-90" />}
          {kind === "array" && <Brackets className="h-4 w-4 shrink-0 opacity-90" />}
          {kind === "wrap" && <Link2 className="h-4 w-4 shrink-0 opacity-90" />}
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
                const targetModel = findModelByName(allObjects, field.fieldType);
                const isModel = Boolean(targetModel);
                const targetKind = targetModel?.modelData?.kind;
                const targetColor = targetKind ? MODEL_KIND_COLORS[targetKind] : kindColor;
                const isActive = activeNextFieldId === field.id;

                return (
                  <div
                    key={field.id ? `field-${field.id}` : `field-${idx}-${field.name || "unnamed"}`}
                    onClick={(e) => {
                      if (isModel && cardRef.current) {
                        onFieldClick(field, e.currentTarget, cardRef.current);
                      }
                    }}
                    style={
                      isActive
                        ? {
                            backgroundColor: `${targetColor}12`,
                            borderLeft: `3px solid ${targetColor}`,
                          }
                        : undefined
                    }
                    className={`flex items-center justify-between px-3 py-1.5 text-xs transition-colors ${
                      isActive
                        ? "font-medium"
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
                      {isModel && targetKind ? (
                        <div
                          className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold transition-colors shadow-xs"
                          style={{
                            borderColor: `${targetColor}40`,
                            backgroundColor: `${targetColor}12`,
                            color: targetColor,
                          }}
                          title={`Click to preview ${targetKind} ${field.fieldType}`}
                        >
                          {targetKind === "object" && <Boxes className="h-3 w-3 shrink-0" />}
                          {targetKind === "enum" && <ListTree className="h-3 w-3 shrink-0" />}
                          {targetKind === "array" && <Brackets className="h-3 w-3 shrink-0" />}
                          {targetKind === "wrap" && <Link2 className="h-3 w-3 shrink-0" />}
                          <span className="truncate max-w-44">
                            {field.fieldType}
                          </span>
                          <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
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
              const targetModel = findModelByName(allObjects, itemType);
              const isModel = Boolean(targetModel);
              const targetKind = targetModel?.modelData?.kind;
              const targetColor = targetKind ? MODEL_KIND_COLORS[targetKind] : kindColor;

              return (
                <div
                  onClick={(e) => {
                    if (isModel && cardRef.current) {
                      onTypeClick(itemType, e.currentTarget, cardRef.current);
                    }
                  }}
                  className={`rounded-md border p-2 text-xs transition-colors ${
                    isModel ? "cursor-pointer hover:opacity-95" : ""
                  }`}
                  style={
                    isModel
                      ? {
                          borderColor: `${targetColor}50`,
                          backgroundColor: `${targetColor}10`,
                        }
                      : {
                          borderColor: "#e2e8f0",
                          backgroundColor: "#f8fafc",
                        }
                  }
                >
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Array Element
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className="font-bold flex items-center gap-1.5"
                      style={{ color: isModel ? targetColor : kindColor }}
                    >
                      {isModel && targetKind === "object" && <Boxes className="h-3.5 w-3.5 shrink-0" />}
                      {isModel && targetKind === "enum" && <ListTree className="h-3.5 w-3.5 shrink-0" />}
                      {isModel && targetKind === "array" && <Brackets className="h-3.5 w-3.5 shrink-0" />}
                      {isModel && targetKind === "wrap" && <Link2 className="h-3.5 w-3.5 shrink-0" />}
                      <span>{itemType}[]</span>
                    </span>
                    {isModel && (
                      <span
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold shadow-xs"
                        style={{
                          backgroundColor: `${targetColor}20`,
                          color: targetColor,
                        }}
                      >
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
              const targetModel = findModelByName(allObjects, innerType);
              const isModel = Boolean(targetModel);
              const targetKind = targetModel?.modelData?.kind;
              const targetColor = targetKind ? MODEL_KIND_COLORS[targetKind] : kindColor;

              return (
                <div
                  onClick={(e) => {
                    if (isModel && cardRef.current) {
                      onTypeClick(innerType, e.currentTarget, cardRef.current);
                    }
                  }}
                  className={`rounded-md border p-2 text-xs transition-colors ${
                    isModel ? "cursor-pointer hover:opacity-95" : ""
                  }`}
                  style={
                    isModel
                      ? {
                          borderColor: `${targetColor}50`,
                          backgroundColor: `${targetColor}10`,
                        }
                      : {
                          borderColor: "#e2e8f0",
                          backgroundColor: "#f8fafc",
                        }
                  }
                >
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Wrapped Target
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className="font-bold flex items-center gap-1.5"
                      style={{ color: isModel ? targetColor : kindColor }}
                    >
                      {isModel && targetKind === "object" && <Boxes className="h-3.5 w-3.5 shrink-0" />}
                      {isModel && targetKind === "enum" && <ListTree className="h-3.5 w-3.5 shrink-0" />}
                      {isModel && targetKind === "array" && <Brackets className="h-3.5 w-3.5 shrink-0" />}
                      {isModel && targetKind === "wrap" && <Link2 className="h-3.5 w-3.5 shrink-0" />}
                      <span>{innerType}</span>
                    </span>
                    {isModel && (
                      <span
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold shadow-xs"
                        style={{
                          backgroundColor: `${targetColor}20`,
                          color: targetColor,
                        }}
                      >
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
  </div>
);
}
