import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root = new URL("../apps-script/Code.gs", import.meta.url);
const shared = fs.readFileSync(new URL("../../betweenusfriends/validate.js", import.meta.url), "utf8");
const source = fs.readFileSync(root, "utf8");

test("Code.gs embeds the page validation unchanged and avoids the pipeline sheets", () => {
  assert.ok(source.includes(shared));
  assert.equal(source.includes("getSheetByName('Master Reference')"), false);
  assert.equal(source.includes('getSheetByName("Master Reference")'), false);
  assert.equal(source.includes("getSheetByName('Sheet1')"), false);
  assert.equal(source.includes('getSheetByName("Sheet1")'), false);
  assert.match(source, /Friend Submissions/);
  assert.match(source, /FNF Friend Photos/);
  assert.match(source, /America\/New_York/);
  assert.equal(source.includes("setSharing"), false);
});

function sheetCells(rows) {
  return {
    getLastColumn() {
      return rows.reduce((max, row) => Math.max(max, row.length), 0);
    },
    getRange(row, col, numRows, numCols) {
      const height = numRows || 1;
      const width = numCols || 1;
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < height; r += 1) {
            const source = rows[row - 1 + r] || [];
            const line = [];
            for (let c = 0; c < width; c += 1) {
              const value = source[col - 1 + c];
              line.push(value == null ? "" : value);
            }
            out.push(line);
          }
          return out;
        },
        setValue(val) {
          const target = rows[row - 1];
          while (target.length < col) target.push("");
          target[col - 1] = val;
        },
      };
    },
  };
}

function boot(options = {}) {
  const calls = { names: [], inserts: [], locks: [], tz: null, fmts: [] };
  const sheets = new Map();
  const files = [];
  const folders = [];
  const props = {};
  const sharing = [];
  function makeFolder(name) {
    const folder = {
      id: `folder-${folders.length + 1}`,
      name,
      getId() { return this.id; },
      createFile(blob) {
        if (options.fileThrows) throw new Error("drive failed");
        const file = {
          name: blob.getName(),
          mime: blob.getContentType(),
          bytes: blob.getBytes(),
          url: `https://drive.google.com/file/d/file-${files.length + 1}/view`,
          setSharing(access, perm) { sharing.push([access, perm]); },
          getUrl() { return this.url; },
        };
        files.push(file);
        return file;
      },
    };
    return folder;
  }
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
      ...sheetCells(rows),
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
        calls.fmts.push(fmt);
        calls.fmt = fmt;
        if (fmt === "yyyy-MM-dd HHmm") return "2026-11-10 0915";
        return "2026-11-10 09:15:00";
      },
      base64Decode(data) {
        return Buffer.from(String(data), "base64");
      },
      newBlob(bytes, mime, name) {
        return {
          getBytes() { return bytes; },
          getContentType() { return mime; },
          getName() { return name; },
        };
      },
    },
    DriveApp: {
      getFolderById(id) {
        const folder = folders.find((item) => item.id === id);
        if (!folder) throw new Error("missing folder");
        return folder;
      },
      getFoldersByName(name) {
        const matches = folders.filter((item) => item.name === name);
        let index = 0;
        return {
          hasNext() { return index < matches.length; },
          next() { return matches[index++]; },
        };
      },
      createFolder(name) {
        const folder = makeFolder(name);
        folders.push(folder);
        return folder;
      },
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null; },
          setProperty(key, value) { props[key] = String(value); },
        };
      },
    },
  };
  vm.runInContext(source, vm.createContext(context), { filename: "Code.gs" });
  return { context, calls, sheets, files, folders, props, sharing };
}

function reply(out) {
  assert.equal(out.mime, "application/json");
  return JSON.parse(out.text);
}

function event(body) {
  return { postData: { contents: JSON.stringify(body), type: "text/plain" } };
}

