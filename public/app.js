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

  function getOwnerId() {
    let id = localStorage.getItem('dayhop_owner_id');
    if (!id) {
      id = 'guest-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('dayhop_owner_id', id);
    }
    return id;
  }

  // ---------- Location picker ----------
  function populateLocations() {
    const sel = document.getElementById('location-select');
    if (!sel) return;
    sel.appendChild(new Option(GTA_WIDE, GTA_WIDE));
    GTA_LOCATIONS.forEach(group => {
      const og = document.createElement('optgroup');
      og.label = group.region;
      group.cities.forEach(city => og.appendChild(new Option(city, city)));
      sel.appendChild(og);
    });
    sel.value = state.city;
    if (sel.value !== state.city) {
      // Saved city no longer in list — fall back to GTA-wide.
      state.city = GTA_WIDE;
      sel.value = GTA_WIDE;
    }
    updateLocationTag();
    sel.addEventListener('change', () => {
      state.city = sel.value;
      persist();
      updateLocationTag();
    });
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
  function setLoading(isLoading) {
    state.isGenerating = isLoading;
    document.getElementById('loading-state').hidden = !isLoading;
    document.getElementById('empty-state').hidden = isLoading || state.allIdeas.length > 0;
    document.getElementById('generate-btn').classList.toggle('is-loading', isLoading);
    document.getElementById('generate-btn').disabled = isLoading;
  }

  function visibleIdeas() {
    return state.allIdeas.filter(idea => {
      if (state.dismissedIds.has(idea.id)) return false;
      if (state.shortlist.find(s => s.id === idea.id)) return false;
      if (state.currentFilter !== 'all' && idea.category !== state.currentFilter) return false;
      return true;
    });
  }

  function renderFeed() {
    const feed = document.getElementById('discovery-feed');
    feed.innerHTML = '';
    const ideas = visibleIdeas();

    ideas.forEach((idea, index) => {
      feed.appendChild(createIdeaCard(idea, index));
    });

    document.getElementById('empty-state').hidden = state.isGenerating || state.allIdeas.length > 0;
    const totalAvailable = state.allIdeas.length;
    document.getElementById('idea-count').textContent = totalAvailable === 0
      ? 'Tell DayHop your plan to get started'
      : `${ideas.length} idea${ideas.length === 1 ? '' : 's'} · ${state.shortlist.length} on your shortlist`;
  }

  function createIdeaCard(idea, index) {
    const card = document.createElement('article');
    card.className = 'idea-card';
    card.dataset.id = idea.id;
    card.style.setProperty('--stop-index', index);
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', idea.title);

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

      // Persist as an "adventure" server-side too, best-effort.
      fetch('/api/adventures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: getOwnerId(), plan })
      }).catch(() => {});
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
      renderFeed();
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

  // ---------- Init ----------
  function init() {
    loadPersisted();
    populateLocations();
    updateShortlistCount();
    wirePanelClosers();

    document.getElementById('prompt-form').addEventListener('submit', handleGenerate);

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.currentFilter = chip.dataset.filter;
        renderFeed();
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
