import { useMemo, useState } from "react";
import { Link2, ShieldPlus } from "lucide-react";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { computeConstraintCardSize } from "./index";
import {
  collectBoardStateCards,
  getConstraintStates,
  getConstraintRules,
  type ConstraintCardData,
} from "./rules";
import { ConstraintStatePopover } from "./ConstraintStatePopover";

interface ConstraintCardOptionsProps {
  element: CanvasElement<ConstraintCardData>;
  onUpdate: (partial: Partial<ConstraintCardData>) => void;
}

/**
 * Options bar for a Constraint card:
 * - "Add State" lists the State cards on the board for the STATES section.
 * - "Add Rule" appends a free-text rule row (edited inline on the card).
 * - When a states row is selected, change which State card it references.
 */
export function ConstraintCardOptions({ element }: ConstraintCardOptionsProps) {
  const selectedField = useCanvasStore((s) => s.selectedField);
  const elements = useCanvasStore((s) => s.elements);

  const [statePicker, setStatePicker] = useState<{ open: boolean; index: number }>({
    open: false,
    index: -1,
  });

  const states = getConstraintStates(element.data);
  const rules = getConstraintRules(element.data);
  const boardStates = useMemo(() => collectBoardStateCards(elements), [elements]);

  const isThisSelected = selectedField?.elementId === element.id;
  const activeStateIndex = isThisSelected && selectedField?.sectionIndex === 0
    ? (selectedField?.fieldIndex ?? -1)
    : -1;

  const commit = (data: ConstraintCardData) => {
    const size = computeConstraintCardSize(data);
    useCanvasStore.getState().updateElement(element.id, { height: size.height, data });
  };

  const handlePickState = (name: string) => {
    if (statePicker.index >= 0 && statePicker.index < states.length) {
      const nextStates = [...states];
      nextStates[statePicker.index] = { ...states[statePicker.index], name };
      commit({ ...element.data, states: nextStates });
    } else {
      commit({ ...element.data, states: [...states, { name }] });
    }
    setStatePicker({ open: false, index: -1 });
  };

  const handleAddRule = () => {
    const nextRules = [...rules, `rule${rules.length + 1}`];
    commit({ ...element.data, rules: nextRules });
    const newIndex = nextRules.length - 1;
    useCanvasStore.getState().setSelectedField({
      elementId: element.id,
      sectionIndex: 1,
      sectionId: "rules",
      fieldIndex: newIndex,
    });
  };

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <button
          onClick={() => setStatePicker({ open: !statePicker.open, index: -1 })}
          title="Add State"
          className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <Link2 size={16} />
        </button>

        <ConstraintStatePopover
          boardStates={boardStates}
          currentName={statePicker.index >= 0 ? states[statePicker.index]?.name : undefined}
          usedNames={states
            .filter((_, i) => i !== statePicker.index)
            .map((s) => s.name)}
          isOpen={statePicker.open}
          onClose={() => setStatePicker((prev) => ({ ...prev, open: false }))}
          onSelect={handlePickState}
        />
      </div>

      <div className="relative">
        <button
          onClick={handleAddRule}
          title="Add Rule"
          className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <ShieldPlus size={16} />
        </button>
      </div>

      {activeStateIndex >= 0 && (
        <>
          <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-zinc-800" />
          <div className="relative">
            <button
              onClick={() => setStatePicker({ open: !statePicker.open, index: activeStateIndex })}
              title="Change State"
              className="flex items-center justify-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
            >
              <Link2 size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
