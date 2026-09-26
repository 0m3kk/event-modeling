import type { AIPlanStep } from "@/types";
import type { CanvasStore } from "@/store/types";
import type { z } from "zod";

export interface AIToolContext {
  getState: () => CanvasStore;
  getPlan: () => AIPlanStep[];
  setPlan: (plan: AIPlanStep[]) => void;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType;
  execute: (args: never, ctx: AIToolContext) => unknown | Promise<unknown>;
}
