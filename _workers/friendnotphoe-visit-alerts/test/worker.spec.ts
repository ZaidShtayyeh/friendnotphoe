import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { MAX_BODY_BYTES, parsePayload } from "../src/index";

const ORIGIN = "https://friendnotphoe.com";
const ENDPOINT = "https://friendnotphoe-visit-alerts.example.workers.dev/v1/visit";
const SECRET_URL = "https://routine.test.invalid/hook/secret-path-123";
const SECRET_TOKEN = "sk-test-bearer-abc";
const VISITOR_IP = "203.0.113.77";
const VISITOR_UA = "Mozilla/5.0 (VisitorAgent/9.9)";
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const allow = { limit: async () => ({ success: true }) } as unknown as RateLimit;
const deny = { limit: async () => ({ success: false }) } as unknown as RateLimit;

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    CLIENT_LIMITER: allow,
    EVENT_DEDUPE_LIMITER: allow,
    FORWARD_LIMITER: allow,
    ROUTINE_WEBHOOK_URL: SECRET_URL,
    ROUTINE_WEBHOOK_BEARER: SECRET_TOKEN,
    FORWARDING_ENABLED: "true",
    FORWARD_TEST_EVENTS: "false",
    ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "visit",
    site: "friendnotphoe.com",
    event_id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    path: "/",
    test: false,
    ...overrides,
  };
}

