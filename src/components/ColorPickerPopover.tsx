import { useEffect, useRef } from "react";
import { Palette, Check } from "lucide-react";

export const PRESET_COLORS = [
  { name: "Orange", hex: "#f97316" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Green", hex: "#10b981" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Purple", hex: "#8b5cf6" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Red", hex: "#ef4444" },
  { name: "Slate", hex: "#64748b" },
  { name: "Zinc", hex: "#71717a" },
];

interface ColorPickerPopoverProps {
  currentColor?: string;
  onSelectColor: (hex: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ColorPickerPopover({
  currentColor,
  onSelectColor,
  isOpen,
  onClose,
}: ColorPickerPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-2xl border border-gray-200 bg-white p-2.5 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1 text-[11px] font-medium text-gray-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Palette size={13} />
          <span>Color</span>
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {PRESET_COLORS.map((c) => {
          const isSelected =
            currentColor?.toLowerCase() === c.hex.toLowerCase();
          return (
            <button
              key={c.hex}
              onClick={() => {
                onSelectColor(c.hex);
                onClose();
              }}
              title={c.name}
              className="relative flex h-6 w-6 items-center justify-center rounded-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer"
              style={{ backgroundColor: c.hex }}
            >
              {isSelected && <Check size={13} className="text-white drop-shadow-sm font-bold" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
