/** Settings form body for the AI panel (presentational). */
import { useTranslation } from "react-i18next";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-xs outline-none focus:border-purple-500 dark:border-zinc-700";

export interface AISettingsFormProps {
  apiKeyInput: string;
  baseUrlInput: string;
  modelInput: string;
  maxTokensInput: string;
  maxTurnsInput: string;
  onApiKeyChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onMaxTokensChange: (value: string) => void;
  onMaxTurnsChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function AISettingsForm({
  apiKeyInput,
  baseUrlInput,
  modelInput,
  maxTokensInput,
  maxTurnsInput,
  onApiKeyChange,
  onBaseUrlChange,
  onModelChange,
  onMaxTokensChange,
  onMaxTurnsChange,
  onSave,
  onCancel,
}: AISettingsFormProps) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <h3 className="font-semibold text-sm">{t("ai.settings")}</h3>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t("ai.apiKey")}</label>
        <input
          type="password"
          placeholder="sk-..."
          value={apiKeyInput}
          onChange={(e) => onApiKeyChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t("ai.baseUrl")}</label>
        <input
          type="text"
          value={baseUrlInput}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t("ai.model")}</label>
        <input
          type="text"
          value={modelInput}
          onChange={(e) => onModelChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <label className="text-xs text-gray-500">{t("ai.maxTokens")}</label>
          <input
            type="number"
            min={1}
            value={maxTokensInput}
            onChange={(e) => onMaxTokensChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-gray-500">{t("ai.maxTurns")}</label>
          <input
            type="number"
            min={1}
            value={maxTurnsInput}
            onChange={(e) => onMaxTurnsChange(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-gray-400 dark:text-zinc-500">
        {t("ai.limitsHelp")}
      </p>
      <div className="flex gap-2 pt-2">
        <button
          onClick={onSave}
          className="flex-1 rounded-lg bg-purple-600 py-1.5 text-xs font-medium text-white hover:bg-purple-700 cursor-pointer"
        >
          {t("ai.saveSettings")}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100 dark:border-zinc-700 dark:hover:bg-zinc-800 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
