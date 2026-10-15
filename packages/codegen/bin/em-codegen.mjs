#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * A thin shim: it boots the TypeScript implementation through `jiti` so the
 * tool runs straight from source with no build step. The real work lives in
 * `../src/cli.ts`.
 */
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
await jiti.import("../src/cli.ts");
