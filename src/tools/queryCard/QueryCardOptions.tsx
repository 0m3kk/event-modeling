import { useState } from "react";
import { LogIn, LogOut, KeyRound } from "lucide-react";
import type { CanvasElement } from "@/types";
import type { QueryCardData, QueryField } from "./index";
import { queryCardTool, getQueryParams, getQueryResponses } from "./index";
import { useCanvasStore } from "@/store";
import { ActionTokenPopover } from "../common/ActionTokenPopover";

interface QueryCardOptionsProps {
  element: CanvasElement<QueryCardData>;
  onUpdate: (partial: Partial<QueryCardData>) => void;
}

export function QueryCardOptions({ element, onUpdate }: QueryCardOptionsProps) {
  const [isActionOpen, setIsActionOpen] = useState(false);
  const handleAddParam = () => {
    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);
    const newParam: QueryField = {
      name: `param${params.length + 1}`,
      type: "string",
    };
    const nextParams = [...params, newParam];
    const nextData: QueryCardData = {
      ...element.data,
      params: nextParams,
      responses,
    };
    const nextSize = queryCardTool.computeSize ? queryCardTool.computeSize(nextData) : null;

    useCanvasStore.getState().updateElement(element.id, {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    });
  };

  const handleAddResponse = () => {
    const params = getQueryParams(element.data);
    const responses = getQueryResponses(element.data);
    const newResponse: QueryField = {
      name: `res${responses.length + 1}`,
      type: "string",
    };
    const nextResponses = [...responses, newResponse];
    const nextData: QueryCardData = {
      ...element.data,
      params,
      responses: nextResponses,
    };
    const nextSize = queryCardTool.computeSize ? queryCardTool.computeSize(nextData) : null;

    useCanvasStore.getState().updateElement(element.id, {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    });
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleAddParam}
        title="Add Param Field"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <LogIn size={16} />
      </button>

      <button
        onClick={handleAddResponse}
        title="Add Response Field"
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <LogOut size={16} />
      </button>

      <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-zinc-800" />

      <div className="relative">
        <button
          onClick={() => setIsActionOpen((prev) => !prev)}
          title={element.data.action ? `Action: ${element.data.action}` : "Set Action Token"}
          className={`flex items-center justify-center rounded-lg p-1.5 transition-colors cursor-pointer ${
            element.data.action
              ? "bg-blue-500/15 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
              : "text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          <KeyRound size={16} />
        </button>

        <ActionTokenPopover
          value={element.data.action}
          isOpen={isActionOpen}
          onClose={() => setIsActionOpen(false)}
          onCommit={(value) => onUpdate({ action: value || undefined })}
        />
      </div>
    </div>
  );
}
