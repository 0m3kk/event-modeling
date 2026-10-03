# Event Modeling

A local-first, canvas-based tool for **Event Modeling** — mapping systems as vertical slices of commands, events, constraints, and read models. It runs both as a **desktop app** (Tauri) and in the **browser** (Vite), and ships with an AI assistant for generating and editing models.

The modeling philosophy is opinionated around **CQRS**, **Event Sourcing**, and **Dynamic Consistency Boundaries (DCB)**.

## Features

### Modeling canvas
- Infinite, pannable/zoomable canvas rendered with Pixi.js (GPU-accelerated, spatially indexed for fast hit-testing).
- **Write slices**: Command → Constraint(s) → Event(s).
- **Read slices**: Query → State (optional Constraint layer).
- **8 storm card kinds**: command, event, actor, state, constraint, external, query, and BDD.
- **Data model nodes**: object, enum, array, and wrapper types, with 12 primitive field types (`String`, `Number`, `Boolean`, `UUID`, `DateTime`, `Date`, `Email`, `URL`, `URI`, `JSON`, `Any`, `Void`, plus `[]` arrays).
- **DCB support**: query items (event types + tag fields) that define consistency boundaries.
- **RBAC**: `resource:verb:scope` action strings on commands/queries, with wildcard permissions on actor cards.
- **BDD cards**: Given/When/Then steps referencing events, commands, queries, states, errors, and externals.
- **Groups & sections**: nestable groups with custom bounds and styles; connectors, freeform lines, sticky notes, and text boxes.
- **Field validation**: min/max length, pattern, format, ranges, allowed values, and item counts.
- Reference copies that share content and style but keep independent positions.
- Auto-layout ("Arrange Storm Lanes") and arrange-slice helpers, magnetic snapping, alignment guides, align/distribute.

### Editing experience
- Undo/redo with debounced history (500 steps) — a whole AI turn collapses into one undo step.
- Marquee multi-selection, resize handles with auto-fit width, inline text editing, type selector, and rich popovers for descriptions, tags, actions, validation, BDD steps, and DCB query items.
- Search across cards, fields, tags, and rules (`Cmd/Ctrl+F`).
- Light/dark themes and localization (**English** and **Vietnamese**).

### AI assistant
- OpenAI-compatible chat client (works with OpenAI, or local endpoints like Ollama / LM Studio).
- Tool-calling agent with 25 canvas/storm/model tools and a fallback JSON-plan mode for endpoints without tool support.
- Context auto-compaction for long conversations.

### Files & export
- `.storm` / `.json` project files (versioned, validated).
- **JSON Schema export** (draft-07 and 2020-12) covering model nodes and storm payloads.
- **Image export**: PNG at multiple resolutions and vector SVG.
- Auto-save to `localStorage` plus a one-slot backup with restore.
- **Google Drive** integration for open/save/export (PKCE OAuth; loopback flow on desktop).

## Desktop and web apps

The same React/Pixi codebase ships to two targets:

- **Web app** — a standard Vite SPA you can host anywhere. Uses the in-app **File** and **Export** menus, `Cmd/Ctrl+S` to save, browser download/upload for project files, and Google Identity Services popup sign-in.
- **Desktop app** — a Tauri 2 native shell for macOS, Windows, and Linux. Uses the **native OS menu bar** (File / Edit / View / Export / Window) with real accelerators, opens/saves files natively, and signs in to Google through the system browser with a loopback OAuth redirect (the webview blocks the GIS popup).

Platform differences are detected at runtime (`src/utils/platform.ts`), so the UI adapts automatically.

### Run the web app

```bash
pnpm dev
```

### Run the desktop app

```bash
pnpm tauri dev
```

## Tech stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4
- **Canvas**: Pixi.js 8 + pixi-viewport, rbush spatial index
- **State**: Zustand + zundo (temporal undo/redo), Zod for schemas
- **i18n**: i18next + react-i18next
- **Desktop**: Tauri 2 (Rust) with http, opener, and OAuth plugins
- **Tooling**: pnpm, Vitest, ESLint, Prettier

## Getting started

### Prerequisites

- **Node.js 22+** and **pnpm 12+**
- For the desktop build: a [Rust toolchain](https://www.rust-lang.org/tools/install) and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/)

### Install

```bash
pnpm install
```

### Build

```bash
pnpm build        # type-check + build the web bundle into dist/
pnpm tauri build  # produce a native desktop bundle
```

## Google Drive setup (optional)

Google Drive integration is configured through environment variables. Copy `.env.example` to `.env.local` and fill in the values you need:

| Variable | Purpose |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | OAuth "Web application" client for the browser build |
| `VITE_GOOGLE_DESKTOP_CLIENT_ID` | OAuth "Desktop app" client for the Tauri build (loopback redirect) |
| `VITE_GOOGLE_DESKTOP_CLIENT_SECRET` | Optional; only if your client requires a secret on token exchange |
| `VITE_GOOGLE_ACCESS_TOKEN` | Optional; a direct token for local development/testing |

The desktop app signs in through the system browser with a loopback redirect (`http://127.0.0.1:<port>`), which requires a **Desktop app** OAuth client — a Web application client will not work there.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server |
| `pnpm build` | Type-check and build the web bundle |
| `pnpm preview` | Preview the production build |
| `pnpm test` | Run the test suite once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | Run ESLint |
| `pnpm tauri` | Tauri CLI (e.g. `pnpm tauri dev`, `pnpm tauri build`) |
| `pnpm bump` | Bump the version and trigger a release (`:patch`, `:minor`, `:major`) |

## Project structure

```
src/
  ai/           AI assistant: client, agent loop, prompt, tools
  components/   React UI (header, toolbar, canvas, modals, popovers)
  constants/    Canvas/storm/model/menu constants
  engine/       Pixi.js canvas engine, layers, renderers, spatial index
  hooks/        useAutoSave, useTheme, useResizablePanel
  i18n/         i18next setup and locales (en, vi)
  store/        Zustand store, types, history debounce/batching
  types/        Domain type definitions
  utils/        Pure logic: geometry, routing, export, file IO, Google Drive
src-tauri/      Rust/Tauri shell: native menu, plugins, config
```

## License

[MIT](LICENSE)

## Releases

The `bump` script (`scripts/bump-version.sh`) bumps the version in `package.json` and `src-tauri/tauri.conf.json`, commits, tags, pushes, and creates a GitHub release. Publishing a release triggers the `Release` workflow, which builds a macOS (ARM64) bundle and uploads the DMG. CI (`.github/workflows/ci.yml`) runs lint, type-check, tests, and the web build on every push and pull request.
