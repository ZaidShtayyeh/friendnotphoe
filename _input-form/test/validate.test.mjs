import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const v = require("../../input-form/validate.js");

const now = 1_700_000_000_000;

function words(count) {
  return Array.from({ length: count }, (_, i) => `w${i}`).join(" ");
}

const TINY_PHOTO = "aGVsbG8=";

function b64OfBytes(n) {
  const chars = Math.ceil(n / 3) * 4;
  let raw = "A".repeat(chars);
  const mod = n % 3;
  if (mod === 1) raw = `${raw.slice(0, -2)}==`;
  else if (mod === 2) raw = `${raw.slice(0, -1)}=`;
  return raw;
}

function valid(overrides = {}) {
  return {
    submittedBy: "Sam",
    restaurant: "C + B",
    photoData: TINY_PHOTO,
    photoName: "spot.jpg",
    photoType: "image/jpeg",
    maps: "https://maps.google.com/?q=C%20%2B%20B",
    city: "NYC",
    area: "East Village",
    hp: "270",
    category: "Food first",
    vibes: "Short line about the sandwich.",
    move1: "Bread & Olive Oil",
    move2: "Dirty Martini",
    move3: "Orange Wine",
    food: "80",
    drink: "50",
    scene: "60",
    company: "",
    startedAt: now - 5000,
    ...overrides,
  };
}

test("word count splits on whitespace and ignores extra spaces", () => {
  assert.equal(v.wordCount(""), 0);
  assert.equal(v.wordCount("   "), 0);
  assert.equal(v.wordCount("one"), 1);
  assert.equal(v.wordCount("  two   words \n here  "), 3);
  assert.equal(v.wordCount(words(50)), 50);
  assert.equal(v.wordCount(words(51)), 51);
});

test("score accepts 1 and 300 and rejects 0, 301, 310, and decimals", () => {
  for (const hp of ["1", "300", 300, "270"]) {
    assert.equal(v.validateSubmission(valid({ hp })).ok, true, String(hp));
    assert.equal(v.validateSubmission(valid({ hp })).value.hp, Number(hp));
  }
  for (const hp of ["0", "301", "310", "1.5", "01", "", "  ", "+5", "1e2", "-1"]) {
    const result = v.validateSubmission(valid({ hp }));
    assert.equal(result.ok, false, String(hp));
    assert.match(result.errors.hp, /1 to 300/);
  }
});

test("vibes allow 50 words and 250 characters, and reject either overflow", () => {
  assert.equal(v.validateSubmission(valid({ vibes: words(50) })).ok, true);
  const tooMany = v.validateSubmission(valid({ vibes: words(51) }));
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.errors.vibes, /50 words/);

  const chars250 = `${"a".repeat(240)} ${"b".repeat(9)}`;
  assert.equal(chars250.length, 250);
  assert.equal(v.wordCount(chars250), 2);
  assert.equal(v.validateSubmission(valid({ vibes: chars250 })).ok, true);

  const chars251 = `${chars250}c`;
  const tooLong = v.validateSubmission(valid({ vibes: chars251 }));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.errors.vibes, /250 characters/);

  const both = v.validateSubmission(valid({ vibes: `${words(51)} ${"x".repeat(250)}` }));
  assert.match(both.errors.vibes, /50 words or fewer and 250 characters/);
  assert.equal(v.validateSubmission(valid({ vibes: "   " })).errors.vibes, "Vibes are required.");
});

test("maps link is optional and limited to https Google Maps hosts", () => {
  const ok = [
    "",
    "   ",
    "https://www.google.com/maps/place/Foo",
    "https://google.com/maps?q=place",
    "https://www.google.com/maps/search/?api=1&query=C+%2B+B",
    "https://maps.google.com/?q=place",
    "https://maps.google.com/maps?q=place",
    "https://maps.app.goo.gl/abcDEF",
    "https://goo.gl/maps/abc",
    "https://goo.gl/maps",
  ];
  for (const maps of ok) assert.equal(v.isMapsUrl(maps), true, maps);

  const bad = [
    "http://maps.google.com/?q=x",
    "https://google.com/search?q=maps",
    "https://google.com/maps.evil",
    "https://maps.google.com.evil.test/",
    "https://evil.test/maps",
    "https://maps.app.goo.gl",
    "https://maps.app.goo.gl/",
    "https://goo.gl/not-maps",
    "javascript:alert(1)",
    "https://user:pass@maps.google.com/",
    "ftp://maps.google.com/",
    "https://www.google.com/maps/../../etc",
  ];
  for (const maps of bad) {
    assert.equal(v.isMapsUrl(maps), false, maps);
    assert.match(v.validateSubmission(valid({ maps })).errors.maps, /https Google Maps/);
  }
  assert.equal(v.validateSubmission(valid({ maps: "" })).value.maps, "");
});

