import { useMemo, useState } from "react";
import { History, X, Plus, Pencil, Trash2, Eraser, Crosshair } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import { useChangeLog } from "@/store/recorder";
import { toolRegistry } from "@/tools";
import { buildChangeHistory, type HistoryItem, type HistoryEntry } from "@/utils/changeHistory";
import type { ModelElement } from "@/types";

function typeLabel(type: string): string {
  return toolRegistry.get(type)?.name ?? type;
}

function elementName(model: ModelElement): string {
  const data = (model.data ?? {}) as Record<string, unknown>;
  const name = data.name ?? data.text;
  return typeof name === "string" && name.trim() ? name : typeLabel(model.type);
}

/** `/data/fields/0/type` → `fields[0].type`; membership paths stay as-is. */
function formatPath(path: string): string {
  const stripped = path.replace(/^\/data\/?/, "").replace(/^\//, "");
  if (!stripped) return "";
  return stripped.replace(/\/(\d+)/g, "[$1]").replace(/\//g, ".");
}

function formatValue(value: unknown, empty: string): string {
  if (value === undefined || value === null) return empty;
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  if (typeof value === "object") {
    try {
      const text = JSON.stringify(value);
      return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function formatTime(at: string): string {
  if (!at) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Centers the viewport on a card and selects it. */
function focusElement(id: string): void {
  const state = useCanvasStore.getState();
  const el = state.elements.find((e) => e.id === id);
  state.setSelectedIds([id]);
  if (!el) return;
  const zoom = state.viewport.zoom || 1;
  const screenW = state.viewport.screenWidth || 800;
  const screenH = state.viewport.screenHeight || 600;
  state.setViewport({
    x: screenW / 2 - (el.x + el.width / 2) * zoom,
    y: screenH / 2 - (el.y + el.height / 2) * zoom,
  });
}

export function ChangesPanel() {
  const { t } = useTranslation();
  const isOpen = useCanvasStore((s) => s.isChangesPanelOpen);
  const setOpen = useCanvasStore((s) => s.setChangesPanelOpen);
  const log = useChangeLog();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const history = useMemo(() => buildChangeHistory(log), [log]);

  if (!isOpen) return null;

  return (
    <aside className="absolute left-0 top-14 bottom-6 z-20 flex w-[22rem] max-w-[90vw] flex-col border-r border-gray-200/80 bg-white/95 shadow-2xl backdrop-blur-md select-text dark:border-zinc-800/80 dark:bg-zinc-900/95">
      <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <History size={16} />
          <span>{t("changes.title")}</span>
          {history.length > 0 && (
            <span className="rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
              {history.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
          title={t("common.close")}
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {history.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-gray-400 dark:text-zinc-500">
            {t("changes.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {[...history].reverse().map((entry) => (
              <ChangeSetRow
                key={entry.cs.id}
                entry={entry}
                expanded={expandedId === entry.cs.id}
                onToggle={() =>
                  setExpandedId((current) => (current === entry.cs.id ? null : entry.cs.id))
                }
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function ChangeSetRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: HistoryEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { cs, items } = entry;
  const counts = items.reduce(
    (acc, item) => {
      if (item.kind === "created") acc.created++;
      else if (item.kind === "updated") acc.updated++;
      else if (item.kind === "deleted") acc.deleted++;
      return acc;
    },
    { created: 0, updated: 0, deleted: 0 },
  );
  const isAI = cs.actor === "ai";

  return (
    <li className="rounded-xl border border-gray-200/80 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-800/30">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2 text-left cursor-pointer"
      >
        <span
          className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
            isAI
              ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
              : "bg-gray-200 text-gray-600 dark:bg-zinc-700 dark:text-zinc-300"
          }`}
        >
          {isAI ? t("changes.actorAI") : t("changes.actorUser")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-gray-800 dark:text-zinc-200">
            {cs.label || t("changes.updated")}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400 dark:text-zinc-500">
            <span>{formatTime(cs.at)}</span>
            {counts.created > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">+{counts.created}</span>
            )}
            {counts.updated > 0 && (
              <span className="text-amber-600 dark:text-amber-400">~{counts.updated}</span>
            )}
            {counts.deleted > 0 && (
              <span className="text-red-600 dark:text-red-400">-{counts.deleted}</span>
            )}
          </span>
        </span>
      </button>

      {expanded && (
        <ul className="flex flex-col gap-1 border-t border-gray-200/80 px-3 py-2 dark:border-zinc-800">
          {items.map((item, index) => (
            <HistoryItemRow key={`${cs.id}-${index}`} item={item} />
          ))}
        </ul>
      )}
    </li>
  );
}

function HistoryItemRow({ item }: { item: HistoryItem }) {
  const { t } = useTranslation();

  if (item.kind === "cleared") {
    return (
      <li className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
        <Eraser size={12} />
        <span>{t("changes.cleared")}</span>
      </li>
    );
  }

  const Icon = item.kind === "created" ? Plus : item.kind === "deleted" ? Trash2 : Pencil;
  const iconColor =
    item.kind === "created"
      ? "text-emerald-600 dark:text-emerald-400"
      : item.kind === "deleted"
        ? "text-red-600 dark:text-red-400"
        : "text-amber-600 dark:text-amber-400";

  const name =
    item.kind === "updated" ? null : elementName(item.model);

  return (
    <li className="text-[11px] text-gray-700 dark:text-zinc-300">
      <button
        onClick={() => focusElement(item.id)}
        title={t("changes.focus")}
        className="flex w-full items-center gap-1.5 text-left cursor-pointer hover:underline"
      >
        <Icon size={12} className={`shrink-0 ${iconColor}`} />
        <span className="truncate font-medium">
          {name ?? typeLabel(item.type)}
        </span>
        <span className="shrink-0 text-gray-400 dark:text-zinc-500">
          · {typeLabel(item.type)}
        </span>
        <Crosshair size={11} className="ml-auto shrink-0 text-gray-300 dark:text-zinc-600" />
      </button>

      {item.kind === "updated" && (
        <ul className="mt-0.5 flex flex-col gap-0.5 pl-5">
          {item.fields.map((field, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-1 font-mono">
              <span className="text-gray-500 dark:text-zinc-400">{formatPath(field.path)}</span>
              <span className="text-gray-400 line-through dark:text-zinc-600">
                {formatValue(field.before, t("changes.nothing"))}
              </span>
              <span className="text-gray-400">→</span>
              <span className="text-emerald-700 dark:text-emerald-400">
                {formatValue(field.after, t("changes.nothing"))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
