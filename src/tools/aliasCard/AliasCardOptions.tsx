import { useState } from "react";
import { Brackets, Type } from "lucide-react";
import type { CanvasElement } from "@/types";
import type { AliasCardData } from "./index";
import { FieldTypePopover } from "@/components/FieldTypePopover";
import { toDisplayType } from "@/utils/naming";

interface AliasCardOptionsProps {
  element: CanvasElement<AliasCardData>;
  onUpdate: (partial: Partial<AliasCardData>) => void;
}

export function AliasCardOptions({ element, onUpdate }: AliasCardOptionsProps) {
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);
  const isArray = Boolean(element.data.isArray);

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <button
          onClick={() => setIsTypePickerOpen(!isTypePickerOpen)}
          title={`Wrapped Type (${toDisplayType(element.data.aliasedType, element.data.isArray)})`}
          className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <Type size={16} />
        </button>

        <FieldTypePopover
          currentType={element.data.aliasedType}
          isOpen={isTypePickerOpen}
          onClose={() => setIsTypePickerOpen(false)}
          onSelectType={(newType) => onUpdate({ aliasedType: newType })}
          placement="top"
        />
      </div>

      {/* Array toggle: marks the wrapped type as a list (renders as "type[]") */}
      <button
        onClick={() => onUpdate({ isArray: !isArray })}
        title={isArray ? "Alias is an array (click to unset)" : "Mark alias as array"}
        className={`flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer ${
          isArray
            ? "bg-violet-500/15 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400"
            : "text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        }`}
      >
        <Brackets size={16} />
      </button>
    </div>
  );
}
