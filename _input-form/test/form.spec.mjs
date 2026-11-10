import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
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
  assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex,nofollow");
  assert.equal(await page.title(), "For us amongst friends");
  assert.equal(await page.locator("h1").textContent(), "For us amongst friends");
  const box = await page.locator("#send").boundingBox();
  assert.ok(box && box.height >= 48, `${label} send button tap size`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  assert.equal(overflow, true, `${label} horizontal overflow`);
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await settle(page);
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v2_${label}.png`) });
  await fullShot(page, `input_form_v2_${label}_full.png`);

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
  await fullShot(page, `input_form_v2_filled_${label}.png`);
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
  assert.equal(await page.locator("#card").getAttribute("data-kind"), null);
  assert.equal(await page.locator('.stat[data-stat="food"]').evaluate((el) => el.classList.contains("unset")), true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v2_success_${label}.png`) });

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

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await exercise(desktop, "desktop", base);
  await desktop.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await exercise(mobile, "mobile", base);
  await mobile.close();
  console.log("form checks passed");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
