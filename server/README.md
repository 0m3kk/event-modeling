# AI CORS Proxy (`server/proxy.mjs`)

A small, **standalone HTTP/HTTPS proxy** that fixes the browser CORS error the
AI panel hits when it calls an LLM provider directly. The browser talks to the
proxy, and the proxy forwards the request to the real provider server-side,
where CORS does not apply. The response comes back with CORS headers added.

- **Zero dependencies** — Node built-ins and the global `fetch` only (Node ≥ 18).
- **Does not touch the app** — no build step, no code changes; it just forwards
  requests.
- **Default upstream is [OpenCode Go](https://opencode.ai/docs/go/)**, but any
  OpenAI-compatible provider works.
- **Runs over HTTP or HTTPS** — use HTTPS when the app itself is served over
  HTTPS, otherwise the browser blocks the call as mixed content.

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

If the app is served over HTTPS (or deployed publicly), run the proxy with TLS
instead:

```bash
npm run proxy:https
# AI proxy listening on https://localhost:8787
#   TLS: generated self-signed certificate (server/.certs/localhost.crt)
#   upstream: https://opencode.ai/zen/go/v1
#   AI panel "Base URL" -> https://localhost:8787
```

Then open the app, go to **AI panel → Settings**, and **replace the whole
provider Base URL with the proxy URL** (`http://localhost:8787`, or
`https://localhost:8787` when using TLS).

| Provider | Provider Base URL | Base URL in the AI panel |
| --- | --- | --- |
| OpenCode Go | `https://opencode.ai/zen/go/v1` | `http://localhost:8787` |
| OpenAI | `https://api.openai.com/v1` | `http://localhost:8787`* |
| OpenRouter | `https://openrouter.ai/api/v1` | `http://localhost:8787`* |
| Groq | `https://api.groq.com/openai/v1` | `http://localhost:8787`* |
| Local (Ollama/llama.cpp) | `http://localhost:11434/v1` | `http://localhost:8787`* |

\* For non-default providers, set `UPSTREAM` to that provider's Base URL (see
below). The panel Base URL is always just the proxy address.

Because the proxy only prepends the upstream, the panel Base URL is the same for
every provider — the provider is chosen entirely by the `UPSTREAM` variable.

Paste your API key in the panel as usual. The proxy forwards the `Authorization`
header (and `x-opencode-session`, required by OpenCode Go) untouched and never
stores the key.

## Running over HTTPS

Serving the app over HTTPS (or opening it from a non-localhost origin) means the
browser refuses to call `http://localhost:8787` as mixed content. Enable TLS on
the proxy in one of two ways.

**1. Auto-generated self-signed certificate (quickest):**

```bash
npm run proxy:https
```

The first run creates `server/.certs/localhost.crt` and
`server/.certs/localhost.key` (valid for `localhost` and `127.0.0.1`) using the
system `openssl`, and reuses them on later runs. The directory is gitignored.

Because the certificate is self-signed, open `https://localhost:8787/` once and
accept the browser warning (or trust the certificate in your OS/browser) before
using the AI panel.

**2. Your own certificate (recommended for anything non-local):**

```bash
TLS_CERT=/path/to/fullchain.pem TLS_KEY=/path/to/privkey.pem npm run proxy
```

`TLS_CERT` and `TLS_KEY` may also contain the PEM contents directly instead of a
path. If the key is encrypted, set `TLS_PASSPHRASE`.

> The proxy only needs a certificate that the browser trusts. A reverse proxy
> (Caddy, nginx, a tunnel) terminating TLS in front of this proxy also works —
> in that case run the proxy over plain HTTP and expose it behind HTTPS.

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
| `HTTPS` | *(empty)* | `true` to serve over TLS (same as `--https`) |
| `TLS_CERT` | *(empty)* | PEM certificate path or contents |
| `TLS_KEY` | *(empty)* | PEM private key path or contents |
| `TLS_PASSPHRASE` | *(empty)* | Passphrase for an encrypted private key |

Endpoints: `GET /` returns usage info, `GET /healthz` returns
`{ "ok": true, "upstream": "..." }`.

## Security notes

- The API key is **never stored** on the server. The browser sends it on every
  request via the `Authorization` header, and the proxy forwards it.
- The upstream is **fixed by configuration** (not taken from the request), so the
  proxy cannot be abused as an open SSRF relay.
- When deploying publicly, restrict `CORS_ORIGIN` to the app's origin and/or put
  the proxy behind your own authentication.
- Do not commit the generated `server/.certs/` directory (already gitignored).

## OpenCode Go notes

OpenCode Go requires an `x-opencode-session` header on every request for
routing and prompt caching. The AI panel already sends it, and the proxy
forwards it verbatim, so no extra setup is needed.
