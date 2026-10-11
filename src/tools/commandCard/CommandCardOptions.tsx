import { LogIn, LogOut } from "lucide-react";
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
