# `@em/spec`

The shared **specification document contract**.

This package owns the shape of the domain specification the board exports
(`*.spec.yaml`) and that `@em/codegen` consumes, so the producer and the
consumer cannot drift apart. The board app imports it to type its spec types and
the YAML emitter; the generator imports it to parse and normalise.

## What's here

| Module | Purpose |
| --- | --- |
| `types.ts` | The document contract: domains, events, commands, fields, data types... |
| `schema.ts` | Zod mirror of the contract, used to validate parsed documents |
| `yaml.ts` | The minimal YAML emitter used by the board's export |
| `parse.ts` | `parseSpecification(source)` -> validated document (or `SpecParseError`) |
| `hoist.ts` | `hoistTypes(spec)` lifts inline Object/Enum/Alias definitions into a `types` registry |
| `naming.ts` | `nameKey` plus `snake`/`pascal`/`camel`/`kebab` case helpers |

## Inline data types

The document expands a data type (Object / Enum / Alias) **inline at the first
field that references it**; later references stay as the plain name. That reads
well but is awkward to generate from, because a field's `type` is either a name
or a nested object. `hoistTypes` normalises it: every field type becomes a
string and the definitions are collected once.

```ts
import { parseSpecification, hoistTypes } from "@em/spec";

const spec = parseSpecification(source);      // validated
const { spec: flat, types } = hoistTypes(spec); // flat.field.type is a string
```
