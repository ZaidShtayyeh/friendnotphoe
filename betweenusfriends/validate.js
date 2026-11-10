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
