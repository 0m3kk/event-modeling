import { useLayoutEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/store";

export function InlineTextEditor() {
  const inlineEdit = useCanvasStore((s) => s.inlineEdit);
  const setInlineEdit = useCanvasStore((s) => s.setInlineEdit);
  const viewport = useCanvasStore((s) => s.viewport);

  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isCommittedRef = useRef(false);

  // Sync before the browser paints, so switching the edit target (e.g. double
  // clicking another field) never flashes the previous field's text first.
  useLayoutEffect(() => {
    if (inlineEdit) {
      setValue(inlineEdit.initialValue || "");
      isCommittedRef.current = false;
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 15);
      return () => clearTimeout(timer);
    }
  }, [inlineEdit]);

  if (!inlineEdit) return null;

  const zoom = viewport.zoom || 1;
  const screenX = inlineEdit.worldBounds.x * zoom + viewport.x;
  const screenY = inlineEdit.worldBounds.y * zoom + viewport.y;
  const screenW = Math.max(70, inlineEdit.worldBounds.width * zoom);
  const screenH = Math.max(22, inlineEdit.worldBounds.height * zoom);

  const commit = () => {
    if (isCommittedRef.current) return;
    isCommittedRef.current = true;
    inlineEdit.onCommit(value);
    setInlineEdit(null);
  };

  const cancel = () => {
    isCommittedRef.current = true;
    setInlineEdit(null);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === "Enter" && (!inlineEdit.multiline || !e.shiftKey)) {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div
      className="pointer-events-auto absolute z-50 select-none"
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        width: `${screenW}px`,
        height: `${screenH}px`,
      }}
    >
      {inlineEdit.multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="h-full w-full resize-none rounded-md border-2 border-blue-500 bg-white/95 dark:bg-zinc-900/95 px-1.5 py-0.5 font-mono text-xs text-gray-900 dark:text-zinc-100 shadow-xl outline-none"
          style={{
            fontSize: `${Math.max(11, Math.round(12 * zoom))}px`,
            // Scale the line box with the (zoomed) font so wrapped lines still
            // fit inside the editor instead of triggering a scrollbar.
            lineHeight: 1.25,
          }}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="h-full w-full rounded-md border-2 border-blue-500 bg-white/95 dark:bg-zinc-900/95 px-1.5 font-mono text-xs text-gray-900 dark:text-zinc-100 shadow-xl outline-none"
          style={{
            fontSize: `${Math.max(11, Math.round(12 * zoom))}px`,
          }}
        />
      )}
    </div>
  );
}
