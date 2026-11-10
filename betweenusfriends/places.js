/* Place Autocomplete (New) helpers for the No Ball form.
 * No API key lives here. The page passes MAPS_API_KEY into the loader.
 */
var NoBallPlaces = (function () {
  // Establishments only. Up to five primary types are allowed.
  var TYPES = ['restaurant', 'bar', 'cafe', 'food'];
  // location is available and intentionally not requested.
  var FIELDS = ['displayName', 'googleMapsURI', 'addressComponents', 'addressDescriptor'];
  var NYC = {
    'new york': true,
    'new york city': true,
    manhattan: true,
    brooklyn: true,
    queens: true,
    bronx: true,
    'the bronx': true,
    'staten island': true
  };

  function asText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value.text === 'string') return value.text;
    if (typeof value.toString === 'function') {
      var rendered = value.toString();
      if (rendered && rendered !== '[object Object]') return rendered;
    }
    return '';
  }

  // Zaid's neighborhoods, spelled the way they should land in the sheet.
  var CANON = [
    'East Village', 'Lower East Side', 'West Village', 'Greenwich Village',
    'Chinatown', 'Little Italy', 'Nolita', 'Soho', 'Noho', 'Bowery', 'Tribeca',
    'Meatpacking', 'Flatiron', 'Gramercy', 'Union Square', 'Koreatown',
    'Midtown', 'Columbus Circle', 'Upper East Side', 'Williamsburg',
    'Greenpoint', 'Cobble Hill', 'Clinton Hill', 'Park Slope',
    'Jackson Heights', 'Bronx'
  ];

  // Other names Google uses for the same places, keyed by squashed lowercase.
  var ALIASES = {
    les: 'Lower East Side',
    ues: 'Upper East Side',
    china_town: 'Chinatown',
    korea_town: 'Koreatown',
    meatpacking_district: 'Meatpacking',
    flatiron_district: 'Flatiron',
    gramercy_park: 'Gramercy',
    midtown_manhattan: 'Midtown',
    midtown_east: 'Midtown',
    midtown_west: 'Midtown',
    midtown_south: 'Midtown',
    midtown_north: 'Midtown',
    the_bronx: 'Bronx',
    the_bowery: 'Bowery'
  };

  // Names that cover a whole borough or more. Never an Area on their own.
  var BOROUGHISH = {
    manhattan: true,
    lower_manhattan: true,
    upper_manhattan: true,
    brooklyn: true,
    queens: true,
    bronx: true,
    the_bronx: true,
    staten_island: true,
    new_york: true,
    new_york_city: true,
    nyc: true
  };

  // Google hangs this one on most of Midtown, Flatiron, and Gramercy. A more
  // specific neighborhood wins over it.
  var UMBRELLA = { midtown_manhattan: true };

  function squash(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  var CANON_BY_KEY = {};
  (function () {
    var i;
    for (i = 0; i < CANON.length; i++) CANON_BY_KEY[squash(CANON[i])] = CANON[i];
    for (var key in ALIASES) {
      if (Object.prototype.hasOwnProperty.call(ALIASES, key)) CANON_BY_KEY[key] = ALIASES[key];
    }
  })();

  function canonical(name) {
    var key = squash(name);
    return Object.prototype.hasOwnProperty.call(CANON_BY_KEY, key) ? CANON_BY_KEY[key] : '';
  }

  function componentsOf(components, type) {
    var found = [];
    var list = components || [];
    for (var i = 0; i < list.length; i++) {
      var types = list[i].types || [];
      for (var j = 0; j < types.length; j++) {
        if (types[j] === type) {
          var text = list[i].longText || list[i].long_name || '';
          if (text) found.push(text);
          break;
        }
      }
    }
    return found;
  }

  function component(components, type) {
    return componentsOf(components, type)[0] || '';
  }

  function cityName(raw) {
    var trimmed = String(raw || '').replace(/^\s+|\s+$/g, '');
    if (!trimmed) return '';
    if (NYC[trimmed.toLowerCase()]) return 'NYC';
    return trimmed;
  }

  function descriptorName(area) {
    if (!area) return '';
    var direct = asText(area.displayName).replace(/^\s+|\s+$/g, '');
    if (direct) return direct;
    var named = area.place && area.place.displayName;
    return asText(named).replace(/^\s+|\s+$/g, '');
  }

  // The JS API returns the name on area.place. A missing descriptor is normal
  // outside the regions Google covers, so every step can come back empty.
  function descriptorAreas(descriptor, wanted) {
    var names = [];
    var areas = descriptor && descriptor.areas;
    if (!areas || !areas.length) return names;
    for (var i = 0; i < areas.length; i++) {
      var area = areas[i];
      if (!area || wanted.indexOf(area.containment) === -1) continue;
      var name = descriptorName(area);
      if (name) names.push(name);
    }
    return names;
  }

  // Every area name Google offered, best first.
  function candidateAreas(components, descriptor) {
    return descriptorAreas(descriptor, ['WITHIN'])
      .concat(componentsOf(components, 'neighborhood'))
      .concat(descriptorAreas(descriptor, ['OUTSKIRTS', 'NEAR']))
      .concat(componentsOf(components, 'sublocality_level_1'))
      .concat(componentsOf(components, 'sublocality'));
  }

  function inBronx(components) {
    var names = componentsOf(components, 'sublocality_level_1')
      .concat(componentsOf(components, 'sublocality'))
      .concat(componentsOf(components, 'locality'))
      .concat(componentsOf(components, 'administrative_area_level_2'));
    for (var i = 0; i < names.length; i++) {
      var key = squash(names[i]);
      if (key === 'bronx' || key === 'the_bronx' || key === 'bronx_county') return true;
    }
    return false;
  }

  // Outside NYC the best Google name is the Area. In NYC the first name that
  // lands on Zaid's list wins, then Google's own neighborhood, never a borough.
  function areaFor(components, descriptor, city) {
    var candidates = candidateAreas(components, descriptor);
    if (city !== 'NYC') return candidates[0] || '';
    if (inBronx(components)) return 'Bronx';
    var umbrella = '';
    var i;
    for (i = 0; i < candidates.length; i++) {
      var snapped = canonical(candidates[i]);
      if (!snapped) continue;
      if (UMBRELLA[squash(candidates[i])]) {
        umbrella = umbrella || snapped;
        continue;
      }
      return snapped;
    }
    if (umbrella) return umbrella;
    for (i = 0; i < candidates.length; i++) {
      if (!BOROUGHISH[squash(candidates[i])]) return candidates[i];
    }
    return '';
  }

  function fromPlace(place) {
    var components = (place && (place.addressComponents || place.address_components)) || [];
    var city = cityName(
      component(components, 'locality') ||
      component(components, 'postal_town') ||
      component(components, 'administrative_area_level_1')
    );
    return {
      name: asText(place && place.displayName).replace(/^\s+|\s+$/g, ''),
      maps: (place && (place.googleMapsURI || place.googleMapsUri)) || '',
      city: city,
      area: areaFor(components, place && place.addressDescriptor, city)
    };
  }

  function suggestionLabel(prediction) {
    return {
      main: asText(prediction && prediction.mainText) || asText(prediction && prediction.text),
      secondary: asText(prediction && prediction.secondaryText)
    };
  }

  function requestFor(input, token) {
    return {
      input: input,
      sessionToken: token,
      includedPrimaryTypes: TYPES.slice()
    };
  }

  function search(lib, input, token) {
    return lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(requestFor(input, token)).then(function (result) {
      return (result && result.suggestions) || [];
    });
  }

  function readPlace(prediction) {
    var place = prediction.toPlace();
    function load(fields) {
      return place.fetchFields({ fields: fields }).then(function () {
        return fromPlace(place);
      });
    }
    return load(FIELDS.slice()).then(undefined, function () {
      return load(FIELDS.filter(function (field) { return field !== 'addressDescriptor'; }));
    });
  }

  // Empty key or a failed library load both mean "leave the text field alone".
  function loadLibrary(key, importLibrary) {
    if (!key) return Promise.resolve(null);
    return Promise.resolve().then(function () {
      return importLibrary('places');
    }).then(function (lib) {
      if (!lib || !lib.AutocompleteSuggestion || !lib.AutocompleteSessionToken) return null;
      return lib;
    }, function () {
      return null;
    });
  }

  return {
    TYPES: TYPES,
    FIELDS: FIELDS,
    fromPlace: fromPlace,
    suggestionLabel: suggestionLabel,
    requestFor: requestFor,
    search: search,
    readPlace: readPlace,
    loadLibrary: loadLibrary
  };
})();

if (typeof module === 'object' && module.exports) module.exports = NoBallPlaces;
