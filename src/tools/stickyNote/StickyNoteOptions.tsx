import { useState } from "react";
import { Type } from "lucide-react";
import type { CanvasElement } from "@/types";
import type { StickyNoteData } from "./index";

interface StickyNoteOptionsProps {
  element: CanvasElement<StickyNoteData>;
  onUpdate: (partial: Partial<StickyNoteData>) => void;
}

export function StickyNoteOptions({ element, onUpdate }: StickyNoteOptionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(element.data.text || "");

  const handleSave = () => {
    setIsEditing(false);
    if (value !== element.data.text) {
      onUpdate({ text: value });
    }
  };

  return (
    <div className="flex items-center gap-1">
      {isEditing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="flex items-center gap-1"
        >
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsEditing(false);
            }}
            className="w-32 rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </form>
      ) : (
        <button
          onClick={() => {
            setValue(element.data.text || "");
            setIsEditing(true);
          }}
          title="Edit Text"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <Type size={13} />
          <span>Edit</span>
        </button>
      )}
    </div>
  );
}
