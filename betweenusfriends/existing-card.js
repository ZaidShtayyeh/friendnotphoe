/* Read the same published cards as Explore; never maintain a second card list. */
(function (root) {
  'use strict';
  function normal(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  }
  function identity(value) {
    try {
      var url = new URL(value);
      if (!/(^|\.)(google\.com|maps\.app\.goo\.gl|goo\.gl)$/.test(url.hostname)) return '';
      if (url.searchParams.get('cid')) return 'cid:' + url.searchParams.get('cid');
      if (url.searchParams.get('query_place_id')) return 'place:' + url.searchParams.get('query_place_id');
      var q = url.searchParams.get('q') || '';
      if (q.indexOf('place_id:') === 0) return 'place:' + q.slice(9);
      // Only a shared short URL is an identity; a text-search URL is not.
      if (/^(maps\.app\.goo\.gl|goo\.gl)$/.test(url.hostname)) return url.origin + url.pathname;
    } catch (_) {}
    return '';
  }
  function distance(a, b) {
    if (![a.lat, a.lng, b.lat, b.lng].every(function (v) { return typeof v === 'number' && Number.isFinite(v); })) return Infinity;
    var rad = Math.PI / 180;
    var dy = (a.lat - b.lat) * rad;
    var dx = (a.lng - b.lng) * rad * Math.cos((a.lat + b.lat) * rad / 2);
    return Math.sqrt(dx * dx + dy * dy) * 6371000;
  }
  function find(place, cards) {
    var key = identity(place.maps), name = normal(place.name);
    return (cards || []).find(function (card) {
      var other = identity(card.mapsURL);
      if (key && other && key === other) return true;
      if (place.placeId && other === 'place:' + place.placeId) return true;
      // Two different Google CIDs are different establishments, even next door.
      if (key.indexOf('cid:') === 0 && other.indexOf('cid:') === 0 && key !== other) return false;
      var aliases = [normal(card.name), normal((card.place || '').split(',')[0])];
      // Never infer an individual branch from a chain's approximate map pin.
      return !!name && !card.nearest && aliases.indexOf(name) >= 0 && distance(place, card) <= 60;
    }) || null;
  }
  var api = { find: find, identity: identity };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root.document) return;
  var doc = root.document, $ = function (id) { return doc.getElementById(id); };
  var input = $('place'), notice = $('existing-card');
  if (!input || !notice) return;
  var selected = null;
  function clear() { notice.hidden = true; $('existing-card-link').removeAttribute('href'); }
  function check(fields) {
    var card = find(fields, (root.FNP_DATA || {}).cards);
    clear();
    if (!card) return;
    $('existing-card-name').textContent = card.name + ' · ' + (card.city === 'NYC' ? 'New York' : card.city);
    var slug = card.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    $('existing-card-link').href = '../#card/' + slug;
    notice.hidden = false;
  }
  input.addEventListener('fnp:place-selected', function (event) { selected = event.detail; check(selected); });
  input.addEventListener('input', function () { selected = null; clear(); });
  $('maps').addEventListener('input', function () { check({ maps: $('maps').value }); });
  $('existing-card-change').addEventListener('click', function () {
    if (selected) $('change-place').click();
    else { input.value = ''; $('maps').value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
    input.focus();
  });
  input.form.addEventListener('reset', function () { selected = null; clear(); });
})(typeof window === 'object' ? window : globalThis);