function visit(body: unknown, init: { origin?: string | null; method?: string; ctype?: string; ip?: string } = {}) {
  const headers = new Headers({
    "Content-Type": init.ctype ?? "application/json",
    "CF-Connecting-IP": init.ip ?? VISITOR_IP,
    "User-Agent": VISITOR_UA,
  });
  if (init.origin !== null) headers.set("Origin", init.origin ?? ORIGIN);
  const method = init.method ?? "POST";
  return new IncomingRequest(ENDPOINT, {
    method,
    headers,
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

let upstream: ReturnType<typeof vi.fn>;
let logs: string[];

beforeEach(() => {
  upstream = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", upstream);
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("routing and CORS", () => {
  it("404s other paths without touching upstream", async () => {
    const res = await worker.fetch(new IncomingRequest("https://x.workers.dev/"), testEnv());
    expect(res.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("answers preflight only for an exact allowed origin", async () => {
    const ok = await worker.fetch(visit(null, { method: "OPTIONS" }), testEnv());
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(ok.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");

    for (const origin of ["https://friendnotphoe.com.evil.test", "http://friendnotphoe.com", "https://evil.test", "null"]) {
      const res = await worker.fetch(visit(null, { method: "OPTIONS", origin }), testEnv());
      expect(res.status).toBe(403);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("rejects missing or foreign Origin before forwarding", async () => {
    for (const origin of [null, "https://evil.test"]) {
      const res = await worker.fetch(visit(payload(), { origin }), testEnv());
      expect(res.status).toBe(403);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects other methods and content types", async () => {
    expect((await worker.fetch(visit(null, { method: "GET" }), testEnv())).status).toBe(405);
    expect((await worker.fetch(visit(payload(), { ctype: "text/plain" }), testEnv())).status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("body and schema", () => {
  it("rejects oversized bodies", async () => {
    const big = JSON.stringify(payload({ path: "/" + "a".repeat(MAX_BODY_BYTES) }));
    const res = await worker.fetch(visit(big), testEnv());
    expect(res.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and wrong shapes", async () => {
    const bad = [
      "{not json",
      "[]",
      "null",
      payload({ extra: 1 }),
      payload({ type: "click" }),
      payload({ site: "evil.test" }),
      payload({ event_id: "not-a-uuid" }),
      payload({ test: "false" }),
      payload({ occurred_at: "2001-01-01T00:00:00.000Z" }),
      payload({ occurred_at: "yesterday" }),
    ];
    for (const body of bad) {
      const res = await worker.fetch(visit(body), testEnv());
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const missing = payload();
    delete missing.path;
    expect((await worker.fetch(visit(missing), testEnv())).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("accepts only bare pathnames", () => {
    const now = Date.now();
    const ok = (path: string) => parsePayload(JSON.stringify(payload({ path })), "friendnotphoe.com", now) !== null;
    expect(ok("/")).toBe(true);
    expect(ok("/index.html")).toBe(true);
    for (const path of ["", "/?q=1", "/#card/c-b", "/a%20b", "/a b", "https://x/", "//evil", "/../x", "/" + "a".repeat(64)]) {
      expect(ok(path), path).toBe(false);
    }
  });
});

describe("abuse limits run before forwarding", () => {
  it("client limiter blocks before body parsing", async () => {
    const res = await worker.fetch(visit("{not json"), testEnv({ CLIENT_LIMITER: deny }));
    expect(res.status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("duplicate event ids are not forwarded", async () => {
    const res = await worker.fetch(visit(payload()), testEnv({ EVENT_DEDUPE_LIMITER: deny }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, forwarded: false, reason: "duplicate" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forward limiter caps upstream calls", async () => {
    const res = await worker.fetch(visit(payload()), testEnv({ FORWARD_LIMITER: deny }));
    expect(res.status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("limiters are keyed by a hash, never the raw IP", async () => {
    const keys: string[] = [];
    const spy = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: true }) } as unknown as RateLimit;
    await worker.fetch(visit(payload()), testEnv({ CLIENT_LIMITER: spy }));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{24}$/);
    expect(keys[0]).not.toContain(VISITOR_IP);
  });

  it("real rate limit bindings enforce the configured limits", async () => {
    const realEnv = testEnv({
      CLIENT_LIMITER: env.CLIENT_LIMITER,
      EVENT_DEDUPE_LIMITER: env.EVENT_DEDUPE_LIMITER,
      FORWARD_LIMITER: env.FORWARD_LIMITER,
    });
    const sameEvent = payload();
    const first = await worker.fetch(visit(sameEvent, { ip: "198.51.100.1" }), realEnv);
    expect(first.status).toBe(200);
    const again = await worker.fetch(visit(sameEvent, { ip: "198.51.100.2" }), realEnv);
    expect(await again.json()).toMatchObject({ forwarded: false, reason: "duplicate" });

    const second = await worker.fetch(visit(payload(), { ip: "198.51.100.3" }), realEnv);
    expect(second.status).toBe(200);
    const third = await worker.fetch(visit(payload(), { ip: "198.51.100.4" }), realEnv);
    expect(third.status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(2);

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await worker.fetch(visit("{bad", { ip: "198.51.100.9" }), realEnv)).status);
    }
    expect(statuses.slice(0, 4)).toEqual([400, 400, 400, 400]);
    expect(statuses.slice(4)).toEqual([429, 429]);
  });
});

describe("fail closed", () => {
  it("returns 503 without calling upstream when secrets are unset or invalid", async () => {
    const cases: Partial<Env>[] = [
      { ROUTINE_WEBHOOK_URL: undefined as unknown as string },
      { ROUTINE_WEBHOOK_BEARER: undefined as unknown as string },
      { ROUTINE_WEBHOOK_URL: "" },
      { ROUTINE_WEBHOOK_URL: "http://plain-http.test/hook" },
      { ROUTINE_WEBHOOK_URL: "not a url" },
      { ROUTINE_WEBHOOK_BEARER: "Bearer " },
      { ROUTINE_WEBHOOK_BEARER: "has space" },
    ];
    for (const c of cases) {
      const res = await worker.fetch(visit(payload()), testEnv(c));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, forwarded: false, reason: "not_configured" });
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns 503 while the kill switch is off", async () => {
    const res = await worker.fetch(visit(payload()), testEnv({ FORWARDING_ENABLED: "false" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ forwarded: false, reason: "disabled" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("wrangler.jsonc ships with forwarding off and no secret values", () => {
    expect(env.FORWARDING_ENABLED).toBe("false");
    expect(env.FORWARD_TEST_EVENTS).toBe("false");
    expect(env.ROUTINE_WEBHOOK_URL).toBeUndefined();
    expect(env.ROUTINE_WEBHOOK_BEARER).toBeUndefined();
  });

  it("the shipped config (secrets unset) fails closed end to end", async () => {
    const shipped = { ...env, CLIENT_LIMITER: allow, EVENT_DEDUPE_LIMITER: allow, FORWARD_LIMITER: allow };
    const res = await worker.fetch(visit(payload()), shipped);
    expect(res.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("test events", () => {
  it("are validated but not forwarded by default", async () => {
    const res = await worker.fetch(visit(payload({ test: true })), testEnv());
    expect(await res.json()).toEqual({ ok: true, forwarded: false, reason: "test" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("are forwarded with test:true when FORWARD_TEST_EVENTS is on", async () => {
    await worker.fetch(visit(payload({ test: true })), testEnv({ FORWARD_TEST_EVENTS: "true" }));
    expect(upstream).toHaveBeenCalledTimes(1);
    const init = upstream.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).test).toBe(true);
  });
});

describe("forwarding", () => {
  it("sends exactly the contract payload with Bearer auth", async () => {
    const body = payload({ path: "/index.html" });
    const res = await worker.fetch(visit(body), testEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, forwarded: true });

    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(SECRET_URL);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${SECRET_TOKEN}`);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect([...headers.keys()].sort()).toEqual(["authorization", "content-type"]);
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(init.body).not.toContain(VISITOR_IP);
    expect(init.body).not.toContain(VISITOR_UA);
  });

  it("accepts a bearer secret pasted with its Bearer prefix", async () => {
    await worker.fetch(visit(payload()), testEnv({ ROUTINE_WEBHOOK_BEARER: `Bearer ${SECRET_TOKEN}` }));
    const init = upstream.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${SECRET_TOKEN}`);
  });

  it("treats every non-200 upstream status as not forwarded", async () => {
    for (const status of [201, 202, 204, 301, 400, 401, 429, 500]) {
      upstream.mockResolvedValueOnce(new Response(null, { status }));
      const res = await worker.fetch(visit(payload()), testEnv());
      expect(res.status, String(status)).toBe(502);
      expect(await res.json()).toEqual({ ok: false, forwarded: false });
    }
  });

  it("handles timeouts and network errors", async () => {
    upstream.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    expect((await worker.fetch(visit(payload()), testEnv())).status).toBe(502);
    upstream.mockRejectedValueOnce(new TypeError("network down"));
    expect((await worker.fetch(visit(payload()), testEnv())).status).toBe(502);
    expect(logs.some((l) => l.includes('"error":"TimeoutError"'))).toBe(true);
  });

  it("aborts a hanging upstream at UPSTREAM_TIMEOUT_MS", async () => {
    upstream.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    const res = await worker.fetch(visit(payload()), testEnv({ UPSTREAM_TIMEOUT_MS: "50" }));
    expect(res.status).toBe(502);
  });
});

describe("privacy-safe logs", () => {
  it("never log secrets, IP, user agent, URLs or event ids", async () => {
    const ids: string[] = [];
    const run = async (overrides: Partial<Env>, body = payload()) => {
      ids.push(body.event_id as string);
      await worker.fetch(visit(body), testEnv(overrides));
    };
    await run({});
    upstream.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await run({});
    upstream.mockRejectedValueOnce(new TypeError(`fetch failed for ${SECRET_URL}`));
    await run({});
    await run({ FORWARDING_ENABLED: "false" });
    await run({ ROUTINE_WEBHOOK_URL: "" });
    await worker.fetch(visit(payload(), { origin: "https://evil.test" }), testEnv());

    expect(logs.length).toBeGreaterThanOrEqual(6);
    const all = logs.join("\n");
    for (const forbidden of [SECRET_URL, "routine.test.invalid", SECRET_TOKEN, VISITOR_IP, VISITOR_UA, "evil.test", ...ids]) {
      expect(all).not.toContain(forbidden);
    }
    for (const line of logs) expect(JSON.parse(line).msg).toBe("visit_note");
  });
});
