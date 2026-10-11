import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Check, Code2, Sparkles } from "lucide-react";
import { useCanvasStore } from "@/store";
import { getElementName } from "@/utils/naming";

export interface FieldTypePreset {
  type: string;
  label: string;
  description: string;
}

export const COMMON_FIELD_TYPES: FieldTypePreset[] = [
  { type: "string", label: "string", description: "Text" },
  { type: "number", label: "number", description: "Numeric" },
  { type: "boolean", label: "boolean", description: "True/False" },
  { type: "date", label: "date", description: "YYYY-MM-DD" },
  { type: "datetime", label: "datetime", description: "Timestamp" },
  { type: "uuid", label: "uuid", description: "ID" },
];

interface FieldTypePopoverProps {
  currentType?: string;
  onSelectType: (type: string) => void;
  isOpen: boolean;
  onClose: () => void;
  placement?: "top" | "bottom";
}

export function FieldTypePopover({
  currentType = "string",
  onSelectType,
  isOpen,
  onClose,
  placement = "top",
}: FieldTypePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [customValue, setCustomValue] = useState("");

  // Objects defined on the board (Object cards) can be reused as a field type.
  const elements = useCanvasStore((s) => s.elements);
  const objectTypes = useMemo(() => {
    const names = new Set<string>();
    for (const el of elements) {
      if (el.type !== "objectCard") continue;
      const name = getElementName(el);
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [elements]);

  useEffect(() => {
    if (!isOpen) {
      setCustomValue("");
      return;
    }

    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const positionClasses =
    placement === "bottom"
      ? "top-full mt-2"
      : "bottom-full mb-2";

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customValue.trim();
    if (trimmed) {
      onSelectType(trimmed);
      onClose();
    }
  };

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      className={`absolute left-0 ${positionClasses} w-[228px] max-h-[calc(100vh-80px)] overflow-y-auto rounded-2xl border border-gray-200/90 bg-white/95 p-2 shadow-2xl backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/95 z-50 select-none`}
    >
      <div className="mb-1.5 flex items-center justify-between px-1.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Code2 size={13} />
          <span>Field Type</span>
        </span>
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400 font-medium">
          {currentType}
        </span>
      </div>

      {/* Preset List */}
      <div className="flex flex-col gap-0.5">
        {COMMON_FIELD_TYPES.map((preset) => {
          const isSelected = currentType.toLowerCase() === preset.type.toLowerCase();

          return (
            <button
              key={preset.type}
              type="button"
              onClick={() => {
                onSelectType(preset.type);
                onClose();
              }}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1 text-left transition-colors cursor-pointer ${
                isSelected
                  ? "bg-blue-50 text-blue-600 font-semibold dark:bg-blue-950/60 dark:text-blue-400"
                  : "text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-medium">{preset.label}</span>
                <span className="text-[11px] text-gray-400 dark:text-zinc-500">
                  {preset.description}
                </span>
              </div>
              {isSelected && <Check size={14} className="stroke-[2.5]" />}
            </button>
          );
        })}
      </div>

      {/* Defined Objects (Object cards) — reusable as a field type */}
      {objectTypes.length > 0 && (
        <div className="mt-2.5 border-t border-gray-100 pt-2 dark:border-zinc-800">
          <div className="mb-1 flex items-center gap-1.5 px-1.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
            <Box size={13} />
            <span>Objects</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {objectTypes.map((objectName) => {
              const isSelected = currentType.toLowerCase() === objectName.toLowerCase();

              return (
                <button
                  key={objectName}
                  type="button"
                  onClick={() => {
                    onSelectType(objectName);
                    onClose();
                  }}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-violet-50 text-violet-600 font-semibold dark:bg-violet-950/60 dark:text-violet-400"
                      : "text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="font-mono text-[13px] font-medium">{objectName}</span>
                  {isSelected && <Check size={14} className="stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom Type Input Form */}
      <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-zinc-800">
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="Custom type..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-mono text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500"
          />
          <button
            type="submit"
            disabled={!customValue.trim()}
            title="Set custom type"
            className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40 cursor-pointer transition-colors"
          >
            <Sparkles size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}
