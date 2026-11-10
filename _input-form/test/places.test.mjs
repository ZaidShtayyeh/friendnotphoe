import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const places = require("../../betweenusfriends/places.js");

function place(overrides) {
  return Object.assign({
    displayName: "C + B",
    googleMapsURI: "https://maps.google.com/?cid=111",
    addressComponents: [
      { longText: "East Village", types: ["neighborhood", "political"] },
      { longText: "Manhattan", types: ["sublocality_level_1", "sublocality", "political"] },
      { longText: "New York", types: ["locality", "political"] },
      { longText: "New York", types: ["administrative_area_level_1", "political"] },
    ],
  }, overrides);
}

test("a New York pick fills the card fields and maps the city to NYC", () => {
  const got = places.fromPlace(place());
  assert.deepEqual(got, {
    name: "C + B",
    maps: "https://maps.google.com/?cid=111",
    city: "NYC",
    area: "East Village",
  });
});

test("boroughs and New York City all become NYC", () => {
  for (const name of ["New York", "New York City", "Manhattan", "Brooklyn", "Queens", "The Bronx", "Bronx", "Staten Island"]) {
    assert.equal(places.fromPlace(place({
      addressComponents: [{ longText: name, types: ["locality", "political"] }],
    })).city, "NYC", name);
  }
  assert.equal(places.fromPlace(place({
    addressComponents: [{ longText: "London", types: ["locality", "political"] }],
  })).city, "London");
});

test("city falls back to postal town, then the admin area", () => {
  assert.equal(places.fromPlace(place({
    addressComponents: [
      { longText: "Brooklyn", types: ["postal_town"] },
      { longText: "New York", types: ["administrative_area_level_1", "political"] },
    ],
  })).city, "NYC");
  assert.equal(places.fromPlace(place({
    addressComponents: [{ longText: "California", types: ["administrative_area_level_1", "political"] }],
  })).city, "California");
});

const within = (name) => ({ containment: "WITHIN", place: { displayName: name } });
const outskirts = (name) => ({ containment: "OUTSKIRTS", place: { displayName: name } });
const near = (name) => ({ containment: "NEAR", place: { displayName: name } });
const manhattan = { longText: "Manhattan", types: ["sublocality_level_1", "sublocality", "political"] };
const nycLocality = { longText: "New York", types: ["locality", "political"] };

function nyc(areas, extra) {
  return places.fromPlace({
    displayName: "Spot",
    addressComponents: [manhattan, nycLocality].concat(extra || []),
    addressDescriptor: { areas },
  });
}

test("a neighborhood component beats a borough, and a lone borough is never an Area", () => {
  assert.equal(places.fromPlace(place()).area, "East Village");
  assert.equal(places.fromPlace(place({
    addressComponents: [
      { longText: "Brooklyn", types: ["sublocality_level_1", "sublocality", "political"] },
      { longText: "New York", types: ["locality", "political"] },
    ],
  })).area, "");
  assert.equal(nyc([within("Lower Manhattan"), within("Manhattan")]).area, "");
  assert.equal(nyc([]).area, "");
  assert.equal(places.fromPlace({
    displayName: "Spot",
    addressComponents: [manhattan, nycLocality],
  }).area, "");
});

test("a NYC area snaps to Zaid's list, checking every candidate until one fits", () => {
  assert.equal(nyc([within("Chinatown"), outskirts("Lower East Side"), within("Lower Manhattan")]).area, "Chinatown");
  assert.equal(nyc([within("Ukrainian Village"), within("East Village"), within("Lower Manhattan")]).area, "East Village");
  assert.equal(nyc([outskirts("Lower East Side"), within("Lower Manhattan"), within("Manhattan")]).area, "Lower East Side");
  assert.equal(nyc([within("Chelsea"), near("Nassau Av"), outskirts("Greenwich Village")]).area, "Greenwich Village");
  assert.equal(nyc([within("Chelsea")], [{ longText: "Noho", types: ["neighborhood"] }]).area, "Noho");
  assert.equal(nyc([within("Chelsea")], [{ longText: "Williamsburg", types: ["neighborhood"] }]).area, "Williamsburg");
  assert.equal(places.fromPlace({
    displayName: "Spot",
    addressComponents: [manhattan, nycLocality, { longText: "Chinatown", types: ["neighborhood"] }],
  }).area, "Chinatown");
});

