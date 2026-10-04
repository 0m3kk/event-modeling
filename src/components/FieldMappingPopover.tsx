import { useState, useMemo, useEffect, useRef } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject, StormField, StormQueryItem } from "@/types";
import { ArrowLeftRight, X, Trash2, Sparkles, Plus, Zap } from "lucide-react";
import { fieldNameMatches, nameKey } from "@/utils/naming";
import { nanoid } from "nanoid";

interface FieldMappingPopoverProps {
  card: CanvasObject;
  fieldId: string;
  section?: "params" | "response";
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function FieldMappingPopover({
  card,
  fieldId,
  section,
  onClose,
  anchorPosition,
}: FieldMappingPopoverProps) {
  const updateStormFieldMapping = useCanvasStore((s) => s.updateStormFieldMapping);
  const objects = useCanvasStore((s) => s.objects);
  const updateObject = useCanvasStore((s) => s.updateObject);

  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const data = card.stormData;

  const targetField: StormField | null = useMemo(() => {
    if (!data) return null;
    if (section === "response") {
      return (
        data.responseFields?.find((f) => f.id === fieldId) ??
        data.outputFields?.find((f) => f.id === fieldId) ??
        null
      );
    }
    if (section === "params") {
      return (
        data.inputFields?.find((f) => f.id === fieldId) ??
        data.fields.find((f) => f.id === fieldId) ??
        null
      );
    }
    return (
      data.fields.find((f) => f.id === fieldId) ??
      data.inputFields?.find((f) => f.id === fieldId) ??
      data.outputFields?.find((f) => f.id === fieldId) ??
      data.responseFields?.find((f) => f.id === fieldId) ??
      null
    );
  }, [data, fieldId, section]);

  const isOutputField = Boolean(
    (data?.kind === "state" || data?.kind === "constraint") &&
      section === "response" &&
      targetField &&
      (data.outputFields ?? []).some((f) => f.id === targetField.id),
  );

  // -------------------------------------------------------------
  // Standard (Single Expression) Mapping State (for Event & Response fields)
  // -------------------------------------------------------------
  const [singleMapping, setSingleMapping] = useState(() => targetField?.mapping ?? "");

  useEffect(() => {
    setSingleMapping(targetField?.mapping ?? "");
  }, [targetField]);

  // -------------------------------------------------------------
  // Multi-Event Projection Mapping State (for State/Constraint outputFields)
  // -------------------------------------------------------------
  // QueryItems on the card
  const [queryItems, setQueryItems] = useState<StormQueryItem[]>(() => data?.queryItems ?? []);

  useEffect(() => {
    setQueryItems(data?.queryItems ?? []);
  }, [data?.queryItems]);

  // Local map of queryItemId -> expression string for this field
  const [eventExpressions, setEventExpressions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (!targetField || !data?.queryItems) return initial;
    for (const qi of data.queryItems) {
      if (!qi.set) continue;
      for (const [key, expr] of Object.entries(qi.set)) {
        if (fieldNameMatches(targetField.name, key) || fieldNameMatches(targetField.id, key)) {
          initial[qi.id] = expr;
          break;
        }
      }
    }
    return initial;
  });

  // All event cards on canvas
  const allEventCards = useMemo(() => {
    return objects
      .filter((o) => o.type === "storm" && o.stormData?.kind === "event")
      .map((o) => ({
        id: o.id,
        name: o.stormData!.name,
        fields: o.stormData!.fields ?? [],
      }));
  }, [objects]);

  // Unlinked event cards on canvas that user can add to rehydrate this field
  const unlinkedEventCards = useMemo(() => {
    const existingTypeSet = new Set(queryItems.flatMap((q) => q.types));
    return allEventCards.filter((e) => !existingTypeSet.has(e.name));
  }, [allEventCards, queryItems]);

  const [selectedNewEvent, setSelectedNewEvent] = useState<string>("");

