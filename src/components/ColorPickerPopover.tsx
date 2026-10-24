import { useEffect, useRef } from "react";
import { Palette, Check } from "lucide-react";
import { getContrastTextColor } from "@/utils/color";

export const PRESET_COLORS = [
  { name: "Rose", hex: "#e11d48" },
  { name: "Orange", hex: "#f97316" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Lime", hex: "#65a30d" },
  { name: "Green", hex: "#16a34a" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Cyan", hex: "#0891b2" },
  { name: "Sky", hex: "#0ea5e9" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Indigo", hex: "#4338ca" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Fuchsia", hex: "#c026d3" },
  { name: "Pink", hex: "#db2777" },
];

interface ColorPickerPopoverProps {
  currentColor?: string;
  onSelectColor: (hex: string) => void;
  isOpen: boolean;
  onClose: () => void;
  placement?: "top" | "bottom";
}

export function ColorPickerPopover({
  currentColor,
  onSelectColor,
  isOpen,
  onClose,
  placement = "top",
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

  const positionClasses =
    placement === "bottom"
      ? "top-full mt-2"
      : "bottom-full mb-2";

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      className={`absolute left-0 ${positionClasses} w-49 max-h-[min(380px,calc(100vh-120px))] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2.5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none`}
    >
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Palette size={14} />
          <span>Color</span>
        </span>
        {currentColor && (
          <span className="font-mono text-[11px] uppercase text-gray-400 dark:text-zinc-500">
            {currentColor}
          </span>
        )}
      </div>

      {/* Preset Swatches Grid */}
      <div className="grid grid-cols-5 gap-2 justify-items-center">
        {PRESET_COLORS.map((c) => {
          const isSelected =
            currentColor?.toLowerCase() === c.hex.toLowerCase();
          const checkColor = getContrastTextColor(c.hex);

          return (
            <button
              key={c.hex}
              type="button"
              onClick={() => {
                onSelectColor(c.hex);
                onClose();
              }}
              title={c.name}
              className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-black/10 shadow-xs transition-transform hover:scale-110 active:scale-95 cursor-pointer dark:border-white/10"
              style={{ backgroundColor: c.hex }}
            >
              {isSelected && (
                <Check
                  size={13}
                  style={{ color: checkColor }}
                  className="stroke-3"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Custom Color Native Picker */}
      <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between px-1">
        <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono">Custom</span>
        <label className="relative flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity">
          <span
            className="h-4 w-4 rounded-md border border-black/15 shadow-xs"
            style={{ backgroundColor: currentColor || "#f97316" }}
          />
          <input
            type="color"
            value={currentColor || "#f97316"}
            onChange={(e) => onSelectColor(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <span className="text-xs font-mono text-gray-600 dark:text-zinc-300">Pick</span>
        </label>
      </div>
    </div>
  );
}
