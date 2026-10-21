/**
 * Three-way merge for generated files that projects are expected to edit.
 *
 * `git merge-file` is used deliberately: it is the same diff3 implementation
 * Git itself uses, it writes familiar conflict markers and it exits with the
 * conflict count. No JavaScript reimplementation needs to be kept in sync with
 * Git's merge rules.
 *
 * The merge is line-based. A formatter that rewrites unrelated lines can turn a
 * clean merge into a conflict; that is reported rather than hidden.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type MergeResult =
  | { ok: true; content: string; conflicts: number }
  | { ok: false; reason: string };

/** Runs `git merge-file` over three in-memory contents. */
export async function merge3(
  ours: string,
  base: string,
  theirs: string,
): Promise<MergeResult> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "em-codegen-merge-"));
  const oursPath = path.join(dir, "ours");
  const basePath = path.join(dir, "base");
  const theirsPath = path.join(dir, "theirs");

  // Merge with LF regardless of the project's line endings, then restore CRLF
  // if that is what the project file used. Otherwise a CRLF checkout would make
  // every line look edited to diff3.
  const crlf = ours.includes("\r\n");
  const lf = (value: string) => value.replace(/\r\n/g, "\n");

  try {
    await Promise.all([
      fs.writeFile(oursPath, lf(ours), "utf8"),
      fs.writeFile(basePath, lf(base), "utf8"),
      fs.writeFile(theirsPath, lf(theirs), "utf8"),
    ]);
    const result = await runMergeFile(oursPath, basePath, theirsPath);
    if (result.ok && crlf) {
      return { ...result, content: result.content.replace(/\n/g, "\r\n") };
    }
    return result;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function runMergeFile(
  oursPath: string,
  basePath: string,
  theirsPath: string,
): Promise<MergeResult> {
  return new Promise((resolve) => {
    const child = spawn(
      "git",
      [
        "merge-file",
        "-p",
        "--diff3",
        "-L",
        "current",
        "-L",
        "base",
        "-L",
        "generated",
        oursPath,
        basePath,
        theirsPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (result: MergeResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      settle({
        ok: false,
        reason:
          error.code === "ENOENT"
            ? "git is not installed; cannot merge scaffold files"
            : `git merge-file failed: ${error.message}`,
      });
    });
    child.on("close", (code) => {
      if (code === null) {
        settle({ ok: false, reason: "git merge-file was terminated by a signal" });
        return;
      }
      if (code > 0 && code < 128) {
        // Exit status is the number of conflicts; stdout carries the markers.
        settle({ ok: true, content: stdout, conflicts: code });
        return;
      }
      if (code === 0) {
        settle({ ok: true, content: stdout, conflicts: 0 });
        return;
      }
      settle({
        ok: false,
        reason: stderr.trim() || `git merge-file exited with status ${code}`,
      });
    });
  });
}

const CONFLICT_MARKER = /^<{7} /m;

/** True when a file still contains an unresolved diff3 conflict block. */
export function hasConflictMarkers(content: string): boolean {
  return CONFLICT_MARKER.test(content);
}
