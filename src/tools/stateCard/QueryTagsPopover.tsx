import { useEffect, useRef, useState } from "react";
import { Hash, Tag as TagIcon, Trash2, X } from "lucide-react";
import type { BoardTagInfo } from "@/utils/eventTags";
import { fieldTypeKey } from "@/utils/eventTags";
import type { QueryTag, StateField } from "./rules";

interface QueryTagsPopoverProps {
  /** Current tag references of the query item. */
  tags: QueryTag[];
  /** Param fields of the State card (the only valid `field` source). */
  params: StateField[];
  /** Tags already attached to event fields on the board. */
  boardTags: BoardTagInfo[];
  onChange: (tags: QueryTag[]) => void;
  isOpen: boolean;
  onClose: () => void;
  placement?: "top" | "bottom";
}

/**
 * QueryTagsPopover — attaches DCB tags to a query item.
 *
 * A tag is a `(tag, field)` pair rendered as `tag:{field}`: `tag` must be a tag
 * already attached to an event field on the board, and `field` must be a param
 * of this card whose type matches that tagged event field's type. Only matching
 * param fields are offered, so an invalid pair can never be created here.
 */
export function QueryTagsPopover({
  tags,
  params,
  boardTags,
  onChange,
  isOpen,
  onClose,
  placement = "top",
}: QueryTagsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pendingTag, setPendingTag] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setPendingTag(null);
  }, [isOpen]);

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

  const positionClasses = placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2";

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const addTag = (tag: string, field: string) => {
    if (tags.some((t) => t.tag === tag && t.field === field)) return;
    onChange([...tags, { tag, field }]);
    setPendingTag(null);
  };

  const selectedBoardTag = pendingTag ? boardTags.find((b) => b.tag === pendingTag) : null;
  const matchingFields = selectedBoardTag
    ? params.filter((p) => selectedBoardTag.types.includes(fieldTypeKey(p)))
    : [];

  return (
    <div
      ref={popoverRef}
      onWheel={(e) => e.stopPropagation()}
      className={`absolute left-0 ${positionClasses} w-[280px] max-h-[min(420px,calc(100vh-120px))] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 z-50 select-none`}
    >
      <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-semibold text-gray-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <TagIcon size={13} className="text-amber-500 fill-amber-500" />
          <span>Query Tags (DCB)</span>
        </span>
        <span className="text-[11px] font-normal text-gray-400 dark:text-zinc-500">
          {tags.length > 0 ? `${tags.length}` : "none"}
        </span>
      </div>

      <div className="mb-2.5 text-[11px] leading-tight text-gray-400 dark:text-zinc-500">
        Rendered as <span className="font-mono">tag:{"{field}"}</span>. Field type must match the tagged event
        field.
      </div>

      {/* Current tags */}
      {tags.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <span
              key={`${t.tag}:${t.field}`}
              className="flex items-center gap-1 rounded-md border border-amber-200/80 bg-amber-50/70 px-2 py-0.5 text-[11px] font-mono text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400"
            >
              #{t.tag}:{"{"}{t.field}{"}"}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="cursor-pointer text-amber-600/70 hover:text-red-500 dark:text-amber-400/70"
                title="Remove"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {params.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-[11px] text-gray-400 dark:border-zinc-700 dark:text-zinc-500">
          Add a param field first — every tag maps to a param.
        </div>
      ) : boardTags.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-[11px] text-gray-400 dark:border-zinc-700 dark:text-zinc-500">
          No event tags on the board yet. Attach a tag to an event field first.
        </div>
      ) : (
        <>
          {/* Step 1: pick tag name */}
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
            1. Tag name
          </div>
          <div className="flex flex-wrap gap-1">
            {boardTags.map((b) => (
              <button
                key={b.tag}
                type="button"
                onClick={() => setPendingTag(b.tag === pendingTag ? null : b.tag)}
                title={`${b.types.join(" | ")}${b.fromEvents.length ? ` — ${b.fromEvents.join(", ")}` : ""}`}
                className={`flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[11px] font-mono cursor-pointer transition-colors ${
                  b.tag === pendingTag
                    ? "border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "border-amber-200/80 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950"
                }`}
              >
                <Hash size={10} className="text-amber-500" />
                <span>{b.tag}</span>
                <span className="ml-1 text-[9px] text-amber-600/70 dark:text-amber-400/60">
                  {b.types.join("|")}
                </span>
              </button>
            ))}
          </div>

          {/* Step 2: pick matching param field */}
          {selectedBoardTag && (
            <div className="mt-2.5 border-t border-gray-100 pt-2 dark:border-zinc-800">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                2. Param field ({selectedBoardTag.types.join(" | ")})
              </div>
              {matchingFields.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {matchingFields.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => addTag(selectedBoardTag.tag, p.name)}
                      className="rounded-md border border-gray-200 bg-gray-50/60 px-2 py-0.5 text-[11px] font-mono text-gray-600 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-gray-400 dark:text-zinc-500">
                  No param with a matching type. Add one to <span className="font-mono">params</span> first.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tags.length > 0 && (
        <div className="mt-2.5 border-t border-gray-100 pt-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <Trash2 size={12} />
            <span>Remove all tags</span>
          </button>
        </div>
      )}
    </div>
  );
}
