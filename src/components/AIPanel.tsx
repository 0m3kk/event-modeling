import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  AlertCircle,
  Settings,
  Square,
  Plus,
  Check,
  CircleDot,
  Circle,
  ChevronRight,
  Wrench,
} from "lucide-react";
import type { AIChatMessage, AIPlanStep } from "@/types";
import { cn } from "@/utils/cn";
import { useCanvasStore } from "@/store";
import { DEFAULT_AI_SETTINGS } from "@/ai/client";
import { clampAIMaxTokens } from "@/ai";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import type { ResizeDirection } from "@/hooks/useResizablePanel";

const TOOL_LABELS: Record<string, string> = {
  get_canvas_overview: "Read canvas",
  list_objects: "Listed objects",
  get_object: "Read object",
  search_objects: "Searched objects",
  create_objects: "Created objects",
  update_objects: "Updated objects",
  delete_objects: "Deleted objects",
  connect_objects: "Connected cards",
  create_storm_cards: "Created storm cards",
  update_storm_card: "Updated storm card",
  arrange_storm_lanes: "Arranged lanes",
  create_model_nodes: "Created model nodes",
  create_reference_copies: "Created reference copies",
  group_objects: "Grouped objects",
  ungroup_objects: "Ungrouped objects",
  select_objects: "Selected objects",
  focus_viewport: "Focused view",
  update_plan: "Updated plan",
};

function toolLabel(name?: string): string {
  if (!name) return "Tool";
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

function summarizeToolResult(message: AIChatMessage): string {
  const result = message.toolResults?.[0];
  const content = result?.content ?? message.content;
  if (result?.isError) return content.slice(0, 160);
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    if (typeof data.error === "string") return data.error;
    if (typeof data.createdCount === "number") {
      return `${data.createdCount} created`;
    }
    if (typeof data.updatedCount === "number") {
      return `${data.updatedCount} updated`;
    }
    if (typeof data.deletedCount === "number") {
      return `${data.deletedCount} deleted`;
    }
    if (typeof data.arranged === "number") return `${data.arranged} arranged`;
    if (typeof data.count === "number") return `${data.count} item(s)`;
    if (Array.isArray(data.returned)) {
      return `${data.returned.length} of ${String(data.total ?? "?")}`;
    }
    if (data.found === true) return "found";
    if (data.found === false) return "not found";
    if (typeof data.updated === "boolean") {
      return data.updated ? "updated" : "not updated";
    }
    if (typeof data.focused === "boolean") {
      return data.focused ? "focused" : "nothing to focus";
    }
    return content.slice(0, 120);
  } catch {
    return content.slice(0, 120);
  }
}

function PlanRow({ step }: { step: AIPlanStep }) {
  const Icon =
    step.status === "done"
      ? Check
      : step.status === "in_progress"
        ? CircleDot
        : Circle;
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-relaxed">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          step.status === "done"
            ? "text-emerald-400"
            : step.status === "in_progress"
              ? "text-violet-400 animate-pulse"
              : "text-gray-500",
        )}
      />
      <span
        className={cn(
          step.status === "done"
            ? "text-gray-500 line-through"
            : "text-gray-100",
        )}
      >
        {step.text}
      </span>
    </li>
  );
}

