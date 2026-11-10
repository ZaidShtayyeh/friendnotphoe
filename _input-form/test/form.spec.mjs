import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const SHOT = path.join(ROOT, "_input-form/test/fixtures/spot.jpg");
const ARTIFACTS = "/opt/cursor/artifacts";
const ENDPOINT = "https://sheet.test/exec";
const VIBES = "Killer sandwich menu, kind of worth it if you're chilling. Sandwich, then Tompkins. Shoutout the lads.";
const TYPES = { ".js": "text/javascript; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".gif": "image/gif" };

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/input-form") {
      res.writeHead(302, { Location: "/input-form/" });
      res.end();
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      const type = TYPES[path.extname(file)] || "text/html; charset=utf-8";
      res.writeHead(200, { "content-type": type });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function fill(page, { name = "Sam", score = "270", vibes = VIBES } = {}) {
  await page.fill("#friend", name);
  await page.fill("#place", "C + B");
  await page.fill("#maps", "https://maps.google.com/?q=C+%2B+B");
  await page.fill("#city", "NYC");
  await page.fill("#area", "East Village");
  await page.fill("#score", score);
  await page.locator('input[value="Food first"]').check();
  await page.fill("#vibes", vibes);
  await page.fill("#food", "80");
  await page.fill("#drinks", "50");
  await page.fill("#scene", "60");
  await page.setInputFiles("#photo", SHOT);
  await page.waitForFunction(() => {
    const thumb = document.getElementById("shot-thumb");
    const card = document.getElementById("card-photo");
    const img = card && card.querySelector("img");
    return thumb && !thumb.hidden && thumb.src.startsWith("blob:")
      && img && img.src.startsWith("blob:");
  });
}

async function settle(page) {
  await page.waitForFunction(() => document.querySelector(".corner-coin").complete
    && document.getAnimations().every((a) => a.playState !== "running" || a.effect.getTiming().iterations === Infinity));
}

async function fullShot(page, file) {
  await settle(page);
  await page.evaluate(() => { document.querySelector("header").style.position = "static"; });
  await page.screenshot({ path: path.join(ARTIFACTS, file), fullPage: true });
  await page.evaluate(() => { document.querySelector("header").style.position = ""; });
}

async function exercise(page, label, base) {
  const calls = [];
  let mode = "ok";
  await page.route("https://sheet.test/**", async (route) => {
    calls.push({
      method: route.request().method(),
      type: route.request().headers()["content-type"] || "",
      body: route.request().postData(),
    });
    const body = mode === "ok" ? { ok: true } : { ok: false, error: "The sheet rejected that." };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body),
    });
  });

  await page.goto(`${base}/input-form`, { waitUntil: "domcontentloaded" });
  assert.ok(page.url().endsWith("/input-form/"), `${label} slash redirect`);
  await page.locator("#friend").waitFor();
  // The page ships a real Apps Script URL. Blank it here so this run still
  // covers the disconnected path, and never POST that URL.
  await page.evaluate(() => { FORM_ENDPOINT = ""; });
  assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex,nofollow");
  assert.equal(await page.title(), "For us amongst friends");
  assert.equal(await page.locator("h1").textContent(), "For us amongst friends");
  await page.waitForFunction(() => document.getElementById("place").getAttribute("data-places") === "failed");
  assert.equal(await page.locator("#place-list").isHidden(), true);
  assert.equal(await page.locator(".subtitle").count(), 0);
  const coin = await page.locator(".corner-coin").boundingBox();
  const pad = label === "desktop" ? { x: 32, y: 24 } : { x: 24, y: 9.6 };
  assert.ok(coin && Math.abs(coin.width - 72) < 0.6 && Math.abs(coin.height - 72) < 0.6, `${label} coin is 72px`);
  assert.ok(Math.abs(coin.x - pad.x) < 1 && Math.abs(coin.y - pad.y) < 1, `${label} coin sits at ${coin && coin.x},${coin && coin.y}`);
  const box = await page.locator("#send").boundingBox();
  assert.ok(box && box.height >= 48, `${label} send button tap size`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  assert.equal(overflow, true, `${label} horizontal overflow`);
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await settle(page);
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v3_${label}.png`) });
  await fullShot(page, `input_form_v3_${label}_full.png`);

  await page.locator('.stat[data-stat="food"] .bar').fill("35");
  assert.equal(await page.inputValue("#food"), "35", `${label} slider writes the number`);
  await page.fill("#drinks", "64");
  assert.equal(await page.locator('.stat[data-stat="drink"] .bar').inputValue(), "64", `${label} number moves the slider`);

  await fill(page);
  assert.match(await page.locator("#counter").textContent(), /^16\/50 words · 102\/250$/);
  assert.equal(await page.locator("#card-name").textContent(), "C + B");
  assert.equal(await page.locator("#card-hp").textContent(), "270");
  assert.equal(await page.locator("#card-area").textContent(), "East Village, NYC");
  assert.equal(await page.locator("#card").getAttribute("data-kind"), "Food first");
  await page.waitForFunction(() => {
    const fill = document.getElementById("card-food").getBoundingClientRect().width;
    const track = document.getElementById("card-food").parentElement.getBoundingClientRect().width;
    return track > 0 && Math.abs(fill / track - 0.8) < 0.02;
  });
  await page.waitForFunction(() => getComputedStyle(document.getElementById("card")).backgroundColor === "rgb(188, 213, 150)");
  await page.locator('input[value="Vibes first"]').check();
  await page.waitForFunction(() => getComputedStyle(document.getElementById("card")).backgroundColor === "rgb(143, 194, 236)");
  const dots = await page.evaluate(() => ({
    vibes: getComputedStyle(document.querySelector(".chip.kind-vibes span"), "::before").backgroundColor,
    drinks: getComputedStyle(document.querySelector(".chip.kind-drink span"), "::before").backgroundColor,
  }));
  assert.equal(dots.vibes, "rgb(97, 183, 244)");
  assert.equal(dots.vibes, dots.drinks);
  await page.locator('input[value="Food first"]').check();
  await page.waitForFunction(() => getComputedStyle(document.getElementById("card")).backgroundColor === "rgb(188, 213, 150)");
  assert.equal(await page.locator("#photo").getAttribute("accept"), "image/*");
  assert.equal(await page.locator("#photo").getAttribute("capture"), null);
  assert.equal(await page.locator("#shot-thumb").isVisible(), true);
  assert.equal(await page.locator("#card-photo img").count(), 1);
  await page.evaluate(() => {
    const field = document.getElementById("shot-field");
    const header = document.querySelector("header").getBoundingClientRect().height;
    const top = field.getBoundingClientRect().top + window.scrollY - header - 20;
    window.scrollTo(0, Math.max(0, top));
  });
  await settle(page);
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v4_photo_${label}.png`) });
  await fullShot(page, `input_form_v3_filled_${label}.png`);
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("status").textContent === "Not hooked up yet, nothing got sent. Hang on to this one.");
  assert.equal(calls.length, 0, `${label} disconnected form must not send`);
  assert.equal(await page.inputValue("#place"), "C + B");
  assert.equal(await page.inputValue("#friend"), "Sam");
  assert.equal(await page.locator("#send").isEnabled(), true);

  await page.fill("#score", "301");
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("err-hp").textContent.includes("1 to 300"));
  assert.equal(calls.length, 0);
  assert.equal(await page.inputValue("#score"), "301");

  await page.fill("#score", "270");
  await page.fill("#friend", "");
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("err-submittedBy").textContent === "Need your name. A nickname works.");
  assert.equal(await page.evaluate(() => document.activeElement.id), "friend");
  await page.fill("#friend", "Sam");

  await page.evaluate((endpoint) => {
    FORM_ENDPOINT = endpoint;
    formStartedAt = Date.now();
  }, ENDPOINT);
  await page.click("#send");
  await page.waitForFunction(() => /few seconds/.test(document.getElementById("status").textContent));
  assert.equal(calls.length, 0, `${label} too-fast submit must not send`);

  const tooMany = Array.from({ length: 51 }, () => "a").join(" ");
  await page.fill("#vibes", tooMany);
  assert.match(await page.locator("#counter").textContent(), /^51\/50 words · 101\/250 · too long for the card$/);
  assert.equal(await page.locator("#counter").evaluate((el) => el.classList.contains("over")), true);
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => /50 words/.test(document.getElementById("err-vibes").textContent));
  assert.equal(calls.length, 0);
  await page.fill("#vibes", VIBES);

  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => {
    const status = document.getElementById("status").textContent;
    return status.startsWith("Locked in.") && !document.getElementById("send").disabled;
  });
  assert.equal(calls.length, 1, `${label} one post`);
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].type, /^text\/plain/i);
  assert.equal(calls[0].type.includes("application/json"), false);
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.submittedBy, "Sam");
  assert.equal(sent.restaurant, "C + B");
  assert.equal(sent.maps, "https://maps.google.com/?q=C+%2B+B");
  assert.equal(sent.city, "NYC");
  assert.equal(sent.area, "East Village");
  assert.equal(sent.hp, "270");
  assert.equal(sent.category, "Food first");
  assert.equal(sent.vibes, VIBES);
  assert.equal(sent.food, "80");
  assert.equal(sent.drink, "50");
  assert.equal(sent.scene, "60");
  assert.equal(sent.photoType, "image/jpeg");
  assert.equal(sent.photoName, "spot.jpg");
  assert.match(sent.photoData, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.ok(sent.photoData.length > 100);
  const decoded = Buffer.from(sent.photoData, "base64").length;
  assert.ok(decoded > 0 && decoded <= 4 * 1024 * 1024);
  assert.equal(sent.company, "");
  assert.equal(sent.token, "");
  assert.equal(typeof sent.startedAt, "number");
  assert.equal(await page.inputValue("#friend"), "Sam");
  assert.equal(await page.inputValue("#place"), "");
  assert.equal(await page.inputValue("#city"), "");
  assert.equal(await page.inputValue("#score"), "");
  assert.equal(await page.inputValue("#vibes"), "");
  assert.equal(await page.locator('input[name="category"]:checked').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), "place");
  assert.equal(await page.locator("#send").isEnabled(), true);
  assert.equal(await page.locator("#card-name").textContent(), "The spot");
  assert.equal(await page.locator("#shot-thumb").isHidden(), true);
  assert.equal(await page.locator("#card-photo").textContent(), "photo goes here");
  assert.equal(await page.locator("#card-photo img").count(), 0);
  assert.equal(await page.locator("#card").getAttribute("data-kind"), null);
  assert.equal(await page.locator('.stat[data-stat="food"]').evaluate((el) => el.classList.contains("unset")), true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v3_success_${label}.png`) });

  mode = "error";
  await fill(page);
  await page.fill("#place", "Forsythia");
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("status").textContent === "The sheet rejected that.");
  assert.equal(calls.length, 2);
  assert.equal(await page.inputValue("#friend"), "Sam");
  assert.equal(await page.inputValue("#place"), "Forsythia");
  assert.equal(await page.inputValue("#city"), "NYC");
  assert.equal(await page.locator("#send").isEnabled(), true);

  await page.evaluate(() => { document.getElementById("company").value = "http://spam.test"; });
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => /didn't go through/.test(document.getElementById("status").textContent));
  assert.equal(calls.length, 2, `${label} honeypot must not send`);
  assert.equal(await page.inputValue("#place"), "Forsythia");
}

function installPlacesMock() {
  const samples = [
    {
      name: "C + B",
      secondary: "East Village, New York",
      uri: "https://maps.google.com/?cid=111",
      components: [
        { longText: "East Village", types: ["neighborhood", "political"] },
        { longText: "Manhattan", types: ["sublocality_level_1", "sublocality", "political"] },
        { longText: "New York", types: ["locality", "political"] },
      ],
    },
    {
      name: "Bar Oliver",
      secondary: "Chinatown, New York",
      uri: "https://maps.google.com/?cid=222",
      components: [
        { longText: "Chinatown", types: ["neighborhood"] },
        { longText: "New York", types: ["locality", "political"] },
      ],
    },
    {
      name: "Smor",
      secondary: "East Village, New York",
      uri: "https://maps.google.com/?cid=333",
      components: [
        { longText: "East Village", types: ["neighborhood"] },
        { longText: "New York", types: ["locality", "political"] },
      ],
    },
  ];
  window.__placesLog = { requests: [], fields: null, tokens: 0 };
  function Token() { this.id = ++window.__placesLog.tokens; }
  window.google = {
    maps: {
      importLibrary() {
        return Promise.resolve({
          AutocompleteSessionToken: Token,
          AutocompleteSuggestion: {
            fetchAutocompleteSuggestions(body) {
              window.__placesLog.requests.push({
                input: body.input,
                types: body.includedPrimaryTypes.slice(),
                token: body.sessionToken && body.sessionToken.id,
              });
              return Promise.resolve({
                suggestions: samples.map((sample) => ({
                  placePrediction: {
                    mainText: { toString() { return sample.name; } },
                    secondaryText: { toString() { return sample.secondary; } },
                    text: { toString() { return `${sample.name}, ${sample.secondary}`; } },
                    toPlace() {
                      return {
                        displayName: sample.name,
                        googleMapsURI: sample.uri,
                        addressComponents: sample.components,
                        fetchFields(options) {
                          window.__placesLog.fields = options.fields.slice();
                          return Promise.resolve();
                        },
                      };
                    },
                  },
                })),
              });
            },
          },
        });
      },
    },
  };
}

async function placesFlow(page, label, base) {
  const mapsCalls = [];
  await page.route("https://maps.googleapis.com/**", (route) => {
    mapsCalls.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(installPlacesMock);
  await page.goto(`${base}/input-form/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => initPlaces("test-key"));
  await page.waitForFunction(() => document.getElementById("place").getAttribute("data-places") === "on");
  await page.fill("#place", "C +");
  await page.locator(".place-option").first().waitFor();
  assert.equal(await page.locator(".place-option").count(), 3);
  assert.equal(await page.locator("#place").getAttribute("aria-expanded"), "true");
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v3_places_${label}.png`) });
  const before = await page.evaluate(() => window.__placesLog.requests.slice());
  assert.equal(before.length, 1);
  assert.deepEqual(before[0].types, ["restaurant", "bar", "cafe", "food"]);
  assert.equal(before[0].token, 1);
  await page.locator(".place-option").first().click();
  await page.waitForFunction(() => document.getElementById("city").value === "NYC");
  assert.equal(await page.inputValue("#place"), "C + B");
  assert.equal(await page.inputValue("#maps"), "https://maps.google.com/?cid=111");
  assert.equal(await page.inputValue("#area"), "East Village");
  assert.equal(await page.locator("#card-name").textContent(), "C + B");
  assert.equal(await page.locator("#card-area").textContent(), "East Village, NYC");
  const fields = await page.evaluate(() => window.__placesLog.fields);
  assert.deepEqual(fields, ["displayName", "googleMapsURI", "addressComponents"]);
  await page.fill("#area", "Lower East Side");
  assert.equal(await page.inputValue("#area"), "Lower East Side");
  await page.fill("#place", "Smor");
  await page.locator(".place-option").first().waitFor();
  const after = await page.evaluate(() => window.__placesLog.requests.map((item) => item.token));
  assert.deepEqual(after, [1, 2]);
  assert.equal(mapsCalls.length, 0, `${label} mock must not call Google`);
}

async function placesLoadFailure(page, base) {
  await page.addInitScript(() => {
    window.google = { maps: { importLibrary: () => Promise.reject(new Error("could not load")) } };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${base}/input-form/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => initPlaces("test-key"));
  await page.waitForFunction(() => document.getElementById("place").getAttribute("data-places") === "failed");
  await page.fill("#place", "Typed by hand");
  await page.fill("#city", "NYC");
  assert.equal(await page.inputValue("#place"), "Typed by hand");
  assert.equal(await page.locator("#place-list").isHidden(), true);
  assert.equal(await page.locator("#place").getAttribute("aria-expanded"), "false");
  assert.deepEqual(errors, []);
}

async function guardedContext(browser, options) {
  const context = await browser.newContext(options);
  // Never let a test reach the live Apps Script. Abort before the request leaves.
  await context.route(/https?:\/\/script\.google(?:usercontent)?\.com\/.*/i, async (route) => {
    appsScriptHits.push(route.request().method());
    await route.abort();
  });
  // The page now has a browser key. Don't load the real Maps script from these tests.
  await context.route(/https?:\/\/maps\.googleapis\.com\/.*/i, (route) => route.abort());
  return context;
}

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const appsScriptHits = [];
try {
  const desktopContext = await guardedContext(browser, { viewport: { width: 1280, height: 800 } });
  const desktop = await desktopContext.newPage();
  await exercise(desktop, "desktop", base);
  const placesDesktop = await desktopContext.newPage();
  await placesFlow(placesDesktop, "desktop", base);
  const placesFailed = await desktopContext.newPage();
  await placesLoadFailure(placesFailed, base);
  await desktopContext.close();

  const mobileContext = await guardedContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  await exercise(mobile, "mobile", base);
  const placesMobile = await mobileContext.newPage();
  await placesFlow(placesMobile, "mobile", base);
  await mobileContext.close();

  assert.equal(appsScriptHits.length, 0, "script.google.com was contacted");
  console.log("form checks passed");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
