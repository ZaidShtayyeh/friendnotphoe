import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const SHOT = path.join(ROOT, "_input-form/test/fixtures/spot.jpg");
const TIME_AGAIN_SHOT = path.join(ROOT, "_input-form/test/fixtures/timeagain-photo.jpg");
const REAL_CARD = path.join(ROOT, "assets/cards-finish-v12/timeagain.webp");
const ARTIFACTS = "/opt/cursor/artifacts";
const ENDPOINT = "https://sheet.test/exec";
const VIBES = "Killer sandwich menu, kind of worth it if you're chilling. Sandwich, then Tompkins. Shoutout the lads.";
const MOVES = ["The Italian", "Thai Iced Tea", "Eat it in Tompkins"];
const TIME_AGAIN = {
  name: "Time Again",
  city: "NYC",
  area: "Lower East Side",
  hp: "280",
  vibes: "Casual bar that does not try as hard as their customers do. Plastic chairs and free-for-all seating. Go for a long sip, try and sit outside and be ready to chat - type of place you meet people",
  moves: ["Bread & Olive Oil", "Dirty Martini", "Orange Wine"],
  food: "25",
  drink: "50",
  scene: "95",
};
const TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/betweenusfriends") {
      res.writeHead(302, { Location: "/betweenusfriends/" });
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

function publishedMentions() {
  const hits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === ".git" || name === "node_modules" || name.startsWith("_") || name === "betweenusfriends") continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(html|js|css|xml|txt|json)$/.test(name)) continue;
      const text = fs.readFileSync(full, "utf8");
      if (text.includes("betweenusfriends") || text.includes("/input-form")) hits.push(path.relative(ROOT, full));
    }
  };
  walk(ROOT);
  return hits;
}

async function assertRoutes(base) {
  for (const gone of ["/input-form", "/input-form/", "/input-form/index.html"]) {
    const res = await fetch(base + gone, { redirect: "manual" });
    assert.equal(res.status, 404, `${gone} should be gone`);
  }
  const bare = await fetch(base + "/betweenusfriends", { redirect: "manual" });
  assert.equal(bare.status, 302);
  assert.equal(bare.headers.get("location"), "/betweenusfriends/");
  const slash = await fetch(base + "/betweenusfriends/");
  assert.equal(slash.status, 200);
  assert.match(await slash.text(), /name="robots" content="noindex,nofollow"/);
  assert.equal((await fetch(base + "/robots.txt", { redirect: "manual" })).status, 404);
  assert.equal((await fetch(base + "/sitemap.xml", { redirect: "manual" })).status, 404);
  assert.deepEqual(publishedMentions(), []);
}

