import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root = new URL("../apps-script/Code.gs", import.meta.url);
const shared = fs.readFileSync(new URL("../../input-form/validate.js", import.meta.url), "utf8");
const source = fs.readFileSync(root, "utf8");

test("Code.gs embeds the page validation unchanged and avoids the pipeline sheets", () => {
  assert.ok(source.includes(shared));
  assert.equal(source.includes("getSheetByName('Master Reference')"), false);
  assert.equal(source.includes('getSheetByName("Master Reference")'), false);
  assert.equal(source.includes("getSheetByName('Sheet1')"), false);
  assert.equal(source.includes('getSheetByName("Sheet1")'), false);
  assert.match(source, /Friend Submissions/);
  assert.match(source, /America\/New_York/);
});

function boot(options = {}) {
  const calls = { names: [], inserts: [], locks: [], tz: null };
  const sheets = new Map();
  function makeSheet(name) {
    const rows = [];
    return {
      name,
      rows,
      appendRow(row) {
        if (options.appendThrows) throw new Error("append failed");
        rows.push(row.slice());
      },
      getLastRow() {
        return rows.length;
      },
    };
  }
  const ss = {
    getSheetByName(name) {
      calls.names.push(name);
      return sheets.get(name) || null;
    },
    insertSheet(name) {
      calls.inserts.push(name);
      const sheet = makeSheet(name);
      sheets.set(name, sheet);
      return sheet;
    },
  };
  if (options.existing) sheets.set("Friend Submissions", options.existing);
  const context = {
    URL,
    JSON,
    Date,
    Number,
    String,
    Object,
    Array,
    Error,
    RegExp,
    Math,
    isFinite,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: {
      getScriptLock: () => ({
        waitLock(ms) {
          calls.locks.push(["wait", ms]);
          if (options.lockFails) throw new Error("lock timeout");
        },
        releaseLock() {
          calls.locks.push(["release"]);
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) {
        return { text, mime: null, setMimeType(mime) { this.mime = mime; return this; } };
      },
    },
    Utilities: {
      formatDate(_date, tz, fmt) {
        calls.tz = tz;
        calls.fmt = fmt;
        return "2026-11-10 09:15:00";
      },
    },
  };
  vm.runInContext(source, vm.createContext(context), { filename: "Code.gs" });
  return { context, calls, sheets };
}

function reply(out) {
  assert.equal(out.mime, "application/json");
  return JSON.parse(out.text);
}

function event(body) {
  return { postData: { contents: JSON.stringify(body), type: "text/plain" } };
}

const now = 1_700_000_000_000;
function entry(overrides = {}) {
  return {
    submittedBy: "Sam",
    restaurant: "C + B",
    maps: "https://www.google.com/maps/search/?api=1&query=C+%2B+B",
    city: "NYC",
    area: "East Village",
    hp: "270",
    category: "Food first",
    vibes: "A short line about the sandwich.",
    food: "80",
    drink: "50",
    scene: "60",
    company: "",
    startedAt: now - 5000,
    token: "",
    ...overrides,
  };
}

test("a valid post creates Friend Submissions with headers and one row", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const { context, calls, sheets } = boot();
    const body = reply(context.doPost(event(entry())));
    assert.deepEqual(body, { ok: true });
    assert.deepEqual(calls.names, ["Friend Submissions"]);
    assert.deepEqual(calls.inserts, ["Friend Submissions"]);
    assert.equal(calls.tz, "America/New_York");
    assert.deepEqual(calls.locks, [["wait", 10000], ["release"]]);
    const rows = sheets.get("Friend Submissions").rows;
    assert.equal(JSON.stringify(rows[0]), JSON.stringify([
      "Submitted at", "Submitted by", "Restaurant", "HP", "Category", "Color", "City", "Area",
      "Vibes", "Food", "Drink", "Scene", "Google Maps link",
    ]));
    assert.equal(JSON.stringify(rows[1]), JSON.stringify([
      "2026-11-10 09:15:00", "Sam", "C + B", 270, "Food first", "Green", "NYC", "East Village",
      "A short line about the sandwich.", 80, 50, 60,
      "https://www.google.com/maps/search/?api=1&query=C+%2B+B",
    ]));
  } finally {
    Date.now = realNow;
  }
});

