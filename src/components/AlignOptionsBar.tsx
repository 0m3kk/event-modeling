import { useMemo } from "react";
import { useCanvasStore } from "@/store";
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Columns3,
} from "lucide-react";
import type { AlignDirection } from "@/utils/align";

export function AlignOptionsBar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const objects = useCanvasStore((s) => s.objects);
  const viewport = useCanvasStore((s) => s.viewport);
  const alignObjects = useCanvasStore((s) => s.alignObjects);
  const distributeObjects = useCanvasStore((s) => s.distributeObjects);
  const arrangeLanes = useCanvasStore((s) => s.arrangeLanes);
  const isLocked = useCanvasStore((s) => s.isLocked);
  const isDragging = useCanvasStore((s) => s.isDragging);

  const selectedCards = useMemo(() => {
    if (selectedIds.length < 2 || isLocked) return [];
    return objects.filter(
      (o) => selectedIds.includes(o.id) && o.type !== "connector" && !o.locked,
    );
  }, [selectedIds, objects, isLocked]);

  if (selectedCards.length < 2 || isDragging) return null;

  const canDistribute = selectedCards.length >= 3;

  // Compute selection bounds for screen position
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of selectedCards) {
    minX = Math.min(minX, obj.x);
    minY = Math.min(minY, obj.y);
    maxX = Math.max(maxX, obj.x + obj.width);
    maxY = Math.max(maxY, obj.y + obj.height);
  }

  const zoom = viewport.zoom;
  const barScale = Math.max(0.35, Math.min(2.0, zoom));
  const centerX = (minX + maxX) / 2;
  const screenX = (centerX - viewport.x) * zoom;
  const screenMinY = (minY - viewport.y) * zoom;
  const screenMaxY = (maxY - viewport.y) * zoom;
  const isAbove = screenMinY >= 48 * barScale + 10;
  const barY = isAbove ? screenMinY - 10 : screenMaxY + 10;

  const alignButtons: {
    direction: AlignDirection;
    icon: React.ReactNode;
    title: string;
  }[] = [
    {
      direction: "left",
      icon: <AlignStartVertical size={16} />,
      title: "Align left",
    },
    {
      direction: "centerX",
      icon: <AlignCenterVertical size={16} />,
      title: "Align center",
    },
    {
      direction: "right",
      icon: <AlignEndVertical size={16} />,
      title: "Align right",
    },
    {
      direction: "top",
      icon: <AlignStartHorizontal size={16} />,
      title: "Align top",
    },
    {
      direction: "centerY",
      icon: <AlignCenterHorizontal size={16} />,
      title: "Align middle",
    },
    {
      direction: "bottom",
      icon: <AlignEndHorizontal size={16} />,
      title: "Align bottom",
    },
  ];

  return (
    <div
      className={`pointer-events-none absolute z-40 -translate-x-1/2 ${
        isAbove ? "-translate-y-full" : ""
      }`}
      style={{
        left: screenX,
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
      {/* Horizontal Alignment */}
      <div className="flex items-center gap-0.5">
        {alignButtons.slice(0, 3).map(({ direction, icon, title }) => (
          <button
            key={direction}
            onClick={() => alignObjects(direction)}
            title={title}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 active:scale-95 cursor-pointer"
          >
            {icon}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />

      {/* Vertical Alignment */}
      <div className="flex items-center gap-0.5">
        {alignButtons.slice(3, 6).map(({ direction, icon, title }) => (
          <button
            key={direction}
            onClick={() => alignObjects(direction)}
            title={title}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 active:scale-95 cursor-pointer"
          >
            {icon}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />

      {/* Distribution (Horizontal / Vertical) */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => distributeObjects("horizontal")}
          disabled={!canDistribute}
          title={
            canDistribute
              ? "Distribute horizontally"
              : "Select 3+ objects to distribute"
          }
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
        >
          <AlignHorizontalDistributeCenter size={16} />
        </button>
        <button
          onClick={() => distributeObjects("vertical")}
          disabled={!canDistribute}
          title={
            canDistribute
              ? "Distribute vertically"
              : "Select 3+ objects to distribute"
          }
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
        >
          <AlignVerticalDistributeCenter size={16} />
        </button>
      </div>

      <div className="h-5 w-px bg-gray-200 dark:bg-zinc-700" />

      {/* Arrange Storm Lanes Button */}
      <button
        onClick={() => arrangeLanes()}
        title="Arrange Storm Lanes (Actor → Command → Event → External → Query → State → Constraint)"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200/80 dark:border-indigo-800/80 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 active:scale-95 cursor-pointer"
      >
        <Columns3 size={16} className="text-indigo-600 dark:text-indigo-400" />
      </button>
    </div>
    </div>
  );
}
