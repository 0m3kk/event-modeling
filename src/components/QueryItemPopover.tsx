import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import type { CanvasObject, StormQueryItem } from "@/types";
import { Filter, X, Trash2, Plus, ArrowLeftRight } from "lucide-react";
import { fieldNameMatches } from "@/utils/naming";

interface QueryItemPopoverProps {
  card: CanvasObject;
  queryItemId?: string;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function QueryItemPopover({
  card,
  queryItemId,
  onClose,
  anchorPosition,
}: QueryItemPopoverProps) {
  const { t } = useTranslation();
  const objects = useCanvasStore((s) => s.objects);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const setStormSelectedField = useCanvasStore((s) => s.setStormSelectedField);

  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queryItems = useMemo(() => {
    return card.stormData?.queryItems ?? [];
  }, [card.stormData?.queryItems]);

  const currentItem = useMemo(() => {
    if (!queryItemId) return null;
    return queryItems.find((q) => q.id === queryItemId) ?? null;
  }, [queryItems, queryItemId]);

  const isEditMode = Boolean(currentItem);

  // Selected event types (empty array = match any event type)
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    () => currentItem?.types ?? [],
  );

  // Selected tag field IDs (empty array = match any tag)
  const [selectedTagFieldIds, setSelectedTagFieldIds] = useState<string[]>(
    () => currentItem?.tagFieldIds ?? [],
  );

  // Text input for typing a custom event name
  const [customTypeInput, setCustomTypeInput] = useState("");

  // Set mappings (outputField.name/id -> source expression)
  const [setMappings, setSetMappings] = useState<Record<string, string>>(
    () => currentItem?.set ? { ...currentItem.set } : {},
  );

  useEffect(() => {
    if (currentItem) {
      setSelectedTypes(currentItem.types ?? []);
      setSelectedTagFieldIds(currentItem.tagFieldIds ?? []);
      setSetMappings(currentItem.set ? { ...currentItem.set } : {});
    } else {
      setSelectedTypes([]);
      setSelectedTagFieldIds([]);
      setSetMappings({});
    }
  }, [currentItem]);

  // Collect all unique Event card names across the board
  const existingEvents = useMemo(() => {
    const names = new Set<string>();
    for (const obj of objects) {
      if (obj.type === "storm" && obj.stormData?.kind === "event") {
        const n = (obj.stormData.name ?? "").trim();
        if (n) names.add(n);
      }
    }
    return Array.from(names).sort();
  }, [objects]);

  // Tagged INPUT params on this State/Constraint card available for filtering
  // (only input params can carry the tags a query item filters on).
  const taggedFields = useMemo(() => {
    return (card.stormData?.inputFields ?? []).filter(
      (f) => Boolean((f.tag ?? "").trim()),
    );
  }, [card.stormData?.inputFields]);

