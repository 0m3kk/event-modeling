import { useState } from "react";
import { Check, Tag as TagIcon } from "lucide-react";

interface DomainChipProps {
  /** Current domain value; empty/undefined renders the inactive "Domain" chip. */
  value?: string;
  /** Called with the trimmed value (empty string clears the domain). */
  onCommit: (value: string) => void;
}

/**
 * Inline domain editor shared by the storm and model options bars. Mirrors the
 * domain chip in the group options bar: a Tag chip that expands into a text
 * input on click. The element's domain labels it for grouping/export and is
 * distinct from the slice/group domain.
 */
export function DomainChip({ value, onCommit }: DomainChipProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [input, setInput] = useState("");

  const handleStart = () => {
    setInput(value || "");
    setIsEditing(true);
  };

  const handleCommit = () => {
    const trimmed = input.trim();
    if (trimmed !== (value || "")) {
      onCommit(trimmed);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCommit();
            if (e.key === "Escape") setIsEditing(false);
          }}
          autoFocus
          placeholder="Domain (e.g. Order)"
          className="w-28 rounded border border-blue-500 bg-white dark:bg-zinc-800 px-2 py-0.5 text-xs text-gray-800 dark:text-zinc-100 focus:outline-none"
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCommit}
          className="rounded p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
        >
          <Check size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleStart}
      className={`flex h-8 items-center gap-1.5 px-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
        value
          ? "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
          : "text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-800 dark:hover:text-zinc-200"
      }`}
      title={value ? `Domain: ${value}` : "Set Domain (group elements by domain)"}
    >
      <TagIcon size={13} />
      <span>{value || "Domain"}</span>
    </button>
  );
}
