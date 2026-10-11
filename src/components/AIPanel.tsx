import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Settings,
  Wrench,
  RotateCcw,
  MessageSquarePlus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import {
  getStoredAISettings,
  storeAISettings,
  createSessionId,
  DEFAULT_AI_SETTINGS,
  type AISettings,
  type ChatMessage,
} from "@/ai/client";
import { runAgentConversation } from "@/ai/agent";

const AI_PANEL_WIDTH_STORAGE_KEY = "event_modeling_ai_panel_width";
const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 700;
const DEFAULT_PANEL_WIDTH = 380;

/** Restores the panel width from the last session, clamped to sane bounds. */
function getStoredPanelWidth(): number {
  try {
    const raw = localStorage.getItem(AI_PANEL_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, parsed));
    }
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
  return DEFAULT_PANEL_WIDTH;
}

/** Parses a positive integer from a settings text field, falling back when blank/invalid. */
function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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
  const [maxTokensInput, setMaxTokensInput] = useState(String(settings.maxTokens));
  const [maxTurnsInput, setMaxTurnsInput] = useState(String(settings.maxTurns));

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");

  // Panel Width Resizing (persisted across sessions)
  const [panelWidth, setPanelWidth] = useState(getStoredPanelWidth);
  const isResizingRef = useRef(false);
  const panelWidthRef = useRef(panelWidth);

  // The history snapshot for the most recent turn, used by retry.
  const lastTurnRef = useRef<ChatMessage[] | null>(null);

  // Incremented whenever a new session starts; stale in-flight replies whose
  // captured id no longer matches are discarded instead of polluting the new chat.
  const sessionIdRef = useRef(0);

  // Stable id sent to the opencode gateway as `x-opencode-session`, shared by
  // every turn of the current chat and refreshed when a new chat starts.
  const opencodeSessionRef = useRef<string>(createSessionId());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Start a fresh chat session, dropping any pending reply from the old one.
  const handleNewSession = () => {
    sessionIdRef.current += 1;
    opencodeSessionRef.current = createSessionId();
    lastTurnRef.current = null;
    setMessages([]);
    setInput("");
    setLastPrompt("");
    setIsLoading(false);
    setIsSettingsOpen(false);
  };

  // Keep the shortcut handler stable while always invoking the latest closure.
  const newSessionRef = useRef(handleNewSession);
  newSessionRef.current = handleNewSession;

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === "KeyN") {
        e.preventDefault();
        newSessionRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const newWidth = Math.max(
      MIN_PANEL_WIDTH,
      Math.min(MAX_PANEL_WIDTH, window.innerWidth - e.clientX),
    );
    panelWidthRef.current = newWidth;
    setPanelWidth(newWidth);
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    try {
      localStorage.setItem(
        AI_PANEL_WIDTH_STORAGE_KEY,
        String(panelWidthRef.current),
      );
    } catch {
      // Ignore storage errors
    }
  };

  const handleSaveSettings = () => {
    const updated: AISettings = {
      ...settings,
      apiKey: apiKeyInput.trim() || null,
      baseUrl: baseUrlInput.trim() || "https://api.openai.com/v1",
      model: modelInput.trim() || "gpt-4o-mini",
      maxTokens: parsePositiveInt(maxTokensInput, DEFAULT_AI_SETTINGS.maxTokens),
      maxTurns: parsePositiveInt(maxTurnsInput, DEFAULT_AI_SETTINGS.maxTurns),
    };
    setSettings(updated);
    storeAISettings(updated);
    setIsSettingsOpen(false);
  };

  const executeTurn = async (history: ChatMessage[]) => {
    const sessionId = sessionIdRef.current;
    setIsLoading(true);
    try {
      const assistantId = `assistant-${Date.now()}`;
      const callbacks = {
        onToolCall: (name: string) => {
          if (sessionIdRef.current !== sessionId) return;
          setMessages((prev) => [
            ...prev,
            {
              id: `tool-${Date.now()}`,
              role: "assistant" as const,
              content: `Executing ${name}...`,
              toolName: name,
            },
          ]);
        },
      };
      const finalReply = await runAgentConversation(
        settings,
        history,
        callbacks,
        opencodeSessionRef.current,
      );

      if (sessionIdRef.current !== sessionId) return;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: finalReply,
        },
      ]);
    } catch (err: any) {
      if (sessionIdRef.current !== sessionId) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ Error: ${err.message}`,
        },
      ]);
    } finally {
      if (sessionIdRef.current === sessionId) setIsLoading(false);
    }
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
    lastTurnRef.current = nextHistory;
    setLastPrompt(userMessage.content);
    setMessages(nextHistory);
    setInput("");

    await executeTurn(nextHistory);
  };

  const handleRetry = async () => {
    if (isLoading || !lastTurnRef.current) return;

    if (!settings.apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    // Roll back to the last user turn so the failed reply is replaced.
    setMessages(lastTurnRef.current);
    await executeTurn(lastTurnRef.current);
  };

  if (!isOpen) return null;

  return (
    <aside
      style={{ width: `${panelWidth}px` }}
      className="absolute right-0 top-14 bottom-6 z-20 flex flex-col border-l border-gray-200/80 bg-white/95 backdrop-blur-md shadow-2xl select-text dark:border-zinc-800/80 dark:bg-zinc-900/95"
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
            onClick={handleNewSession}
            title={t("ai.newChat")}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <MessageSquarePlus size={16} />
          </button>
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
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-gray-500">{t("ai.maxTokens")}</label>
              <input
                type="number"
                min={1}
                value={maxTokensInput}
                onChange={(e) => setMaxTokensInput(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-purple-500 dark:border-zinc-700"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-gray-500">{t("ai.maxTurns")}</label>
              <input
                type="number"
                min={1}
                value={maxTurnsInput}
                onChange={(e) => setMaxTurnsInput(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-purple-500 dark:border-zinc-700"
              />
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-gray-400 dark:text-zinc-500">
            {t("ai.limitsHelp")}
          </p>
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
              type="button"
              onClick={handleRetry}
              disabled={!lastPrompt || isLoading}
              title={t("ai.retry")}
              className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
            >
              <RotateCcw size={15} />
            </button>
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
