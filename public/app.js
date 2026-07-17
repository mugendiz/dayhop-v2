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

  // ---------- Modes: R&R vs Adventure ----------
  // Two equal product personalities. The active mode shapes the browse feed,
  // search results, AI plans (server-side via the `mode` param), and the
  // client chrome below: filter chips, example prompts, placeholder, accent.
  const MODES = {
    rr: {
      hint: '🌿 Restorative days — gardens, trails, lookouts, calm water',
      feedTitle: "Today's calm escapes 🌿",
      placeholder: '3 unhurried hours near the water — a quiet garden, a scenic lookout, and somewhere relaxed to eat after.',
      switchToast: '🌿 R&R Mode on — new searches and plans will lean restful',
      filters: [
        { filter: 'all', label: 'All' },
        { filter: 'water', label: '🏖️ Calm Water' },
        { filter: 'culture', label: '🏛️ Culture' },
        { filter: 'kids', label: '👶 Family' },
        { filter: 'patios', label: '🍻 Patios' },
        { filter: 'food', label: '🍽️ Food' },
        { filter: 'cruises', label: '⛴️ Cruises' },
        { filter: 'worldcup', label: '⚽ World Cup' }
      ],
      examples: [
        { label: '🌿 Slow morning in nature', prompt: 'A slow, restorative morning — a peaceful garden or quiet trail, a scenic lookout, and a calm café to end at.' },
        { label: '🌧️ Rainy day with little kids', prompt: 'A rainy Saturday with two kids under 6 — somewhere calm indoors to unwind, then an easy lunch nearby.' },
        { label: '🏖️ Afternoon by the water', prompt: '3 relaxed hours near the water with my 4-year-old — a splash pad and somewhere easy to eat after.' }
      ]
    },
    adventure: {
      hint: '⛰️ Active days — ziplines, climbing, paddling, big thrills',
      feedTitle: "Today's thrills ⚡",
      placeholder: 'A full-throttle Saturday — ziplining or climbing in the morning, kayaking after lunch, go-karts to finish.',
      switchToast: '⚡ Adventure Mode on — new searches and plans will lean thrilling',
      filters: [
        { filter: 'all', label: 'All' },
        { filter: 'adventures', label: '🚁 Big Experiences' },
        { filter: 'water', label: '🌊 Water Action' },
        { filter: 'cruises', label: '⛴️ On the Water' },
        { filter: 'kids', label: '👶 Family Thrills' },
        { filter: 'worldcup', label: '⚽ World Cup' },
        { filter: 'food', label: '🍽️ Refuel' }
      ],
      examples: [
        { label: '🧗 Adrenaline day for two', prompt: 'An adrenaline-filled day for two adults — ziplining or treetop trekking, rock climbing, then a well-earned dinner.' },
        { label: '🚣 Paddle & pedal', prompt: 'An active day outdoors — kayaking or paddleboarding in the morning, then a mountain bike trail after lunch.' },
        { label: '🏎️ Thrills with teens', prompt: 'A high-energy day with two teenagers — go-karts, a climbing gym or trampoline park, and pizza after.' }
      ]
    }
  };

  // FIFA World Cup 2026 wraps with the July 19 final — after that, the
  // branding sweeps itself to summer (eyebrow + filter chips) so the site
  // never looks stale while nobody is watching.
  const WORLD_CUP_ENDS = Date.parse('2026-07-20T08:00:00Z');
  const worldCupLive = () => Date.now() < WORLD_CUP_ENDS;

  // GTA coverage — "Across the GTA" is the default, then grouped by region.
  const GTA_WIDE = 'Across the GTA';
  const GTA_LOCATIONS = [
    { region: 'Toronto', cities: ['Toronto (Downtown)', 'North York', 'Scarborough', 'Etobicoke', 'East York'] },
    { region: 'York Region', cities: ['Richmond Hill', 'Markham', 'Vaughan', 'Newmarket', 'Aurora', 'King City', 'Stouffville'] },
    { region: 'Peel', cities: ['Mississauga', 'Brampton', 'Caledon'] },
    { region: 'Halton', cities: ['Oakville', 'Burlington', 'Milton', 'Halton Hills'] },
    { region: 'Durham', cities: ['Pickering', 'Ajax', 'Whitby', 'Oshawa'] }
  ];

  // ---------- Sample plan (zero-state payoff) ----------
  // Hand-built from real Toronto places so a first-time visitor sees a full
  // finished plan in one tap — before typing anything or waiting on the AI.
  // Shaped exactly like a guide, so the normal plan panel (and even smart
  // re-planning) works on it unchanged.
  const SAMPLE_GUIDE = {
    title: '☀️ A perfect Saturday in Leslieville',
    city: 'Toronto (Downtown)',
    start_time: '9:30 AM',
    notes: 'This is a sample of what DayHop builds. Describe your own day above and it plans around live weather, real venues, and exactly what you feel like doing.',
    stops: [
      {
        title: 'Breakfast at Bonjour Brioche',
        suggested_time: '9:30 AM – 10:45 AM',
        transition_note: '15 min drive (or a scenic ride down Leslie St) to the park gates',
        note: '',
        idea: {
          id: 'sample-brioche',
          title: 'Bonjour Brioche',
          location: 'Queen St E, Riverside',
          why: 'A neighbourhood-institution French bakery — croissants worth the weekend line, and the people-watching on Queen East is free.',
          duration_minutes: 75,
          cost_tier: '$$',
          category: 'food',
          image_url: categoryImage('food'),
          maps_url: 'https://maps.google.com/?q=Bonjour+Brioche,+Toronto'
        }
      },
      {
        title: 'Walk the spit at Tommy Thompson Park',
        suggested_time: '11:00 AM – 1:00 PM',
        transition_note: '10 min back up to Queen East for lunch',
        note: '',
        idea: {
          id: 'sample-tommy-thompson',
          title: 'Tommy Thompson Park',
          location: 'Leslie Street Spit, Toronto',
          why: 'A car-free peninsula jutting 5 km into Lake Ontario — skyline views, cottonwood trails, and more birds than people.',
          duration_minutes: 120,
          cost_tier: 'Free',
          category: 'general',
          image_url: categoryImage('general'),
          maps_url: 'https://maps.google.com/?q=Tommy+Thompson+Park,+Toronto'
        }
      },
      {
        title: 'Patio lunch & indie shops on Queen',
        suggested_time: '1:30 PM – 3:00 PM',
        transition_note: '8 min south to the beach for golden hour',
        note: '',
        idea: {
          id: 'sample-leslieville-lunch',
          title: 'Leslieville patios & shops',
          location: 'Queen St E, Leslieville',
          why: 'Pick any patio that catches your eye, then wander the record shops, vintage stores, and bakeries between Logan and Greenwood.',
          duration_minutes: 90,
          cost_tier: '$$',
          category: 'patios',
          image_url: categoryImage('patios'),
          maps_url: 'https://maps.google.com/?q=Queen+St+E+%26+Logan+Ave,+Toronto'
        }
      },
      {
        title: 'Golden hour at Cherry Beach',
        suggested_time: '3:30 PM – 5:30 PM',
        transition_note: '',
        note: '',
        idea: {
          id: 'sample-cherry-beach',
          title: 'Cherry Beach',
          location: 'Unwin Ave, Port Lands',
          why: 'A locals\' beach with real sand, calm water, and shady trees — the unhurried way to close out a Saturday.',
          duration_minutes: 120,
          cost_tier: 'Free',
          category: 'water',
          image_url: categoryImage('water'),
          maps_url: 'https://maps.google.com/?q=Cherry+Beach,+Toronto'
        }
      }
    ]
  };

  const state = {
    mode: 'rr',          // 'rr' (default) | 'adventure' — see MODES
    allIdeas: [],
    shortlist: [],
    dismissedIds: new Set(),
    currentFilter: 'all',
    city: 'Richmond Hill',
    user: null,
    isGenerating: false,
    isBuildingPlan: false,
    lastPlan: null,          // last itinerary skeleton built from the shortlist
    savedGuide: null,        // server-saved copy of currentGuide ({ share_url, guide, … })
    currentGuide: null,      // the guide being viewed/edited in the plan panel (self-contained)
    currentGuideId: null,    // server id when currentGuide is a saved guide
    editMode: false,         // plan panel edit mode (anyone can edit; saving edits is Pro)
    planDays: 1,             // trip length selector (2-3 days = Pro)
    lastChangeSummary: null, // bullets from the last smart re-plan
    isReplanning: false,
    myGuides: [],            // "My Plans" list from GET /api/guides
    billingConfigured: false,
    isPro: false,
    entitlements: null,      // limits from /api/billing/status (free vs pro)
    lastPrompt: '',
    lastWeather: null,
    lastAdvisories: [],          // active advisories for the current area
    lastAdvisoriesStatus: null,  // 'ok' | 'partial' | 'unavailable'
    coords: null,        // { lat, lng } rounded to ~110 m, only if user opted in
    coordsAt: 0,
    locationLabel: null, // e.g. "Richmond Hill · L4C"
    locationChosen: false, // user must explicitly pick a location before searching
    browseMode: false    // feed is showing the instant discovery feed, not prompt results
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
      // Remember the last used mode across visits (first launch = R&R).
      if (MODES[saved.mode]) state.mode = saved.mode;
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
        mode: state.mode,
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

  // ---------- Mode toggle behavior ----------
  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setMode(mode) {
    if (!MODES[mode] || mode === state.mode) return;
    state.mode = mode;
    persist();
    track('mode_switch', { id: mode, source: mode });
    if (navigator.vibrate) navigator.vibrate(8);

    const applyAll = () => {
      applyModeUi();
      // The chip set changes with the mode, so an active filter no longer
      // means anything — reset quietly.
      state.currentFilter = 'all';
      renderFilterChips();
      refreshFeedForMode();
    };

    // View Transitions API: the whole page cross-fades between the two
    // personalities in one composited pass (styles in main.css). Browsers
    // without it (or users who prefer less motion) get the instant swap.
    if (document.startViewTransition && !prefersReducedMotion()) {
      document.startViewTransition(applyAll);
    } else {
      applyAll();
    }
  }

  // Everything mode-flavored in the chrome: accent (body[data-mode] drives
  // the CSS), toggle position, hint line, prompt placeholder, example chips.
  function applyModeUi() {
    document.body.dataset.mode = state.mode;
    // The browser chrome follows the mode too (mobile address bar tint).
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = state.mode === 'adventure' ? '#8A3418' : '#102A2E';
    document.querySelectorAll('#mode-toggle .mode-option').forEach(btn =>
      btn.setAttribute('aria-checked', String(btn.dataset.mode === state.mode)));
    const hint = document.getElementById('mode-hint');
    if (hint) hint.textContent = MODES[state.mode].hint;
    const feedTitle = document.getElementById('feed-title');
    if (feedTitle) feedTitle.textContent = MODES[state.mode].feedTitle;
    const textarea = document.getElementById('grok-prompt');
    if (textarea) textarea.placeholder = MODES[state.mode].placeholder;
    renderExamplePrompts();
  }

  // Browse-owned feeds refetch in the new mode; prompt results stay (they
  // cost a daily generate) and a toast explains the new lean instead.
  function refreshFeedForMode() {
    if (state.locationChosen && (state.browseMode || !state.allIdeas.length)) {
      const feed = document.getElementById('discovery-feed');
      if (feed) {
        feed.classList.add('mode-fading');
        setTimeout(() => feed.classList.remove('mode-fading'), 260);
      }
      if (state.browseMode) state.allIdeas = []; // that feed belongs to the old mode
      loadBrowseFeed();
    } else if (state.allIdeas.length) {
      showToast(MODES[state.mode].switchToast, { duration: 3500 });
    }
  }

  function renderFilterChips() {
    const wrap = document.getElementById('filters');
    if (!wrap) return;
    wrap.innerHTML = '';
    MODES[state.mode].filters
      .filter(({ filter }) => filter !== 'worldcup' || worldCupLive())
      .forEach(({ filter, label }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip' + (state.currentFilter === filter ? ' active' : '');
      chip.dataset.filter = filter;
      chip.textContent = label;
      chip.addEventListener('click', () => setFilter(filter));
      wrap.appendChild(chip);
    });
  }

  function renderExamplePrompts() {
    const wrap = document.getElementById('example-prompts');
    if (!wrap) return;
    wrap.innerHTML = '<span class="example-prompts-label">Try one</span>';
    MODES[state.mode].examples.forEach(ex => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'example-chip';
      btn.textContent = ex.label;
      btn.addEventListener('click', () => {
        document.getElementById('grok-prompt').value = ex.prompt;
        document.getElementById('prompt-form').requestSubmit();
      });
      wrap.appendChild(btn);
    });
  }

  // Horizontal swipe → mode switch (left = Adventure, right = R&R). Scoped
  // to the hero/toggle only: in the feed, card swipes mean keep/skip and
  // must not fight a global gesture. Vertical-ish drags are scrolling.
  function addModeSwipe(el, ignoreSelector) {
    if (!el) return;
    let sx = 0, sy = 0, live = false;
    el.addEventListener('touchstart', (e) => {
      if (ignoreSelector && e.target.closest(ignoreSelector)) { live = false; return; }
      live = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!live) return;
      live = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      setMode(dx < 0 ? 'adventure' : 'rr');
    }, { passive: true });
  }

  function wireModeToggle() {
    const toggle = document.getElementById('mode-toggle');
    if (!toggle) return;
    toggle.querySelectorAll('.mode-option').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    addModeSwipe(toggle);
    // The rest of the hero swipes too — but never steal from the inputs,
    // the location combobox, or the toggle's own handler.
    addModeSwipe(document.querySelector('.hero'),
      'input, textarea, button, a, .location-combo, .location-listbox, .mode-toggle');
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
    // Picking a place is intent enough — show ideas immediately, no prompt
    // needed. Never clobbers prompt results (loadBrowseFeed guards that).
    loadBrowseFeed();
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

  // ---------- Overlay ↔ history integration ----------
  // One synthetic history entry exists while any panel/modal is open, so the
  // phone's back button closes the overlay instead of leaving DayHop.
  // Stacked overlays (e.g. the upgrade modal over the shortlist) all close on
  // one back — predictable, and never traps the user in the history stack.
  const overlayNav = {
    open: new Set(),
    owned: false,      // we pushed the entry that's currently on top
    ignorePop: false,  // the next popstate is our own history.back()
    opened(id) {
      this.open.add(id);
      if (!this.owned) {
        this.owned = true;
        history.pushState({ dayhopOverlay: true }, '');
      }
    },
    closed(id) {
      this.open.delete(id);
      // Deferred so a close immediately followed by an open (shortlist →
      // plan) keeps the entry instead of bouncing history around.
      setTimeout(() => {
        if (this.owned && this.open.size === 0) {
          this.owned = false;
          this.ignorePop = true;
          history.back();
        }
      }, 0);
    }
  };

  // Close the overlay's DOM without touching history — used by the popstate
  // handler (the entry is already gone) and shared by panels and modals.
  function domCloseOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('panel--open', 'modal--open');
    document.body.style.overflow = '';
    setTimeout(() => { el.hidden = true; }, 200);
  }

  window.addEventListener('popstate', () => {
    if (overlayNav.ignorePop) { overlayNav.ignorePop = false; return; }
    if (!overlayNav.owned) return;
    overlayNav.owned = false;
    overlayNav.open.forEach(domCloseOverlay);
    overlayNav.open.clear();
  });

  // auth.js owns its own modal; these hooks let it join the same history
  // behavior without importing anything.
  window.DayHopOverlayNav = {
    opened: (id) => overlayNav.opened(id),
    closed: (id) => overlayNav.closed(id)
  };

  // ---------- Panels ----------
  function openPanel(id) {
    const panel = document.getElementById(id);
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('panel--open'));
    document.body.style.overflow = 'hidden';
    overlayNav.opened(id);
  }

  function closePanel(panelEl) {
    panelEl.classList.remove('panel--open');
    document.body.style.overflow = '';
    setTimeout(() => { panelEl.hidden = true; }, 200);
    overlayNav.closed(panelEl.id);
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

  // Stable guest id for anonymous usage limits + analytics (Phase 4).
  function getOwnerId() {
    let id = localStorage.getItem('dayhop_owner_id');
    if (!id) {
      id = 'guest-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('dayhop_owner_id', id);
    }
    return id;
  }

  // ---------- Analytics (fire-and-forget, never blocks UX) ----------
  function track(type, idea) {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          type,
          idea_id: idea ? idea.id : undefined,
          source: idea ? idea.source : undefined,
          owner_id: getOwnerId()
        }),
        keepalive: true // survives the page navigating to a booking site
      }).catch(() => {});
    } catch (e) { /* never let analytics break the app */ }
  }

  // ---------- API ----------
  async function apiGenerateIdeas(prompt, filter) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prompt, filter, mode: state.mode, city: state.city, coords: state.coords || undefined, owner_id: getOwnerId() })
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || 'Could not generate ideas');
      err.code = data.error;
      throw err;
    }
    return data; // { ideas, grounded, weather, generated_at }
  }

  async function apiBuildPlan(items, days) {
    // Auth headers matter here: multi-day is gated on the caller's tier.
    const res = await fetch('/api/generate/plan', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ items, city: state.city, days: days || 1, mode: state.mode, owner_id: getOwnerId() })
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || 'Could not build your day plan');
      err.code = data.error;
      err.feature = data.feature;
      throw err;
    }
    return data;
  }

  async function apiReplan(guide, instruction) {
    const res = await fetch('/api/generate/replan', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        guide,
        instruction,
        mode: state.mode,
        city: guide.city || state.city,
        coords: state.coords || undefined,
        owner_id: getOwnerId()
      })
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || 'Could not re-plan your day');
      err.code = data.error;
      err.feature = data.feature;
      throw err;
    }
    return data; // { guide, change_summary, weather }
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

  // ---------- Progressive loading ----------
  // The loading screen paces itself: a progress bar + staged status line
  // easing toward done over how long this flow ACTUALLY takes on this device
  // (median of the last few runs, kept in localStorage), so the wait feels
  // measured instead of open-ended. Past the estimate the bar keeps crawling
  // and the copy owns the delay.
  const LOAD_STAGES = {
    generate: [
      { at: 0.0, label: '📍 Pinning down your area' },
      { at: 0.1, label: '☀️ Checking today’s weather' },
      { at: 0.22, label: '🗺️ Scanning real venues, events & experiences' },
      { at: 0.55, label: '✨ Picking the best matches for your vibe' },
      { at: 0.88, label: '🎨 Setting up your cards' }
    ],
    browse: [
      { at: 0.0, label: '📍 Finding what’s around you' },
      { at: 0.3, label: '🗺️ Gathering real venues & events' },
      { at: 0.72, label: '🎨 Curating today’s feed' }
    ],
    plan: [
      { at: 0.0, label: '🧭 Mapping your stops' },
      { at: 0.3, label: '⏱️ Timing the day, hop by hop' },
      { at: 0.7, label: '✨ Writing your itinerary' }
    ],
    replan: [
      { at: 0.0, label: '🔄 Rereading your day' },
      { at: 0.3, label: '🗺️ Hunting for the right swaps' },
      { at: 0.7, label: '✨ Reshaping the plan' }
    ]
  };
  const LOAD_DEFAULT_MS = { generate: 16000, browse: 6000, plan: 14000, replan: 12000 };
  const LOAD_TIMES_KEY = 'dayhop_load_times_v1';

  function loadTimesRead() {
    try { return JSON.parse(localStorage.getItem(LOAD_TIMES_KEY)) || {}; } catch { return {}; }
  }
  function loadEstimate(kind) {
    const runs = (loadTimesRead()[kind] || []).slice().sort((a, b) => a - b);
    if (!runs.length) return LOAD_DEFAULT_MS[kind] || 10000;
    return runs[Math.floor(runs.length / 2)];
  }
  function recordLoadTime(kind, ms) {
    if (ms < 800) return; // cache hits would skew the estimate absurdly fast
    try {
      const all = loadTimesRead();
      all[kind] = [...(all[kind] || []), Math.round(ms)].slice(-5);
      localStorage.setItem(LOAD_TIMES_KEY, JSON.stringify(all));
    } catch { /* private mode etc. — estimates just stay on defaults */ }
  }

  // startProgress('generate') → { finish(), fail() }. Inserted before
  // `anchor` (default: the feed) so renderSkeletons/renderFeed never touch it.
  function startProgress(kind, anchor) {
    const stages = LOAD_STAGES[kind] || LOAD_STAGES.generate;
    const est = loadEstimate(kind);
    const target = anchor || document.getElementById('discovery-feed');

    const el = document.createElement('div');
    el.className = 'progress-loader' + (anchor ? ' progress-loader--compact' : '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="progress-loader-top">
        <span class="progress-loader-stage">${stages[0].label}</span>
        <span class="progress-loader-pct" aria-hidden="true">0%</span>
      </div>
      <div class="progress-loader-track"><div class="progress-loader-fill"></div></div>
      <p class="progress-loader-hint">Usually takes ~${Math.max(2, Math.round(est / 1000))}s</p>`;
    target.parentNode.insertBefore(el, target);

    const stageEl = el.querySelector('.progress-loader-stage');
    const pctEl = el.querySelector('.progress-loader-pct');
    const fillEl = el.querySelector('.progress-loader-fill');
    const hintEl = el.querySelector('.progress-loader-hint');
    const t0 = Date.now();
    let lastStage = stages[0].label;

    const tick = setInterval(() => {
      const t = Date.now() - t0;
      const f = Math.min(t / est, 1);
      // Ease out to 90% at the estimate, then asymptotically crawl toward 99
      // — motion never stops, so a slow request still reads as "working".
      const p = t <= est
        ? 90 * (1 - Math.pow(1 - f, 1.8))
        : 90 + 9 * (1 - Math.exp(-(t - est) / est));
      fillEl.style.width = `${p}%`;
      pctEl.textContent = `${Math.round(p)}%`;
      if (t > est * 1.25) {
        stageEl.textContent = '⏳ Taking a bit longer than usual — worth it';
        hintEl.textContent = 'Almost there…';
      } else {
        const stage = [...stages].reverse().find(s => f >= s.at) || stages[0];
        if (stage.label !== lastStage) { lastStage = stage.label; stageEl.textContent = stage.label; }
      }
    }, 150);

    function teardown(recorded) {
      clearInterval(tick);
      if (recorded) {
        recordLoadTime(kind, Date.now() - t0);
        fillEl.style.width = '100%';
        pctEl.textContent = '100%';
        el.classList.add('progress-loader--done');
        setTimeout(() => el.remove(), 320);
      } else {
        el.remove();
      }
    }
    return { finish: () => teardown(true), fail: () => teardown(false) };
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

    let stopIndex = 0;
    const appendSection = (label, group, showHeaders, bestIds) => {
      if (group.length === 0) return;
      if (showHeaders) {
        const header = document.createElement('h3');
        header.className = 'feed-section-header';
        header.textContent = label;
        feed.appendChild(header);
      }
      group.forEach(idea => {
        feed.appendChild(createIdeaCard(idea, stopIndex++, animate, Boolean(bestIds && bestIds.has(idea.id))));
      });
    };

    // Prompt results open with the Best Match hero: the single strongest
    // direct answer, pulled out of the grid and given real estate + the
    // evidence for why it won. Only when there's a real field to beat.
    let heroIdea = null;
    if (!state.browseMode && !ideas.some(i => i.section)) {
      const onTargetAll = ideas.filter(i => !i.wow_reason);
      if (onTargetAll.length >= 3) heroIdea = onTargetAll[0];
    }
    if (heroIdea) {
      feed.appendChild(createBestMatchCard(heroIdea, animate));
      if (animate && window.DayHopMotion) window.DayHopMotion.bestMatchIn(feed.lastElementChild);
    }

    if (state.browseMode && ideas.some(i => i.section)) {
      // Browse feed: server-assigned sections, in server order. STOP numbers
      // continue across sections so the trail metaphor stays intact.
      const order = [];
      const groups = new Map();
      ideas.forEach(idea => {
        const label = idea.section || 'More ideas';
        if (!groups.has(label)) { groups.set(label, []); order.push(label); }
        groups.get(label).push(idea);
      });
      order.forEach(label => appendSection(label, groups.get(label), order.length > 1));
    } else {
      // Prompt results: the direct answers first (minus the hero, which is
      // already on stage), then the "didn't know you could do that" picks.
      const onTarget = ideas.filter(i => !i.wow_reason && (!heroIdea || i.id !== heroIdea.id));
      const beyond = ideas.filter(i => i.wow_reason);
      const showHeaders = onTarget.length > 0 && beyond.length > 0;
      // Runner-up crown: with the hero extracted, badge the next-best pick
      // only when the remaining field is big enough for it to mean something.
      const bestIds = new Set(onTarget.length >= 4 ? [onTarget[0].id] : []);
      appendSection(heroIdea ? 'Also right on target' : 'Right on target', onTarget, showHeaders, bestIds);
      appendSection('Beyond what you asked ✨', beyond, showHeaders);
    }

    const hasIdeas = state.allIdeas.length > 0;
    // Empty: nothing generated yet. No-results: ideas exist but the filter/swipes hid them all.
    document.getElementById('empty-state').hidden = state.isGenerating || hasIdeas;
    document.getElementById('noresults-state').hidden = state.isGenerating || !hasIdeas || ideas.length > 0;

    document.getElementById('idea-count').textContent = !hasIdeas
      ? 'Tell DayHop your plan to get started'
      : `${ideas.length} idea${ideas.length === 1 ? '' : 's'} · ${state.shortlist.length} on your shortlist`;

    renderCollections();
  }

  function createIdeaCard(idea, index, animate = false, bestMatch = false) {
    const card = document.createElement('article');
    card.className = 'idea-card';
    card.dataset.id = idea.id;
    card.style.setProperty('--stop-index', index);
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', idea.title);

    if (animate && index < 4) {
      // Above the fold: staggered JS-timed arrival.
      card.classList.add('is-entering');
      // Strip the class once it finishes so transform is free for swipe/dismiss.
      card.addEventListener('animationend', () => card.classList.remove('is-entering'), { once: true });
    } else if (index >= 4) {
      // Below the fold: native scroll-driven reveal (animation-timeline:
      // view() in main.css) — each card fades up as it enters the viewport,
      // zero JS per frame. Harmless no-op where unsupported.
      card.classList.add('scroll-in');
    }

    const categoryLabel = CATEGORY_LABELS[idea.category] || CATEGORY_LABELS.general;
    const stopNumber = String(index + 1).padStart(2, '0');

    card.innerHTML = `
      <div class="card-photo">
        <img src="${escapeAttr(idea.image_url || categoryImage(idea.category))}" alt="" loading="lazy" decoding="async">
        <span class="card-stamp">STOP ${stopNumber}</span>
        ${bestMatch ? '<span class="card-badge card-badge--best">🎯 Best match for you</span>' : ''}
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
        ${bookingLinksHtml(idea, 'card')}
      </div>
      <div class="card-actions">
        <button class="btn-dismiss" type="button" title="Not for us">✕ Skip</button>
        <button class="btn-detail" type="button" title="See details">Details</button>
        ${idea.section ? '<button class="btn-build-around" type="button" title="Add this and start building your day around it">⚡ Build a day</button>' : ''}
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
    const buildBtn = card.querySelector('.btn-build-around');
    if (buildBtn) buildBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToShortlist(idea, card);
      renderShortlistPanel();
      openPanel('shortlist-panel');
    });

    addSwipeListeners(card, idea);
    return card;
  }

  // ---------- Best Match hero ----------
  // Evidence, not assertion: the hero card explains WHY it won — distance,
  // the user's own words, rating depth, price, timing. Max 4 chips.
  const REASON_STOPWORDS = new Set([
    'with', 'that', 'this', 'then', 'them', 'some', 'somewhere', 'something',
    'after', 'before', 'near', 'nearby', 'want', 'like', 'need', 'hours',
    'kids', 'day', 'morning', 'afternoon', 'evening', 'relaxed', 'easy'
  ]);

  function matchReasons(idea) {
    const reasons = [];

    if (idea.distance_km != null) {
      reasons.push(idea.distance_km <= 1.5
        ? '📍 Right around the corner'
        : `📍 ${idea.distance_km} km from you`);
    }

    // Their own words, reflected back: prompt words found in the idea.
    const ideaText = `${idea.title || ''} ${idea.why || ''} ${idea.category || ''}`.toLowerCase();
    const echoed = (state.lastPrompt || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter(w => w.length > 3 && !REASON_STOPWORDS.has(w) && ideaText.includes(w));
    if (echoed.length) {
      reasons.push(`💬 You said “${[...new Set(echoed)].slice(0, 2).join('”, “')}”`);
    }

    if (idea.rating >= 4.5) reasons.push(`★ ${idea.rating} — loved by locals`);
    else if (idea.rating != null) reasons.push(`★ ${idea.rating}`);

    if (String(idea.cost_tier).toLowerCase() === 'free') reasons.push('🎟 Completely free');
    else if (idea.price_from != null) reasons.push(`💳 from ${idea.price_from}${idea.currency ? ' ' + idea.currency : ''}`);

    if (idea.date) reasons.push(`📅 ${formatEventDate(idea.date)}`);

    // Weather fit — the plan already adjusted for today's sky; say so.
    if (state.lastWeather && state.lastWeather.condition === 'Clear' && !reasons.length) {
      reasons.push('☀️ Perfect for today');
    }

    return reasons.slice(0, 4);
  }

  function createBestMatchCard(idea, animate) {
    const card = document.createElement('article');
    card.className = 'best-match';
    card.dataset.id = idea.id;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `Best match: ${idea.title}`);
    // CSS entrance as the default; motion.js strips it and runs the GSAP
    // timeline instead when the full motion stack is available.
    if (animate) card.classList.add('is-entering');

    const reasons = matchReasons(idea);
    card.innerHTML = `
      <div class="best-match-inner">
        <div class="best-match-photo">
          <img src="${escapeAttr(idea.image_url || categoryImage(idea.category, 1200))}" alt="" decoding="async" fetchpriority="high">
          <span class="best-match-flag">✦ Best match for you</span>
        </div>
        <div class="best-match-body">
          <span class="best-match-kicker">${state.mode === 'adventure' ? 'Start your adventure here' : 'Start your day here'}</span>
          <h3>${escapeHtml(idea.title)}</h3>
          <p class="why">${escapeHtml(idea.why || '')}</p>
          ${reasons.length ? `<div class="match-reasons">${reasons.map(r => `<span class="match-reason">${escapeHtml(r)}</span>`).join('')}</div>` : ''}
          <div class="card-meta">
            ${idea.location ? `<span>${escapeHtml(idea.location)}</span>` : ''}
            ${idea.duration_minutes ? `<span>${formatDuration(idea.duration_minutes)}</span>` : ''}
            ${idea.cost_tier ? `<span>${escapeHtml(idea.cost_tier)}</span>` : ''}
          </div>
          ${bookingLinksHtml(idea, 'card')}
          <div class="best-match-actions">
            <button class="btn-dismiss" type="button" title="Not for us">✕ Skip</button>
            <button class="btn-detail" type="button" title="See details">Details</button>
            <button class="btn-add" type="button" title="Add to your day">Add to my day →</button>
          </div>
        </div>
      </div>
    `;

    const img = card.querySelector('.best-match-photo img');
    img.addEventListener('error', () => { img.src = categoryImage(idea.category, 1200); }, { once: true });

    card.querySelector('.btn-dismiss').addEventListener('click', () => dismissIdea(idea, card));
    card.querySelector('.btn-detail').addEventListener('click', () => openDetail(idea));
    card.querySelector('.btn-add').addEventListener('click', () => addToShortlist(idea, card));
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
    const conflict = advisoryConflictChip(idea);
    if (conflict) chips.push(`<span class="card-chip card-chip--advisory" title="An advisory is in effect for this area">⚠️ Outdoors — ${escapeHtml(conflict)}</span>`);
    if (idea.distance_km != null) chips.push(`<span class="card-chip card-chip--near">📍 ${escapeHtml(String(idea.distance_km))} km</span>`);
    if (idea.date) chips.push(`<span class="card-chip card-chip--date">📅 ${escapeHtml(formatEventDate(idea.date))}</span>`);
    if (idea.rating != null) chips.push(`<span class="card-chip">★ ${escapeHtml(String(idea.rating))}</span>`);
    if (idea.price_from != null) chips.push(`<span class="card-chip">from ${escapeHtml(String(idea.price_from))}${idea.currency ? ' ' + escapeHtml(idea.currency) : ''}</span>`);
    if (idea.cost_tier === 'free') chips.push('<span class="card-chip card-chip--free">Free</span>');
    if (idea.civic) chips.push('<span class="card-chip" title="From your city\'s official events feed">🏛 City event</span>');
    if (idea.also_from && idea.also_from.length) chips.push(`<span class="card-chip" title="Also listed by ${escapeAttr(idea.also_from.join(', '))}">+${idea.also_from.length} source${idea.also_from.length > 1 ? 's' : ''}</span>`);
    return chips.length ? `<div class="card-chips">${chips.join('')}</div>` : '';
  }

  // ---------- One-click booking links ----------
  const SOURCE_BOOK_LABELS = {
    viator: 'Viator',
    getyourguide: 'GetYourGuide',
    ticketmaster: 'Ticketmaster',
    eventbrite: 'Eventbrite'
  };

  // Categories where a prefilled Viator search is genuinely useful when the
  // idea has no direct booking link (tours, cruises, big experiences) —
  // a search link for a playground would just be noise.
  const VIATOR_SEARCH_CATEGORIES = new Set(['adventures', 'cruises', 'culture', 'water']);

  function viatorSearchUrl(idea) {
    // Pre-fill what we know: activity name + where. Viator's search box is
    // text-only, so date/location ride inside the query string.
    const where = idea.location || (state.city !== GTA_WIDE ? state.city : 'Toronto');
    const q = [idea.title, where].filter(Boolean).join(' ');
    return 'https://www.viator.com/searchResults/all?text=' + encodeURIComponent(q);
  }

  /**
   * The booking row for an idea. mode:
   *   'card'   → one primary link (direct booking, else prefilled Viator
   *              search for experience categories, else map link)
   *   'detail' → booking + map, full labels
   *   'stop'   → booking + map, compact labels (plan stops)
   * All links carry data-idea-* so the global click handler tracks them.
   */
  function bookingLinksHtml(idea, mode) {
    const attrs = `data-idea-id="${escapeAttr(idea.id)}" data-idea-source="${escapeAttr(idea.source || '')}"`;
    const compact = mode === 'stop';
    const links = [];
    if (idea.booking_url) {
      const label = compact ? 'Book ↗' : `Book this on ${SOURCE_BOOK_LABELS[idea.source] || 'our partner'} ↗`;
      links.push(`<a class="card-booking-link" ${attrs} href="${escapeAttr(idea.booking_url)}" target="_blank" rel="noopener noreferrer sponsored">${label}</a>`);
    } else if (VIATOR_SEARCH_CATEGORIES.has(idea.category)) {
      const label = compact ? 'Find tickets ↗' : 'Find tickets on Viator ↗';
      links.push(`<a class="card-booking-link" ${attrs} data-idea-source="viator_search" href="${escapeAttr(viatorSearchUrl(idea))}" target="_blank" rel="noopener noreferrer sponsored">${label}</a>`);
    }
    if (idea.maps_url && (mode !== 'card' || links.length === 0)) {
      links.push(`<a class="card-booking-link card-booking-link--secondary" ${attrs} href="${escapeAttr(idea.maps_url)}" target="_blank" rel="noopener noreferrer">${compact ? 'Map ↗' : 'View on Google Maps ↗'}</a>`);
    }
    if (!links.length) return '';
    return mode === 'card' ? links[0] : `<div class="${mode === 'stop' ? 'plan-stop-links' : 'detail-links'}">${links.join('')}</div>`;
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
  // opts.silent skips the confirmation toast — for flows (like the booking
  // retention prompt) that show their own combined message instead.
  function addToShortlist(idea, card, opts) {
    if (state.shortlist.find(i => i.id === idea.id)) return;
    state.shortlist.push(idea);
    persist();
    serverShortlistAdd(idea);
    track('shortlist_add', idea);
    if (card) animateOut(card, 'right', () => renderFeed());
    updateShortlistCount();
    if (navigator.vibrate) navigator.vibrate(10);
    if (opts && opts.silent) return;
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
    state.savedGuide = null; // shortlist changed → any saved export is stale
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
      ${bookingLinksHtml(idea, 'detail')}
      <div class="detail-more" id="detail-more">
        <p class="detail-more-loading">✨ Digging up the good stuff…</p>
      </div>
    `;
    openPanel('detail-panel');
    loadDetailMore(idea);
  }

  // ---------- Detail enrichment ----------
  // Lazy second course for the detail panel: extra photos, editorial
  // summary, live open-now, and Grok's local color (facts / history /
  // busy patterns / a tip). Cached per idea for the session; a token
  // guards against a slow response landing in a newer panel.
  const detailMoreCache = new Map();
  let detailMoreToken = 0;

  async function loadDetailMore(idea) {
    const box = document.getElementById('detail-more');
    if (!box) return;
    const token = ++detailMoreToken;
    const key = String(idea.id);

    let data = detailMoreCache.get(key);
    if (!data) {
      try {
        const res = await fetch('/api/details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: idea.id,
            source: idea.source || undefined,
            title: idea.title,
            venue: idea.venue || undefined,
            location: idea.location || undefined,
            city: state.city,
            category: idea.category || undefined
          })
        });
        if (!res.ok) throw new Error('details failed');
        data = await res.json();
        if (data.place || data.facts) detailMoreCache.set(key, data);
      } catch (e) {
        data = null;
      }
    }

    if (token !== detailMoreToken) return; // panel moved on to another idea
    const current = document.getElementById('detail-more');
    if (!current) return;
    current.innerHTML = data ? detailMoreHtml(data, idea) : '';
  }

  function detailMoreHtml({ place, facts }, idea) {
    const parts = [];

    // More photos — skip when all we'd show is the hero image again.
    const photos = (place && place.photos || []).filter(u => u !== idea.image_url);
    if (photos.length > 1) {
      parts.push(`<div class="detail-gallery">${photos.map(u =>
        `<img src="${escapeAttr(u)}" alt="" loading="lazy" decoding="async">`).join('')}</div>`);
    }

    // Right now: live open state (Google) + typical crowd rhythm (Grok).
    const nowBits = [];
    if (place && place.open_now != null) {
      nowBits.push(`<span class="detail-open ${place.open_now ? 'detail-open--yes' : 'detail-open--no'}">${place.open_now ? '● Open now' : '● Closed right now'}</span>`);
    }
    if (facts && facts.busy) nowBits.push(`<span class="detail-busy">👥 ${escapeHtml(facts.busy)}</span>`);
    if (nowBits.length) parts.push(`<div class="detail-now">${nowBits.join('')}</div>`);

    if (place && place.editorial_summary) {
      parts.push(`<p class="detail-summary">${escapeHtml(place.editorial_summary)}</p>`);
    }

    const factList = (facts && facts.facts || []).slice(0, 4);
    if (factList.length || (facts && facts.history)) {
      parts.push(`<h4 class="detail-more-title">Worth knowing</h4>`);
      if (facts.history) parts.push(`<p class="detail-history">${escapeHtml(facts.history)}</p>`);
      if (factList.length) {
        parts.push(`<ul class="detail-facts">${factList.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`);
      }
    }

    if (facts && facts.tip) parts.push(`<p class="detail-tip">💡 ${escapeHtml(facts.tip)}</p>`);

    if (place && place.open_hours && place.open_hours.length) {
      parts.push(`<details class="detail-hours"><summary>Opening hours</summary><ul>${place.open_hours.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul></details>`);
    }

    if (place && (place.rating != null) && place.rating_count > 0) {
      parts.push(`<p class="detail-rating-depth">★ ${escapeHtml(String(place.rating))} from ${escapeHtml(String(place.rating_count.toLocaleString('en-CA')))} Google reviews</p>`);
    }

    return parts.join('');
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
    state.savedGuide = null; // order changed → any saved export is stale
    persist();
    renderShortlistPanel();
  }

  function renderShortlistPanel() {
    const container = document.getElementById('shortlist-items');
    const empty = document.getElementById('shortlist-empty');
    const summary = document.getElementById('shortlist-summary');
    const newBtn = document.getElementById('new-shortlist-btn');
    container.innerHTML = '';
    if (newBtn) newBtn.hidden = state.shortlist.length === 0;

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
    const progress = startProgress('plan', document.querySelector('#shortlist-panel .panel-footer'));

    try {
      const plan = await apiBuildPlan(state.shortlist, state.planDays);
      progress.finish();
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
      progress.fail();
      if (err.code === 'UPGRADE_REQUIRED') {
        showUpgradeModal(err.feature || 'multi_day');
      } else {
        showToast(err.message || 'Could not build your day plan. Try again.', { duration: 3500 });
      }
    } finally {
      state.isBuildingPlan = false;
      btn.classList.remove('is-loading');
      btn.disabled = state.shortlist.length === 0;
    }
  }

  // ---------- Plan view (guide-shaped: view, edit, re-plan) ----------
  // The plan panel always renders a self-contained "guide" structure — the
  // same shape the server stores — so a freshly built plan, an edited plan,
  // a re-planned plan, and a saved plan opened from My Plans all flow through
  // one renderer.

  // Grok skeleton (stops reference shortlist ids) → self-contained guide.
  function guideFromPlan(plan) {
    const byId = new Map(state.shortlist.map(i => [String(i.id), i]));
    const toStops = (stops) => (stops || []).map((stop, i) => ({
      title: stop.title || '',
      suggested_time: stop.suggested_time || '',
      transition_note: stop.transition_note || '',
      note: '',
      idea: byId.get(String(stop.id)) || state.shortlist[i] || {}
    }));
    const g = {
      title: plan.plan_title || 'Your day, mapped out',
      city: state.city === GTA_WIDE ? null : state.city,
      notes: plan.notes || ''
    };
    // Snapshot the conditions the plan was built for — the exported/printed
    // guide shows this so the paper copy carries the same context.
    if (state.lastWeather) {
      g.weather = {
        condition: state.lastWeather.condition || '',
        temp_c: state.lastWeather.temp_c != null ? state.lastWeather.temp_c : null,
        description: state.lastWeather.description || ''
      };
    }
    // Advisory snapshot rides along too — the trust line and the printed
    // guide both show what the plan was built around.
    stampGuideAdvisories(g);
    if (Array.isArray(plan.days) && plan.days.length) {
      g.days = plan.days.map((d, i) => ({
        label: (d && d.label) || `Day ${i + 1}`,
        start_time: (d && d.start_time) || '',
        notes: (d && d.notes) || '',
        stops: toStops(d && d.stops)
      }));
    } else {
      g.start_time = plan.start_time || '';
      g.stops = toStops(plan.stops);
    }
    return g;
  }

  // The zero-state "see the payoff first" plan: rendered through the normal
  // plan panel, so saving, exporting, and re-planning all work on it — the
  // sample IS the demo.
  function showSamplePlan() {
    track('sample_plan_viewed', {});
    state.lastPlan = null;
    state.currentGuide = JSON.parse(JSON.stringify(SAMPLE_GUIDE));
    state.currentGuideId = null;
    state.savedGuide = null;
    state.lastChangeSummary = null;
    state.editMode = false;
    renderPlanView();
    openPanel('dayplan-panel');
  }

  function renderDayPlan(plan) {
    state.lastPlan = plan;
    state.currentGuide = guideFromPlan(plan);
    state.currentGuideId = null; // fresh plan, not saved yet
    state.savedGuide = null;
    state.lastChangeSummary = null;
    state.editMode = false;
    renderPlanView();
  }

  // The stop arrays of the current guide: [{ label, stops }] — one entry for
  // a single-day plan, one per day for multi-day. Handlers mutate these
  // arrays in place (they ARE the guide's arrays).
  function guideStopGroups(guide) {
    if (Array.isArray(guide.days)) {
      return guide.days.map((d, i) => ({ label: d.label || `Day ${i + 1}`, day: d, stops: d.stops || [] }));
    }
    return [{ label: null, day: null, stops: guide.stops || [] }];
  }

  // Any local change to the plan makes the saved copy stale.
  function markGuideDirty() {
    state.savedGuide = null;
    updateExportHint();
    updateSaveButton();
  }

  function planStopHtml(stop, index, groupIndex) {
    const idea = stop.idea || {};
    const facts = [];
    if (idea.location) facts.push(`📍 ${escapeHtml(idea.location)}`);
    if (idea.duration_minutes) facts.push(`⏱ ${formatDuration(idea.duration_minutes)}`);
    if (idea.cost_tier) facts.push(`💳 ${escapeHtml(idea.cost_tier)}`);
    if (idea.rating != null) facts.push(`★ ${escapeHtml(String(idea.rating))}`);

    const editControls = state.editMode ? `
      <div class="plan-edit-controls" data-group="${groupIndex}" data-index="${index}">
        <button class="btn-move" type="button" data-edit="up" aria-label="Move stop up">▲</button>
        <button class="btn-move" type="button" data-edit="down" aria-label="Move stop down">▼</button>
        <button class="btn-remove" type="button" data-edit="remove" aria-label="Remove stop">✕</button>
      </div>` : '';

    const timeHtml = state.editMode
      ? `<input class="plan-time-input" data-group="${groupIndex}" data-index="${index}" data-field="suggested_time" value="${escapeAttr(stop.suggested_time || '')}" placeholder="e.g. 10:00 AM - 11:30 AM" aria-label="Suggested time">`
      : `<span class="plan-stop-time">${escapeHtml(stop.suggested_time || '')}</span>`;

    const noteHtml = state.editMode
      ? `<textarea class="plan-note-input" data-group="${groupIndex}" data-index="${index}" data-field="note" rows="1" maxlength="500" placeholder="Add a note — parking tips, snacks, who to text…" aria-label="Your note">${escapeHtml(stop.note || '')}</textarea>`
      : (stop.note ? `<p class="plan-stop-note">📝 ${escapeHtml(stop.note)}</p>` : '');

    return `
      <div class="plan-stop${stop.changed ? ' plan-stop--changed' : ''}">
        <div class="plan-stop-marker">${String(index + 1).padStart(2, '0')}</div>
        <div class="plan-stop-body">
          ${stop.changed ? '<span class="plan-changed-badge">✨ Updated</span>' : ''}
          ${timeHtml}
          <h3>${escapeHtml(stop.title || idea.title || '')}</h3>
          ${idea.image_url && !state.editMode ? `<div class="plan-stop-photo"><img src="${escapeAttr(idea.image_url)}" alt="" loading="lazy"></div>` : ''}
          ${idea.why && !state.editMode ? `<p class="plan-stop-why">${escapeHtml(idea.why)}</p>` : ''}
          ${facts.length && !state.editMode ? `<p class="plan-stop-facts">${facts.join(' · ')}</p>` : ''}
          ${!state.editMode ? bookingLinksHtml(idea, 'stop') : ''}
          ${noteHtml}
          ${stop.transition_note && !state.editMode ? `<p class="plan-transition">→ ${escapeHtml(stop.transition_note)}</p>` : ''}
        </div>
        ${editControls}
      </div>`;
  }

  function renderPlanView() {
    const guide = state.currentGuide;
    if (!guide) return;
    const content = document.getElementById('dayplan-content');

    const groups = guideStopGroups(guide);
    const sections = groups.map((group, gi) => {
      const stopsHtml = group.stops.map((stop, i) => planStopHtml(stop, i, gi)).join('');
      const header = group.label !== null ? `<h3 class="plan-day-header">${escapeHtml(group.label)}</h3>` : '';
      const start = group.day && group.day.start_time
        ? `<p class="plan-start">Starts around <strong>${escapeHtml(group.day.start_time)}</strong></p>` : '';
      const dayNotes = group.day && group.day.notes ? `<div class="plan-notes">💬 ${escapeHtml(group.day.notes)}</div>` : '';
      return `${header}${start}<div class="plan-stops">${stopsHtml}</div>${dayNotes}`;
    }).join('');

    const startLine = !guide.days && guide.start_time
      ? `<p class="plan-start">Starts around <strong>${escapeHtml(guide.start_time)}</strong></p>` : '';

    content.innerHTML = `
      ${planAdvisoryHtml(guide)}
      ${startLine}
      ${sections}
      ${guide.notes ? `<div class="plan-notes">💬 ${escapeHtml(guide.notes)}</div>` : ''}
    `;
    document.getElementById('dayplan-title').textContent = guide.title || 'Your day, mapped out';

    renderChangeSummary();
    wireEditControls(content);

    // Toolbar + re-plan bar + export live below/around the content.
    const toolbar = document.getElementById('plan-toolbar');
    toolbar.hidden = false;
    document.getElementById('plan-edit-btn').textContent = state.editMode ? '✓ Done editing' : '✏️ Edit plan';
    updateSaveButton();
    document.getElementById('replan-bar').hidden = state.editMode;
    updateExportHint();
    document.getElementById('guide-export').hidden = state.editMode;
  }

  function updateSaveButton() {
    const btn = document.getElementById('plan-save-btn');
    if (!btn) return;
    if (state.savedGuide && !state.editMode) {
      btn.textContent = '✓ Saved';
      btn.disabled = true;
    } else {
      btn.textContent = state.currentGuideId ? '💾 Save changes' : '💾 Save plan';
      btn.disabled = false;
    }
  }

  function renderChangeSummary() {
    const el = document.getElementById('plan-change-summary');
    const bullets = state.lastChangeSummary;
    if (!bullets || !bullets.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<p class="change-summary-title">✨ What changed</p><ul>${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
    el.hidden = false;
  }

  function wireEditControls(content) {
    if (!state.editMode) return;
    const stopsFor = (el) => guideStopGroups(state.currentGuide)[Number(el.dataset.group)].stops;

    content.querySelectorAll('.plan-edit-controls button').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = btn.parentElement;
        const stops = stopsFor(wrap);
        const index = Number(wrap.dataset.index);
        const action = btn.dataset.edit;
        if (action === 'remove') {
          stops.splice(index, 1);
        } else {
          const target = index + (action === 'up' ? -1 : 1);
          if (target < 0 || target >= stops.length) return;
          const [item] = stops.splice(index, 1);
          stops.splice(target, 0, item);
        }
        markGuideDirty();
        renderPlanView();
      });
    });

    // Time + note inputs write straight into the guide on input; no re-render
    // needed (the DOM already shows what the user typed).
    content.querySelectorAll('.plan-time-input, .plan-note-input').forEach(input => {
      input.addEventListener('input', () => {
        const stops = stopsFor(input);
        const stop = stops[Number(input.dataset.index)];
        if (stop) stop[input.dataset.field] = input.value;
        markGuideDirty();
      });
    });
  }

  function toggleEditMode() {
    if (!state.currentGuide) return;
    state.editMode = !state.editMode;
    renderPlanView();
    if (state.editMode) {
      showToast('Reorder, retime, remove stops, or add notes — then save.', { duration: 3500 });
    }
  }

  // Save the current guide: POST for a new plan (free tier: limited total),
  // PUT for edits to an already-saved one (Pro). Returns the saved record
  // or null after showing the right gate.
  async function saveCurrentGuide() {
    if (!state.currentGuide) return null;
    if (!isLoggedIn()) {
      showToast('Sign in to save your plan.', { duration: 4000 });
      const authBtn = document.getElementById('auth-btn');
      if (authBtn && !authBtn.hidden) authBtn.click();
      return null;
    }
    if (state.savedGuide) return state.savedGuide;

    const isUpdate = Boolean(state.currentGuideId);
    try {
      const res = await fetch(isUpdate ? `/api/guides/${encodeURIComponent(state.currentGuideId)}` : '/api/guides', {
        method: isUpdate ? 'PUT' : 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ guide: state.currentGuide, city: state.currentGuide.city || state.city })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        showUpgradeModal(data.feature || (isUpdate ? 'edit_guide' : 'saved_guides'));
        return null;
      }
      if (res.status === 404 && isUpdate) {
        // The saved copy is gone (deleted elsewhere) — save as a new plan.
        state.currentGuideId = null;
        return saveCurrentGuide();
      }
      if (!res.ok) {
        showToast(data.message || 'Could not save your plan. Try again.', { duration: 4000 });
        return null;
      }
      state.savedGuide = data;
      state.currentGuideId = data.id;
      updateExportHint();
      updateSaveButton();
      return data;
    } catch (e) {
      showToast('Could not save your plan. Try again.', { duration: 4000 });
      return null;
    }
  }

  async function handleSavePlan() {
    if (state.editMode) state.editMode = false; // saving exits edit mode
    const saved = await saveCurrentGuide();
    renderPlanView();
    if (saved) {
      // Soft confirmation: a quiet ring blooms out of the save button.
      const btn = document.getElementById('plan-save-btn');
      if (btn) {
        btn.classList.remove('save-bloom');
        void btn.offsetWidth;
        btn.classList.add('save-bloom');
      }
      showToast('Plan saved to My Plans 🗂', {
        duration: 4500,
        actionLabel: 'Copy link',
        onAction: () => copyToClipboard(saved.share_url, 'Guide link copied')
      });
    }
  }

  // ---------- Smart re-planning ----------
  async function handleReplan(instruction) {
    const text = (instruction || '').trim();
    if (!text || !state.currentGuide || state.isReplanning) return;
    state.isReplanning = true;
    const goBtn = document.getElementById('replan-go');
    goBtn.classList.add('is-loading');
    goBtn.disabled = true;
    const replanBar = document.getElementById('replan-bar');
    replanBar.classList.add('replan-bar--busy');
    const progress = startProgress('replan', replanBar);

    try {
      const data = await apiReplan(state.currentGuide, text);
      progress.finish();
      state.currentGuide = data.guide;
      // A re-plan re-checks conditions — carry the fresh advisory snapshot
      // onto the revised guide so the trust line reflects what it was
      // actually re-planned around.
      if (Array.isArray(data.advisories)) {
        state.lastAdvisories = data.advisories;
        state.lastAdvisoriesStatus = data.advisories_status || null;
        stampGuideAdvisories(state.currentGuide);
        renderAdvisoryStrip();
      }
      state.lastChangeSummary = data.change_summary || [];
      state.savedGuide = null; // new version → stale save
      state.editMode = false;
      renderPlanView();
      document.getElementById('replan-input').value = '';
      const panel = document.querySelector('#dayplan-panel .panel-sheet');
      if (panel) panel.scrollTo({ top: 0, behavior: 'smooth' });
      // Re-plan celebration: GSAP settles the "what changed" panel in with
      // a stagger (motion.js); plain toast either way.
      if (window.DayHopMotion) {
        window.DayHopMotion.celebrateReplan(document.getElementById('plan-change-summary'));
      }
      showToast('Plan updated ✨');
    } catch (err) {
      progress.fail();
      if (err.code === 'UPGRADE_REQUIRED') {
        showUpgradeModal(err.feature || 'replan');
      } else {
        showToast(err.message || 'Could not re-plan right now. Try again.', { duration: 3500 });
      }
    } finally {
      state.isReplanning = false;
      goBtn.classList.remove('is-loading');
      goBtn.disabled = false;
      document.getElementById('replan-bar').classList.remove('replan-bar--busy');
    }
  }

  function wireReplanBar() {
    document.querySelectorAll('.replan-chip').forEach(chip => {
      chip.addEventListener('click', () => handleReplan(chip.dataset.replan));
    });
    document.getElementById('replan-form').addEventListener('submit', (e) => {
      e.preventDefault();
      handleReplan(document.getElementById('replan-input').value);
    });
  }

  // ---------- My Plans (saved guides list) ----------
  async function openMyPlans() {
    if (!isLoggedIn()) {
      showToast('Sign in to see your saved plans.', { duration: 4000 });
      const authBtn = document.getElementById('auth-btn');
      if (authBtn && !authBtn.hidden) authBtn.click();
      return;
    }
    openPanel('myplans-panel');
    const list = document.getElementById('myplans-list');
    list.innerHTML = '<p class="myplans-loading">Loading your plans…</p>';
    try {
      const res = await fetch('/api/guides', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not load your plans.');
      state.myGuides = data.guides || [];
      renderMyPlans(data.limit);
    } catch (e) {
      list.innerHTML = '';
      showToast(e.message || 'Could not load your plans right now.', { duration: 3500 });
    }
  }

  function renderMyPlans(limit) {
    const list = document.getElementById('myplans-list');
    const empty = document.getElementById('myplans-empty');
    const footnote = document.getElementById('myplans-footnote');
    list.innerHTML = '';

    empty.hidden = state.myGuides.length > 0;

    // Free tier: show how much of the allowance is used, with the upgrade path.
    if (limit != null && state.billingConfigured && !state.isPro) {
      footnote.innerHTML = `${state.myGuides.length} of ${limit} free saved plans used · <button type="button" class="linklike" id="myplans-upgrade">Go Pro for unlimited ✨</button>`;
      footnote.hidden = false;
      const up = document.getElementById('myplans-upgrade');
      if (up) up.addEventListener('click', () => showUpgradeModal('saved_guides'));
    } else {
      footnote.hidden = true;
    }

    state.myGuides.forEach(g => {
      const row = document.createElement('div');
      row.className = 'myplans-row';
      const when = g.updated_at || g.created_at;
      const bits = [];
      if (g.city) bits.push(escapeHtml(g.city));
      if (g.day_count > 1) bits.push(`${g.day_count} days`);
      bits.push(`${g.stop_count} stop${g.stop_count === 1 ? '' : 's'}`);
      if (when) bits.push(formatEventDate(when));
      row.innerHTML = `
        <button class="myplans-open" type="button">
          <strong>${escapeHtml(g.title)}</strong>
          <span class="myplans-meta">${bits.join(' · ')}${g.day_count > 1 ? ' <span class="card-chip card-chip--date">🌅 Multi-day</span>' : ''}</span>
        </button>
        <div class="myplans-actions">
          <button class="btn-move" type="button" data-act="share" title="Copy share link" aria-label="Copy share link">🔗</button>
          <button class="btn-remove" type="button" data-act="delete" title="Delete plan" aria-label="Delete plan">✕</button>
        </div>`;
      row.querySelector('.myplans-open').addEventListener('click', () => openSavedGuide(g));
      row.querySelector('[data-act="share"]').addEventListener('click', () => copyToClipboard(g.share_url, 'Guide link copied'));
      row.querySelector('[data-act="delete"]').addEventListener('click', () => deleteSavedGuide(g));
      list.appendChild(row);
    });
  }

  function openSavedGuide(g) {
    state.currentGuide = g.guide;
    state.currentGuideId = g.id;
    state.savedGuide = g;
    state.lastChangeSummary = null;
    state.editMode = false;
    closePanel(document.getElementById('myplans-panel'));
    renderPlanView();
    openPanel('dayplan-panel');
  }

  async function deleteSavedGuide(g) {
    if (!window.confirm(`Delete "${g.title}"? Its share link stops working too.`)) return;
    try {
      const res = await fetch(`/api/guides/${encodeURIComponent(g.id)}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Could not delete that plan.');
      }
      state.myGuides = state.myGuides.filter(x => x.id !== g.id);
      if (state.currentGuideId === g.id) {
        state.currentGuideId = null;
        state.savedGuide = null;
      }
      renderMyPlans(state.entitlements ? state.entitlements.saved_guides : null);
      showToast('Plan deleted');
    } catch (e) {
      showToast(e.message || 'Could not delete that plan.', { duration: 3500 });
    }
  }

  // ---------- Guide export (saves the itinerary + share link, then fans out) ----------
  function updateExportHint() {
    const hint = document.getElementById('guide-export-hint');
    if (!hint) return;
    const freeLimit = state.entitlements && state.entitlements.saved_guides;
    if (state.savedGuide) {
      hint.textContent = 'Plan saved — share it anywhere, the link stays live.';
    } else if (!isLoggedIn()) {
      hint.textContent = 'Sign in to save this as a shareable guide.';
    } else if (state.billingConfigured && !state.isPro) {
      hint.textContent = `Exporting saves this plan (free includes ${freeLimit != null ? freeLimit : 5} — Pro is unlimited).`;
    } else {
      hint.textContent = 'Exporting saves this as a shareable guide with a public link.';
    }
  }

  // Every export format needs the guide saved server-side first (that's what
  // mints the public /g/… link). Delegates to saveCurrentGuide, which shows
  // the right gate (sign-in modal, or the upgrade modal on 402).
  async function ensureGuideSaved() {
    if (state.savedGuide) return state.savedGuide;
    if (!state.currentGuide) {
      showToast('Build a day plan first — add ideas and tap "Build my day".');
      return null;
    }
    const saved = await saveCurrentGuide();
    if (saved) renderPlanView();
    return saved;
  }

  // Every stop of a guide with its day label — export formats iterate this so
  // single-day and multi-day guides share one code path.
  function flattenGuideStops(g) {
    if (Array.isArray(g.days)) {
      return g.days.flatMap((d, di) => (d.stops || []).map((stop, i) => ({
        stop, index: i, dayLabel: d.label || `Day ${di + 1}`, firstOfDay: i === 0, dayStart: d.start_time || ''
      })));
    }
    return (g.stops || []).map((stop, i) => ({ stop, index: i, dayLabel: null, firstOfDay: false, dayStart: '' }));
  }

  function trackExport(format) {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ type: 'guide_export', source: format, owner_id: getOwnerId() }),
        keepalive: true
      }).catch(() => {});
    } catch (e) { /* analytics must never block an export */ }
  }

  function guideAsText(saved) {
    const g = saved.guide || {};
    const lines = [g.title || 'Your DayHop guide'];
    if (g.city) lines.push(g.city);
    if (g.start_time) lines.push(`Starts around ${g.start_time}`);
    lines.push('');
    flattenGuideStops(g).forEach(({ stop, index, dayLabel, firstOfDay, dayStart }) => {
      if (firstOfDay) {
        lines.push(`— ${dayLabel}${dayStart ? ` (starts around ${dayStart})` : ''} —`);
      }
      const idea = stop.idea || {};
      lines.push(`${index + 1}. ${stop.title}${stop.suggested_time ? ` (${stop.suggested_time})` : ''}`);
      if (idea.location) lines.push(`   ${idea.location}`);
      if (stop.note) lines.push(`   📝 ${stop.note}`);
      if (stop.transition_note) lines.push(`   → ${stop.transition_note}`);
    });
    lines.push('', `Full guide: ${saved.share_url}`);
    return lines.join('\n');
  }

  function guideAsMarkdown(saved) {
    const g = saved.guide || {};
    const md = [`# ${g.title || 'Your DayHop guide'}`, ''];
    if (g.city) md.push(`**Where:** ${g.city}  `);
    if (g.start_time) md.push(`**Starts around:** ${g.start_time}`);
    md.push('');
    flattenGuideStops(g).forEach(({ stop, index, dayLabel, firstOfDay, dayStart }) => {
      if (firstOfDay) {
        md.push(`# ${dayLabel}`);
        if (dayStart) md.push(`**Starts around:** ${dayStart}`);
        md.push('');
      }
      const idea = stop.idea || {};
      md.push(`## ${index + 1}. ${stop.title}${stop.suggested_time ? ` — ${stop.suggested_time}` : ''}`);
      if (idea.why) md.push(idea.why);
      if (idea.location) md.push(`- 📍 ${idea.location}`);
      if (stop.note) md.push(`- 📝 ${stop.note}`);
      if (idea.booking_url) md.push(`- [Book](${idea.booking_url})`);
      if (idea.maps_url) md.push(`- [Map](${idea.maps_url})`);
      if (stop.transition_note) md.push(`- → ${stop.transition_note}`);
      md.push('');
    });
    if (g.notes) md.push(`> 💬 ${g.notes}`);
    md.push('', `Made with DayHop — full guide: ${saved.share_url}`);
    return md.join('\n');
  }

  function copyToClipboard(text, doneMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => { if (doneMsg) showToast(doneMsg); })
        .catch(() => {});
    }
  }

  async function handleExport(format) {
    const saved = await ensureGuideSaved();
    if (!saved) return;
    trackExport(format);
    const g = saved.guide || {};
    const shareTitle = g.title || 'My DayHop day guide';

    if (format === 'share') {
      if (navigator.share) {
        navigator.share({ title: shareTitle, text: `${shareTitle}${g.city ? ' — ' + g.city : ''}`, url: saved.share_url }).catch(() => {});
      } else {
        // Desktop without Web Share: copy the link and open an X intent.
        copyToClipboard(saved.share_url);
        const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(saved.share_url)}`;
        window.open(intent, '_blank', 'noopener');
        showToast('Link copied — sharing on X');
      }
    } else if (format === 'pdf') {
      // The share page carries the print stylesheet; ?print=1 auto-opens the
      // system print → Save as PDF dialog.
      window.open(`${saved.share_url}?print=1`, '_blank', 'noopener');
    } else if (format === 'email') {
      window.location.href = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(guideAsText(saved))}`;
    } else if (format === 'file') {
      const blob = new Blob([guideAsMarkdown(saved)], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(g.title || 'dayhop-guide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.md`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      showToast('Guide saved as Markdown');
    } else if (format === 'copy') {
      copyToClipboard(saved.share_url, 'Guide link copied');
    }
  }

  function wireExportBar() {
    const formats = { 'export-share': 'share', 'export-pdf': 'pdf', 'export-email': 'email', 'export-file': 'file', 'export-copy': 'copy' };
    Object.entries(formats).forEach(([id, format]) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => handleExport(format));
    });
  }

  // "New shortlist" — Pro feature once billing is live (free tier keeps its
  // single shortlist + one exported guide; fails open pre-Stripe).
  function handleNewShortlist() {
    if (state.billingConfigured && !state.isPro) {
      if (!isLoggedIn()) {
        showToast('Sign in first — new shortlists come with Pro.', { duration: 4500 });
        const authBtn = document.getElementById('auth-btn');
        if (authBtn && !authBtn.hidden) authBtn.click();
      } else {
        showUpgradeModal('new_shortlist');
      }
      return;
    }
    state.shortlist = [];
    state.savedGuide = null;
    state.lastPlan = null;
    persist();
    if (isLoggedIn()) fetch('/api/shortlist', { method: 'DELETE', headers: authHeaders() }).catch(() => {});
    updateShortlistCount();
    renderShortlistPanel();
    renderFeed(true);
    showToast('Fresh shortlist — pick your next day ✨');
  }

  // ---------- Instant discovery feed ----------
  // Fired when a location is committed (or restored on load) and no prompt
  // results are on screen: real candidates from /api/browse, no Grok,
  // sectioned server-side. Failures fall back silently to the empty state —
  // a proactive feature must never nag.
  let browseAbort = null;
  async function loadBrowseFeed() {
    if (!state.locationChosen || state.isGenerating) return;
    // Prompt results own the feed; browse only fills idle or browse-owned feeds.
    if (state.allIdeas.length && !state.browseMode) return;
    if (browseAbort) browseAbort.abort();
    const ctl = new AbortController();
    browseAbort = ctl;

    const feed = document.getElementById('discovery-feed');
    feed.setAttribute('aria-busy', 'true');
    document.getElementById('empty-state').hidden = true;
    document.getElementById('noresults-state').hidden = true;
    renderSkeletons();
    const progress = startProgress('browse');

    try {
      const coordsFresh = state.coords && Date.now() - state.coordsAt < COORDS_FRESH_MS;
      const res = await fetch('/api/browse', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          city: state.city,
          mode: state.mode,
          coords: coordsFresh ? state.coords : undefined,
          owner_id: getOwnerId()
        }),
        signal: ctl.signal
      });
      if (ctl !== browseAbort) { progress.fail(); return; } // superseded by a newer browse/prompt
      if (!res.ok) throw new Error('browse failed');
      const data = await res.json();
      progress.finish();
      state.allIdeas = data.ideas || [];
      state.browseMode = true;
      state.dismissedIds = new Set();
      state.lastPrompt = '';
      state.lastWeather = data.weather || null;
      state.lastAdvisories = data.advisories || [];
      state.lastAdvisoriesStatus = data.advisories_status || null;
      renderWeatherStrip(data.weather);
      renderAdvisoryStrip();
      renderResultsHeader();
      renderFeed(true);
    } catch (err) {
      progress.fail();
      if (err.name === 'AbortError') return;
      state.browseMode = false;
      renderFeed(); // repaints the empty state
    } finally {
      if (ctl === browseAbort && !state.isGenerating) {
        feed.setAttribute('aria-busy', 'false');
      }
    }
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

    // A prompt search always wins over an in-flight browse fetch.
    if (browseAbort) { browseAbort.abort(); browseAbort = null; }

    setLoading(true);
    const progress = startProgress('generate');
    try {
      const data = await apiGenerateIdeas(prompt, state.currentFilter);
      progress.finish();
      state.allIdeas = data.ideas || [];
      state.browseMode = false;
      state.dismissedIds = new Set();
      state.lastPrompt = prompt;
      state.lastWeather = data.weather || null;
      state.lastAdvisories = data.advisories || [];
      state.lastAdvisoriesStatus = data.advisories_status || null;
      renderWeatherStrip(data.weather);
      renderAdvisoryStrip();
      renderResultsHeader();
      renderFeed(true);
      bumpGeneratesUsed();
      document.getElementById('results-header').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      progress.fail();
      errorEl.textContent = err.message || 'Something went wrong. Please try again.';
      if (err.code === 'UPGRADE_REQUIRED') {
        bumpGeneratesUsed(true);
        showUpgradeModal('generate');
      } else {
        showToast(err.message || 'Could not generate ideas right now.', { duration: 3500 });
      }
    } finally {
      setLoading(false);
    }
  }

  // ---------- Pro tier (Phase 4) ----------
  // One upgrade modal for every Pro gate: a contextual first line (what just
  // hit the limit) above the full benefits list, so the prompt always answers
  // "why am I seeing this" AND "what do I get".
  // Outcome language, not feature language: each line names the day the
  // user was about to have, then removes the thing standing in its way.
  const UPGRADE_CONTEXTS = {
    generate: "You're out of plans for today — with Pro, a great day is never more than a sentence away.",
    saved_guides: 'Never lose a perfect day again — Pro keeps every plan you make, forever.',
    edit_guide: "You've made this plan yours — Pro saves your version so it's ready next weekend.",
    multi_day: 'Turn a great day into a great weekend — Pro plans 2–3 day getaways.',
    replan: 'Weather changed? Kids changed the mood? Pro re-plans as often as your day does.',
    new_shortlist: 'Start fresh whenever inspiration strikes — unlimited shortlists with Pro.'
  };

  function showUpgradeModal(context) {
    // No billing configured → nothing to sell yet; fall back to a soft toast.
    if (!state.billingConfigured) {
      showToast('DayHop Pro is coming soon ✨');
      return;
    }
    // First stage of the conversion funnel: which gate showed the modal.
    track('upgrade_viewed', { source: context });
    const ctx = document.getElementById('upgrade-context');
    ctx.textContent = UPGRADE_CONTEXTS[context] || 'Unlock everything DayHop can do.';
    const modal = document.getElementById('upgrade-panel');
    // Free-column numbers come from the server's entitlements so the modal
    // never contradicts the actual limits; static HTML values are fallbacks.
    if (state.entitlements) {
      modal.querySelectorAll('.compare-free[data-free]').forEach(el => {
        const limit = state.entitlements[el.dataset.free];
        if (limit != null) el.textContent = limit + (el.dataset.suffix || '');
      });
    }
    // Echo the gate that opened the modal in the comparison table.
    modal.querySelectorAll('.compare-row[data-context]').forEach(row =>
      row.classList.toggle('compare-hit', row.dataset.context === context));
    const cta = document.getElementById('upgrade-cta');
    cta.textContent = state.price && state.price.amount != null
      ? `Go Pro — $${state.price.amount} ${state.price.currency}/${state.price.interval} ✨`
      : 'Go Pro ✨';
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('modal--open'));
    overlayNav.opened('upgrade-panel');
  }

  function hideUpgradeModal() {
    const modal = document.getElementById('upgrade-panel');
    modal.classList.remove('modal--open');
    setTimeout(() => { modal.hidden = true; }, 200);
    overlayNav.closed('upgrade-panel');
  }

  function wireUpgradeModal() {
    document.getElementById('upgrade-cta').addEventListener('click', () => {
      hideUpgradeModal();
      startUpgrade();
    });
    document.getElementById('upgrade-later').addEventListener('click', hideUpgradeModal);
    document.querySelectorAll('[data-close-upgrade]').forEach(el => el.addEventListener('click', hideUpgradeModal));
  }

  // Keep every Pro-dependent bit of chrome in sync with the current tier:
  // PRO chips on gated controls appear only for free users with billing live.
  function updateProUi() {
    const gated = state.billingConfigured && !state.isPro;
    document.querySelectorAll('#day-selector .pro-chip').forEach(chip => { chip.hidden = !gated; });
    const replanChip = document.getElementById('replan-pro-chip');
    if (replanChip) replanChip.hidden = !gated;
    const myPlansBtn = document.getElementById('my-plans-btn');
    if (myPlansBtn) myPlansBtn.hidden = !isLoggedIn();
  }

  function setPlanDays(days) {
    // Free users can tap 2-3 days — that's the natural upgrade moment.
    if (days > 1 && state.billingConfigured && !state.isPro) {
      showUpgradeModal('multi_day');
      return;
    }
    state.planDays = days;
    document.querySelectorAll('.day-choice').forEach(btn =>
      btn.classList.toggle('active', Number(btn.dataset.days) === days));
    const label = document.querySelector('#build-day-btn .btn-label');
    if (label) label.textContent = days > 1 ? `Build my ${days}-day plan` : 'Build my day';
  }

  function wireDaySelector() {
    document.querySelectorAll('.day-choice').forEach(btn => {
      btn.addEventListener('click', () => setPlanDays(Number(btn.dataset.days)));
    });
  }

  async function startUpgrade() {
    if (!isLoggedIn()) {
      // Remember the intent so sign-in resumes checkout instead of dropping
      // the user back on the page to re-find the upgrade button.
      state.pendingUpgrade = true;
      showToast('Sign in first — we\'ll take you straight to checkout.', { duration: 4000 });
      const authBtn = document.getElementById('auth-btn');
      if (authBtn && !authBtn.hidden) authBtn.click();
      return;
    }
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url; // Stripe Checkout
      } else {
        showToast(data.message || 'Could not start checkout.', { duration: 4000 });
      }
    } catch (e) {
      showToast('Could not start checkout. Please try again.', { duration: 4000 });
    }
  }

  async function refreshProStatus() {
    const badge = document.getElementById('pro-badge');
    const goProBtn = document.getElementById('go-pro-btn');
    const adminLink = document.getElementById('admin-link');
    try {
      // Works signed-out too: the route still reports whether billing is
      // configured, which is what decides if the Go Pro button appears.
      // owner_id lets the server report today's usage for guests too.
      const res = await fetch(`/api/billing/status?owner_id=${encodeURIComponent(getOwnerId())}`,
        { headers: isLoggedIn() ? authHeaders() : {} });
      const data = await res.json();
      const pro = Boolean(res.ok && isLoggedIn() && data.pro);
      state.billingConfigured = Boolean(res.ok && data.configured);
      state.isPro = pro;
      state.entitlements = (res.ok && data.entitlements) || null;
      state.price = (res.ok && data.price) || null;
      state.usage = (res.ok && data.usage) || null;
      if (badge) badge.hidden = !pro;
      if (goProBtn) goProBtn.hidden = !(res.ok && data.configured && !pro);
      if (adminLink) adminLink.hidden = !(res.ok && isLoggedIn() && data.admin);
    } catch (e) {
      if (badge) badge.hidden = true;
      if (goProBtn) goProBtn.hidden = true;
      if (adminLink) adminLink.hidden = true;
    }
    // A tier change can unlock/lock multi-day: snap the selector back to a
    // valid choice and refresh all PRO chips.
    if (state.planDays > 1 && state.billingConfigured && !state.isPro) setPlanDays(1);
    updateProUi();
    renderPlansLeft();
  }

  // ---------- Plans-left meter ----------
  // Honest scarcity under the prompt box: one lit dot per free plan left
  // today. Only rendered for free-tier callers once billing is live — Pro,
  // preview, and admin never see it.
  function renderPlansLeft() {
    const el = document.getElementById('plans-left');
    if (!el) return;
    const ent = state.entitlements;
    const gated = state.billingConfigured && !state.isPro && ent && ent.daily_generates != null;
    if (!gated) { el.hidden = true; return; }

    const limit = ent.daily_generates;
    const used = Math.min(limit, (state.usage && state.usage.generates_today) || 0);
    const left = limit - used;
    const dots = Array.from({ length: limit }, (_, i) =>
      `<span class="plans-left-dot${i < used ? ' plans-left-dot--spent' : ''}"></span>`).join('');

    el.innerHTML = left > 0
      ? `<span class="plans-left-dots">${dots}</span><span>${left} of ${limit} free plan${limit === 1 ? '' : 's'} left today</span>`
      : `<span class="plans-left-dots">${dots}</span><span>Back tomorrow — or</span><button type="button" class="linklike" id="plans-left-upgrade">go Pro for unlimited ✨</button>`;
    const up = document.getElementById('plans-left-upgrade');
    if (up) up.addEventListener('click', () => showUpgradeModal('generate'));
    el.hidden = false;
  }

  // Local bump after a successful/blocked generate so the meter never waits
  // on a round-trip to feel truthful.
  function bumpGeneratesUsed(setToLimit) {
    if (!state.entitlements || state.entitlements.daily_generates == null) return;
    state.usage = state.usage || { generates_today: 0, replans_today: 0 };
    state.usage.generates_today = setToLimit
      ? state.entitlements.daily_generates
      : (state.usage.generates_today || 0) + 1;
    renderPlansLeft();
  }

  // Returning from Stripe Checkout (?billing=success|cancelled).
  function handleBillingReturn() {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get('billing');
    if (!billing) return;
    if (billing === 'success') {
      showToast('Welcome to DayHop Pro 🎉 Unlimited day plans unlocked.', { duration: 5000 });
      // Webhook processing can lag checkout by a moment.
      setTimeout(refreshProStatus, 2500);
    } else if (billing === 'cancelled') {
      showToast('No worries — Pro is here whenever you want it.');
    }
    params.delete('billing');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? '?' + rest : ''));
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
    const where = state.coords && state.locationLabel ? `near ${state.locationLabel}` : state.city;
    if (state.browseMode) {
      document.getElementById('results-headline').textContent = state.coords && state.locationLabel
        ? 'Happening near you 📍'
        : `Exploring ${state.city === GTA_WIDE ? 'the GTA' : state.city}`;
      const bits = [`${state.allIdeas.length} ideas to browse`, 'Describe your day for a tailored set'];
      if (state.lastWeather) {
        bits.splice(1, 0, `${state.lastWeather.temp_c}°C, ${state.lastWeather.description}`);
      }
      document.getElementById('results-sub').textContent = bits.join(' • ');
      header.hidden = false;
      return;
    }

    const words = (state.lastPrompt || '').split(/\s+/).filter(Boolean);
    const snippet = words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '');
    document.getElementById('results-headline').textContent = snippet
      ? `Here's what matches "${snippet}"`
      : "Here's what matches your plan";

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
    // Environmental feedback: today's actual sky tints the hero (CSS keys
    // off body[data-weather]) — subtle, but the interface feels the day.
    const tintFor = { Rain: 'rain', Drizzle: 'rain', Thunderstorm: 'rain', Snow: 'snow', Clouds: 'clouds', Clear: 'clear' };
    if (weather && tintFor[weather.condition]) {
      document.body.dataset.weather = tintFor[weather.condition];
    } else {
      delete document.body.dataset.weather;
    }
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

  // ---------- Advisories & closures ----------
  // The "should I even go today?" layer. One banner (highest severity),
  // extras behind "+N more", always sourced — and a failed check is shown
  // as "couldn't verify", never silently absent.
  const ADVISORY_RANK = { info: 0, caution: 1, warning: 2, danger: 3 };
  const ADVISORY_EMOJI = { weather: '⚠️', air_quality: '😷', closure: '🚫', fire: '🔥', other: '⚠️' };

  function advisorySort(list) {
    return [...(list || [])].sort((a, b) => (ADVISORY_RANK[b.severity] || 0) - (ADVISORY_RANK[a.severity] || 0));
  }

  // Banner-worthy advisories: caution and up. `info` stays in the details.
  function bannerAdvisories() {
    return advisorySort(state.lastAdvisories).filter(a => (ADVISORY_RANK[a.severity] || 0) >= ADVISORY_RANK.caution);
  }

  function advisoryLineHtml(a) {
    const src = a.source === 'derived'
      ? 'DayHop estimate from current conditions'
      : (a.source_name || 'verified source');
    return `<strong>${escapeHtml(ADVISORY_EMOJI[a.type] || '⚠️')} ${escapeHtml(a.title)}</strong> — ${escapeHtml(a.message)} <span class="advisory-source">${escapeHtml(src)}</span>`;
  }

  function renderAdvisoryStrip() {
    const el = document.getElementById('advisory-strip');
    if (!el) return;
    const list = bannerAdvisories();

    if (!list.length) {
      // Nothing active. Only speak up if we genuinely couldn't check —
      // implying "all clear" after a failed check would be a false promise.
      if (state.lastAdvisoriesStatus === 'unavailable' && state.allIdeas.length) {
        el.className = 'advisory-strip advisory-strip--unavailable';
        el.innerHTML = '<span class="advisory-main">Couldn\'t verify local advisories right now — check conditions before heading out.</span>';
        el.hidden = false;
      } else {
        el.hidden = true;
        el.innerHTML = '';
      }
      return;
    }

    const top = list[0];
    const rest = list.slice(1);
    el.className = `advisory-strip advisory-strip--${top.severity}`;
    el.innerHTML = `
      <span class="advisory-main">${advisoryLineHtml(top)}</span>
      ${rest.length ? `<button type="button" class="advisory-more" aria-expanded="false">+${rest.length} more</button>
      <div class="advisory-details" hidden>${rest.map(a => `<p>${advisoryLineHtml(a)}</p>`).join('')}</div>` : ''}
    `;
    el.hidden = false;

    const moreBtn = el.querySelector('.advisory-more');
    if (moreBtn) moreBtn.addEventListener('click', () => {
      const details = el.querySelector('.advisory-details');
      const open = details.hidden;
      details.hidden = !open;
      moreBtn.setAttribute('aria-expanded', String(open));
      moreBtn.textContent = open ? 'less' : `+${rest.length} more`;
    });
  }

  // A card-level conflict chip: only when a warning+ area advisory says
  // "stay out of the open air" AND this idea clearly lives in it. Closed
  // places never reach the feed (filtered server-side), so this is about
  // exposure, not closures.
  const ADVISORY_OUTDOOR_RE = /\b(park|trail|beach|garden|patio|splash|zoo|hik(e|ing)|outdoor|playground|conservation|falls|island|pier|boardwalk|farm|orchard|lookout|picnic|marina|paddle|kayak|canoe|bike|zipline|treetop|rooftop)\b/i;

  function advisoryConflictChip(idea) {
    const active = bannerAdvisories().filter(a =>
      (ADVISORY_RANK[a.severity] || 0) >= ADVISORY_RANK.warning &&
      a.effects && (a.effects.avoid_outdoor || a.effects.avoid_strenuous));
    if (!active.length) return null;
    const text = `${idea.title || ''} ${idea.why || ''} ${idea.category || ''}`;
    if (!ADVISORY_OUTDOOR_RE.test(text) && idea.category !== 'adventures') return null;
    return active[0].title; // e.g. "Extreme heat", "Smoky air today"
  }

  // Snapshot the advisory context onto a guide, so a saved/printed plan
  // carries what it was built (or re-planned) around.
  function stampGuideAdvisories(guide) {
    if (!guide) return;
    guide.advisories = bannerAdvisories()
      .filter(a => (ADVISORY_RANK[a.severity] || 0) >= ADVISORY_RANK.warning)
      .slice(0, 3)
      .map(a => ({ type: a.type, severity: a.severity, title: a.title, source_name: a.source_name || null, source: a.source }));
    guide.advisories_checked = state.lastAdvisoriesStatus === 'ok';
  }

  // The plan view's advisory trust line: what was checked, what was found.
  function planAdvisoryHtml(guide) {
    if (Array.isArray(guide.advisories) && guide.advisories.length) {
      const titles = guide.advisories.map(a => a.title).join(', ');
      const cls = guide.advisories.some(a => a.severity === 'danger') ? 'danger' : 'warning';
      return `<div class="plan-advisory plan-advisory--${cls}">⚠️ Heads up: ${escapeHtml(titles)} — this plan works around it, but conditions can change fast. Ask DayHop to re-plan if they do.</div>`;
    }
    if (guide.advisories_checked) {
      return '<div class="plan-advisory plan-advisory--clear">✓ No active advisories for this area when this plan was made</div>';
    }
    return '';
  }

  // ---------- Booking retention ----------
  // Every booking link opens in a new tab, so a Book click is a save signal,
  // not a goodbye: shortlist the idea (deduped; localStorage for guests, the
  // account for signed-in users), then raise the return sheet — a soft
  // "your plan is safe, come back when you're ready" moment with one clear
  // way back into planning. Plan stops are exempt — they're already part of
  // a built day.
  const returnSheet = { timer: null, lastIdea: null, clickedAt: 0, welcomedBack: false };

  function showReturnSheet({ idea, title, sub }) {
    const el = document.getElementById('return-sheet');
    if (!el) return;
    const thumb = document.getElementById('return-thumb');
    const src = (idea && (idea.image_url || categoryImage(idea.category, 200))) || categoryImage('general', 200);
    thumb.src = src;
    thumb.onerror = () => { thumb.src = categoryImage((idea && idea.category) || 'general', 200); };
    document.getElementById('return-title').textContent = title;
    document.getElementById('return-sub').textContent = sub;

    const DISMISS_MS = 9000;
    el.style.setProperty('--return-ms', DISMISS_MS + 'ms');
    el.hidden = false;
    // Force a restart of the visible state (and its timer hairline) even if
    // the sheet was already up for a previous idea.
    el.classList.remove('return-sheet--visible');
    void el.offsetWidth;
    requestAnimationFrame(() => el.classList.add('return-sheet--visible'));
    clearTimeout(returnSheet.timer);
    returnSheet.timer = setTimeout(hideReturnSheet, DISMISS_MS);
  }

  function hideReturnSheet() {
    const el = document.getElementById('return-sheet');
    if (!el) return;
    clearTimeout(returnSheet.timer);
    el.classList.remove('return-sheet--visible');
    setTimeout(() => { el.hidden = true; }, 320);
  }

  function wireReturnSheet() {
    const cont = document.getElementById('return-continue');
    const dismiss = document.getElementById('return-dismiss');
    if (cont) cont.addEventListener('click', () => {
      hideReturnSheet();
      track('booking_return_continue', returnSheet.lastIdea || {});
      renderShortlistPanel();
      openPanel('shortlist-panel');
    });
    if (dismiss) dismiss.addEventListener('click', hideReturnSheet);

    // The welcome-back beat: they booked, toured the partner site, and came
    // back to this tab — greet them once with their plan intact.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const since = Date.now() - returnSheet.clickedAt;
      if (!returnSheet.clickedAt || returnSheet.welcomedBack) return;
      if (since < 4000 || since > 20 * 60 * 1000) return; // real trip away, not a flick
      returnSheet.welcomedBack = true;
      const idea = returnSheet.lastIdea;
      showReturnSheet({
        idea,
        title: 'Welcome back 👋',
        sub: idea && idea.title
          ? `${idea.title} is safe on your shortlist — pick up right where you left off.`
          : 'Your shortlist is right where you left it.'
      });
    });
  }

  function handleBookingRetention(ideaRef, link, card) {
    const fromPlan = Boolean(link.closest('.plan-stop-links'));
    const id = ideaRef.id != null ? String(ideaRef.id) : null;
    let idea = id ? state.allIdeas.find(i => String(i.id) === id) : null;
    let saved = false;

    if (!fromPlan) {
      const alreadySaved = id && state.shortlist.some(i => String(i.id) === id);
      if (idea && !alreadySaved) {
        addToShortlist(idea, card, { silent: true });
        track('idea_auto_saved_on_booking', idea);
        saved = true;
      } else if (alreadySaved) {
        idea = state.shortlist.find(i => String(i.id) === id) || idea;
      }
    }

    returnSheet.lastIdea = idea || null;
    returnSheet.clickedAt = Date.now();
    returnSheet.welcomedBack = false;
    track('booking_return_prompt_shown', ideaRef);

    showReturnSheet({
      idea,
      title: saved ? 'Saved to your day ✨' : 'Booking opened in a new tab',
      sub: saved
        ? `The booking tab is open — ${idea.title} is on your shortlist, so nothing gets lost.`
        : 'Take your time over there. Your plan is waiting right here.'
    });
  }

  // ---------- Auth state ----------
  async function handleAuthChange(detail) {
    const wasLoggedIn = Boolean(state.user);
    state.user = detail && detail.user ? detail.user : null;
    if (state.user) {
      // First sign-in on this device → one signup event for the funnel.
      const seenKey = 'dayhop_signup_tracked_' + state.user.id;
      if (!localStorage.getItem(seenKey)) {
        localStorage.setItem(seenKey, '1');
        track('signup');
      }
      await onSignedIn();
    } else if (wasLoggedIn) {
      onSignedOut();
      state.pendingUpgrade = false;
    }
    await refreshProStatus();
    // Resume a "Go Pro" tap that was interrupted by the sign-in wall — unless
    // this account turned out to already be Pro.
    if (state.user && state.pendingUpgrade) {
      state.pendingUpgrade = false;
      if (!state.isPro) startUpgrade();
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
    state.myGuides = [];
    state.currentGuide = null;
    state.currentGuideId = null;
    state.savedGuide = null;
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

    // A refresh while an overlay was open leaves our synthetic history entry
    // on top — clear the marker so back behaves normally again.
    if (history.state && history.state.dayhopOverlay) history.replaceState(null, '');

    // Post-tournament sweep: the World Cup eyebrow becomes plain summer.
    if (!worldCupLive()) {
      const eyebrow = document.querySelector('.hero .eyebrow');
      if (eyebrow) eyebrow.textContent = 'Greater Toronto Area · Summer 2026';
    }

    // Zero-state sample plan — one tap to see a finished plan.
    const sampleBtn = document.getElementById('sample-plan-btn');
    if (sampleBtn) sampleBtn.addEventListener('click', showSamplePlan);

    // React to auth (auth.js dispatches on initial session + every change).
    document.addEventListener('dayhop:auth', (e) => handleAuthChange(e.detail));
    if (window.DayHopAuth && window.DayHopAuth.current) {
      const cur = window.DayHopAuth.current();
      if (cur && cur.user) handleAuthChange(cur);
    }

    document.getElementById('prompt-form').addEventListener('submit', handleGenerate);
    document.getElementById('go-pro-btn').addEventListener('click', startUpgrade);

    // Mode toggle (R&R / Adventure): tap or swipe, then paint the
    // mode-flavored chrome — accent, hint, placeholder, example prompts,
    // filter chips. Defaults to R&R; returning users keep their last mode.
    wireModeToggle();
    applyModeUi();
    renderFilterChips();

    // No-results: clear the active filter and show everything again.
    document.getElementById('reset-filter-btn').addEventListener('click', () => setFilter('all'));

    document.getElementById('shortlist-btn').addEventListener('click', () => {
      renderShortlistPanel();
      openPanel('shortlist-panel');
    });

    document.getElementById('build-day-btn').addEventListener('click', handleBuildDay);
    document.getElementById('surprise-me-btn').addEventListener('click', handleSurpriseMe);
    document.getElementById('new-shortlist-btn').addEventListener('click', handleNewShortlist);
    wireExportBar();
    wireReturnSheet();

    // Freemium surfaces: My Plans, plan editing, smart re-planning, trip
    // length, and the shared upgrade modal.
    document.getElementById('my-plans-btn').addEventListener('click', openMyPlans);
    document.getElementById('plan-edit-btn').addEventListener('click', toggleEditMode);
    document.getElementById('plan-save-btn').addEventListener('click', handleSavePlan);
    wireReplanBar();
    wireDaySelector();
    wireUpgradeModal();

    // Outbound click tracking (booking links are the affiliate-revenue metric)
    // + booking retention: the link opens in a new tab, so THIS tab is still
    // DayHop — auto-save the idea and invite the user to keep planning.
    document.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('a.card-booking-link');
      if (!link) return;
      const card = link.closest('.idea-card');
      const ideaRef = {
        id: link.dataset.ideaId || (card && card.dataset.id),
        source: link.dataset.ideaSource || undefined
      };
      const isMaps = link.classList.contains('card-booking-link--secondary');
      track(isMaps ? 'maps_click' : 'booking_click', ideaRef);
      if (!isMaps) handleBookingRetention(ideaRef, link, card);
    });

    // Offline awareness (PWA): the shell + saved data work offline; live
    // search and AI plans need a connection.
    window.addEventListener('offline', () =>
      showToast("You're offline — your saved plans and shortlist still work.", { duration: 4500 }));
    window.addEventListener('online', () => showToast('Back online ✨'));

    handleBillingReturn();
    refreshProStatus();

    renderFeed();

    // Instant discovery: a returning visitor with a remembered location
    // lands on a live feed instead of an empty state.
    if (state.locationChosen && !state.allIdeas.length) loadBrowseFeed();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
