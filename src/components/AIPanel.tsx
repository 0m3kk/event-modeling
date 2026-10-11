import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Settings,
  Wrench,
  Check,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import {
  getStoredAISettings,
  storeAISettings,
  type AISettings,
  type ChatMessage,
} from "@/ai/client";
import { runAgentConversation } from "@/ai/agent";

export function AIPanel() {
  const { t } = useTranslation();
  const isOpen = useCanvasStore((s) => s.isAIPanelOpen);
  const setOpen = useCanvasStore((s) => s.setAIPanelOpen);

  const [settings, setSettings] = useState<AISettings>(getStoredAISettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settings form state
  const [apiKeyInput, setApiKeyInput] = useState(settings.apiKey || "");
  const [baseUrlInput, setBaseUrlInput] = useState(settings.baseUrl);
  const [modelInput, setModelInput] = useState(settings.model);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Panel Width Resizing
  const [panelWidth, setPanelWidth] = useState(380);
  const isResizingRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const newWidth = Math.max(300, Math.min(700, window.innerWidth - e.clientX));
    setPanelWidth(newWidth);
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const handleSaveSettings = () => {
    const updated: AISettings = {
      ...settings,
      apiKey: apiKeyInput.trim() || null,
      baseUrl: baseUrlInput.trim() || "https://api.openai.com/v1",
      model: modelInput.trim() || "gpt-4o-mini",
    };
    setSettings(updated);
    storeAISettings(updated);
    setIsSettingsOpen(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    if (!settings.apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };

    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);
    setInput("");
    setIsLoading(true);

    try {
      const assistantId = `assistant-${Date.now()}`;
      const finalReply = await runAgentConversation(settings, nextHistory, {
        onToolCall: (name, args) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `tool-${Date.now()}`,
              role: "assistant",
              content: `Executing ${name}...`,
              toolName: name,
            },
          ]);
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: finalReply,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ Error: ${err.message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      style={{ width: `${panelWidth}px` }}
      className="absolute right-0 top-14 bottom-0 z-20 flex flex-col border-l border-gray-200/80 bg-white/95 backdrop-blur-md shadow-2xl dark:border-zinc-800/80 dark:bg-zinc-900/95"
    >
      {/* Drag handle to resize panel */}
      <div
        onMouseDown={handleStartResize}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-30"
      />

      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4 dark:border-zinc-800">
        <div className="flex items-center gap-2 font-medium text-sm text-purple-700 dark:text-purple-400">
          <Sparkles size={16} />
          <span>{t("ai.title")}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Settings Modal Overlay */}
      {isSettingsOpen ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <h3 className="font-semibold text-sm">{t("ai.settings")}</h3>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t("ai.apiKey")}</label>
            <input
              type="password"
              placeholder="sk-..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-purple-500 dark:border-zinc-700"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t("ai.baseUrl")}</label>
            <input
              type="text"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-purple-500 dark:border-zinc-700"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t("ai.model")}</label>
            <input
              type="text"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-purple-500 dark:border-zinc-700"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSaveSettings}
              className="flex-1 rounded-lg bg-purple-600 py-1.5 text-xs font-medium text-white hover:bg-purple-700 cursor-pointer"
            >
              {t("ai.saveSettings")}
            </button>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100 dark:border-zinc-700 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Chat Messages List */
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-400 dark:text-zinc-500 space-y-2">
              <Sparkles size={28} className="text-purple-400" />
              <p className="text-xs">{t("ai.placeholder")}</p>
              <div className="text-[11px] text-gray-400">
                Gợi ý: "Tạo 1 event OrderPlaced với field id, amount"
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
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
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input Bar */}
      {!isSettingsOpen && (
        <div className="border-t border-gray-200 p-3 dark:border-zinc-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("ai.placeholder")}
              className="flex-1 rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-xs outline-none focus:border-purple-500 dark:border-zinc-700 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="rounded-xl bg-purple-600 p-2 text-white hover:bg-purple-700 disabled:opacity-40 cursor-pointer"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
