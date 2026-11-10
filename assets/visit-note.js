/*
 * At most one anonymous "visit" attempt per browser tab session.
 * Loaded from index.html with the owner-reported endpoint. While that Worker is
 * inactive it answers 503; this script treats that as not delivered and shows nothing.
 * Best effort only: it does not count unique people, and a 200 only means the Worker
 * accepted the attempt, not that a routine run finished.
 */
(function () {
  var STORAGE_KEY = 'fnp_visit_note_v1';
  var SITE = 'friendnotphoe.com';
  var PATH_RE = /^\/[A-Za-z0-9._~\-/]{0,63}$/;

  function endpointFrom(script) {
    var raw = script && script.getAttribute && script.getAttribute('data-endpoint');
    if (!raw) return null;
    try {
      var url = new URL(raw);
      return url.protocol === 'https:' && !url.search && !url.hash ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function safePath(pathname) {
    return typeof pathname === 'string' && PATH_RE.test(pathname) &&
      pathname.indexOf('//') === -1 && pathname.indexOf('..') === -1 ? pathname : '/';
  }

  function claimSession(g) {
    // If storage is unavailable we cannot throttle, so we do not send at all.
    try {
      var storage = g.sessionStorage;
      if (storage.getItem(STORAGE_KEY)) return false;
      storage.setItem(STORAGE_KEY, 'pending');
      return storage.getItem(STORAGE_KEY) === 'pending';
    } catch (e) {
      return false;
    }
  }

  function remember(g, outcome) {
    try {
      g.sessionStorage.setItem(STORAGE_KEY, outcome);
    } catch (e) {}
  }

  function run(g) {
    try {
      var endpoint = endpointFrom(g.document.currentScript);
      if (!endpoint) return 'off';
      if (g.location.protocol !== 'https:' || g.location.hostname.replace(/^www\./, '') !== SITE) return 'wrong-host';
      var nav = g.navigator || {};
      if (nav.globalPrivacyControl === true || nav.doNotTrack === '1') return 'opted-out';
      if (!g.crypto || typeof g.crypto.randomUUID !== 'function' || typeof g.fetch !== 'function') return 'unsupported';
      if (!claimSession(g)) return 'throttled';

      var body = JSON.stringify({
        type: 'visit',
        site: SITE,
        event_id: g.crypto.randomUUID(),
        occurred_at: new Date().toISOString(),
        path: safePath(g.location.pathname),
        test: false
      });
      g.fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: body
      }).then(function (res) {
        var status = res && typeof res.status === 'number' ? res.status : 0;
        // 503: secrets unset or forwarding off. Any other non-200 is also not a delivery.
        // 200 is only Worker acceptance, so it is recorded as "noted", never "delivered".
        remember(g, status === 200 ? 'noted' : 'not-delivered');
      }).catch(function () {
        remember(g, 'not-delivered');
      });
      return 'attempted';
    } catch (e) {
      return 'error';
    }
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { run: run, safePath: safePath };
  } else {
    run(window);
  }
})();