function b64OfBytes(n) {
  const chars = Math.ceil(n / 3) * 4;
  let raw = "A".repeat(chars);
  const mod = n % 3;
  if (mod === 1) raw = `${raw.slice(0, -2)}==`;
  else if (mod === 2) raw = `${raw.slice(0, -1)}=`;
  return raw;
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
    move1: "Bread & Olive Oil",
    move2: "Dirty Martini",
    move3: "=Orange Wine",
    food: "80",
    drink: "50",
    scene: "60",
    photoData: "aGVsbG8=",
    photoName: "spot.jpg",
    photoType: "image/jpeg",
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
    const { context, calls, sheets, files, folders, props, sharing } = boot();
    const body = reply(context.doPost(event(entry())));
    assert.deepEqual(body, { ok: true });
    assert.deepEqual(calls.names, ["Friend Submissions"]);
    assert.deepEqual(calls.inserts, ["Friend Submissions"]);
    assert.equal(calls.tz, "America/New_York");
    assert.deepEqual(calls.fmts, ["yyyy-MM-dd HHmm", "yyyy-MM-dd HH:mm:ss"]);
    assert.deepEqual(calls.locks, [["wait", 10000], ["release"]]);
    const rows = sheets.get("Friend Submissions").rows;
    assert.equal(JSON.stringify(rows[0]), JSON.stringify([
      "Submitted at", "Submitted by", "Restaurant", "HP", "Category", "Color", "City", "Area",
      "Vibes", "Food", "Drink", "Scene", "Google Maps link", "Photo", "Move 1", "Move 2", "Move 3",
    ]));
    assert.equal(JSON.stringify(rows[1]), JSON.stringify([
      "2026-11-10 09:15:00", "Sam", "C + B", 270, "Food first", "Green", "NYC", "East Village",
      "A short line about the sandwich.", 80, 50, 60,
      "https://www.google.com/maps/search/?api=1&query=C+%2B+B",
      "https://drive.google.com/file/d/file-1/view",
      "Bread & Olive Oil", "Dirty Martini", "'=Orange Wine",
    ]));
    assert.equal(files.length, 1);
    assert.equal(files[0].name, "2026-11-10 0915 - C + B - Sam.jpg");
    assert.equal(files[0].mime, "image/jpeg");
    assert.equal(Buffer.from(files[0].bytes).toString(), "hello");
    assert.equal(folders.length, 1);
    assert.equal(folders[0].name, "FNF Friend Photos");
    assert.equal(props.FNF_FRIEND_PHOTOS_FOLDER_ID, "folder-1");
    assert.deepEqual(sharing, []);
  } finally {
    Date.now = realNow;
  }
});

test("a post with no area still saves, with an empty Area cell", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const { context, sheets } = boot();
    for (const blank of ["", "   "]) {
      assert.deepEqual(reply(context.doPost(event(entry({ area: blank })))), { ok: true });
    }
    const rows = sheets.get("Friend Submissions").rows;
    assert.equal(rows.length, 3);
    assert.equal(rows[0][7], "Area");
    assert.equal(rows[1][6], "NYC");
    assert.equal(rows[1][7], "");
    assert.equal(rows[2][7], "");
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
    const { context, sheets, files, folders } = boot();
    context.doPost(event(entry()));
    context.doPost(event(entry({ restaurant: "Forsythia" })));
    const rows = sheets.get("Friend Submissions").rows;
    assert.equal(rows.length, 3);
    assert.equal(rows.filter((row) => row[0] === "Submitted at").length, 1);
    assert.equal(rows[0].filter((cell) => cell === "Photo").length, 1);
    assert.equal(rows[0].filter((cell) => cell === "Move 1").length, 1);
    assert.equal(rows[0].length, 17);
    assert.equal(rows[2][1], "Sam");
    assert.equal(rows[2][2], "Forsythia");
    assert.equal(folders.length, 1);
    assert.equal(files.length, 2);
    assert.equal(files[1].name, "2026-11-10 0915 - Forsythia - Sam.jpg");
    folders.length = 0;
    assert.equal(reply(context.doPost(event(entry({ restaurant: "Smor" })))).ok, true);
    assert.equal(folders.length, 1);
    assert.equal(files[2].name, "2026-11-10 0915 - Smor - Sam.jpg");
  } finally {
    Date.now = realNow;
  }
});

test("an existing tab is appended to and not recreated", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const rows = [["Submitted at", "Submitted by", "Restaurant", "HP", "Category", "Color", "City", "Area", "Vibes", "Food", "Drink", "Scene", "Google Maps link"]];
    const existing = {
      name: "Friend Submissions",
      rows,
      appendRow(row) { this.rows.push(row.slice()); },
      getLastRow() { return this.rows.length; },
      ...sheetCells(rows),
    };
    const { context, calls, files } = boot({ existing });
    assert.equal(reply(context.doPost(event(entry({ restaurant: "C / B", submittedBy: "Sam:me" })))).ok, true);
    assert.deepEqual(calls.inserts, []);
    assert.equal(existing.rows.length, 2);
    assert.equal(existing.rows[0][12], "Google Maps link");
    assert.equal(existing.rows[0][13], "Photo");
    assert.equal(JSON.stringify(existing.rows[0].slice(14)), JSON.stringify(["Move 1", "Move 2", "Move 3"]));
    assert.equal(existing.rows[1][1], "Sam:me");
    assert.equal(existing.rows[1][13], "https://drive.google.com/file/d/file-1/view");
    assert.equal(JSON.stringify(existing.rows[1].slice(14)), JSON.stringify(["Bread & Olive Oil", "Dirty Martini", "'=Orange Wine"]));
    assert.equal(files[0].name, "2026-11-10 0915 - C B - Sam me.jpg");
  } finally {
    Date.now = realNow;
  }
});

