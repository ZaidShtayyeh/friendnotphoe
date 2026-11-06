# friendnotphoe-visit-alerts

A small Cloudflare Worker. It receives at most one anonymous "visit" attempt per browser tab session from friendnotphoe.com, checks it, rate-limits it, and forwards it to the Friend Grok Bot routine webhook.

## Owner-reported deployment vs these tests

**Owner-reported, not re-checked here.** Friend says an inactive Worker is deployed at `https://friendnotphoe-visit-alerts.friendnotphoe.workers.dev/v1/visit`. Secret setup is not finished. Nothing in this repository deployed that Worker, called that URL, or sent a routine webhook. Do not treat the code tests below as proof the deployment exists.

**Still true in this code.** `FORWARDING_ENABLED` and `FORWARD_TEST_EVENTS` are both `"false"`. Until the owner sets both secrets and turns forwarding on, the Worker returns 503 and does not call upstream. No step changes DNS, the zone, or GitHub Pages hosting. friendnotphoe.com stays where it is; the Worker is only a `workers.dev` hostname.

**This PR does not publish the site.** `index.html` includes the visit-note script pointed at that owner-reported URL, but the live site loads it only after the owner merges this PR and Pages publishes. A 503 from the inactive Worker is not a delivery: the client records `not-delivered`, shows nothing, and still makes at most one attempt per tab session.

The `_workers/` folder starts with `_`, so the Jekyll build does not publish the Worker.

## Data flow and payload

```
browser (assets/visit-note.js)  --POST /v1/visit-->  Worker  --POST + Bearer-->  routine webhook
```

The browser sends exactly this JSON, and the Worker forwards it unchanged:

```json
{"type":"visit","site":"friendnotphoe.com","event_id":"<uuid v4>","occurred_at":"<ISO-8601 UTC>","path":"/","test":false}
```

- **`path`** is `location.pathname` only, and must match `^/[A-Za-z0-9._~\-/]{0,63}$` with no `//` or `..`. Query, hash, and percent-escapes cannot pass. The site uses hash routing, so this is effectively always `/`; card and page hashes are never sent.
- **What is not collected or forwarded:**
  - No cookies, IP, user agent, referrer, full URL, screen or device data, or fingerprinting.
  - The client sends with `credentials: "omit"` and `referrerPolicy: "no-referrer"`.
  - Outbound requests carry only `Authorization` and `Content-Type`.
- **IP use is ephemeral, for abuse control only.**
  - The Worker hashes `CF-Connecting-IP` with the UTC date (SHA-256, truncated to 96 bits) and uses the hash only as the `CLIENT_LIMITER` key. That counter lives in Cloudflare's rate limiter for its 60 s window.
  - The raw IP and the hash are never logged, stored, or forwarded.
  - Cloudflare advises against IP keys in general because many people can share one IP (NAT, mobile carriers). The effect here is that visitors behind a shared IP may be throttled together. That is acceptable for an abuse limit.

## Request handling, in order