  // Click outside listener & Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!isOutputField) {
      inputRef.current?.focus();
    }
  }, [isOutputField]);

  // All enum model nodes on canvas
  const enumNodes = useMemo(() => {
    return objects
      .filter((o) => o.type === "model" && o.modelData?.kind === "enum")
      .map((o) => ({
        name: o.modelData!.name,
        values: o.modelData!.values?.map((v) => v.name) ?? [],
      }));
  }, [objects]);

  const targetEnumNode = useMemo(() => {
    if (!targetField?.fieldType) return null;
    const targetTypeKey = nameKey(targetField.fieldType);
    return enumNodes.find((e) => nameKey(e.name) === targetTypeKey) ?? null;
  }, [targetField, enumNodes]);

  // Standard suggestions for command/response fields
  const standardSuggestions = useMemo(() => {
    const list: { label: string; value: string }[] = [];
    if (targetEnumNode) {
      for (const val of targetEnumNode.values) {
        list.push({
          label: `"${targetEnumNode.name}"."${val}"`,
          value: `"${targetEnumNode.name}"."${val}"`,
        });
      }
    }
    if (targetField) {
      const fieldName = targetField.name.trim();
      if (fieldName) {
        list.push({ label: `"Command"."${fieldName}"`, value: `"Command"."${fieldName}"` });
        if (data?.kind === "constraint" || data?.kind === "state") {
          list.push({ label: `"Query"."${fieldName}"`, value: `"Query"."${fieldName}"` });
        }
        const relatedCards = objects.filter(
          (o) =>
            o.type === "storm" &&
            (o.stormData?.kind === "command" || o.stormData?.kind === "query"),
        );
        for (const rc of relatedCards) {
          const rcFields = rc.stormData?.fields ?? [];
          for (const rcf of rcFields) {
            if (fieldNameMatches(fieldName, rcf.name)) {
              list.push({
                label: `"${rc.stormData!.name}"."${rcf.name}"`,
                value: `"${rc.stormData!.name}"."${rcf.name}"`,
              });
            }
          }
        }
        if (targetField.fieldType === "UUID") {
          list.push({ label: "uuid()", value: "uuid()" });
        }
        if (targetField.fieldType === "DateTime") {
          list.push({ label: "now()", value: "now()" });
        }
        if (targetField.fieldType === "String" && !targetEnumNode) {
          list.push({ label: "'ACTIVE'", value: "'ACTIVE'" });
          list.push({ label: "'PENDING'", value: "'PENDING'" });
        }
      }
    }
    list.push(
      { label: "now()", value: "now()" },
      { label: "uuid()", value: "uuid()" },
      { label: '"Constraint"."<Output>"', value: '"Constraint".' },
      {
        label: "hashPassword(...)",
        value: `hashPassword("Command"."${targetField?.name.trim() || "Password"}")`,
      },
    );
    const seen = new Set<string>();
    return list.filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
  }, [targetField, targetEnumNode]);

  // Handle Save for Single Expression
  const handleApplySingle = () => {
    updateStormFieldMapping(card.id, fieldId, singleMapping, section);
    onClose();
  };

  const handleClearSingle = () => {
    setSingleMapping("");
    updateStormFieldMapping(card.id, fieldId, undefined, section);
    onClose();
  };

  // Handle Save for Multi-Event Projection
  const handleApplyMulti = () => {
    if (!targetField || !data) {
      onClose();
      return;
    }

    const nextQueryItems = queryItems.map((qi) => {
      const expr = (eventExpressions[qi.id] ?? "").trim();
      const nextSet: Record<string, string> = { ...(qi.set ?? {}) };

      // Remove any previous keys for this field (any casing)
      for (const k of Object.keys(nextSet)) {
        if (fieldNameMatches(targetField.name, k) || fieldNameMatches(targetField.id, k)) {
          delete nextSet[k];
        }
      }

      if (expr) {
        nextSet[targetField.name] = expr;
      }

      return {
        ...qi,
        set: Object.keys(nextSet).length > 0 ? nextSet : undefined,
      };
    });

    updateObject(card.id, {
      stormData: {
        ...data,
        queryItems: nextQueryItems,
      },
    });
    onClose();
  };

  const handleAddEventQueryItem = (eventName: string) => {
    if (!eventName || !targetField) return;
    const newQiId = `qi-${nanoid(6)}`;
    const defaultExpr = `"${eventName}"."${targetField.name}"`;
    const newQi: StormQueryItem = {
      id: newQiId,
      types: [eventName],
      tagFieldIds: [],
      set: { [targetField.name]: defaultExpr },
    };
    setQueryItems((prev) => [...prev, newQi]);
    setEventExpressions((prev) => ({
      ...prev,
      [newQiId]: defaultExpr,
    }));
    setSelectedNewEvent("");
  };

  const handleRemoveQueryItem = (qiId: string) => {
    setQueryItems((prev) => prev.filter((q) => q.id !== qiId));
    setEventExpressions((prev) => {
      const next = { ...prev };
      delete next[qiId];
      return next;
    });
  };

  // Count active projections
  const activeProjectionCount = useMemo(() => {
    return Object.values(eventExpressions).filter((v) => v && v.trim()).length;
  }, [eventExpressions]);

  return (
    <div
      ref={popoverRef}
      className={`fixed z-50 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
        isOutputField ? "w-125" : "w-96"
      }`}
      style={{
        left: `${anchorPosition.x}px`,
        top: `${anchorPosition.y}px`,
        transform: "translateX(-50%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 px-4 py-3 bg-linear-to-r from-cyan-50/60 to-transparent dark:from-cyan-950/25">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400">
            <ArrowLeftRight size={15} />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>{isOutputField ? "Field Projections" : "Field Mapping"}</span>
              <span className="rounded bg-cyan-100 dark:bg-cyan-900/60 px-1.5 py-0.2 text-[9px] font-bold text-cyan-700 dark:text-cyan-300">
                Codegen
              </span>
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-zinc-400">
              Field: <span className="font-semibold text-cyan-600 dark:text-cyan-400">{targetField?.name || "Untitled"}</span>
              {targetField?.fieldType ? ` (${targetField.fieldType})` : ""}
              {" · "}
              <span className="text-gray-400 dark:text-zinc-500">{data?.name}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X size={15} />
        </button>
      </div>

      {/* Body: Multi-Event Projection for State/Constraint outputFields */}
      {isOutputField ? (
        <div className="p-4 space-y-3.5 max-h-[72vh] overflow-y-auto">
          {/* Warning if no projections */}
          {activeProjectionCount === 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <span className="font-bold text-amber-600 dark:text-amber-400 text-xs mt-0.5">⚠️</span>
              <div>
                <p className="font-semibold">Missing event projection</p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400/90">
                  This field is never updated by any event. Configure at least one event mapping below so codegen knows how to project this field.
                </p>
              </div>
            </div>
          )}

          {/* List of Events updating this field */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-zinc-400 flex items-center gap-1.5">
                <Zap size={12} className="text-amber-500" />
                Events Updating This Field ({queryItems.length})
              </label>
              <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                Format: <code className="text-cyan-600 dark:text-cyan-400">&lt;EventName&gt;.&lt;field&gt;</code>
              </span>
            </div>

            {queryItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-zinc-800 p-4 text-center">
                <p className="text-xs font-medium text-gray-600 dark:text-zinc-400 mb-1">
                  No events connected to this {data?.kind} yet
                </p>
                <p className="text-[11px] text-gray-400 dark:text-zinc-500 mb-3">
                  Select an event from the canvas below to start projecting this field:
                </p>
                {allEventCards.length > 0 ? (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {allEventCards.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => handleAddEventQueryItem(ev.name)}
                        className="flex items-center gap-1 rounded-lg border border-orange-200 dark:border-orange-800/80 bg-orange-50 dark:bg-orange-950/30 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
                      >
                        <Zap size={11} className="text-orange-500" />
                        {ev.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] italic text-gray-400">
                    Create an Event card on the board first.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {queryItems.map((qi) => {
                  const eventLabels = qi.types.length ? qi.types : ["Query Item"];
                  const primaryEvent = eventLabels[0];
                  const currentExpr = eventExpressions[qi.id] ?? "";
                  const matchingEventCard = allEventCards.find((e) => e.name === primaryEvent);

                  return (
                    <div
                      key={qi.id}
                      className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-800/40 p-3 space-y-2 transition-all hover:border-gray-300 dark:hover:border-zinc-700"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {eventLabels.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1 rounded-md border border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:text-orange-300"
                            >
                              <Zap size={11} className="text-orange-500" />
                              {t}
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveQueryItem(qi.id)}
                          title="Remove this event from card"
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Expression input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={currentExpr}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEventExpressions((prev) => ({
                              ...prev,
                              [qi.id]: val,
                            }));
                          }}
                          placeholder={`e.g. "${primaryEvent}"."${targetField?.name}" or count + 1`}
                          className="flex-1 font-mono text-xs rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400"
                        />
                        {currentExpr && (
                          <button
                            type="button"
                            onClick={() =>
                              setEventExpressions((prev) => ({
                                ...prev,
                                [qi.id]: "",
                              }))
                            }
                            className="text-[10px] text-gray-400 hover:text-red-500 px-1.5 py-1"
                            title="Clear expression"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Suggestions for this event */}
                      {matchingEventCard && matchingEventCard.fields.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-gray-400 dark:text-zinc-500">Presets:</span>
                          {matchingEventCard.fields.map((ef) => {
                            const candidate = `"${primaryEvent}"."${ef.name}"`;
                            const isMatch =
                              targetField &&
                              (fieldNameMatches(targetField.name, ef.name) ||
                                fieldNameMatches(targetField.id, ef.id));
                            return (
                              <button
                                key={ef.id}
                                type="button"
                                onClick={() =>
                                  setEventExpressions((prev) => ({
                                    ...prev,
                                    [qi.id]: candidate,
                                  }))
                                }
                                className={`rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                                  isMatch
                                    ? "border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-800 dark:text-cyan-200 font-semibold"
                                    : "border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:border-cyan-400"
                                }`}
                              >
                                {candidate}
                              </button>
                            );
                          })}
                          {targetEnumNode ? (
                            targetEnumNode.values.map((val) => {
                              const enumCandidate = `"${targetEnumNode.name}"."${val}"`;
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() =>
                                    setEventExpressions((prev) => ({
                                      ...prev,
                                      [qi.id]: enumCandidate,
                                    }))
                                  }
                                  className="rounded border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 px-1.5 py-0.5 font-mono text-[10px] text-cyan-700 dark:text-cyan-300 hover:border-cyan-400"
                                >
                                  {enumCandidate}
                                </button>
                              );
                            })
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setEventExpressions((prev) => ({
                                  ...prev,
                                  [qi.id]: `'ACTIVE'`,
                                }))
                              }
                              className="rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 dark:text-zinc-300 hover:border-cyan-400"
                            >
                              'ACTIVE'
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add another Event dropdown */}
            {unlinkedEventCards.length > 0 && (
              <div className="pt-1 flex items-center gap-2">
                <select
                  value={selectedNewEvent}
                  onChange={(e) => setSelectedNewEvent(e.target.value)}
                  className="flex-1 text-xs rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-gray-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="">+ Connect another Event on canvas...</option>
                  {unlinkedEventCards.map((ev) => (
                    <option key={ev.id} value={ev.name}>
                      ⚡ {ev.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedNewEvent}
                  onClick={() => handleAddEventQueryItem(selectedNewEvent)}
                  className="flex items-center gap-1 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
                >
                  <Plus size={13} />
                  Add Event
                </button>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-zinc-800 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyMulti}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
            >
              Save Projections
            </button>
          </div>
        </div>
      ) : (
        /* Body: Single Expression Mapping for Event and Response fields */
        <div className="p-4 space-y-3">
          {/* Warning if empty */}
          {!singleMapping.trim() && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <span className="font-bold text-amber-600 dark:text-amber-400 text-xs">⚠️</span>
              <span>
                Explicit mapping is required for code generation. Without a mapping, codegen will fail on this field.
              </span>
            </div>
          )}

          {/* Input */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-zinc-300 mb-1">
              Source Expression
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={singleMapping}
                onChange={(e) => setSingleMapping(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleApplySingle();
                  }
                }}
                placeholder='e.g. "Command"."Name", now(), uuid()'
                className="w-full font-mono text-xs rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400"
              />
            </div>
          </div>

          {/* Suggestions chips */}
          <div>
            <div className="text-[10px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Sparkles size={11} className="text-cyan-500" />
              Quick Presets
            </div>
            <div className="flex flex-wrap gap-1.5">
              {standardSuggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setSingleMapping(s.value)}
                  className="rounded-md border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-gray-700 dark:text-zinc-300 hover:border-cyan-400 hover:bg-cyan-50 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/40 transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 dark:bg-zinc-800/60 p-2 text-[10px] text-gray-500 dark:text-zinc-400 space-y-1">
            <p className="font-semibold text-gray-700 dark:text-zinc-300">Supported Formats:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><code className="text-cyan-600 dark:text-cyan-400">&quot;Command&quot;.&quot;&lt;Field&gt;&quot;</code> — pass through command payload</li>
              <li><code className="text-cyan-600 dark:text-cyan-400">&quot;Constraint&quot;.&quot;&lt;Output&gt;&quot;</code> — value calculated by constraint</li>
              <li><code className="text-cyan-600 dark:text-cyan-400">&quot;User Status&quot;.&quot;PENDING&quot;</code> — enum value</li>
              <li><code className="text-cyan-600 dark:text-cyan-400">uuid()</code>, <code className="text-cyan-600 dark:text-cyan-400">now()</code> — system generators</li>
              <li><code className="text-cyan-600 dark:text-cyan-400">func(&quot;Command&quot;.&quot;A&quot;)</code> — transformation expression</li>
            </ul>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-zinc-800 pt-3">
            {targetField?.mapping ? (
              <button
                type="button"
                onClick={handleClearSingle}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                <Trash2 size={13} />
                Clear Mapping
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplySingle}
                className="rounded-lg bg-cyan-600 hover:bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
              >
                Apply Mapping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
