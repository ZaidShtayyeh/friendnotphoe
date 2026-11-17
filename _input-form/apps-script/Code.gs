/**
 * Friendnotphoe "No Ball" submissions, with saved-submission notifications.
 *
 * Paste this whole file into the sheet: Extensions > Apps Script, replace Code.gs, save.
 * KEEP the live project's extra helpers authorizeDrive() and debugSave(). They are not in
 * this file; paste this file around them (or re-add them below) instead of deleting them.
 * Never run debugSave.
 * Deploy as a Web app: Execute as Me, Who has access: Anyone. Update the existing
 * deployment with a new version so the /exec URL does not change.
 *
 * Rows are appended only to the "Friend Submissions" tab (created with headers if missing).
 * Columns A-Q are unchanged. Notification state lives in its own "Notification Outbox" tab.
 * The photo is saved in a private Drive folder named "FNF Friend Photos". Files are not shared.
 * This script does not read or write "Master Reference", "Sheet1" or "UAE".
 *
 * Notifications (all Script Properties, server-side only, never in the page):
 *   FNF_SUBMISSION_WEBHOOK_URL            receiver URL
 *   FNF_SUBMISSION_WEBHOOK_BEARER         receiver key
 *   FNF_SUBMISSION_NOTIFICATIONS_ENABLED  "true" to send. Anything else = off (default).
 * Cards saved while off are recorded as "disabled" and are never sent later (no backfill).
 * Run installNotificationTrigger() once from the editor to add the 10-minute retry job.
 *
 * SHARED_TOKEN is optional and not a secret. The page contains the same value.
 * Leave both empty to disable the check. Change colors only in CATEGORY_COLORS below.
 */
var SHARED_TOKEN = '';
// Web apps have no active spreadsheet context, even when bound to a Sheet.
var SPREADSHEET_ID = '1YwCUA6pW8ImKgc9s4oudzqWQD3vExXWeC3bfHgv2vxQ';
var BACKEND_VERSION = '2026-11-16-notify-hp-boost';

// --- shared validation: keep identical to betweenusfriends/validate.js ---

/* Shared checks for the No Ball form and the Apps Script.
 * No secrets live here. The optional page token is not a secret either.
 */
