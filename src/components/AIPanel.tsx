import React, { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  X,
  Settings,
  MessageSquarePlus,
  AArrowDown,
  AArrowUp,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import {
  getStoredAISettings,
  storeAISettings,
  DEFAULT_AI_SETTINGS,
  type AISettings,
} from "@/ai/client";
import { useFontScale } from "@/hooks/useFontScale";
import { AISettingsForm } from "./ai/AISettingsForm";
import { AIInputBar } from "./ai/AIInputBar";
import { ChatMessageList } from "./ai/ChatMessageList";
import { useAIChat } from "./ai/useAIChat";
import { usePanelResize } from "./ai/usePanelResize";

const AI_PANEL_FONT_SCALE_STORAGE_KEY = "event_modeling_ai_panel_font_scale";

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

  const { panelWidth, handleStartResize } = usePanelResize();

  const {
    fontScale,
    increase: increaseFont,
    decrease: decreaseFont,
    canDecrease: canDecreaseFont,
    canIncrease: canIncreaseFont,
  } = useFontScale(AI_PANEL_FONT_SCALE_STORAGE_KEY);

  const chat = useAIChat({ settings, onRequireSettings: () => setIsSettingsOpen(true) });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.isLoading]);

  // Start a fresh chat session, dropping any pending reply from the old one.
  const handleNewSession = () => {
    chat.newSession();
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

  if (!isOpen) return null;

  return (
    <aside
      style={
        {
          width: `${panelWidth}px`,
          "--panel-font-scale": String(fontScale),
        } as React.CSSProperties
      }
      className="ai-panel absolute right-0 top-14 bottom-6 z-20 flex flex-col border-l border-gray-200/80 bg-white/95 backdrop-blur-md shadow-2xl select-text dark:border-zinc-800/80 dark:bg-zinc-900/95"
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
            onClick={decreaseFont}
            disabled={!canDecreaseFont}
            title={t("ai.decreaseFont")}
            aria-label={t("ai.decreaseFont")}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
          >
            <AArrowDown size={16} />
          </button>
          <button
            onClick={increaseFont}
            disabled={!canIncreaseFont}
            title={t("ai.increaseFont")}
            aria-label={t("ai.increaseFont")}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
          >
            <AArrowUp size={16} />
          </button>
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

      {isSettingsOpen ? (
        <AISettingsForm
          apiKeyInput={apiKeyInput}
          baseUrlInput={baseUrlInput}
          modelInput={modelInput}
          maxTokensInput={maxTokensInput}
          maxTurnsInput={maxTurnsInput}
          onApiKeyChange={setApiKeyInput}
          onBaseUrlChange={setBaseUrlInput}
          onModelChange={setModelInput}
          onMaxTokensChange={setMaxTokensInput}
          onMaxTurnsChange={setMaxTurnsInput}
          onSave={handleSaveSettings}
          onCancel={() => setIsSettingsOpen(false)}
        />
      ) : (
        <ChatMessageList
          messages={chat.messages}
          isLoading={chat.isLoading}
          emptyHint={t("ai.placeholder")}
          endRef={messagesEndRef}
        />
      )}

      {!isSettingsOpen && (
        <AIInputBar
          value={chat.input}
          onChange={chat.setInput}
          onSend={chat.send}
          onRetry={chat.retry}
          onStop={chat.stop}
          isLoading={chat.isLoading}
          canRetry={Boolean(chat.lastPrompt)}
          placeholder={t("ai.placeholder")}
        />
      )}
    </aside>
  );
}