test("colors follow the single mapping, with vibes first blue like drinks first", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const { context, sheets } = boot();
    const expected = {
      "Food first": "Green",
      "Drinks first": "Blue",
      Legendary: "Gold",
      "Vibes first": "Blue",
    };
    for (const category of Object.keys(expected)) {
      assert.equal(reply(context.doPost(event(entry({ category })))).ok, true);
    }
    const colors = sheets.get("Friend Submissions").rows.slice(1).map((row) => row[5]);
    assert.deepEqual(colors, Object.values(expected));
    assert.equal(sheets.get("Friend Submissions").rows[0][0], "Submitted at");
  } finally {
    Date.now = realNow;
  }
});

test("a second post does not repeat the header row", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const { context, sheets } = boot();
    context.doPost(event(entry()));
    context.doPost(event(entry({ restaurant: "Forsythia" })));
    const rows = sheets.get("Friend Submissions").rows;
    assert.equal(rows.length, 3);
    assert.equal(rows.filter((row) => row[0] === "Submitted at").length, 1);
    assert.equal(rows[2][1], "Sam");
    assert.equal(rows[2][2], "Forsythia");
  } finally {
    Date.now = realNow;
  }
});

test("an existing tab is appended to and not recreated", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const existing = {
      name: "Friend Submissions",
      rows: [["Submitted at", "Submitted by", "Restaurant", "HP", "Category", "Color", "City", "Area", "Vibes", "Food", "Drink", "Scene", "Google Maps link"]],
      appendRow(row) { this.rows.push(row.slice()); },
      getLastRow() { return this.rows.length; },
    };
    const { context, calls } = boot({ existing });
    assert.equal(reply(context.doPost(event(entry()))).ok, true);
    assert.deepEqual(calls.inserts, []);
    assert.equal(existing.rows.length, 2);
  } finally {
    Date.now = realNow;
  }
});

test("invalid fields, honeypot, and too-fast posts write nothing", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const cases = [
      entry({ hp: "301" }),
      entry({ hp: "310" }),
      entry({ vibes: Array.from({ length: 51 }, () => "word").join(" ") }),
      entry({ maps: "http://maps.google.com/?q=x" }),
      entry({ food: "101" }),
      entry({ company: "http://spam.test" }),
      entry({ startedAt: now }),
      entry({ category: "Nope" }),
      entry({ submittedBy: "" }),
      entry({ submittedBy: "n".repeat(61) }),
    ];
    for (const body of cases) {
      const { context, calls, sheets } = boot();
      const result = reply(context.doPost(event(body)));
      assert.equal(result.ok, false, JSON.stringify(body));
      assert.equal(typeof result.error, "string");
      assert.equal(sheets.size, 0);
      assert.deepEqual(calls.inserts, []);
      assert.deepEqual(calls.locks, []);
    }
  } finally {
    Date.now = realNow;
  }
});

test("bad JSON, a token mismatch, a lock failure, and an append failure do not claim success", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const { context } = boot();
    assert.equal(reply(context.doPost({})).ok, false);
    assert.equal(reply(context.doPost({ postData: { contents: "{no" } })).ok, false);
    assert.equal(reply(context.doPost({ postData: { contents: "[]" } })).ok, false);
    context.SHARED_TOKEN = "friend";
    assert.equal(reply(context.doPost(event(entry({ token: "other" })))).ok, false);
    assert.equal(reply(context.doPost(event(entry({ token: "friend" })))).ok, true);

    const locked = boot({ lockFails: true });
    const lockedReply = reply(locked.context.doPost(event(entry())));
    assert.equal(lockedReply.ok, false);
    assert.equal(locked.sheets.size, 0);
    assert.deepEqual(locked.calls.locks, [["wait", 10000]]);

    const exploding = boot({ appendThrows: true });
    assert.equal(reply(exploding.context.doPost(event(entry()))).ok, false);
    assert.deepEqual(exploding.calls.locks, [["wait", 10000], ["release"]]);
  } finally {
    Date.now = realNow;
  }
});

test("text that looks like a formula is neutralized, and doGet writes nothing", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const { context, sheets } = boot();
    assert.deepEqual(reply(context.doGet()), { ok: true, ready: true });
    assert.equal(sheets.size, 0);
    assert.equal(reply(context.doPost(event(entry({ restaurant: "=HYPERLINK(\"https://evil.test\")" })))).ok, true);
    const restaurant = sheets.get("Friend Submissions").rows[1][2];
    assert.equal(restaurant.startsWith("'="), true);
  } finally {
    Date.now = realNow;
  }
});