test("rankings are whole numbers from 0 to 100", () => {
  assert.equal(v.validateSubmission(valid({ food: "0", drink: "100", scene: 55 })).ok, true);
  for (const [key, bad] of [["food", "-1"], ["drink", "101"], ["scene", "1.2"], ["food", ""], ["drink", "00"]]) {
    const result = v.validateSubmission(valid({ [key]: bad }));
    assert.equal(result.ok, false, `${key}=${bad}`);
    assert.match(result.errors[key], /0 to 100/);
  }
});

test("category colors are the confirmed mapping and vibes first is blue", () => {
  assert.deepEqual(v.CATEGORY_COLORS, {
    "Food first": "Green",
    "Drinks first": "Blue",
    "Legendary": "Gold",
    "Vibes first": "Blue",
  });
  for (const category of v.CATEGORIES) {
    const result = v.validateSubmission(valid({ category }));
    assert.equal(result.ok, true, category);
    assert.equal(result.value.color, v.CATEGORY_COLORS[category]);
    assert.equal(result.value.category, category);
  }
  assert.equal(v.validateSubmission(valid({ category: "food first" })).errors.category, "Pick a category.");
  assert.equal(v.validateSubmission(valid({ category: "" })).errors.category, "Pick a category.");
});

test("your name is required, trimmed, and capped at 60 characters", () => {
  assert.equal(v.validateSubmission(valid({ submittedBy: "  Sam  " })).value.submittedBy, "Sam");
  assert.equal(v.validateSubmission(valid({ submittedBy: "" })).errors.submittedBy, "Your name is required.");
  assert.equal(v.validateSubmission(valid({ submittedBy: "   " })).errors.submittedBy, "Your name is required.");
  assert.equal(v.validateSubmission(valid({ submittedBy: "n".repeat(60) })).ok, true);
  assert.match(v.validateSubmission(valid({ submittedBy: "n".repeat(61) })).errors.submittedBy, /60/);
});

test("required place, city, and area are trimmed and capped at 80 characters", () => {
  assert.equal(v.validateSubmission(valid({ restaurant: "  Café  " })).value.restaurant, "Café");
  assert.equal(v.validateSubmission(valid({ restaurant: "" })).errors.restaurant, "Place name is required.");
  assert.match(v.validateSubmission(valid({ restaurant: "a".repeat(81) })).errors.restaurant, /80/);
  assert.equal(v.validateSubmission(valid({ restaurant: "a".repeat(80) })).ok, true);
  assert.equal(v.validateSubmission(valid({ city: " " })).errors.city, "City is required.");
  assert.equal(v.validateSubmission(valid({ area: "" })).errors.area, "Area is required.");
  assert.match(v.validateSubmission(valid({ city: "c".repeat(81) })).errors.city, /80/);
  assert.match(v.validateSubmission(valid({ area: "a".repeat(81) })).errors.area, /80/);
});

