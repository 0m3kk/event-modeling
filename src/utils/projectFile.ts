/**
 * v3 project file: a CBOR-encoded change log plus a presentation sidecar.
 *
 * Reading is backward compatible: a v2 JSON board is migrated into a v3
 * project whose initial state is captured as a snapshot (the history starts
 * empty, since a v2 file carries no change log).
 */
import { encode, decode } from "cbor-x";
import type {
  CanvasElement,
  ChangeSet,
  ModelEvent,
  ProjectFileV3,
  ProjectSnapshot,
  Viewport,
  ProjectFileV2,
} from "@/types";
import { ProjectFileV2Schema } from "@/types";
import {
  extractUiSidecar,
  replayModel,
  toCanvasElements,
  toModelElement,
} from "./modelDiff";

/** Emit a checkpoint snapshot once a log reaches this many change sets. */
export const CHECKPOINT_EVERY = 200;

/** A project decoded from a file or storage, ready to load into the store. */
export interface LoadedProject {
  name: string;
  elements: CanvasElement[];
  viewport: { x: number; y: number; zoom: number };
  log: ChangeSet[];
  projectId: string;
  createdAt: string;
}

export function buildProjectV3(input: {
  name: string;
  elements: CanvasElement[];
  viewport: Viewport;
  log: ChangeSet[];
  id?: string;
  createdAt?: string;
  snapshot?: ProjectSnapshot | null;
}): ProjectFileV3 {
  const now = new Date().toISOString();
  return {
    format: "eventmodel",
    version: 3,
    meta: {
      id: input.id ?? `project-${Date.now().toString(36)}`,
      name: input.name || "Untitled Board",
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    },
    log: input.log,
    snapshot: input.snapshot ?? null,
    ui: extractUiSidecar(input.elements, input.viewport),
  };
}

/** Optional checkpoint: the modeling state at an earlier sequence. */
export function makeCheckpoint(log: ChangeSet[]): ProjectSnapshot | null {
  if (log.length < CHECKPOINT_EVERY) return null;
  const drop = log.length % CHECKPOINT_EVERY;
  const targetIndex = log.length - drop - 1;
  if (targetIndex < 0) return null;
  const targetSeq = log[targetIndex].seq;
  const upTo = log.filter((cs) => cs.seq <= targetSeq);
  const model = replayModel(upTo);
  return { seq: targetSeq, elements: Array.from(model.values()) };
}

export function encodeProject(project: ProjectFileV3): Uint8Array {
  return encode(project);
}

export function decodeProject(bytes: Uint8Array): ProjectFileV3 {
  let parsed: unknown;
  try {
    parsed = decode(bytes);
  } catch {
    throw new Error("Invalid project file");
  }
  return validateProjectV3(parsed);
}

function validateProjectV3(value: unknown): ProjectFileV3 {
  const project = value as Partial<ProjectFileV3> | null;
  if (
    !project ||
    project.format !== "eventmodel" ||
    project.version !== 3 ||
    !Array.isArray(project.log) ||
    !project.ui ||
    typeof project.ui !== "object"
  ) {
    throw new Error("Invalid project format");
  }
  return project as ProjectFileV3;
}

/** Rebuilds the board from a decoded v3 project. */
export function projectToLoaded(project: ProjectFileV3): LoadedProject {
  const base = project.snapshot?.elements ?? [];
  const afterSeq = project.snapshot?.seq ?? 0;
  const model = replayModel(project.log, base, afterSeq);
  return {
    name: project.meta.name,
    elements: toCanvasElements(model, project.ui),
    viewport: project.ui.viewport,
    log: project.log,
    projectId: project.meta.id,
    createdAt: project.meta.createdAt,
  };
}

/** Migrates a v2 board into an initial "created" change set in the log. */
export function projectV2ToLoaded(project: ProjectFileV2): LoadedProject {
  const events = project.elements.map(
    (el): ModelEvent => ({ t: "created", el: toModelElement(el) }),
  );
  const log: ChangeSet[] = events.length
    ? [
        {
          id: "cs-import",
          seq: 1,
          at: new Date().toISOString(),
          actor: "user",
          label: "Imported board",
          events,
        },
      ]
    : [];
  return {
    name: project.name,
    elements: project.elements,
    viewport: project.viewport,
    log,
    projectId: project.id,
    createdAt: project.createdAt,
  };
}

function looksLikeJson(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length && i < 16; i++) {
    const byte = bytes[i];
    // Skip ASCII whitespace.
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    return byte === 0x7b /* { */ || byte === 0x5b /* [ */;
  }
  return false;
}

/**
 * Decodes a project from raw bytes, detecting a v2 JSON board or a v3 CBOR one.
 */
export function parseProjectBytes(bytes: Uint8Array): LoadedProject {
  if (looksLikeJson(bytes)) {
    const text = new TextDecoder().decode(bytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON file");
    }
    const result = ProjectFileV2Schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Invalid project format: ${result.error.issues.map((i) => i.message).join(", ")}`,
      );
    }
    return projectV2ToLoaded(result.data);
  }
  return projectToLoaded(decodeProject(bytes));
}

/** Serializes a project to CBOR bytes, optionally with a checkpoint snapshot. */
export function serializeProjectV3(input: {
  name: string;
  elements: CanvasElement[];
  viewport: Viewport;
  log: ChangeSet[];
  id?: string;
  createdAt?: string;
  withCheckpoint?: boolean;
}): Uint8Array {
  const snapshot = input.withCheckpoint ? makeCheckpoint(input.log) : null;
  const project = buildProjectV3({ ...input, snapshot });
  return encodeProject(project);
}