1. Any path other than `/v1/visit` returns 404.
2. **Origin check.** `Origin` must exactly match an entry in `ALLOWED_ORIGINS`, otherwise 403. This is a browser CORS allowlist, not security: any non-browser client can spoof `Origin`. The rate limits below are the real abuse control.
3. `OPTIONS` returns 204 with CORS headers (preflight cached up to 24 h). Methods other than `POST` return 405. A `Content-Type` other than `application/json` returns 415.
4. **`CLIENT_LIMITER`:** 4 requests per 60 s per hashed IP, else 429. This runs before the body is read.
5. **Body read** capped at 512 bytes, and the body must be valid UTF-8, else 413. The schema is strict: exactly the six keys above, `occurred_at` within 10 min of server time, else 400.
6. **`EVENT_DEDUPE_LIMITER`:** 1 per 60 s per `event_id`. Duplicates get 200 `{"forwarded":false,"reason":"duplicate"}`.
7. `test: true` gets 200 `{"forwarded":false,"reason":"test"}` unless `FORWARD_TEST_EVENTS` is `"true"`.
8. **Fail closed:** a missing or invalid secret returns 503 `not_configured`. The URL must be `https:`. The bearer must be a non-empty token; a leading `Bearer ` is stripped.
9. **Kill switch:** `FORWARDING_ENABLED` other than `"true"` returns 503 `disabled`.
10. **`FORWARD_LIMITER`:** 2 forwards per 60 s (key `routine`), else 429.
11. **Forward:** POST to `ROUTINE_WEBHOOK_URL` with `Authorization: Bearer <key>`, `redirect: "manual"`, and a 5 s `AbortSignal.timeout`.
    - Only upstream **HTTP 200** counts as accepted. Per the [routines docs](https://cursor.com/help/grok-bot/routines), that means a run was accepted or started, not completed. The Worker then returns 200 `{"forwarded":true}`.
    - Any other status, a timeout, or a network error returns 502 `{"forwarded":false}`.
    - There are no retries.

The adapter uses only the documented contract: Bearer key, JSON body, 200 means accepted. It adds no signing or extra authentication.

## Honest limits

- **Session throttling is best effort.** `sessionStorage` is per tab, so new tabs, private windows, and cleared storage send again. If storage throws or doesn't persist, the client sends nothing. A second attempt in the same tab is skipped whether the first one was noted, still in flight, or a 503 / network failure. This does not count unique people.
- **A 503 is not a delivery.** The client returns `attempted` as soon as it hands the request to the browser, then records `not-delivered` when the Worker answers 503 (secrets unset or forwarding off), on any other non-200, or when `fetch` rejects. HTTP 200 is recorded as `noted`: the Worker accepted the attempt. The routine run, if any, is not finished. The page never says the visit was delivered.
- **Rate limit binding counters are approximate and per Cloudflare location** (eventually consistent). They are not global and not durable.
- **Dedupe is short-lived and per location.** It is the 60 s `EVENT_DEDUPE_LIMITER` window plus random per-session ids. The routine should still ignore repeated `event_id`s.
- **Delivery is not exhaustive:**
  - Visitors with Global Privacy Control or DNT, or without `crypto.randomUUID`, send nothing.
  - So do ad blockers and visits served on any host other than `https://friendnotphoe.com` or `https://www.friendnotphoe.com`.
  - Upstream failures are not retried.
- **Routine caps:** 200 runs/hour per routine and 300/hour total. Excess runs are rejected upstream and not retried.
  - `FORWARD_LIMITER` allows up to 120/hour per location, so a burst served from two or more locations can still hit the routine cap. Those attempts show up as `upstream_rejected` in the logs.
  - A strict global cap needs a Durable Object, which is not included (see the capability reads below).
- **Workers Free plan:** 100,000 requests/day, and each new visit costs about 2 (preflight plus POST). There is a 10 ms CPU limit; this Worker does one SHA-256 and a JSON parse.

## Observability (privacy decision, please confirm)

- **Workers Logs is on.** It carries only the Worker's own one-line JSON logs, for example `{"msg":"visit_note","outcome":"forwarded","test":false}`. Logs never include the IP, user agent, URLs, headers, `event_id`, or secrets; a test enforces this.
- **Invocation logs are off** (`invocation_logs: false`), because they record the request URL and request metadata.
- **Traces are off** (`traces.enabled: false`), even though enabling them was requested.
  - Workers traces automatically record the visitor's `user_agent.*`, geo, and ASN.
  - Each outbound fetch span records `url.full`, which is the secret routine webhook URL, visible to anyone with observability access on the account. That conflicts with "never place them in … logs".
  - To enable traces anyway, the user must accept that, then set `"traces": {"enabled": true, "head_sampling_rate": 0.01}` and redeploy.

## Secrets (entered by the site owner only)

| Name | Value |
| --- | --- |
| `ROUTINE_WEBHOOK_URL` | The routine's webhook URL, copied from the Friend routine settings |
| `ROUTINE_WEBHOOK_BEARER` | The routine's webhook key (with or without a leading `Bearer `) |

Safe setup paths, used only after the first deploy. Values must never be pasted into chat, PRs, issues, files, or command arguments.

- **CLI:** from this folder, logged in as the account owner, run `npx wrangler secret put ROUTINE_WEBHOOK_URL`, then `npx wrangler secret put ROUTINE_WEBHOOK_BEARER`. Wrangler prompts for each value with hidden input. Each `secret put` immediately deploys a new version; that is safe because `FORWARDING_ENABLED` is still `"false"`.
- **Dashboard:** Workers & Pages → `friendnotphoe-visit-alerts` → Settings → Variables and Secrets → Add → type **Secret**.

The secrets are not listed under `secrets.required` in `wrangler.jsonc`. With that setting, Wrangler 4.158 refuses the first deploy of a new Worker unless the secrets are supplied up front in a secrets file.

## Deployment config

- **Wrangler (canonical):** `wrangler.jsonc`.
  - Worker `friendnotphoe-visit-alerts`, `compatibility_date` 2026-11-06, `workers_dev: true`, `preview_urls: false`.
  - No routes; DNS, the zone, and Pages are untouched.
  - The three `ratelimit` bindings (namespace ids 47101, 47102, 47103) and the vars listed above.
- **API alternative:** `deploy/upload-metadata.json` is the multipart `metadata` part for `PUT /accounts/{account_id}/workers/scripts/friendnotphoe-visit-alerts`, with the bundled `dist/index.js` as the `index.js` module part.
  - It uses `keep_bindings: ["secret_text"]` so redeploys keep the user's secrets.
  - A test keeps it in sync with `wrangler.jsonc`.
  - The `observability.logs.invocation_logs` and `traces` field names were taken from the Wrangler config docs. Check them against the API schema before using this path.
- **Build and verify locally**, with no account access needed: `npm ci && npm run check`. This runs type checks, the Worker tests in workerd, the client and config tests, and `wrangler deploy --dry-run --outdir dist`.

## Capability reads

These were true when this PR was first prepared. They are history, not a fresh account read:

1. `GET /accounts/f14daa94046d3566349a188a313553c1/workers/scripts` returned an empty list.
2. `GET /accounts/f14daa94046d3566349a188a313553c1/workers/subdomain` returned 404 with code 10007, so no workers.dev subdomain existed yet.

Friend later reported the subdomain and the inactive Worker above. This repo has not repeated those reads.

Still worth confirming before the next mutation:

3. Token permissions for the executing credential:
   - Account › Workers Scripts: **Edit**, for the upload, the workers.dev toggle, and the account subdomain.
   - Read access to Workers observability, to read logs during smoke tests.
   - No zone or DNS permissions are needed; none should be granted.
4. Confirm the account plan (Free versus Paid) and that `ratelimit` bindings are accepted on it. Earlier read-only checks confirmed the upload schema, not plan availability. If they are rejected, the fallback needs a design change; report it rather than improvising.
5. Optional: only if a strict global hourly cap is required, confirm Durable Objects (SQLite-backed) availability on the plan. They are not used now.

## Ordered steps still open

No step changes DNS. The site stays on GitHub Pages. Each remaining mutation needs the owner's approval. Code tests do not perform them.

1. **Secrets (not finished).** The owner sets `ROUTINE_WEBHOOK_URL` and `ROUTINE_WEBHOOK_BEARER` with `wrangler secret put` or the dashboard (see above). Values stay out of chat, files, and this PR. Forwarding is still `"false"`, so a `test:false` POST then returns 503 `disabled` and nothing is forwarded.
2. **End-to-end check (optional, spends a real routine run).** Only with explicit approval:
   - `npx wrangler deploy --var FORWARDING_ENABLED:true --var FORWARD_TEST_EVENTS:true`
   - POST one valid body with `test:true` to the owner-reported `/v1/visit`. HTTP 200 `forwarded:true` means the routine accepted a run, not that it finished. The routine should ignore `test:true`.
   - `npx wrangler deploy` from this config to put both vars back to `"false"`. `--var` lasts only until the next deploy.
3. **Turn forwarding on** with a reviewed change that sets `FORWARDING_ENABLED` to `"true"` in `wrangler.jsonc`, then deploy that. `FORWARD_TEST_EVENTS` stays `"false"`. Real visits can then be forwarded. Still no DNS change.
4. **Publish the client by merging this PR.** The tag is already in `index.html`, after `heart-pop.js` and before the analytics snippet:

   ```html
   <script src="assets/visit-note.js" data-endpoint="https://friendnotphoe-visit-alerts.friendnotphoe.workers.dev/v1/visit" defer></script>
   ```

   - Until that merge, production does not load the script.
   - Merging while the Worker is still inactive is safe: browsers get 503, the client records `not-delivered`, and no webhook is sent. Notes start only after step 3 as well.
   - `admin.html` does not get this tag. Analytics, the star counts, and the C + B card stay as they are.
   - After Pages publishes, a fresh tab on https://friendnotphoe.com sends one POST and a reload sends none.

## Rollback (fastest first; none touch DNS, Pages hosting, or analytics)

1. **Stop forwarding:** run `npx wrangler deploy --var FORWARDING_ENABLED:false`, or a plain `npx wrangler deploy` from a commit where it is `"false"`. Requests then get 503 `disabled` and nothing reaches the routine.
2. **Stop browser sends:** revert this PR's script tag (or the merge that published it). Cached pages may keep sending until caches expire; step 1 covers that period.
3. **Remove the credentials:** `npx wrangler secret delete ROUTINE_WEBHOOK_BEARER` and `npx wrangler secret delete ROUTINE_WEBHOOK_URL`. The Worker fails closed with `not_configured`.
4. **Roll back the code:** `npx wrangler rollback` returns to a previous Worker version.
5. **Remove the endpoint:** set `workers_dev` to `false` and redeploy, or run `npx wrangler delete`. Only if the user approves, remove the account workers.dev subdomain.
6. **If exposure of the key is suspected,** the user rotates the routine's webhook key in the Friend routine settings. Then re-enter it with `wrangler secret put`.