function jpegSize(buffer) {
  let i = 2;
  while (i < buffer.length) {
    if (buffer[i] !== 0xff) return null;
    const marker = buffer[i + 1];
    const len = buffer.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buffer.readUInt16BE(i + 5), w: buffer.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

async function cardText(page, id) {
  return page.evaluate((target) => Array.from(document.getElementById(target).querySelectorAll("text")).map((t) => t.textContent), id);
}

async function waitForShot(page) {
  await page.waitForFunction(() => document.getElementById("card").getAttribute("data-crop")
    && document.getElementById("card-photo").getAttribute("href").startsWith("blob:"));
}

async function waitForFonts(page) {
  await page.waitForFunction(() => document.getElementById("card").getAttribute("data-fonts") === "ready");
}

async function crop(page) {
  return (await page.locator("#card").getAttribute("data-crop")).split(",").map(Number);
}

async function fillDetails(page, { name = "Sam", score = "270", vibes = VIBES, moves = MOVES, shot = SHOT } = {}) {
  await page.fill("#friend", name);
  await page.fill("#score", score);
  await page.locator('input[value="Food first"]').check();
  await page.fill("#vibes", vibes);
  for (let i = 0; i < 3; i += 1) await page.fill(`#move${i + 1}`, moves[i]);
  await page.fill("#food", "80");
  await page.fill("#drinks", "50");
  await page.fill("#scene", "60");
  if (shot) {
    await page.setInputFiles("#photo", shot);
    await waitForShot(page);
  }
}

async function fill(page, options = {}) {
  await page.fill("#place", "C + B");
  await page.fill("#maps", "https://maps.google.com/?q=C+%2B+B");
  await page.fill("#city", "NYC");
  await page.fill("#area", "East Village");
  await fillDetails(page, options);
}

async function settle(page) {
  await page.waitForFunction(() => document.querySelector(".corner-coin").complete
    && document.getAnimations().every((a) => a.playState !== "running" || a.effect.getTiming().iterations === Infinity));
  await page.waitForTimeout(400);
}

async function quiet(page) {
  // park the mouse off the card so the holo sheen is off, and drop the one-time drag hint
  await page.mouse.move(2, 300);
  await page.evaluate(() => {
    document.getElementById("cardWrap").classList.remove("nudge");
    document.getElementById("framer").classList.remove("nudge");
  });
}

// Mean absolute RGB difference between the sent JPEG and the same window cut from the fixture.
async function sentMatchesCrop(page, sentB64, rect) {
  return page.evaluate(async ({ sentB64, rect }) => {
    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    const sent = await load(`data:image/jpeg;base64,${sentB64}`);
    const source = document.getElementById("card-photo").getAttribute("href");
    const original = await load(source);
    const w = 90;
    const h = 60;
    const draw = (img, sx, sy, sw, sh) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return c.getContext("2d").getImageData(0, 0, w, h).data;
    };
    const k = original.naturalWidth / rect.srcW;
    const a = draw(sent, 0, 0, sent.naturalWidth, sent.naturalHeight);
    const b = draw(original, rect.sx * k, rect.sy * k, rect.sw * k, rect.sh * k);
    const off = draw(original, 0, 0, rect.sw * k, rect.sh * k);
    let diff = 0;
    let offDiff = 0;
    for (let i = 0; i < a.length; i += 4) {
      for (let c = 0; c < 3; c += 1) {
        diff += Math.abs(a[i + c] - b[i + c]);
        offDiff += Math.abs(a[i + c] - off[i + c]);
      }
    }
    return { size: [sent.naturalWidth, sent.naturalHeight], diff: diff / (w * h * 3), offDiff: offDiff / (w * h * 3) };
  }, { sentB64, rect });
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
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (msg) => { if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) errors.push(msg.text()); });

  await page.goto(`${base}/betweenusfriends`, { waitUntil: "domcontentloaded" });
  assert.ok(page.url().endsWith("/betweenusfriends/"), `${label} slash redirect`);
  await page.locator("#friend").waitFor();
  // The page ships a real Apps Script URL. Blank it here so this run still
  // covers the disconnected path, and never POST that URL.
  await page.evaluate(() => { FORM_ENDPOINT = ""; });
  assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex,nofollow");
  assert.equal(await page.title(), "For us amongst friends");
  assert.equal(await page.locator("h1").textContent(), "For us amongst friends");
  assert.equal(await page.locator(".subtitle").count(), 0);
  assert.equal(await page.locator("text=300 = undefeated").count(), 0, `${label} no "300 = undefeated"`);
  assert.equal(await page.locator("text=Change the shot").count(), 0, `${label} no "Change the shot"`);
  assert.equal(await page.locator("text=it's half the card").count(), 0, `${label} no shot hint`);
  assert.equal(await page.locator("text=1 to 300, save the big ones").count(), 0, `${label} no HP hint on the right`);
  assert.equal(await page.locator("text=pick one, it sets the color").count(), 0, `${label} no category hint`);
  assert.equal(await page.locator("text=so we know who to thank").count(), 0, `${label} no name hint`);
  assert.equal(await page.locator("text=how it reads on the card").count(), 0, `${label} no place hint`);
  assert.equal(await page.locator("text=optional, saves a search").count(), 0, `${label} no maps hint`);
  assert.equal(await page.locator('label[for="friend"] .hint, label[for="place"] .hint, label[for="maps"] .hint').count(), 0);
  assert.equal(await page.locator('label[for="score"] .hint').textContent(), "300 max");
  const shotNote = "Must be your own photo (of the food, drinks or scene you picked, not a pulled pic)";
  assert.equal(await page.locator("#shot-field .hint").textContent(), shotNote);
  assert.equal(await page.locator("#drop").isVisible(), true, `${label} callout shows before upload`);
  assert.equal(await page.locator("#framer").isHidden(), true);
  const shotPlace = await page.evaluate(() => {
    const label = document.querySelector("#shot-field > label");
    const hint = label.querySelector(".hint");
    const range = document.createRange();
    range.setStart(label.firstChild, 0);
    range.setEnd(label.firstChild, label.firstChild.textContent.trimEnd().length);
    const title = range.getBoundingClientRect();
    const note = hint.getBoundingClientRect();
    return { titleY: title.bottom, titleX: title.x, noteY: note.y, noteX: note.x };
  });
  assert.ok(shotPlace.noteY >= shotPlace.titleY - 1, `${label} callout sits under The shot`);
  assert.ok(Math.abs(shotPlace.noteX - shotPlace.titleX) < 4, `${label} callout lines up with The shot`);
  await page.locator("#shot-field").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(200);
  await page.locator("#shot-field").screenshot({ path: path.join(ARTIFACTS, `shot_callout_${label}.png`) });
  const hpLabel = await page.locator('label[for="score"]').boundingBox();
  const hpHint = await page.locator('label[for="score"] .hint').boundingBox();
  assert.ok(hpHint.x - hpLabel.x < 50, `${label} 300 max sits next to HP (${Math.round(hpHint.x - hpLabel.x)}px in)`);
  await page.waitForFunction(() => document.getElementById("place").getAttribute("data-places") === "failed");
  assert.equal(await page.locator("#place-list").isHidden(), true);
  const coin = await page.locator(".corner-coin").boundingBox();
  const pad = label === "desktop" ? { x: 32, y: 24 } : { x: 24, y: 9.6 };
  assert.ok(coin && Math.abs(coin.width - 72) < 0.6 && Math.abs(coin.height - 72) < 0.6, `${label} coin is 72px`);
  assert.ok(Math.abs(coin.x - pad.x) < 1 && Math.abs(coin.y - pad.y) < 1, `${label} coin sits at ${coin && coin.x},${coin && coin.y}`);
  const box = await page.locator("#send").boundingBox();
  assert.ok(box && box.height >= 48, `${label} send button tap size`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  assert.equal(overflow, true, `${label} horizontal overflow`);
  await waitForFonts(page);
  await page.locator("section.block").first().screenshot({ path: path.join(ARTIFACTS, `hints_removed_${label}.png`) });

  // Empty card: the real chassis, with placeholders where their stuff goes.
  assert.equal(await page.locator("#card").getAttribute("data-color"), "neutral");
  assert.equal(await page.locator("#card-name").textContent(), "The spot");
  assert.equal(await page.locator("#card-name").evaluate((el) => el.classList.contains("ghost")), true);
  assert.equal(await page.locator("#card-hp").textContent(), "???");
  assert.equal(await page.locator("#card-city").textContent(), "City");
  assert.deepEqual(await cardText(page, "card-move-1"), ["Move one"]);
  assert.equal(await page.locator("#card-photo-empty").evaluate((el) => el.style.opacity), "1");
  assert.equal(await page.locator("#drop").isVisible(), true);
  assert.equal(await page.locator("#framer").isHidden(), true);
  assert.equal(await page.locator("#photo").getAttribute("accept"), "image/*");
  assert.equal(await page.locator("#photo").getAttribute("capture"), null);
  const chassis = await page.evaluate(() => Array.from(document.querySelectorAll("#card .chassis")).map((img) => img.getAttribute("href")));
  assert.deepEqual(chassis, ["card/chassis-green.webp", "card/chassis-green.webp", "card/chassis-blue.webp", "card/chassis-gold.webp"]);

  if (label === "mobile") {
    // the card peeks up from the bottom edge
    const peek = await page.locator("#cardWrap").boundingBox();
    assert.ok(peek.y > 844 - 130 && peek.y < 844 - 30, `mobile card peeks (top at ${peak(peek)})`);
    assert.equal(await page.locator("#stageTab").isVisible(), true);
  } else {
    assert.equal(await page.locator("#stageTab").isVisible(), false);
    const stage = await page.locator("#cardWrap").boundingBox();
    assert.ok(stage.y + stage.height <= 800, "desktop card fits the viewport");
  }
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await quiet(page);
  await settle(page);
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v5_${label}_empty.png`) });

  await page.locator('.stat[data-stat="food"] .bar').fill("35");
  assert.equal(await page.inputValue("#food"), "35", `${label} slider writes the number`);
  await page.fill("#drinks", "64");
  assert.equal(await page.locator('.stat[data-stat="drink"] .bar').inputValue(), "64", `${label} number moves the slider`);

  await fill(page);
  assert.equal(await page.locator("#counter").textContent(), "102/250");
  assert.equal(await page.locator("#card-name").textContent(), "C + B");
  assert.equal(await page.locator("#card-name").evaluate((el) => el.classList.contains("ghost")), false);
  assert.equal(await page.locator("#card-hp").textContent(), "270");
  assert.equal(await page.locator("#card-city").textContent(), "NYC");
  assert.equal(await page.locator("#card-area").textContent(), "East Village, New York");
  assert.equal((await cardText(page, "card-vibes")).join(" "), VIBES.replace("'", "\u2019"));
  // special moves land on the card as they're typed
  assert.deepEqual(await cardText(page, "card-move-1"), ["The Italian"]);
  assert.deepEqual(await cardText(page, "card-move-2"), ["Thai Iced Tea"]);
  assert.deepEqual(await cardText(page, "card-move-3"), ["Eat it in Tompkins"]);
  await page.fill("#move3", "Eat it in Tompkins Sq Pk");
  assert.deepEqual(await cardText(page, "card-move-3"), ["Eat it in Tompkins Sq", "Pk"]);
  assert.equal(await page.inputValue("#move3"), "Eat it in Tompkins Sq Pk");
  await page.fill("#move3", "x".repeat(30));
  assert.equal((await page.inputValue("#move3")).length, 24, `${label} move input stops at 24`);
  await page.fill("#move3", MOVES[2]);
  assert.equal(await page.locator("#card").getAttribute("data-color"), "green");
  assert.equal(await page.locator('#card .chassis.on').getAttribute("data-color"), "green");
  assert.equal(await page.locator("#card").getAttribute("data-icon"), "both");
  await page.waitForFunction(() => Math.abs(Number(document.getElementById("card-bar-food").getAttribute("width")) - (1056 * 0.8 + 1.5)) < 0.01);
  await page.waitForFunction(() => Math.abs(Number(document.getElementById("card-bar-drink").getAttribute("width")) - (1056 * 0.5 + 1.5)) < 0.01);
  await page.fill("#drinks", "20");
  assert.equal(await page.locator("#card").getAttribute("data-icon"), "food");
  await page.fill("#drinks", "50");
  await page.locator('input[value="Vibes first"]').check();
  assert.equal(await page.locator("#card").getAttribute("data-color"), "blue");
  const dots = await page.evaluate(() => ({
    vibes: getComputedStyle(document.querySelector(".chip.kind-vibes span"), "::before").backgroundColor,
    drinks: getComputedStyle(document.querySelector(".chip.kind-drink span"), "::before").backgroundColor,
  }));
  assert.equal(dots.vibes, "rgb(97, 183, 244)");
  assert.equal(dots.vibes, dots.drinks);
  await page.locator('input[value="Legendary"]').check();
  assert.equal(await page.locator("#card").getAttribute("data-color"), "gold");
  await page.locator('input[value="Food first"]').check();
  assert.equal(await page.locator("#card").getAttribute("data-color"), "green");

  // The shot sits in the card's photo window; drag and zoom pick the crop.
  assert.equal(await page.locator("#drop").isHidden(), true);
  assert.equal(await page.locator("#framer").isVisible(), true);
  assert.equal(await page.locator("#swap").isVisible(), true);
  assert.equal(await page.locator("#frameInline").isVisible(), label === "mobile", `${label} inline framer only on phones`);
  assert.equal(await page.locator("#card-photo-empty").evaluate((el) => el.style.opacity), "0");
  const start = await crop(page);
  // spot.jpg is 1037x777: wider than tall but not 3:2, so it covers the window by width
  assert.ok(Math.abs(start[0]) < 0.2 && Math.abs(start[2] - 1037) < 0.2, `${label} starts centered: ${start}`);
  assert.ok(Math.abs(start[1] - (777 - 1037 / 1.5) / 2) < 0.2, `${label} starts vertically centered: ${start}`);
  const hitId = label === "mobile" ? "#inlineHit" : "#cardHit";
  if (label === "mobile") await page.evaluate(() => document.getElementById("shot-field").scrollIntoView({ block: "center" }));
  const hit = await page.locator(hitId).boundingBox();
  await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await page.mouse.down();
  await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  const dragged = await crop(page);
  assert.ok(dragged[1] < start[1] - 5, `${label} dragging down shows more of the top: ${start} -> ${dragged}`);
  assert.equal(dragged[2], start[2]);
  // you can't drag past the edge of the photo
  await page.mouse.move(hit.x + hit.width / 2, hit.y + 10);
  await page.mouse.down();
  await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height + 200, { steps: 6 });
  await page.mouse.up();
  assert.equal((await crop(page))[1], 0, `${label} drag clamps at the top edge`);
  await page.locator("#zoom").fill("2");
  const zoomed = await crop(page);
  assert.ok(Math.abs(zoomed[2] - 1037 / 2) < 0.5, `${label} zoom 2 halves the window: ${zoomed}`);
  await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await page.mouse.down();
  await page.mouse.move(hit.x + hit.width / 2 - 40, hit.y + hit.height / 2, { steps: 6 });
  await page.mouse.up();
  const panned = await crop(page);
  assert.ok(panned[0] > zoomed[0] + 10, `${label} dragging left moves the crop right: ${zoomed} -> ${panned}`);
  if (label === "desktop") {
    await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForFunction((w) => Number(document.getElementById("card").getAttribute("data-crop").split(",")[2]) < w - 20, panned[2]);
    await page.locator("#zoom").fill("2");
  } else {
    // two-finger pinch on the inline frame
    const before = await crop(page);
    await page.evaluate(() => {
      const hitEl = document.getElementById("inlineHit");
      const r = hitEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const fire = (type, id, x) => hitEl.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 11, clientX: x, clientY: cy, bubbles: true, cancelable: true }));
      fire("pointerdown", 11, cx - 30);
      fire("pointerdown", 12, cx + 30);
      for (let i = 1; i <= 5; i += 1) {
        fire("pointermove", 11, cx - 30 - i * 8);
        fire("pointermove", 12, cx + 30 + i * 8);
      }
      fire("pointerup", 11, cx - 70);
      fire("pointerup", 12, cx + 70);
    });
    const pinched = await crop(page);
    assert.ok(pinched[2] < before[2] - 50, `mobile pinch zooms in: ${before} -> ${pinched}`);
    await page.locator("#zoom").fill("2");
  }
  await quiet(page);
  await page.evaluate(() => {
    const field = document.getElementById("shot-field");
    const header = document.querySelector("header").getBoundingClientRect().height;
    window.scrollTo(0, Math.max(0, field.getBoundingClientRect().top + window.scrollY - header - 20));
  });
  await settle(page);
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v5_${label}_filled.png`) });

  if (label === "mobile") {
    // tap the tab: the card comes up full size over the page
    await page.click("#stageTab");
    await page.waitForFunction(() => document.getElementById("stage").classList.contains("open"));
    await settle(page);
    const full = await page.locator("#cardWrap").boundingBox();
    assert.ok(full.y >= 0 && full.y + full.height <= 844, `mobile card view fits: ${JSON.stringify(full)}`);
    assert.ok(full.width >= 330, "mobile card view is big");
    assert.equal(await page.locator("#stageTab").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#stageTip").textContent(), "Drag the shot to frame it. Pinch to zoom.");
    await quiet(page);
    await settle(page);
    await page.screenshot({ path: path.join(ARTIFACTS, "input_form_v5_mobile_card_view.png") });
    // dragging works on the big card too
    const big = await page.locator("#cardHit").boundingBox();
    const beforeBig = await crop(page);
    await page.mouse.move(big.x + big.width / 2, big.y + big.height / 2);
    await page.mouse.down();
    await page.mouse.move(big.x + big.width / 2 + 25, big.y + big.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.ok((await crop(page))[0] < beforeBig[0] - 5, "mobile card view drag moves the crop");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("stage").classList.contains("open"));
    await page.locator("#cardWrap").click({ position: { x: 60, y: 20 } });
    await page.waitForFunction(() => document.getElementById("stage").classList.contains("open"));
    await page.click("#stageTab");
    await page.waitForFunction(() => !document.getElementById("stage").classList.contains("open"));
    await settle(page);
  }

  const framed = await crop(page);
  assert.notDeepEqual(framed, start);

  // Need inspo? opens the real Time Again card.
  const inspoBtn = page.locator(".label-row [data-inspo]");
  assert.equal(await inspoBtn.textContent(), "✦Need inspo?");
  await inspoBtn.click();
  await page.waitForFunction(() => document.getElementById("inspo").open);
  const inspoImg = page.locator("#inspoCard img");
  assert.ok((await inspoImg.getAttribute("src")).endsWith("assets/cards-finish-v12/timeagain.webp"));
  await page.waitForFunction(() => document.querySelector("#inspoCard img").complete && document.querySelector("#inspoCard img").naturalWidth === 1500);
  assert.equal(await page.locator(".inspo-note").textContent(), "Say what it is, who it's for, what to get. Time Again nails it.");
  assert.equal(await page.evaluate(() => document.activeElement.id), "inspoClose");
  await settle(page);
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v5_${label}_inspo.png`) });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("inspo").open);
  assert.equal(await page.evaluate(() => document.activeElement.matches(".label-row [data-inspo]")), true, `${label} focus returns to the button`);
  await inspoBtn.click();
  await page.waitForFunction(() => document.getElementById("inspo").open);
  await page.mouse.click(6, label === "mobile" ? 110 : 400);
  await page.waitForFunction(() => !document.getElementById("inspo").open);
  await inspoBtn.click();
  await page.waitForFunction(() => document.getElementById("inspo").open);
  await page.click("#inspoClose");
  await page.waitForFunction(() => !document.getElementById("inspo").open);
  assert.ok((await page.inputValue("#vibes")).length > 0, `${label} inspo leaves the form alone`);

  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("status").textContent === "Not hooked up yet, nothing got sent. Hang on to this one.");
  assert.equal(calls.length, 0, `${label} disconnected form must not send`);
  assert.equal(await page.inputValue("#place"), "C + B");
  assert.equal(await page.inputValue("#friend"), "Sam");
  assert.equal(await page.locator("#send").isEnabled(), true);
  assert.deepEqual(await crop(page), framed, `${label} sending doesn't touch the framing`);

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

  await page.fill("#move2", "");
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("err-move2").textContent === "Need three moves. What do you order?");
  assert.equal(await page.evaluate(() => document.activeElement.id), "move2");
  assert.deepEqual(await cardText(page, "card-move-2"), ["Move two"]);
  await page.fill("#move2", MOVES[1]);

  // the card has four lines for vibes, and a name has to fit at the smallest size
  const wide = Array.from({ length: 24 }, () => "WWWWWWWWW").join(" ");
  await page.fill("#vibes", wide);
  assert.equal(await page.locator("#counter").textContent(), "239/250");
  assert.equal(await page.locator("#counter").evaluate((el) => el.classList.contains("over")), true);
  assert.equal((await cardText(page, "card-vibes")).length, 4);
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("err-vibes").textContent === "That runs past four lines on the card. Trim it.");
  await page.fill("#vibes", VIBES);
  await page.fill("#place", "W".repeat(40));
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("err-restaurant").textContent === "Too long for the card. Shorten it up.");
  await page.fill("#place", "C + B");

  await page.evaluate((endpoint) => {
    FORM_ENDPOINT = endpoint;
    formStartedAt = Date.now();
  }, ENDPOINT);
  await page.click("#send");
  await page.waitForFunction(() => /few seconds/.test(document.getElementById("status").textContent));
  assert.equal(calls.length, 0, `${label} too-fast submit must not send`);

  const tooMany = Array.from({ length: 51 }, () => "a").join(" ");
  await page.fill("#vibes", tooMany);
  assert.equal(await page.locator("#counter").textContent(), "101/250");
  assert.equal(await page.locator("#counter").evaluate((el) => el.classList.contains("over")), true);
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => /50 words/.test(document.getElementById("err-vibes").textContent));
  assert.equal(calls.length, 0);
  await page.fill("#vibes", VIBES);

  // A rejected post keeps everything, so the next send can be framed differently.
  mode = "error";
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("status").textContent === "The sheet rejected that.");
  assert.equal(calls.length, 1);
  const first = JSON.parse(calls[0].body);
  const firstRect = { sx: framed[0], sy: framed[1], sw: framed[2], sh: framed[3], srcW: 1037 };
  const firstCheck = await sentMatchesCrop(page, first.photoData, firstRect);
  assert.deepEqual(firstCheck.size, [1800, 1200], `${label} sends the 3:2 window at 1800x1200`);
  assert.ok(firstCheck.diff < 10, `${label} the sent photo is the framed window (diff ${firstCheck.diff})`);
  assert.ok(firstCheck.offDiff > firstCheck.diff + 5, `${label} and not just the top-left (diff ${firstCheck.offDiff})`);
  if (label === "mobile") await page.evaluate(() => document.getElementById("shot-field").scrollIntoView({ block: "center" }));
  const again = await page.locator(hitId === "#inlineHit" ? "#inlineHit" : "#cardHit").boundingBox();
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
  await page.mouse.down();
  await page.mouse.move(again.x + again.width / 2 - 35, again.y + again.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  const reframed = await crop(page);
  assert.notDeepEqual(reframed, framed);

  mode = "ok";
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => {
    const status = document.getElementById("status").textContent;
    return status.startsWith("Locked in.") && !document.getElementById("send").disabled;
  });
  assert.equal(calls.length, 2, `${label} one more post`);
  assert.equal(calls[1].method, "POST");
  assert.match(calls[1].type, /^text\/plain/i);
  assert.equal(calls[1].type.includes("application/json"), false);
  const sent = JSON.parse(calls[1].body);
  assert.equal(sent.submittedBy, "Sam");
  assert.equal(sent.restaurant, "C + B");
  assert.equal(sent.maps, "https://maps.google.com/?q=C+%2B+B");
  assert.equal(sent.city, "NYC");
  assert.equal(sent.area, "East Village");
  assert.equal(sent.hp, "270");
  assert.equal(sent.category, "Food first");
  assert.equal(sent.vibes, VIBES);
  assert.equal(sent.move1, MOVES[0]);
  assert.equal(sent.move2, MOVES[1]);
  assert.equal(sent.move3, MOVES[2]);
  assert.equal(sent.food, "80");
  assert.equal(sent.drink, "50");
  assert.equal(sent.scene, "60");
  assert.equal(sent.photoType, "image/jpeg");
  assert.equal(sent.photoName, "spot.jpg");
  assert.match(sent.photoData, /^[A-Za-z0-9+/]+={0,2}$/);
  const bytes = Buffer.from(sent.photoData, "base64");
  assert.ok(bytes.length > 50000 && bytes.length <= 4 * 1024 * 1024, `${label} photo size ${bytes.length}`);
  assert.deepEqual(jpegSize(bytes), { w: 1800, h: 1200 });
  assert.notEqual(sent.photoData, first.photoData, `${label} a different drag sends a different crop`);
  assert.equal(sent.company, "");
  assert.equal(sent.token, "");
  assert.equal(typeof sent.startedAt, "number");

  assert.equal(await page.inputValue("#friend"), "Sam");
  assert.equal(await page.inputValue("#place"), "");
  assert.equal(await page.inputValue("#city"), "");
  assert.equal(await page.inputValue("#score"), "");
  assert.equal(await page.inputValue("#vibes"), "");
  assert.equal(await page.inputValue("#move1"), "");
  assert.equal(await page.locator('input[name="category"]:checked').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), "place");
  assert.equal(await page.locator("#send").isEnabled(), true);
  assert.equal(await page.locator("#card-name").textContent(), "The spot");
  assert.deepEqual(await cardText(page, "card-move-1"), ["Move one"]);
  assert.equal(await page.locator("#card").getAttribute("data-color"), "neutral");
  assert.equal(await page.locator("#card").getAttribute("data-crop"), null);
  assert.equal(await page.locator("#card-photo-empty").evaluate((el) => el.style.opacity), "1");
  assert.equal(await page.locator("#drop").isVisible(), true);
  assert.equal(await page.locator("#framer").isHidden(), true);
  assert.equal(await page.locator('.stat[data-stat="food"]').evaluate((el) => el.classList.contains("unset")), true);

  // No photo: the card can't be made.
  await fill(page, { shot: null });
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("err-photo").textContent === "Need the shot. The card is half photo.");
  assert.equal(calls.length, 2);

  // A HEIC this browser can't decode still goes, as-is, for Zaid to frame.
  await page.setInputFiles("#photo", { name: "IMG_0420.HEIC", mimeType: "image/heic", buffer: Buffer.from("not really a heic, but bytes all the same") });
  await page.waitForFunction(() => !document.getElementById("framer").hidden);
  assert.equal(await page.locator("#framer").evaluate((el) => el.classList.contains("raw")), true);
  assert.equal(await page.locator("#frameTipText").textContent(), "Got it. This browser can't preview HEIC, so Zaid frames it.");
  assert.equal(await page.locator("#zoom").isVisible(), false);
  mode = "error";
  await page.fill("#place", "Forsythia");
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => document.getElementById("status").textContent === "The sheet rejected that.");
  assert.equal(calls.length, 3);
  const heic = JSON.parse(calls[2].body);
  assert.equal(heic.photoType, "image/heic");
  assert.equal(heic.photoName, "IMG_0420.HEIC");
  assert.equal(Buffer.from(heic.photoData, "base64").toString(), "not really a heic, but bytes all the same");
  assert.equal(await page.inputValue("#place"), "Forsythia");
  assert.equal(await page.inputValue("#city"), "NYC");

  await page.evaluate(() => { document.getElementById("company").value = "http://spam.test"; });
  await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
  await page.click("#send");
  await page.waitForFunction(() => /didn't go through/.test(document.getElementById("status").textContent));
  assert.equal(calls.length, 3, `${label} honeypot must not send`);
  assert.equal(await page.inputValue("#place"), "Forsythia");
  assert.deepEqual(errors, [], `${label} page errors`);
}

