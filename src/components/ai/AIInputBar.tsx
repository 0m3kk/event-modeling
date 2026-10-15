/** Prompt input bar for the AI panel: textarea + retry/stop/send controls. */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Send, Square } from "lucide-react";

/** Max height (px) the prompt textarea grows to before it starts scrolling. */
const MAX_INPUT_HEIGHT = 220;

export interface AIInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onRetry: () => void;
  onStop: () => void;
  isLoading: boolean;
  canRetry: boolean;
  placeholder: string;
}

export function AIInputBar({
  value,
  onChange,
  onSend,
  onRetry,
  onStop,
  isLoading,
  canRetry,
  placeholder,
}: AIInputBarProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();

  // Grow the prompt box with its content, up to a cap where it starts scrolling.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [value]);

  return (
    <div className="border-t border-gray-200 p-3 dark:border-zinc-800">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="flex items-end gap-2"
      >
        <textarea
          ref={inputRef}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline. Skip while an IME
            // (e.g. Vietnamese) is composing so candidates don't submit.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          className="flex-1 resize-none overflow-y-auto rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-xs leading-relaxed outline-none focus:border-purple-500 dark:border-zinc-700 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={onRetry}
          disabled={!canRetry || isLoading}
          title={t("ai.retry")}
          className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
        >
          <RotateCcw size={15} />
        </button>
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            title={t("ai.stop")}
            aria-label={t("ai.stop")}
            className="rounded-xl bg-red-600 p-2 text-white hover:bg-red-700 cursor-pointer"
          >
            <Square size={15} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-xl bg-purple-600 p-2 text-white hover:bg-purple-700 disabled:opacity-40 cursor-pointer"
          >
            <Send size={15} />
          </button>
        )}
      </form>
    </div>
  );
}
