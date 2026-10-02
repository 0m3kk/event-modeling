import { useState, useMemo } from "react";
import { useCanvasStore } from "@/store";
import type { LineStyle } from "@/types";
import { Lock, Unlock, FolderMinus, Edit2, Check } from "lucide-react";

const GROUP_STROKE_COLORS = [
  "#6366f1", // Indigo
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#6b7280", // Gray
];

/** Small line-preview glyph so the border style reads without a text label. */
function LineStyleIcon({ style }: { style: LineStyle }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <line
        x1="2"
        y1="9"
        x2="16"
        y2="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap={style === "dotted" ? "round" : "butt"}
        strokeDasharray={
          style === "dashed" ? "4 3" : style === "dotted" ? "0.5 3" : undefined
        }
      />
    </svg>
  );
}

export function GroupOptionsBar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const groups = useCanvasStore((s) => s.groups);
  const viewport = useCanvasStore((s) => s.viewport);
  const updateGroup = useCanvasStore((s) => s.updateGroup);
  const ungroupObjects = useCanvasStore((s) => s.ungroupObjects);
  const isLocked = useCanvasStore((s) => s.isLocked);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const selectedGroup = useMemo(() => {
    if (selectedIds.length !== 1 || isLocked) return null;
    const sel = selectedIds[0];
    const groupId = sel.startsWith("__group:")
      ? sel.replace("__group:", "")
      : sel;
    return groups.find((g) => g.id === groupId) || null;
  }, [selectedIds, groups, isLocked]);

  if (!selectedGroup || !selectedGroup.customBounds || isDragging) return null;

  const bounds = selectedGroup.customBounds;
  const zoom = viewport.zoom;
  const screenX = (bounds.x - viewport.x) * zoom;
  const screenY = (bounds.y - viewport.y) * zoom;
  const groupWidth = bounds.width * zoom;
  const groupHeight = bounds.height * zoom;

  const barScale = Math.max(0.35, Math.min(2.0, zoom));

  const barX = screenX + groupWidth / 2;
  const isAbove = screenY >= 48 * barScale + 10;
  const barY = isAbove ? screenY - 10 : screenY + groupHeight + 10;

  const handleStartRename = () => {
    setNameInput(selectedGroup.name);
    setIsEditingName(true);
  };

  const handleCommitRename = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== selectedGroup.name) {
      updateGroup(selectedGroup.id, { name: trimmed });
    }
    setIsEditingName(false);
  };

  const handleColorChange = (color: string) => {
    updateGroup(selectedGroup.id, { stroke: color, tagColor: color });
  };

  const handleLineStyleChange = (lineStyle: LineStyle) => {
    updateGroup(selectedGroup.id, { lineStyle });
  };

  const handleToggleLock = () => {
    updateGroup(selectedGroup.id, { locked: !selectedGroup.locked });
  };

  const handleUngroup = () => {
    ungroupObjects([`__group:${selectedGroup.id}`]);
  };

  return (
    <div
      className={`pointer-events-none absolute z-40 -translate-x-1/2 ${
        isAbove ? "-translate-y-full" : ""
      }`}
      style={{
        left: barX,
        top: barY,
      }}
    >
      <div
        className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-gray-200/90 dark:border-zinc-800/90 bg-white/95 dark:bg-zinc-900/95 px-3.5 py-2 shadow-2xl backdrop-blur-md select-none"
        style={{
          zoom: barScale,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
      {/* Name / Rename Input */}
      {isEditingName ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCommitRename();
              if (e.key === "Escape") setIsEditingName(false);
            }}
            autoFocus
            className="w-32 rounded border border-blue-500 bg-white dark:bg-zinc-800 px-2 py-0.5 text-xs text-gray-800 dark:text-zinc-100 focus:outline-none"
          />
          <button
            onClick={handleCommitRename}
            className="rounded p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
          >
            <Check size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={handleStartRename}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 cursor-pointer"
          title={`Rename Group: ${selectedGroup.name}`}
        >
          <Edit2 size={16} />
        </button>
      )}

      <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />

      {/* Border Color Swatches */}
      <div className="flex items-center gap-1">
        {GROUP_STROKE_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => handleColorChange(color)}
            className={`h-5 w-5 rounded-full border border-black/10 transition-transform cursor-pointer ${
              selectedGroup.stroke === color
                ? "scale-125 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-900"
                : "hover:scale-110"
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />

      {/* Border Style (Solid / Dashed / Dotted) */}
      <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 dark:bg-zinc-800 p-0.5">
        {(["solid", "dashed", "dotted"] as LineStyle[]).map((style) => (
          <button
            key={style}
            onClick={() => handleLineStyleChange(style)}
            title={`${style[0].toUpperCase()}${style.slice(1)} border`}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-all cursor-pointer ${
              selectedGroup.lineStyle === style
                ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-xs"
                : "text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200"
            }`}
          >
            <LineStyleIcon style={style} />
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />

      {/* Toggle Lock */}
      <button
        onClick={handleToggleLock}
        title={selectedGroup.locked ? "Unlock Group" : "Lock Group"}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${
          selectedGroup.locked
            ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
            : "text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-800 dark:hover:text-zinc-200"
        }`}
      >
        {selectedGroup.locked ? <Lock size={15} /> : <Unlock size={15} />}
      </button>

      {/* Ungroup Button */}
      <button
        onClick={handleUngroup}
        title="Ungroup (Cmd+Shift+G)"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
      >
        <FolderMinus size={16} />
      </button>
    </div>
    </div>
  );
}
