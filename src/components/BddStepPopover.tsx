import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useCanvasStore } from "@/store";
import type { BddPayloadField, BddStepRef, CanvasObject } from "@/types";
import {
  BDD_STEP_REF_COLORS,
  BDD_STEP_REF_LABELS,
  bddRefsForPhase,
} from "@/constants/storm";
import { ListChecks, Plus, Trash2, X } from "lucide-react";

interface BddStepPopoverProps {
  card: CanvasObject;
  stepId?: string;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

/** A payload row while it is being edited (empty rows are dropped on apply). */
type PayloadDraft = BddPayloadField;

/**
 * Create / edit one Given/When/Then scenario step: pick what the step stands
 * for, name the referenced card, and fill in the concrete payload values the
 * scenario needs. Payloads are examples, so leaving fields out is expected.
 */
export function BddStepPopover({
  card,
  stepId,
  onClose,
  anchorPosition,
}: BddStepPopoverProps) {
  const addBddStep = useCanvasStore((s) => s.addBddStep);
  const updateBddStep = useCanvasStore((s) => s.updateBddStep);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const setStormSelectedField = useCanvasStore((s) => s.setStormSelectedField);

  const popoverRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const phase = card.stormData?.phase;
  const allowedRefs = useMemo(() => bddRefsForPhase(phase), [phase]);
  const existingStep = useMemo(
    () => (stepId ? (card.stormData?.steps ?? []).find((s) => s.id === stepId) : null),
    [card.stormData?.steps, stepId],
  );
  const isEditMode = Boolean(existingStep);

  const [ref, setRef] = useState<BddStepRef>(
    () => existingStep?.ref ?? allowedRefs[0] ?? "event",
  );
  const [name, setName] = useState(() => existingStep?.name ?? "");
  const [payload, setPayload] = useState<PayloadDraft[]>(() =>
    (existingStep?.payload ?? []).map((p) => ({ ...p })),
  );

  useEffect(() => {
    nameRef.current?.focus();
  }, [stepId]);

  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const addPayloadRow = () => {
    setPayload((prev) => [...prev, { id: nanoid(), key: "", value: "" }]);
  };

  const updatePayloadRow = (
    id: string,
    patch: Partial<Pick<BddPayloadField, "key" | "value">>,
  ) => {
    setPayload((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePayloadRow = (id: string) => {
    setPayload((prev) => prev.filter((p) => p.id !== id));
  };

  const handleApply = () => {
    if (!card.stormData) return;

    // Keep only rows with a key; a value may be left blank on purpose.
    const cleanPayload = payload
      .map((p) => ({ ...p, key: p.key.trim() }))
      .filter((p) => p.key.length > 0);

    if (isEditMode && existingStep) {
      updateBddStep(card.id, existingStep.id, {
        ref,
        name: name.trim(),
        payload: cleanPayload,
      });
    } else {
      const newId = addBddStep(card.id, ref);
      if (newId) {
        updateBddStep(card.id, newId, {
          name: name.trim(),
          payload: cleanPayload,
        });
      }
    }
    onClose();
  };

  const handleDelete = () => {
    if (!existingStep || !card.stormData) return;
    const steps = (card.stormData.steps ?? []).filter(
      (s) => s.id !== existingStep.id,
    );
    updateObject(card.id, {
      stormData: { ...card.stormData, steps },
    });
    setStormSelectedField(null);
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 flex w-88 flex-col rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 shadow-2xl"
      style={{
        left: Math.max(12, anchorPosition.x - 176),
        top: Math.max(12, anchorPosition.y + 8),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-gray-800 dark:text-zinc-100">
          <ListChecks size={15} className="shrink-0 text-sky-600 dark:text-sky-400" />
          <span className="truncate">
            {isEditMode ? "Edit Step" : "Add Step"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-600 dark:hover:text-zinc-300 cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-2.5 space-y-3">
        {/* What the step stands for */}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-zinc-400">
            Step
          </div>
          <div className="flex flex-wrap gap-1">
            {allowedRefs.map((r) => {
              const isSelected = ref === r;
              const color = BDD_STEP_REF_COLORS[r];
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRef(r)}
                  className="rounded-md border border-gray-200 dark:border-zinc-700 px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer"
                  style={
                    isSelected
                      ? { borderColor: color, backgroundColor: `${color}1a`, color }
                      : undefined
                  }
                  data-selected={isSelected}
                >
                  <span className={isSelected ? "" : "text-gray-600 dark:text-zinc-400"}>
                    {BDD_STEP_REF_LABELS[r]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Name of the referenced card */}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-zinc-400">
            Name
          </div>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApply();
              }
            }}
            placeholder="e.g. OrderPlaced"
            className="w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-gray-800 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
          />
        </div>

        {/* Concrete payload values (partial) */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-zinc-400">
              Payload ({payload.length})
            </span>
            <button
              type="button"
              onClick={addPayloadRow}
              className="flex items-center gap-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer"
            >
              <Plus size={11} />
              <span>Add value</span>
            </button>
          </div>

          {payload.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 dark:border-zinc-700 px-2 py-2 text-[11px] italic text-gray-400 dark:text-zinc-500">
              No values yet — add just the fields this scenario needs.
            </div>
          ) : (
            <div className="space-y-1.5">
              {payload.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={p.key}
                    onChange={(e) =>
                      updatePayloadRow(p.id, { key: e.target.value })
                    }
                    placeholder="key"
                    className="w-24 shrink-0 rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-1 text-[11px] font-semibold text-gray-700 dark:text-zinc-300 placeholder-gray-400 dark:placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
                  />
                  <span className="text-gray-300 dark:text-zinc-600">=</span>
                  <input
                    type="text"
                    value={p.value}
                    onChange={(e) =>
                      updatePayloadRow(p.id, { value: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (p.key.trim()) addPayloadRow();
                      }
                    }}
                    placeholder="value"
                    className="min-w-0 flex-1 rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-1 text-[11px] text-gray-800 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removePayloadRow(p.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-300 dark:text-zinc-600 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="flex items-center justify-end gap-1.5 border-t border-gray-100 dark:border-zinc-800 pt-2.5">
          {isEditMode && (
            <button
              type="button"
              onClick={handleDelete}
              title="Delete step"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-400 dark:text-zinc-400 transition-colors hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-700 cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
