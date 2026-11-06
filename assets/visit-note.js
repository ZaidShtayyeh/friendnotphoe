/*
 * Sends at most one anonymous "visit" note per browser tab session.
 * Inert unless loaded with an explicit endpoint, e.g.
 *   <script src="assets/visit-note.js" data-endpoint="https://<worker>.workers.dev/v1/visit" defer></script>
 * Best effort only: it does not count unique people and delivery is not guaranteed.
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
      storage.setItem(STORAGE_KEY, '1');
      return storage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
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
      }).catch(function () {});
      return 'sent';
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
