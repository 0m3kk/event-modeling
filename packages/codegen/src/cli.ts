/**
 * Command-line interface.
 *
 * Commands:
 *   init [dir]              scaffold codegen.config.ts
 *   gen [spec]              generate the crate
 *   eject [dir]             copy the built-in templates out for editing
 *   new-template <name>     create a starter user template
 *
 * Flags parse loosely: `-o/--out`, `-c/--config`, `--spec`, `--templates`,
 * `--dry-run`, `--check`, `--force`, `--no-rustfmt`.
 */
import process from "node:process";
import path from "node:path";
import { ejectTemplates } from "./eject";
import { run } from "./pipeline";
import { builtinTemplatesPath, initConfig, newTemplate } from "./scaffold";

const HELP = `em-codegen — generate a Rust crate from a domain specification.

Usage:
  em-codegen init [dir]                 Create codegen.config.ts
  em-codegen gen [spec] [options]       Generate the crate
  em-codegen eject [dir]                Copy the built-in templates out
  em-codegen new-template <name>        Create a starter user template

Options for "gen":
  -o, --out <dir>     Override the output directory
  -c, --config <file> Use a specific config file
      --spec <file>   Override the spec path
      --dry-run       Render without writing
      --check         Report files that are missing or out of date (CI)
      --force         Overwrite files edited since the last run
      --no-rustfmt    Skip rustfmt post-processing

Options for "eject" / "new-template":
      --dir <dir>     Target directory (default: .codegen/templates)
`;

const BOOLEAN_FLAGS = new Set([
  "dry-run",
  "dry",
  "check",
  "force",
  "no-rustfmt",
  "rustfmt",
  "help",
  "h",
  "version",
  "v",
]);

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (!BOOLEAN_FLAGS.has(key) && next !== undefined && !next.startsWith("-")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const key = arg.slice(1);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
    } else {
      positionals.push(arg);
    }
  }

  return { command, positionals, flags };
}

function flagString(flags: Map<string, string | boolean>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = flags.get(key);
    if (typeof value === "string") return value;
  }
  return undefined;
}

function flagBool(flags: Map<string, string | boolean>, ...keys: string[]): boolean {
  return keys.some((key) => flags.get(key) === true);
}

async function cmdGen(parsed: ParsedArgs, cwd: string): Promise<number> {
  const spec = flagString(parsed.flags, "spec") ?? parsed.positionals[0];
  const result = await run({
    cwd,
    configPath: flagString(parsed.flags, "c", "config"),
    specOverride: spec,
    outOverride: flagString(parsed.flags, "o", "out"),
    dryRun: flagBool(parsed.flags, "dry-run", "dry"),
    check: flagBool(parsed.flags, "check"),
    force: flagBool(parsed.flags, "force"),
    rustfmt: flagBool(parsed.flags, "no-rustfmt") ? false : undefined,
    log: (message) => console.error(message),
  });

  const total = result.files.length;
  if (result.drifted.length > 0) {
    console.error(`Generation is out of date (${result.drifted.length}/${total} files):`);
    for (const file of result.drifted) console.error(`  ${file}`);
    return 1;
  }
  if (flagBool(parsed.flags, "check")) {
    console.log(`Up to date: ${total} files.`);
    return 0;
  }
  if (flagBool(parsed.flags, "dry-run", "dry")) {
    console.log(`Would write ${total} files to ${result.config.outDir}:`);
    for (const file of result.files) console.log(`  ${file.path}`);
    return 0;
  }
  console.log(
    `Generated ${total} files in ${result.config.outDir} ` +
      `(${result.written.length} written, ${result.unchanged.length} unchanged, ${result.skipped.length} skipped).`,
  );
  for (const file of result.skipped) {
    console.error(`  skipped (edited by hand, use --force): ${file}`);
  }
  return 0;
}

async function cmdInit(parsed: ParsedArgs, cwd: string): Promise<number> {
  const dir = parsed.positionals[0] ? path.resolve(cwd, parsed.positionals[0]) : cwd;
  const target = await initConfig(dir);
  console.log(`Created ${path.relative(cwd, target) || target}`);
  console.log("Edit it, then run `em-codegen gen`.");
  return 0;
}

async function cmdEject(parsed: ParsedArgs, cwd: string): Promise<number> {
  const dir = flagString(parsed.flags, "dir") ?? parsed.positionals[0];
  const target = dir ? path.resolve(cwd, dir) : path.join(cwd, ".codegen", "templates");
  const copied = await ejectTemplates(target);
  console.log(`Copied ${copied.length} templates to ${path.relative(cwd, target) || target}`);
  return 0;
}

async function cmdNewTemplate(parsed: ParsedArgs, cwd: string): Promise<number> {
  const name = parsed.positionals[0];
  if (!name) {
    console.error("Usage: em-codegen new-template <name>");
    return 1;
  }
  const dir = flagString(parsed.flags, "dir") ?? path.join(cwd, ".codegen", "templates");
  const target = await newTemplate(name, dir);
  console.log(`Created ${path.relative(cwd, target) || target}`);
  console.log(`Built-in templates live in ${builtinTemplatesPath()}`);
  return 0;
}

async function main(): Promise<number> {
  const cwd = process.cwd();
  const parsed = parseArgs(process.argv.slice(2));

  if (flagBool(parsed.flags, "help", "h") || parsed.command === "help" || !parsed.command) {
    console.log(HELP);
    return 0;
  }

  switch (parsed.command) {
    case "gen":
    case "generate":
      return cmdGen(parsed, cwd);
    case "init":
      return cmdInit(parsed, cwd);
    case "eject":
      return cmdEject(parsed, cwd);
    case "new-template":
    case "template":
      return cmdNewTemplate(parsed, cwd);
    default:
      console.error(`Unknown command: ${parsed.command}\n`);
      console.log(HELP);
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
