import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "@/tools";

export function SearchModal() {
  const isOpen = useCanvasStore((s) => s.isSearchOpen);
  const setOpen = useCanvasStore((s) => s.setSearchOpen);
  const elements = useCanvasStore((s) => s.elements);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = elements.filter((el) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    if (el.id.toLowerCase().includes(q)) return true;
    if (el.type.toLowerCase().includes(q)) return true;
    const name = (el.data as any)?.name || (el.data as any)?.text || "";
    return String(name).toLowerCase().includes(q);
  });

  const handleSelect = (el: (typeof elements)[0]) => {
    setSelectedIds([el.id]);

    // Center viewport on selected element
    const zoom = viewport.zoom || 1;
    const centerX = el.x + el.width / 2;
    const centerY = el.y + el.height / 2;
    const nextX = (viewport.screenWidth || 800) / 2 - centerX * zoom;
    const nextY = (viewport.screenHeight || 600) / 2 - centerY * zoom;

    setViewport({ x: nextX, y: nextY });
    setOpen(false);
  };

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-xs p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        {/* Search Input */}
        <div className="flex items-center gap-2.5 border-b border-gray-100 pb-2.5 dark:border-zinc-800">
          <Search size={18} className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search elements by name, type, or ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && filtered.length > 0) handleSelect(filtered[0]);
            }}
            className="flex-1 bg-transparent text-sm outline-none dark:text-zinc-100 placeholder:text-gray-400"
          />
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto py-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">
              No matching elements found.
            </div>
          ) : (
            filtered.map((el) => {
              const tool = toolRegistry.get(el.type);
              const Icon = tool?.icon;
              const title = (el.data as any)?.name || (el.data as any)?.text || el.id;
              return (
                <div
                  key={el.id}
                  onClick={() => handleSelect(el)}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {Icon ? (
                      <span style={{ color: tool?.color }}>
                        <Icon size={16} />
                      </span>
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    )}
                    <span className="font-medium text-gray-800 dark:text-zinc-200">
                      {title}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      ({el.type})
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">
                    x: {Math.round(el.x)}, y: {Math.round(el.y)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
