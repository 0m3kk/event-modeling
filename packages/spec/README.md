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
| `hoist.ts` | `hoistTypes(spec)` normalises data types into a `types` registry |
| `naming.ts` | `nameKey` plus `snake`/`pascal`/`camel`/`kebab` case helpers |

## Data types

Data containers (Object / Enum / Alias) are defined once in the top-level
`types` registry; every field references them by name:

```yaml
types:
  - object: Profile
    fields:
      - name: id
        type: AccountId
  - alias: AccountId
    of: string
events:
  - name: AccountCreated
    fields:
      - name: profile
        type: Profile
```

Older documents may instead expand a definition **inline at the first field that
references it**. `hoistTypes` accepts both: it lifts inline definitions into
`types`, de-duplicates by name, and rewrites fields to plain names, so a
generator always sees `field.type` as a string.

```ts
import { parseSpecification, hoistTypes } from "@em/spec";

const spec = parseSpecification(source);        // validated
const { spec: flat, types } = hoistTypes(spec); // flat.types + string field types
```
