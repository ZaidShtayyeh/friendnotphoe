/* Place Autocomplete (New) helpers for the No Ball form.
 * No API key lives here. The page passes MAPS_API_KEY into the loader.
 */
var NoBallPlaces = (function () {
  // Establishments only. Up to five primary types are allowed.
  var TYPES = ['restaurant', 'bar', 'cafe', 'food'];
  // location is available and intentionally not requested.
  var FIELDS = ['displayName', 'googleMapsURI', 'addressComponents'];
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

  function fromPlace(place) {
    var components = (place && (place.addressComponents || place.address_components)) || [];
    var city = cityName(
      component(components, 'locality') ||
      component(components, 'postal_town') ||
      component(components, 'administrative_area_level_1')
    );
    var area = component(components, 'neighborhood') || component(components, 'sublocality_level_1');
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
    return place.fetchFields({ fields: FIELDS.slice() }).then(function () {
      return fromPlace(place);
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
