/**
 * `@em/spec` — the shared specification document contract.
 *
 * Owns the spec's types, YAML emitter, parser and type-hoisting, so the board
 * app (which produces the document) and the code generator (which consumes it)
 * agree on one shape.
 */
export * from "./types";
export * from "./schema";
export * from "./yaml";
export * from "./parse";
export * from "./hoist";
export * from "./naming";
