import { Fragment } from "react";
import { MousePointer, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import { toolRegistry } from "@/tools";
import type { ToolDefinition } from "@/tools";

/**
 * Toolbar layout. Each inner array is rendered as a group, separated from the
 * next one by a vertical divider. Any registered tool not listed here is
 * appended as a final group, so new tools never silently disappear.
 */
const TOOL_GROUPS: string[][] = [
  ["domainCard", "sliceCard"],
  ["eventCard", "commandCard", "queryCard", "stateCard", "constraintCard", "viewCard"],
  ["serviceCard", "objectCard", "enumCard", "aliasCard"],
  ["stickyNote"],
];

function ToolButton({
  tool,
  isActive,
  onSelect,
}: {
  tool: ToolDefinition;
  isActive: boolean;
  onSelect: () => void;
}) {
  const Icon = tool.icon;
  return (
    <div className="group relative flex items-center justify-center">
      <button
        onClick={onSelect}
        title={tool.name}
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all cursor-pointer ${
          isActive
            ? "bg-blue-600 text-white shadow-sm"
            : "text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        }`}
        style={!isActive ? { color: tool.color } : undefined}
      >
        <Icon size={20} />
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-zinc-800 whitespace-nowrap">
        {tool.name}
      </div>
    </div>
  );
}

export function Toolbar() {
  const { t } = useTranslation();
  const currentTool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const selectedCount = useCanvasStore((s) => s.selectedIds.length);
  const deleteElements = useCanvasStore((s) => s.deleteElements);
  const deleteSelectedField = useCanvasStore((s) => s.deleteSelectedField);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const selectedField = useCanvasStore((s) => s.selectedField);

  const registeredTools = toolRegistry.getAll();
  const toolByType = new Map(registeredTools.map((tool) => [tool.type, tool]));
  const listedTypes = new Set(TOOL_GROUPS.flat());
  const groups: ToolDefinition[][] = TOOL_GROUPS.map((types) =>
    types
      .map((type) => toolByType.get(type))
      .filter((tool): tool is ToolDefinition => Boolean(tool)),
  );
  const unlistedTools = registeredTools.filter((tool) => !listedTypes.has(tool.type));
  if (unlistedTools.length > 0) groups.push(unlistedTools);
  const isFieldSelected = Boolean(selectedField && selectedIds.includes(selectedField.elementId));

  const handleDelete = () => {
    if (isFieldSelected) {
      deleteSelectedField();
    } else if (selectedIds.length > 0) {
      deleteElements(selectedIds);
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-gray-200/90 bg-white/95 px-3.5 py-2 shadow-2xl backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/95 z-30 select-none">
      {/* 1. Core Select Tool */}
      <div className="group relative flex items-center justify-center">
        <button
          onClick={() => setTool("select")}
          title={t("toolbar.select")}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all cursor-pointer ${
            currentTool === "select"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          <MousePointer size={20} />
        </button>
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-zinc-800 whitespace-nowrap">
          {t("toolbar.select")}
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-zinc-800" />

      {/* 2. Dynamic Plugin Tools from Registry, grouped with separators */}
      {groups.map((group, index) => (
        <Fragment key={index}>
          {index > 0 && <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-zinc-800" />}
          <div className="flex items-center gap-1">
            {group.map((tool) => (
              <ToolButton
                key={tool.type}
                tool={tool}
                isActive={currentTool === tool.type}
                onSelect={() => setTool(tool.type)}
              />
            ))}
          </div>
        </Fragment>
      ))}

      <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-zinc-800" />

      {/* 3. Delete Selected */}
      <div className="group relative flex items-center justify-center">
        <button
          onClick={handleDelete}
          disabled={selectedCount === 0}
          title={t("toolbar.delete")}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-950/40 cursor-pointer"
        >
          <Trash2 size={20} />
        </button>
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-zinc-800 whitespace-nowrap">
          {t("toolbar.delete")}
        </div>
      </div>
    </div>
  );
}