var NoBallValidate = (function () {
  // Edit sheet colors here. Vibes first and Drinks first are both Blue.
  var CATEGORY_COLORS = {
    'Food first': 'Green',
    'Drinks first': 'Blue',
    'Legendary': 'Gold',
    'Vibes first': 'Blue'
  };

  var CATEGORIES = ['Vibes first', 'Drinks first', 'Food first', 'Legendary'];

  var LIMITS = {
    friend: 60,
    name: 80,
    city: 80,
    area: 80,
    maps: 500,
    vibesWords: 50,
    vibesChars: 250,
    move: 24,
    scoreMin: 0,
    scoreMax: 300,
    hpBoostPoints: 20,
    hpBoostMax: 3,
    rankMin: 0,
    rankMax: 100,
    minFillMs: 3000,
    photoBytes: 5 * 1024 * 1024,
    photoName: 180
  };

  var PHOTO_TYPES = {
    'image/jpeg': true,
    'image/png': true,
    'image/webp': true,
    'image/heic': true
  };

  var RANK_FIELDS = [
    ['food', 'Food'],
    ['drink', 'Drinks'],
    ['scene', 'Scene']
  ];

  var MOVE_FIELDS = [
    ['move1', 'Move 1'],
    ['move2', 'Move 2'],
    ['move3', 'Move 3']
  ];

  function wordCount(text) {
    var trimmed = String(text == null ? '' : text).trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function isMapsUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return true;
    if (raw.length > LIMITS.maps) return false;
    // Apps Script has no browser URL constructor. Parse only the narrow set of
    // Google Maps links we accept, identically in the browser and on the server.
    if (/[\s\\\u0000-\u001f\u007f]/.test(raw) || /%(?![0-9a-f]{2})/i.test(raw)) return false;
    var parts = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i.exec(raw);
    if (!parts) return false;
    var host = parts[1].toLowerCase();
    var path = parts[2] || '/';
    // Reject dot segments, including encoded dots, before checking the path.
    var segments = path.replace(/%2e/ig, '.').split('/');
    for (var i = 0; i < segments.length; i++) {
      if (segments[i] === '.' || segments[i] === '..') return false;
    }
    if (host === 'maps.google.com') return true;
    if (host === 'maps.app.goo.gl') return path.length > 1;
    if (host === 'goo.gl') return path === '/maps' || path.indexOf('/maps/') === 0;
    if (host === 'google.com' || host === 'www.google.com') {
      return path === '/maps' || path.indexOf('/maps/') === 0;
    }
    return false;
  }

  function trimmed(input, key) {
    var value = input && input[key];
    return value == null ? '' : String(value).trim();
  }

  // Decoded byte length of a base64 payload. -1 when the string is not base64.
  function photoBytes(data) {
    var raw = String(data || '');
    if (!raw || raw.length % 4 !== 0) return -1;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return -1;
    var pad = 0;
    if (raw.charAt(raw.length - 1) === '=') pad += 1;
    if (raw.charAt(raw.length - 2) === '=') pad += 1;
    return (raw.length / 4) * 3 - pad;
  }

  function readPhoto(input) {
    var type = trimmed(input, 'photoType').toLowerCase();
    if (type === 'image/jpg') type = 'image/jpeg';
    if (type === 'image/heif') type = 'image/heic';
    var name = trimmed(input, 'photoName');
    var raw = input && input.photoData != null ? String(input.photoData) : '';
    raw = raw.replace(/\s+/g, '');
    var marker = raw.indexOf('base64,');
    if (raw.indexOf('data:') === 0 && marker !== -1) raw = raw.slice(marker + 7);
    if (!raw) return { error: 'A photo is required.' };
    if (!PHOTO_TYPES[type]) return { error: 'Photo must be a jpeg, png, webp, or heic image.' };
    var bytes = photoBytes(raw);
    if (bytes < 0) return { error: 'Photo could not be read.' };
    if (bytes > LIMITS.photoBytes) return { error: 'Photo must be 5 MB or smaller.' };
    if (name.length > LIMITS.photoName) name = name.slice(0, LIMITS.photoName);
    return { data: raw, name: name, type: type };
  }

  function wholeNumber(value, min, max) {
    var text = String(value == null ? '' : value).trim();
    if (!/^(?:0|-?[1-9]\d*)$/.test(text)) return null;
    var number = Number(text);
    if (!Number.isInteger(number) || number < min || number > max) return null;
    return number;
  }

  // Partial totals are useful while dragging; submission still requires all three stats.
  function hpFromStats(input, boosts) {
    var count = wholeNumber(boosts == null ? 0 : boosts, 0, LIMITS.hpBoostMax);
    if (count === null) return null;
    var total = 0, rated = 0;
    for (var i = 0; i < RANK_FIELDS.length; i++) {
      var raw = trimmed(input, RANK_FIELDS[i][0]);
      if (raw === '') continue;
      var value = wholeNumber(raw, LIMITS.rankMin, LIMITS.rankMax);
      if (value === null) return null;
      total += value;
      rated += 1;
    }
    return rated ? Math.min(LIMITS.scoreMax, total + count * LIMITS.hpBoostPoints) : null;
  }

  function validateSubmission(input) {
    input = input || {};
    var errors = {};
    var submittedBy = trimmed(input, 'submittedBy');
    var restaurant = trimmed(input, 'restaurant');
    var maps = trimmed(input, 'maps');
    var city = trimmed(input, 'city');
    var area = trimmed(input, 'area');
    var vibes = trimmed(input, 'vibes');
    var category = trimmed(input, 'category');
    var photo = readPhoto(input);
    var hpBoosts = wholeNumber(input.hpBoosts == null ? 0 : input.hpBoosts, 0, LIMITS.hpBoostMax);
    if (hpBoosts === null) errors.hp = 'Use up to three HP boosts.';

    if (!submittedBy) errors.submittedBy = 'Your name is required.';
    else if (submittedBy.length > LIMITS.friend) errors.submittedBy = 'Your name must be 60 characters or fewer.';

    if (!restaurant) errors.restaurant = 'Place name is required.';
    else if (restaurant.length > LIMITS.name) errors.restaurant = 'Place name must be 80 characters or fewer.';

    if (photo.error) errors.photo = photo.error;

    if (maps && !isMapsUrl(maps)) {
      errors.maps = 'Maps link must be an https Google Maps URL, or left blank.';
    }

    if (!city) errors.city = 'City is required.';
    else if (city.length > LIMITS.city) errors.city = 'City must be 80 characters or fewer.';

    if (!area) errors.area = 'Area is required.';
    else if (area.length > LIMITS.area) errors.area = 'Area must be 80 characters or fewer.';

    if (CATEGORIES.indexOf(category) === -1) errors.category = 'Pick a category.';

    if (!vibes) errors.vibes = 'Vibes are required.';
    else {
      var words = wordCount(vibes);
      var chars = vibes.length;
      if (words > LIMITS.vibesWords && chars > LIMITS.vibesChars) {
        errors.vibes = 'Vibes must be 50 words or fewer and 250 characters or fewer.';
      } else if (words > LIMITS.vibesWords) {
        errors.vibes = 'Vibes must be 50 words or fewer.';
      } else if (chars > LIMITS.vibesChars) {
        errors.vibes = 'Vibes must be 250 characters or fewer.';
      }
    }

    var moves = {};
    MOVE_FIELDS.forEach(function (pair) {
      var key = pair[0];
      var move = trimmed(input, key);
      if (move.length > LIMITS.move) errors[key] = pair[1] + ' must be 24 characters or fewer.';
      else moves[key] = move;
    });

    if (!MOVE_FIELDS.some(function (pair) { return moves[pair[0]]; })) {
      errors.move1 = errors.move1 || 'Add at least one special move.';
    }

    var ranks = {};
    RANK_FIELDS.forEach(function (pair) {
      var key = pair[0];
      var label = pair[1];
      var rank = wholeNumber(input[key], LIMITS.rankMin, LIMITS.rankMax);
      if (rank === null) errors[key] = label + ' must be a whole number from 0 to 100.';
      else ranks[key] = rank;
    });

    var keys = Object.keys(errors);
    if (keys.length) return { ok: false, errors: errors };

    return {
      ok: true,
      errors: {},
      value: {
        submittedBy: submittedBy,
        restaurant: restaurant,
        photoData: photo.data,
        photoName: photo.name,
        photoType: photo.type,
        maps: maps,
        city: city,
        area: area,
        hp: hpFromStats(ranks, hpBoosts),
        hpBoosts: hpBoosts,
        category: category,
        color: CATEGORY_COLORS[category],
        vibes: vibes,
        move1: moves.move1,
        move2: moves.move2,
        move3: moves.move3,
        food: ranks.food,
        drink: ranks.drink,
        scene: ranks.scene
      }
    };
  }

  function checkSpam(input, now) {
    var company = input && input.company != null ? String(input.company) : '';
    if (company.trim() !== '') {
      return { ok: false, error: "That didn't go through. Please try again." };
    }
    var started = Number(input && input.startedAt);
    if (!Number.isFinite(started)) {
      return { ok: false, error: "That didn't go through. Please try again." };
    }
    if (now - started < LIMITS.minFillMs) {
      return { ok: false, error: 'Give it a few seconds, then send again.' };
    }
    return { ok: true };
  }

  function interpretReply(info) {
    if (!info || info.type === 'opaque' || info.status === 0) return { kind: 'opaque' };
    var data = null;
    if (typeof info.body === 'string' && info.body) {
      try {
        data = JSON.parse(info.body);
      } catch (e) {
        data = null;
      }
    }
    if (data && data.ok === true && info.status >= 200 && info.status < 300) return { kind: 'success' };
    if (data && data.ok === false) {
      var message = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : 'The sheet rejected that.';
      return { kind: 'error', error: message.slice(0, 300) };
    }
    if (info.status >= 200 && info.status < 300) return { kind: 'opaque' };
    return { kind: 'error', error: "The sheet didn't accept that. Try again." };
  }

  return {
    CATEGORY_COLORS: CATEGORY_COLORS,
    CATEGORIES: CATEGORIES,
    LIMITS: LIMITS,
    wordCount: wordCount,
    isMapsUrl: isMapsUrl,
    hpFromStats: hpFromStats,
    validateSubmission: validateSubmission,
    checkSpam: checkSpam,
    interpretReply: interpretReply
  };
})();