test("a tab that already has Photo gets the move headers after it, and nothing moves", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const header = ["Submitted at", "Submitted by", "Restaurant", "HP", "Category", "Color", "City", "Area", "Vibes", "Food", "Drink", "Scene", "Google Maps link", "Photo"];
    const old = ["2026-11-09 20:00:00", "Ana", "Smor", 250, "Food first", "Green", "NYC", "East Village", "Good bread.", 90, 20, 40, "", "https://drive.google.com/file/d/old/view"];
    const rows = [header.slice(), old.slice()];
    const existing = {
      name: "Friend Submissions",
      rows,
      appendRow(row) { this.rows.push(row.slice()); },
      getLastRow() { return this.rows.length; },
      ...sheetCells(rows),
    };
    const { context } = boot({ existing });
    assert.equal(reply(context.doPost(event(entry()))).ok, true);
    assert.deepEqual(rows[0], [...header, "Move 1", "Move 2", "Move 3"]);
    assert.deepEqual(rows[1], old);
    assert.equal(rows[2][13], "https://drive.google.com/file/d/file-1/view");
    assert.equal(JSON.stringify(rows[2].slice(14)), JSON.stringify(["Bread & Olive Oil", "Dirty Martini", "'=Orange Wine"]));
    assert.equal(reply(context.doPost(event(entry({ restaurant: "Forsythia" })))).ok, true);
    assert.equal(rows[0].length, 17);
    assert.equal(rows[0].filter((cell) => cell === "Move 3").length, 1);
  } finally {
    Date.now = realNow;
  }
});

test("header cells someone already typed are left alone", () => {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const header = ["Submitted at", "Submitted by", "Restaurant", "HP", "Category", "Color", "City", "Area", "Vibes", "Food", "Drink", "Scene", "Google Maps link", "Photo", "Order this", "", "Notes"];
    const rows = [header.slice()];
    const existing = {
      name: "Friend Submissions",
      rows,
      appendRow(row) { this.rows.push(row.slice()); },
      getLastRow() { return this.rows.length; },
      ...sheetCells(rows),
    };
    const { context } = boot({ existing });
    assert.equal(reply(context.doPost(event(entry()))).ok, true);
    assert.equal(JSON.stringify(rows[0].slice(14)), JSON.stringify(["Order this", "Move 2", "Notes"]));
    assert.equal(rows[1][15], "Dirty Martini");
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
      entry({ photoData: "" }),
      entry({ photoType: "image/gif" }),
      entry({ photoData: b64OfBytes(5 * 1024 * 1024 + 1) }),
      entry({ move1: "" }),
      entry({ move3: "m".repeat(25) }),
    ];
    for (const body of cases) {
      const { context, calls, sheets, files, folders } = boot();
      const result = reply(context.doPost(event(body)));
      assert.equal(result.ok, false, JSON.stringify({ ...body, photoData: body.photoData ? `${body.photoData.length} chars` : "" }));
      assert.equal(typeof result.error, "string");
      assert.equal(sheets.size, 0);
      assert.equal(files.length, 0);
      assert.equal(folders.length, 0);
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

    const drive = boot({ fileThrows: true });
    assert.equal(reply(drive.context.doPost(event(entry()))).ok, false);
    assert.equal(drive.files.length, 0);
    assert.deepEqual(drive.calls.locks, [["wait", 10000], ["release"]]);
    assert.equal(drive.sheets.get("Friend Submissions").rows.length, 1);

    const capped = boot();
    assert.equal(reply(capped.context.doPost({ postData: { contents: "x".repeat(8 * 1024 * 1024 + 1) } })).ok, false);
    assert.equal(capped.files.length, 0);
    assert.equal(capped.sheets.size, 0);
    assert.deepEqual(capped.calls.locks, []);
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
