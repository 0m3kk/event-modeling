/**
 * Chat controller for the AI panel: holds the message history and drives one
 * agent turn at a time, including abort, retry and session switching.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSessionId, type AISettings, type ChatMessage } from "@/ai/client";
import { runAgentConversation } from "@/ai/agent";

interface UseAIChatOptions {
  settings: AISettings;
  /** Called when a turn needs credentials the user has not set yet. */
  onRequireSettings: () => void;
}

export function useAIChat({ settings, onRequireSettings }: UseAIChatOptions) {
  const { t, i18n } = useTranslation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");

  // The history snapshot for the most recent turn, used by retry.
  const lastTurnRef = useRef<ChatMessage[] | null>(null);

  // Incremented whenever a new session starts; stale in-flight replies whose
  // captured id no longer matches are discarded instead of polluting the new chat.
  const sessionIdRef = useRef(0);

  // Lets the user abort the in-flight request. A fresh controller is created for
  // every turn and cleared once it settles.
  const abortRef = useRef<AbortController | null>(null);

  // Stable id sent to the opencode gateway as `x-opencode-session`, shared by
  // every turn of the current chat and refreshed when a new chat starts.
  const opencodeSessionRef = useRef<string>(createSessionId());

  const executeTurn = async (history: ChatMessage[]) => {
    const sessionId = sessionIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
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
        i18n.language,
        controller.signal,
      );

      if (sessionIdRef.current !== sessionId) return;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: finalReply.content,
          // Keep the thinking trace so it can be replayed on the next turn.
          reasoningContent: finalReply.reasoningContent || undefined,
        },
      ]);
    } catch (err: any) {
      if (sessionIdRef.current !== sessionId) return;
      // A user-initiated stop is not an error; surface a neutral note instead.
      if (err?.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          { id: `stopped-${Date.now()}`, role: "assistant", content: `🛑 ${t("ai.stopped")}` },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "assistant", content: `⚠️ Error: ${err.message}` },
      ]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (sessionIdRef.current === sessionId) setIsLoading(false);
    }
  };

  /** Abort the in-flight turn at the user's request. */
  const stop = () => {
    abortRef.current?.abort();
  };

  const send = async () => {
    if (!input.trim() || isLoading) return;
    if (!settings.apiKey) {
      onRequireSettings();
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

  const retry = async () => {
    if (isLoading || !lastTurnRef.current) return;
    if (!settings.apiKey) {
      onRequireSettings();
      return;
    }

    // Roll back to the last user turn so the failed reply is replaced.
    setMessages(lastTurnRef.current);
    await executeTurn(lastTurnRef.current);
  };

  /** Starts a fresh chat session, dropping any pending reply from the old one. */
  const newSession = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current += 1;
    opencodeSessionRef.current = createSessionId();
    lastTurnRef.current = null;
    setMessages([]);
    setInput("");
    setLastPrompt("");
    setIsLoading(false);
  };

  return { messages, input, setInput, isLoading, lastPrompt, send, retry, stop, newSession };
}