if (typeof module === 'object' && module.exports) module.exports = NoBallValidate;

// --- end shared validation ---

var SHEET_NAME = 'Friend Submissions';
var TIMEZONE = 'America/New_York';
var PHOTO_FOLDER_NAME = 'FNF Friend Photos';
var PHOTO_FOLDER_KEY = 'FNF_FRIEND_PHOTOS_FOLDER_ID';
// A 5 MB image is about 6.7 MB of base64, plus the rest of the JSON.
var MAX_BODY_CHARS = 8 * 1024 * 1024;
var PHOTO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic'
};
var HEADERS = [
  'Submitted at',
  'Submitted by',
  'Restaurant',
  'HP',
  'Category',
  'Color',
  'City',
  'Area',
  'Vibes',
  'Food',
  'Drink',
  'Scene',
  'Google Maps link',
  'Photo',
  'Move 1',
  'Move 2',
  'Move 3'
];
var TEXT_COLUMNS = {
  0: true,
  1: true,
  2: true,
  4: true,
  5: true,
  6: true,
  7: true,
  8: true,
  12: true,
  13: true,
  14: true,
  15: true,
  16: true
};

function doGet() {
  try {
    // Read-only: verify access to the tracker without creating a tab or photo.
    SpreadsheetApp.openById(SPREADSHEET_ID).getName();
    return json_({ ok: true, ready: true, version: BACKEND_VERSION });
  } catch (err) {
    return json_({ ok: false, ready: false, version: BACKEND_VERSION, error: 'The submission sheet is unavailable.' });
  }
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_BODY_CHARS) {
      return fail_('Could not read that submission.');
    }
    var input;
    try {
      input = JSON.parse(raw);
    } catch (err) {
      return fail_('Could not read that submission.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return fail_('Could not read that submission.');
    }
    if (SHARED_TOKEN && input.token !== SHARED_TOKEN) {
      return fail_("That didn't go through. Please try again.");
    }
    var spam = NoBallValidate.checkSpam(input, Date.now());
    if (!spam.ok) return fail_(spam.error);
    var result = NoBallValidate.validateSubmission(input);
    if (!result.ok) return fail_(firstError_(result.errors));
    var id = readSubmissionId_(input);
    if (id === null) return fail_("That didn't go through. Please try again.");

    var saved;
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      saved = save_(result.value, id);
    } finally {
      lock.releaseLock();
    }
    // The card is saved. Nothing below may change the ok:true reply.
    if (saved && saved.notify) {
      try {
        deliverOutboxRow_(saved.outboxRow);
      } catch (err) {
        // Left pending; processNotificationOutbox retries it.
      }
    }
    return ok_();
  } catch (err) {
    return fail_("Couldn't save that. Try again.");
  }
}

