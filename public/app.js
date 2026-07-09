// public/app.js — DayHop V2
(function () {
  'use strict';

  const CATEGORY_LABELS = {
    worldcup: '⚽ World Cup',
    kids: '👶 Kid-Friendly',
    patios: '🍻 Patios',
    water: '🏖️ Water',
    cruises: '⛴️ Cruise',
    adventures: '🚁 Big Experience',
    culture: '🏛️ Culture',
    food: '🍽️ Food',
    general: '📍 Local'
  };

  // Inspiring Unsplash photo per category (photo IDs hand-picked + verified).
  const CATEGORY_IMAGES = {
    worldcup: '1551958219-acbc608c6377',
    kids: '1503454537195-1dcabb73ffb9',
    water: '1507525428034-b723cf961d3e',
    patios: '1555396273-367ea4eb4db5',
    cruises: '1507992781348-310259076fe0',
    adventures: '1473862170180-84427c485aca',
    culture: '1518998053901-5348d3961a04',
    food: '1504674900247-0877df9cc836',
    general: '1486325212027-8081e485255e'
  };

  function categoryImage(category, width = 640) {
    const id = CATEGORY_IMAGES[category] || CATEGORY_IMAGES.general;
    return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=70`;
  }

  // GTA coverage — "Across the GTA" is the default, then grouped by region.
  const GTA_WIDE = 'Across the GTA';
  const GTA_LOCATIONS = [
    { region: 'Toronto', cities: ['Toronto (Downtown)', 'North York', 'Scarborough', 'Etobicoke', 'East York'] },
    { region: 'York Region', cities: ['Richmond Hill', 'Markham', 'Vaughan', 'Newmarket', 'Aurora', 'King City', 'Stouffville'] },
    { region: 'Peel', cities: ['Mississauga', 'Brampton', 'Caledon'] },
    { region: 'Halton', cities: ['Oakville', 'Burlington', 'Milton', 'Halton Hills'] },
    { region: 'Durham', cities: ['Pickering', 'Ajax', 'Whitby', 'Oshawa'] }
  ];

  const state = {
    allIdeas: [],
    shortlist: [],
    dismissedIds: new Set(),
    currentFilter: 'all',
    city: GTA_WIDE,
    user: null,
    isGenerating: false,
    isBuildingPlan: false,
    lastPrompt: '',
    lastWeather: null,
    coords: null,        // { lat, lng } rounded to ~110 m, only if user opted in
    coordsAt: 0,
    locationLabel: null, // e.g. "Richmond Hill · L4C"
    locationChosen: false // user must explicitly pick a location before searching
  };

  const COORDS_FRESH_MS = 30 * 60 * 1000;

  // ---------- Persistence (survive refresh) ----------
  const STORAGE_KEY = 'dayhop_state_v2';

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      state.shortlist = saved.shortlist || [];
      if (saved.city) state.city = saved.city;
      // Re-use a recent opt-in location so a refresh doesn't lose "near you",
      // but let it expire — people move.
      if (saved.coords && saved.coordsAt && Date.now() - saved.coordsAt < COORDS_FRESH_MS) {
        state.coords = saved.coords;
        state.coordsAt = saved.coordsAt;
        state.locationLabel = saved.locationLabel || null;
      }
      // Returning users who picked before don't have to pick again.
      state.locationChosen = Boolean(saved.locationChosen) || Boolean(state.coords) ||
        Boolean(saved.city && saved.city !== GTA_WIDE);
    } catch (e) {
      console.warn('Could not load saved DayHop state', e);
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        shortlist: state.shortlist,
        city: state.city,
        coords: state.coords,
        coordsAt: state.coordsAt,
        locationLabel: state.locationLabel,
        locationChosen: state.locationChosen
      }));
    } catch (e) {
      // ignore quota errors silently — not critical to function
    }
  }

  // ---------- Location autocomplete (combobox) ----------
  // Flatten the GTA groups into a single searchable list, GTA-wide first.
  const LOCATION_OPTIONS = (() => {
    const list = [{ city: GTA_WIDE, region: 'All regions' }];
    GTA_LOCATIONS.forEach(group => {
      group.cities.forEach(city => list.push({ city, region: group.region }));
    });
    return list;
  })();

  const combo = { input: null, listbox: null, activeIndex: -1, filtered: [], debounce: null, locating: false };

  // What the location input should display for the current state.
  function locationDisplayValue() {
    return state.coords && state.locationLabel ? `📍 Near you · ${state.locationLabel}` : state.city;
  }

  function setupLocationCombo() {
    const input = document.getElementById('location-input');
    const listbox = document.getElementById('location-listbox');
    if (!input || !listbox) return;

    if (!state.city) state.city = GTA_WIDE;

    combo.input = input;
    combo.listbox = listbox;
    input.value = locationDisplayValue();
    updateLocationTag();

    input.addEventListener('focus', () => openLocationList(''));
    input.addEventListener('input', () => {
      clearTimeout(combo.debounce);
      const q = input.value;
      combo.debounce = setTimeout(() => openLocationList(q), 130);
    });
    input.addEventListener('keydown', onLocationKeydown);
    // Delay close so an option's mousedown/click can land first.
    input.addEventListener('blur', () => setTimeout(closeLocationList, 120));
  }

  function openLocationList(query) {
    const raw = (query || '').trim();
    // The synthetic "Near you" label isn't a search query — show the full list.
    const q = raw.startsWith('📍') ? '' : raw.toLowerCase();
    combo.filtered = q
      ? LOCATION_OPTIONS.filter(o => o.city.toLowerCase().includes(q) || o.region.toLowerCase().includes(q))
      : LOCATION_OPTIONS.slice();
    combo.activeIndex = -1;
    renderLocationOptions(q);
    combo.listbox.hidden = false;
    combo.input.setAttribute('aria-expanded', 'true');
  }

  function renderLocationOptions(q) {
    const lb = combo.listbox;
    const rows = [];

    // Pinned: geolocation on an explicit user gesture (never on page load).
    rows.push(`
      <li class="location-option location-option--geo" role="option" data-kind="geo">
        <span class="opt-city">${combo.locating ? '📍 Locating…' : '📍 Use my current location'}</span>
        <span class="opt-region">Ideas around the corner</span>
      </li>`);

    rows.push(...combo.filtered.map((o, i) => `
      <li id="loc-opt-${i}" class="location-option" role="option"
          data-kind="city" data-city="${escapeAttr(o.city)}" aria-selected="${o.city === state.city}">
        <span class="opt-city">${highlight(o.city, q)}</span>
        ${o.region ? `<span class="opt-region">${escapeHtml(o.region)}</span>` : ''}
      </li>`));

    // Anything typed that isn't a GTA option is searchable as free text —
    // a city anywhere, an address, a zip or postal code.
    if (q && !combo.filtered.some(o => o.city.toLowerCase() === q)) {
      rows.push(`
        <li class="location-option location-option--search" role="option" data-kind="search" data-text="${escapeAttr(q)}">
          <span class="opt-city">🔎 Search “${escapeHtml(q)}”</span>
          <span class="opt-region">City, address, zip or postal code</span>
        </li>`);
    }

    lb.innerHTML = rows.join('');
    lb.querySelectorAll('.location-option[data-kind]').forEach(li => {
      li.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus so blur doesn't pre-empt the select
        commitLocationOption(li);
      });
    });
  }

  function commitLocationOption(li) {
    const kind = li.dataset.kind;
    if (kind === 'geo') { useMyLocation(); return; }
    if (kind === 'search') { selectFreeTextLocation(combo.input.value.trim()); return; }
    selectLocation(li.dataset.city);
  }

  function selectFreeTextLocation(text) {
    if (!text) return;
    state.city = text;
    state.coords = null;
    state.locationLabel = null;
    combo.input.value = text;
    markLocationChosen();
    persist();
    updateLocationTag();
    closeLocationList();
  }

  // Best practice: request the permission only from this explicit gesture,
  // and always leave the typed fallback available if it's declined.
  function useMyLocation() {
    if (combo.locating) return;
    if (!navigator.geolocation) {
      showToast("Your browser doesn't support location — type a city or postal code instead.");
      return;
    }

    const start = () => {
      combo.locating = true;
      renderLocationOptions('');
      navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 300000
      });
    };

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(status => {
        if (status.state === 'denied') {
          showToast('Location is blocked in your browser settings — type a city or postal code instead.', { duration: 4500 });
          combo.input.focus();
        } else {
          start();
        }
      }).catch(start);
    } else {
      start();
    }
  }

  async function onGeoSuccess(position) {
    combo.locating = false;
    // Round to ~110 m before anything leaves the browser — the server never
    // sees (or stores) precise coordinates.
    const lat = Math.round(position.coords.latitude * 1000) / 1000;
    const lng = Math.round(position.coords.longitude * 1000) / 1000;
    state.coords = { lat, lng };
    state.coordsAt = Date.now();

    try {
      const res = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
      if (res.ok) {
        const data = await res.json();
        state.city = data.city || state.city;
        state.locationLabel = data.label || data.city || 'your area';
      } else {
        state.locationLabel = 'your area';
      }
    } catch (e) {
      state.locationLabel = 'your area';
    }

    combo.input.value = locationDisplayValue();
    markLocationChosen();
    persist();
    updateLocationTag();
    closeLocationList();
    showToast('Showing ideas near you 📍');
  }

  function onGeoError(err) {
    combo.locating = false;
    renderLocationOptions('');
    const blocked = err && err.code === 1; // PERMISSION_DENIED
    showToast(blocked
      ? 'No problem — search a city, address, or postal code instead.'
      : "Couldn't get your location — search a city or postal code instead.", { duration: 4500 });
    combo.input.focus();
  }

  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) +
      '<mark>' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>' +
      escapeHtml(text.slice(idx + q.length));
  }

  function moveActive(dir) {
    const items = combo.listbox.querySelectorAll('.location-option[data-kind]');
    if (!items.length) return;
    let idx = combo.activeIndex + dir;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;
    combo.activeIndex = idx;
    items.forEach((el, i) => el.classList.toggle('is-active', i === idx));
    items[idx].scrollIntoView({ block: 'nearest' });
    combo.input.setAttribute('aria-activedescendant', items[idx].id);
  }

  function onLocationKeydown(e) {
    const open = combo.listbox && !combo.listbox.hidden;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openLocationList(combo.input.value); else moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) moveActive(-1);
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault();
        const items = combo.listbox.querySelectorAll('.location-option[data-kind]');
        if (combo.activeIndex >= 0 && items[combo.activeIndex]) {
          commitLocationOption(items[combo.activeIndex]);
        } else if (combo.input.value.trim() && !combo.input.value.startsWith('📍')) {
          // Enter on free-typed text (postal code, city, address) searches it.
          selectFreeTextLocation(combo.input.value.trim());
        }
      }
    } else if (e.key === 'Escape') {
      if (open) { e.stopPropagation(); closeLocationList(); }
    }
  }

  function markLocationChosen() {
    state.locationChosen = true;
    updateWhereEmphasis();
  }

  function updateWhereEmphasis() {
    const el = document.getElementById('prompt-location');
    if (el) el.classList.toggle('prompt-location--unset', !state.locationChosen);
  }

  function selectLocation(city) {
    state.city = city;
    state.coords = null;
    state.locationLabel = null;
    combo.input.value = city;
    markLocationChosen();
    persist();
    updateLocationTag();
    closeLocationList();
  }

  function closeLocationList() {
    const lb = combo.listbox;
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    lb.innerHTML = '';
    combo.activeIndex = -1;
    combo.input.setAttribute('aria-expanded', 'false');
    combo.input.removeAttribute('aria-activedescendant');
    // Commit: uncommitted typed text reverts to the current selection.
    if (combo.input.value.trim() !== locationDisplayValue()) combo.input.value = locationDisplayValue();
  }

  function updateLocationTag() {
    const tag = document.getElementById('location-tag');
    if (!tag) return;
    if (state.coords && state.locationLabel) tag.textContent = `📍 ${state.locationLabel}`;
    else tag.textContent = state.city === GTA_WIDE ? 'Greater Toronto Area' : state.city;
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(message, { duration = 2600, actionLabel, onAction } = {}) {
    const el = document.getElementById('toast');
    el.textContent = message;
    if (actionLabel && typeof onAction === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => {
        hideToast();
        onAction();
      });
      el.appendChild(btn);
    }
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('toast--visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, duration);
  }

  function hideToast() {
    const el = document.getElementById('toast');
    clearTimeout(toastTimer);
    el.classList.remove('toast--visible');
    setTimeout(() => { el.hidden = true; }, 200);
  }

  // ---------- Panels ----------
  function openPanel(id) {
    const panel = document.getElementById(id);
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('panel--open'));
    document.body.style.overflow = 'hidden';
  }

  function closePanel(panelEl) {
    panelEl.classList.remove('panel--open');
    document.body.style.overflow = '';
    setTimeout(() => { panelEl.hidden = true; }, 200);
  }

  function wirePanelClosers() {
    document.querySelectorAll('[data-close-panel]').forEach(el => {
      el.addEventListener('click', () => {
        const panel = el.closest('.panel');
        if (panel) closePanel(panel);
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.panel.panel--open').forEach(closePanel);
      }
    });
  }

  // ---------- Auth helpers ----------
  // Persistence is gated to signed-in users (Phase 3). Anonymous guests keep a
  // local-only shortlist; once signed in, these calls carry the auth token and
  // the server derives the owner from it. All sync is best-effort — a failure
  // never blocks the local UX.
  function isLoggedIn() {
    return Boolean(window.DayHopAuth && window.DayHopAuth.getUser && window.DayHopAuth.getUser());
  }

  function authHeaders(base) {
    const headers = Object.assign({}, base || {});
    const token = window.DayHopAuth && window.DayHopAuth.getToken && window.DayHopAuth.getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  // Returns a promise resolving to true on success, false on failure. It never
  // rejects, so existing fire-and-forget callers stay safe; the sign-in
  // migration awaits the result to detect partial failures.
  function serverShortlistAdd(idea) {
    if (!isLoggedIn()) return Promise.resolve(true);
    return fetch('/api/shortlist', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ idea })
    }).then(res => res.ok).catch(() => false);
  }

  function serverShortlistRemove(ideaId) {
    if (!isLoggedIn()) return;
    fetch(`/api/shortlist/${encodeURIComponent(ideaId)}`, {
      method: 'DELETE',
      headers: authHeaders()
    }).catch(() => {});
  }

  // ---------- API ----------
  async function apiGenerateIdeas(prompt, filter) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, filter, city: state.city, coords: state.coords || undefined })
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || 'Could not generate ideas');
      err.code = data.error;
      throw err;
    }
    return data; // { ideas, grounded, weather, generated_at }
  }

  async function apiBuildPlan(items) {
    const res = await fetch('/api/generate/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, city: state.city })
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || 'Could not build your day plan');
      err.code = data.error;
      throw err;
    }
    return data;
  }

  // ---------- Rendering ----------
  const SKELETON_COUNT = 8;

  // Layout-matching skeleton cards so the feed doesn't jump when ideas arrive.
  function renderSkeletons() {
    const feed = document.getElementById('discovery-feed');
    feed.innerHTML = '';
    for (let i = 0; i < SKELETON_COUNT; i++) {
      const sk = document.createElement('div');
      sk.className = 'idea-card idea-card--skeleton';
      sk.setAttribute('aria-hidden', 'true');
      sk.innerHTML = `
        <div class="skeleton skeleton-photo"></div>
        <div class="skeleton-body">
          <div class="skeleton skeleton-chip"></div>
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-line" style="width:96%"></div>
          <div class="skeleton skeleton-line" style="width:88%"></div>
          <div class="skeleton skeleton-line" style="width:54%"></div>
        </div>`;
      feed.appendChild(sk);
    }
  }

  function setLoading(isLoading) {
    state.isGenerating = isLoading;
    const feed = document.getElementById('discovery-feed');
    feed.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    const btn = document.getElementById('generate-btn');
    btn.classList.toggle('is-loading', isLoading);
    btn.disabled = isLoading;
    if (isLoading) {
      document.getElementById('empty-state').hidden = true;
      document.getElementById('noresults-state').hidden = true;
      renderSkeletons();
    }
    // When loading ends, renderFeed() repaints the feed and state messages.
  }

  function visibleIdeas() {
    return state.allIdeas.filter(idea => {
      if (state.dismissedIds.has(idea.id)) return false;
      if (state.shortlist.find(s => s.id === idea.id)) return false;
      if (state.currentFilter !== 'all' && idea.category !== state.currentFilter) return false;
      return true;
    });
  }

  function renderFeed(animate = false) {
    const feed = document.getElementById('discovery-feed');
    feed.innerHTML = '';
    const ideas = visibleIdeas();

    // Two sections when wow picks exist: the direct answers first, then the
    // "didn't know you could do that" stretch picks. STOP numbers continue
    // across sections so the trail metaphor stays intact.
    const onTarget = ideas.filter(i => !i.wow_reason);
    const beyond = ideas.filter(i => i.wow_reason);
    const showHeaders = onTarget.length > 0 && beyond.length > 0;
    let stopIndex = 0;

    const appendSection = (label, group) => {
      if (group.length === 0) return;
      if (showHeaders) {
        const header = document.createElement('h3');
        header.className = 'feed-section-header';
        header.textContent = label;
        feed.appendChild(header);
      }
      group.forEach(idea => {
        feed.appendChild(createIdeaCard(idea, stopIndex++, animate));
      });
    };

    appendSection('Right on target', onTarget);
    appendSection('Beyond what you asked ✨', beyond);

    const hasIdeas = state.allIdeas.length > 0;
    // Empty: nothing generated yet. No-results: ideas exist but the filter/swipes hid them all.
    document.getElementById('empty-state').hidden = state.isGenerating || hasIdeas;
    document.getElementById('noresults-state').hidden = state.isGenerating || !hasIdeas || ideas.length > 0;

    document.getElementById('idea-count').textContent = !hasIdeas
      ? 'Tell DayHop your plan to get started'
      : `${ideas.length} idea${ideas.length === 1 ? '' : 's'} · ${state.shortlist.length} on your shortlist`;

    renderCollections();
  }

  function createIdeaCard(idea, index, animate = false) {
    const card = document.createElement('article');
    card.className = 'idea-card';
    card.dataset.id = idea.id;
    card.style.setProperty('--stop-index', index);
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', idea.title);

    if (animate) {
      card.classList.add('is-entering');
      // Strip the class once it finishes so transform is free for swipe/dismiss.
      card.addEventListener('animationend', () => card.classList.remove('is-entering'), { once: true });
    }

    const categoryLabel = CATEGORY_LABELS[idea.category] || CATEGORY_LABELS.general;
    const stopNumber = String(index + 1).padStart(2, '0');

    card.innerHTML = `
      <div class="card-photo">
        <img src="${escapeAttr(idea.image_url || categoryImage(idea.category))}" alt="" loading="lazy" decoding="async">
        <span class="card-stamp">STOP ${stopNumber}</span>
        ${idea.wow_reason ? '<span class="card-badge card-badge--wow">✨ Unexpected find</span>' : ''}
        <span class="card-category">${categoryLabel}</span>
      </div>
      <div class="card-body">
        <h3>${escapeHtml(idea.title)}</h3>
        <p class="why">${escapeHtml(idea.why || '')}</p>
        ${idea.wow_reason ? `<p class="wow-line">✨ ${escapeHtml(idea.wow_reason)}</p>` : ''}
        <div class="card-meta">
          ${idea.location ? `<span>${escapeHtml(idea.location)}</span>` : ''}
          ${idea.duration_minutes ? `<span>${formatDuration(idea.duration_minutes)}</span>` : ''}
          ${idea.cost_tier ? `<span>${escapeHtml(idea.cost_tier)}</span>` : ''}
        </div>
        ${buildCardChips(idea)}
        ${idea.booking_url ? `<a class="card-booking-link" href="${escapeAttr(idea.booking_url)}" target="_blank" rel="noopener noreferrer sponsored">Book this on ${idea.source === 'viator' ? 'Viator' : 'GetYourGuide'} ↗</a>` : ''}
        ${!idea.booking_url && idea.maps_url ? `<a class="card-booking-link card-booking-link--secondary" href="${escapeAttr(idea.maps_url)}" target="_blank" rel="noopener noreferrer">View on Google Maps ↗</a>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn-dismiss" type="button" title="Not for us">✕ Skip</button>
        <button class="btn-detail" type="button" title="See details">Details</button>
        <button class="btn-add" type="button" title="Add to your day">Add to my day →</button>
      </div>
    `;

    // Broken partner image URLs fall back to the category stock photo.
    if (idea.image_url) {
      const img = card.querySelector('.card-photo img');
      img.addEventListener('error', () => { img.src = categoryImage(idea.category); }, { once: true });
    }

    card.querySelector('.btn-dismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      dismissIdea(idea, card);
    });
    card.querySelector('.btn-add').addEventListener('click', (e) => {
      e.stopPropagation();
      addToShortlist(idea, card);
    });
    card.querySelector('.btn-detail').addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(idea);
    });

    addSwipeListeners(card, idea);
    return card;
  }

  function formatDuration(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  // Secondary chip row: date, rating, price, provenance — kept apart from
  // the primary "Location · Time · Cost" meta line for cleaner scanning.
  function buildCardChips(idea) {
    const chips = [];
    if (idea.distance_km != null) chips.push(`<span class="card-chip card-chip--near">📍 ${escapeHtml(String(idea.distance_km))} km</span>`);
    if (idea.date) chips.push(`<span class="card-chip card-chip--date">📅 ${escapeHtml(formatEventDate(idea.date))}</span>`);
    if (idea.rating != null) chips.push(`<span class="card-chip">★ ${escapeHtml(String(idea.rating))}</span>`);
    if (idea.price_from != null) chips.push(`<span class="card-chip">from ${escapeHtml(String(idea.price_from))}${idea.currency ? ' ' + escapeHtml(idea.currency) : ''}</span>`);
    if (idea.cost_tier === 'free') chips.push('<span class="card-chip card-chip--free">Free</span>');
    if (idea.civic) chips.push('<span class="card-chip" title="From your city\'s official events feed">🏛 City event</span>');
    if (idea.also_from && idea.also_from.length) chips.push(`<span class="card-chip" title="Also listed by ${escapeAttr(idea.also_from.join(', '))}">+${idea.also_from.length} source${idea.also_from.length > 1 ? 's' : ''}</span>`);
    return chips.length ? `<div class="card-chips">${chips.join('')}</div>` : '';
  }

  // "2026-07-12" (or full ISO) → "Sun, Jul 12". Falls back to the raw string.
  function formatEventDate(dateStr) {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr + 'T12:00:00' : dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;');
  }

  // ---------- Swipe ----------
  function addSwipeListeners(card, idea) {
    let startX = 0;
    let currentDiff = 0;
    let dragging = false;

    function start(x) {
      startX = x;
      dragging = true;
      card.style.transition = 'none';
    }
    function move(x) {
      if (!dragging) return;
      currentDiff = x - startX;
      card.style.transform = `translateX(${currentDiff}px) rotate(${currentDiff / 24}deg)`;
      card.classList.toggle('swipe-keep', currentDiff > 60);
      card.classList.toggle('swipe-skip', currentDiff < -60);
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      card.style.transition = 'transform 0.3s ease';
      card.classList.remove('swipe-keep', 'swipe-skip');
      if (currentDiff > 90) addToShortlist(idea, card);
      else if (currentDiff < -90) dismissIdea(idea, card);
      else card.style.transform = '';
      currentDiff = 0;
    }

    card.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      start(e.touches[0].pageX);
    }, { passive: true });
    card.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      move(e.touches[0].pageX);
    }, { passive: true });
    card.addEventListener('touchend', end);

    card.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      start(e.pageX);
      const onMove = (ev) => move(ev.pageX);
      const onUp = () => {
        end();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ---------- Actions ----------
  function addToShortlist(idea, card) {
    if (state.shortlist.find(i => i.id === idea.id)) return;
    state.shortlist.push(idea);
    persist();
    serverShortlistAdd(idea);
    if (card) animateOut(card, 'right', () => renderFeed());
    updateShortlistCount();
    if (navigator.vibrate) navigator.vibrate(10);
    showToast(`Added "${idea.title}" to your day`, {
      duration: 4000,
      actionLabel: 'Undo',
      onAction: () => {
        state.shortlist = state.shortlist.filter(i => i.id !== idea.id);
        persist();
        serverShortlistRemove(idea.id);
        updateShortlistCount();
        renderFeed(true);
      }
    });
  }

  function dismissIdea(idea, card) {
    state.dismissedIds.add(idea.id);
    animateOut(card, 'left', () => renderFeed());
    showToast('Skipped', {
      duration: 4000,
      actionLabel: 'Undo',
      onAction: () => {
        state.dismissedIds.delete(idea.id);
        renderFeed(true);
      }
    });
  }

  function animateOut(card, direction, after) {
    const x = direction === 'right' ? '140%' : '-140%';
    card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    card.style.transform = `translateX(${x})`;
    card.style.opacity = '0';
    setTimeout(after, 280);
  }

  function updateShortlistCount() {
    const badge = document.getElementById('shortlist-count');
    if (badge.textContent !== String(state.shortlist.length)) {
      badge.classList.remove('count-pulse');
      void badge.offsetWidth; // restart the animation
      badge.classList.add('count-pulse');
    }
    badge.textContent = state.shortlist.length;
    document.getElementById('build-day-btn').disabled = state.shortlist.length === 0;
  }

  function openDetail(idea) {
    document.getElementById('detail-title').textContent = idea.title;
    const categoryLabel = CATEGORY_LABELS[idea.category] || CATEGORY_LABELS.general;
    document.getElementById('detail-content').innerHTML = `
      <div class="detail-photo">
        <img src="${escapeAttr(idea.image_url || categoryImage(idea.category))}" alt="" loading="lazy">
      </div>
      <span class="card-category">${categoryLabel}</span>
      <p class="detail-why">${escapeHtml(idea.why || '')}</p>
      ${idea.wow_reason ? `<p class="wow-line">✨ ${escapeHtml(idea.wow_reason)}</p>` : ''}
      <dl class="detail-grid">
        <dt>Location</dt><dd>${escapeHtml(idea.location || '—')}</dd>
        ${idea.distance_km != null ? `<dt>Distance</dt><dd>📍 ${escapeHtml(String(idea.distance_km))} km from you</dd>` : ''}
        ${idea.venue ? `<dt>Venue</dt><dd>${escapeHtml(idea.venue)}</dd>` : ''}
        ${idea.date ? `<dt>Date</dt><dd>${escapeHtml(formatEventDate(idea.date))}</dd>` : ''}
        <dt>Good for</dt><dd>${escapeHtml(idea.good_for_ages || 'all ages')}</dd>
        <dt>Duration</dt><dd>${idea.duration_minutes ? formatDuration(idea.duration_minutes) : '—'}</dd>
        <dt>Cost</dt><dd>${escapeHtml(idea.cost_tier || '—')}${idea.price_from != null ? ` · from ${escapeHtml(String(idea.price_from))}${idea.currency ? ' ' + escapeHtml(idea.currency) : ''}` : ''}</dd>
        ${idea.rating != null ? `<dt>Rating</dt><dd>★ ${escapeHtml(String(idea.rating))}</dd>` : ''}
      </dl>
      <div class="detail-links">
        ${idea.booking_url ? `<a class="card-booking-link" href="${escapeAttr(idea.booking_url)}" target="_blank" rel="noopener noreferrer sponsored">Book this on ${idea.source === 'viator' ? 'Viator' : 'GetYourGuide'} ↗</a>` : ''}
        ${idea.maps_url ? `<a class="card-booking-link card-booking-link--secondary" href="${escapeAttr(idea.maps_url)}" target="_blank" rel="noopener noreferrer">View on Google Maps ↗</a>` : ''}
      </div>
    `;
    openPanel('detail-panel');
  }

  // ---------- Shortlist panel ----------
  function shortlistSummary() {
    const items = state.shortlist;
    const bits = [`${items.length} experience${items.length === 1 ? '' : 's'}`];

    const totalMin = items.reduce((sum, i) => sum + (Number(i.duration_minutes) || 0), 0);
    if (totalMin > 0) bits.push(`~${formatDuration(totalMin)}`);

    // Most common town = last comma-separated part of each idea's location.
    const townCounts = new Map();
    for (const i of items) {
      const parts = String(i.location || '').split(',').map(s => s.trim()).filter(Boolean);
      const town = parts[parts.length - 1];
      if (town) townCounts.set(town, (townCounts.get(town) || 0) + 1);
    }
    const top = [...townCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 1) bits.push(`mostly ${top[0]}`);

    return bits.join(' • ');
  }

  function moveShortlistItem(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.shortlist.length) return;
    const [item] = state.shortlist.splice(index, 1);
    state.shortlist.splice(target, 0, item);
    persist();
    renderShortlistPanel();
  }

  function renderShortlistPanel() {
    const container = document.getElementById('shortlist-items');
    const empty = document.getElementById('shortlist-empty');
    const summary = document.getElementById('shortlist-summary');
    container.innerHTML = '';

    if (state.shortlist.length === 0) {
      empty.hidden = false;
      if (summary) summary.hidden = true;
      return;
    }
    empty.hidden = true;
    if (summary) {
      summary.textContent = shortlistSummary();
      summary.hidden = false;
    }

    state.shortlist.forEach((idea, index) => {
      const row = document.createElement('div');
      row.className = 'shortlist-row';
      row.innerHTML = `
        <div class="shortlist-order">
          <button class="btn-move" type="button" data-dir="-1" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn-move" type="button" data-dir="1" aria-label="Move down" ${index === state.shortlist.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <div class="shortlist-row-text">
          <strong>${escapeHtml(idea.title)}</strong>
          <span class="shortlist-row-meta">${escapeHtml(idea.location || '')}</span>
        </div>
        <button class="btn-remove" type="button" aria-label="Remove from shortlist">✕</button>
      `;
      row.querySelectorAll('.btn-move').forEach(btn => {
        btn.addEventListener('click', () => moveShortlistItem(index, Number(btn.dataset.dir)));
      });
      row.querySelector('.btn-remove').addEventListener('click', () => {
        state.shortlist = state.shortlist.filter(i => i.id !== idea.id);
        persist();
        serverShortlistRemove(idea.id);
        updateShortlistCount();
        renderShortlistPanel();
        renderFeed();
      });
      container.appendChild(row);
    });
  }

  // "Surprise me": pull one idea the user hasn't acted on into their day —
  // wow picks first, so the surprise actually surprises.
  function handleSurpriseMe() {
    const pool = ideasInPlay();
    if (pool.length === 0) {
      showToast('No more ideas to surprise you with — generate a new day!');
      return;
    }
    const wows = pool.filter(i => i.wow_reason || i.wow);
    const pickFrom = wows.length ? wows : pool;
    const idea = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    addToShortlist(idea, null);
    renderShortlistPanel();
    renderFeed(true);
  }

  async function handleBuildDay() {
    if (state.isBuildingPlan || state.shortlist.length === 0) return;
    state.isBuildingPlan = true;
    const btn = document.getElementById('build-day-btn');
    btn.classList.add('is-loading');
    btn.disabled = true;

    try {
      const plan = await apiBuildPlan(state.shortlist);
      renderDayPlan(plan);
      closePanel(document.getElementById('shortlist-panel'));
      openPanel('dayplan-panel');

      // Persist the built plan server-side for signed-in users (best-effort).
      if (isLoggedIn()) {
        fetch('/api/adventures', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ plan })
        }).catch(() => {});
      }
    } catch (err) {
      showToast(err.message || 'Could not build your day plan. Try again.', { duration: 3500 });
    } finally {
      state.isBuildingPlan = false;
      btn.classList.remove('is-loading');
      btn.disabled = state.shortlist.length === 0;
    }
  }

  function renderDayPlan(plan) {
    const content = document.getElementById('dayplan-content');
    const stopsHtml = (plan.stops || []).map((stop, i) => `
      <div class="plan-stop">
        <div class="plan-stop-marker">${String(i + 1).padStart(2, '0')}</div>
        <div class="plan-stop-body">
          <span class="plan-stop-time">${escapeHtml(stop.suggested_time || '')}</span>
          <h3>${escapeHtml(stop.title || '')}</h3>
          ${stop.transition_note ? `<p class="plan-transition">${escapeHtml(stop.transition_note)}</p>` : ''}
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <p class="plan-start">Starts around <strong>${escapeHtml(plan.start_time || '')}</strong></p>
      <div class="plan-stops">${stopsHtml}</div>
      ${plan.notes ? `<div class="plan-notes">💬 ${escapeHtml(plan.notes)}</div>` : ''}
    `;
    document.getElementById('dayplan-title').textContent = plan.plan_title || 'Your day, mapped out';
  }

  // ---------- Generate flow ----------
  async function handleGenerate(e) {
    e.preventDefault();
    if (state.isGenerating) return;

    const textarea = document.getElementById('grok-prompt');
    const prompt = textarea.value.trim();
    const errorEl = document.getElementById('prompt-error');
    errorEl.textContent = '';

    // Location first — never search location-less.
    if (!state.locationChosen) {
      errorEl.textContent = 'First pick where 📍 — use your location, or type a city or postal code.';
      const whereEl = document.getElementById('prompt-location');
      if (whereEl) {
        whereEl.classList.remove('prompt-location--error');
        void whereEl.offsetWidth; // restart the shake
        whereEl.classList.add('prompt-location--error');
        setTimeout(() => whereEl.classList.remove('prompt-location--error'), 1200);
      }
      combo.input.focus();
      openLocationList('');
      return;
    }

    if (!prompt) {
      errorEl.textContent = 'Tell DayHop what kind of day you want first.';
      textarea.focus();
      return;
    }

    setLoading(true);
    try {
      const data = await apiGenerateIdeas(prompt, state.currentFilter);
      state.allIdeas = data.ideas || [];
      state.dismissedIds = new Set();
      state.lastPrompt = prompt;
      state.lastWeather = data.weather || null;
      renderWeatherStrip(data.weather);
      renderResultsHeader();
      renderFeed(true);
      document.getElementById('results-header').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong. Please try again.';
      showToast(err.message || 'Could not generate ideas right now.', { duration: 3500 });
    } finally {
      setLoading(false);
    }
  }

  // ---------- Results header + curated collections ----------
  const COLLECTION_TITLES = {
    worldcup: 'World Cup watch parties near you',
    patios: 'Lively patios & rooftops',
    kids: 'Kid-friendly favourites',
    water: 'Beaches, pools & splash pads',
    food: 'Good eats nearby',
    culture: 'Culture & hidden gems',
    adventures: 'Big experiences',
    cruises: 'On the water',
    general: 'Local favourites'
  };

  function renderResultsHeader() {
    const header = document.getElementById('results-header');
    if (!state.allIdeas.length) {
      header.hidden = true;
      return;
    }
    const words = (state.lastPrompt || '').split(/\s+/).filter(Boolean);
    const snippet = words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '');
    document.getElementById('results-headline').textContent = snippet
      ? `Here's what matches "${snippet}"`
      : "Here's what matches your plan";

    const where = state.coords && state.locationLabel ? `near ${state.locationLabel}` : state.city;
    const bits = [`${state.allIdeas.length} ideas`, `Personalized for ${where}`];
    if (state.lastWeather) {
      bits.push(`Adjusted for ${state.lastWeather.temp_c}°C, ${state.lastWeather.description}`);
    }
    document.getElementById('results-sub').textContent = bits.join(' • ');
    header.hidden = false;
  }

  // Ideas that are still in play (not swiped away, not already saved),
  // ignoring the active category filter — used by collections & surprise-me.
  function ideasInPlay() {
    return state.allIdeas.filter(idea =>
      !state.dismissedIds.has(idea.id) &&
      !state.shortlist.find(s => s.id === idea.id));
  }

  function setFilter(category) {
    state.currentFilter = category;
    document.querySelectorAll('.filter-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.filter === category));
    renderFeed(true);
  }

  function renderCollections() {
    const el = document.getElementById('collections');
    const pool = ideasInPlay();
    // Collections are shortcuts into the unfiltered feed — hide them while a
    // filter is active or before/without enough results to group.
    if (state.currentFilter !== 'all' || pool.length === 0) {
      el.hidden = true;
      return;
    }

    const byCategory = new Map();
    for (const idea of pool) {
      const cat = idea.category || 'general';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(idea);
    }
    const groups = [...byCategory.entries()]
      .filter(([, ideas]) => ideas.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 4);

    if (groups.length < 2) { // one big group = the feed itself, nothing to curate
      el.hidden = true;
      return;
    }

    el.innerHTML = '';
    for (const [category, ideas] of groups) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'collection-card';
      const thumbs = ideas.slice(0, 3).map(i =>
        `<img src="${escapeAttr(i.image_url || categoryImage(i.category, 200))}" alt="" loading="lazy">`).join('');
      card.innerHTML = `
        <span class="collection-thumbs">${thumbs}</span>
        <span class="collection-text">
          <strong>${escapeHtml(COLLECTION_TITLES[category] || CATEGORY_LABELS[category] || category)}</strong>
          <span>${ideas.length} idea${ideas.length === 1 ? '' : 's'}</span>
        </span>`;
      card.addEventListener('click', () => {
        setFilter(category);
        document.getElementById('discovery-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      el.appendChild(card);
    }
    el.hidden = false;
  }

  function renderWeatherStrip(weather) {
    const el = document.getElementById('weather-strip');
    if (!el) return;
    if (!weather) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = `${weatherEmoji(weather.condition)} ${weather.temp_c}°C, ${weather.description} — ideas adjusted for current conditions`;
  }

  function weatherEmoji(condition) {
    const map = { Rain: '🌧️', Drizzle: '🌦️', Thunderstorm: '⛈️', Snow: '❄️', Clear: '☀️', Clouds: '☁️' };
    return map[condition] || '🌤️';
  }

  // ---------- Auth state ----------
  async function handleAuthChange(detail) {
    const wasLoggedIn = Boolean(state.user);
    state.user = detail && detail.user ? detail.user : null;
    if (state.user) {
      await onSignedIn();
    } else if (wasLoggedIn) {
      onSignedOut();
    }
  }

  // On sign-in: one-time migration of the guest's local shortlist into the
  // account, then the server becomes the source of truth (cross-device).
  async function onSignedIn() {
    try {
      const migratedKey = 'dayhop_migrated_' + state.user.id;
      if (!localStorage.getItem(migratedKey) && state.shortlist.length) {
        // Upload every local item in parallel; only mark migration complete if
        // ALL succeeded, otherwise leave the key unset so the next sign-in retries.
        const results = await Promise.all(state.shortlist.map(serverShortlistAdd));
        if (results.every(Boolean)) {
          localStorage.setItem(migratedKey, '1');
          showToast('Saved your shortlist to your account');
        } else {
          console.warn('[shortlist] migration incomplete (' +
            results.filter(ok => !ok).length + ' item(s) failed); will retry on next sign-in.');
        }
      }

      const res = await fetch('/api/shortlist', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const serverItems = (data.items || []).map(i => i.idea);
        // Merge local + server (union by idea id, server wins on conflict) so we
        // never drop items — whether a migration upload failed (FIX 3) or items
        // were added during a later signed-out session (FIX 4).
        const byId = new Map();
        for (const idea of state.shortlist) if (idea && idea.id != null) byId.set(String(idea.id), idea);
        for (const idea of serverItems) if (idea && idea.id != null) byId.set(String(idea.id), idea);
        state.shortlist = [...byId.values()];
        persist();
      }
    } catch (e) {
      // Network/DB hiccup — keep the local shortlist; never block the UI.
    }
    updateShortlistCount();
    renderShortlistPanel();
    renderFeed();
  }

  // On sign-out: clear the local shortlist so one account's data doesn't leak
  // into the next anonymous session on a shared device.
  function onSignedOut() {
    state.shortlist = [];
    persist();
    updateShortlistCount();
    renderShortlistPanel();
    renderFeed();
    showToast('Signed out');
  }

  // ---------- Init ----------
  function init() {
    loadPersisted();
    setupLocationCombo();
    updateWhereEmphasis();
    updateShortlistCount();
    wirePanelClosers();

    // React to auth (auth.js dispatches on initial session + every change).
    document.addEventListener('dayhop:auth', (e) => handleAuthChange(e.detail));
    if (window.DayHopAuth && window.DayHopAuth.current) {
      const cur = window.DayHopAuth.current();
      if (cur && cur.user) handleAuthChange(cur);
    }

    document.getElementById('prompt-form').addEventListener('submit', handleGenerate);

    // Onboarding — tapping an example prompt fills the box and generates instantly.
    document.querySelectorAll('.example-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const textarea = document.getElementById('grok-prompt');
        textarea.value = chip.dataset.prompt || '';
        document.getElementById('prompt-form').requestSubmit();
      });
    });

    // No-results: clear the active filter and show everything again.
    document.getElementById('reset-filter-btn').addEventListener('click', () => setFilter('all'));

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => setFilter(chip.dataset.filter));
    });

    document.getElementById('shortlist-btn').addEventListener('click', () => {
      renderShortlistPanel();
      openPanel('shortlist-panel');
    });

    document.getElementById('build-day-btn').addEventListener('click', handleBuildDay);
    document.getElementById('surprise-me-btn').addEventListener('click', handleSurpriseMe);

    renderFeed();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
