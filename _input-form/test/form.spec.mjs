import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const ARTIFACTS = "/opt/cursor/artifacts";
const ENDPOINT = "https://sheet.test/exec";

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
      const type = path.extname(file) === ".js" ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8";
      res.writeHead(200, { "content-type": type });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function fill(page, { name = "Sam", score = "270", vibes = "A short line about the sandwich." } = {}) {
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
  assert.equal(await page.locator("h1").textContent(), "No Ball");
  const box = await page.locator("#send").boundingBox();
  assert.ok(box && box.height >= 48, `${label} send button tap size`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  assert.equal(overflow, true, `${label} horizontal overflow`);
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_${label}.png`), fullPage: true });

  await fill(page);
  assert.match(await page.locator("#counter").textContent(), /6 \/ 50 words/);
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("status").textContent === "Form not connected yet");
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
  await page.waitForFunction(() => document.getElementById("err-submittedBy").textContent === "Your name is required.");
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
  assert.match(await page.locator("#counter").textContent(), /51 \/ 50 words/);
  assert.equal(await page.locator("#counter").evaluate((el) => el.classList.contains("over")), true);
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => /50 words/.test(document.getElementById("err-vibes").textContent));
  assert.equal(calls.length, 0);
  await page.fill("#vibes", "A short line about the sandwich.");

  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => {
    const status = document.getElementById("status").textContent;
    return status.startsWith("Saved.") && !document.getElementById("send").disabled;
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
  assert.equal(sent.vibes, "A short line about the sandwich.");
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