// --- submission ids and the outbox ---

var OUTBOX_SHEET_NAME = 'Notification Outbox';
var OUTBOX_HEADERS = [
  'Submission ID',
  'Status',
  'Saved row',
  'Saved at (UTC)',
  'Submitted by',
  'Restaurant',
  'City',
  'Photo',
  'Attempts',
  'Next attempt (UTC)',
  'Last attempt (UTC)',
  'Last result',
  'Tab ID'
];
var OB = {
  id: 1, status: 2, row: 3, savedAt: 4, by: 5, restaurant: 6, city: 7, photo: 8,
  attempts: 9, next: 10, last: 11, result: 12, gid: 13
};
// saving: reserved, card not confirmed saved yet. pending: saved, waiting to send.
// sending: an attempt is in flight. accepted: receiver returned 2xx.
// failed: permanent 4xx or out of attempts. disabled: saved while notifications were off.
// abandoned: a reservation whose card was never saved.
var SAVED_STATUSES = { pending: true, sending: true, accepted: true, failed: true, disabled: true };
var NOTIFY_ENABLED_KEY = 'FNF_SUBMISSION_NOTIFICATIONS_ENABLED';
var NOTIFY_URL_KEY = 'FNF_SUBMISSION_WEBHOOK_URL';
var NOTIFY_BEARER_KEY = 'FNF_SUBMISSION_WEBHOOK_BEARER';
var NOTIFY_MAX_ATTEMPTS = 8;
var NOTIFY_BASE_DELAY_MS = 10 * 60 * 1000;
var NOTIFY_MAX_DELAY_MS = 12 * 60 * 60 * 1000;
var STALE_SENDING_MS = 15 * 60 * 1000;
var STALE_SAVING_MS = 30 * 60 * 1000;
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Returns the lower-case id, a fresh one for older pages that send none, or null if malformed.
function readSubmissionId_(input) {
  var raw = input.submissionId;
  if (raw == null || raw === '') return String(Utilities.getUuid()).toLowerCase();
  var id = String(raw).trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function notificationsEnabled_() {
  var value = PropertiesService.getScriptProperties().getProperty(NOTIFY_ENABLED_KEY);
  return String(value == null ? '' : value).trim().toLowerCase() === 'true';
}

function outboxSheet_(ss) {
  var sheet = ss.getSheetByName(OUTBOX_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(OUTBOX_SHEET_NAME);
    sheet.appendRow(OUTBOX_HEADERS);
  }
  return sheet;
}

function outboxFind_(outbox, id) {
  var last = outbox.getLastRow();
  if (last < 2) return 0;
  var ids = outbox.getRange(2, OB.id, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

function outboxRead_(outbox, row) {
  return outbox.getRange(row, 1, 1, OUTBOX_HEADERS.length).getValues()[0];
}

function outboxSet_(outbox, row, changes) {
  var current = outboxRead_(outbox, row);
  Object.keys(changes).forEach(function (key) {
    current[OB[key] - 1] = changes[key];
  });
  outbox.getRange(row, 1, 1, OUTBOX_HEADERS.length).setValues([current.map(outboxCell_)]);
}

function outboxCell_(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

// The saved Friend Submissions row whose Photo cell (column N) holds this URL, or 0.
function rowWithPhoto_(sheet, url) {
  if (!url) return 0;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var cells = sheet.getRange(2, 14, last - 1, 1).getValues();
  for (var i = cells.length - 1; i >= 0; i--) {
    if (String(cells[i][0]) === url) return i + 2;
  }
  return 0;
}

// Runs inside the script lock. Returns { notify, outboxRow } once the card is saved.
function save_(value, id) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  ensureHeaders_(sheet);

  var outbox = null;
  var obRow = 0;
  var photoUrl = '';
  try {
    outbox = outboxSheet_(ss);
    obRow = outboxFind_(outbox, id);
    if (obRow) {
      var prior = outboxRead_(outbox, obRow);
      var status = String(prior[OB.status - 1]);
      // Same card sent again after a lost reply: it is already saved. No new row or photo.
      if (SAVED_STATUSES[status]) return { notify: false, outboxRow: obRow };
      photoUrl = String(prior[OB.photo - 1] || '');
      var found = rowWithPhoto_(sheet, photoUrl);
      if (found) return markSaved_(outbox, obRow, sheet, found, value, isoDate_(prior[OB.savedAt - 1]));
    } else {
      outbox.appendRow([id, 'saving', '', new Date().toISOString()].map(outboxCell_));
      obRow = outbox.getLastRow();
    }
  } catch (err) {
    // Saving the card matters more than the outbox. Continue without dedupe or alert.
    outbox = null;
    obRow = 0;
  }

  var when = new Date();
  if (!photoUrl) {
    photoUrl = savePhoto_(value, when).getUrl();
    if (outbox) {
      try { outboxSet_(outbox, obRow, { photo: photoUrl }); } catch (err) { /* recovered by photo search */ }
    }
  }
  appendRow_(sheet, value, when, photoUrl);
  var savedRow = sheet.getLastRow();
  if (!outbox) return { notify: false, outboxRow: 0 };
  try {
    return markSaved_(outbox, obRow, sheet, savedRow, value, when);
  } catch (err) {
    // Left as "saving" with its photo URL; a retry or the trigger reconciles it.
    return { notify: false, outboxRow: 0 };
  }
}

function markSaved_(outbox, obRow, sheet, savedRow, value, when) {
  var enabled = notificationsEnabled_();
  outboxSet_(outbox, obRow, {
    status: enabled ? 'pending' : 'disabled',
    row: savedRow,
    savedAt: when.toISOString(),
    by: value.submittedBy,
    restaurant: value.restaurant,
    city: value.city,
    attempts: 0,
    next: enabled ? when.toISOString() : '',
    result: enabled ? '' : 'Notifications were off when this card was saved',
    gid: sheet.getSheetId()
  });
  return { notify: enabled, outboxRow: obRow };
}

function appendRow_(sheet, value, when, photoUrl) {
  var submitted = Utilities.formatDate(when, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  var row = [
    submitted,
    value.submittedBy,
    value.restaurant,
    value.hp,
    value.category,
    value.color,
    value.city,
    value.area,
    value.vibes,
    value.food,
    value.drink,
    value.scene,
    value.maps,
    photoUrl,
    value.move1,
    value.move2,
    value.move3
  ];
  sheet.appendRow(row.map(plainCell_));
}

// Sheets may turn an ISO string into a Date. Read either back as a Date (now if blank).
function isoDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  var ms = Date.parse(String(value == null ? '' : value));
  return isNaN(ms) ? new Date() : new Date(ms);
}

function timeMs_(value) {
  if (value === '' || value == null) return 0;
  return isoDate_(value).getTime();
}

function plainText_(value) {
  var text = String(value == null ? '' : value);
  return text.charAt(0) === "'" && /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function submissionEvent_(r) {
  var row = Number(r[OB.row - 1]);
  return {
    type: 'submission.created',
    site: 'friendnotphoe.com',
    event_id: String(r[OB.id - 1]),
    occurred_at: isoDate_(r[OB.savedAt - 1]).toISOString(),
    submitted_by: plainText_(r[OB.by - 1]),
    restaurant: plainText_(r[OB.restaurant - 1]),
    city: plainText_(r[OB.city - 1]),
    sheet_row_url: 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit#gid=' +
      r[OB.gid - 1] + '&range=A' + row + ':Q' + row,
    test: false
  };
}

function backoffMs_(attempts) {
  return Math.min(NOTIFY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempts - 1)), NOTIFY_MAX_DELAY_MS);
}

// Sends one pending outbox row. Claims it under the lock so two runs never send it at once.
function deliverOutboxRow_(obRow) {
  if (!obRow || !notificationsEnabled_()) return 'skipped';
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty(NOTIFY_URL_KEY);
  var bearer = props.getProperty(NOTIFY_BEARER_KEY);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var outbox = ss.getSheetByName(OUTBOX_SHEET_NAME);
  if (!outbox) return 'skipped';

  var lock = LockService.getScriptLock();
  var r;
  var attempts;
  var now = new Date();
  lock.waitLock(10000);
  try {
    r = outboxRead_(outbox, obRow);
    if (String(r[OB.status - 1]) !== 'pending') return 'skipped';
    attempts = Number(r[OB.attempts - 1]) || 0;
    if (!url || !bearer) {
      outboxSet_(outbox, obRow, { result: 'Missing webhook URL or key in Script Properties', next: new Date(now.getTime() + NOTIFY_BASE_DELAY_MS).toISOString() });
      return 'pending';
    }
    attempts += 1;
    outboxSet_(outbox, obRow, { status: 'sending', attempts: attempts, last: now.toISOString() });
  } finally {
    lock.releaseLock();
  }

  var code = 0;
  var note = '';
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + bearer },
      payload: JSON.stringify(submissionEvent_(r)),
      muteHttpExceptions: true,
      followRedirects: false
    });
    code = res.getResponseCode();
    note = 'HTTP ' + code;
  } catch (err) {
    note = 'Network error or timeout';
  }

  var status;
  var changes;
  if (code >= 200 && code < 300) {
    status = 'accepted';
    changes = { status: status, next: '', result: note + ' accepted' };
  } else if (code >= 400 && code < 500 && code !== 408 && code !== 429) {
    status = 'failed';
    changes = { status: status, next: '', result: note + ' permanent failure, not retried' };
  } else if (attempts >= NOTIFY_MAX_ATTEMPTS) {
    status = 'failed';
    changes = { status: status, next: '', result: note + ' gave up after ' + attempts + ' attempts' };
  } else {
    status = 'pending';
    changes = { status: status, next: new Date(Date.now() + backoffMs_(attempts)).toISOString(), result: note + ' will retry' };
  }
  lock.waitLock(10000);
  try {
    outboxSet_(outbox, obRow, changes);
  } finally {
    lock.releaseLock();
  }
  return status;
}