function ToolRow({ message }: { message: AIChatMessage }) {
  const [open, setOpen] = useState(false);
  const isError = message.toolResults?.[0]?.isError;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 self-start rounded-md px-1.5 py-1 text-[12px] text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-gray-100"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span className={cn("text-left font-mono", isError && "text-red-400")}>
          {toolLabel(message.toolName)} · {summarizeToolResult(message)}
        </span>
      </button>
      {open && (
        <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-gray-950/80 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-gray-400">
          {message.toolResults?.[0]?.content ?? message.content}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: AIChatMessage }) {
  if (message.role === "tool") {
    return <ToolRow message={message} />;
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-violet-600 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-white shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  const hasToolCalls = (message.toolCalls?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-2">
      {message.content && (
        <div className="max-w-[92%] self-start rounded-2xl rounded-bl-sm bg-gray-800 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-gray-100 shadow-sm border border-gray-700/50">
          {message.content}
        </div>
      )}
      {hasToolCalls && (
        <div className="flex flex-wrap gap-1.5 pl-1">
          {message.toolNames?.map((name, index) => (
            <span
              key={`${name}-${index}`}
              className="rounded-full bg-gray-800/80 border border-gray-700/60 px-2.5 py-0.5 font-mono text-[11px] text-gray-400"
            >
              {toolLabel(name)}
            </span>
          ))}
        </div>
      )}
      {message.status === "stopped" && (
        <span className="text-[11.5px] text-gray-500 pl-1 font-mono">Stopped.</span>
      )}
    </div>
  );
}

function ResizeHandles({
  beginResize,
}: {
  beginResize: (
    direction: ResizeDirection,
  ) => (event: React.PointerEvent<HTMLElement>) => void;
}) {
  return (
    <>
      {/* Top edge */}
      <div
        onPointerDown={beginResize("top")}
        className="absolute top-0 right-3 left-3 z-40 h-1.5 cursor-ns-resize touch-none rounded-full transition-colors hover:bg-violet-500/40"
        title="Drag to resize"
      />
      {/* Left edge */}
      <div
        onPointerDown={beginResize("left")}
        className="absolute top-3 bottom-3 left-0 z-40 w-1.5 cursor-ew-resize touch-none rounded-full transition-colors hover:bg-violet-500/40"
        title="Drag to resize"
      />
      {/* Top-left corner grip */}
      <div
        onPointerDown={beginResize("top-left")}
        className="group absolute top-0 left-0 z-50 flex h-4 w-4 cursor-nwse-resize touch-none items-start justify-start"
        title="Drag to resize"
      >
        <span className="m-0.5 h-2.5 w-2.5 rounded-tl-lg border-t-2 border-l-2 border-gray-500 transition-colors group-hover:border-violet-400" />
      </div>
    </>
  );
}

export function AIPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [planOpen, setPlanOpen] = useState(true);
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [maxTokensInput, setMaxTokensInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { size, beginResize } = useResizablePanel();

  const aiSettings = useCanvasStore((s) => s.aiSettings);
  const aiConversation = useCanvasStore((s) => s.aiConversation);
  const aiRunning = useCanvasStore((s) => s.aiRunning);
  const aiError = useCanvasStore((s) => s.aiError);
  const setAISettings = useCanvasStore((s) => s.setAISettings);
  const sendAIMessage = useCanvasStore((s) => s.sendAIMessage);
  const stopAI = useCanvasStore((s) => s.stopAI);
  const newAIConversation = useCanvasStore((s) => s.newAIConversation);
  const clearAIError = useCanvasStore((s) => s.clearAIError);

  const isLocalEndpoint =
    aiSettings.baseUrl.includes("localhost") ||
    aiSettings.baseUrl.includes("127.0.0.1");
  const canSend = !!aiSettings.apiKey || isLocalEndpoint;
  const messages = aiConversation.messages;
  const plan = aiConversation.plan;
  const planDone = useMemo(
    () => plan.filter((step) => step.status === "done").length,
    [plan],
  );

  useEffect(() => {
    if (isOpen && canSend && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, canSend]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, plan, aiRunning]);

  const handleSend = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || aiRunning) return;
    setPrompt("");
    void sendAIMessage(trimmed);
  }, [prompt, aiRunning, sendAIMessage]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.code === "KeyN") {
        event.preventDefault();
        newAIConversation();
        event.stopPropagation();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
      event.stopPropagation();
    },
    [handleSend, newAIConversation],
  );

  // Cmd/Ctrl+N starts a new conversation whenever focus is inside the panel.
  const handlePanelKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.code === "KeyN") {
        event.preventDefault();
        newAIConversation();
      }
      event.stopPropagation();
    },
    [newAIConversation],
  );

  // Clicking anywhere in the panel pulls focus onto the panel itself so that
  // keyboard shortcuts (like Cmd/Ctrl+N) target it instead of the canvas.
  const handlePanelMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      panelRef.current?.focus({ preventScroll: true });
    },
    [],
  );

  const openSettings = useCallback(() => {
    setBaseUrlInput(aiSettings.baseUrl);
    setModelInput(aiSettings.model);
    setMaxTokensInput(String(aiSettings.maxTokens));
    setKeyInput(aiSettings.apiKey ?? "");
    setShowSettings(true);
  }, [aiSettings]);

  const handleSaveSettings = useCallback(() => {
    setAISettings({
      baseUrl: baseUrlInput.trim() || DEFAULT_AI_SETTINGS.baseUrl,
      model: modelInput.trim() || DEFAULT_AI_SETTINGS.model,
      apiKey: keyInput.trim() || null,
      maxTokens: clampAIMaxTokens(Number(maxTokensInput)),
    });
    setShowSettings(false);
  }, [baseUrlInput, modelInput, maxTokensInput, keyInput, setAISettings]);

  const host = useMemo(() => {
    try {
      return new URL(aiSettings.baseUrl).host;
    } catch {
      return aiSettings.baseUrl;
    }
  }, [aiSettings.baseUrl]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-6 bottom-6 z-40 flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-xl transition-all hover:bg-violet-700 hover:shadow-violet-600/30 active:scale-95"
        title="Open Event Storming & Modeling AI Assistant"
      >
        <Sparkles className="h-4.5 w-4.5" />
        AI Studio
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="fixed right-6 bottom-6 z-40 flex max-h-[calc(100vh-5rem)] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-gray-900 border border-gray-700/80 shadow-2xl text-gray-200 outline-none"
      style={{ width: size.width, height: size.height }}
      onMouseDown={handlePanelMouseDown}
      onKeyDown={handlePanelKeyDown}
    >
      <ResizeHandles beginResize={beginResize} />
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-4 py-3.5 bg-gray-900/90 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="p-1 rounded-lg bg-violet-600/20 text-violet-400">
            <Sparkles className="h-4 w-4 shrink-0" />
          </div>
          <span className="truncate text-[14px] font-semibold tracking-tight text-white">
            {aiConversation.title}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={newAIConversation}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (showSettings) {
                setShowSettings(false);
              } else {
                openSettings();
              }
            }}
            className={cn(
              "rounded-lg p-1.5 transition-colors hover:bg-gray-800 hover:text-white",
              showSettings ? "text-violet-400 bg-gray-800" : "text-gray-400",
            )}
            title="Model & API settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              setShowSettings(false);
              clearAIError();
            }}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Settings Modal/Overlay */}
      {showSettings && (
        <div className="absolute inset-0 z-30 flex flex-col bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3.5 bg-gray-900/90">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-violet-400" />
              <span className="text-[14px] font-semibold text-white">
                Model & API Settings
              </span>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              title="Close settings"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-gray-300">
                Base URL
              </span>
              <input
                type="text"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder={DEFAULT_AI_SETTINGS.baseUrl}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-[13px] text-white outline-none focus:border-violet-500 font-mono"
              />
              <span className="text-[11px] text-gray-500">
                Any OpenAI-compatible endpoint (Ollama, LM Studio, OpenAI, OpenRouter)
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-gray-300">Model</span>
              <input
                type="text"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                placeholder={DEFAULT_AI_SETTINGS.model}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-[13px] text-white outline-none focus:border-violet-500 font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-gray-300">
                Max output tokens
              </span>
              <input
                type="number"
                min={256}
                max={32768}
                step={256}
                value={maxTokensInput}
                onChange={(e) => setMaxTokensInput(e.target.value)}
                placeholder={String(DEFAULT_AI_SETTINGS.maxTokens)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-[13px] text-white outline-none focus:border-violet-500 font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-gray-300">
                API Key
              </span>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Bearer token (optional for local Ollama / LM Studio)"
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-[13px] text-white outline-none focus:border-violet-500 font-mono"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-800 p-3 bg-gray-900/90">
            <button
              onClick={() => setShowSettings(false)}
              className="rounded-lg px-3 py-1.5 text-[13px] text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSettings}
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-violet-700"
            >
              Save settings
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {aiError && (
        <div className="flex items-start gap-2.5 border-b border-gray-800 bg-red-950/30 px-4 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="flex-1 text-[12.5px] leading-relaxed text-red-400">
            {aiError}
          </div>
          <button
            onClick={clearAIError}
            className="text-gray-500 hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Plan checklist */}
      {plan.length > 0 && (
        <div className="shrink-0 border-b border-gray-800 bg-gray-950/40">
          <button
            type="button"
            onClick={() => setPlanOpen((value) => !value)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-gray-800/40"
            title={planOpen ? "Collapse working plan" : "Expand working plan"}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform",
                planOpen && "rotate-90",
              )}
            />
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Working Plan
            </span>
            <span className="rounded-full bg-gray-800 px-2 py-0.5 font-mono text-[10.5px] text-gray-400">
              {planDone}/{plan.length}
            </span>
            {aiRunning && planDone < plan.length && (
              <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-violet-400" />
            )}
          </button>
          {planOpen && (
            <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto px-4 pb-3">
              {plan.map((step) => (
                <PlanRow key={step.id} step={step} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Chat Transcript */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4"
      >

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {aiRunning && (
          <div className="flex items-center gap-2.5 text-[12.5px] text-violet-400 bg-gray-800/40 rounded-xl p-2.5 border border-gray-800">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>AI Assistant is working on the canvas…</span>
          </div>
        )}
      </div>

      {/* Composer Input */}
      <div className="border-t border-gray-800 p-3 bg-gray-900/90">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              canSend
                ? "Describe flow or models… (Enter to send, Shift+Enter for newline)"
                : "Set API key or local endpoint in settings to begin"
            }
            disabled={!canSend || aiRunning}
            rows={2}
            className="w-full resize-none rounded-xl border border-gray-700 bg-gray-800/80 px-3.5 py-2.5 pr-11 text-[13px] leading-relaxed text-white placeholder-gray-500 outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
          />
          {aiRunning ? (
            <button
              onClick={stopAI}
              className="absolute right-2.5 bottom-3 rounded-lg p-1.5 text-red-400 transition-colors hover:bg-gray-700"
              title="Stop generation"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!prompt.trim() || !canSend}
              className="absolute right-2.5 bottom-3 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-30"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-gray-500 font-mono">
          <span className="truncate max-w-50">
            {aiSettings.model} · {host}
          </span>
          <span className="text-gray-600">Single Cmd+Z undo per turn</span>
        </div>
      </div>
    </div>
  );
}
