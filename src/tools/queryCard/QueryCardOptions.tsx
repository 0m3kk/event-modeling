import { LogIn, LogOut } from "lucide-react";
import type { CanvasElement } from "@/types";
import type { QueryCardData, QueryField } from "./index";
import { queryCardTool, getQueryParams, getQueryResponses } from "./index";
import { useCanvasStore } from "@/store";

interface QueryCardOptionsProps {
  element: CanvasElement<QueryCardData>;
  onUpdate: (partial: Partial<QueryCardData>) => void;
}

export function QueryCardOptions({ element }: QueryCardOptionsProps) {
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
    </div>
  );
}
