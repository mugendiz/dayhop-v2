// pixel.js — DayHop V2
// Ad infrastructure, client half. Two jobs, both inert until configured:
//   1. Attribution: capture utm_* / fbclid from the landing URL into
//      localStorage (first touch wins — the campaign that BROUGHT the user,
//      not the one they last brushed past). Runs on every page, no config
//      needed, so campaign links start being attributed before any pixel
//      account exists.
//   2. Meta Pixel: /api/config carries metaPixelId when META_PIXEL_ID is set
//      server-side; only then is Meta's fbevents.js injected (PageView fires
//      on init). No ID → no third-party request, ever.
//
// Exposed for the other scripts (footer form, auth.js, app.js):
//   window.dayhopAttrib()            → stored attribution object or null
//   window.dayhopPixel(...fbqArgs)   → safe fbq proxy; queues until the pixel
//                                      is live, silently no-ops if it never is.
(function () {
  'use strict';

  var STORE_KEY = 'dayhop_attrib';
  var MAX_AGE_MS = 90 * 24 * 3600 * 1000; // Meta's longest attribution window

  function readStored() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      if (obj.landed_at && Date.now() - Date.parse(obj.landed_at) > MAX_AGE_MS) {
        localStorage.removeItem(STORE_KEY);
        return null;
      }
      return obj;
    } catch (e) { return null; }
  }

  // Capture first-touch attribution from the current URL.
  try {
    var params = new URLSearchParams(location.search);
    var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
    var found = {};
    var any = false;
    for (var i = 0; i < KEYS.length; i++) {
      var v = params.get(KEYS[i]);
      if (v) { found[KEYS[i]] = String(v).slice(0, 120); any = true; }
    }
    if (any && !readStored()) {
      found.landed_at = new Date().toISOString();
      found.landing_path = location.pathname.slice(0, 120);
      localStorage.setItem(STORE_KEY, JSON.stringify(found));
    }
  } catch (e) { /* attribution must never break a page */ }

  window.dayhopAttrib = readStored;

  // fbq proxy: queue calls until (unless) the pixel loads.
  var queue = [];
  var live = false;
  window.dayhopPixel = function () {
    var args = Array.prototype.slice.call(arguments);
    if (live && window.fbq) { try { window.fbq.apply(null, args); } catch (e) {} }
    else queue.push(args);
  };

  function bootPixel(pixelId) {
    // Meta's standard base snippet, verbatim minus the auto-injected script tag
    // (we add it ourselves so `defer` ordering stays deterministic).
    if (window.fbq) return;
    var n = window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
    live = true;
    while (queue.length) {
      var args = queue.shift();
      try { window.fbq.apply(null, args); } catch (e) {}
    }
  }

  // /api/config is already fetched by the SPA, but blog/playbook/guide pages
  // have no app.js — fetch here (it's Cache-Control: 300s, so the SPA's own
  // fetch and this one share one network hit).
  fetch('/api/config')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (cfg && cfg.metaPixelId) bootPixel(String(cfg.metaPixelId));
    })
    .catch(function () { /* no config, no pixel — page works regardless */ });
})();
