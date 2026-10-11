import { Plus } from "lucide-react";
import type { CanvasElement } from "@/types";
import type { CommandCardData, CommandField } from "./index";
import { commandCardTool, getCommandInputs, getCommandResponses } from "./index";
import { useCanvasStore } from "@/store";

interface CommandCardOptionsProps {
  element: CanvasElement<CommandCardData>;
  onUpdate: (partial: Partial<CommandCardData>) => void;
}

export function CommandCardOptions({ element }: CommandCardOptionsProps) {
  const handleAddInput = () => {
    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);
    const newInput: CommandField = {
      name: `input${inputs.length + 1}`,
      type: "string",
    };
    const nextInputs = [...inputs, newInput];
    const nextData: CommandCardData = {
      ...element.data,
      inputs: nextInputs,
      responses,
    };
    const nextSize = commandCardTool.computeSize ? commandCardTool.computeSize(nextData) : null;

    useCanvasStore.getState().updateElement(element.id, {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    });
  };

  const handleAddResponse = () => {
    const inputs = getCommandInputs(element.data);
    const responses = getCommandResponses(element.data);
    const newResponse: CommandField = {
      name: `res${responses.length + 1}`,
      type: "string",
    };
    const nextResponses = [...responses, newResponse];
    const nextData: CommandCardData = {
      ...element.data,
      inputs,
      responses: nextResponses,
    };
    const nextSize = commandCardTool.computeSize ? commandCardTool.computeSize(nextData) : null;

    useCanvasStore.getState().updateElement(element.id, {
      height: nextSize ? nextSize.height : element.height,
      data: nextData,
    });
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleAddInput}
        title="Add Input Field"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <Plus size={14} />
        <span>Input</span>
      </button>

      <button
        onClick={handleAddResponse}
        title="Add Response Field"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
      >
        <Plus size={14} />
        <span>Response</span>
      </button>
    </div>
  );
}
