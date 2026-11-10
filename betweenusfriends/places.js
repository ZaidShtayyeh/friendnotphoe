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

  function component(components, type) {
    var list = components || [];
    for (var i = 0; i < list.length; i++) {
      var types = list[i].types || [];
      for (var j = 0; j < types.length; j++) {
        if (types[j] === type) return list[i].longText || list[i].long_name || '';
      }
    }
    return '';
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
  function descriptorArea(descriptor, wanted) {
    var areas = descriptor && descriptor.areas;
    if (!areas || !areas.length) return '';
    for (var i = 0; i < areas.length; i++) {
      var area = areas[i];
      if (!area || wanted.indexOf(area.containment) === -1) continue;
      var name = descriptorName(area);
      if (name) return name;
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
    var descriptor = place && place.addressDescriptor;
    var area = descriptorArea(descriptor, ['WITHIN'])
      || component(components, 'neighborhood')
      || descriptorArea(descriptor, ['OUTSKIRTS', 'NEAR'])
      || component(components, 'sublocality_level_1')
      || component(components, 'sublocality');
    return {
      name: asText(place && place.displayName).replace(/^\s+|\s+$/g, ''),
      maps: (place && (place.googleMapsURI || place.googleMapsUri)) || '',
      city: city,
      area: area
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