// Time-driven retry job. Also reconciles rows interrupted between saving and recording state.
function processNotificationOutbox() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var outbox = ss.getSheetByName(OUTBOX_SHEET_NAME);
  if (!outbox || outbox.getLastRow() < 2) return { sent: 0 };
  var enabled = notificationsEnabled_();
  var nowMs = Date.now();
  var due = [];
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ss.getSheetByName(SHEET_NAME);
    var rows = outbox.getRange(2, 1, outbox.getLastRow() - 1, OUTBOX_HEADERS.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      var obRow = i + 2;
      var r = rows[i];
      var status = String(r[OB.status - 1]);
      if (status === 'saving') {
        var found = sheet ? rowWithPhoto_(sheet, String(r[OB.photo - 1] || '')) : 0;
        if (found) {
          var v = sheet.getRange(found, 1, 1, 17).getValues()[0];
          markSaved_(outbox, obRow, sheet, found, { submittedBy: plainText_(v[1]), restaurant: plainText_(v[2]), city: plainText_(v[6]) }, isoDate_(r[OB.savedAt - 1]));
          if (enabled) due.push(obRow);
        }
        // Otherwise the card was never saved: leave it so a retry of the same card can finish.
        continue;
      }
      if (status === 'sending') {
        var lastMs = timeMs_(r[OB.last - 1]);
        if (nowMs - lastMs > STALE_SENDING_MS) {
          outboxSet_(outbox, obRow, { status: 'pending', next: new Date(nowMs).toISOString(), result: 'Recovered an interrupted attempt' });
          status = 'pending';
          r[OB.next - 1] = new Date(nowMs).toISOString();
        } else continue;
      }
      if (status === 'pending' && enabled) {
        var nextMs = timeMs_(r[OB.next - 1]);
        if (nextMs <= nowMs) due.push(obRow);
      }
    }
  } finally {
    lock.releaseLock();
  }
  var sent = 0;
  for (var j = 0; j < due.length; j++) {
    try {
      if (deliverOutboxRow_(due[j]) === 'accepted') sent += 1;
    } catch (err) {
      // Stays pending or sending; picked up next run.
    }
  }
  return { sent: sent };
}

