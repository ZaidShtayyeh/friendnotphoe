import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const places = require("../../input-form/places.js");

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

test("neighborhood wins, otherwise the first sublocality", () => {
  assert.equal(places.fromPlace(place()).area, "East Village");
  assert.equal(places.fromPlace(place({
    addressComponents: [
      { longText: "Brooklyn", types: ["sublocality_level_1", "sublocality", "political"] },
      { longText: "New York", types: ["locality", "political"] },
    ],
  })).area, "Brooklyn");
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
  assert.deepEqual(asked, ["displayName", "googleMapsURI", "addressComponents"]);
  assert.equal(got.city, "NYC");
  assert.equal(got.name, "Smor");
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
