const AI_PROMPT_HISTORY_KEY = "storm-app-ai-prompt-history";

export const MAX_PROMPT_HISTORY = 10;

/** Reads the most recent prompts (newest first) from localStorage. */
export function getStoredPromptHistory(): string[] {
  try {
    const raw = localStorage.getItem(AI_PROMPT_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .slice(0, MAX_PROMPT_HISTORY);
      }
    }
  } catch {
    /* ignore corrupted history */
  }
  return [];
}

export function storePromptHistory(prompts: string[]): void {
  try {
    localStorage.setItem(
      AI_PROMPT_HISTORY_KEY,
      JSON.stringify(prompts.slice(0, MAX_PROMPT_HISTORY)),
    );
  } catch {
    /* ignore storage errors */
  }
}

/** Prepends a prompt, de-duplicates it, and caps the list at the max size. */
export function addPromptToHistory(prompts: string[], prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return prompts;
  return [trimmed, ...prompts.filter((item) => item !== trimmed)].slice(
    0,
    MAX_PROMPT_HISTORY,
  );
}
