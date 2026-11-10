/**
 * Friendnotphoe "No Ball" submissions.
 *
 * Paste this whole file into the sheet: Extensions > Apps Script, replace Code.gs, save.
 * Deploy as a Web app: Execute as Me, Who has access: Anyone.
 *
 * Rows are appended only to the "Friend Submissions" tab (created with headers if missing).
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
  // Edit sheet colors here. Vibes first stays blank until Zaid picks one.
  var CATEGORY_COLORS = {
    'Food first': 'Green',
    'Drinks first': 'Blue',
    'Legendary': 'Gold',
    'Vibes first': ''
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
    scoreMin: 1,
    scoreMax: 300,
    rankMin: 0,
    rankMax: 100,
    minFillMs: 3000
  };

  var RANK_FIELDS = [
    ['food', 'Food'],
    ['drink', 'Drinks'],
    ['scene', 'Scene']
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

    if (!submittedBy) errors.submittedBy = 'Your name is required.';
    else if (submittedBy.length > LIMITS.friend) errors.submittedBy = 'Your name must be 60 characters or fewer.';

    if (!restaurant) errors.restaurant = 'Place name is required.';
    else if (restaurant.length > LIMITS.name) errors.restaurant = 'Place name must be 80 characters or fewer.';

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
        maps: maps,
        city: city,
        area: area,
        hp: hp,
        category: category,
        color: CATEGORY_COLORS[category],
        vibes: vibes,
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
  'Google Maps link'
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
  12: true
};

function doGet() {
  return json_({ ok: true, ready: true });
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 8000) {
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
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  var submitted = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
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
    value.maps
  ];
  sheet.appendRow(row.map(plainCell_));
}

function plainCell_(value, index) {
  if (!TEXT_COLUMNS[index]) return value;
  var text = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function firstError_(errors) {
  var order = ['submittedBy', 'restaurant', 'maps', 'city', 'area', 'hp', 'category', 'vibes', 'food', 'drink', 'scene'];
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
