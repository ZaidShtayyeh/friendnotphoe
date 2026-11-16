export const VISIT_PATH = "/v1/visit";
export const MAX_BODY_BYTES = 512;
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;

const EVENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
// Pathname only: no query, hash, percent-escapes, or spaces can pass.
export const PATH_RE = /^\/[A-Za-z0-9._~\-/]{0,63}$/;
const PAYLOAD_KEYS = ["event_id", "occurred_at", "path", "site", "test", "type"];

export interface VisitPayload {
  type: "visit";
  site: string;
  event_id: string;
  occurred_at: string;
  path: string;
  test: boolean;
}

type Outcome =
  | "forwarded"
  | "upstream_rejected"
  | "upstream_error"
  | "not_configured"
  | "disabled"
  | "test_not_forwarded"
  | "duplicate"
  | "rate_limited"
  | "invalid"
  | "forbidden_origin";

function log(outcome: Outcome, extra: Record<string, string | number | boolean> = {}): void {
  // Deliberately excludes IP, user agent, URLs, headers, event_id and secrets.
  console.log(JSON.stringify({ msg: "visit_note", outcome, ...extra }));
}

function allowedOrigins(env: Env): Set<string> {
  return new Set(
    env.ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

async function readBounded(request: Request, maxBytes: number): Promise<string | null> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && !(Number(declared) <= maxBytes)) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buf);
  } catch {
    return null;
  }
}

export function parsePayload(text: string, site: string, now: number): VisitPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  if (keys.length !== PAYLOAD_KEYS.length || keys.some((k, i) => k !== PAYLOAD_KEYS[i])) return null;

  const { type, event_id, occurred_at, path, test } = obj;
  if (type !== "visit" || obj.site !== site) return null;
  if (typeof event_id !== "string" || !EVENT_ID_RE.test(event_id)) return null;
  if (typeof occurred_at !== "string" || !ISO_RE.test(occurred_at)) return null;
  const at = Date.parse(occurred_at);
  if (!Number.isFinite(at) || Math.abs(now - at) > MAX_CLOCK_SKEW_MS) return null;
  if (typeof path !== "string" || !PATH_RE.test(path) || path.includes("//") || path.includes("..")) return null;
  if (typeof test !== "boolean") return null;

  return { type: "visit", site, event_id, occurred_at, path, test };
}

// Hashing keeps the raw address out of the limiter key; the key lives only in the
// limiter's short counter window and is never logged or forwarded.
async function clientKey(request: Request): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}|${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bearerToken(raw: string): string | null {
  const token = raw.replace(/^\s*Bearer(?:\s+|$)/i, "").trim();
  return token && /^[\x21-\x7e]+$/.test(token) ? token : null;
}

function webhookUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function forward(env: Env, url: string, token: string, payload: VisitPayload): Promise<Outcome> {
  const timeout = Number(env.UPSTREAM_TIMEOUT_MS) > 0 ? Number(env.UPSTREAM_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
    });
    await res.body?.cancel();
    // Per the routines contract, only HTTP 200 means a run was accepted (not completed).
    if (res.status === 200) {
      log("forwarded", { test: payload.test });
      return "forwarded";
    }
    log("upstream_rejected", { status: res.status, test: payload.test });
    return "upstream_rejected";
  } catch (err) {
    log("upstream_error", { error: err instanceof Error ? err.name : "unknown", test: payload.test });
    return "upstream_error";
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname !== VISIT_PATH) return json(404, { ok: false });

    const origin = request.headers.get("Origin") ?? "";
    if (!allowedOrigins(env).has(origin)) {
      log("forbidden_origin");
      return json(403, { ok: false });
    }
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json(405, { ok: false }, { ...cors, Allow: "POST, OPTIONS" });

    const ctype = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (ctype !== "application/json") {
      log("invalid", { reason: "content_type" });
      return json(415, { ok: false }, cors);
    }

    const { success: clientOk } = await env.CLIENT_LIMITER.limit({ key: await clientKey(request) });
    if (!clientOk) {
      log("rate_limited", { limiter: "client" });
      return json(429, { ok: false, forwarded: false }, { ...cors, "Retry-After": "60" });
    }

    const text = await readBounded(request, MAX_BODY_BYTES);
    if (text === null) {
      log("invalid", { reason: "body_size_or_encoding" });
      return json(413, { ok: false, forwarded: false }, cors);
    }
    const payload = parsePayload(text, env.SITE, Date.now());
    if (!payload) {
      log("invalid", { reason: "schema" });
      return json(400, { ok: false, forwarded: false }, cors);
    }

    const { success: firstSeen } = await env.EVENT_DEDUPE_LIMITER.limit({ key: payload.event_id });
    if (!firstSeen) {
      log("duplicate");
      return json(200, { ok: true, forwarded: false, reason: "duplicate" }, cors);
    }

    if (payload.test && env.FORWARD_TEST_EVENTS !== "true") {
      log("test_not_forwarded");
      return json(200, { ok: true, forwarded: false, reason: "test" }, cors);
    }

    const url = webhookUrl(env.ROUTINE_WEBHOOK_URL ?? "");
    const token = bearerToken(env.ROUTINE_WEBHOOK_BEARER ?? "");
    if (!url || !token) {
      log("not_configured");
      return json(503, { ok: false, forwarded: false, reason: "not_configured" }, cors);
    }
    if (env.FORWARDING_ENABLED !== "true") {
      log("disabled");
      return json(503, { ok: false, forwarded: false, reason: "disabled" }, cors);
    }

    const { success: forwardOk } = await env.FORWARD_LIMITER.limit({ key: "routine" });
    if (!forwardOk) {
      log("rate_limited", { limiter: "forward" });
      return json(429, { ok: false, forwarded: false }, { ...cors, "Retry-After": "60" });
    }

    const outcome = await forward(env, url, token, payload);
    if (outcome === "forwarded") return json(200, { ok: true, forwarded: true }, cors);
    return json(502, { ok: false, forwarded: false }, cors);
  },
} satisfies ExportedHandler<Env>;
