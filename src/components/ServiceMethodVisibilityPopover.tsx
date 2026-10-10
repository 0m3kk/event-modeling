import { useEffect, useRef } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject } from "@/types";
import { computeOptimalCardWidth } from "@/utils/cardDimensions";
import { X, Eye, Check, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ServiceMethodVisibilityPopoverProps {
  card: CanvasObject;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function ServiceMethodVisibilityPopover({
  card,
  onClose,
  anchorPosition,
}: ServiceMethodVisibilityPopoverProps) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);

  const objects = useCanvasStore((s) => s.objects);
  const toggleServiceModelMethodVisibility = useCanvasStore(
    (s) => s.toggleServiceModelMethodVisibility,
  );
  const showAllServiceModelMethods = useCanvasStore(
    (s) => s.showAllServiceModelMethods,
  );
  const showOnlyServiceModelMethod = useCanvasStore(
    (s) => s.showOnlyServiceModelMethod,
  );
  const updateObject = useCanvasStore((s) => s.updateObject);

  // Get current live state of the card
  const currentCard = objects.find((o) => o.id === card.id) ?? card;
  const methods = currentCard.modelData?.methods ?? [];
  const hiddenIds = currentCard.hiddenMethodIds ?? [];
  const hiddenSet = new Set(hiddenIds);
  const visibleCount = methods.length - hiddenSet.size;

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

  // Adjust card width if needed when visibility changes
  const refitWidthIfNeeded = () => {
    if (!currentCard.widthLocked) {
      const optimalWidth = computeOptimalCardWidth(currentCard, undefined, undefined, objects);
      if (optimalWidth !== currentCard.width) {
        updateObject(currentCard.id, { width: optimalWidth });
      }
    }
  };

  const handleToggle = (methodId: string) => {
    toggleServiceModelMethodVisibility(currentCard.id, methodId);
    setTimeout(refitWidthIfNeeded, 0);
  };

  const handleShowAll = () => {
    showAllServiceModelMethods(currentCard.id);
    setTimeout(refitWidthIfNeeded, 0);
  };

  const handleShowOnly = (methodId: string) => {
    showOnlyServiceModelMethod(currentCard.id, methodId);
    setTimeout(refitWidthIfNeeded, 0);
  };

  return (
    <div
      ref={popoverRef}
      style={{
        left: anchorPosition.x,
        top: anchorPosition.y,
        transform: "translateX(-50%)",
      }}
      className="fixed z-50 flex w-[440px] max-w-[92vw] flex-col gap-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md text-sm text-gray-800 dark:text-zinc-200 overflow-x-hidden animate-in fade-in zoom-in-95 duration-100 select-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Eye size={17} className="text-amber-500 dark:text-amber-400" />
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-zinc-100 text-sm leading-tight">
              {t("popovers.serviceMethodVisibility.title", "Service Methods Visibility")}
            </h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400 leading-tight">
              {t(
                "popovers.serviceMethodVisibility.subtitle",
                "Choose which methods are visible on this card in this flow",
              )}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="font-medium text-gray-500 dark:text-zinc-400">
          {visibleCount}/{methods.length} {t("popovers.serviceMethodVisibility.visible", "visible")}
        </span>
        {hiddenIds.length > 0 && (
          <button
            onClick={handleShowAll}
            className="flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            <RotateCcw size={12} />
            {t("popovers.serviceMethodVisibility.showAll", "Show All")}
          </button>
        )}
      </div>

      {/* Methods List */}
      <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto overflow-x-hidden pr-0.5">
        {methods.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-zinc-800 p-4 text-center text-xs text-gray-400 dark:text-zinc-500">
            {t("popovers.serviceMethodVisibility.noMethods", "This service has no methods defined yet.")}
          </div>
        ) : (
          methods.map((m) => {
            const isVisible = !hiddenSet.has(m.id);
            const paramsStr = (m.params ?? [])
              .map((p) => p.name || p.paramType)
              .join(", ");
            const sigText = `${m.name || "method"}(${paramsStr})`;

            return (
              <div
                key={m.id}
                className={`group flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                  isVisible
                    ? "border-gray-200/90 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-800/40 text-gray-900 dark:text-zinc-100"
                    : "border-gray-100 dark:border-zinc-800/40 bg-transparent text-gray-400 dark:text-zinc-500 opacity-60"
                }`}
              >
                {/* Visibility Toggle Button & Signature */}
                <button
                  type="button"
                  onClick={() => handleToggle(m.id)}
                  className="flex flex-1 items-center gap-2.5 text-left min-w-0 cursor-pointer"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      isVisible
                        ? "border-amber-500 bg-amber-500 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-zinc-950"
                        : "border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-transparent"
                    }`}
                  >
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="font-mono text-xs font-medium truncate">
                      {sigText}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                      → {m.returnType || "any"}
                    </span>
                  </div>
                </button>

                {/* "Only this" quick button */}
                {methods.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleShowOnly(m.id)}
                    title={t("popovers.serviceMethodVisibility.onlyThisTooltip", "Show only this method and hide others")}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-200/80 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-zinc-700/80 dark:hover:text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {t("popovers.serviceMethodVisibility.onlyThis", "Only this")}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 dark:border-zinc-800/80 pt-2.5">
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 leading-tight max-w-[280px]">
          {t(
            "popovers.serviceMethodVisibility.info",
            "Hidden methods stay defined in the service and remain accessible from all references.",
          )}
        </p>
        <button
          onClick={onClose}
          className="rounded-lg bg-gray-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-gray-800 dark:hover:bg-white cursor-pointer transition-colors shadow-sm"
        >
          {t("popovers.serviceMethodVisibility.done", "Done")}
        </button>
      </div>
    </div>
  );
}
