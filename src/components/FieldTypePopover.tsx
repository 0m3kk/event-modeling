import { useEffect, useRef, useState } from "react";
import { Check, Code2, Sparkles } from "lucide-react";

export interface FieldTypePreset {
  type: string;
  label: string;
  description: string;
}

export const COMMON_FIELD_TYPES: FieldTypePreset[] = [
  { type: "string", label: "string", description: "Text string" },
  { type: "number", label: "number", description: "Numeric value" },
  { type: "boolean", label: "boolean", description: "True / False" },
  { type: "datetime", label: "datetime", description: "ISO timestamp" },
  { type: "uuid", label: "uuid", description: "Unique identifier" },
  { type: "object", label: "object", description: "Nested structure" },
  { type: "array", label: "array", description: "List / Collection" },
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
      className={`absolute left-0 ${positionClasses} w-[224px] rounded-2xl border border-gray-200/90 bg-white/95 p-2.5 shadow-2xl backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/95 z-50 select-none`}
    >
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Code2 size={14} />
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
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                isSelected
                  ? "bg-blue-50 text-blue-600 font-semibold dark:bg-blue-950/60 dark:text-blue-400"
                  : "text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <div className="flex flex-col">
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