test("NYC aliases land on the canonical spelling", () => {
  const cases = {
    "LES": "Lower East Side",
    "Lower East Side": "Lower East Side",
    "lower east side": "Lower East Side",
    "SoHo": "Soho",
    "NoHo": "Noho",
    "NoLita": "Nolita",
    "Meatpacking District": "Meatpacking",
    "Flatiron District": "Flatiron",
    "Gramercy Park": "Gramercy",
    "Korea Town": "Koreatown",
    "Koreatown": "Koreatown",
    "Midtown Manhattan": "Midtown",
    "Midtown East": "Midtown",
    "Midtown West": "Midtown",
    "Upper East Side": "Upper East Side",
    "UES": "Upper East Side",
    "Little Italy": "Little Italy",
    "TriBeCa": "Tribeca",
    "The Bowery": "Bowery",
    "Bowery": "Bowery",
    "Columbus Circle": "Columbus Circle",
    "Union Square": "Union Square",
    "Park Slope": "Park Slope",
    "Cobble Hill": "Cobble Hill",
    "Clinton Hill": "Clinton Hill",
    "Greenpoint": "Greenpoint",
    "Jackson Heights": "Jackson Heights",
  };
  for (const [google, want] of Object.entries(cases)) {
    const got = nyc([within(google)]).area;
    assert.equal(got, want, google);
  }
});

test("a specific neighborhood beats the Midtown Manhattan umbrella", () => {
  assert.equal(nyc([within("Midtown Manhattan"), within("Manhattan"), outskirts("Flatiron District")]).area, "Flatiron");
  assert.equal(nyc([outskirts("Gramercy Park"), within("Midtown Manhattan")]).area, "Gramercy");
  assert.equal(nyc([outskirts("Midtown East"), within("Midtown Manhattan")]).area, "Midtown");
  assert.equal(nyc([within("Mandarin Oriental, New York"), outskirts("Midtown Manhattan")]).area, "Midtown");
});

test("a NYC spot in the Bronx is always Bronx, even when Google names a Manhattan neighborhood", () => {
  const got = places.fromPlace({
    displayName: "Roberto's",
    addressComponents: [
      { longText: "Little Italy", types: ["neighborhood"] },
      { longText: "The Bronx", types: ["sublocality_level_1", "sublocality"] },
      { longText: "Bronx County", types: ["administrative_area_level_2"] },
      { longText: "New York", types: ["administrative_area_level_1"] },
    ],
    addressDescriptor: { areas: [within("Little Italy"), within("Belmont"), within("West Bronx")] },
  });
  assert.equal(got.city, "NYC");
  assert.equal(got.area, "Bronx");
});

test("a NYC area that is not on the list keeps Google's own neighborhood name", () => {
  assert.equal(nyc([within("Bushwick"), outskirts("Brooklyn")]).area, "Bushwick");
  assert.equal(places.fromPlace({
    displayName: "Spot",
    addressComponents: [
      { longText: "East Williamsburg", types: ["neighborhood"] },
      { longText: "Brooklyn", types: ["sublocality_level_1", "sublocality"] },
      { longText: "New York", types: ["administrative_area_level_1"] },
    ],
  }).area, "East Williamsburg");
  assert.equal(nyc([within("Lower Manhattan"), outskirts("Carroll Gardens")]).area, "Carroll Gardens");
  assert.equal(nyc([within("Lower Manhattan"), within("Manhattan")], [{ longText: "Brooklyn Heights", types: ["neighborhood"] }]).area, "Brooklyn Heights");
});

