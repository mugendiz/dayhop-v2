// public/go.js — DayHop Go Now (/go). Server: routes/goNow.js, services/goNow.js.
(function () {
  'use strict';
  var TORONTO = [43.6532, -79.3832];
  var state = { layer: 'wc', f: { open: false, winter: false, free: false }, center: null, me: null, results: [], focus: null };
  var params = new URLSearchParams(location.search);
  var focusId = params.get('p');

  var ICONS = {
    wc: document.querySelector('.gn-chip[data-layer="wc"] svg').outerHTML,
    ct: document.querySelector('.gn-chip[data-layer="ct"] svg').outerHTML,
    stop: document.querySelector('.gn-chip[data-layer="stop"] svg').outerHTML
  };

  function track(type, source) {
    try {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ type: type, source: source || null, attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined }) });
    } catch (e) { /* analytics never blocks the page */ }
  }

  var map = L.map('gn-map', { zoomControl: false, attributionControl: true }).setView(TORONTO, 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  var pins = L.layerGroup().addTo(map);
  var meMarker = null;

  var listEl = document.getElementById('gn-list');
  var whereEl = document.getElementById('gn-where');
  var metaEl = document.getElementById('gn-meta');
  var toastEl = document.getElementById('gn-toast');

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }

  function fmtDist(m) {
    if (m == null) return '';
    return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function badges(p) {
    var b = [];
    if (p.ct) b.push('Changing table');
    if (p.stepfree) b.push('Step-free entrance');
    if (p.acc) b.push('Accessible');
    if (p.free) b.push('Free');
    if (p.kind) b.push(p.kind);
    return b;
  }

  function shareUrl(p) {
    return location.origin + '/go?p=' + encodeURIComponent(p.id) + '&utm_source=share&utm_medium=card&utm_campaign=go';
  }

  function share(p) {
    var url = shareUrl(p);
    var text = p.n + ': ' + p.statusLabel.label + (p.ct ? ', changing table' : '') + '. Found on DayHop Go Now.';
    track('go_share', p.src);
    if (navigator.share) {
      navigator.share({ title: p.n, text: text, url: url }).catch(function () {});
      return;
    }
    var done = function () { toast('✓ Link copied'); };
    if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).then(done, function () { window.prompt('Copy this link:', url); });
    else window.prompt('Copy this link:', url);
  }

  function directions(p) {
    track('go_directions', p.src);
    window.open('https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '&travelmode=walking', '_blank', 'noopener');
  }

  function pinFor(p) {
    var cls = 'gn-pin ' + (state.layer === 'ct' ? 'ct' : p.statusLabel.key === 'open' ? '' : p.statusLabel.key);
    var icon = L.divIcon({ className: '', html: '<div class="' + cls + '">' + ICONS[state.layer === 'stop' ? 'stop' : state.layer] + '</div>', iconSize: [34, 34], iconAnchor: [17, 34] });
    var m = L.marker([p.lat, p.lng], { icon: icon, title: p.n, keyboard: true });
    m.on('click', function () { highlight(p.id, true); });
    return m;
  }

  function card(p) {
    var li = el('li', 'gn-card');
    li.id = 'c-' + p.id;
    var row = el('div', 'gn-row');
    row.appendChild(el('p', 'gn-name', p.n));
    row.appendChild(el('span', 'gn-dist', fmtDist(p.dist)));
    li.appendChild(row);
    var sub = p.park && p.park !== p.n ? p.park : (p.where || p.addr);
    if (state.layer === 'stop') sub = (p.wcDist != null ? 'Nearest washroom ' + fmtDist(p.wcDist) + ' away' : 'No washroom listed nearby') + (sub ? ' · ' + sub : '');
    if (sub) li.appendChild(el('p', 'gn-sub', sub));
    var pills = el('div', 'gn-pills');
    if (p.k === 'wc') pills.appendChild(el('span', 'gn-pill ' + p.statusLabel.key, p.statusLabel.label));
    badges(p).forEach(function (b) { pills.appendChild(el('span', 'gn-pill badge', b)); });
    li.appendChild(pills);
    var checked = p.src === 'toronto' && p.checked ? 'City of Toronto status, last updated ' + p.checked
      : p.src === 'ottawa' ? 'Source: City of Ottawa. Status not live.'
      : p.src === 'earlyon' ? 'Source: City of Toronto EarlyON list. Check hours before you go.'
      : 'Source: OpenStreetMap. Status not live.';
    if (p.hours) checked += ' Hours: ' + p.hours;
    li.appendChild(el('p', 'gn-checked', checked));
    var actions = el('div', 'gn-actions');
    var go = el('button', 'gn-btn go', 'Directions');
    go.addEventListener('click', function () { directions(p); });
    var sh = el('button', 'gn-btn share', 'Share card');
    sh.addEventListener('click', function () { share(p); });
    actions.appendChild(go);
    actions.appendChild(sh);
    li.appendChild(actions);
    li.addEventListener('click', function (e) { if (e.target.tagName !== 'BUTTON') { map.panTo([p.lat, p.lng]); highlight(p.id, false); } });
    return li;
  }

  function highlight(id, scroll) {
    Array.prototype.forEach.call(document.querySelectorAll('.gn-card.hi'), function (c) { c.classList.remove('hi'); });
    var c = document.getElementById('c-' + id);
    if (c) { c.classList.add('hi'); if (scroll) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  function empty(msg) {
    listEl.innerHTML = '';
    var li = el('li', 'gn-empty');
    li.innerHTML = '<svg width="72" height="56" viewBox="0 0 72 56" aria-hidden="true"><path d="M4 50 L24 22 L36 36 L48 16 L68 50 Z" fill="#E3F1E8" stroke="#2D5A47" stroke-width="2.5" stroke-linejoin="round"/><circle cx="54" cy="12" r="6" fill="#E1502F"/></svg>';
    li.appendChild(document.createTextNode(msg));
    listEl.appendChild(li);
  }

  var reqSeq = 0;
  function load() {
    var c = state.center || TORONTO;
    var f = Object.keys(state.f).filter(function (k) { return state.f[k]; }).join(',');
    var seq = ++reqSeq;
    if (!state.results.length) empty('We’re checking the nearest spots…');
    fetch('/api/go/near?lat=' + c[0] + '&lng=' + c[1] + '&layer=' + state.layer + '&f=' + f + '&limit=24')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (seq !== reqSeq) return;
        if (d.error) { empty(d.message || 'Go Now covers Ontario.'); return; }
        state.results = d.results || [];
        if (d.meta) metaEl.textContent = 'Toronto status from ' + (d.meta.toronto_checked || 'today') + '. Other data from ' + (d.meta.snapshot_built || 'our last refresh') + '.';
        render();
      })
      .catch(function () { if (seq === reqSeq) empty('Could not load spots just now. Pull to refresh or try again.'); });
  }

  function render() {
    pins.clearLayers();
    listEl.innerHTML = '';
    var list = state.results;
    if (!list.length) { empty(state.f.open ? 'Nothing confirmed open nearby. Live status is Toronto only; try without "Open now".' : 'Nothing listed nearby yet.'); return; }
    list.forEach(function (p) { pinFor(p).addTo(pins); });
    list.slice(0, 8).forEach(function (p, i) { var c = card(p); c.style.animationDelay = (i * 40) + 'ms'; listEl.appendChild(c); });
    var label = { wc: 'washrooms', ct: 'changing tables', stop: 'family stops' }[state.layer];
    whereEl.textContent = 'Nearest ' + label + (state.me ? ' to you' : ' to this spot on the map') + '. Drag the map to look elsewhere.';
    if (focusId) {
      var hit = list.filter(function (p) { return p.id === focusId; })[0];
      if (hit) highlight(hit.id, true);
      focusId = null;
    }
  }

  // Chips and filters
  Array.prototype.forEach.call(document.querySelectorAll('.gn-chip'), function (b) {
    b.addEventListener('click', function () {
      state.layer = b.getAttribute('data-layer');
      Array.prototype.forEach.call(document.querySelectorAll('.gn-chip'), function (o) {
        var on = o === b; o.classList.toggle('on', on); o.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      state.results = [];
      track('go_filter', 'layer:' + state.layer);
      load();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.gn-filter'), function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-f');
      state.f[k] = !state.f[k];
      b.setAttribute('aria-pressed', state.f[k] ? 'true' : 'false');
      track('go_filter', k + ':' + (state.f[k] ? 'on' : 'off'));
      load();
    });
  });

  // Moving the map searches there (debounced).
  var moveT = null;
  map.on('moveend', function () {
    clearTimeout(moveT);
    moveT = setTimeout(function () {
      var c = map.getCenter();
      if (state.center && Math.abs(c.lat - state.center[0]) < 0.004 && Math.abs(c.lng - state.center[1]) < 0.005) return;
      state.center = [c.lat, c.lng];
      state.me = false;
      load();
    }, 450);
  });

  function locate(userAsked) {
    if (!navigator.geolocation) { if (userAsked) toast('Location is not available here'); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var ll = [pos.coords.latitude, pos.coords.longitude];
      state.center = ll; state.me = true;
      if (meMarker) meMarker.remove();
      meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="gn-me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false }).addTo(map);
      map.setView(ll, 15, { animate: true });
      load();
    }, function () {
      if (userAsked) toast('Location is off. Drag the map instead.');
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  }
  document.getElementById('gn-locate').addEventListener('click', function () { locate(true); });

  // Start: a shared place, else a point another page linked (?lat&lng, e.g.
  // a parade start), else the user's location, else downtown Toronto.
  var qLat = Number(params.get('lat')), qLng = Number(params.get('lng'));
  var linked = qLat > 41 && qLat < 57.5 && qLng > -95.5 && qLng < -74;
  track('go_opened', focusId ? 'shared' : linked ? 'linked' : null);
  state.center = linked ? [qLat, qLng] : TORONTO;
  if (linked) map.setView(state.center, 15);
  load();
  if (!focusId && !linked) locate(false);
  else {
    // Center on the shared place once it is known.
    fetch('/api/go/place/' + encodeURIComponent(focusId)).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
      if (!p) return;
      state.layer = p.ct ? 'ct' : p.k === 'stop' ? 'stop' : 'wc';
      Array.prototype.forEach.call(document.querySelectorAll('.gn-chip'), function (o) {
        var on = o.getAttribute('data-layer') === state.layer; o.classList.toggle('on', on); o.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      state.center = [p.lat, p.lng];
      map.setView(state.center, 16);
      load();
    }).catch(function () {});
  }
})();
