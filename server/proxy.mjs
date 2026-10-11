#!/usr/bin/env node
/**
 * Tiny CORS proxy for the Event Modeling Studio AI panel.
 *
 * Browsers block direct calls to most LLM providers because the provider does
 * not return CORS headers. This proxy sits in between: it accepts requests from
 * the browser, forwards them server-side to the provider, and returns the
 * response with CORS headers added.
 *
 * It is intentionally standalone: zero dependencies (Node built-ins only) and
 * it does NOT touch or require the app build. To use it, open the AI panel
 * settings and replace the whole provider "Base URL" with the proxy address.
 * Default upstream is OpenCode Go:
 *
 *     https://opencode.ai/zen/go/v1   ->   http://localhost:8787
 *
 * Every request path is forwarded verbatim to the upstream, so any
 * OpenAI-compatible API works (OpenCode Go, OpenAI, OpenRouter, Groq, a local
 * llama.cpp/Ollama server, ...). The API key in the Authorization header and
 * the x-opencode-session header are forwarded untouched and never stored.
 *
 * Routes:
 *   ANY  /*        -> <UPSTREAM><path><query>
 *   GET  /         -> usage info
 *   GET  /healthz  -> { ok, upstream }
 *
 * Configuration (all optional, via environment variables):
 *   PORT           Port to listen on. Default 8787.
 *   HOST           Interface to bind. Default 0.0.0.0.
 *   UPSTREAM       Full provider base URL (may include a path).
 *                  Default https://opencode.ai/zen/go/v1.
 *   CORS_ORIGIN    Access-Control-Allow-Origin. Default *.
 *   MAX_BODY_BYTES Max request body size. Default 10 MiB.
 *   QUIET          "true" to silence request logs.
 *
 * Usage:
 *   node server/proxy.mjs
 *   UPSTREAM=https://api.openai.com/v1 PORT=9000 node server/proxy.mjs
 */
import http from "node:http";
import { Readable } from "node:stream";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const UPSTREAM = (process.env.UPSTREAM || "https://opencode.ai/zen/go/v1").replace(/\/+$/, "");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 10 * 1024 * 1024);
const QUIET = process.env.QUIET === "true";

// Validate the upstream once at startup so a typo fails fast.
const upstreamUrl = new URL(UPSTREAM);
if (upstreamUrl.protocol !== "https:" && upstreamUrl.protocol !== "http:") {
  throw new Error(`UPSTREAM must be an http(s) URL, got: ${UPSTREAM}`);
}

/** Hop-by-hop headers (RFC 7230) that must not be forwarded. */
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "content-length",
  "content-encoding",
  "accept-encoding",
  "origin",
  "referer",
]);

function log(...args) {
  if (!QUIET) console.log(...args);
}

function corsHeaders() {
  const headers = {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-opencode-session",
    "Access-Control-Max-Age": "86400",
  };
  if (CORS_ORIGIN !== "*") headers["Vary"] = "Origin";
  return headers;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** Reads the full request body, rejecting payloads above MAX_BODY. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Forwards one request to the upstream and streams the response back. */
async function handleProxy(req, res, url) {
  const target = `${UPSTREAM}${url.pathname}${url.search}`;

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(key) || value === undefined) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 413, { error: "payload_too_large" });
      return;
    }
  }

  log(`-> ${req.method} ${url.pathname} => ${target}`);

  let upstreamRes;
  try {
    upstreamRes = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (err) {
    log(`!! upstream unreachable: ${err?.message || err}`);
    sendJson(res, 502, {
      error: "upstream_unreachable",
      message: String(err?.message || err),
    });
    return;
  }

  log(`<- ${upstreamRes.status} ${target}`);

  const responseHeaders = { ...corsHeaders() };
  upstreamRes.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key)) return;
    if (key.startsWith("access-control-")) return; // ours wins
    responseHeaders[key] = value;
  });

  res.writeHead(upstreamRes.status, responseHeaders);
  if (!upstreamRes.body) {
    res.end();
    return;
  }
  Readable.fromWeb(upstreamRes.body).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (url.pathname === "/healthz") {
    sendJson(res, 200, { ok: true, upstream: UPSTREAM });
    return;
  }

  // Root returns usage info instead of proxying (the upstream base has a path).
  if (url.pathname === "/") {
    sendJson(res, 200, {
      ok: true,
      service: "ai-cors-proxy",
      upstream: UPSTREAM,
      usage: `Set the AI panel "Base URL" to http://localhost:${PORT}`,
    });
    return;
  }

  await handleProxy(req, res, url);
});

server.listen(PORT, HOST, () => {
  log(`AI proxy listening on http://localhost:${PORT}`);
  log(`  upstream: ${UPSTREAM}`);
  log(`  AI panel "Base URL" -> http://localhost:${PORT}`);
});