test("outside NYC the area is Google's own: containing, neighborhood, outskirts or near, then sublocality", () => {
  const dubai = [
    { longText: "Umm Suqeim 2", types: ["neighborhood"] },
    { longText: "Umm Suqeim Second", types: ["sublocality_level_1", "sublocality"] },
    { longText: "Dubai", types: ["locality"] },
  ];
  assert.equal(places.fromPlace({
    displayName: "Bu Qtair",
    addressComponents: dubai,
    addressDescriptor: { areas: [outskirts("Umm Suqeim 2"), outskirts("Umm Suqeim")] },
  }).area, "Umm Suqeim 2");
  assert.equal(places.fromPlace({
    displayName: "Spot",
    addressComponents: dubai,
    addressDescriptor: { areas: [within("Jumeirah"), outskirts("Umm Suqeim 2")] },
  }).area, "Jumeirah");
  const london = [{ longText: "Soho", types: ["sublocality_level_1", "sublocality"] }, { longText: "London", types: ["locality"] }];
  assert.equal(places.fromPlace({
    displayName: "Spot",
    addressComponents: london,
    addressDescriptor: { areas: [outskirts("Fitzrovia")] },
  }).area, "Fitzrovia");
  assert.equal(places.fromPlace({ displayName: "Spot", addressComponents: london }).area, "Soho");
  assert.equal(places.fromPlace({
    displayName: "Spot",
    addressComponents: dubai.slice(2),
    addressDescriptor: { areas: [near("Two Bridges")] },
  }).area, "Two Bridges");
  assert.equal(places.fromPlace({
    displayName: "Spot",
    addressComponents: [{ longText: "Philadelphia", types: ["locality"] }, { longText: "Chinatown", types: ["neighborhood"] }],
  }).area, "Chinatown");
  assert.equal(places.fromPlace({
    displayName: "Spot",
    addressComponents: [{ longText: "Philadelphia", types: ["locality"] }],
  }).area, "");
});

test("real Places responses give the area we expect", () => {
  const expected = {
    "Time Again New York": ["NYC", "Chinatown"],
    "Katz's Delicatessen New York": ["NYC", "Lower East Side"],
    "Via Carota New York": ["NYC", "West Village"],
    "Veselka New York": ["NYC", "East Village"],
    "Peter Luger Steak House Brooklyn": ["NYC", "Williamsburg"],
    "Cafe Mogador Williamsburg Brooklyn": ["NYC", "Williamsburg"],
    "Roberta's Pizza Brooklyn": ["NYC", "Bushwick"],
    "Roberto's Restaurant Bronx": ["NYC", "Bronx"],
    "Bu Qtair Dubai": ["Dubai", "Umm Suqeim 2"],
    "Kalaya Philadelphia": ["Philadelphia", "North Philadelphia"],
    "Nom Wah Tea Parlor New York": ["NYC", "Chinatown"],
    "Joe's Shanghai New York": ["NYC", "Chinatown"],
    "Lucali Brooklyn": ["NYC", "Carroll Gardens"],
    "Cho Dang Gol New York": ["NYC", "Midtown"],
    "Gramercy Tavern New York": ["NYC", "Flatiron"],
    "Eataly Flatiron New York": ["NYC", "Flatiron"],
    "Union Square Cafe New York": ["NYC", "Gramercy"],
    "Balthazar New York": ["NYC", "Soho"],
    "Carbone New York": ["NYC", "Greenwich Village"],
    "Pastis New York": ["NYC", "Greenwich Village"],
    "Peter Pan Donut Brooklyn": ["NYC", "Greenpoint"],
    "Per Se New York": ["NYC", "Midtown"],
    "Sushi Yasuda New York": ["NYC", "Midtown"],
    "Jackson Diner Queens": ["NYC", "Jackson Heights"],
    "Al Di La Trattoria Brooklyn": ["NYC", "Park Slope"],
    "Speedy Romeo Brooklyn": ["NYC", "Clinton Hill"],
    "Odeon Tribeca New York": ["NYC", "Tribeca"],
    "Rubirosa New York": ["NYC", "Nolita"],
    "Il Cortile New York": ["NYC", "Little Italy"],
    "Sant Ambroeus Madison Avenue New York": ["NYC", "Upper East Side"],
    "Cobble Hill Brooklyn Chez Moi": ["NYC", "Brooklyn Heights"],
  };
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/places-real.json", import.meta.url), "utf8"));
  assert.equal(fixtures.length, Object.keys(expected).length);
  for (const fixture of fixtures) {
    const got = places.fromPlace({
      displayName: fixture.displayName,
      googleMapsURI: "https://maps.google.com/?cid=1",
      addressComponents: fixture.components,
      addressDescriptor: { areas: fixture.areas.map((a) => ({ containment: a.containment, place: { displayName: a.name } })) },
    });
    assert.deepEqual([got.city, got.area], expected[fixture.query], fixture.query);
  }
});