test("a photo is required, must be an allowed image, and must be 5 MB or smaller", () => {
  const ok = v.validateSubmission(valid());
  assert.equal(ok.ok, true);
  assert.equal(ok.value.photoData, TINY_PHOTO);
  assert.equal(ok.value.photoName, "spot.jpg");
  assert.equal(ok.value.photoType, "image/jpeg");

  assert.equal(v.validateSubmission(valid({ photoData: "" })).errors.photo, "A photo is required.");
  assert.equal(v.validateSubmission(valid({ photoData: "   " })).errors.photo, "A photo is required.");
  assert.equal(v.validateSubmission(valid({ photoType: "image/gif" })).errors.photo, "Photo must be a jpeg, png, webp, or heic image.");
  assert.equal(v.validateSubmission(valid({ photoType: "" })).errors.photo, "Photo must be a jpeg, png, webp, or heic image.");
  assert.equal(v.validateSubmission(valid({ photoData: "!!!!" })).errors.photo, "Photo could not be read.");

  const wrapped = v.validateSubmission(valid({ photoData: "aGVs bG8=", photoType: "image/jpg" }));
  assert.equal(wrapped.value.photoData, TINY_PHOTO);
  assert.equal(wrapped.value.photoType, "image/jpeg");

  const prefixed = v.validateSubmission(valid({ photoData: "data:image/jpeg;base64,aGVsbG8=" }));
  assert.equal(prefixed.value.photoData, TINY_PHOTO);

  for (const type of ["image/png", "image/webp", "image/heic"]) {
    assert.equal(v.validateSubmission(valid({ photoType: type })).value.photoType, type);
  }
  assert.equal(v.validateSubmission(valid({ photoType: "image/heif" })).value.photoType, "image/heic");

  const longName = `${"n".repeat(200)}.jpg`;
  assert.equal(v.validateSubmission(valid({ photoName: `  ${longName}  ` })).value.photoName.length, 180);

  const limit = v.LIMITS.photoBytes;
  assert.equal(v.validateSubmission(valid({ photoData: b64OfBytes(limit) })).ok, true);
  assert.equal(v.validateSubmission(valid({ photoData: b64OfBytes(limit + 1) })).errors.photo, "Photo must be 5 MB or smaller.");
});

test("three special moves are required, trimmed, and capped at 24 characters so they fit the card", () => {
  const ok = v.validateSubmission(valid({ move1: "  Bread & Olive Oil  ", move3: "x".repeat(24) }));
  assert.equal(ok.ok, true);
  assert.equal(ok.value.move1, "Bread & Olive Oil");
  assert.equal(ok.value.move2, "Dirty Martini");
  assert.equal(ok.value.move3, "x".repeat(24));
  assert.equal(v.LIMITS.move, 24);

  const missing = v.validateSubmission(valid({ move1: "", move2: "   ", move3: undefined }));
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.move1, "Move 1 is required.");
  assert.equal(missing.errors.move2, "Move 2 is required.");
  assert.equal(missing.errors.move3, "Move 3 is required.");

  const long = v.validateSubmission(valid({ move2: "y".repeat(25) }));
  assert.equal(long.ok, false);
  assert.deepEqual(Object.keys(long.errors), ["move2"]);
  assert.equal(long.errors.move2, "Move 2 must be 24 characters or fewer.");
});

test("spam check rejects a honeypot and a too-fast or missing timestamp", () => {
  assert.equal(v.checkSpam(valid(), now).ok, true);
  assert.equal(v.checkSpam(valid({ startedAt: now - 3000 }), now).ok, true);
  assert.match(v.checkSpam(valid({ company: "http://spam.test" }), now).error, /didn't go through/);
  assert.match(v.checkSpam(valid({ startedAt: now }), now).error, /few seconds/);
  assert.match(v.checkSpam(valid({ startedAt: now + 1000 }), now).error, /few seconds/);
  assert.match(v.checkSpam(valid({ startedAt: "nope" }), now).error, /didn't go through/);
});

test("reply interpreter never treats an opaque or unreadable body as saved", () => {
  assert.deepEqual(v.interpretReply({ type: "opaque", status: 0 }), { kind: "opaque" });
  assert.deepEqual(v.interpretReply({ status: 200, body: '{"ok":true}' }), { kind: "success" });
  assert.deepEqual(v.interpretReply({ status: 200, body: '{"ok":false,"error":"Score must be a whole number from 1 to 300."}' }), {
    kind: "error",
    error: "Score must be a whole number from 1 to 300.",
  });
  assert.equal(v.interpretReply({ status: 200, body: "<html>" }).kind, "opaque");
  assert.equal(v.interpretReply({ status: 500, body: "" }).kind, "error");
  assert.equal(v.interpretReply({ status: 200, body: '{"ok":false}' }).error, "The sheet rejected that.");
});
