import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useCanvasStore } from "@/store";
import type { CanvasObject } from "@/types";
import { STORM_KIND_LABELS } from "@/constants/storm";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";

interface SearchMatch {
  object: CanvasObject;
  label: string;
  detail: string;
}

function getObjectSearchableItems(
  obj: CanvasObject,
): { label: string; detail: string }[] {
  const items: { label: string; detail: string }[] = [];

  if (obj.text) {
    items.push({
      label: obj.text,
      detail: obj.type === "stickyNote" ? "Sticky Note" : "Text",
    });
  }

  if (obj.modelData) {
    const md = obj.modelData;
    if (md.name) items.push({ label: md.name, detail: `Model ${md.kind}` });
    if (md.itemType) items.push({ label: md.itemType, detail: "Array Type" });
    if (md.innerType) items.push({ label: md.innerType, detail: "Wrap Type" });
    md.fields?.forEach((f) => {
      if (f.name)
        items.push({
          label: f.name,
          detail: `Field: ${f.fieldType || "type"}`,
        });
      if (f.fieldType)
        items.push({ label: f.fieldType, detail: `Type in ${md.name}` });
    });
    md.values?.forEach((v) => {
      if (v.value || v.name)
        items.push({ label: v.value || v.name, detail: `Enum: ${md.name}` });
    });
  }

  if (obj.stormData) {
    const sd = obj.stormData;
    if (sd.name)
      items.push({
        label: sd.name,
        detail: STORM_KIND_LABELS[sd.kind] ?? sd.kind,
      });
    if (sd.action)
      items.push({ label: sd.action, detail: `Action in ${sd.name}` });
    sd.permissions?.forEach((p) => {
      items.push({ label: p, detail: `Permission in ${sd.name}` });
    });
    sd.fields.forEach((f) => {
      if (f.name) items.push({ label: f.name, detail: `Field in ${sd.name}` });
      if (f.fieldType)
        items.push({ label: f.fieldType, detail: `Type in ${sd.name}` });
      if (f.tag) items.push({ label: f.tag, detail: `Tag in ${sd.name}` });
    });
    sd.inputFields?.forEach((f) => {
      if (f.name)
        items.push({ label: f.name, detail: `Input Param in ${sd.name}` });
      if (f.fieldType)
        items.push({ label: f.fieldType, detail: `Param Type in ${sd.name}` });
      if (f.tag) items.push({ label: f.tag, detail: `Input Tag in ${sd.name}` });
    });
    sd.outputFields?.forEach((f) => {
      if (f.name)
        items.push({ label: f.name, detail: `Output Field in ${sd.name}` });
      if (f.fieldType)
        items.push({ label: f.fieldType, detail: `Output Type in ${sd.name}` });
    });
    sd.responseFields?.forEach((f) => {
      if (f.name)
        items.push({ label: f.name, detail: `Response Field in ${sd.name}` });
      if (f.fieldType)
        items.push({
          label: f.fieldType,
          detail: `Response Type in ${sd.name}`,
        });
    });
    sd.constraints?.forEach((c) => {
      if (c.text) items.push({ label: c.text, detail: `Rule in ${sd.name}` });
    });
    sd.queryItems?.forEach((q) => {
      q.types.forEach((t) =>
        items.push({ label: t, detail: `Query Event in ${sd.name}` }),
      );
    });
  }

  return items;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const objects = useCanvasStore((s) => s.objects);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);

  const [query, setQuery] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      setQuery("");
      setCurrentIndex(0);
    }
  }, [isOpen]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: SearchMatch[] = [];

    // Search objects
    for (const obj of objects) {
      const items = getObjectSearchableItems(obj);
      for (const item of items) {
        if (
          item.label.toLowerCase().includes(q) ||
          item.detail.toLowerCase().includes(q)
        ) {
          results.push({
            object: obj,
            label: item.label,
            detail: item.detail,
          });
          break; // One match per object
        }
      }
    }

    return results;
  }, [objects, query]);

  const focusMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const target = matches[index];
      if (!target) return;

      const obj = target.object;
      setSelectedIds([obj.id]);

      const container = document.getElementById("canvas-container");
      const cWidth = container ? container.clientWidth : 1000;
      const cHeight = container ? container.clientHeight : 700;

      // Center viewport on card
      const targetZoom = 1;
      const targetX = obj.x + obj.width / 2 - cWidth / (2 * targetZoom);
      const targetY = obj.y + obj.height / 2 - cHeight / (2 * targetZoom);

      setViewport({
        x: targetX,
        y: targetY,
        zoom: targetZoom,
      });
    },
    [matches, setSelectedIds, setViewport],
  );

  const handleNext = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentIndex + 1) % matches.length;
    setCurrentIndex(nextIdx);
    focusMatch(nextIdx);
  };

  const handlePrev = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prevIdx);
    focusMatch(prevIdx);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrev();
      } else {
        handleNext();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-gray-200/90 bg-white/95 px-3.5 py-2 shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Search size={16} className="text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrentIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search cards, fields, tags, rules..."
          className="w-64 text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
        />
      </div>

      {query && (
        <span className="font-mono text-xs text-gray-400">
          {matches.length === 0
            ? "0 of 0"
            : `${currentIndex + 1} of ${matches.length}`}
        </span>
      )}

      <div className="flex items-center gap-0.5">
        <button
          onClick={handlePrev}
          disabled={matches.length === 0}
          title="Previous (Shift+Enter)"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronUp size={15} />
        </button>
        <button
          onClick={handleNext}
          disabled={matches.length === 0}
          title="Next (Enter)"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      <div className="h-4 w-px bg-gray-200" />

      <button
        onClick={onClose}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <X size={15} />
      </button>
    </div>
  );
}