test("displayName objects and legacy component names still read", () => {
  const got = places.fromPlace({
    displayName: { text: "Bar Oliver" },
    googleMapsUri: "https://maps.google.com/?cid=222",
    address_components: [
      { long_name: "Chinatown", types: ["neighborhood"] },
      { long_name: "New York", types: ["locality"] },
    ],
  });
  assert.equal(got.name, "Bar Oliver");
  assert.equal(got.maps, "https://maps.google.com/?cid=222");
  assert.equal(got.city, "NYC");
  assert.equal(got.area, "Chinatown");
});

test("search asks only for food places and keeps the session token", async () => {
  const token = { id: 7 };
  let request = null;
  const lib = {
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions(body) {
        request = body;
        return Promise.resolve({ suggestions: [{ placePrediction: { text: "C + B" } }] });
      },
    },
  };
  const suggestions = await places.search(lib, "C + B", token);
  assert.equal(suggestions.length, 1);
  assert.equal(request.input, "C + B");
  assert.equal(request.sessionToken, token);
  assert.deepEqual(request.includedPrimaryTypes, ["restaurant", "bar", "cafe", "food"]);
  assert.equal("locationBias" in request, false);
});

test("reading a prediction requests only the fields we store", async () => {
  let asked = null;
  const prediction = {
    toPlace() {
      return {
        displayName: "Smor",
        googleMapsURI: "https://maps.google.com/?cid=333",
        addressComponents: [{ longText: "New York", types: ["locality"] }],
        fetchFields(options) {
          asked = options.fields;
          return Promise.resolve();
        },
      };
    },
  };
  const got = await places.readPlace(prediction);
  assert.deepEqual(asked, ["displayName", "googleMapsURI", "addressComponents", "addressDescriptor"]);
  assert.equal(got.city, "NYC");
  assert.equal(got.name, "Smor");
});

test("a rejected address descriptor still fills from the address components", async () => {
  const calls = [];
  const prediction = {
    toPlace() {
      return {
        displayName: "TIME AGAIN",
        googleMapsURI: "https://maps.google.com/?cid=1",
        addressComponents: [
          { longText: "Chinatown", types: ["neighborhood"] },
          { longText: "Manhattan", types: ["sublocality_level_1", "sublocality"] },
          { longText: "New York", types: ["locality"] },
        ],
        fetchFields(options) {
          calls.push(options.fields.slice());
          if (options.fields.includes("addressDescriptor")) return Promise.reject(new Error("unsupported"));
          return Promise.resolve();
        },
      };
    },
  };
  const got = await places.readPlace(prediction);
  assert.deepEqual(calls, [
    ["displayName", "googleMapsURI", "addressComponents", "addressDescriptor"],
    ["displayName", "googleMapsURI", "addressComponents"],
  ]);
  assert.equal(got.area, "Chinatown");
  assert.equal(got.city, "NYC");
  assert.equal(got.name, "TIME AGAIN");
});

test("an empty key or a failed load leaves places off", async () => {
  assert.equal(await places.loadLibrary("", () => Promise.resolve({})), null);
  assert.equal(await places.loadLibrary("test-key", () => Promise.reject(new Error("could not load"))), null);
  assert.equal(await places.loadLibrary("test-key", () => Promise.resolve({})), null);
  const lib = await places.loadLibrary("test-key", () => Promise.resolve({
    AutocompleteSuggestion: {},
    AutocompleteSessionToken: function Token() {},
  }));
  assert.ok(lib);
});
