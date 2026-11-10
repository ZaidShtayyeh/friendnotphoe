/**
 * Friendnotphoe "No Ball" submissions.
 *
 * Paste this whole file into the sheet: Extensions > Apps Script, replace Code.gs, save.
 * Deploy as a Web app: Execute as Me, Who has access: Anyone.
 *
 * Rows are appended only to the "Friend Submissions" tab (created with headers if missing).
 * The photo is saved in a private Drive folder named "FNF Friend Photos". Files are not shared.
 * This script does not read or write "Master Reference" or "Sheet1".
 *
 * SHARED_TOKEN is optional and not a secret. The page contains the same value.
 * Leave both empty to disable the check. Change colors only in CATEGORY_COLORS below.
 */
var SHARED_TOKEN = '';

// --- shared validation: keep identical to input-form/validate.js ---

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
    scoreMin: 1,
    scoreMax: 300,
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
    var url;
    try {
      url = new URL(raw);
    } catch (e) {
      return false;
    }
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    var host = url.hostname.toLowerCase();
    var path = url.pathname;
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

    var hp = wholeNumber(input.hp, LIMITS.scoreMin, LIMITS.scoreMax);
    if (hp === null) errors.hp = 'Score must be a whole number from 1 to 300.';

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
      if (!move) errors[key] = pair[1] + ' is required.';
      else if (move.length > LIMITS.move) errors[key] = pair[1] + ' must be 24 characters or fewer.';
      else moves[key] = move;
    });

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
        hp: hp,
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
  return json_({ ok: true, ready: true });
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

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      append_(result.value);
    } finally {
      lock.releaseLock();
    }
    return ok_();
  } catch (err) {
    return fail_("Couldn't save that. Try again.");
  }
}

function append_(value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  ensureHeaders_(sheet);
  var when = new Date();
  var file = savePhoto_(value, when);
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
    file.getUrl(),
    value.move1,
    value.move2,
    value.move3
  ];
  sheet.appendRow(row.map(plainCell_));
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
