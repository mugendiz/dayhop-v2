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
    isBuildingPlan: false
  };

  // ---------- Persistence (survive refresh) ----------
  const STORAGE_KEY = 'dayhop_state_v2';

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      state.shortlist = saved.shortlist || [];
      if (saved.city) state.city = saved.city;
    } catch (e) {
      console.warn('Could not load saved DayHop state', e);
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ shortlist: state.shortlist, city: state.city }));
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

  const combo = { input: null, listbox: null, activeIndex: -1, filtered: [], debounce: null };

  function setupLocationCombo() {
    const input = document.getElementById('location-input');
    const listbox = document.getElementById('location-listbox');
    if (!input || !listbox) return;

    // Validate any persisted city still exists; otherwise fall back to GTA-wide.
    if (!LOCATION_OPTIONS.some(o => o.city === state.city)) state.city = GTA_WIDE;

    combo.input = input;
    combo.listbox = listbox;
    input.value = state.city;
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
    const q = (query || '').trim().toLowerCase();
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
    if (!combo.filtered.length) {
      lb.innerHTML = '<li class="location-option location-option--empty">No GTA match — try “Toronto” or “Markham”, or clear to plan across the GTA.</li>';
      return;
    }
    lb.innerHTML = combo.filtered.map((o, i) => `
      <li id="loc-opt-${i}" class="location-option" role="option"
          data-city="${escapeAttr(o.city)}" aria-selected="${o.city === state.city}">
        <span class="opt-city">${highlight(o.city, q)}</span>
        ${o.region ? `<span class="opt-region">${escapeHtml(o.region)}</span>` : ''}
      </li>`).join('');

    lb.querySelectorAll('.location-option[data-city]').forEach(li => {
      li.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus so blur doesn't pre-empt the select
        selectLocation(li.dataset.city);
      });
    });
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
    const items = combo.listbox.querySelectorAll('.location-option[data-city]');
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
      if (open && combo.activeIndex >= 0) {
        e.preventDefault();
        const opt = combo.filtered[combo.activeIndex];
        if (opt) selectLocation(opt.city);
      }
    } else if (e.key === 'Escape') {
      if (open) { e.stopPropagation(); closeLocationList(); }
    }
  }

  function selectLocation(city) {
    state.city = city;
    combo.input.value = city;
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
    // Commit: free-typed text that isn't a real option reverts to the current city.
    if (combo.input.value.trim() !== state.city) combo.input.value = state.city;
  }

  function updateLocationTag() {
    const tag = document.getElementById('location-tag');
    if (tag) tag.textContent = state.city === GTA_WIDE ? 'Greater Toronto Area' : state.city;
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(message, { duration = 2600 } = {}) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('toast--visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('toast--visible');
      setTimeout(() => { el.hidden = true; }, 200);
    }, duration);
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

  function serverShortlistAdd(idea) {
    if (!isLoggedIn()) return;
    fetch('/api/shortlist', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ idea })
    }).catch(() => {});
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
      body: JSON.stringify({ prompt, filter, city: state.city })
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
  const SKELETON_COUNT = 4;

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

    ideas.forEach((idea, index) => {
      feed.appendChild(createIdeaCard(idea, index, animate));
    });

    const hasIdeas = state.allIdeas.length > 0;
    // Empty: nothing generated yet. No-results: ideas exist but the filter/swipes hid them all.
    document.getElementById('empty-state').hidden = state.isGenerating || hasIdeas;
    document.getElementById('noresults-state').hidden = state.isGenerating || !hasIdeas || ideas.length > 0;

    document.getElementById('idea-count').textContent = !hasIdeas
      ? 'Tell DayHop your plan to get started'
      : `${ideas.length} idea${ideas.length === 1 ? '' : 's'} · ${state.shortlist.length} on your shortlist`;
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
        <img src="${categoryImage(idea.category)}" alt="" loading="lazy" decoding="async">
        <span class="card-stamp">STOP ${stopNumber}</span>
        <span class="card-category">${categoryLabel}</span>
      </div>
      <div class="card-body">
        <h3>${escapeHtml(idea.title)}</h3>
        <p class="why">${escapeHtml(idea.why || '')}</p>
        <div class="card-meta">
          <span>${escapeHtml(idea.location || '')}</span>
          ${idea.duration_minutes ? `<span>${formatDuration(idea.duration_minutes)}</span>` : ''}
          ${idea.cost_tier ? `<span>${escapeHtml(idea.cost_tier)}</span>` : ''}
          ${idea.rating != null ? `<span>★ ${escapeHtml(String(idea.rating))}</span>` : ''}
          ${idea.price_from != null ? `<span>from ${escapeHtml(String(idea.price_from))}${idea.currency ? ' ' + escapeHtml(idea.currency) : ''}</span>` : ''}
        </div>
        ${idea.booking_url ? `<a class="card-booking-link" href="${escapeAttr(idea.booking_url)}" target="_blank" rel="noopener noreferrer sponsored">Book this on ${idea.source === 'viator' ? 'Viator' : 'GetYourGuide'} ↗</a>` : ''}
        ${!idea.booking_url && idea.maps_url ? `<a class="card-booking-link card-booking-link--secondary" href="${escapeAttr(idea.maps_url)}" target="_blank" rel="noopener noreferrer">View on Google Maps ↗</a>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn-dismiss" type="button" title="Not for us">✕ Skip</button>
        <button class="btn-detail" type="button" title="See details">Details</button>
        <button class="btn-add" type="button" title="Add to shortlist">Add to plan →</button>
      </div>
    `;

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
    animateOut(card, 'right', () => renderFeed());
    updateShortlistCount();
    showToast(`Added "${idea.title}" to your shortlist`);
  }

  function dismissIdea(idea, card) {
    state.dismissedIds.add(idea.id);
    animateOut(card, 'left', () => renderFeed());
  }

  function animateOut(card, direction, after) {
    const x = direction === 'right' ? '140%' : '-140%';
    card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    card.style.transform = `translateX(${x})`;
    card.style.opacity = '0';
    setTimeout(after, 280);
  }

  function updateShortlistCount() {
    document.getElementById('shortlist-count').textContent = state.shortlist.length;
    document.getElementById('build-day-btn').disabled = state.shortlist.length === 0;
  }

  function openDetail(idea) {
    document.getElementById('detail-title').textContent = idea.title;
    const categoryLabel = CATEGORY_LABELS[idea.category] || CATEGORY_LABELS.general;
    document.getElementById('detail-content').innerHTML = `
      <span class="card-category">${categoryLabel}</span>
      <p class="detail-why">${escapeHtml(idea.why || '')}</p>
      <dl class="detail-grid">
        <dt>Location</dt><dd>${escapeHtml(idea.location || '—')}</dd>
        <dt>Good for</dt><dd>${escapeHtml(idea.good_for_ages || 'all ages')}</dd>
        <dt>Duration</dt><dd>${idea.duration_minutes ? formatDuration(idea.duration_minutes) : '—'}</dd>
        <dt>Cost</dt><dd>${escapeHtml(idea.cost_tier || '—')}</dd>
      </dl>
    `;
    openPanel('detail-panel');
  }

  // ---------- Shortlist panel ----------
  function renderShortlistPanel() {
    const container = document.getElementById('shortlist-items');
    const empty = document.getElementById('shortlist-empty');
    container.innerHTML = '';

    if (state.shortlist.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    state.shortlist.forEach(idea => {
      const row = document.createElement('div');
      row.className = 'shortlist-row';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(idea.title)}</strong>
          <span class="shortlist-row-meta">${escapeHtml(idea.location || '')}</span>
        </div>
        <button class="btn-remove" type="button" aria-label="Remove from shortlist">✕</button>
      `;
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
      renderWeatherStrip(data.weather);
      renderFeed(true);
      document.getElementById('discovery-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong. Please try again.';
      showToast(err.message || 'Could not generate ideas right now.', { duration: 3500 });
    } finally {
      setLoading(false);
    }
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
        for (const idea of state.shortlist) {
          await fetch('/api/shortlist', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ idea })
          }).catch(() => {});
        }
        showToast('Saved your shortlist to your account');
      }
      localStorage.setItem(migratedKey, '1');

      const res = await fetch('/api/shortlist', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        state.shortlist = (data.items || []).map(i => i.idea);
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
    document.getElementById('reset-filter-btn').addEventListener('click', () => {
      state.currentFilter = 'all';
      document.querySelectorAll('.filter-chip').forEach(c =>
        c.classList.toggle('active', c.dataset.filter === 'all'));
      renderFeed(true);
    });

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.currentFilter = chip.dataset.filter;
        renderFeed(true);
      });
    });

    document.getElementById('shortlist-btn').addEventListener('click', () => {
      renderShortlistPanel();
      openPanel('shortlist-panel');
    });

    document.getElementById('build-day-btn').addEventListener('click', handleBuildDay);

    renderFeed();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
