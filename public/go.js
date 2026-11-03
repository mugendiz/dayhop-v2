// public/go.js — DayHop Go Now (/go). Server: routes/goNow.js, services/goNow.js.
(function () {
  'use strict';
  var RICHMOND_HILL = [43.8828, -79.4403];
  var params = new URLSearchParams(location.search);
  var state = { f: { open: false, changing: false, stroller: false }, center: null, me: false, results: [], focusId: params.get('p') };
  var SOURCE = { toronto_open_data: 'City of Toronto open data (live)', ottawa_open_data: 'City of Ottawa open data', osm: 'OpenStreetMap', manual: 'Checked by DayHop' };

  // A stable anonymous id per browser, so repeat opens can be counted
  // (the success measure for this page). Never tied to a person.
  var vid = null;
  try {
    vid = localStorage.getItem('dh_go_vid');
    if (!vid) { vid = 'go-' + Math.random().toString(36).slice(2, 12); localStorage.setItem('dh_go_vid', vid); }
  } catch (e) { vid = null; }

  function track(type, source) {
    try {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ type: type, source: source || null, owner_id: vid || undefined,
          attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined }) });
    } catch (e) { /* analytics never blocks the page */ }
  }

  var map = L.map('gn-map', { zoomControl: false }).setView(RICHMOND_HILL, 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  var pins = L.layerGroup().addTo(map);
  var meMarker = null;

  var $ = function (id) { return document.getElementById(id); };
  var listEl = $('gn-list'), whereEl = $('gn-where'), detailEl = $('gn-detail'), browseEl = $('gn-browse'), toastEl = $('gn-toast');
  var WC_ICON = document.querySelector('.gn-chip[data-f="open"] svg').outerHTML;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.classList.remove('show'); }, 2000);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtDist(m) { return m == null ? '' : m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km'; }
  function fmtDate(d) {
    if (!d) return 'unknown';
    try { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; }
  }
  function colorKey(p) { return p.washroom_status === 'open' ? 'open' : p.washroom_status === 'closed' ? 'closed' : 'unknown'; }

  // The three facts, always shown, unknown included.
  function pills(p) {
    var wrap = el('div', 'gn-pills');
    var w = { open: ['open', 'Open'], closed: ['closed', 'Closed'], unknown: ['unknown', 'Status unknown'] }[p.washroom_status];
    wrap.appendChild(el('span', 'gn-pill ' + w[0], w[1]));
    var ct = p.changing_table === true ? ['open', 'Changing table'] : p.changing_table === false ? ['closed', 'No changing table'] : ['unknown', 'Changing table unknown'];
    wrap.appendChild(el('span', 'gn-pill ' + ct[0], ct[1]));
    var st = p.stroller_friendly === true ? ['open', 'Stroller: step-free'] : p.stroller_friendly === false ? ['closed', 'Stroller: not step-free'] : ['unknown', 'Stroller unknown'];
    wrap.appendChild(el('span', 'gn-pill ' + st[0], st[1]));
    return wrap;
  }

  function sourceLine(p) {
    return 'Checked ' + fmtDate(p.last_checked) + ' · ' + (SOURCE[p.source] || p.source) + ' · ' + (p.region === 'GTA' ? (p.source === 'toronto_open_data' ? 'GTA live' : 'GTA seeded') : 'Ontario seeded');
  }

  function shareUrl(p) { return location.origin + '/go?p=' + encodeURIComponent(p.id) + '&utm_source=share&utm_medium=card&utm_campaign=go'; }

  function directions(p) {
    track('go_directions', p.source);
    window.open('https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '&travelmode=walking', '_blank', 'noopener');
  }

  // ---------- detail sheet ----------
  function showDetail(p) {
    state.focusId = p.id;
    detailEl.innerHTML = '';
    var back = el('button', 'gn-back', '← Nearest list');
    back.addEventListener('click', hideDetail);
    detailEl.appendChild(back);
    var row = el('div', 'gn-row');
    row.appendChild(el('h2', 'gn-dname', p.name));
    if (p.dist != null) row.appendChild(el('span', 'gn-dist', fmtDist(p.dist)));
    detailEl.appendChild(row);
    var sub = p.park && p.park !== p.name ? p.park : p.address;
    if (sub) detailEl.appendChild(el('p', 'gn-sub', sub));
    detailEl.appendChild(pills(p));
    detailEl.appendChild(el('p', 'gn-checked', sourceLine(p)));
    if (p.notes) detailEl.appendChild(el('p', 'gn-notes', p.notes));
    var actions = el('div', 'gn-actions');
    var go = el('button', 'gn-btn go', 'Directions');
    go.addEventListener('click', function () { directions(p); });
    var sh = el('button', 'gn-btn share', 'Share this stop');
    sh.addEventListener('click', function () { openShare(p); });
    actions.appendChild(go); actions.appendChild(sh);
    detailEl.appendChild(actions);
    var panel = el('div', 'gn-share'); panel.id = 'gn-share'; panel.hidden = true;
    detailEl.appendChild(panel);
    browseEl.hidden = true;
    detailEl.hidden = false;
    $('gn-sheet').scrollTop = 0;
  }
  function hideDetail() { detailEl.hidden = true; browseEl.hidden = false; state.focusId = null; }

  // ---------- share card ----------
  function openShare(p) {
    var panel = $('gn-share');
    panel.innerHTML = '';
    panel.hidden = false;
    var img = el('img', 'gn-card-img');
    img.src = '/api/go/card/' + encodeURIComponent(p.id) + '.png';
    img.alt = 'Share card for ' + p.name;
    img.width = 270; img.height = 338;
    panel.appendChild(img);
    var url = shareUrl(p);
    var text = p.name + ': ' + ({ open: 'open', closed: 'closed', unknown: 'status unknown' }[p.washroom_status]) +
      (p.changing_table === true ? ', changing table' : '') + '. Found on DayHop Go Now.';
    var btns = el('div', 'gn-actions');
    var send = el('button', 'gn-btn go', navigator.share ? 'Send it' : 'Copy link');
    send.addEventListener('click', function () {
      track('go_share', p.source);
      if (navigator.share) { navigator.share({ title: p.name, text: text, url: url }).catch(function () {}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).then(function () { toast('✓ Link copied'); }, function () { window.prompt('Copy this link:', url); });
      else window.prompt('Copy this link:', url);
    });
    var save = el('a', 'gn-btn share', 'Save image');
    save.href = img.src; save.setAttribute('download', 'dayhop-go-now.png');
    save.addEventListener('click', function () { track('go_share', 'image'); });
    btns.appendChild(send); btns.appendChild(save);
    panel.appendChild(btns);

    // Optional: status alerts, only where status is live.
    if (p.source === 'toronto_open_data') {
      var form = el('form', 'gn-alert');
      form.setAttribute('novalidate', '');
      form.appendChild(el('label', 'gn-alert-label', 'Email me when this one opens or closes'));
      var row = el('div', 'gn-alert-row');
      var input = el('input'); input.type = 'email'; input.required = true; input.placeholder = 'you@example.com'; input.autocomplete = 'email';
      input.setAttribute('aria-label', 'Email address');
      var b = el('button', 'gn-btn go', 'Alert me'); b.type = 'submit';
      row.appendChild(input); row.appendChild(b);
      form.appendChild(row);
      var msg = el('p', 'gn-alert-msg'); msg.setAttribute('role', 'status');
      form.appendChild(msg);
      form.appendChild(el('p', 'gn-alert-fine', 'You also get the free DayHop weekend brief. One click to leave.'));
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = (input.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = 'That email does not look right.'; input.focus(); return; }
        b.disabled = true;
        fetch('/api/go/alert', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, id: p.id, attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined }) })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (d) { msg.textContent = d.message || 'Done.'; if (d.ok) input.value = ''; })
          .catch(function () { msg.textContent = 'Could not save that just now. Please try again.'; })
          .then(function () { b.disabled = false; });
      });
      panel.appendChild(form);
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- list and pins ----------
  function pinFor(p) {
    var icon = L.divIcon({ className: '', html: '<div class="gn-pin ' + colorKey(p) + '">' + WC_ICON + '</div>', iconSize: [34, 34], iconAnchor: [17, 34] });
    var m = L.marker([p.lat, p.lng], { icon: icon, title: p.name, keyboard: true });
    m.on('click', function () { showDetail(p); });
    return m;
  }

  function listItem(p, i) {
    var li = el('li', 'gn-card');
    li.style.animationDelay = (i * 40) + 'ms';
    var btn = el('button', 'gn-card-btn');
    btn.setAttribute('aria-label', p.name + ', ' + fmtDist(p.dist));
    var row = el('span', 'gn-row');
    row.appendChild(el('span', 'gn-name', p.name));
    row.appendChild(el('span', 'gn-dist', fmtDist(p.dist)));
    btn.appendChild(row);
    btn.appendChild(pills(p));
    btn.appendChild(el('span', 'gn-checked', sourceLine(p)));
    btn.addEventListener('click', function () { map.panTo([p.lat, p.lng]); showDetail(p); });
    li.appendChild(btn);
    return li;
  }

  function empty(msg) {
    listEl.innerHTML = '';
    var li = el('li', 'gn-empty');
    li.innerHTML = '<svg width="72" height="56" viewBox="0 0 72 56" aria-hidden="true"><path d="M4 50 L24 22 L36 36 L48 16 L68 50 Z" fill="#E3F1E8" stroke="#2D5A47" stroke-width="2.5" stroke-linejoin="round"/><circle cx="54" cy="12" r="6" fill="#E1502F"/></svg>';
    li.appendChild(document.createTextNode(msg));
    listEl.appendChild(li);
  }

  var seq = 0;
  function load() {
    var c = state.center || RICHMOND_HILL;
    var f = Object.keys(state.f).filter(function (k) { return state.f[k]; }).join(',');
    var mine = ++seq;
    if (!state.results.length) empty('Checking the nearest washrooms…');
    fetch('/api/go/near?lat=' + c[0] + '&lng=' + c[1] + '&f=' + f + '&limit=30')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (mine !== seq) return;
        if (d.error) { empty(d.message || 'Go Now covers Ontario.'); return; }
        state.results = d.results || [];
        render();
      })
      .catch(function () { if (mine === seq) empty('Could not load washrooms just now. Try again in a moment.'); });
  }

  function render() {
    pins.clearLayers();
    listEl.innerHTML = '';
    var list = state.results;
    if (!list.length) {
      empty(state.f.open ? 'Nothing confirmed open nearby. Live open or closed status is Toronto only; turn off "Open now" to see the rest.' : 'Nothing matches here. Try turning a filter off.');
      return;
    }
    list.forEach(function (p) { pinFor(p).addTo(pins); });
    list.slice(0, 8).forEach(function (p, i) { listEl.appendChild(listItem(p, i)); });
    var on = Object.keys(state.f).filter(function (k) { return state.f[k]; }).length;
    whereEl.textContent = 'Nearest ' + (on ? 'matches' : 'washrooms') + (state.me ? ' to you' : ' to this spot') + '. Tap one for details, or drag the map.';
    if (state.focusId) {
      var hit = list.filter(function (p) { return p.id === state.focusId; })[0];
      if (hit && detailEl.hidden) showDetail(hit);
    }
  }

  // Toggles combine: every active one must be true.
  Array.prototype.forEach.call(document.querySelectorAll('.gn-chip'), function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-f');
      state.f[k] = !state.f[k];
      b.setAttribute('aria-pressed', state.f[k] ? 'true' : 'false');
      b.classList.toggle('on', state.f[k]);
      track('go_filter', k + ':' + (state.f[k] ? 'on' : 'off'));
      hideDetail();
      load();
    });
  });

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
    }, function () { if (userAsked) toast('Location is off. Drag the map instead.'); },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  }
  $('gn-locate').addEventListener('click', function () { locate(true); });

  // Start: a shared stop, else a linked point (?lat&lng), else the user's
  // location, else Richmond Hill.
  var qLat = Number(params.get('lat')), qLng = Number(params.get('lng'));
  var linked = qLat > 41 && qLat < 57.5 && qLng > -95.5 && qLng < -74;
  track('go_opened', state.focusId ? 'shared' : linked ? 'linked' : null);
  if (state.focusId) {
    fetch('/api/go/place/' + encodeURIComponent(state.focusId)).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
      if (!p) { state.focusId = null; state.center = RICHMOND_HILL; load(); locate(false); return; }
      state.center = [p.lat, p.lng];
      map.setView(state.center, 16);
      showDetail(p);
      load();
    }).catch(function () { state.center = RICHMOND_HILL; load(); });
  } else {
    state.center = linked ? [qLat, qLng] : RICHMOND_HILL;
    if (linked) map.setView(state.center, 15);
    load();
    if (!linked) locate(false);
  }
})();
