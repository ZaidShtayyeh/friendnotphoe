import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "");
const config = JSON.parse(stripComments(read("../wrangler.jsonc")));
const metadata = JSON.parse(read("../deploy/upload-metadata.json"));

test("the public page points at the owner-reported endpoint once", () => {
  const index = read("../../../index.html");
  const admin = read("../../../admin.html");
  const tag = '<script src="assets/visit-note.js" data-endpoint="https://friendnotphoe-visit-alerts.friendnotphoe.workers.dev/v1/visit" defer></script>';
  assert.equal(index.split(tag).length - 1, 1);
  assert.equal(admin.includes("visit-note"), false);
  assert.equal(config.vars.FORWARDING_ENABLED, "false");
  assert.equal(config.vars.FORWARD_TEST_EVENTS, "false");
});

test("wrangler config is inert and privacy-safe as shipped", () => {
  assert.equal(config.name, "friendnotphoe-visit-alerts");
  assert.equal(config.compatibility_date, "2026-11-06");
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.equal(config.routes, undefined);
  assert.equal(config.route, undefined);
  assert.equal(config.vars.FORWARDING_ENABLED, "false");
  assert.equal(config.vars.FORWARD_TEST_EVENTS, "false");
  assert.equal(config.observability.logs.invocation_logs, false);
  assert.equal(config.observability.traces.enabled, false);
  assert.equal(config.secrets, undefined);
  const raw = read("../wrangler.jsonc");
  assert.ok(!/Bearer\s+\S/.test(raw) && !/ROUTINE_WEBHOOK_URL"\s*:/.test(raw), "no secret values in config");
});

test("rate limit namespaces are unique positive integer strings", () => {
  const ids = config.ratelimits.map((r) => r.namespace_id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of config.ratelimits) {
    assert.match(r.namespace_id, /^[1-9]\d*$/);
    assert.ok([10, 60].includes(r.simple.period));
  }
});

test("API upload metadata matches wrangler.jsonc", () => {
  assert.equal(metadata.compatibility_date, config.compatibility_date);
  assert.deepEqual(metadata.observability, config.observability);
  const vars = Object.fromEntries(metadata.bindings.filter((b) => b.type === "plain_text").map((b) => [b.name, b.text]));
  assert.deepEqual(vars, config.vars);
  const limits = metadata.bindings
    .filter((b) => b.type === "ratelimit")
    .map(({ name, namespace_id, simple }) => ({ name, namespace_id, simple }));
  assert.deepEqual(limits, config.ratelimits);
  assert.ok(!metadata.bindings.some((b) => b.type === "secret_text"), "secrets are never in metadata");
});