function peak(box) {
  return box ? box.y : "none";
}

// The live preview, filled with Time Again's exact data, next to the real card.
async function fidelity(browser, base) {
  const context = await guardedContext(browser, { viewport: { width: 1700, height: 2300 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${base}/betweenusfriends/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { FORM_ENDPOINT = ""; });
  await waitForFonts(page);
  await page.fill("#place", TIME_AGAIN.name);
  await page.fill("#city", TIME_AGAIN.city);
  await page.fill("#area", TIME_AGAIN.area);
  await page.fill("#score", TIME_AGAIN.hp);
  await page.locator('input[value="Legendary"]').check();
  await page.fill("#vibes", TIME_AGAIN.vibes);
  for (let i = 0; i < 3; i += 1) await page.fill(`#move${i + 1}`, TIME_AGAIN.moves[i]);
  await page.fill("#food", TIME_AGAIN.food);
  await page.fill("#drinks", TIME_AGAIN.drink);
  await page.fill("#scene", TIME_AGAIN.scene);
  await page.setInputFiles("#photo", TIME_AGAIN_SHOT);
  await waitForShot(page);
  assert.equal(await page.locator("#card").getAttribute("data-icon"), "drink");
  assert.equal(await page.locator("#card").getAttribute("data-color"), "gold");
  assert.deepEqual(await cardText(page, "card-vibes"), [
    "Casual bar that does not try as hard as their customers do. Plastic",
    "chairs and free-for-all seating. Go for a long sip, try and sit outside",
    "and be ready to chat - type of place you meet people",
  ]);
  // Time Again is a wasta card. That's Zaid's call, not a form field.
  await page.evaluate(() => {
    NoBallCard.setWasta(true);
    document.documentElement.style.setProperty("--cardw", "750px");
    const wrap = document.getElementById("cardWrap");
    wrap.classList.add("no-glints");
    wrap.style.boxShadow = "none";
    wrap.style.background = "transparent";
    wrap.style.transform = "none";
    wrap.style.animation = "none";
    wrap.style.transition = "none";
  });
  await quiet(page);
  await settle(page);
  await page.waitForFunction(() => Math.abs(Number(document.getElementById("card-bar-scene").getAttribute("width")) - (1056 * 0.95 + 1.5)) < 0.01);
  const box = await page.evaluate(() => {
    const r = document.getElementById("card").getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
  });
  assert.equal(box.width, 750);
  assert.equal(box.height, 1050);
  const mine = await page.screenshot({ clip: box, fullPage: true, omitBackground: true });
  const real = fs.readFileSync(REAL_CARD);
  const result = await page.evaluate(async ({ mine, real }) => {
    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    const a = await load(`data:image/webp;base64,${real}`);
    const b = await load(`data:image/png;base64,${mine}`);
    if (b.naturalWidth !== 1500 || b.naturalHeight !== 2100) return { size: [b.naturalWidth, b.naturalHeight] };
    const W = 1500;
    const H = 2100;
    const px = (img) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      return ctx.getImageData(0, 0, W, H).data;
    };
    const ra = px(a);
    const rb = px(b);
    const region = (x0, y0, x1, y1) => {
      let sum = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * W + x) * 4;
          sum += Math.abs(ra[i] - rb[i]) + Math.abs(ra[i + 1] - rb[i + 1]) + Math.abs(ra[i + 2] - rb[i + 2]);
        }
      }
      return sum / ((x1 - x0) * (y1 - y0) * 3);
    };
    const scores = {
      header: region(140, 120, 1360, 222),
      area: region(500, 1050, 1000, 1125),
      vibes: region(140, 1205, 1365, 1400),
      moves: region(140, 1530, 1365, 1630),
      bars: region(280, 1700, 1360, 1960),
      border: region(0, 0, 1500, 110),
    };
    const pad = 60;
    const top = 120;
    const out = document.createElement("canvas");
    out.width = W * 2 + pad * 3;
    out.height = H + top + pad;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = "#5a6f5e";
    ctx.font = "700 56px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("The real Time Again card", pad, 82);
    ctx.fillText("The live preview, same data", W + pad * 2, 82);
    ctx.drawImage(a, pad, top, W, H);
    ctx.drawImage(b, W + pad * 2, top, W, H);
    return { scores, png: out.toDataURL("image/png").split(",")[1] };
  }, { mine: mine.toString("base64"), real: real.toString("base64") });
  assert.ok(!result.size, `card screenshot is ${result.size}, expected 1500,2100`);
  fs.writeFileSync(path.join(ARTIFACTS, "input_form_v5_fidelity_timeagain.png"), Buffer.from(result.png, "base64"));
  const limits = { header: 10, area: 12, vibes: 17, moves: 6, bars: 6, border: 4 };
  for (const key of Object.keys(limits)) {
    assert.ok(result.scores[key] < limits[key], `fidelity ${key}: mean diff ${result.scores[key].toFixed(2)} >= ${limits[key]}`);
  }
  console.log("fidelity vs the real Time Again card (mean abs RGB diff, 0-255):",
    Object.entries(result.scores).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", "));
  await context.close();
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
  await page.goto(`${base}/betweenusfriends/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => initPlaces("test-key"));
  await page.waitForFunction(() => document.getElementById("place").getAttribute("data-places") === "on");
  await page.fill("#place", "C +");
  await page.locator(".place-option").first().waitFor();
  assert.equal(await page.locator(".place-option").count(), 3);
  assert.equal(await page.locator("#place").getAttribute("aria-expanded"), "true");
  await page.screenshot({ path: path.join(ARTIFACTS, `input_form_v5_places_${label}.png`) });
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
  assert.equal(await page.locator("#card-area").textContent(), "East Village, New York");
  // The pick refreshes the card. It must not look like more typing, or the list opens again.
  await page.waitForTimeout(600);
  assert.equal(await page.locator("#place-list").isHidden(), true, `${label} suggestion list stays closed after a pick`);
  assert.equal(await page.locator("#place").getAttribute("aria-expanded"), "false");
  assert.equal(await page.evaluate(() => window.__placesLog.requests.length), 1, `${label} a pick does not search again`);
  await page.screenshot({ path: path.join(ARTIFACTS, `places_closed_${label}.png`) });
  const fields = await page.evaluate(() => window.__placesLog.fields);
  assert.deepEqual(fields, ["displayName", "googleMapsURI", "addressComponents", "addressDescriptor"]);
  await page.fill("#area", "Lower East Side");
  assert.equal(await page.locator("#area").isEditable(), true, `${label} neighborhood stays editable`);
  assert.equal(await page.inputValue("#area"), "Lower East Side");
  assert.equal(await page.locator("#card-area").textContent(), "Lower East Side, New York");
  await page.fill("#place", "Smor");
  await page.locator(".place-option").first().waitFor();
  await page.locator(".place-option").first().click();
  await page.waitForFunction(() => document.getElementById("place").value === "C + B");
  await page.waitForTimeout(400);
  assert.equal(await page.inputValue("#area"), "Lower East Side", `${label} a typed neighborhood is not replaced`);
  assert.equal(await page.locator("#area").isEditable(), true);
  assert.equal(await page.locator("#place-list").isHidden(), true);
  const after = await page.evaluate(() => window.__placesLog.requests.map((item) => item.token));
  assert.deepEqual(after, [1, 2]);
  assert.equal(mapsCalls.length, 0, `${label} mock must not call Google`);
}

function installAreaMock(fixtures) {
  const samples = fixtures.map((item, index) => ({
    name: item.displayName,
    uri: `https://maps.google.com/?cid=${index + 1}`,
    components: item.components,
    areas: item.areas,
  }));
  window.__areaPicks = [];
  function Token() {}
  window.google = {
    maps: {
      importLibrary() {
        return Promise.resolve({
          AutocompleteSessionToken: Token,
          AutocompleteSuggestion: {
            fetchAutocompleteSuggestions(body) {
              const typed = body.input.toLowerCase();
              const hits = samples.filter((sample) => sample.name.toLowerCase().includes(typed));
              return Promise.resolve({
                suggestions: hits.map((sample) => ({
                  placePrediction: {
                    mainText: { toString() { return sample.name; } },
                    secondaryText: { toString() { return "Somewhere"; } },
                    text: { toString() { return sample.name; } },
                    toPlace() {
                      return {
                        displayName: sample.name,
                        googleMapsURI: sample.uri,
                        addressComponents: sample.components,
                        addressDescriptor: { areas: sample.areas.map((a) => ({ containment: a.containment, place: { displayName: a.name } })) },
                        fetchFields() { return Promise.resolve(); },
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

const AREA_SPOTS = [
  ["Time Again", "TIME AGAIN", "NYC", "Chinatown"],
  ["Katz", "Katz's Delicatessen", "NYC", "Lower East Side"],
  ["Via Carota", "Via Carota", "NYC", "West Village"],
  ["Veselka", "Veselka", "NYC", "East Village"],
  ["Peter Luger", "Peter Luger Steak House", "NYC", "Williamsburg"],
  ["Roberta", "Roberta's", "NYC", "Bushwick"],
  ["Roberto", "Roberto's", "NYC", "Bronx"],
  ["Bu Qtair", "Bu Qtair Restaurant", "Dubai", "Umm Suqeim 2"],
];

async function areaFlow(page, label, base) {
  const posts = [];
  await page.route("https://sheet.test/**", async (route) => {
    posts.push(JSON.parse(route.request().postData()));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route("https://maps.googleapis.com/**", (route) => route.abort());
  const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, "_input-form/test/fixtures/places-real.json"), "utf8"));
  fixtures.push({
    query: "Nameless",
    displayName: "Nameless Spot",
    components: [
      { longText: "Manhattan", types: ["sublocality_level_1", "sublocality"] },
      { longText: "New York", types: ["locality"] },
    ],
    areas: [{ containment: "WITHIN", name: "Manhattan" }],
  });
  await page.addInitScript(installAreaMock, fixtures);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${base}/betweenusfriends/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("place").getAttribute("data-places") === "on");
  await page.evaluate((endpoint) => { FORM_ENDPOINT = endpoint; }, ENDPOINT);

  const required = await page.evaluate(() => ({
    attr: document.getElementById("area").required,
    ariaRequired: document.getElementById("area").getAttribute("aria-required"),
    label: document.querySelector('label[for="area"]').textContent,
  }));
  assert.equal(required.attr, false, `${label} area is not required`);
  assert.equal(required.ariaRequired, null);
  assert.equal(/\*/.test(required.label), false, `${label} no asterisk on area`);

  async function pick(typed, name) {
    await page.fill("#place", typed);
    await page.locator(".place-option").first().waitFor();
    await page.locator(".place-option").first().click();
    await page.waitForFunction((want) => document.getElementById("place").value === want, name);
    await page.waitForTimeout(150);
  }

  async function send() {
    await page.evaluate(() => { formStartedAt = Date.now() - 5000; });
    await page.click("#send");
    await page.waitForFunction(() => {
      const status = document.getElementById("status").textContent;
      return status.startsWith("Locked in.") && !document.getElementById("send").disabled;
    });
    return posts[posts.length - 1];
  }

  const results = [];
  for (const [typed, name, city, want] of AREA_SPOTS) {
    await pick(typed, name);
    const got = await page.inputValue("#area");
    assert.equal(await page.inputValue("#city"), city, `${name} city`);
    assert.equal(got, want, `${label} ${name} fills ${want}`);
    assert.equal(await page.locator("#area").isEditable(), true);
    assert.equal(await page.locator("#err-area").textContent(), "");
    results.push([name, got]);
    if (name === "TIME AGAIN") {
      assert.equal(await page.locator("#card-area").textContent(), `Chinatown, New York`);
      await page.waitForTimeout(500);
      assert.equal(await page.locator("#place-list").isHidden(), true);
      await page.mouse.move(2, 300);
      if (label === "mobile") await page.locator("#area").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(ARTIFACTS, `area_filled_${label}.png`) });
    }
  }

  // Something they typed is never replaced, by a pick or a later pick.
  await page.fill("#area", "Tompkins");
  await pick("Katz", "Katz's Delicatessen");
  assert.equal(await page.inputValue("#area"), "Tompkins", `${label} typed area survives a pick`);
  await pick("Veselka", "Veselka");
  assert.equal(await page.inputValue("#area"), "Tompkins");
  // Clearing it lets the next pick fill, and an autofilled one is replaced by the next pick.
  await page.fill("#area", "");
  await pick("Katz", "Katz's Delicatessen");
  assert.equal(await page.inputValue("#area"), "Lower East Side");
  await pick("Veselka", "Veselka");
  assert.equal(await page.inputValue("#area"), "East Village", `${label} an autofilled area follows the next pick`);

  // Typed area goes out as typed.
  await fillDetails(page);
  await page.fill("#area", "Tompkins");
  assert.equal((await send()).area, "Tompkins");

  // Blank at submit, spot still the one they picked: Google's area goes out and shows.
  await fillDetails(page);
  await pick("Time Again", "TIME AGAIN");
  await page.fill("#area", "");
  assert.equal(await page.locator("#card-area").textContent(), "New York");
  assert.equal((await send()).area, "Chinatown", `${label} a blank area sends Google's area`);

  // They renamed the spot, so the old pick's area no longer applies.
  await fillDetails(page);
  await pick("Time Again", "TIME AGAIN");
  await page.fill("#place", "Totally different spot");
  await page.fill("#area", "");
  assert.equal((await send()).area, "", `${label} a renamed spot does not borrow the old area`);

  // Only the casing of the name changed: still the same pick.
  await fillDetails(page);
  await pick("Time Again", "TIME AGAIN");
  await page.fill("#place", "Time Again");
  await page.fill("#area", "");
  assert.equal((await send()).area, "Chinatown");

  // Google had nothing but a borough: blank, and it submits.
  await fillDetails(page);
  await pick("Nameless", "Nameless Spot");
  assert.equal(await page.inputValue("#area"), "");
  const nameless = await send();
  assert.equal(nameless.area, "");
  assert.equal(nameless.restaurant, "Nameless Spot");

  // Never picked anything: blank and it submits.
  await fillDetails(page);
  await page.fill("#place", "Typed by hand");
  await page.fill("#city", "NYC");
  assert.equal(await page.inputValue("#area"), "");
  assert.equal((await send()).area, "");

  assert.equal(posts.length, 6);
  assert.deepEqual(errors, []);
  return results;
}

async function placesLoadFailure(page, base) {
  await page.addInitScript(() => {
    window.google = { maps: { importLibrary: () => Promise.reject(new Error("could not load")) } };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${base}/betweenusfriends/`, { waitUntil: "domcontentloaded" });
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
  // The page has a browser key. Don't load the real Maps script from these tests.
  await context.route(/https?:\/\/maps\.googleapis\.com\/.*/i, (route) => route.abort());
  return context;
}

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
await assertRoutes(base);
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
  const areaDesktop = await desktopContext.newPage();
  for (const [name, area] of await areaFlow(areaDesktop, "desktop", base)) console.log(`area (desktop mock of real response): ${name} -> ${area}`);
  const placesFailed = await desktopContext.newPage();
  await placesLoadFailure(placesFailed, base);
  await desktopContext.close();

  await fidelity(browser, base);

  const mobileContext = await guardedContext(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  await exercise(mobile, "mobile", base);
  const placesMobile = await mobileContext.newPage();
  await placesFlow(placesMobile, "mobile", base);
  const areaMobile = await mobileContext.newPage();
  await areaFlow(areaMobile, "mobile", base);
  await mobileContext.close();

  assert.equal(appsScriptHits.length, 0, "script.google.com was contacted");
  console.log("form checks passed");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
