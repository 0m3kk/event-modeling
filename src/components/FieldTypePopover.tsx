import { useEffect, useMemo, useRef } from "react";
import { Box, Check, Code2, List, Shapes, Type } from "lucide-react";
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

type ReusableKind = "object" | "enum" | "alias";

/**
 * Per-kind styling for the section of board-defined types (Objects, Enums,
 * Aliases). Each row shows its kind icon so they can be told apart at a glance.
 */
const REUSABLE_KIND_META: Record<
  ReusableKind,
  { label: string; Icon: typeof Box; selectedClass: string; iconClass: string }
> = {
  object: {
    label: "Object",
    Icon: Box,
    selectedClass:
      "bg-violet-50 text-violet-600 font-semibold dark:bg-violet-950/60 dark:text-violet-400",
    iconClass: "text-violet-500 dark:text-violet-400",
  },
  enum: {
    label: "Enum",
    Icon: List,
    selectedClass:
      "bg-teal-50 text-teal-600 font-semibold dark:bg-teal-950/60 dark:text-teal-400",
    iconClass: "text-teal-500 dark:text-teal-400",
  },
  alias: {
    label: "Alias",
    Icon: Type,
    selectedClass:
      "bg-pink-50 text-pink-600 font-semibold dark:bg-pink-950/60 dark:text-pink-400",
    iconClass: "text-pink-500 dark:text-pink-400",
  },
};

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

  // Objects, Enums and Aliases defined on the board can be reused as a field
  // type. They share one section; each row shows its kind icon.
  const elements = useCanvasStore((s) => s.elements);
  const reusableTypes = useMemo(() => {
    const entries = new Map<string, { name: string; kind: ReusableKind }>();
    for (const el of elements) {
      const kind =
        el.type === "objectCard"
          ? "object"
          : el.type === "enumCard"
            ? "enum"
            : el.type === "aliasCard"
              ? "alias"
              : null;
      if (!kind) continue;
      const name = getElementName(el);
      if (name) entries.set(`${kind}:${name}`, { name, kind });
    }
    return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [elements]);

  useEffect(() => {
    if (!isOpen) return;

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

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      className={`absolute left-0 ${positionClasses} w-57 max-h-[calc(100vh-80px)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none`}
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

      {/* Defined Objects, Enums & Aliases — reusable as field types */}
      {reusableTypes.length > 0 && (
        <div className="mt-2.5 border-t border-gray-100 pt-2 dark:border-zinc-800">
          <div className="mb-1 flex items-center gap-1.5 px-1.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
            <Shapes size={13} />
            <span>Defined Types</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {reusableTypes.map(({ name, kind }) => {
              const isSelected = currentType.toLowerCase() === name.toLowerCase();
              const meta = REUSABLE_KIND_META[kind];
              const Icon = meta.Icon;

              return (
                <button
                  key={`${kind}:${name}`}
                  type="button"
                  onClick={() => {
                    onSelectType(name);
                    onClose();
                  }}
                  title={meta.label}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? meta.selectedClass
                      : "text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={13} className={isSelected ? undefined : meta.iconClass} />
                    <span className="font-mono text-[13px] font-medium">{name}</span>
                  </span>
                  {isSelected && <Check size={14} className="stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
