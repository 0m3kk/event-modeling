import { z } from "zod";
import { nanoid } from "nanoid";
import { defineTool } from "./schema";

export const updatePlanTool = defineTool({
  name: "update_plan",
  description:
    "Record or update your working plan for the current task. Use this for multi-step jobs so the user can follow along. Mark exactly one step in_progress while working on it.",
  schema: z.object({
    steps: z
      .array(
        z.object({
          text: z.string().min(1),
          status: z.enum(["pending", "in_progress", "done"]),
        }),
      )
      .max(30),
  }),
  execute: (args, ctx) => {
    const plan = args.steps.map((step) => ({
      id: nanoid(),
      text: step.text,
      status: step.status,
    }));
    ctx.setPlan(plan);
    return { plan };
  },
});
