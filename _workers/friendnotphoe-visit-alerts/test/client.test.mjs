import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const CLIENT = new URL("../../../assets/visit-note.js", import.meta.url);
const ENDPOINT = "https://friendnotphoe-visit-alerts.example.workers.dev/v1/visit";

function load() {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(CLIENT, "utf8"), { module, URL, JSON, Date });
  return module.exports;
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function browser({ endpoint = ENDPOINT, href = "https://friendnotphoe.com/#card/c-b?x=1", storage, nav = {} } = {}) {
  const url = new URL(href);
  const calls = [];
  const g = {
    document: { currentScript: { getAttribute: (n) => (n === "data-endpoint" ? endpoint : null) } },
    location: { protocol: url.protocol, hostname: url.hostname, pathname: url.pathname, href: url.href },
    navigator: nav,
    sessionStorage: storage === undefined ? memoryStorage() : storage,
    crypto: { randomUUID: () => "3b241101-e2bb-4255-8caf-4136c566a962" },
    fetch: (u, init) => (calls.push([u, init]), Promise.resolve(new Response(null, { status: 200 }))),
  };
  return { g, calls };
}

const { run, safePath } = load();

test("does nothing without an endpoint (shipped default)", () => {
  for (const endpoint of [null, "", "http://insecure.test/v1/visit", "not a url", `${ENDPOINT}?x=1`]) {
    const { g, calls } = browser({ endpoint });
    assert.equal(run(g), "off");
    assert.equal(calls.length, 0);
  }
});

test("sends exactly one minimal payload per session", () => {
  const storage = memoryStorage();
  const first = browser({ storage });
  assert.equal(run(first.g), "sent");
  assert.equal(first.calls.length, 1);

  const [url, init] = first.calls[0];
  assert.equal(url, ENDPOINT);
  assert.equal(init.method, "POST");
  assert.equal(init.credentials, "omit");
  assert.equal(init.referrerPolicy, "no-referrer");
  assert.equal(init.keepalive, true);
  assert.equal(JSON.stringify(init.headers), JSON.stringify({ "Content-Type": "application/json" }));
  const body = JSON.parse(init.body);
  assert.deepEqual([...Object.keys(body)].sort(), ["event_id", "occurred_at", "path", "site", "test", "type"]);
  assert.equal(body.type, "visit");
  assert.equal(body.site, "friendnotphoe.com");
  assert.equal(body.path, "/");
  assert.equal(body.test, false);
  assert.ok(!init.body.includes("card") && !init.body.includes("x=1"), "no hash or query");

  const second = browser({ storage });
  assert.equal(run(second.g), "throttled");
  assert.equal(second.calls.length, 0);
});

test("fails safe (no send) when sessionStorage throws or does not persist", () => {
  const throwing = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); } };
  const forgetful = { getItem: () => null, setItem() {} };
  for (const storage of [throwing, forgetful, null]) {
    const { g, calls } = browser({ storage });
    assert.equal(run(g), "throttled");
    assert.equal(calls.length, 0);
  }
  const { g, calls } = browser();
  Object.defineProperty(g, "sessionStorage", { get() { throw new Error("SecurityError"); } });
  assert.equal(run(g), "throttled");
  assert.equal(calls.length, 0);
});

test("only runs on the public https site", () => {
  for (const href of ["http://localhost:8080/", "https://example.com/", "http://friendnotphoe.com/"]) {
    const { g, calls } = browser({ href });
    assert.equal(run(g), "wrong-host");
    assert.equal(calls.length, 0);
  }
  assert.equal(run(browser({ href: "https://www.friendnotphoe.com/" }).g), "sent");
});

test("honors Global Privacy Control and Do Not Track", () => {
  for (const nav of [{ globalPrivacyControl: true }, { doNotTrack: "1" }]) {
    const { g, calls } = browser({ nav });
    assert.equal(run(g), "opted-out");
    assert.equal(calls.length, 0);
  }
});

test("network failures are swallowed", async () => {
  const { g } = browser();
  g.fetch = () => Promise.reject(new TypeError("offline"));
  assert.equal(run(g), "sent");
  await new Promise((r) => setTimeout(r, 0));
});

test("path sanitizer keeps bare pathnames only", () => {
  assert.equal(safePath("/"), "/");
  assert.equal(safePath("/index.html"), "/index.html");
  for (const p of ["/a b", "/%2e", "//evil", "/../x", "", undefined, "/" + "a".repeat(64)]) {
    assert.equal(safePath(p), "/");
  }
});
