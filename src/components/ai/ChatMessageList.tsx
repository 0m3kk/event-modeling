/** Scrollable message list for the AI panel (presentational). */
import { Loader2, Sparkles, Wrench } from "lucide-react";
import type { RefObject } from "react";
import type { ChatMessage } from "@/ai/client";

export interface ChatMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  /** Hint shown when the conversation is empty. */
  emptyHint: string;
  /** Sentinels the list scrolls into view when the transcript grows. */
  endRef: RefObject<HTMLDivElement | null>;
}

export function ChatMessageList({ messages, isLoading, emptyHint, endRef }: ChatMessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center text-gray-400 dark:text-zinc-500 space-y-2">
          <Sparkles size={28} className="text-purple-400" />
          <p className="text-xs">{emptyHint}</p>
        </div>
      ) : (
        messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            {m.toolName ? (
              <div className="flex items-center gap-1.5 rounded-md bg-purple-50 px-2 py-1 text-[11px] font-mono text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                <Wrench size={12} />
                <span>{m.content}</span>
              </div>
            ) : (
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-200"
                }`}
              >
                {m.content}
              </div>
            )}
          </div>
        ))
      )}
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={14} className="animate-spin text-purple-500" />
          <span>AI is thinking...</span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
