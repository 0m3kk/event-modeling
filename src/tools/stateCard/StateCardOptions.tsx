import { useMemo, useState } from "react";
import { LogIn, LogOut, Plus, ListTree, Tag as TagIcon } from "lucide-react";
import type { CanvasElement } from "@/types";
import { useCanvasStore } from "@/store";
import { collectBoardTags } from "@/utils/eventTags";
import { computeStateCardSize, getStateParams, getQueryItems, getStateFields } from "./index";
import type { StateCardData, QueryItem, QueryTag } from "./rules";
import { QueryTypesPopover } from "./QueryTypesPopover";
import { QueryTagsPopover } from "./QueryTagsPopover";

interface StateCardOptionsProps {
  element: CanvasElement<StateCardData>;
  onUpdate: (partial: Partial<StateCardData>) => void;
}

/**
 * Options bar actions for the State card: add param / query item / state, and
 * (when a query item row is selected) editors for its event types and DCB tags.
 */
export function StateCardOptions({ element }: StateCardOptionsProps) {
  const selectedField = useCanvasStore((s) => s.selectedField);
  const elements = useCanvasStore((s) => s.elements);

  const [typesOpen, setTypesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  const params = getStateParams(element.data);
  const items = getQueryItems(element.data);
  const states = getStateFields(element.data);

  const boardTags = useMemo(() => collectBoardTags(elements), [elements]);
  const suggestedTypes = useMemo(
    () =>
      elements
        .filter((el) => el.type === "eventCard")
        .map((el) => el.data?.name)
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0),
    [elements],
  );

  const selectedItemIndex =
    selectedField?.elementId === element.id && selectedField.sectionIndex === 1
      ? selectedField.fieldIndex
      : -1;
  const currentItem: QueryItem | null =
    selectedItemIndex >= 0 && selectedItemIndex < items.length ? items[selectedItemIndex] : null;

  const commit = (data: StateCardData) => {
    const size = computeStateCardSize(data);
    // Never shrink below the width the user currently has, but grow to fit a
    // long event type or tag badge in a query item.
    useCanvasStore.getState().updateElement(element.id, {
      width: Math.max(element.width, size.width),
      height: size.height,
      data,
    });
  };

  const handleAddParam = () => {
    commit({
      ...element.data,
      params: [...params, { name: `param${params.length + 1}`, type: "string" }],
    });
  };

  const handleAddQueryItem = () => {
    commit({
      ...element.data,
      queryItems: [...items, { types: [], tags: [] }],
    });
  };

  const handleAddState = () => {
    commit({
      ...element.data,
      states: [...states, { name: `state${states.length + 1}`, type: "string" }],
    });
  };

  const updateCurrentItem = (patch: Partial<QueryItem>) => {
    if (!currentItem) return;
    const nextItems = [...items];
    nextItems[selectedItemIndex] = { ...currentItem, ...patch };
    commit({ ...element.data, queryItems: nextItems });
  };

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <button
          onClick={handleAddParam}
          title="Add Param Field"
          className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <LogIn size={16} />
        </button>
      </div>

      <div className="relative">
        <button
          onClick={handleAddQueryItem}
          title="Add Query Item"
          className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="relative">
        <button
          onClick={handleAddState}
          title="Add State Field"
          className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <LogOut size={16} />
        </button>
      </div>

      {currentItem && (
        <>
          <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-zinc-800" />

          <div className="relative">
            <button
              onClick={() => {
                setTagsOpen(false);
                setTypesOpen((v) => !v);
              }}
              title="Edit Event Types"
              className={`flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer ${
                currentItem.types.length > 0
                  ? "bg-teal-500/15 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400"
                  : "text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <ListTree size={16} />
            </button>

            <QueryTypesPopover
              types={currentItem.types}
              suggestedTypes={suggestedTypes}
              isOpen={typesOpen}
              onClose={() => setTypesOpen(false)}
              onChange={(types) => updateCurrentItem({ types })}
            />
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setTypesOpen(false);
                setTagsOpen((v) => !v);
              }}
              title="Edit DCB Tags"
              className={`flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer ${
                currentItem.tags.length > 0
                  ? "bg-amber-500/15 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                  : "text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <TagIcon size={16} className={currentItem.tags.length > 0 ? "fill-amber-500" : ""} />
            </button>

            <QueryTagsPopover
              tags={currentItem.tags}
              params={params}
              boardTags={boardTags}
              isOpen={tagsOpen}
              onClose={() => setTagsOpen(false)}
              onChange={(tags: QueryTag[]) => updateCurrentItem({ tags })}
            />
          </div>
        </>
      )}
    </div>
  );
}
