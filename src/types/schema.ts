import { z } from "zod";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasElement<TData = any> {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  locked?: boolean;
  groupId?: string;
  data: TData;
}

export interface CanvasGroup {
  id: string;
  name: string;
  color?: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
  screenWidth: number;
  screenHeight: number;
}

export const CanvasElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number().optional(),
  locked: z.boolean().optional(),
  groupId: z.string().optional(),
  data: z.record(z.unknown()).default({}),
});

export const CanvasGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
});

export const ProjectFileV2Schema = z.object({
  version: z.literal(2),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }),
  elements: z.array(CanvasElementSchema),
  groups: z.array(CanvasGroupSchema).default([]),
});

export type ProjectFileV2 = z.infer<typeof ProjectFileV2Schema>;
