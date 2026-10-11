# AI CORS Proxy (`server/proxy.mjs`)

A small, **standalone HTTP proxy** that fixes the browser CORS error the AI
panel hits when it calls an LLM provider directly. The browser talks to the
proxy, and the proxy forwards the request to the real provider server-side,
where CORS does not apply. The response comes back with CORS headers added.

- **Zero dependencies** — Node built-ins and the global `fetch` only (Node ≥ 18).
- **Does not touch the app** — no build step, no code changes; it just forwards
  requests.
- **Default upstream is [OpenCode Go](https://opencode.ai/docs/go/)**, but any
  OpenAI-compatible provider works.

```
Browser  ──►  proxy (:8787, adds CORS)  ──►  provider
```

## Quick start

```bash
npm run proxy
# AI proxy listening on http://localhost:8787
#   upstream: https://opencode.ai/zen/go/v1
#   AI panel "Base URL" -> http://localhost:8787
```

Then open the app, go to **AI panel → Settings**, and **replace the whole
provider Base URL with the proxy URL** (`http://localhost:8787`).

| Provider | Provider Base URL | Base URL in the AI panel |
| --- | --- | --- |
| OpenCode Go | `https://opencode.ai/zen/go/v1` | `http://localhost:8787` |
| OpenAI | `https://api.openai.com/v1` | `http://localhost:8787`* |
| OpenRouter | `https://openrouter.ai/api/v1` | `http://localhost:8787`* |
| Groq | `https://api.groq.com/openai/v1` | `http://localhost:8787`* |
| Local (Ollama/llama.cpp) | `http://localhost:11434/v1` | `http://localhost:8787`* |

\* For non-default providers, set `UPSTREAM` to that provider's Base URL (see
below). The panel Base URL is always just `http://localhost:8787`.

Because the proxy only prepends the upstream, the panel Base URL is the same for
every provider — the provider is chosen entirely by the `UPSTREAM` variable.

Paste your API key in the panel as usual. The proxy forwards the `Authorization`
header (and `x-opencode-session`, required by OpenCode Go) untouched and never
stores the key.

## Choosing a provider

Set `UPSTREAM` to the provider's full Base URL (it may include a path):

```bash
# OpenCode Go (default)
UPSTREAM=https://opencode.ai/zen/go/v1 npm run proxy

# OpenAI
UPSTREAM=https://api.openai.com/v1 npm run proxy

# A local OpenAI-compatible server
UPSTREAM=http://localhost:11434/v1 npm run proxy
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8787` | Port to listen on |
| `HOST` | `0.0.0.0` | Interface to bind |
| `UPSTREAM` | `https://opencode.ai/zen/go/v1` | Full provider Base URL |
| `CORS_ORIGIN` | `*` | `Access-Control-Allow-Origin` value |
| `MAX_BODY_BYTES` | `10485760` | Max request body size (10 MiB) |
| `QUIET` | *(empty)* | `true` to silence request logs |

Endpoints: `GET /` returns usage info, `GET /healthz` returns
`{ "ok": true, "upstream": "..." }`.

## Security notes

- The API key is **never stored** on the server. The browser sends it on every
  request via the `Authorization` header, and the proxy forwards it.
- The upstream is **fixed by configuration** (not taken from the request), so the
  proxy cannot be abused as an open SSRF relay.
- When deploying publicly, restrict `CORS_ORIGIN` to the app's origin and/or put
  the proxy behind your own authentication.

## OpenCode Go notes

OpenCode Go requires an `x-opencode-session` header on every request for
routing and prompt caching. The AI panel already sends it, and the proxy
forwards it verbatim, so no extra setup is needed.