// Run once from the editor. Safe to run again: it replaces the old trigger.
function installNotificationTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'processNotificationOutbox') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('processNotificationOutbox').timeBased().everyMinutes(10).create();
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }
  var width = Math.max(sheet.getLastColumn(), HEADERS.length);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0];
  // Every column has a fixed position. Fill in blank header cells only:
  // never insert or move a column, never overwrite a header someone typed.
  for (var i = 0; i < HEADERS.length; i++) {
    var cell = header[i] == null ? '' : String(header[i]).trim();
    if (cell === '') sheet.getRange(1, i + 1).setValue(HEADERS[i]);
  }
}

function photosFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PHOTO_FOLDER_KEY);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      id = '';
    }
  }
  var found = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty(PHOTO_FOLDER_KEY, folder.getId());
  return folder;
}

function safeFilePart_(text) {
  var clean = String(text || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) clean = 'spot';
  if (clean.length > 80) clean = clean.slice(0, 80).trim();
  return clean;
}

function photoFileName_(value, when) {
  var stamp = Utilities.formatDate(when, TIMEZONE, 'yyyy-MM-dd HHmm');
  var ext = PHOTO_EXT[value.photoType] || 'jpg';
  return stamp + ' - ' + safeFilePart_(value.restaurant) + ' - ' + safeFilePart_(value.submittedBy) + '.' + ext;
}

function savePhoto_(value, when) {
  var folder = photosFolder_();
  var bytes = Utilities.base64Decode(value.photoData);
  var blob = Utilities.newBlob(bytes, value.photoType, photoFileName_(value, when));
  // Leave the file private to the script owner. Do not change who can open it.
  return folder.createFile(blob);
}

function plainCell_(value, index) {
  if (!TEXT_COLUMNS[index]) return value;
  var text = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function firstError_(errors) {
  var order = ['submittedBy', 'restaurant', 'photo', 'maps', 'city', 'area', 'hp', 'category', 'vibes', 'move1', 'move2', 'move3', 'food', 'drink', 'scene'];
  for (var i = 0; i < order.length; i++) {
    if (errors[order[i]]) return errors[order[i]];
  }
  return 'Fix the form and try again.';
}

function ok_() {
  return json_({ ok: true });
}

function fail_(message) {
  return json_({ ok: false, error: message });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