  // Output fields on this State/Constraint card whose state is updated by this query item
  const outputFields = useMemo(() => {
    return card.stormData?.outputFields ?? [];
  }, [card.stormData?.outputFields]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentItem?.id]);

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

  const handleToggleEvent = (eventName: string) => {
    setSelectedTypes((prev) =>
      prev.includes(eventName)
        ? prev.filter((t) => t !== eventName)
        : [...prev, eventName],
    );
  };

  const handleAddCustomType = () => {
    const raw = customTypeInput.trim();
    if (!raw) return;
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== "*");

    if (parts.length > 0) {
      setSelectedTypes((prev) => {
        const next = new Set([...prev, ...parts]);
        return Array.from(next);
      });
    }
    setCustomTypeInput("");
  };

  const handleClearAllTypes = () => {
    setSelectedTypes([]);
  };

  const handleToggleTagField = (fieldId: string) => {
    setSelectedTagFieldIds((prev) =>
      prev.includes(fieldId) ? [] : [fieldId],
    );
  };

  const handleClearAllTags = () => {
    setSelectedTagFieldIds([]);
  };

  const handleApply = () => {
    if (!card.stormData) return;

    // Flush any pending custom type input
    let finalTypes = [...selectedTypes];
    const pending = customTypeInput.trim();
    if (pending && pending !== "*") {
      const parts = pending
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "*");
      finalTypes = Array.from(new Set([...finalTypes, ...parts]));
    }

    // Clean set mappings: only non-empty trimmed strings
    const cleanSet: Record<string, string> = {};
    for (const [key, val] of Object.entries(setMappings)) {
      if (val && val.trim()) {
        cleanSet[key] = val.trim();
      }
    }
    const finalSet = Object.keys(cleanSet).length > 0 ? cleanSet : undefined;

    if (isEditMode && currentItem) {
      const nextItems = (card.stormData.queryItems ?? []).map((q) =>
        q.id === currentItem.id
          ? { ...q, types: finalTypes, tagFieldIds: selectedTagFieldIds, set: finalSet }
          : q,
      );
      updateObject(card.id, {
        stormData: {
          ...card.stormData,
          queryItems: nextItems,
        },
      });
    } else {
      const newId = `qi-${Date.now()}`;
      const newItem: StormQueryItem = {
        id: newId,
        types: finalTypes,
        tagFieldIds: selectedTagFieldIds,
        set: finalSet,
      };
      const nextItems = [...(card.stormData.queryItems ?? []), newItem];
      updateObject(card.id, {
        stormData: {
          ...card.stormData,
          queryItems: nextItems,
        },
      });
      setStormSelectedField({ objectId: card.id, fieldId: newId });
    }
    onClose();
  };

  const handleDelete = () => {
    if (!currentItem || !card.stormData) return;
    const nextItems = (card.stormData.queryItems ?? []).filter(
      (q) => q.id !== currentItem.id,
    );
    updateObject(card.id, {
      stormData: {
        ...card.stormData,
        queryItems: nextItems,
      },
    });
    setStormSelectedField(null);
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 flex w-104 flex-col rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      style={{
        left: Math.max(12, anchorPosition.x - 208),
        top: Math.max(12, anchorPosition.y + 8),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-gray-800 dark:text-zinc-100">
          <Filter size={15} className="shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="truncate">
            {t("popovers.queryItem.title")}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-2.5 space-y-3">
        {/* Section 1: Event Types */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-zinc-400">
              Event Types ({selectedTypes.length === 0 ? "Any *" : selectedTypes.length})
            </span>
            {selectedTypes.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllTypes}
                className="text-[10px] text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
              >
                {t("popovers.queryItem.clearMatchAny")}
              </button>
            )}
          </div>

          {/* Selected Event Types Badges */}
          <div className="mb-1.5 flex min-h-7 flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1.5 dark:border-zinc-800 dark:bg-zinc-800/50">
            {selectedTypes.length === 0 ? (
              <span className="text-[11px] italic text-gray-400 px-1 dark:text-zinc-500">
                {t("popovers.queryItem.matchesAllEvents")}
              </span>
            ) : (
              selectedTypes.map((tItem) => (
                <span
                  key={tItem}
                  className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
                >
                  <span>{tItem}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleEvent(tItem)}
                    className="hover:text-red-600 dark:hover:text-red-400"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Available Events on Board (toggle chips) */}
          {existingEvents.length > 0 && (
            <div className="mb-1.5">
              <div className="mb-1 text-[10px] text-gray-400 dark:text-zinc-500">
                {t("popovers.queryItem.clickToToggle")}
              </div>
              <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                {existingEvents.map((eventName) => {
                  const isSelected = selectedTypes.includes(eventName);
                  return (
                    <button
                      key={eventName}
                      type="button"
                      onClick={() => handleToggleEvent(eventName)}
                      className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                        isSelected
                          ? "border border-violet-300 bg-violet-100 font-bold text-violet-800 dark:border-violet-700 dark:bg-violet-950/70 dark:text-violet-200"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {eventName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Input to type custom event name */}
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={customTypeInput}
              onChange={(e) => setCustomTypeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (customTypeInput.trim()) {
                    handleAddCustomType();
                  } else {
                    handleApply();
                  }
                }
              }}
              placeholder={t("popovers.queryItem.placeholder")}
              className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-800 placeholder-gray-400 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
            {customTypeInput.trim() && (
              <button
                type="button"
                onClick={handleAddCustomType}
                className="flex items-center gap-0.5 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <Plus size={12} />
                <span>{t("popovers.queryItem.addEvent")}</span>
              </button>
            )}
          </div>
        </div>

        {/* Section 2: Tag Filter */}
        <div className="border-t border-gray-100 pt-2 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-zinc-400">
              Tag Filter ({selectedTagFieldIds.length === 0 ? "Any" : "1 Selected"})
            </span>
            {selectedTagFieldIds.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllTags}
                className="text-[10px] text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
              >
                {t("popovers.queryItem.clearMatchAny")}
              </button>
            )}
          </div>

          {taggedFields.length === 0 ? (
            <div className="text-[11px] italic text-gray-400 dark:text-zinc-500">
              {t("popovers.queryItem.noTaggedParams")}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {taggedFields.map((f) => {
                const isSelected = selectedTagFieldIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleToggleTagField(f.id)}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                      isSelected
                        ? "border border-orange-300 bg-orange-100 font-bold text-orange-800 dark:border-orange-700 dark:bg-orange-950/70 dark:text-orange-300"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {f.tag}:{f.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3: State Projection Updates (`set`) for Output Fields */}
        {outputFields.length > 0 && (
          <div className="border-t border-gray-100 pt-2 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                <ArrowLeftRight size={12} />
                State Updates (set)
              </span>
              <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                e.g. &lt;EventName&gt;.&lt;field&gt;
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {outputFields.map((of) => {
                const sampleEvent =
                  selectedTypes[0] ||
                  customTypeInput.trim() ||
                  "Event";
                // Find matching expression across direct name, id, or camelCase
                let currentVal = setMappings[of.name] ?? setMappings[of.id] ?? "";
                if (!currentVal) {
                  for (const [key, expr] of Object.entries(setMappings)) {
                    if (fieldNameMatches(of.name, key) || fieldNameMatches(of.id, key)) {
                      currentVal = expr;
                      break;
                    }
                  }
                }
                return (
                  <div key={of.id} className="flex items-center gap-2">
                    <span
                      title={of.name}
                      className="w-32 shrink-0 truncate text-right font-mono text-[11px] font-semibold text-gray-800 dark:text-zinc-200"
                    >
                      {of.name}
                    </span>
                    <span className="text-[11px] font-bold text-gray-400 dark:text-zinc-500">=</span>
                    <input
                      type="text"
                      value={currentVal}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSetMappings((prev) => {
                          const next = { ...prev };
                          // Clear any alternative casing keys for this field first
                          for (const key of Object.keys(next)) {
                            if (fieldNameMatches(of.name, key) || fieldNameMatches(of.id, key)) {
                              delete next[key];
                            }
                          }
                          next[of.name] = val;
                          return next;
                        });
                      }}
                      placeholder={`e.g. ${sampleEvent}.${of.name} or count + 1`}
                      className="flex-1 font-mono text-[11px] rounded border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-2.5 dark:border-zinc-800">
          <div className="text-[10px] text-gray-400 dark:text-zinc-500">
            {selectedTypes.length === 0 && selectedTagFieldIds.length === 0
              ? "Matches all events"
              : `Matches: ${selectedTypes.length || "all"} types${selectedTagFieldIds.length > 0 ? ", 1 tag" : ", any tag"}`}
          </div>
          <div className="flex items-center gap-1.5">
            {isEditMode && (
              <button
                type="button"
                onClick={handleDelete}
                title={t("popovers.queryItem.deleteItem")}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
            >
              {t("common.apply")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
