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

  // Third-party card images arrive at whatever size their host serves —
  // the worst seen live was a 2.6 MB PNG rendered ~400px wide. /api/img
  // refetches once server-side, resizes to WebP, and Cloudflare edge-caches
  // it for a week. Own assets and data: URIs pass through untouched.
  function proxiedImage(url, w = 640) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('/') || url.startsWith('data:')) return url;
    if (!url.startsWith('https://')) return url;
    return '/api/img?u=' + encodeURIComponent(url) + '&w=' + w;
  }

  // ---------- Modes: R&R vs Adventure ----------
  // Two equal product personalities. The active mode shapes the browse feed,
  // search results, AI plans (server-side via the `mode` param), and the
  // client chrome below: filter chips, example prompts, placeholder, accent.
  const MODES = {
    rr: {
      hint: '🌿 Restorative days: gardens, trails, lookouts, calm water',
      feedTitle: "Today's calm escapes 🌿",
      placeholder: '3 unhurried hours near the water. A quiet garden, a scenic lookout, and somewhere relaxed to eat after.',
      switchToast: '🌿 R&R Mode on. New searches and plans will lean restful',
      filters: [
        { filter: 'all', label: 'All' },
        { filter: 'water', label: '🏖️ Calm Water' },
        { filter: 'culture', label: '🏛️ Culture' },
        { filter: 'kids', label: '👶 Family' },
        { filter: 'patios', label: '🍻 Patios' },
        { filter: 'food', label: '🍽️ Food' },
        { filter: 'cruises', label: '⛴️ Cruises' }
      ],
      examples: [
        { label: '🌿 Slow morning in nature', prompt: 'A slow, restorative morning. A peaceful garden or quiet trail, a scenic lookout, and a calm café to end at.' },
        { label: '🌧️ Rainy day with little kids', prompt: 'A rainy Saturday with two kids under 6. Somewhere calm indoors to unwind, then an easy lunch nearby.' },
        { label: '🏖️ Afternoon by the water', prompt: '3 relaxed hours near the water with my 4-year-old. A splash pad and somewhere easy to eat after.' }
      ]
    },
    adventure: {
      hint: '⛰️ Active days: ziplines, climbing, paddling, big thrills',
      feedTitle: "Today's thrills ⚡",
      placeholder: 'A full-throttle Saturday. Ziplining or climbing in the morning, kayaking after lunch, go-karts to finish.',
      switchToast: '⚡ Adventure Mode on. New searches and plans will lean thrilling',
      filters: [
        { filter: 'all', label: 'All' },
        { filter: 'adventures', label: '🚁 Big Experiences' },
        { filter: 'water', label: '🌊 Water Action' },
        { filter: 'cruises', label: '⛴️ On the Water' },
        { filter: 'kids', label: '👶 Family Thrills' },
        { filter: 'food', label: '🍽️ Refuel' }
      ],
      examples: [
        { label: '🧗 Adrenaline day for two', prompt: 'An adrenaline-filled day for two adults. Ziplining or treetop trekking, rock climbing, then a well-earned dinner.' },
        { label: '🚣 Paddle & pedal', prompt: 'An active day outdoors. Kayaking or paddleboarding in the morning, then a mountain bike trail after lunch.' },
        { label: '🏎️ Thrills with teens', prompt: 'A high-energy day with two teenagers. Go-karts, a climbing gym or trampoline park, and pizza after.' }
      ]
    }
  };

  // The FIFA World Cup 2026 sweep (worldcup filter chips + eyebrow gate)
  // retired with the July 19 final. The worldcup CATEGORY entries stay:
  // legacy shortlist/saved-plan items may still carry that category.

  // Toronto-local "today" as YYYY-MM-DD — matches the server's date-window
  // convention regardless of the device's own timezone.
  function torontoToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  }

  // Server-computed seasonal spotlight (/api/config): World Cup while it's
  // live, then the next Ontario stat holiday, then the one after — the hero
  // eyebrow stays current forever without a client redeploy. The hardcoded
  // sweep above remains as the instant/offline fallback.
  function applySpotlight(sp) {
    if (!sp) return;
    const eyebrow = document.querySelector('.hero .eyebrow');
    if (eyebrow && sp.eyebrow) {
      eyebrow.textContent = `Greater Toronto Area · ${sp.eyebrow}`;
    }
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
        suggested_time: '9:30 AM to 10:45 AM',
        transition_note: '15 min drive (or a scenic ride down Leslie St) to the park gates',
        note: '',
        idea: {
          id: 'sample-brioche',
          title: 'Bonjour Brioche',
          location: 'Queen St E, Riverside',
          why: 'A neighbourhood-institution French bakery. Croissants worth the weekend line, and the people-watching on Queen East is free.',
          duration_minutes: 75,
          cost_tier: '$$',
          category: 'food',
          image_url: categoryImage('food'),
          maps_url: 'https://maps.google.com/?q=Bonjour+Brioche,+Toronto'
        }
      },
      {
        title: 'Walk the spit at Tommy Thompson Park',
        suggested_time: '11:00 AM to 1:00 PM',
        transition_note: '10 min back up to Queen East for lunch',
        note: '',
        idea: {
          id: 'sample-tommy-thompson',
          title: 'Tommy Thompson Park',
          location: 'Leslie Street Spit, Toronto',
          why: 'A car-free peninsula jutting 5 km into Lake Ontario. Skyline views, cottonwood trails, and more birds than people.',
          duration_minutes: 120,
          cost_tier: 'free',
          category: 'general',
          image_url: categoryImage('general'),
          maps_url: 'https://maps.google.com/?q=Tommy+Thompson+Park,+Toronto'
        }
      },
      {
        title: 'Patio lunch & indie shops on Queen',
        suggested_time: '1:30 PM to 3:00 PM',
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
        suggested_time: '3:30 PM to 5:30 PM',
        transition_note: '',
        note: '',
        idea: {
          id: 'sample-cherry-beach',
          title: 'Cherry Beach',
          location: 'Unwin Ave, Port Lands',
          why: 'A locals\' beach with real sand, calm water, and shady trees. The unhurried way to close out a Saturday.',
          duration_minutes: 120,
          cost_tier: 'free',
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
    // Shortlist removals whose server DELETE hasn't been confirmed yet —
    // kept (and persisted) so a failed delete can't resurrect the item on
    // the next sign-in merge. String idea ids.
    pendingRemovals: new Set(),
    dismissedIds: new Set(),
    currentFilter: 'all',
    // 'recommended' keeps the server's curated order; 'distance' flattens the
    // feed into a nearest-first list (using the server-computed distance_km).
    sortBy: 'recommended',
    city: 'Richmond Hill',
    user: null,
    isGenerating: false,
    isBuildingPlan: false,
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
    lastMode: null,          // mode the last prompt ran in (results header)
    lastConstraints: null,   // { summary, age, activity } the server filtered by
    lastWeather: null,
    lastAdvisories: [],          // active advisories for the current area
    lastAdvisoriesStatus: null,  // 'ok' | 'partial' | 'unavailable'
    coords: null,        // { lat, lng } rounded to ~110 m, only if user opted in
    coordsAt: 0,
    locationLabel: null, // e.g. "Richmond Hill · L4C"
    locationChosen: false, // user must explicitly pick a location before searching
    browseMode: false,   // feed is showing the instant discovery feed, not prompt results
    surpriseMode: false, // browse-shaped feed came from "Surprise me" (affects header copy)
    isLoadingMore: false, // a "Next" page is in flight (never blanks the live feed)
    nextExhausted: false, // the surprise well ran dry — hide the Next button
    visited: {},         // "been there" quest marks: placeKey → ISO timestamp
    // "Date aware" picker (optional — see prompt-date section): null/null
    // means "any day", DayHop's implicit default. Toronto-local YYYY-MM-DD.
    planDate: null,
    planDateEnd: null
  };

  const COORDS_FRESH_MS = 30 * 60 * 1000;

  // Named "My Favs" lists (mobile Favs grid, Sept 2026). state.shortlist stays
  // the flat store every existing path reads; a list is just a name plus the
  // ids it holds. Guests keep these in localStorage, signed-in users mirror
  // them to /api/shortlists (best-effort). Empty until the favsGrid flag is on.
  state.lists = [];          // [{ id, serverId?, name, city, mood, created_at, itemIds: [] }]
  state.activeListId = null;
  state.favsGridFlag = false; // /api/config.favsGrid
  // Home feed layout, per browse response (routes/browse.js): 'top5' folds
  // every shelf past Top 5 → slot 6 → Talk of the town behind "More ideas".
  state.browseLayout = 'full';
  state.feedUnfolded = false;

  // ---------- Persistence (survive refresh) ----------
  const STORAGE_KEY = 'dayhop_state_v2';

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      state.shortlist = saved.shortlist || [];
      state.lists = Array.isArray(saved.lists) ? saved.lists.filter(l => l && l.id && Array.isArray(l.itemIds)) : [];
      state.activeListId = saved.activeListId || null;
      state.pendingRemovals = new Set((saved.pendingRemovals || []).map(String));
      if (saved.visited && typeof saved.visited === 'object') state.visited = saved.visited;
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
        lists: state.lists,
        activeListId: state.activeListId,
        pendingRemovals: [...state.pendingRemovals],
        visited: state.visited,
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

  // ---------- Draft plan rescue ----------
  // A freshly built (or edited-but-unsaved) plan is the most valuable thing
  // a user makes here — it must survive the panel closing, a refresh, or the
  // tab dying. Every unsaved plan is mirrored to localStorage and offered
  // back via a "resume" strip on the home screen until it's saved, replaced,
  // or dismissed. Saved guides live server-side and don't need the net.
  const DRAFT_KEY = 'dayhop_draft_guide_v1';
  const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  function persistDraft() {
    if (!state.currentGuide || state.currentGuideId) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ guide: state.currentGuide, at: Date.now() }));
    } catch (e) { /* quota — the in-memory copy still works this session */ }
    renderDraftResume();
  }

  function readDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (!draft || !draft.guide || Date.now() - (draft.at || 0) > DRAFT_MAX_AGE_MS) return null;
      return draft;
    } catch (e) { return null; }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    renderDraftResume();
  }

  function draftStopCount(guide) {
    if (Array.isArray(guide.days)) return guide.days.reduce((n, d) => n + ((d.stops || []).length), 0);
    return (guide.stops || []).length;
  }

  function renderDraftResume() {
    const wrap = document.getElementById('draft-resume');
    if (!wrap) return;
    const draft = readDraft();
    if (!draft) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    const stops = draftStopCount(draft.guide);
    wrap.innerHTML = `
      <div class="draft-resume-card">
        <div class="draft-resume-text">
          <span class="draft-resume-label">Unsaved plan</span>
          <strong>${escapeHtml(draft.guide.title || 'Your day, mapped out')}</strong>
          <span class="draft-resume-meta">${stops} stop${stops === 1 ? '' : 's'}. Picks up right where you left off</span>
        </div>
        <div class="draft-resume-actions">
          <button class="primary-btn draft-resume-open" type="button">Resume →</button>
          <button class="ghost-btn draft-resume-dismiss" type="button" aria-label="Discard this draft">✕</button>
        </div>
      </div>`;
    wrap.hidden = false;
    wrap.querySelector('.draft-resume-open').addEventListener('click', () => {
      track('draft_resumed', {});
      state.isSample = false;
      state.currentGuide = draft.guide;
      state.currentGuideId = null;
      state.savedGuide = null;
      state.lastChangeSummary = null;
      state.editMode = false;
      renderPlanView();
      openPanel('dayplan-panel');
    });
    wrap.querySelector('.draft-resume-dismiss').addEventListener('click', () => {
      clearDraft();
      showToast('Draft discarded');
    });
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
    document.querySelectorAll('#mode-toggle .mode-option').forEach(btn => {
      const checked = btn.dataset.mode === state.mode;
      btn.setAttribute('aria-checked', String(checked));
      // Roving tabindex: the radiogroup is ONE tab stop — Tab lands on the
      // checked mode, arrow keys (wireModeToggle) move within the group.
      btn.tabIndex = checked ? 0 : -1;
    });
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
    if (state.browseMode || !state.allIdeas.length) {
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
      .forEach(({ filter, label }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip' + (state.currentFilter === filter ? ' active' : '');
      chip.dataset.filter = filter;
      chip.textContent = label;
      chip.addEventListener('click', () => setFilter(filter));
      wrap.appendChild(chip);
    });
    // Sort toggle rides with the chips: one switch between the server's
    // curated order and a flat nearest-first list. Only shown when the feed
    // actually carries distances (updateFeedChrome keeps visibility current).
    const sortChip = document.createElement('button');
    sortChip.type = 'button';
    sortChip.id = 'sort-distance-chip';
    sortChip.className = 'filter-chip' + (state.sortBy === 'distance' ? ' active' : '');
    sortChip.textContent = '📍 Nearest first';
    sortChip.setAttribute('aria-pressed', state.sortBy === 'distance' ? 'true' : 'false');
    sortChip.hidden = !state.allIdeas.some(i => i.distance_km != null);
    sortChip.addEventListener('click', () => setSort(state.sortBy === 'distance' ? 'recommended' : 'distance'));
    // Lead the row: right after "All", ahead of the category chips.
    wrap.insertBefore(sortChip, wrap.children[1] || null);
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
        // Fill, don't fire: free plans are 3/day, so a curious tap must never
        // spend one. The user sees the words, tweaks them, submits when ready.
        const ta = document.getElementById('grok-prompt');
        ta.value = ex.prompt;
        // Programmatic fills don't fire 'input' — nudge the listeners that
        // key off it (the Surprise-me button hides while text is present).
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
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

  // Warm the Adventure hero photo the moment the user first shows interest
  // in the toggle (hover/focus/touch), instead of prefetching ~400 KB on
  // every page load for a mode most visitors never open. Width mirrors the
  // responsive breakpoints in main.css so the warmed URL is the one CSS asks
  // for. setMode's view transition cross-fades, so even a tap-with-no-hover
  // only gains from the head start.
  let adventureHeroWarmed = false;
  function warmAdventureHero() {
    if (adventureHeroWarmed) return;
    adventureHeroWarmed = true;
    const w = window.innerWidth < 640 ? 800 : window.innerWidth < 1200 ? 1400 : 2100;
    const img = new Image();
    img.src = `https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=${w}&q=80`;
  }

  function wireModeToggle() {
    const toggle = document.getElementById('mode-toggle');
    if (!toggle) return;
    ['pointerenter', 'focusin', 'touchstart'].forEach(ev =>
      toggle.addEventListener(ev, warmAdventureHero, { passive: true, once: false }));
    toggle.querySelectorAll('.mode-option').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    // Radio-pattern arrow keys: moving selects (same code path as a click).
    // Two radios, so every arrow flips to the other one; Home/End pin the
    // ends for completeness. Focus moves immediately even though the
    // aria-checked/tabindex repaint may ride a view transition.
    toggle.addEventListener('keydown', (e) => {
      if (!e.target.closest || !e.target.closest('.mode-option')) return;
      let next;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        next = state.mode === 'rr' ? 'adventure' : 'rr';
      } else if (e.key === 'Home') {
        next = 'rr';
      } else if (e.key === 'End') {
        next = 'adventure';
      } else {
        return;
      }
      e.preventDefault();
      const btn = toggle.querySelector('.mode-option[data-mode="' + next + '"]');
      if (btn) btn.focus();
      setMode(next); // no-ops when already there (Home/End on the same end)
    });
    addModeSwipe(toggle);
    // The rest of the hero swipes too — but never steal from the inputs,
    // the location combobox, or the toggle's own handler.
    addModeSwipe(document.querySelector('.hero'),
      'input, textarea, button, a, .location-combo, .location-listbox, .mode-toggle');
  }

  // ---------- "Date aware" picker ----------
  // Optional: collapsed = "any day" (today's implicit default, unchanged).
  // A disclosure panel, not an on/off switch — the toggle button only shows
  // or hides the fields; the filter itself lives in the date inputs and the
  // Clear button. First open with nothing chosen yet seeds today's date,
  // which is the "defaults to today" behavior.
  function wireDatePicker() {
    const toggle = document.getElementById('date-toggle');
    const fields = document.getElementById('date-fields');
    const startInput = document.getElementById('date-start');
    const endInput = document.getElementById('date-end');
    const sep = document.getElementById('date-range-sep');
    const kindSingle = document.getElementById('date-kind-single');
    const kindRange = document.getElementById('date-kind-range');
    const clearBtn = document.getElementById('date-clear-btn');
    if (!toggle || !fields || !startInput || !endInput || !kindSingle || !kindRange || !clearBtn) return;

    startInput.min = torontoToday();
    endInput.min = torontoToday();

    toggle.addEventListener('click', () => {
      const opening = fields.hidden;
      fields.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
      if (opening && !state.planDate && !startInput.value) {
        // Visual seed only. Committing waits for a real pick — "today" is
        // already the implicit default, and committing on open changed the
        // browse cache key, throwing away the live feed for a refetch of
        // semantically the same day.
        startInput.value = torontoToday();
      }
    });

    kindSingle.addEventListener('change', () => {
      if (!kindSingle.checked) return;
      sep.hidden = true;
      endInput.hidden = true;
      state.planDateEnd = null;
      updateDateToggleLabel();
      maybeRefreshForDateChange();
    });

    kindRange.addEventListener('change', () => {
      if (!kindRange.checked) return;
      sep.hidden = false;
      endInput.hidden = false;
      if (!endInput.value || endInput.value < startInput.value) endInput.value = startInput.value || torontoToday();
      endInput.min = startInput.value || torontoToday();
      // Switching to a range IS a real pick — commit the (possibly still
      // just seeded) start date so the range has a beginning.
      if (!state.planDate) state.planDate = startInput.value || torontoToday();
      state.planDateEnd = endInput.value;
      updateDateToggleLabel();
      maybeRefreshForDateChange();
    });

    startInput.addEventListener('change', () => {
      if (!startInput.value) startInput.value = torontoToday();
      state.planDate = startInput.value;
      endInput.min = startInput.value;
      if (endInput.value && endInput.value < startInput.value) endInput.value = startInput.value;
      if (kindRange.checked) state.planDateEnd = endInput.value;
      updateDateToggleLabel();
      maybeRefreshForDateChange();
    });

    endInput.addEventListener('change', () => {
      if (endInput.value && endInput.value < startInput.value) endInput.value = startInput.value;
      state.planDateEnd = endInput.value || startInput.value;
      updateDateToggleLabel();
      maybeRefreshForDateChange();
    });

    clearBtn.addEventListener('click', () => {
      startInput.value = '';
      endInput.value = '';
      kindSingle.checked = true;
      sep.hidden = true;
      endInput.hidden = true;
      state.planDate = null;
      state.planDateEnd = null;
      fields.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      updateDateToggleLabel();
      maybeRefreshForDateChange();
    });
  }

  function updateDateToggleLabel() {
    const label = document.getElementById('date-toggle-label');
    if (!label) return;
    if (!state.planDate) { label.textContent = 'Select Day'; return; }
    if (!state.planDateEnd || state.planDateEnd === state.planDate) {
      label.textContent = state.planDate === torontoToday() ? 'Today' : formatEventDate(state.planDate);
    } else {
      label.textContent = `${formatEventDate(state.planDate)} to ${formatEventDate(state.planDateEnd)}`;
    }
  }

  // { date, date_end } to fold into a generate/browse/replan request body —
  // {} when the picker is untouched ("any day", today's unchanged default).
  function getDatePayload() {
    if (!state.planDate) return {};
    return state.planDateEnd && state.planDateEnd !== state.planDate
      ? { date: state.planDate, date_end: state.planDateEnd }
      : { date: state.planDate };
  }

  // Changing the date while the instant discovery feed owns the screen
  // refreshes it right away; prompt results wait for the next explicit
  // "Plan my day" tap rather than re-running an AI call on every edit.
  function maybeRefreshForDateChange() {
    if (state.browseMode && !state.isGenerating) loadBrowseFeed();
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

  const combo = {
    input: null, listbox: null, activeIndex: -1, filtered: [], debounce: null, locating: false,
    // Live worldwide suggestions (server-proxied Places Autocomplete):
    // remote rows render under the instant local list once they arrive.
    remote: [], remoteFor: '', remoteLoading: false, remoteDebounce: null, remoteAbort: null
  };

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
    // No debounce: the local list is 24 hardcoded rows — filtering it is
    // microseconds, and delaying it only added 130 ms of perceived input
    // lag (which the remote fetch's own 200 ms debounce then stacked on).
    // openLocationList starts the remote debounce in the same call, so the
    // network request now leaves 130 ms sooner too.
    input.addEventListener('input', () => openLocationList(input.value));
    input.addEventListener('keydown', onLocationKeydown);
    // Delay close so an option's mousedown/click can land first.
    input.addEventListener('blur', () => setTimeout(closeLocationList, 120));

    // ONE delegated listener instead of re-attaching 24+ per keystroke
    // (renderLocationOptions rebuilds the rows on every repaint).
    listbox.addEventListener('mousedown', (e) => {
      const li = e.target.closest('.location-option[data-kind]');
      if (!li) return;
      e.preventDefault(); // keep focus so blur doesn't pre-empt the select
      commitLocationOption(li);
    });
  }

  function openLocationList(query) {
    const raw = (query || '').trim();
    // The synthetic "Near you" label isn't a search query — show the full list.
    const q = raw.startsWith('📍') ? '' : raw.toLowerCase();
    combo.filtered = q
      ? LOCATION_OPTIONS.filter(o => o.city.toLowerCase().includes(q) || o.region.toLowerCase().includes(q))
      : LOCATION_OPTIONS.slice();
    combo.activeIndex = -1;
    scheduleRemoteSuggestions(q);
    renderLocationOptions(q);
    combo.listbox.hidden = false;
    combo.input.setAttribute('aria-expanded', 'true');
  }

  // Fetch worldwide predictions for what's typed, debounced past the local
  // render so keystrokes stay instant. Results are biased near the user
  // (shared coords, else their chosen city) — the standard alternative to
  // making people pick a country first.
  function scheduleRemoteSuggestions(q) {
    clearTimeout(combo.remoteDebounce);
    if (!q || q.length < 2) {
      combo.remote = [];
      combo.remoteFor = '';
      combo.remoteLoading = false;
      if (combo.remoteAbort) { combo.remoteAbort.abort(); combo.remoteAbort = null; }
      return;
    }
    if (q === combo.remoteFor) return; // already have (or are fetching) these
    combo.remoteLoading = true;
    combo.remoteDebounce = setTimeout(async () => {
      if (combo.remoteAbort) combo.remoteAbort.abort();
      const ctl = new AbortController();
      combo.remoteAbort = ctl;
      combo.remoteFor = q;
      try {
        const params = new URLSearchParams({ q });
        const coordsFresh = state.coords && Date.now() - state.coordsAt < COORDS_FRESH_MS;
        if (coordsFresh) {
          params.set('lat', state.coords.lat);
          params.set('lng', state.coords.lng);
        } else if (state.locationChosen && state.city && state.city !== GTA_WIDE) {
          params.set('near', state.city);
        } else {
          params.set('near', 'Toronto, ON'); // GTA default bias, never a hard filter
        }
        const res = await fetch(`/api/geo/autocomplete?${params}`, { signal: ctl.signal });
        if (ctl !== combo.remoteAbort) return; // superseded by newer keystrokes
        const data = res.ok ? await res.json() : { suggestions: [] };
        // Local rows already cover the GTA — drop remote echoes of them.
        const localShown = new Set(combo.filtered.map(o => o.city.toLowerCase()));
        combo.remote = (data.suggestions || []).filter(s => !localShown.has(String(s.main || '').toLowerCase()));
      } catch (e) {
        if (e.name === 'AbortError') return;
        combo.remote = [];
      } finally {
        if (ctl === combo.remoteAbort) {
          combo.remoteLoading = false;
          combo.remoteAbort = null;
          // Only repaint if the dropdown is still open on the same query.
          const now = (combo.input.value || '').trim().toLowerCase();
          if (!combo.listbox.hidden && now === q) renderLocationOptions(q);
        }
      }
    }, 200);
  }

  function renderLocationOptions(q) {
    const lb = combo.listbox;
    const rows = [];

    // Pinned: geolocation on an explicit user gesture (never on page load).
    rows.push(`
      <li id="loc-opt-geo" class="location-option location-option--geo" role="option" data-kind="geo">
        <span class="opt-city">${combo.locating ? '📍 Locating…' : '📍 Use my current location'}</span>
        <span class="opt-region">Ideas around the corner</span>
      </li>`);

    rows.push(...combo.filtered.map((o, i) => `
      <li id="loc-opt-${i}" class="location-option" role="option"
          data-kind="city" data-city="${escapeAttr(o.city)}" aria-selected="${o.city === state.city}">
        <span class="opt-city">${highlight(o.city, q)}</span>
        ${o.region ? `<span class="opt-region">${escapeHtml(o.region)}</span>` : ''}
      </li>`));

    // Live worldwide matches (Places Autocomplete, biased near the user):
    // any city, address, neighbourhood, or postal code on Earth.
    if (q && combo.remote.length) {
      rows.push(...combo.remote.map((s, i) => `
        <li id="loc-remote-${i}" class="location-option location-option--remote" role="option"
            data-kind="remote" data-text="${escapeAttr(s.text)}">
          <span class="opt-city">${highlight(s.main, q)}</span>
          ${s.secondary ? `<span class="opt-region">${escapeHtml(s.secondary)}</span>` : ''}
        </li>`));
    } else if (q && combo.remoteLoading) {
      rows.push(`
        <li class="location-option location-option--empty" aria-hidden="true">
          Searching places…
        </li>`);
    }

    // Anything typed is still searchable verbatim as free text — the
    // always-there fallback if predictions miss or the network hiccups.
    if (q && !combo.filtered.some(o => o.city.toLowerCase() === q)) {
      rows.push(`
        <li id="loc-opt-search" class="location-option location-option--search" role="option" data-kind="search" data-text="${escapeAttr(q)}">
          <span class="opt-city">🔎 Search “${escapeHtml(q)}”</span>
          <span class="opt-region">City, address, zip or postal code</span>
        </li>`);
    }

    lb.innerHTML = rows.join('');
    // Selection is handled by the delegated mousedown listener installed in
    // setupLocationCombo — no per-row listeners to attach.
  }

  function commitLocationOption(li) {
    const kind = li.dataset.kind;
    if (kind === 'geo') { useMyLocation(); return; }
    if (kind === 'remote') { selectFreeTextLocation(li.dataset.text); return; }
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
      showToast("Your browser doesn't support location. Type a city or postal code instead.");
      return;
    }
    // Geolocation only exists on HTTPS (or localhost) — surface that as
    // guidance, not a mysterious failure.
    if (window.isSecureContext === false) {
      showToast('Location needs a secure (https) connection. Type a city or postal code instead.', { duration: 4500 });
      return;
    }

    const start = () => {
      combo.locating = true;
      combo.geoRetried = false;
      renderLocationOptions('');
      // Fast-first: a coarse cached fix beats a long GPS wait for "ideas
      // near me". onGeoError retries once with high accuracy if this times
      // out or the position is momentarily unavailable.
      navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 300000
      });
    };

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(status => {
        if (status.state === 'denied') {
          showToast('Location is blocked in your browser settings. Type a city or postal code instead.', { duration: 4500 });
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
      // If the user picked a typed city while this lookup was in flight,
      // their explicit choice wins — a late response must not overwrite it.
      if (!state.coords || state.coords.lat !== lat || state.coords.lng !== lng) return;
      if (res.ok) {
        const data = await res.json();
        state.city = data.city || state.city;
        state.locationLabel = data.label || data.city || 'your area';
      } else {
        state.locationLabel = 'your area';
      }
    } catch (e) {
      if (!state.coords || state.coords.lat !== lat || state.coords.lng !== lng) return;
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
    const blocked = err && err.code === 1; // PERMISSION_DENIED
    // Transient miss (timeout / position unavailable): one more try, this
    // time asking for a fresh high-accuracy fix — the two-stage pattern
    // that rescues devices whose cached coarse fix has gone stale.
    if (!blocked && !combo.geoRetried) {
      combo.geoRetried = true;
      navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      });
      return;
    }
    combo.locating = false;
    renderLocationOptions('');
    showToast(blocked
      ? 'No problem. Search a city, address, or postal code instead.'
      : "Couldn't get your location. Search a city or postal code instead.", { duration: 4500 });
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

  // ---------- Overlay focus management (a11y) ----------
  // One shared helper behind every aria-modal surface. Every open/close path
  // already funnels through overlayNav.opened/closed below — openPanel /
  // closePanel, the upgrade + membership modals, and auth.js via the
  // DayHopOverlayNav hooks — so wiring in here covers the ✕ buttons, the
  // backdrops, Escape, AND the phone-back popstate path with zero
  // per-dialog listeners.
  //
  // On open: remember the opener, move focus into the dialog, and make the
  // page behind it inert so Tab can't wander into the background. On close:
  // lift inert (only when the last overlay goes) and hand focus back to the
  // opener. A stack rather than a single slot, because overlays legitimately
  // pile up — e.g. the upgrade modal over the shortlist panel — and each
  // close must restore the focus IT stole, not the bottom one's.
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusStack = []; // { id, opener } — one entry per open overlay

  // The overlays are body-level siblings, so the whole background is these
  // five regions: skip link, hero (topbar included), main, the floating
  // shortlist button, and the footer. Toast + return sheet stay live —
  // they're status regions, not tab stops that could dive under the modal.
  function setBackgroundInert(on) {
    if (!('inert' in HTMLElement.prototype)) return; // fallback trap below
    ['.skip-link', '.hero', '#main', '#shortlist-btn', '.site-footer'].forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.inert = on;
    });
  }

  function focusOverlayOpened(id) {
    // Re-opening an already-open overlay (openPanel doesn't guard against
    // double-opens) must not re-capture an opener from inside itself.
    if (focusStack.some(entry => entry.id === id)) return;
    // The control that opened the overlay still holds focus — our way back.
    focusStack.push({ id, opener: document.activeElement });
    setBackgroundInert(true);
    const overlay = document.getElementById(id);
    if (!overlay) return;
    // One frame later: openers un-hide first and add their --open class in a
    // rAF of their own, so focusing after that settles is reliable. (auth.js
    // then moves focus onward to its email field — fine, later wins.)
    requestAnimationFrame(() => {
      if (overlay.hidden) return; // closed again within the same frame
      const target = overlay.querySelector('.panel-close, .modal-close') ||
        overlay.querySelector(FOCUSABLE) || overlay;
      if (target.focus) target.focus();
    });
  }

  function focusOverlayClosed(id) {
    let entry = null;
    let wasTop = false;
    for (let i = focusStack.length - 1; i >= 0; i--) {
      if (focusStack[i].id === id) {
        wasTop = i === focusStack.length - 1;
        entry = focusStack.splice(i, 1)[0];
        break;
      }
    }
    if (focusStack.length === 0) setBackgroundInert(false);
    // Only the topmost close hands focus back — closing a buried overlay
    // must not yank focus out of the one still on screen. In the stacked
    // case the opener often lives inside a lower overlay: still correct.
    if (wasTop && entry && entry.opener && entry.opener.isConnected &&
        typeof entry.opener.focus === 'function') {
      entry.opener.focus();
    }
  }

  // The phone-back path closes EVERY open overlay at once (see the popstate
  // handler below), so focus goes back to whoever opened the first one.
  function focusOverlaysUnwound() {
    const bottom = focusStack[0];
    focusStack.length = 0;
    setBackgroundInert(false);
    if (bottom && bottom.opener && bottom.opener.isConnected &&
        typeof bottom.opener.focus === 'function') {
      bottom.opener.focus();
    }
  }

  // Browsers without inert (pre-2022) get a minimal Tab cycle inside the
  // top overlay instead — deliberately small; inert does this properly
  // everywhere modern.
  if (!('inert' in HTMLElement.prototype)) {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !focusStack.length) return;
      const overlay = document.getElementById(focusStack[focusStack.length - 1].id);
      if (!overlay) return;
      const items = Array.from(overlay.querySelectorAll(FOCUSABLE))
        .filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = overlay.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault(); first.focus();
      }
    });
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
      focusOverlayOpened(id);
      this.open.add(id);
      if (!this.owned) {
        this.owned = true;
        history.pushState({ dayhopOverlay: true }, '');
      }
    },
    closed(id) {
      focusOverlayClosed(id);
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
    focusOverlaysUnwound();
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
        // The two app-owned modals close on Escape through the same helpers
        // (focus restore + history ride along); auth.js Escapes its own.
        const upgrade = document.getElementById('upgrade-panel');
        if (upgrade && upgrade.classList.contains('modal--open')) hideUpgradeModal();
        const membership = document.getElementById('membership-panel');
        if (membership && membership.classList.contains('modal--open')) hideMembershipModal();
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
  function serverShortlistAdd(idea, listId) {
    if (!isLoggedIn()) return Promise.resolve(true);
    // Named lists: the active list's server id rides along when known, so
    // the row lands in the right list. Legacy callers pass nothing.
    const list = listId === undefined ? favsActiveList() : null;
    const serverList = listId || (list && list.serverId) || undefined;
    return fetch('/api/shortlist', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(serverList ? { idea, list_id: serverList } : { idea })
    }).then(res => res.ok).catch(() => false);
  }

  function serverShortlistRemove(ideaId) {
    if (!isLoggedIn()) return;
    const id = String(ideaId);
    // Record the intent BEFORE firing: if the DELETE never lands (flaky
    // network, server cold start), the next sign-in merge would resurrect
    // the item from the server copy. The flag clears only on confirmation
    // and the delete retries on the next sync.
    state.pendingRemovals.add(id);
    persist();
    fetch(`/api/shortlist/${encodeURIComponent(ideaId)}`, {
      method: 'DELETE',
      headers: authHeaders()
    }).then(res => {
      if (res.ok || res.status === 404) {
        state.pendingRemovals.delete(id);
        persist();
      }
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
          // Affiliate clicks carry the product price so the admin dashboard
          // can estimate commission potential per click.
          price: idea && idea.price != null ? idea.price : undefined,
          currency: idea && idea.currency ? idea.currency : undefined,
          // Which feed shelf the card sat in — the click half of the admin
          // dashboard's per-shelf CTR. shelf_label is the client-side
          // grouping for prompt feeds (renderFeed stamps it).
          section: idea && (idea.section || idea.shelf_label) ? String(idea.section || idea.shelf_label) : undefined,
          owner_id: getOwnerId(),
          // Ad-campaign attribution (pixel.js first-touch capture); the
          // server only keeps it on funnel events.
          attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined
        }),
        keepalive: true // survives the page navigating to a booking site
      }).then(r => {
        // Silent failure is the enemy: a rejected event is invisible in the
        // admin numbers, so say so in the console (never to the user).
        if (r && !r.ok) console.warn('[track] ' + type + ' rejected: HTTP ' + r.status + ' via ' + (r.headers.get('server') || 'origin'));
      }).catch(() => {});
    } catch (e) { /* never let analytics break the app */ }
  }

  // ---------- Shelf impressions (viewport truth) ----------
  // The denominator of the admin dashboard's per-shelf CTR. The server used
  // to count every card in the feed payload as an impression — including
  // everything below the fold nobody scrolled to — which drowned real
  // engagement to a ~0% CTR. A card counts only once it's actually been
  // half-seen, and counts batch into one shelf_seen event per flush instead
  // of a POST per card.
  const pendingShelfViews = Object.create(null);
  let shelfViewsDirty = false;
  const shelfSeenObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          shelfSeenObserver.unobserve(en.target);
          const label = en.target.dataset.section;
          if (label) {
            pendingShelfViews[label] = (pendingShelfViews[label] || 0) + 1;
            shelfViewsDirty = true;
          }
        }
      }, { threshold: 0.5 })
    : null;

  function flushShelfViews() {
    if (!shelfViewsDirty) return;
    shelfViewsDirty = false;
    const shelves = Object.assign({}, pendingShelfViews);
    for (const k in pendingShelfViews) delete pendingShelfViews[k];
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ type: 'shelf_seen', shelves, owner_id: getOwnerId() }),
        keepalive: true // the tab-close flush must survive the page going away
      }).catch(() => {});
    } catch (e) { /* never let analytics break the app */ }
  }
  setInterval(flushShelfViews, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushShelfViews();
  });

  // ---------- API ----------
  async function apiGenerateIdeas(prompt, filter) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(Object.assign(
        // fast: two-phase — the server answers with the ranked real-place
        // pool in seconds (phase:'fast' + a job token) and keeps curating;
        // startCuratedPoll swaps the AI-curated set in when it lands.
        { prompt, filter, fast: true, mode: state.mode, city: state.city, coords: state.coords || undefined, owner_id: getOwnerId(),
          // First-touch campaign attribution (pixel.js) — lets the server
          // stamp prompt_generated with utm, closing the "did the ad click
          // ever reach the product loop" measurement gap.
          attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined },
        getDatePayload()
      ))
    });
    // .catch: a proxy 502/504 serves an HTML error page — res.json() would
    // throw a raw SyntaxError that ends up in the user-facing toast. A null
    // body on a 200 (truncated response) fails the same clean way.
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const err = new Error((data && data.message) || 'Could not generate ideas');
      err.code = data && data.error;
      throw err;
    }
    return data; // { ideas, grounded, weather, generated_at }
  }

  // The "Surprise me" / "Next" feed: promptless, mode + location driven.
  // `exclude` carries everything already on screen; `wider: true` opens the
  // search radius for the unrelated-but-awesome pages.
  async function apiSurprise({ exclude, wider } = {}) {
    const coordsFresh = state.coords && Date.now() - state.coordsAt < COORDS_FRESH_MS;
    const res = await fetch('/api/surprise', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(Object.assign(
        {
          // Same fallback as browse: no chosen location still gets a feed.
          city: state.locationChosen ? state.city : GTA_WIDE,
          mode: state.mode,
          coords: coordsFresh ? state.coords : undefined,
          owner_id: getOwnerId(),
          exclude: exclude && exclude.length ? exclude : undefined,
          wider: wider || undefined
        },
        getDatePayload()
      ))
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const err = new Error((data && data.message) || 'Could not pull a surprise together');
      err.code = data && data.error;
      throw err;
    }
    return data; // { ideas, weather, advisories, city, near, exhausted, generated_at }
  }

  async function apiBuildPlan(items, days) {
    // Auth headers matter here: multi-day is gated on the caller's tier.
    const res = await fetch('/api/generate/plan', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ items, city: state.city, days: days || 1, mode: state.mode, owner_id: getOwnerId() })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const err = new Error((data && data.message) || 'Could not build your day plan');
      err.code = data && data.error;
      err.feature = data && data.feature;
      throw err;
    }
    return data;
  }

  async function apiReplan(guide, instruction) {
    const res = await fetch('/api/generate/replan', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(Object.assign(
        {
          guide,
          instruction,
          mode: state.mode,
          city: guide.city || state.city,
          coords: state.coords || undefined,
          owner_id: getOwnerId()
        },
        getDatePayload()
      ))
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const err = new Error((data && data.message) || 'Could not re-plan your day');
      err.code = data && data.error;
      err.feature = data && data.feature;
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
    // Reversed once, not per tick — this interval runs 6-7×/s for the whole
    // load, exactly while the main thread is busiest.
    const stagesDesc = [...stages].reverse();
    let lastPctText = '';

    const tick = setInterval(() => {
      // A background tab doesn't need progress paints — and skipping them
      // keeps the tab eligible for deeper throttling.
      if (document.hidden) return;
      const t = Date.now() - t0;
      const f = Math.min(t / est, 1);
      // Ease out to 90% at the estimate, then asymptotically crawl toward 99
      // — motion never stops, so a slow request still reads as "working".
      const p = t <= est
        ? 90 * (1 - Math.pow(1 - f, 1.8))
        : 90 + 9 * (1 - Math.exp(-(t - est) / est));
      fillEl.style.width = `${p}%`;
      const pctText = `${Math.round(p)}%`;
      if (pctText !== lastPctText) { lastPctText = pctText; pctEl.textContent = pctText; }
      if (t > est * 1.25) {
        stageEl.textContent = '⏳ Taking a bit longer than usual. Worth it';
        hintEl.textContent = 'Almost there…';
      } else {
        const stage = stagesDesc.find(s => f >= s.at) || stages[0];
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
    // Set lookup, not .find() inside .filter(): 120 ideas × 25 shortlist
    // items × 3 calls per render was ~9,000 linear comparisons.
    const shortlistIds = new Set(state.shortlist.map(s => s.id));
    return state.allIdeas.filter(idea => {
      if (state.dismissedIds.has(idea.id)) return false;
      if (shortlistIds.has(idea.id)) return false;
      if (state.currentFilter !== 'all' && idea.category !== state.currentFilter) return false;
      return true;
    });
  }

  function renderFeed(animate = false) {
    const feed = document.getElementById('discovery-feed');
    // Full rebuild: stop watching the cards that are about to leave the DOM
    // so the impression observer never accumulates dead targets.
    if (shelfSeenObserver) shelfSeenObserver.disconnect();
    feed.innerHTML = '';
    resetTileArt();
    const ideas = visibleIdeas();

    let stopIndex = 0;
    // Top-5 layout: server-flagged fold:true ideas (and a header whose whole
    // shelf is folded) render hidden until "More ideas" (unfoldFeed). They
    // stay in the DOM so unfolding is instant and STOP numbers hold.
    const folded = state.browseMode && state.browseLayout === 'top5' && !state.feedUnfolded;
    const appendSection = (label, group, showHeaders, bestIds) => {
      if (group.length === 0) return;
      if (showHeaders) {
        const header = document.createElement('h3');
        header.className = 'feed-section-header';
        header.textContent = label;
        if (folded && group.every(i => i.fold)) header.classList.add('is-folded');
        feed.appendChild(header);
      }
      group.forEach(idea => {
        // Remember which shelf this render put the card on — engagement
        // events attribute to it (a server section, when present, wins).
        idea.shelf_label = label;
        const best = Boolean(bestIds && bestIds.has(idea.id));
        feed.appendChild(favsGridActive()
          ? createIdeaTile(idea, stopIndex++, best)
          : createIdeaCard(idea, stopIndex++, animate, best));
        if (folded && idea.fold) feed.lastElementChild.classList.add('is-folded');
      });
    };

    // Prompt results open with the Best Match hero: the single strongest
    // direct answer, pulled out of the grid and given real estate + the
    // evidence for why it won. Only when there's a real field to beat.
    // Sectioned cards ("Next" pages ride in with idea.section) are ignored
    // here so an append can't retroactively kill the hero.
    // Mobile Favs grid: square tiles instead of cards, no hero (the first
    // tile carries the best-match badge). Desktop / flag-off is untouched.
    const grid = favsGridActive();
    feed.classList.toggle('feed--grid', grid);
    let heroIdea = null;
    if (!grid && !state.browseMode && state.sortBy !== 'distance') {
      const onTargetAll = ideas.filter(i => !i.section && !i.wow_reason && !i.more_find);
      if (onTargetAll.length >= 3) heroIdea = onTargetAll[0];
    }
    if (heroIdea) {
      feed.appendChild(createBestMatchCard(heroIdea, animate));
      if (animate && window.DayHopMotion) window.DayHopMotion.bestMatchIn(feed.lastElementChild);
    }

    if (state.sortBy === 'distance') {
      const { sections, unplaced } = distanceSections(ideas, state.browseMode);
      sections.forEach(sec => appendSection(sec.label, sec.ideas, sec.headers));
      if (unplaced > 0) feed.appendChild(buildUnplacedNote(unplaced));
    } else if (state.browseMode && ideas.some(i => i.section)) {
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
      // Break cards slot into the folded run; they arrive with unfoldFeed().
      if (!(folded && ideas.some(i => i.fold))) insertFeedBreakCards(feed);
    } else {
      // Prompt results: the direct answers first (minus the hero, which is
      // already on stage), then the "didn't know you could do that" picks,
      // then the rest of the grounded pool (real places that survived the
      // quality gate but weren't AI-curated headliners). Cards carrying a
      // server section arrived via "Next" — they get their own labeled
      // shelves after the prompt sections, in encounter order.
      const unsectioned = ideas.filter(i => !i.section);
      const onTarget = unsectioned.filter(i => !i.wow_reason && !i.more_find && (!heroIdea || i.id !== heroIdea.id));
      const beyond = unsectioned.filter(i => i.wow_reason && !i.more_find);
      const more = unsectioned.filter(i => i.more_find);
      const appended = ideas.filter(i => i.section);
      const showHeaders = (onTarget.length > 0 && beyond.length > 0) || more.length > 0 || appended.length > 0;
      // Runner-up crown: with the hero extracted, badge the next-best pick
      // only when the remaining field is big enough for it to mean something.
      const bestIds = new Set(onTarget.length >= 4 ? [onTarget[0].id] : []);
      appendSection(heroIdea ? 'Also right on target' : 'Right on target', onTarget, showHeaders, bestIds);
      appendSection('Beyond what you asked ✨', beyond, showHeaders);
      appendSection('More great finds nearby', more, showHeaders);
      const order = [];
      const groups = new Map();
      appended.forEach(idea => {
        const label = idea.section;
        if (!groups.has(label)) { groups.set(label, []); order.push(label); }
        groups.get(label).push(idea);
      });
      order.forEach(label => appendSection(label, groups.get(label), true));
    }

    updateFeedChrome(ideas);
    if (grid && ideas.length) favsCoachMark(); // once per device, first tile feed
  }

  // Nearest-first sections. A place with no distance cannot be placed in a
  // nearest-first list, so it is left out of this sort (renderFeed adds one
  // line saying how many, with a way back) instead of shelved as "Distance
  // unknown" under a "near me" search. Browse is one flat sorted list:
  // sorting inside the server's sections would leave far-away "Within 15
  // minutes" cards above nearby "More to explore" ones and read as broken.
  // Prompt results keep their labeled sections, each sorted nearest first,
  // so "more finds" stay under their own header in this sort too.
  // Returns { sections: [{ label, ideas, headers }], unplaced }.
  function distanceSections(ideas, browseMode) {
    const byKm = (a, b) => a.distance_km - b.distance_km;
    const located = ideas.filter(i => i.distance_km != null);
    const unplaced = ideas.length - located.length;
    if (browseMode) return { sections: [{ label: 'Closest first 📍', ideas: located.sort(byKm), headers: false }], unplaced };
    const onTarget = located.filter(i => !i.section && !i.wow_reason && !i.more_find).sort(byKm);
    const beyond = located.filter(i => !i.section && i.wow_reason && !i.more_find).sort(byKm);
    const more = located.filter(i => !i.section && i.more_find).sort(byKm);
    const appended = located.filter(i => i.section);
    const headers = (onTarget.length > 0 && beyond.length > 0) || more.length > 0 || appended.length > 0;
    const sections = [
      { label: 'Right on target', ideas: onTarget, headers },
      { label: 'Beyond what you asked ✨', ideas: beyond, headers },
      { label: 'More great finds nearby', ideas: more, headers }
    ];
    const bySection = new Map();
    appended.forEach(idea => {
      if (!bySection.has(idea.section)) bySection.set(idea.section, []);
      bySection.get(idea.section).push(idea);
    });
    bySection.forEach((group, label) => sections.push({ label, ideas: group.sort(byKm), headers: true }));
    return { sections, unplaced };
  }

  // Nearest-first leaves out what has no distance; say so, with a way back.
  function buildUnplacedNote(n) {
    const note = document.createElement('p');
    note.className = 'feed-unplaced-note';
    note.textContent = `${n} ${n === 1 ? 'place has' : 'places have'} no distance and ${n === 1 ? 'is' : 'are'} not in this list. `;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'linklike';
    back.textContent = 'Show all in recommended order';
    back.addEventListener('click', () => setSort('recommended'));
    note.appendChild(back);
    return note;
  }

  // A section header (or the best-match hero, which carries the same rule)
  // always starts a fresh row in the 720px+ two-column grid (both are
  // grid-column: 1/-1 in main.css) — so a run of plain cards between one
  // full-span element and the next is exactly what can leave a lone card in
  // a half-empty last row while scrolling. Rather than a gap, that lone card
  // spans both columns and switches to a photo-left, detail-more-visible
  // layout (.idea-card--wide): a deliberate "featured" moment, not an
  // accident. Break cards (capture-card) take one grid cell like an idea
  // card and count toward the run, but are never themselves widened — their
  // callout styling already reads as intentional.
  //
  // Re-derived from scratch on every call (cheap at feed scale) because
  // "More ideas" (unfoldFeed), "Next" pagination (appendIdeasToFeed), and
  // dismissing a single card (removeIdeaCardInPlace) all reshuffle or extend
  // the sequence after the fact — this runs from updateFeedChrome, the one
  // choke point every feed mutation already passes through.
  function widenOddTrailingCards(feed) {
    let run = [];
    const flush = () => {
      const last = run[run.length - 1];
      if (run.length % 2 !== 0 && last && last.classList.contains('idea-card')) {
        last.classList.add('idea-card--wide');
      }
      run = [];
    };
    for (const el of feed.children) {
      el.classList.remove('idea-card--wide');
      if (el.classList.contains('is-folded')) continue; // display:none — not part of the grid
      if (el.classList.contains('feed-section-header') || el.classList.contains('best-match')) {
        flush();
        continue;
      }
      run.push(el);
    }
    flush();
  }

  // The feed's supporting cast — empty/no-results states, the idea-count
  // line, the collections shelf. Shared by the full render and the
  // single-card removal path so the two can't drift.
  function updateFeedChrome(precomputedIdeas) {
    // Cards just left the DOM — drop any ScrollTriggers still bound to them.
    if (window.DayHopMotion && window.DayHopMotion.reap) window.DayHopMotion.reap();
    // Callers that just computed the visible list pass it in — recomputing
    // it here doubled the filter work on every render.
    const ideas = precomputedIdeas || visibleIdeas();
    const hasIdeas = state.allIdeas.length > 0;
    const feedEl = document.getElementById('discovery-feed');
    if (feedEl) widenOddTrailingCards(feedEl);
    // Empty: nothing generated yet. No-results: ideas exist but the filter/swipes hid them all.
    document.getElementById('empty-state').hidden = state.isGenerating || hasIdeas;
    document.getElementById('noresults-state').hidden = state.isGenerating || !hasIdeas || ideas.length > 0;

    document.getElementById('idea-count').textContent = !hasIdeas
      ? 'Tell DayHop your plan to get started'
      : `${ideas.length} idea${ideas.length === 1 ? '' : 's'} · ${state.shortlist.length} on your shortlist`;

    // "Next" lives under every non-empty feed (browse, prompt, surprise) —
    // it always means "more unrelated-but-awesome, wider out" — until the
    // surprise well runs dry for this feed.
    // Top-5 layout: while shelves are folded, "More ideas" stands in for
    // "Next" — one control at the bottom, never two.
    const foldedNow = state.browseMode && state.browseLayout === 'top5' && !state.feedUnfolded &&
      ideas.some(i => i.fold);
    const feedMore = document.getElementById('feed-more');
    if (feedMore) feedMore.hidden = !foldedNow || state.isGenerating;
    const feedNext = document.getElementById('feed-next');
    if (feedNext) feedNext.hidden = !hasIdeas || state.isGenerating || state.nextExhausted || foldedNow;

    // The nearest-first toggle only earns its spot when there are distances
    // to sort by (feeds without coords would just dump everything under
    // "Distance unknown").
    const sortChip = document.getElementById('sort-distance-chip');
    if (sortChip) sortChip.hidden = !hasIdeas || !state.allIdeas.some(i => i.distance_km != null);

    renderCollections();
  }

  // "More ideas": reveal the folded shelves in place (Top-5 layout). The
  // cards are already built and observed; unhiding them is all it takes.
  // Break cards (newsletter capture, guide promo) join the feed now that
  // there is a run long enough to host them.
  function unfoldFeed() {
    if (state.feedUnfolded) return;
    state.feedUnfolded = true;
    const feed = document.getElementById('discovery-feed');
    const first = feed.querySelector('.is-folded');
    feed.querySelectorAll('.is-folded').forEach(el => el.classList.remove('is-folded'));
    insertFeedBreakCards(feed);
    updateFeedChrome();
    if (first && first.scrollIntoView) {
      first.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }

  // Append-only page growth for "Next" pages: renderFeed used to wipe the
  // feed (innerHTML = '') and rebuild EVERY card — by page 4 that's 300
  // cards built to show 120, thousands of listener re-registrations, and
  // re-decoded images the user was actively looking at. Fresh cards build
  // into a fragment and land in one append; everything on screen is
  // untouched. Returns the first appended node (for the scroll-to-new
  // affordance) or null when nothing was appended.
  function appendIdeasToFeed(freshIdeas) {
    // A distance-sorted feed can't grow append-only — fresh cards must merge
    // into sorted position, so the full render owns that path.
    if (state.sortBy === 'distance') { renderFeed(false); return null; }
    const feed = document.getElementById('discovery-feed');
    // No cards yet (first load, or everything filtered away) — the full
    // render owns empty-feed layout, hero logic, and section merging.
    if (!feed.querySelector('.idea-card')) { renderFeed(false); return null; }

    const freshIds = new Set(freshIdeas.map(i => String(i.id)));
    const ideas = visibleIdeas().filter(i => freshIds.has(String(i.id)));
    if (!ideas.length) { updateFeedChrome(); return null; }

    let stopIndex = feed.querySelectorAll('.idea-card').length; // numbering continues
    const frag = document.createDocumentFragment();
    const order = [];
    const groups = new Map();
    ideas.forEach(idea => {
      const label = idea.section || 'More ideas';
      if (!groups.has(label)) { groups.set(label, []); order.push(label); }
      groups.get(label).push(idea);
    });
    // If the feed already ends in the same section this page opens with,
    // don't repeat the header — the new cards read as more of that shelf.
    const headers = feed.querySelectorAll('.feed-section-header');
    const trailingLabel = headers.length ? headers[headers.length - 1].textContent : null;
    order.forEach((label, i) => {
      if (!(i === 0 && label === trailingLabel)) {
        const header = document.createElement('h3');
        header.className = 'feed-section-header';
        header.textContent = label;
        frag.appendChild(header);
      }
      groups.get(label).forEach(idea => {
        idea.shelf_label = label;
        frag.appendChild(createIdeaCard(idea, stopIndex++, false, false));
      });
    });
    const firstNew = frag.firstChild;
    feed.appendChild(frag);
    updateFeedChrome();
    return firstNew;
  }

  // Surgical exit for one swiped/added card: removing a single element and
  // renumbering beats rebuilding every card, image, and listener in the
  // feed. Cards living outside the feed (plan stops, detail panel) still
  // take the full-render path.
  function removeIdeaCardInPlace(card) {
    const feed = document.getElementById('discovery-feed');
    if (!card || !feed.contains(card)) { renderFeed(); return; }
    card.remove();
    // A section whose last card just left takes its header with it.
    feed.querySelectorAll('.feed-section-header').forEach(h => {
      const next = h.nextElementSibling;
      if (!next || !(next.classList.contains('idea-card') || next.classList.contains('idea-tile'))) h.remove();
    });
    // Keep the trail's STOP numbers contiguous.
    feed.querySelectorAll('.idea-card').forEach((c, i) => {
      c.style.setProperty('--stop-index', i);
      const stamp = c.querySelector('.card-stamp');
      if (stamp) stamp.textContent = `STOP ${String(i + 1).padStart(2, '0')}`;
    });
    updateFeedChrome();
  }

  function createIdeaCard(idea, index, animate = false, bestMatch = false) {
    const card = document.createElement('article');
    card.className = 'idea-card';
    card.dataset.id = idea.id;
    // Shelf label rides into the DOM so the delegated outbound-link listener
    // can attribute booking/maps clicks to the shelf they came from, and so
    // the impression observer knows which shelf a half-seen card belongs to.
    const shelf = idea.section || idea.shelf_label;
    if (shelf) card.dataset.section = shelf;
    if (shelfSeenObserver) shelfSeenObserver.observe(card);
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
        <img src="${escapeAttr(proxiedImage(idea.image_url || categoryImage(idea.category), 640))}" alt="" loading="lazy" decoding="async"
          onerror="this.onerror=null;this.src='${escapeAttr(categoryImage(idea.category))}'">
        <span class="card-stamp">STOP ${stopNumber}</span>
        ${bestMatch ? '<span class="card-badge card-badge--best">🎯 Best match for you</span>' : ''}
        ${idea.sponsored ? '<span class="card-badge card-badge--sponsored">⭐ Sponsored</span>' : ''}
        ${!idea.sponsored && idea.wow_reason ? '<span class="card-badge card-badge--wow">✨ Unexpected find</span>' : ''}
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

    // The whole card opens details — users tap the photo/title, not the small
    // Details button. (Shelf CTR read ~0% for weeks because only the button
    // was wired; the taps were happening, unrecorded, on a dead surface.)
    card.addEventListener('click', (e) => {
      // Links (booking/maps chips) and buttons keep their own behavior —
      // only a tap on the card surface itself opens details.
      if (e.target.closest('a, button')) return;
      track('card_open', idea);
      openDetail(idea);
    });
    card.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
        e.preventDefault(); // Space would page-scroll otherwise
        track('card_open', idea);
        openDetail(idea);
      }
    });
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
      track('card_open', idea);
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

    if (idea.rating >= 4.5) reasons.push(`★ ${idea.rating}, loved by locals`);
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
          <img src="${escapeAttr(proxiedImage(idea.image_url || categoryImage(idea.category, 1200), 960))}" alt="" decoding="async" fetchpriority="high"
            onerror="this.onerror=null;this.src='${escapeAttr(categoryImage(idea.category, 1200))}'">
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
    card.querySelector('.btn-detail').addEventListener('click', () => {
      track('card_open', idea);
      openDetail(idea);
    });
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
    if (conflict) chips.push(`<span class="card-chip card-chip--advisory" title="An advisory is in effect for this area">⚠️ Outdoors: ${escapeHtml(conflict)}</span>`);
    // Live open/closed — the single highest-value "can I go right now" signal,
    // so it leads the row rather than sitting behind a click into details.
    if (idea.open_now === true) chips.push('<span class="card-chip card-chip--open">● Open now</span>');
    else if (idea.open_now === false) chips.push('<span class="card-chip card-chip--closed">● Closed now</span>');
    if (idea.distance_km != null) chips.push(`<span class="card-chip card-chip--near">📍 ${escapeHtml(String(idea.distance_km))} km</span>`);
    if (idea.date) chips.push(`<span class="card-chip card-chip--date">📅 ${escapeHtml(formatEventRange(idea.date, idea.date_end))}</span>`);
    if (idea.newly_opened) chips.push('<span class="card-chip card-chip--new" title="Recently opened">✨ Just opened</span>');
    if (idea.rating != null) chips.push(`<span class="card-chip">★ ${escapeHtml(String(idea.rating))}</span>`);
    if (idea.price_from != null) chips.push(`<span class="card-chip">from ${escapeHtml(String(idea.price_from))}${idea.currency ? ' ' + escapeHtml(idea.currency) : ''}</span>`);
    if (idea.cost_tier === 'free') chips.push('<span class="card-chip card-chip--free">Free</span>');
    if (idea.civic) chips.push('<span class="card-chip" title="From your city\'s official events feed">🏛 City event</span>');
    if (idea.also_from && idea.also_from.length) chips.push(`<span class="card-chip" title="Also listed by ${escapeAttr(idea.also_from.join(', '))}">+${idea.also_from.length} source${idea.also_from.length > 1 ? 's' : ''}</span>`);
    return chips.length ? `<div class="card-chips">${chips.join('')}</div>` : '';
  }

  // ---------- One-click booking links ----------
  // Link ladder (never a dead end, never a search feed):
  //   1. Direct booking link — a specific product/ticket page. Affiliate
  //      sources (Viator, GetYourGuide) earn "our partner" and commission;
  //      other ticket links (Eventbrite, city calendars, official ticket
  //      pages) get an honest generic label.
  //   2. The venue's official website — the same link Google Maps shows.
  //   3. The Google Maps listing.
  // The old fallback — a prefilled Viator SEARCH — dropped people into an
  // endless results feed that often didn't even contain the place they
  // clicked. Gone: an official homepage always beats a maybe-empty feed.

  const AFFILIATE_SOURCES = new Set(['viator', 'getyourguide']);

  /**
   * The booking row for an idea. mode:
   *   'card'   → one primary link (direct booking, else official website,
   *              else map link)
   *   'detail' → booking/website + map, full labels
   *   'stop'   → booking/website + map, compact labels (plan stops)
   * All links carry data-idea-* so the global click handler tracks them.
   */
  function bookingLinksHtml(idea, mode) {
    const attrs = `data-idea-id="${escapeAttr(idea.id)}" data-idea-source="${escapeAttr(idea.source || '')}"`;
    const compact = mode === 'stop';
    const links = [];
    if (idea.booking_url) {
      const partner = AFFILIATE_SOURCES.has(String(idea.source || '').toLowerCase());
      const label = compact ? 'Book ↗' : (partner ? 'Book with our partner ↗' : 'Get tickets ↗');
      const rel = partner ? 'noopener noreferrer sponsored' : 'noopener noreferrer';
      // Price rides on the link so the click handler can report commission
      // potential without needing the idea object in scope.
      const priceAttrs = partner && idea.price_from != null
        ? ` data-idea-price="${escapeAttr(String(idea.price_from))}" data-idea-currency="${escapeAttr(idea.currency || 'USD')}"` : '';
      links.push(`<a class="card-booking-link" ${attrs}${priceAttrs} href="${escapeAttr(idea.booking_url)}" target="_blank" rel="${rel}">${label}</a>`);
    } else if (idea.website) {
      const label = compact ? 'Site ↗' : 'Official website ↗';
      links.push(`<a class="card-booking-link" ${attrs} data-idea-link="website" href="${escapeAttr(idea.website)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
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

  // Multi-day happenings (Talk of the town): "Sep 10 to 13", or "Sep 28 to Oct 4"
  // across a month boundary; a single day falls back to formatEventDate.
  function formatEventRange(startStr, endStr) {
    if (!endStr || endStr === startStr) return formatEventDate(startStr);
    const parse = s => new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T12:00:00' : s);
    const a = parse(startStr), b = parse(endStr);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return formatEventDate(startStr);
    const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    const left = a.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    const right = b.toLocaleDateString('en-CA', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
    return `${left} to ${right}`;
  }

  // Regex escape, not a DOM round trip: the old createElement version
  // allocated a detached <div> per call — 6-10 calls per card, hundreds of
  // cards per session.
  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(str) {
    return str == null ? '' : String(str).replace(/[&<>"']/g, c => HTML_ESC[c]);
  }

  // Attribute values need the full escape set too: partner-supplied URLs
  // (image_url, booking_url, website) land inside href/src attributes, and
  // escaping only the double quote left <, >, & injectable there.
  function escapeAttr(str) {
    return str == null ? '' : String(str).replace(/[&<>"']/g, c => HTML_ESC[c]);
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
    // A re-add cancels any unconfirmed earlier removal of the same idea —
    // otherwise the retry would delete it right back off the server.
    state.pendingRemovals.delete(String(idea.id));
    favsAssign(idea); // named lists (no-op until the Favs grid is on)
    persist();
    serverShortlistAdd(idea);
    track('shortlist_add', idea);
    // Earned moment: the third save is proof the feed is working for them —
    // the one time an ask feels like a high-five instead of a billboard.
    // Lands exactly where they're looking (right after the saved card).
    if (state.shortlist.length === 3 && captureEligible() && !captureState().milestoneShown && card && card.parentNode) {
      patchCaptureState({ milestoneShown: true });
      card.parentNode.insertBefore(buildCaptureCard('milestone',
        '🎉 Three saves!',
        "You clearly know a good Saturday. Want next week's planned for you? One short email, Thursday 9 AM.",
        'Yes please'), card.nextSibling);
    }
    if (card) animateOut(card, 'right', () => removeIdeaCardInPlace(card));
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
        // No animate: replaying the staggered entrance over cards the user
        // is already looking at made Undo feel like a page reload.
        renderFeed();
      }
    });
  }

  function dismissIdea(idea, card) {
    state.dismissedIds.add(idea.id);
    animateOut(card, 'left', () => removeIdeaCardInPlace(card));
    showToast('Skipped', {
      duration: 4000,
      actionLabel: 'Undo',
      onAction: () => {
        state.dismissedIds.delete(idea.id);
        renderFeed();
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
      // Restart the pulse without the classic void-offsetWidth trick — that
      // forces a full style+layout flush mid-swipe-gesture. getAnimations
      // restarts it directly on the compositor's schedule.
      if (badge.getAnimations) {
        badge.classList.add('count-pulse');
        badge.getAnimations().forEach(a => { a.cancel(); a.play(); });
      } else {
        badge.classList.remove('count-pulse');
        void badge.offsetWidth; // legacy fallback
        badge.classList.add('count-pulse');
      }
    }
    badge.textContent = state.shortlist.length;
    syncTileHearts();
    document.getElementById('build-day-btn').disabled = state.shortlist.length === 0;
    state.savedGuide = null; // shortlist changed → any saved export is stale
  }

  // "At a glance" chips — the same facts the old <dl> listed, as compact
  // pills instead of a label/value list. Rating and cost_tier lead (the two
  // Gemini's rooftop list put first); duration/ages/date follow. Venue and
  // location stay as text below — they're prose-length, not chip-shaped.
  // Attribution for a hardcoded hero photo. Most Commons images are CC BY or
  // CC BY-SA, which require the author, the licence and a link to the source
  // wherever the image appears, so the credit rides with the image rather
  // than living on a credits page nobody opens. Absent for Places and stock
  // photos, which need none. Every field is escaped; the link is only built
  // for an https source, so a bad row degrades to plain text, never a
  // javascript: URL.
  function photoCreditHtml(credit) {
    if (!credit || !credit.author) return '';
    const who = escapeHtml(String(credit.author).slice(0, 120));
    const lic = credit.licence ? ` · ${escapeHtml(String(credit.licence).slice(0, 40))}` : '';
    const src = typeof credit.source === 'string' && /^https:\/\//.test(credit.source) ? credit.source : null;
    const text = `Photo: ${who}${lic}`;
    return `<p class="detail-photo-credit">${src
      ? `<a href="${escapeAttr(src)}" target="_blank" rel="noopener noreferrer">${text}</a>`
      : text}</p>`;
  }

  function detailChipsHtml(idea) {
    const chips = [];
    if (idea.rating != null) chips.push(`<span class="detail-chip detail-chip--rating">★ ${escapeHtml(String(idea.rating))}</span>`);
    if (idea.cost_tier) {
      const label = idea.cost_tier === 'free' ? 'Free' : escapeHtml(idea.cost_tier);
      chips.push(`<span class="detail-chip">${label}${idea.price_from != null ? ` · from ${escapeHtml(String(idea.price_from))}${idea.currency ? ' ' + escapeHtml(idea.currency) : ''}` : ''}</span>`);
    }
    if (idea.distance_km != null) chips.push(`<span class="detail-chip">📍 ${escapeHtml(String(idea.distance_km))} km away</span>`);
    if (idea.duration_minutes) chips.push(`<span class="detail-chip">⏱ ${formatDuration(idea.duration_minutes)}</span>`);
    chips.push(`<span class="detail-chip">${escapeHtml(idea.good_for_ages || 'all ages')}</span>`);
    if (idea.date) chips.push(`<span class="detail-chip detail-chip--date">📅 ${escapeHtml(formatEventDate(idea.date))}</span>`);
    return chips.length ? `<div class="detail-chips">${chips.join('')}</div>` : '';
  }

  function openDetail(idea) {
    document.getElementById('detail-title').textContent = idea.title;
    const categoryLabel = CATEGORY_LABELS[idea.category] || CATEGORY_LABELS.general;
    const onDay = Boolean(state.shortlist.find(i => i.id === idea.id));
    // venue and location are often the same string for curated entries —
    // de-duped so the line doesn't read "Edwards Gardens · Edwards Gardens".
    const venueLine = [idea.venue, idea.location]
      .filter(Boolean)
      .filter((v, i, arr) => arr.findIndex(o => o.trim().toLowerCase() === v.trim().toLowerCase()) === i)
      .join(' · ');
    document.getElementById('detail-content').innerHTML = `
      <div class="detail-hero">
        <img class="detail-hero-img" src="${escapeAttr(proxiedImage(idea.image_url || categoryImage(idea.category, 900), 900))}" alt="" loading="lazy"
          onerror="this.onerror=null;this.src='${escapeAttr(categoryImage(idea.category, 900))}'">
        <div class="detail-hero-gradient"></div>
        <span class="detail-hero-category">${categoryLabel}</span>
        ${idea.wow_reason ? '<span class="detail-hero-wow">✨ Unexpected find</span>' : ''}
      </div>
      ${photoCreditHtml(idea.image_credit)}
      ${detailChipsHtml(idea)}
      ${venueLine ? `<p class="detail-venue-line">${escapeHtml(venueLine)}</p>` : ''}
      <p class="detail-why">${escapeHtml(idea.why || '')}</p>
      ${idea.wow_reason ? `<p class="wow-line">✨ ${escapeHtml(idea.wow_reason)}</p>` : ''}
      ${bookingLinksHtml(idea, 'detail')}
      <button type="button" class="primary-btn detail-add-btn" id="detail-add-btn"${onDay ? ' disabled' : ''}>
        ${onDay ? 'On your day ✓' : 'Add to my day →'}
      </button>
      <div class="detail-more" id="detail-more">
        <div class="detail-more-skeleton" role="status" aria-label="Loading photos, facts, and local tips">
          <p class="detail-more-loading">✨ Finding photos, facts &amp; local tips…</p>
          <div class="skeleton detail-skel-photos"></div>
          <div class="skeleton detail-skel-line"></div>
          <div class="skeleton detail-skel-line detail-skel-line--w80"></div>
          <div class="skeleton detail-skel-line detail-skel-line--w60"></div>
        </div>
      </div>
    `;
    const addBtn = document.getElementById('detail-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (state.shortlist.find(i => i.id === idea.id)) return;
        addToShortlist(idea, null);
        renderFeed();
        addBtn.textContent = 'On your day ✓';
        addBtn.disabled = true;
      });
    }
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

  function detailMoreHtml({ place, facts, priceDetail }, idea) {
    const parts = [];

    // More photos — skip when all we'd show is the hero image again.
    const photos = (place && place.photos || []).filter(u => u !== idea.image_url);
    if (photos.length > 1) {
      // A failed gallery photo is removed rather than swapped for a category
      // stock photo — unlike the hero, these are meant to be real venue
      // photos, so a generic placeholder among them would be misleading.
      parts.push(`<div class="detail-gallery">${photos.map(u =>
        `<img src="${escapeAttr(proxiedImage(u, 480))}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`).join('')}</div>`);
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

    // Search-grounded price detail (food/patios/couples only, real numbers
    // with a source, never a guess) — shown only when the search actually
    // found something; a missing section beats a fabricated one.
    if (priceDetail && (priceDetail.summary || priceDetail.ranges.length)) {
      parts.push(`<h4 class="detail-more-title">Menu &amp; pricing</h4>`);
      if (priceDetail.summary) parts.push(`<p class="detail-price-summary">${escapeHtml(priceDetail.summary)}</p>`);
      if (priceDetail.ranges.length) {
        parts.push(`<ul class="detail-price-ranges">${priceDetail.ranges.map(r =>
          `<li><span class="detail-price-label">${escapeHtml(r.label)}</span><span class="detail-price-range">${escapeHtml(r.range)}</span></li>`).join('')}</ul>`);
      }
      if (priceDetail.source_note) parts.push(`<p class="detail-price-source">Source: ${escapeHtml(priceDetail.source_note)}</p>`);
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

    // The venue's own site, when the card itself didn't already link it —
    // ideas from events/curated sources learn their website only here.
    if (place && place.website && !idea.booking_url && !idea.website) {
      parts.push(`<p class="detail-website"><a class="card-booking-link" data-idea-id="${escapeAttr(idea.id)}" data-idea-source="${escapeAttr(idea.source || '')}" data-idea-link="website" href="${escapeAttr(place.website)}" target="_blank" rel="noopener noreferrer">Official website ↗</a></p>`);
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

  // ---------- Shortlist select mode ----------
  // "Select" in the panel header arms a bulk-edit pass: rows swap their
  // reorder/remove controls for checkboxes and an action bar appears
  // (delete picks, start a new shortlist from them, or clear everything).
  // Pure view-state — never persisted, and reset every time the panel opens.
  let shortlistSelecting = false;
  const shortlistSelected = new Set(); // String(idea.id)

  function exitShortlistSelect() {
    shortlistSelecting = false;
    shortlistSelected.clear();
  }

  function toggleShortlistSelect() {
    shortlistSelecting = !shortlistSelecting;
    shortlistSelected.clear();
    renderShortlistPanel();
  }

  // Action-bar state (visibility, disabled buttons, live delete count) —
  // separated from renderShortlistPanel so a checkbox toggle can update it
  // without rebuilding every row.
  function updateShortlistSelectBar() {
    const selectBar = document.getElementById('shortlist-select-bar');
    if (!selectBar) return;
    selectBar.hidden = !shortlistSelecting;
    const picked = shortlistSelected.size;
    const delBtn = document.getElementById('select-delete-btn');
    const newListBtn = document.getElementById('select-newlist-btn');
    delBtn.disabled = picked === 0;
    newListBtn.disabled = picked === 0;
    delBtn.textContent = picked ? `Delete (${picked})` : 'Delete';
  }

  function handleSelectDelete() {
    if (!shortlistSelected.size) return;
    const n = shortlistSelected.size;
    const drop = state.shortlist.filter(i => shortlistSelected.has(String(i.id)));
    state.shortlist = state.shortlist.filter(i => !shortlistSelected.has(String(i.id)));
    persist();
    drop.forEach(i => serverShortlistRemove(i.id));
    shortlistSelected.clear();
    updateShortlistCount();
    renderShortlistPanel();
    renderFeed();
    showToast(`Removed ${n} pick${n === 1 ? '' : 's'} from your shortlist`);
  }

  // "New shortlist" from a selection: the checked picks carry over, the
  // rest are cleared — same confirm-before-drop contract as starting fresh.
  function handleSelectNewList() {
    if (!shortlistSelected.size) return;
    const keep = state.shortlist.filter(i => shortlistSelected.has(String(i.id)));
    const drop = state.shortlist.filter(i => !shortlistSelected.has(String(i.id)));
    if (drop.length && !window.confirm(
      `Start a new shortlist with your ${keep.length} selected pick${keep.length === 1 ? '' : 's'}? ` +
      `The other ${drop.length} will be cleared.`)) return;
    state.shortlist = keep;
    state.savedGuide = null;
    persist();
    drop.forEach(i => serverShortlistRemove(i.id));
    exitShortlistSelect();
    updateShortlistCount();
    renderShortlistPanel();
    renderFeed(true);
    showToast(`New shortlist. ${keep.length} pick${keep.length === 1 ? '' : 's'} carried over ✨`);
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
    const selectBtn = document.getElementById('shortlist-select-btn');
    const selectBar = document.getElementById('shortlist-select-bar');
    container.innerHTML = '';

    // Selection can't outlive its rows: an empty list drops out of select
    // mode, and ids removed elsewhere are pruned from the checked set.
    if (state.shortlist.length === 0) exitShortlistSelect();
    const liveIds = new Set(state.shortlist.map(i => String(i.id)));
    [...shortlistSelected].forEach(id => { if (!liveIds.has(id)) shortlistSelected.delete(id); });

    if (newBtn) newBtn.hidden = state.shortlist.length === 0 || shortlistSelecting;
    if (selectBtn) {
      selectBtn.hidden = state.shortlist.length === 0;
      selectBtn.textContent = shortlistSelecting ? 'Done' : 'Select';
      selectBtn.setAttribute('aria-pressed', String(shortlistSelecting));
      selectBtn.classList.toggle('is-active', shortlistSelecting);
    }
    updateShortlistSelectBar();

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
      const id = String(idea.id);

      if (shortlistSelecting) {
        // Select mode: the whole row is a checkbox target.
        const checked = shortlistSelected.has(id);
        row.className = 'shortlist-row is-selectable' + (checked ? ' is-selected' : '');
        row.innerHTML = `
          <input class="shortlist-check" type="checkbox" aria-label="Select ${escapeAttr(idea.title)}" ${checked ? 'checked' : ''}>
          <div class="shortlist-row-text">
            <strong>${escapeHtml(idea.title)}</strong>
            <span class="shortlist-row-meta">${escapeHtml(idea.location || '')}</span>
          </div>
        `;
        const check = row.querySelector('.shortlist-check');
        const toggle = () => {
          const nowSelected = !shortlistSelected.has(id);
          if (nowSelected) shortlistSelected.add(id);
          else shortlistSelected.delete(id);
          // In place — the full panel rebuild destroyed keyboard focus on
          // every toggle, making space-through-the-list impossible.
          check.checked = nowSelected;
          row.classList.toggle('is-selected', nowSelected);
          updateShortlistSelectBar();
        };
        check.addEventListener('change', toggle);
        row.addEventListener('click', (e) => { if (e.target !== check) toggle(); });
        container.appendChild(row);
        return;
      }

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
      showToast('No more ideas to surprise you with. Generate a new day!');
      return;
    }
    const wows = pool.filter(i => i.wow_reason || i.wow);
    const pickFrom = wows.length ? wows : pool;
    const idea = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    addToShortlist(idea, null);
    renderShortlistPanel();
    renderFeed(true);
  }

  // opts (Favs grid): { items, btnId, footerSel, closeIds } — build from a
  // named list instead of the whole shortlist. A bare click event (the
  // desktop button) takes the defaults.
  async function handleBuildDay(opts) {
    const o = opts && Array.isArray(opts.items) ? opts : null;
    const items = o ? o.items : state.shortlist;
    if (state.isBuildingPlan || items.length === 0) return;
    state.isBuildingPlan = true;
    const btn = document.getElementById(o && o.btnId ? o.btnId : 'build-day-btn');
    btn.classList.add('is-loading');
    btn.disabled = true;
    const progress = startProgress('plan', document.querySelector(o && o.footerSel ? o.footerSel : '#shortlist-panel .panel-footer'));

    try {
      const plan = await apiBuildPlan(items, state.planDays);
      progress.finish();
      renderDayPlan(plan);
      (o && o.closeIds ? o.closeIds : ['shortlist-panel']).forEach(id => {
        const p = document.getElementById(id);
        if (p && !p.hidden) closePanel(p);
      });
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
      btn.disabled = items.length === 0;
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
    state.isSample = true; // the demo never overwrites a user's draft
    state.currentGuide = JSON.parse(JSON.stringify(SAMPLE_GUIDE));
    state.currentGuideId = null;
    state.savedGuide = null;
    state.lastChangeSummary = null;
    state.editMode = false;
    renderPlanView();
    openPanel('dayplan-panel');
  }

  function renderDayPlan(plan) {
    state.isSample = false;
    state.currentGuide = guideFromPlan(plan);
    state.currentGuideId = null; // fresh plan, not saved yet
    state.savedGuide = null;
    state.lastChangeSummary = null;
    state.editMode = false;
    renderPlanView();
    maybeShowPostPlanUpsell();
  }

  // ---------- post-plan soft upsell ----------
  // The moment the product just proved itself is the one honest time to ask.
  // Once per session, dismissible, and it sells both products: Pro for the
  // planners, the $20 field guide for the one-time buyers.
  function maybeShowPostPlanUpsell() {
    try {
      if (sessionStorage.getItem('dayhop_postplan_upsell')) return;
      sessionStorage.setItem('dayhop_postplan_upsell', '1');
    } catch (e) { return; } // private mode: skip rather than nag every plan
    const tier = state.entitlements && state.entitlements.tier;
    if (tier && tier !== 'free') return; // pro/preview/admin: nothing to sell
    const panel = document.getElementById('dayplan-panel');
    if (!panel || document.getElementById('postplan-upsell')) return;
    const el = document.createElement('div');
    el.className = 'postplan-upsell';
    el.id = 'postplan-upsell';
    el.innerHTML =
      '<span class="postplan-upsell-text">Like it? Keep the whole long weekend planned. <b>Pro is free for 7 days</b>, or grab a <b>$20 field guide</b> you keep forever.</span>' +
      '<span class="postplan-upsell-actions">' +
      '<button type="button" class="postplan-upsell-pro">Try Pro</button>' +
      '<a class="postplan-upsell-guide" href="/guides">See guides</a>' +
      '<button type="button" class="postplan-upsell-close" aria-label="Dismiss">✕</button></span>';
    panel.insertBefore(el, panel.firstChild);
    el.querySelector('.postplan-upsell-pro').addEventListener('click', () => {
      el.remove();
      showUpgradeModal('post_plan');
    });
    el.querySelector('.postplan-upsell-close').addEventListener('click', () => el.remove());
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

  // ---------- "Been there" quest marks ----------
  // Keyed by place (title|location), not by plan — checking off a park in one
  // plan checks it off everywhere it appears. Falls back to the idea id for
  // title-less stops. Marks live in localStorage alongside the shortlist.
  function placeKey(stopOrIdea) {
    const idea = stopOrIdea.idea || stopOrIdea;
    const title = String(stopOrIdea.title || idea.title || '').trim().toLowerCase();
    const loc = String(idea.location || '').trim().toLowerCase();
    return title ? `${title}|${loc}` : String(idea.id || '');
  }

  function isVisited(key) {
    return Boolean(key && state.visited[key]);
  }

  function toggleVisited(stopOrIdea) {
    const key = placeKey(stopOrIdea);
    if (!key) return;
    if (state.visited[key]) {
      delete state.visited[key];
    } else {
      state.visited[key] = new Date().toISOString();
      track('place_visited', stopOrIdea.idea || stopOrIdea);
      if (navigator.vibrate) navigator.vibrate(8);
    }
    persist();
  }

  function questStats(guide) {
    if (!guide) return { done: 0, total: 0 };
    const stops = guideStopGroups(guide).flatMap(g => g.stops);
    return {
      done: stops.filter(s => isVisited(placeKey(s))).length,
      total: stops.length
    };
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
      ? `<input class="plan-time-input" data-group="${groupIndex}" data-index="${index}" data-field="suggested_time" value="${escapeAttr(stop.suggested_time || '')}" placeholder="e.g. 10:00 AM to 11:30 AM" aria-label="Suggested time">`
      : `<span class="plan-stop-time">${escapeHtml(stop.suggested_time || '')}</span>`;

    const noteHtml = state.editMode
      ? `<textarea class="plan-note-input" data-group="${groupIndex}" data-index="${index}" data-field="note" rows="1" maxlength="500" placeholder="Add a note: parking tips, snacks, who to text…" aria-label="Your note">${escapeHtml(stop.note || '')}</textarea>`
      : (stop.note ? `<p class="plan-stop-note">📝 ${escapeHtml(stop.note)}</p>` : '');

    const key = placeKey(stop);
    const done = !state.editMode && isVisited(key);
    const number = String(index + 1).padStart(2, '0');
    const doneBtn = !state.editMode && key ? `
      <button class="plan-done-btn${done ? ' is-done' : ''}" type="button"
        data-group="${groupIndex}" data-index="${index}" aria-pressed="${done}"
        title="${done ? 'You’ve been here. Tap to undo' : 'Been here? Check it off'}">
        <span class="plan-done-tick">✓</span>${done ? 'Been here' : 'Done'}</button>` : '';

    return `
      <div class="plan-stop${done ? ' plan-stop--done' : ''}${stop.changed ? ' plan-stop--changed' : ''}">
        <div class="plan-stop-marker" data-number="${number}">${done ? '✓' : number}</div>
        <div class="plan-stop-body">
          ${doneBtn}
          ${stop.changed ? '<span class="plan-changed-badge">✨ Updated</span>' : ''}
          ${timeHtml}
          <h3>${escapeHtml(stop.title || idea.title || '')}</h3>
          ${idea.image_url && !state.editMode ? `<div class="plan-stop-photo"><img src="${escapeAttr(proxiedImage(idea.image_url, 480))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${escapeAttr(categoryImage(idea.category))}'"></div>` : ''}
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
      ${state.editMode ? '' : '<div class="plan-quest" id="plan-quest" hidden></div>'}
      ${startLine}
      ${sections}
      ${guide.notes ? `<div class="plan-notes">💬 ${escapeHtml(guide.notes)}</div>` : ''}
    `;
    document.getElementById('dayplan-title').textContent = guide.title || 'Your day, mapped out';

    renderChangeSummary();
    wireEditControls(content);
    wireDoneButtons(content);
    updatePlanQuest();

    // Mirror every unsaved (non-demo) plan to the draft slot — building,
    // editing, and re-planning all repaint through here, so the draft always
    // matches what's on screen.
    if (!state.isSample && !state.currentGuideId) persistDraft();

    // Toolbar + re-plan bar + export live below/around the content.
    const toolbar = document.getElementById('plan-toolbar');
    toolbar.hidden = false;
    document.getElementById('plan-edit-btn').textContent = state.editMode ? '✓ Done editing' : '✏️ Edit plan';
    updateSaveButton();
    document.getElementById('replan-bar').hidden = state.editMode;
    updateExportHint();
    document.getElementById('guide-export').hidden = state.editMode;
  }

  // The quest line: progress toward having actually been everywhere the plan
  // goes. Deliberately playful — most people never finish, and that's fine;
  // the unfinished list is what pulls them back.
  function updatePlanQuest() {
    const el = document.getElementById('plan-quest');
    if (!el) return;
    const { done, total } = questStats(state.currentGuide);
    if (!total) { el.hidden = true; return; }
    const pct = Math.round((done / total) * 100);
    const line = done === total
      ? '🎉 Quest complete. You’ve been to every stop!'
      : done
        ? `🏅 ${done} of ${total} explored. Keep going!`
        : `🏅 ${done} of ${total} explored. Check stops off as you go`;
    el.innerHTML = `<p class="plan-quest-line">${line}</p>
      <div class="plan-quest-bar"><span style="width:${pct}%"></span></div>`;
    el.classList.toggle('plan-quest--complete', done === total);
    el.hidden = false;
  }

  // Toggle in place (no full re-render) so the collapse animates and the
  // panel doesn't jump scroll position.
  function wireDoneButtons(content) {
    content.querySelectorAll('.plan-done-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const groups = guideStopGroups(state.currentGuide);
        const group = groups[Number(btn.dataset.group)];
        const stop = group && group.stops[Number(btn.dataset.index)];
        if (!stop) return;
        toggleVisited(stop);
        const done = isVisited(placeKey(stop));
        const stopEl = btn.closest('.plan-stop');
        stopEl.classList.toggle('plan-stop--done', done);
        btn.classList.toggle('is-done', done);
        btn.setAttribute('aria-pressed', String(done));
        btn.innerHTML = `<span class="plan-done-tick">✓</span>${done ? 'Been here' : 'Done'}`;
        btn.title = done ? 'You’ve been here. Tap to undo' : 'Been here? Check it off';
        const marker = stopEl.querySelector('.plan-stop-marker');
        if (marker) marker.textContent = done ? '✓' : marker.dataset.number;
        updatePlanQuest();
      });
    });
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
      showToast('Reorder, retime, remove stops, or add notes. Then save.', { duration: 3500 });
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
      clearDraft(); // it lives in My Plans now — the rescue strip retires
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

  let lastPlansLimit = null; // so the still-to-visit shelf can re-render the list

  function renderMyPlans(limit) {
    lastPlansLimit = limit;
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
      const q = questStats(g.guide);
      const questChip = q.done
        ? ` <span class="card-chip card-chip--free">${q.done === q.total ? '🎉 Complete' : `✓ ${q.done}/${q.total} explored`}</span>`
        : '';
      row.innerHTML = `
        <button class="myplans-open" type="button">
          <strong>${escapeHtml(g.title)}</strong>
          <span class="myplans-meta">${bits.join(' · ')}${g.day_count > 1 ? ' <span class="card-chip card-chip--date">🌅 Multi-day</span>' : ''}${questChip}</span>
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

    renderStillToVisit();
  }

  // "Still on your list": every place across the saved plans that hasn't been
  // checked off yet, deduped — the reminder shelf, so nobody has to re-browse
  // to rediscover a spot they already chose once.
  function renderStillToVisit() {
    const wrap = document.getElementById('stilltovisit');
    const list = document.getElementById('stilltovisit-list');
    if (!wrap || !list) return;

    const unvisited = new Map(); // placeKey → { stop, planTitle }
    for (const g of state.myGuides) {
      for (const group of guideStopGroups(g.guide || {})) {
        for (const stop of group.stops) {
          const key = placeKey(stop);
          if (!key || isVisited(key) || unvisited.has(key)) continue;
          unvisited.set(key, { stop, planTitle: g.title || '' });
        }
      }
    }

    if (!unvisited.size) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    document.getElementById('stilltovisit-count').textContent =
      `${unvisited.size} place${unvisited.size === 1 ? '' : 's'}`;
    list.innerHTML = '';
    for (const { stop, planTitle } of unvisited.values()) {
      const idea = stop.idea || {};
      const title = stop.title || idea.title || '';
      const sub = [idea.location, planTitle ? `from “${planTitle}”` : '']
        .filter(Boolean).map(escapeHtml).join(' · ');
      const row = document.createElement('div');
      row.className = 'stilltovisit-row';
      row.innerHTML = `
        <button class="stilltovisit-check" type="button" title="Been here? Check it off"
          aria-label="Mark ${escapeAttr(title)} as been">✓</button>
        <div class="stilltovisit-text">
          <strong>${escapeHtml(title)}</strong>
          ${sub ? `<span>${sub}</span>` : ''}
        </div>
        ${idea.maps_url ? `<a class="stilltovisit-map" href="${escapeAttr(idea.maps_url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeAttr(title)} in Google Maps">Map ↗</a>` : ''}`;
      row.querySelector('.stilltovisit-check').addEventListener('click', () => {
        toggleVisited(stop);
        showToast(`✓ ${title} checked off`, { duration: 2000 });
        renderMyPlans(lastPlansLimit); // refreshes rows' quest chips + this shelf
      });
      list.appendChild(row);
    }
  }

  function openSavedGuide(g) {
    state.isSample = false;
    state.currentGuide = g.guide;
    state.currentGuideId = g.id;
    state.savedGuide = g;
    state.lastChangeSummary = null;
    state.editMode = false;
    closePanel(document.getElementById('myplans-panel'));
    renderPlanView();
    openPanel('dayplan-panel');
  }

  // A deleted plan's places shouldn't linger as stale shortlist items —
  // pull every idea the plan included off the shortlist too (local state +
  // server copy for signed-in users). Returns how many were cleared.
  function removePlanItemsFromShortlist(guide) {
    const planIds = new Set();
    for (const group of guideStopGroups(guide || {})) {
      for (const stop of group.stops) {
        if (stop.idea && stop.idea.id != null) planIds.add(stop.idea.id);
      }
    }
    const removed = state.shortlist.filter(i => planIds.has(i.id));
    if (!removed.length) return 0;
    state.shortlist = state.shortlist.filter(i => !planIds.has(i.id));
    persist();
    removed.forEach(i => serverShortlistRemove(i.id));
    updateShortlistCount();
    return removed.length;
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
      const cleared = removePlanItemsFromShortlist(g.guide);
      renderMyPlans(state.entitlements ? state.entitlements.saved_guides : null);
      showToast(cleared
        ? `Plan deleted · ${cleared} place${cleared === 1 ? '' : 's'} cleared from your shortlist`
        : 'Plan deleted');
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
      hint.textContent = 'Plan saved. Share it anywhere, the link stays live.';
    } else if (!isLoggedIn()) {
      hint.textContent = 'Sign in to save this as a shareable guide.';
    } else if (state.billingConfigured && !state.isPro) {
      hint.textContent = `Exporting saves this plan (free includes ${freeLimit != null ? freeLimit : 5}, Pro is unlimited).`;
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
      showToast('Build a day plan first. Add ideas and tap "Make my day".');
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
        lines.push(`${dayLabel}${dayStart ? ` (starts around ${dayStart})` : ''}`);
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
      md.push(`## ${index + 1}. ${stop.title}${stop.suggested_time ? ` (${stop.suggested_time})` : ''}`);
      if (idea.why) md.push(idea.why);
      if (idea.location) md.push(`- 📍 ${idea.location}`);
      if (stop.note) md.push(`- 📝 ${stop.note}`);
      if (idea.booking_url) md.push(`- [Book](${idea.booking_url})`);
      else if (idea.website) md.push(`- [Official website](${idea.website})`);
      if (idea.maps_url) md.push(`- [Map](${idea.maps_url})`);
      if (stop.transition_note) md.push(`- → ${stop.transition_note}`);
      md.push('');
    });
    if (g.notes) md.push(`> 💬 ${g.notes}`);
    md.push('', `Made with DayHop. Full guide: ${saved.share_url}`);
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
        navigator.share({ title: shareTitle, text: `${shareTitle}${g.city ? ', ' + g.city : ''}`, url: saved.share_url }).catch(() => {});
      } else {
        // Desktop without Web Share: copy the link and open an X intent.
        copyToClipboard(saved.share_url);
        const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(saved.share_url)}`;
        window.open(intent, '_blank', 'noopener');
        showToast('Link copied. Sharing on X');
      }
    } else if (format === 'pdf') {
      // The share page carries the print stylesheet; ?print=1 auto-opens the
      // system print → Save as PDF dialog.
      window.open(`${saved.share_url}?print=1`, '_blank', 'noopener');
    } else if (format === 'email') {
      const text = guideAsText(saved);
      // RFC 6068 line breaks are CRLF — classic Outlook renders bare %0A as
      // one mashed line. And Windows silently drops mailto URLs past ~2083
      // chars, so long guides fall back to title + link (the share page has
      // the full plan anyway).
      let url = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(text.replace(/\n/g, '\r\n'))}`;
      if (url.length > 1900) {
        url = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareTitle}\r\n\r\nFull guide: ${saved.share_url}`)}`;
      }
      window.location.href = url;
      // No working mail handler (dead Windows Mail association, webmail-only
      // users) drops the launch with zero feedback — the page never loses
      // focus. Give those users the guide on the clipboard instead.
      // hasFocus alone, deliberately: a working mail app steals OS focus
      // (hasFocus → false), while a dead handler leaves it true. Don't also
      // gate on visibilityState — background/automation tabs report 'hidden'
      // while still holding focus, which would silence the fallback.
      setTimeout(() => {
        if (document.hasFocus()) {
          copyToClipboard(text, 'No email app opened. Guide copied, paste it into any email ✉️');
        }
      }, 1200);
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

  // "New shortlist" — open to everyone. Walling this behind Pro blocked the
  // SECOND planning session, exactly the visit that forms the habit; the Pro
  // differentiator is multiple concurrent shortlists (future), not starting
  // over. Confirm before dropping picks so a stray tap can't wipe a day.
  function handleNewShortlist() {
    if (!state.shortlist.length) {
      showToast('Your shortlist is already fresh ✨');
      return;
    }
    const n = state.shortlist.length;
    if (!window.confirm(`Start fresh? Your ${n} current pick${n === 1 ? '' : 's'} will be cleared.`)) return;
    state.shortlist = [];
    state.savedGuide = null;
    persist();
    if (isLoggedIn()) fetch('/api/shortlist', { method: 'DELETE', headers: authHeaders() }).catch(() => {});
    updateShortlistCount();
    renderShortlistPanel();
    renderFeed(true);
    showToast('Fresh shortlist. Pick your next day ✨');
  }

  // ---------- Instant discovery feed ----------
  // Fired when a location is committed (or restored on load) and no prompt
  // results are on screen: real candidates from /api/browse, no Grok,
  // sectioned server-side. Failures fall back silently to the empty state —
  // a proactive feature must never nag.
  let browseAbort = null;
  // ---------- Seen-store (serendipity) ----------
  // Ids this browser has already been shown in the feed, sent with browse
  // requests so the server slides repeats toward the back — demoted, never
  // hidden. Repeat visits surface new finds instead of the same page.
  const SEEN_KEY = 'dayhop_seen_ideas';
  const SEEN_MAX = 200;
  function getSeenIdeas() {
    try { const a = JSON.parse(localStorage.getItem(SEEN_KEY)); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  function recordSeenIdeas(ideas) {
    try {
      const merged = [...getSeenIdeas(), ...(ideas || []).map(i => String(i.id)).filter(Boolean)];
      localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(merged)].slice(-SEEN_MAX)));
    } catch { /* storage unavailable (private mode) — serendipity degrades gracefully */ }
  }
  // ---------- Email capture: feed card + earned moment ----------
  // The footer signup is unreachable under an infinite feed, and popups make
  // a first visit feel like a billboard. Two native surfaces instead: a card
  // that reads like feed content ~15 ideas deep (self-selected readers
  // convert better and stay subscribed longer), and one celebratory ask the
  // moment the user proves they're getting value (third shortlist save).
  // Dismiss = 14-day snooze; subscribing or having an account = never again.
  const CAPTURE_KEY = 'dayhop_email_capture';
  const CAPTURE_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
  const CAPTURE_FEED_POSITION = 15;
  function captureState() {
    try { return JSON.parse(localStorage.getItem(CAPTURE_KEY)) || {}; } catch { return {}; }
  }
  function patchCaptureState(patch) {
    try { localStorage.setItem(CAPTURE_KEY, JSON.stringify(Object.assign(captureState(), patch))); }
    catch { /* storage unavailable — the ask just doesn't persist state */ }
  }
  function captureEligible() {
    if (isLoggedIn()) return false; // we already have their email
    const s = captureState();
    if (s.done) return false;
    if (s.snoozedAt && Date.now() - s.snoozedAt < CAPTURE_SNOOZE_MS) return false;
    return true;
  }
  const captureShownThisSession = {};

  function buildCaptureCard(source, heading, sub, cta) {
    const el = document.createElement('div');
    el.className = 'capture-card' + (source === 'milestone' ? ' capture-card--milestone' : '');
    // The feed card leads with the Playbook illustration (one-time
    // AI-generated asset, public/img/playbook-promo.jpg) so it earns the
    // stop-scroll moment on charm, not interruption.
    el.innerHTML = `
      <button class="capture-dismiss" type="button" aria-label="No thanks">✕</button>
      ${source === 'feed_card' ? '<img class="capture-art" src="/img/playbook-promo.jpg" alt="Illustrated map of a GTA family day out" loading="lazy">' : ''}
      <p class="capture-heading"></p>
      <p class="capture-sub"></p>
      <form class="capture-form" novalidate>
        <input type="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address">
        <button type="submit" class="capture-btn"></button>
      </form>
      <p class="capture-fineprint">Free · no spam · one-click unsubscribe</p>
      <p class="capture-msg" role="status" aria-live="polite"></p>`;
    el.querySelector('.capture-heading').textContent = heading;
    el.querySelector('.capture-sub').textContent = sub;
    el.querySelector('.capture-btn').textContent = cta;
    el.querySelector('.capture-dismiss').addEventListener('click', () => {
      patchCaptureState({ snoozedAt: Date.now() });
      track('newsletter_prompt_dismissed', { source });
      el.remove();
    });
    el.querySelector('.capture-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = el.querySelector('input');
      const email = (input.value || '').trim();
      if (!email) return;
      const btn = el.querySelector('.capture-btn');
      btn.disabled = true;
      try {
        const res = await fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email, source,
            owner_id: getOwnerId(),
            attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Try again in a minute.');
        patchCaptureState({ done: true });
        track('newsletter_prompt_subscribed', { source });
        el.querySelector('.capture-form').hidden = true;
        el.querySelector('.capture-fineprint').hidden = true;
        el.querySelector('.capture-heading').textContent = 'Check your inbox 📬';
        el.querySelector('.capture-sub').textContent = 'Click the confirmation link and your Playbook (plus Thursday picks) is yours.';
      } catch (err) {
        const msg = el.querySelector('.capture-msg');
        msg.textContent = err.message || 'Could not subscribe right now. Try again in a minute.';
        btn.disabled = false;
      }
    });
    if (!captureShownThisSession[source]) {
      captureShownThisSession[source] = true;
      track('newsletter_prompt_shown', { source });
    }
    return el;
  }

  // ---------- Break cards: every 15th slot changes texture ----------
  // Infinite scroll numbs; a pattern break every ~15 cards resets attention.
  // Three flavours rotate: the Playbook email ask, a GTA fun fact, and a
  // venue-facing "this spot could be yours" card that feeds the sponsor
  // funnel. Facts rotate daily so regulars don't reread yesterday's.
  const FUN_FACTS = [
    'The Toronto Islands are the largest car-free urban community in North America.',
    'The Scarborough Bluffs rise 90 metres, taller than Niagara Falls.',
    "Downtown's PATH is the world's largest underground shopping complex: 30+ km of tunnels.",
    "High Park's cherry trees were a gift from Tokyo in 1959.",
    'Casa Loma hides a real 244-metre tunnel running under the street to its stables.',
    "Ontario holds about 250,000 lakes, roughly a fifth of the world's fresh water.",
    "Rouge, on Toronto's east edge, is Canada's first national urban park.",
    "The Bruce Trail is Canada's oldest and longest marked footpath, about 900 km.",
    "Canada's Wonderland's mountain is hollow. There's a whole coaster inside.",
    'The Niagara Escarpment is a UNESCO World Biosphere Reserve, 725 km long.'
  ];

  // ---------- City-guide promo (paid PDFs) ----------
  // The registry loads once, fire-and-forget; until it arrives the feed
  // simply shows no guide card. Matching mirrors the server's city_keys.
  let cityGuidesList = null;
  fetch('/api/cityguides').then(r => r.json())
    .then(d => { cityGuidesList = (d && d.guides) || null; })
    .catch(() => {});

  function matchGuideForCity() {
    if (!Array.isArray(cityGuidesList)) return null;
    const s = String(state.city || '').toLowerCase();
    if (!s) return null;
    for (const g of cityGuidesList) {
      if (g.status === 'live' && Array.isArray(g.city_keys) && g.city_keys.some(k => s.includes(k))) return g;
    }
    return null;
  }

  function buildGuidePromoCard(guide) {
    const el = document.createElement('div');
    el.className = 'capture-card capture-card--guide';
    el.innerHTML = `
      <p class="capture-heading"></p>
      <p class="capture-sub"></p>
      <button type="button" class="capture-btn guide-promo-go"></button>
      <p class="capture-fineprint">Instant PDF · every spot links to live directions · free updated editions</p>`;
    el.querySelector('.capture-heading').textContent = `${guide.title} 🌲`;
    el.querySelector('.capture-sub').textContent =
      `${guide.subtitle} ${guide.spot_count ? guide.spot_count + ' hand-checked places, ' : ''}ready-made day plans, and a season-by-season calendar. The local knowledge this feed runs on, in one keepable PDF.`;
    // Price deliberately not shown here — it's revealed at Stripe checkout.
    el.querySelector('.guide-promo-go').textContent = 'Get the guide';
    el.querySelector('.guide-promo-go').addEventListener('click', () => {
      track('guide_promo_click', { id: guide.slug });
      window.location.href = `/guides#${guide.slug}`;
    });
    return el;
  }

  function buildFunFactCard(fact) {
    const el = document.createElement('div');
    el.className = 'capture-card capture-card--fact';
    el.innerHTML = '<p class="capture-heading">Did you know? 💡</p><p class="capture-sub"></p>';
    el.querySelector('.capture-sub').textContent = fact;
    return el;
  }

  // Venue-facing slot: reads as a friendly open ad space, posts straight
  // into the existing sponsor-inquiry funnel (analytics event + admin email).
  function buildAdCard() {
    const el = document.createElement('div');
    el.className = 'capture-card capture-card--ad';
    el.innerHTML = `
      <img class="capture-art" src="/img/venue-promo.jpg" alt="Illustrated venue in a spotlight" loading="lazy">
      <p class="capture-heading">This spot could be yours 👀</p>
      <p class="capture-sub">Run a GTA venue? This feed reaches local families deciding their weekend. Founding partners get Spotlight for $99/mo, first five spots.</p>
      <form class="capture-form" novalidate>
        <input type="email" required autocomplete="email" placeholder="you@yourvenue.ca" aria-label="Venue email address">
        <button type="submit" class="capture-btn">Get the media kit</button>
      </form>
      <p class="capture-fineprint"><a href="/advertise?utm_source=feed&utm_medium=adcard&utm_campaign=founding">See tiers & audience numbers →</a></p>
      <p class="capture-msg" role="status" aria-live="polite"></p>`;
    el.querySelector('.capture-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (el.querySelector('input').value || '').trim();
      if (!email) return;
      const btn = el.querySelector('.capture-btn');
      btn.disabled = true;
      try {
        const res = await fetch('/advertise/inquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venue: 'Feed ad-card lead, venue TBD',
            name: '', email,
            tier: 'Founding partner (feed card)',
            message: 'Left their email in the in-feed ad card. Send the media kit.',
            attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined
          })
        });
        if (!res.ok) throw new Error();
        el.querySelector('.capture-form').hidden = true;
        el.querySelector('.capture-heading').textContent = 'Media kit on its way 📬';
        el.querySelector('.capture-sub').textContent = 'We reply within one business day.';
      } catch (err) {
        el.querySelector('.capture-msg').textContent = 'Could not send that. Try again in a minute.';
        btn.disabled = false;
      }
    });
    return el;
  }

  function insertFeedBreakCards(feed) {
    const cards = [...feed.querySelectorAll('.idea-card')];
    if (cards.length < 6) return;
    const dayOffset = new Date().getDate();
    let breakIndex = 0;
    let guidePromoUsed = false;
    // Slots at card 15, 30, 45… — a feed too short for a full block still
    // gets one break anchored at its last card.
    const slots = [];
    for (let pos = CAPTURE_FEED_POSITION; pos < cards.length; pos += CAPTURE_FEED_POSITION) slots.push(pos);
    if (!slots.length) slots.push(cards.length - 1);
    for (const pos of slots) {
      let anchor = cards[Math.min(pos, cards.length - 1)];
      if (!anchor) break;
      // Never split a section header from its first card — slot in at the
      // end of the previous shelf instead.
      if (anchor.previousElementSibling && anchor.previousElementSibling.classList &&
          anchor.previousElementSibling.classList.contains('feed-section-header')) {
        anchor = anchor.previousElementSibling;
      }
      let card;
      // One paid-guide card per feed, matched to the browsed city — it takes
      // the first slot after the newsletter capture (or the first slot
      // outright when capture is snoozed/done).
      if (breakIndex === 0 && captureEligible()) {
        card = buildCaptureCard('feed_card',
          'Get the free GTA Weekend Playbook 📖',
          '70+ family outings actually worth your Saturday, plus five fresh picks every Thursday morning, weather-checked and closure-checked.',
          'Send my Playbook');
      } else if (!guidePromoUsed && matchGuideForCity()) {
        card = buildGuidePromoCard(matchGuideForCity());
        guidePromoUsed = true;
      } else if ((breakIndex + dayOffset) % 2 === 0) {
        card = buildAdCard();
      } else {
        card = buildFunFactCard(FUN_FACTS[(dayOffset + breakIndex) % FUN_FACTS.length]);
      }
      anchor.parentNode.insertBefore(card, anchor);
      breakIndex++;
    }
  }

  // ---------- Corridor memory ----------
  // Spots this browser regularly browses from ("my end of Yonge Street"),
  // remembered locally and sent with browse requests — the server answers
  // with a "Spotted on your route" shelf of high-rated places along them.
  const CORRIDOR_KEY = 'dayhop_corridors';
  function getCorridors() {
    try { const a = JSON.parse(localStorage.getItem(CORRIDOR_KEY)); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  function rememberCorridorPoint(coords, label) {
    if (!coords || coords.lat == null || coords.lng == null) return;
    try {
      const list = getCorridors();
      // ~2.5 km dedupe: same errand radius = same corridor point.
      const near = list.find(p => {
        const dLat = (p.lat - coords.lat) * 111, dLng = (p.lng - coords.lng) * 79;
        return Math.sqrt(dLat * dLat + dLng * dLng) < 2.5;
      });
      if (near) { near.at = Date.now(); if (label) near.label = label; }
      else list.unshift({ lat: coords.lat, lng: coords.lng, label: label || null, at: Date.now() });
      localStorage.setItem(CORRIDOR_KEY, JSON.stringify(list.slice(0, 3)));
    } catch { /* storage unavailable — the radar just stays quiet */ }
  }
  // ---------- Browse feed cache ----------
  // The R&R ⇄ Adventure toggle is the product's signature interaction; it
  // should feel like flipping a card, not re-asking the server (~6 s). Each
  // (mode|city|coords|dates) payload is kept for the session, and after a
  // successful render the *other* mode is quietly prefetched — so the first
  // toggle is already instant.
  const BROWSE_CACHE_TTL_MS = 10 * 60 * 1000;
  // Entries older than the fresh TTL but younger than this are still worth
  // PAINTING instantly (stale-while-revalidate) — yesterday's feed on screen
  // in 0 ms beats 6 s of skeletons, and the network refresh swaps it out.
  const BROWSE_CACHE_STALE_MS = 24 * 60 * 60 * 1000;
  const browseCache = new Map();
  let browsePrefetchKey = null;

  // Mirror the browse cache into localStorage: a Map dies on reload and
  // sessionStorage dies with the tab, so every fresh session re-paid the
  // full ~6s browse fetch. Restore stale-but-paintable entries at startup;
  // persist the newest few on every write (payloads are chunky).
  const BROWSE_CACHE_LS_KEY = 'dayhop_browse_cache_v2';
  try {
    const saved = JSON.parse(localStorage.getItem(BROWSE_CACHE_LS_KEY)) || {};
    Object.entries(saved).forEach(([k, v]) => {
      if (v && v.at && Date.now() - v.at < BROWSE_CACHE_STALE_MS) browseCache.set(k, v);
    });
    sessionStorage.removeItem('dayhop_browse_cache_v1'); // pre-v2 mirror
  } catch (e) { /* corrupt/private mode — start empty */ }

  function browseCachePut(key, entry) {
    browseCache.set(key, entry);
    try {
      const out = {};
      [...browseCache.entries()].slice(-4).forEach(([k, v]) => { out[k] = v; });
      localStorage.setItem(BROWSE_CACHE_LS_KEY, JSON.stringify(out));
    } catch (e) { /* quota — the in-memory cache still works */ }
  }

  function browseCacheKey(mode) {
    const coordsFresh = state.coords && Date.now() - state.coordsAt < COORDS_FRESH_MS;
    // ~2 km rounding mirrors the server cache grid, so a GPS jitter doesn't
    // count as a new location.
    const grid = coordsFresh ? `${Math.round(state.coords.lat * 50) / 50},${Math.round(state.coords.lng * 50) / 50}` : '';
    const city = state.locationChosen ? state.city : GTA_WIDE;
    return `${mode}|${city}|${grid}|${JSON.stringify(getDatePayload())}`;
  }

  // opts.surprise / opts.exhausted let the surprise path set its state
  // BEFORE the single render below — it used to set them after and pay a
  // full second renderResultsHeader + updateFeedChrome to correct two
  // booleans.
  function applyBrowsePayload(data, opts = {}) {
    state.allIdeas = data.ideas || [];
    state.browseMode = true;
    state.surpriseMode = opts.surprise === true;
    state.nextExhausted = opts.exhausted === true;
    state.nextPages = 0;
    state.browseLayout = data.layout === 'top5' ? 'top5' : 'full';
    state.feedUnfolded = false;
    state.dismissedIds = new Set();
    state.lastPrompt = '';
    state.lastWeather = data.weather || null;
    state.lastSky = data.sky || null;
    state.featuredExtra = data.featured || [];
    state.featuredCurated = data.featured_curated !== false; // default GTA behavior
    state.lastAdvisories = data.advisories || [];
    state.lastAdvisoriesStatus = data.advisories_status || null;
    renderWeatherStrip(data.weather);
    renderAdvisoryStrip();
    renderResultsHeader();
    favsEnsureListForFeed();
    renderFeed(true);
    renderFeaturedEvent(data.ideas || []);
  }

  // ---------- Hero featured: nights under the open sky ----------
  // The right rail of the split hero rotates through stargazing spots,
  // observatories, and open-air gatherings around the GTA. The pool is a
  // hand-curated evergreen set, topped up with any matching dated events
  // from the live Toronto feeds (soonest first). It rotates two ways:
  // each visit starts one step further through the pool, and within a
  // visit the card gently advances every ~10s (paused on hover/focus,
  // skipped entirely under prefers-reduced-motion).
  const FEATURED_ROT_KEY = 'dayhop_featured_rot_v1';
  let featuredRotBumped = false;
  let featuredOffset = 0;
  let featuredTimer = null;
  // Current rotation pool, kept for the back arrow (its handler lives in
  // renderFeaturedCard, which only receives the single card to draw).
  let featuredPoolRef = null;

  // The back arrow walks featuredOffset negative, and JS `%` keeps the
  // sign — index through here so rewinding never lands out of bounds.
  function featuredIndex(pool, step) {
    const len = pool.length;
    return ((featuredRotation() + featuredOffset + (step || 0)) % len + len) % len;
  }

  // Live-feed events that belong under this banner.
  const SKY_MATCH = /\b(stargaz|observator|astronom|telescope|planetari|night sky|under the stars|moonlit|full moon|open[- ]air|outdoor (movie|cinema|film|concert))/i;

  const SKY_FEATURES = [
    {
      id: 'sky-ddo', category: 'culture', schedule: 'Public star nights', dark_sky: true,
      title: 'David Dunlap Observatory',
      venue: 'David Dunlap Observatory, Richmond Hill',
      location: '123 Hillsview Dr, Richmond Hill',
      why: 'Stand under the great dome of Canada’s largest optical telescope. Guided public star nights with real deep-sky viewing, minutes from downtown Richmond Hill.',
      image_url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=900&q=70',
      maps_url: 'https://www.google.com/maps/search/?api=1&query=David+Dunlap+Observatory+Richmond+Hill'
    },
    {
      id: 'sky-carswell', category: 'culture', schedule: 'Wednesday evenings', dark_sky: true,
      title: 'Allan I. Carswell Observatory',
      venue: 'York University, North York',
      location: 'York University Keele Campus',
      why: 'York University opens its campus telescopes to the public on Wednesday evenings. Free, volunteer-guided, and surprisingly deep views of the night sky from the city.',
      image_url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=900&q=70',
      maps_url: 'https://www.google.com/maps/search/?api=1&query=Allan+I+Carswell+Observatory+York+University'
    },
    {
      id: 'sky-tommy-thompson', category: 'water', schedule: 'Clear nights', dark_sky: true,
      title: 'Stargazing on the Leslie Spit',
      venue: 'Tommy Thompson Park, Toronto',
      location: 'Tommy Thompson Park, 1 Leslie St',
      why: 'The car-free spit is downtown’s darkest sky. Walk out toward the lighthouse with a blanket and watch the stars come up over the lake while the skyline glows behind you.',
      image_url: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=900&q=70',
      maps_url: 'https://www.google.com/maps/search/?api=1&query=Tommy+Thompson+Park+Toronto'
    },
    {
      id: 'sky-rouge', category: 'general', schedule: 'Dark-sky nights', dark_sky: true,
      title: 'Dark skies in Rouge Park',
      venue: 'Rouge National Urban Park, Scarborough',
      location: 'Rouge National Urban Park',
      why: 'Canada’s first national urban park gets properly dark. Bring a red flashlight, find a meadow, and catch the Milky Way rising over the Little Rouge valley.',
      image_url: 'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?auto=format&fit=crop&w=900&q=70',
      maps_url: 'https://www.google.com/maps/search/?api=1&query=Rouge+National+Urban+Park'
    },
    {
      id: 'sky-christie-pits', category: 'culture', schedule: 'Summer Sundays',
      title: 'Open-air films at Christie Pits',
      venue: 'Christie Pits Park, Toronto',
      location: 'Christie Pits Park, 750 Bloor St W',
      why: 'Open-air cinema on the hillside. Arrive at dusk with a blanket and watch a film under the summer sky with half the neighbourhood spread out around you.',
      image_url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=900&q=70',
      maps_url: 'https://www.google.com/maps/search/?api=1&query=Christie+Pits+Park+Toronto'
    },
    {
      id: 'sky-trillium', category: 'water', schedule: 'Warm evenings',
      title: 'Sunset evenings at Trillium Park',
      venue: 'Trillium Park, Ontario Place',
      location: 'Trillium Park, 955 Lake Shore Blvd W',
      why: 'A carved-granite point on the old Ontario Place grounds. Sunset picnics, skyline views, and open lawns that fill with easy-going crowds as the light goes gold.',
      image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=70',
      maps_url: 'https://www.google.com/maps/search/?api=1&query=Trillium+Park+Toronto'
    }
  ];

  function featuredRotation() {
    let n = 0;
    try { n = parseInt(localStorage.getItem(FEATURED_ROT_KEY), 10) || 0; } catch (e) { /* ignore */ }
    if (!featuredRotBumped) {
      featuredRotBumped = true;
      n += 1;
      try { localStorage.setItem(FEATURED_ROT_KEY, String(n)); } catch (e) { /* ignore */ }
    }
    return n;
  }

  // Chip label for algorithmic featured picks (curated items carry their own).
  function featuredChip(f) {
    if (f.newly_opened) return 'Just opened ✨';
    const t = `${f.title || ''} ${f.description || ''} ${f.venue || ''}`;
    if (/observator|planetari|stargaz|astronom|telescope/i.test(t)) return 'Star nights';
    if (/outdoor (movie|cinema|film|concert)|open[- ]air/i.test(t)) return 'Open air';
    if (/lookout|viewpoint|scenic|sunset|golden hour/i.test(t)) return 'Golden hour';
    if (/beach|boardwalk|waterfall/i.test(t)) return 'By the water';
    return 'Under open skies';
  }

  function isDarkSkyItem(f) {
    return f.dark_sky === true ||
      /stargaz|observator|planetari|astronom|night sky|dark sk/i.test(`${f.title || ''} ${f.why || ''} ${f.description || ''}`);
  }

  // The rotation pool, blended city-agnostically: dated sky events from the
  // live feed, then the server's algorithmic picks for the chosen city
  // (observatories, lookouts, beaches, open-air anything), then — under GTA
  // skies only — the hand-curated pool. Deduped by id and title so the same
  // place never rotates in twice. On a clear night the dark-sky items lead.
  function featuredPool(ideas) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const live = (ideas || [])
      .filter(i => i.date && /^\d{4}-\d{2}-\d{2}/.test(i.date) && i.date.slice(0, 10) >= today)
      .filter(i => SKY_MATCH.test(`${i.title || ''} ${i.why || ''} ${i.description || ''}`))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const extra = (state.featuredExtra || [])
      .map(f => Object.assign({}, f, { schedule: f.schedule || featuredChip(f) }));
    const curated = state.featuredCurated === false ? [] : SKY_FEATURES;

    const merged = [];
    const seen = new Set();
    for (const item of [...live, ...extra, ...curated]) {
      const idKey = String(item.id || '').toLowerCase();
      const titleKey = 't:' + String(item.title || '').toLowerCase().trim();
      if ((idKey && seen.has(idKey)) || seen.has(titleKey)) continue;
      if (idKey) seen.add(idKey);
      seen.add(titleKey);
      merged.push(item);
    }

    // Never an empty hero column: a city with no live matches and no
    // algorithmic picks (e.g. outside Ontario) falls back to the home-turf
    // sky pool — GTA inspiration beats a collapsed split hero.
    const pool = merged.length ? merged : SKY_FEATURES.slice();

    // Condition-aware: on a genuinely clear night (Open-Meteo via the browse
    // payload), the dark-sky spots lead the rotation and say why.
    const sky = state.lastSky;
    if (sky && sky.clear_tonight) {
      const chip = sky.moon_illumination_pct <= 35 ? 'clear & dark tonight ✨' : 'clear skies tonight ✨';
      const dark = pool.filter(isDarkSkyItem)
        .map(f => Object.assign({}, f, { schedule: chip }));
      return dark.concat(pool.filter(f => !isDarkSkyItem(f)));
    }
    return pool;
  }

  // On desktop the featured card is in the initial viewport and a strong
  // LCP candidate — loading="lazy" DELAYED its fetch behind a layout pass,
  // the opposite of what the hero wants. First paint goes eager+high;
  // rotation swaps go back to lazy (startFeaturedTimer preloads them
  // before fading anyway, so lazy is a harmless hint there).
  let featuredFirstPaint = true;
  function renderFeaturedCard(aside, ev) {
    const fallback = categoryImage(ev.category, 900);
    const imgAttrs = featuredFirstPaint
      ? 'loading="eager" fetchpriority="high"'
      : 'loading="lazy"';
    featuredFirstPaint = false;
    aside.innerHTML = `
      <div class="featured-card" role="button" tabindex="0" aria-label="Featured: ${escapeAttr(ev.title)}">
        <div class="featured-card-photo">
          <img src="${escapeAttr(ev.image_url || fallback)}" alt="" ${imgAttrs}
            onerror="this.onerror=null;this.src='${escapeAttr(fallback)}'">
          <span class="featured-card-date">${escapeHtml(ev.date ? formatEventDate(ev.date) : (ev.schedule || ''))}</span>
          <span class="hero-featured-eyebrow">🌌 Under open skies</span>
          ${featuredPoolRef && featuredPoolRef.length > 1 ? '<button type="button" class="featured-back-btn" aria-label="Show the previous featured spot">‹</button>' : ''}
        </div>
        <div class="featured-card-body">
          <h3 class="featured-card-title">${escapeHtml(ev.title)}</h3>
          ${ev.why || ev.description ? `<p class="featured-card-desc">${escapeHtml(ev.why || ev.description)}</p>` : ''}
          ${ev.venue || ev.location ? `<span class="featured-card-venue">${escapeHtml(ev.venue || ev.location)}</span>` : ''}
          <div class="featured-card-actions">
            <button type="button" class="primary-btn featured-add-btn">Add to my day →</button>
          </div>
        </div>
      </div>`;
    aside.hidden = false;

    const card = aside.querySelector('.featured-card');
    const open = () => { track('featured_event_open', ev); openDetail(ev); };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    aside.querySelector('.featured-add-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      // addToShortlist shows its own toast WITH the Undo action — a second
      // toast here overwrote it the frame it appeared, killing Undo.
      addToShortlist(ev, null);
      renderFeed();
    });
    const backBtn = aside.querySelector('.featured-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // the whole card is a click target (openDetail)
        featuredGoBack(aside);
      });
    }
  }

  // Back arrow: step one card into the past (rotation is a ring, so "the
  // ones that passed" are always reachable). Deliberately no forward arrow —
  // forward is what the ambient rotation already does.
  function featuredGoBack(aside) {
    const pool = featuredPoolRef;
    if (!pool || pool.length < 2) return;
    featuredOffset -= 1;
    const prev = pool[featuredIndex(pool)];
    track('featured_back', prev);
    const pre = new Image();
    const swap = () => {
      aside.classList.add('is-quick-swap', 'is-swapping');
      setTimeout(() => {
        if (!aside.style.height) aside.style.minHeight = `${aside.offsetHeight}px`;
        renderFeaturedCard(aside, prev);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          aside.classList.remove('is-swapping');
          // Drop the quick-transition class only after the fade-in finishes,
          // or the ambient 2.2s crossfade timing would grab mid-flight.
          setTimeout(() => aside.classList.remove('is-quick-swap'), 260);
        }));
      }, 230);
    };
    pre.onload = swap;
    pre.onerror = swap;
    pre.src = prev.image_url || categoryImage(prev.category, 900);
    // Restart the ambient timer so the card the user just rewound to isn't
    // immediately rotated away from under them.
    startFeaturedTimer(aside, pool);
  }

  // ---------- Mode discoverability nudge ----------
  // A small tag on the toggle telling first-time visitors the two modes are
  // tappable. It stays (bobbing gently) until the user switches modes once,
  // then dismisses permanently.
  const MODE_NUDGE_KEY = 'dayhop_mode_nudge_done_v1';

  function wireModeNudge() {
    let done = false;
    try { done = localStorage.getItem(MODE_NUDGE_KEY) === '1'; } catch (e) { /* ignore */ }
    const toggle = document.getElementById('mode-toggle');
    const hint = document.getElementById('mode-hint');
    if (!toggle || !hint || done) return;
    const row = hint.closest('.mode-hint-row') || hint.parentElement;

    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'mode-nudge';
    // Invite the mode the user ISN'T in — re-synced whenever the hint line
    // changes (i.e. on every mode switch, click or swipe).
    const sync = () => {
      tag.textContent = state.mode === 'adventure' ? '↔ tap for R&R' : '↔ tap for Adventure';
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(hint, { childList: true });
    row.appendChild(tag);

    const dismiss = () => {
      try { localStorage.setItem(MODE_NUDGE_KEY, '1'); } catch (e) { /* ignore */ }
      obs.disconnect();
      tag.classList.add('is-leaving');
      setTimeout(() => tag.remove(), 600);
      toggle.removeEventListener('click', dismiss);
    };
    toggle.addEventListener('click', dismiss);
    // The tag does what it says: switch to the other mode (the synthetic
    // click bubbles through the toggle, which also dismisses the nudge).
    tag.addEventListener('click', () => {
      const other = toggle.querySelector('.mode-option[aria-checked="false"]');
      if (other) other.click();
    });
  }

  let featuredDeferObs = null;

  // Split-hero alignment: the featured card spans exactly from the mode
  // toggle's top edge to the prompt box's bottom edge, so the two columns
  // read as one composed unit. Re-measured whenever the planner column
  // changes shape (date tray opening, font load, mode switch) or the
  // window resizes. Below the split breakpoint the card sizes naturally.
  function syncFeaturedHeight() {
    const aside = document.getElementById('hero-featured');
    const toggle = document.getElementById('mode-toggle');
    const form = document.getElementById('prompt-form');
    if (!aside || !toggle || !form) return;
    if (!window.matchMedia('(min-width: 880px)').matches) {
      aside.style.height = '';
      aside.style.removeProperty('--featured-photo-h');
      return;
    }
    const t = toggle.getBoundingClientRect();
    const f = form.getBoundingClientRect();
    const h = Math.round(f.bottom - t.top);
    if (h > 240) { aside.style.height = `${h}px`; aside.style.minHeight = ''; }
    // The photo's bottom edge sits level with the prompt box's top edge, so
    // photo ↔ (toggle+headline) and card body ↔ prompt box pair up as two
    // matched bands across the hero. Set as a CSS variable on the aside so
    // it survives the rotation's innerHTML swaps.
    const photoH = Math.round(f.top - t.top);
    if (photoH > 120) aside.style.setProperty('--featured-photo-h', `${photoH}px`);
  }

  function wireFeaturedHeightSync() {
    // rAF-coalesced: resize fires dozens of times/sec during a window drag
    // (and on every mobile URL-bar show/hide), and syncFeaturedHeight does
    // two getBoundingClientRect reads + style writes — a forced-layout cycle
    // per event without this. One measurement per frame is plenty. It also
    // breaks the ResizeObserver feedback loop: the observer watches
    // .hero-left, the sync writes a height in the same grid, and observer →
    // write → observer could otherwise re-enter synchronously.
    let queued = 0;
    const syncOnFrame = () => {
      if (queued) return;
      queued = requestAnimationFrame(() => { queued = 0; syncFeaturedHeight(); });
    };
    const left = document.querySelector('.hero-left');
    if ('ResizeObserver' in window && left) {
      new ResizeObserver(syncOnFrame).observe(left);
    }
    window.addEventListener('resize', syncOnFrame, { passive: true });
    syncFeaturedHeight();
  }

  function featuredOffscreen(aside) {
    const r = aside.getBoundingClientRect();
    return r.bottom <= 0 || r.top >= window.innerHeight;
  }

  function renderFeaturedEvent(ideas) {
    const aside = document.getElementById('hero-featured');
    if (!aside) return;
    const pool = featuredPool(ideas);
    if (!pool.length) { aside.hidden = true; aside.innerHTML = ''; featuredPoolRef = null; return; }
    featuredPoolRef = pool;

    const apply = () => {
      renderFeaturedCard(aside, pool[featuredIndex(pool)]);
      startFeaturedTimer(aside, pool);
    };

    // Never re-render the hero while the reader is scrolled past it — the
    // layout shift disturbs the pinned-hero scroll math and yanks the page
    // back to the top. Hold the update until the card is back in view.
    if (featuredDeferObs) { featuredDeferObs.disconnect(); featuredDeferObs = null; }
    if (!aside.hidden && featuredOffscreen(aside) && 'IntersectionObserver' in window) {
      featuredDeferObs = new IntersectionObserver((entries) => {
        if (!entries.some(e => e.isIntersecting)) return;
        featuredDeferObs.disconnect();
        featuredDeferObs = null;
        if (!aside.style.height) aside.style.minHeight = `${aside.offsetHeight}px`;
        apply();
      });
      featuredDeferObs.observe(aside);
      return;
    }
    apply();
  }

  function startFeaturedTimer(aside, pool) {
    if (featuredTimer) clearInterval(featuredTimer);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    featuredTimer = setInterval(() => {
      // A hidden tab keeps "rotating" as far as viewport rects are
      // concerned — without this check a backgrounded tab quietly keeps
      // downloading ~900px preload images for as long as it lives.
      if (document.hidden) return;
      // Hold still while the reader is engaging with the card, and never
      // swap off-screen (same pinned-hero concern as above).
      if (featuredOffscreen(aside)) return;
      if (aside.matches(':hover') || aside.contains(document.activeElement)) return;
      featuredOffset += 1;
      const next = pool[featuredIndex(pool)];
      // Preload the incoming photo BEFORE fading, so the card never sits
      // blank waiting on the network mid-rotation.
      const pre = new Image();
      const swap = () => {
        aside.classList.add('is-swapping'); // fade the old card out…
        setTimeout(() => {
          // Freeze the column height across the swap so the hero's layout
          // doesn't shift under the reader (skipped when the split-hero
          // sync already fixes the height).
          if (!aside.style.height) aside.style.minHeight = `${aside.offsetHeight}px`;
          // …swap while fully transparent, then release the class a frame
          // later so the new card FADES in instead of popping in. The
          // double-rAF guarantees the browser paints an opacity-0 frame
          // with the new content before the transition back to 1 starts.
          renderFeaturedCard(aside, next);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            aside.classList.remove('is-swapping');
          }));
        }, 2250);
      };
      pre.onload = swap;
      pre.onerror = swap;
      pre.src = next.image_url || categoryImage(next.category, 900);
    }, 16000);
  }

  function prefetchOtherModeFeed() {
    const other = state.mode === 'adventure' ? 'rr' : 'adventure';
    const key = browseCacheKey(other);
    const hit = browseCache.get(key);
    if ((hit && Date.now() - hit.at < BROWSE_CACHE_TTL_MS) || browsePrefetchKey === key) return;
    browsePrefetchKey = key;
    // A beat after render so the visible feed's images win the bandwidth.
    setTimeout(() => {
      const coordsFresh = state.coords && Date.now() - state.coordsAt < COORDS_FRESH_MS;
      fetch('/api/browse', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(Object.assign(
          {
            city: state.locationChosen ? state.city : GTA_WIDE,
            mode: other,
            coords: coordsFresh ? state.coords : undefined,
            owner_id: getOwnerId(),
            seen: getSeenIdeas()
          },
          getDatePayload()
        ))
      })
        .then(res => (res.ok ? res.json() : null))
        .then(data => { if (data && (data.ideas || []).length) browseCachePut(key, { at: Date.now(), data }); })
        .catch(() => {})
        .finally(() => { if (browsePrefetchKey === key) browsePrefetchKey = null; });
    }, 1500);
  }

  async function loadBrowseFeed() {
    if (state.isGenerating) return;
    // Prompt results own the feed; browse only fills idle or browse-owned feeds.
    if (state.allIdeas.length && !state.browseMode) return;
    if (browseAbort) browseAbort.abort();

    // Fresh cache hit → instant swap, no skeletons, no spinner, no network.
    const cacheHit = browseCache.get(browseCacheKey(state.mode));
    const cacheAge = cacheHit ? Date.now() - cacheHit.at : Infinity;
    if (cacheHit && cacheAge < BROWSE_CACHE_TTL_MS) {
      browseAbort = null;
      document.getElementById('empty-state').hidden = true;
      document.getElementById('noresults-state').hidden = true;
      applyBrowsePayload(cacheHit.data);
      setFeedRefreshing(false); // a superseded background refresh may have left the pill on
      const feedEl = document.getElementById('discovery-feed');
      if (feedEl) feedEl.setAttribute('aria-busy', 'false');
      prefetchOtherModeFeed();
      return;
    }

    // Stale hit (up to 24 h old) → paint it NOW, refresh in the background.
    // A returning visitor sees their feed in 0 ms instead of ~6 s of
    // skeletons; the network fetch below quietly swaps in fresh data.
    const staleShown = Boolean(cacheHit && cacheAge < BROWSE_CACHE_STALE_MS);

    const ctl = new AbortController();
    browseAbort = ctl;

    const feed = document.getElementById('discovery-feed');
    document.getElementById('empty-state').hidden = true;
    document.getElementById('noresults-state').hidden = true;
    let progress = null;
    if (staleShown) {
      applyBrowsePayload(cacheHit.data);
      feed.setAttribute('aria-busy', 'false');
      setFeedRefreshing(true);
    } else {
      setFeedRefreshing(false);
      feed.setAttribute('aria-busy', 'true');
      renderSkeletons();
      progress = startProgress('browse');
    }

    try {
      const coordsFresh = state.coords && Date.now() - state.coordsAt < COORDS_FRESH_MS;
      const res = await fetch('/api/browse', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(Object.assign(
          {
            // First-timers see a living GTA-wide feed before ever touching the
            // location picker (an empty first screen is a dead first screen);
            // generating still requires an explicit location.
            city: state.locationChosen ? state.city : GTA_WIDE,
            mode: state.mode,
            coords: coordsFresh ? state.coords : undefined,
            owner_id: getOwnerId(),
            seen: getSeenIdeas(),
            corridors: getCorridors().map(p => ({ lat: p.lat, lng: p.lng, label: p.label })),
            // First-touch attribution (utm / referrer from pixel.js) so the
            // browse_feed event — the first thing most visitors trigger —
            // records where they came from.
            attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined
          },
          getDatePayload()
        )),
        signal: ctl.signal
      });
      if (ctl !== browseAbort) { if (progress) progress.fail(); return; } // superseded by a newer browse/prompt
      if (!res.ok) throw new Error('browse failed');
      const data = await res.json();
      if (progress) progress.finish();
      const hasFresh = (data.ideas || []).length > 0;
      if (hasFresh) browseCachePut(browseCacheKey(state.mode), { at: Date.now(), data });
      browseAutoRetried = false; // a success (fresh or empty) re-arms the auto-retry
      if (hasFresh) {
        recordSeenIdeas(data.ideas);
        if (state.locationChosen && coordsFresh) rememberCorridorPoint(state.coords, state.city);
        applyBrowsePayload(data);
        prefetchOtherModeFeed();
      } else if (!staleShown) {
        // A genuinely empty result is the same dead end as a failed request —
        // today's escapes must never fall through to the type-a-prompt empty
        // state while a retry could still turn up something real.
        renderBrowseRetry();
      }
    } catch (err) {
      if (progress) progress.fail();
      if (err.name === 'AbortError') return;
      // A failed background refresh never clobbers the stale feed already on
      // screen — the user keeps browsing yesterday's picks, no retry card.
      if (staleShown) return;
      state.browseMode = false;
      renderBrowseRetry();
    } finally {
      if (ctl === browseAbort) setFeedRefreshing(false);
      if (ctl === browseAbort && !state.isGenerating) {
        feed.setAttribute('aria-busy', 'false');
      }
    }
  }

  // A failed browse never leaves a silently blank first screen: show a
  // friendly retry card and quietly try once more on our own — the usual
  // culprit is the free-tier server (or a partner API) still waking up.
  let browseAutoRetried = false;
  function renderBrowseRetry() {
    const feed = document.getElementById('discovery-feed');
    if (!feed || state.allIdeas.length) return;
    feed.innerHTML = `
      <div class="empty-state">
        <p class="empty-mark">· · · ·</p>
        <h3>Still waking up 🥱</h3>
        <p>Couldn't load nearby ideas just now.</p>
        <button class="ghost-btn" id="browse-retry-btn" type="button">Try again</button>
      </div>`;
    const btn = document.getElementById('browse-retry-btn');
    if (btn) btn.addEventListener('click', () => loadBrowseFeed());
    if (!browseAutoRetried) {
      browseAutoRetried = true;
      setTimeout(() => {
        if (!state.allIdeas.length && !state.isGenerating) loadBrowseFeed();
      }, 4000);
    }
  }

  // ---------- Voice prompt ----------
  // Talk a whole day request into the prompt box. On-device Web Speech API
  // only: nothing is uploaded, there is no per-minute cost, and it already
  // ships in Chrome, Edge and Safari. Firefox has no implementation, so the
  // button disables itself there instead of pretending.
  //
  // Three rules hold the whole thing together:
  //   1. Never auto-submit. Speech lands in the textarea; the user reads it
  //      and taps Plan my day. A misheard word must never cost a generation.
  //   2. Never wipe what they typed. Only the span this voice session added
  //      is rewritten as interim results firm up.
  //   3. Never open a modal. A blocked mic is one line under the box.
  const VOICE_SILENCE_MS = 2500;  // stop this long after they stop speaking
  const VOICE_MAX_MS = 90000;     // hard cap on a single session
  const VOICE_MAX_RESTARTS = 6;   // Chrome ends continuous sessions on its own

  // Web Speech hears generic English for GTA place names. Each fix is anchored
  // on word boundaries so it can only ever swap a whole word, and the list is
  // deliberately short — only mishearings that are unambiguous in a GTA
  // day-trip sentence. Applied to final transcripts only, never to interim
  // text (which would make words visibly flip while the user is still talking).
  const VOICE_FIXES = [
    [/\bcourt\s?right\b/gi, 'Kortright'],
    [/\bcort\s?right\b/gi, 'Kortright'],
    [/\bkort\s?right\b/gi, 'Kortright'],
    [/\bvaughn\b/gi, 'Vaughan'],
    [/\bkleinberg\b/gi, 'Kleinburg'],
    [/\boak\s?ridge\b(?!s)/gi, 'Oak Ridges'],
    [/\bbonn?d\s?lake\b/gi, 'Bond Lake'],
    [/\bscarboro\b/gi, 'Scarborough'],
    [/\bsplash\s?pat\b/gi, 'splash pad']
  ];
  function applyVoiceFixes(text) {
    return VOICE_FIXES.reduce((acc, [re, to]) => acc.replace(re, to), text);
  }

  function initVoicePrompt() {
    const btn = document.getElementById('mic-btn');
    const statusEl = document.getElementById('voice-status');
    const textarea = document.getElementById('grok-prompt');
    if (!btn || !statusEl || !textarea) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Spec'd fallback: keep it visible but inert, so the capability is
      // discoverable and the reason is one hover away.
      btn.disabled = true;
      btn.title = 'Voice works in Chrome, Edge, Safari.';
      btn.setAttribute('aria-label', 'Voice input is not supported in this browser. Voice works in Chrome, Edge, Safari.');
      return;
    }

    let recognition = null;
    let listening = false;     // a session is open (mic live)
    let stopping = false;      // user/timer asked to stop; waiting for onend
    let baseText = '';         // textarea content this session must preserve
    let sessionFinal = '';     // finalised speech for this session
    let lastWritten = null;    // exact string we last assigned, for edit detection
    let restarts = 0;
    let startedAt = 0;
    let silenceTimer = null;
    let maxTimer = null;
    let tickTimer = null;
    let heardSpeech = false;

    const setStatus = (text, isError) => {
      statusEl.textContent = text || '';
      statusEl.classList.toggle('is-error', Boolean(isError));
      statusEl.hidden = !text;
    };

    const mmss = (ms) => {
      const s = Math.floor(ms / 1000);
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };

    const setButtonState = (mode) => {
      btn.classList.toggle('is-listening', mode === 'listening');
      btn.classList.toggle('is-busy', mode === 'busy');
      btn.setAttribute('aria-pressed', mode === 'listening' ? 'true' : 'false');
      btn.setAttribute('aria-label', mode === 'listening' ? 'Stop listening' : 'Speak your day');
    };

    const clearTimers = () => {
      clearTimeout(silenceTimer); silenceTimer = null;
      clearTimeout(maxTimer); maxTimer = null;
      clearInterval(tickTimer); tickTimer = null;
    };

    // Compose = what they had + what this session has said. If the user edited
    // the box mid-session, re-baseline onto their edit and keep appending from
    // there: their change survives and nothing already transcribed is lost,
    // because it is already part of the value we are re-baselining onto.
    const render = (interim) => {
      if (lastWritten !== null && textarea.value !== lastWritten) {
        baseText = textarea.value;
        sessionFinal = '';
      }
      const spoken = (sessionFinal + interim).replace(/\s+/g, ' ').trimStart();
      const gap = baseText && !/\s$/.test(baseText) && spoken ? ' ' : '';
      const next = (baseText + gap + spoken).slice(0, textarea.maxLength > 0 ? textarea.maxLength : undefined);
      textarea.value = next;
      lastWritten = next;
      // Let the rest of the page react exactly as it does to typing (the
      // Surprise-me button hides itself on input).
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const armSilence = () => {
      clearTimeout(silenceTimer);
      if (!heardSpeech) return; // the 2.5s rule starts only once they've spoken
      silenceTimer = setTimeout(() => stop('silence'), VOICE_SILENCE_MS);
    };

    function stop(reason) {
      if (!listening || stopping) return;
      stopping = true;
      clearTimers();
      setButtonState('busy');
      setStatus('Finishing…');
      try { recognition.stop(); } catch (e) { /* already stopping */ }
      if (reason === 'max') setStatus('That’s the 90-second limit. Edit if needed, then plan your day.');
    }

    function finish() {
      listening = false;
      stopping = false;
      clearTimers();
      setButtonState('idle');
      render('');                       // drop any trailing interim text
      const added = sessionFinal.trim();
      if (added) {
        setStatus('Edit if needed, then tap Plan my day.');
        track('voice_prompt_committed');
      } else if (heardSpeech) {
        setStatus('Nothing came through. Tap the mic to try again.');
      } else {
        setStatus('Didn’t catch anything. Tap the mic and speak.');
      }
      // Focus stays in the box so the next thing they do is read and edit.
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      lastWritten = null;
    }

    function buildRecognition() {
      const r = new SpeechRecognition();
      r.continuous = true;
      r.interimResults = true;
      r.lang = navigator.language || 'en-CA';
      r.maxAlternatives = 1;
      // Phrase biasing is in the spec and in the standard, but Chrome treats
      // SpeechGrammarList as a no-op and Safari does not ship it at all — so
      // it is attempted for the browsers that may honour it one day, and
      // VOICE_FIXES above is what actually corrects the place names today.
      try {
        const GrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;
        if (GrammarList) {
          const terms = ['Richmond Hill', 'Vaughan', 'Bond Lake', 'Kortright', 'Oak Ridges', 'trail', 'lookout', 'splash pad'];
          const list = new GrammarList();
          list.addFromString('#JSGF V1.0; grammar places; public <place> = ' + terms.join(' | ') + ' ;', 1);
          r.grammars = list;
        }
      } catch (e) { /* no grammar support; the fix pass covers it */ }

      r.onstart = () => {
        listening = true;
        setButtonState('listening');
        tick();
      };
      r.onspeechstart = () => { heardSpeech = true; };
      r.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0] ? res[0].transcript : '';
          if (res.isFinal) {
            heardSpeech = true;
            sessionFinal += applyVoiceFixes(text);
            if (!/\s$/.test(sessionFinal)) sessionFinal += ' ';
          } else {
            interim += text;
          }
        }
        render(interim);
        armSilence();
      };
      r.onerror = (event) => {
        const code = event.error;
        if (code === 'aborted') return;            // our own stop()
        if (code === 'no-speech') return;          // handled in finish()
        listening = false;
        stopping = false;
        clearTimers();
        setButtonState('idle');
        restarts = VOICE_MAX_RESTARTS;             // don't fight a hard failure
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setStatus('Microphone is blocked. Allow it in your browser’s address-bar icon, then tap the mic again.', true);
        } else if (code === 'audio-capture') {
          setStatus('No microphone found. You can still type your day.', true);
        } else if (code === 'network') {
          setStatus('Voice needs a connection. Check it and tap the mic again.', true);
        } else {
          setStatus('Voice didn’t work that time. You can still type your day.', true);
        }
      };
      r.onend = () => {
        // Chrome ends a continuous session on its own after a pause. If the
        // user hasn't stopped and we're inside the 90s cap, pick it back up so
        // a long, rambling request survives their thinking pauses.
        if (!stopping && listening && restarts < VOICE_MAX_RESTARTS && Date.now() - startedAt < VOICE_MAX_MS) {
          restarts++;
          try { r.start(); return; } catch (e) { /* fall through to finish */ }
        }
        finish();
      };
      return r;
    }

    function tick() {
      clearInterval(tickTimer);
      const paint = () => setStatus('Listening… ' + mmss(Date.now() - startedAt) + '  ·  tap the mic to stop');
      paint();
      tickTimer = setInterval(paint, 1000);
    }

    async function start() {
      baseText = textarea.value;
      sessionFinal = '';
      lastWritten = null;
      restarts = 0;
      heardSpeech = false;
      stopping = false;
      startedAt = Date.now();
      setButtonState('busy');
      setStatus('Checking microphone…');

      // A pre-check turns the common "blocked from a previous visit" case into
      // one honest line instead of a silent no-op when start() never fires.
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const st = await navigator.permissions.query({ name: 'microphone' });
          if (st.state === 'denied') {
            setButtonState('idle');
            setStatus('Microphone is blocked. Allow it in your browser’s address-bar icon, then tap the mic again.', true);
            return;
          }
        }
      } catch (e) { /* Safari/Firefox reject this name — carry on and let start() ask */ }

      recognition = buildRecognition();
      try {
        recognition.start();
      } catch (e) {
        setButtonState('idle');
        setStatus('Voice didn’t start. You can still type your day.', true);
        return;
      }
      maxTimer = setTimeout(() => stop('max'), VOICE_MAX_MS);
      track('voice_prompt_started');
    }

    btn.addEventListener('click', () => {
      if (listening || stopping) stop('tap');
      else start();
    });

    // A submit while the mic is live would send half a sentence.
    document.getElementById('prompt-form').addEventListener('submit', () => {
      if (listening) stop('submit');
    }, true);
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
      errorEl.textContent = 'First pick where 📍. Use your location, or type a city or postal code.';
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
    // The staged loader + skeleton cards live in the feed, below the hero —
    // bring them into view immediately so the wait is never a lone button
    // spinner (or worse, a blank viewport) with the real feedback off-screen.
    const loader = document.querySelector('.progress-loader');
    if (loader) loader.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    try {
      const data = await apiGenerateIdeas(prompt, state.currentFilter);
      progress.finish();
      state.allIdeas = data.ideas || [];
      state.browseMode = false;
      state.surpriseMode = false;
      state.nextExhausted = false;
      state.nextPages = 0;
      state.dismissedIds = new Set();
      state.lastPrompt = prompt;
      state.lastMode = state.mode;
      state.lastConstraints = data.constraints || null;
      state.lastWeather = data.weather || null;
      state.lastAdvisories = data.advisories || [];
      state.lastAdvisoriesStatus = data.advisories_status || null;
      renderWeatherStrip(data.weather);
      renderAdvisoryStrip();
      renderResultsHeader();
      favsEnsureListForFeed();
      renderFeed(true);
      bumpGeneratesUsed();
      // Snap, don't glide: a long smooth scroll through the page reads as a
      // blank screen on slower devices right at the moment of payoff.
      document.getElementById('results-header').scrollIntoView({ behavior: 'auto', block: 'start' });
      // Two-phase: these cards are the ranked pool — poll for the
      // AI-curated set and swap it in quietly when it's ready.
      if (data.phase === 'fast' && data.job) startCuratedPoll(data.job, prompt);
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

  // ---------- Two-phase curated pickup ----------
  // After a fast-phase generate, the server keeps curating with Grok. Poll
  // its result and swap the curated set in — quietly (no entrance animation,
  // no scroll yank). Dismissed/shortlisted cards survive the swap naturally:
  // visibleIdeas filters by id, and curated ideas reuse candidate ids.
  // Every guard is state-based, so a new prompt, browse, or surprise
  // simply strands the old poll (it checks and drops itself).
  let curatedPollTimer = null;
  function startCuratedPoll(job, prompt) {
    if (curatedPollTimer) { clearTimeout(curatedPollTimer); curatedPollTimer = null; }
    const startedAt = Date.now();
    const poll = async () => {
      curatedPollTimer = null;
      if (state.browseMode || state.lastPrompt !== prompt) return; // feed moved on
      if (Date.now() - startedAt > 45000) return; // curation overran — the pool stands
      try {
        const res = await fetch(`/api/generate/result/${encodeURIComponent(job)}`);
        if (res.status === 202) { curatedPollTimer = setTimeout(poll, 1500); return; }
        if (!res.ok) return; // expired/unknown — the pool stands
        const data = await res.json().catch(() => null);
        if (!data || data.failed) return;
        if (data.pending) { curatedPollTimer = setTimeout(poll, 1500); return; }
        if (!Array.isArray(data.ideas) || !data.ideas.length) return;
        if (state.browseMode || state.lastPrompt !== prompt) return; // re-check after the await
        state.allIdeas = data.ideas;
        renderResultsHeader();
        renderFeed(false);
        showToast('✨ Picks curated for you');
      } catch (e) { /* network blip — the pool feed stands on its own */ }
    };
    curatedPollTimer = setTimeout(poll, 1500);
  }

  // ---------- Surprise me / Next ----------
  // "Surprise me": a full promptless feed from mode + location alone.
  // Rides the browse render path (server-assigned sections), so the feed
  // shows Talk of the town / Top local locations / Curated by the
  // discovery engine without any new rendering machinery.
  async function handleSurprise() {
    if (state.isGenerating || state.isLoadingMore) return;
    document.getElementById('prompt-error').textContent = '';
    // A surprise wins over an in-flight browse fetch, same as a prompt.
    if (browseAbort) { browseAbort.abort(); browseAbort = null; }

    setLoading(true);
    const btn = document.getElementById('prompt-surprise-btn');
    btn.classList.add('is-loading');
    btn.disabled = true;
    const progress = startProgress('browse');
    const loader = document.querySelector('.progress-loader');
    if (loader) loader.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    let applied = false;
    try {
      const data = await apiSurprise();
      progress.finish();
      if ((data.ideas || []).length) {
        applyBrowsePayload(data, { surprise: true, exhausted: data.exhausted === true });
        applied = true;
        document.getElementById('results-header').scrollIntoView({ behavior: 'auto', block: 'start' });
      } else {
        // Never wipe a live feed for an empty surprise.
        showToast(`No surprises left around ${state.locationChosen ? state.city : 'the GTA'}. Try the other mode or another spot.`, { duration: 3500 });
      }
    } catch (err) {
      progress.fail();
      showToast(err.message || 'Could not pull a surprise together right now.', { duration: 3500 });
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      setLoading(false);
      // setLoading(true) painted skeletons — on failure/empty, repaint
      // whatever feed was there before (success already rendered).
      if (!applied) renderFeed();
    }
  }

  // "Next": append more unrelated-but-awesome picks — wider radius included —
  // under whatever feed is showing. Everything on screen goes into the
  // exclude list (ids AND titles), so pages never repeat.
  // Three "Next" pages per feed, then the well is declared dry. Each page is
  // served from the pre-bought venue index, but the cap keeps the feed a
  // curated set rather than an endless scroll — and bounds what one
  // session can ever ask the server for.
  const NEXT_PAGE_CAP = 3;

  async function handleNext({ auto = false } = {}) {
    if (state.isLoadingMore || state.isGenerating || state.nextExhausted) return;
    state.isLoadingMore = true;
    const btn = document.getElementById('feed-next-btn');
    btn.classList.add('is-loading');
    btn.disabled = true;
    try {
      // Most-recent-first: when trimming to the cap, keep what's on screen
      // NOW over what was excluded pages ago.
      const seen = [];
      for (let i = state.allIdeas.length - 1; i >= 0; i--) {
        const idea = state.allIdeas[i];
        if (idea.id != null) seen.push(String(idea.id));
        if (idea.title) seen.push(idea.title);
      }
      state.dismissedIds.forEach(id => seen.push(String(id)));
      state.shortlist.forEach(s => { if (s.id != null) seen.push(String(s.id)); if (s.title) seen.push(s.title); });

      const data = await apiSurprise({ exclude: seen.slice(0, 200), wider: true });
      const fresh = data.ideas || [];
      if (fresh.length) {
        state.allIdeas = state.allIdeas.concat(fresh);
        // Append, never rebuild: cards already on screen keep their DOM,
        // listeners, and decoded images.
        const firstNew = appendIdeasToFeed(fresh);
        // Only an explicit button press earns a scroll — auto-loaded pages
        // must never yank a feed the user is already scrolling through.
        if (!auto && firstNew && firstNew.scrollIntoView) {
          firstNew.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        }
      }
      state.nextPages = (state.nextPages || 0) + 1;
      if (data.exhausted === true || state.nextPages >= NEXT_PAGE_CAP) {
        state.nextExhausted = true;
        if (!fresh.length) showToast("That's everything awesome we could find 🎉", { duration: 3500 });
        else if (state.nextPages >= NEXT_PAGE_CAP) showToast("That's today's set. Describe your day for a tailored one ✨", { duration: 3500 });
      }
    } catch (err) {
      showToast(err.message || 'Could not load more right now.', { duration: 3500 });
    } finally {
      state.isLoadingMore = false;
      btn.classList.remove('is-loading');
      btn.disabled = false;
      updateFeedChrome();
    }
  }

  // ---------- Pro tier (Phase 4) ----------
  // One upgrade modal for every Pro gate: a contextual first line (what just
  // hit the limit) above the full benefits list, so the prompt always answers
  // "why am I seeing this" AND "what do I get".
  // Outcome language, not feature language: each line names the day the
  // user was about to have, then removes the thing standing in its way.
  const UPGRADE_CONTEXTS = {
    generate: "You're out of plans for today. With Pro, a great day is never more than a sentence away.",
    saved_guides: 'Never lose a perfect day again. Pro keeps every plan you make, forever.',
    edit_guide: "You've made this plan yours. Pro saves your version so it's ready next weekend.",
    multi_day: 'Turn a great day into a great weekend. Pro plans 2-3 day getaways.',
    replan: 'Weather changed? Kids changed the mood? Pro re-plans as often as your day does.',
    new_shortlist: 'Start fresh whenever inspiration strikes. Unlimited shortlists with Pro.',
    post_plan: 'Keep the whole long weekend planned. Unlimited plans, saved history, weekend trips.'
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
      ? `Try Pro free for 7 days, then $${state.price.amount} ${state.price.currency}/${state.price.interval} ✨`
      : 'Try Pro free for 7 days ✨';
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

  // ---------- Membership: hassle-free cancel / resume ----------
  // Principles: state the facts (what you have, when it renews or ends),
  // one inline confirmation on the same button, zero surveys or retention
  // mazes, and a change of heart is one click until the period lapses.
  function membershipEndDate() {
    const iso = state.billingInfo && state.billingInfo.current_period_end;
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d) ? null : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }

  function renderMembership() {
    const statusEl = document.getElementById('membership-status');
    const cancelBtn = document.getElementById('membership-cancel-btn');
    const resumeBtn = document.getElementById('membership-resume-btn');
    if (!statusEl || !cancelBtn || !resumeBtn) return;
    document.getElementById('membership-error').textContent = '';
    const info = state.billingInfo || {};
    const end = membershipEndDate();
    const cancelling = Boolean(info.cancel_at_period_end);

    if (cancelling) {
      statusEl.textContent = end
        ? `Pro stays active until ${end}, then won't renew. No further charges.`
        : `Pro stays active until the end of your current period, then won't renew.`;
      cancelBtn.hidden = true;
      resumeBtn.hidden = false;
    } else {
      statusEl.textContent = end
        ? `You're Pro. Unlimited plans, re-plans, and multi-day trips. Renews ${end}.`
        : `You're Pro. Unlimited plans, re-plans, and multi-day trips.`;
      cancelBtn.hidden = false;
      resumeBtn.hidden = true;
    }
    // Reset any half-finished confirm state.
    cancelBtn.classList.remove('is-confirming');
    cancelBtn.querySelector('.btn-label').textContent = 'Cancel membership';
  }

  function showMembershipModal() {
    renderMembership();
    const modal = document.getElementById('membership-panel');
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('modal--open'));
    overlayNav.opened('membership-panel');
  }

  function hideMembershipModal() {
    const modal = document.getElementById('membership-panel');
    modal.classList.remove('modal--open');
    setTimeout(() => { modal.hidden = true; }, 200);
    overlayNav.closed('membership-panel');
  }

  async function membershipRequest(path, btn, doneMsg) {
    const errEl = document.getElementById('membership-error');
    btn.classList.add('is-loading');
    btn.disabled = true;
    try {
      const res = await fetch(`/api/billing/${path}`, { method: 'POST', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not update your membership.');
      state.billingInfo = Object.assign({}, state.billingInfo, {
        cancel_at_period_end: data.cancel_at_period_end,
        current_period_end: data.current_period_end
      });
      renderMembership();
      showToast(doneMsg);
      refreshProStatus(); // keep badges/entitlements in sync
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  }

  function wireMembership() {
    const menuBtn = document.getElementById('manage-membership-btn');
    const cancelBtn = document.getElementById('membership-cancel-btn');
    const resumeBtn = document.getElementById('membership-resume-btn');
    if (!menuBtn || !cancelBtn || !resumeBtn) return;

    menuBtn.addEventListener('click', () => {
      const menu = document.getElementById('user-menu');
      if (menu) menu.hidden = true;
      showMembershipModal();
    });
    document.querySelectorAll('[data-close-membership]').forEach(el =>
      el.addEventListener('click', hideMembershipModal));

    // Two taps on the SAME button: "Cancel membership" → "Yes, cancel, keep
    // Pro until <date>". No nested dialogs, no guilt copy.
    cancelBtn.addEventListener('click', () => {
      if (!cancelBtn.classList.contains('is-confirming')) {
        cancelBtn.classList.add('is-confirming');
        const end = membershipEndDate();
        cancelBtn.querySelector('.btn-label').textContent =
          end ? `Yes, cancel, keep Pro until ${end}` : 'Yes, cancel my membership';
        return;
      }
      const end = membershipEndDate();
      membershipRequest('cancel', cancelBtn,
        end ? `Done. No more charges. Pro stays active until ${end}.` : 'Done. No more charges.');
    });

    resumeBtn.addEventListener('click', () => {
      membershipRequest('resume', resumeBtn, 'Welcome back. Your membership will renew as usual ✨');
    });
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
    if (label) label.textContent = days > 1 ? `Make my ${days}-day plan` : 'Make my day';
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
      showToast('Sign in first. We\'ll take you straight to checkout.', { duration: 4000 });
      const authBtn = document.getElementById('auth-btn');
      if (authBtn && !authBtn.hidden) authBtn.click();
      return;
    }
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        // Campaign attribution → Stripe metadata (which ad produced this
        // paying customer). Empty body is fine — the server sanitizes.
        body: JSON.stringify({
          attrib: (window.dayhopAttrib && window.dayhopAttrib()) || undefined
        })
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

  // Coalesce concurrent refreshes — init() and the auth INITIAL event used
  // to double-fetch /api/billing/status on every signed-in page load.
  let proStatusInflight = null;
  function refreshProStatus() {
    if (!proStatusInflight) {
      proStatusInflight = refreshProStatusNow().finally(() => { proStatusInflight = null; });
    }
    return proStatusInflight;
  }

  async function refreshProStatusNow() {
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
      state.billingInfo = res.ok ? data : null;
      if (badge) badge.hidden = !pro;
      if (goProBtn) goProBtn.hidden = !(res.ok && data.configured && !pro);
      if (adminLink) adminLink.hidden = !(res.ok && isLoggedIn() && data.admin);
      // Manage membership: only for real subscribers (admins have Pro
      // without a subscription behind it — nothing to manage).
      const manageBtn = document.getElementById('manage-membership-btn');
      if (manageBtn) manageBtn.hidden = !(pro && !data.admin && data.configured);
    } catch (e) {
      if (badge) badge.hidden = true;
      if (goProBtn) goProBtn.hidden = true;
      if (adminLink) adminLink.hidden = true;
      const manageBtn = document.getElementById('manage-membership-btn');
      if (manageBtn) manageBtn.hidden = true;
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
      : `<span class="plans-left-dots">${dots}</span><span>Back tomorrow, or</span><button type="button" class="linklike" id="plans-left-upgrade">go Pro for unlimited ✨</button>`;
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
    const sessionId = params.get('session_id');
    if (!billing) return;
    if (billing === 'success') {
      showToast('Welcome to DayHop Pro 🎉 Unlimited day plans unlocked.', { duration: 5000 });
      // Don't just wait on the webhook — a Render free-tier cold start can
      // miss it at the connection level (services/billing.js's
      // fulfillCheckoutSession comment). Reconcile the session directly
      // first, same fallback the guide-purchase flow already relies on.
      (sessionId
        ? fetch('/api/billing/fulfill', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
          }).catch(() => {})
        : Promise.resolve()
      ).then(refreshProStatus);
      setTimeout(refreshProStatus, 2500);
    } else if (billing === 'cancelled') {
      showToast('No worries. Pro is here whenever you want it.');
    }
    params.delete('billing');
    params.delete('session_id');
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

  // "Refreshing…" pill in the results header: visible while a stale cached
  // feed is on screen and the background browse refresh is in flight.
  function setFeedRefreshing(on) {
    const pill = document.getElementById('feed-refreshing');
    if (pill) pill.hidden = !on;
  }

  function renderResultsHeader() {
    const header = document.getElementById('results-header');
    if (!state.allIdeas.length) {
      header.hidden = true;
      return;
    }
    const where = state.coords && state.locationLabel ? `near ${state.locationLabel}` : state.city;
    if (state.browseMode) {
      document.getElementById('results-headline').textContent = state.surpriseMode
        ? 'A little of everything ✨'
        : (state.coords && state.locationLabel
          ? 'Happening near you 📍'
          : `Exploring ${(!state.locationChosen || state.city === GTA_WIDE) ? 'the GTA' : state.city}`);
      const bits = state.surpriseMode
        ? [`Surprise picks for ${state.coords && state.locationLabel ? state.locationLabel : ((!state.locationChosen || state.city === GTA_WIDE) ? 'the GTA' : state.city)}`, 'Hit Next below for more']
        : [`${state.allIdeas.length} ideas to browse`, 'Describe your day for a tailored set'];
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

    // The mode the search ran in, and what it was held to: a parent who
    // typed "with a 4 year old" in Adventure mode can see the age won.
    const bits = [`${state.allIdeas.length} ideas`, `${state.lastMode === 'adventure' ? 'Adventure' : 'R&R'} mode`];
    if (state.lastConstraints && state.lastConstraints.summary) bits.push(`Only ${state.lastConstraints.summary}`);
    bits.push(`Personalized for ${where}`);
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
    document.querySelectorAll('.filter-chip').forEach(c => {
      if (c.id === 'sort-distance-chip') return; // the sort toggle keeps its own active state
      c.classList.toggle('active', c.dataset.filter === category);
    });
    renderFeed(true);
  }

  function setSort(order) {
    state.sortBy = order;
    const chip = document.getElementById('sort-distance-chip');
    if (chip) {
      chip.classList.toggle('active', order === 'distance');
      chip.setAttribute('aria-pressed', order === 'distance' ? 'true' : 'false');
    }
    if (order === 'distance') track('feed_sort_distance');
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
        `<img src="${escapeAttr(i.image_url || categoryImage(i.category, 200))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${escapeAttr(categoryImage(i.category, 200))}'">`).join('');
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
    el.textContent = `${weatherEmoji(weather.condition)} ${weather.temp_c}°C, ${weather.description}. Ideas adjusted for current conditions`;
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
  // Memoized on the advisories array reference — buildCardChips asks once
  // PER CARD, which was a fresh copy+sort+filter ×100 per feed render for
  // an answer that only changes when a new payload lands.
  let bannerAdvisoriesMemo = { source: null, value: [] };
  function bannerAdvisories() {
    if (bannerAdvisoriesMemo.source === state.lastAdvisories) return bannerAdvisoriesMemo.value;
    const value = advisorySort(state.lastAdvisories).filter(a => (ADVISORY_RANK[a.severity] || 0) >= ADVISORY_RANK.caution);
    bannerAdvisoriesMemo = { source: state.lastAdvisories, value };
    return value;
  }

  function advisoryLineHtml(a) {
    const src = a.source === 'derived'
      ? 'DayHop estimate from current conditions'
      : (a.source_name || 'verified source');
    return `<strong>${escapeHtml(ADVISORY_EMOJI[a.type] || '⚠️')} ${escapeHtml(a.title)}</strong>: ${escapeHtml(a.message)} <span class="advisory-source">${escapeHtml(src)}</span>`;
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
        el.innerHTML = '<span class="advisory-main">Couldn\'t verify local advisories right now. Check conditions before heading out.</span>';
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
      return `<div class="plan-advisory plan-advisory--${cls}">⚠️ Heads up: ${escapeHtml(titles)}. This plan works around it, but conditions can change fast. Ask DayHop to re-plan if they do.</div>`;
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
          ? `${idea.title} is safe on your shortlist. Pick up right where you left off.`
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
        ? `The booking tab is open. ${idea.title} is on your shortlist, so nothing gets lost.`
        : 'Take your time over there. Your plan is waiting right here.'
    });
  }

  // ---------- Auth state ----------
  async function handleAuthChange(detail) {
    const wasLoggedIn = Boolean(state.user);
    const prevId = wasLoggedIn ? state.user.id : null;
    const nextUser = detail && detail.user ? detail.user : null;

    // Supabase re-emits auth events for an open tab (TOKEN_REFRESHED
    // roughly hourly, SIGNED_IN on tab refocus). Same user = nothing to
    // resync — running the full sign-in sync here re-fetched the shortlist
    // and billing and re-rendered the feed mid-scroll, every hour.
    if (nextUser && prevId === nextUser.id) { state.user = nextUser; return; }
    // Still signed out (e.g. the signed-out INITIAL event): init() already
    // fetched billing status once — nothing changed, don't fetch it again.
    if (!nextUser && !wasLoggedIn) return;

    state.user = nextUser;
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

      // Deletes that never reached the server: retry them now, and keep
      // those ids out of the merge below so they can't resurrect locally.
      state.pendingRemovals.forEach(id => serverShortlistRemove(id));

      const res = await fetch('/api/shortlist', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const serverItems = (data.items || []).map(i => i.idea)
          .filter(idea => !(idea && idea.id != null && state.pendingRemovals.has(String(idea.id))));
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
    if (favsGridActive()) await favsSyncFromServer();
    updateShortlistCount();
    renderShortlistPanel();
    renderFeed();
  }

  // On sign-out: clear the local shortlist so one account's data doesn't leak
  // into the next anonymous session on a shared device.
  function onSignedOut() {
    state.shortlist = [];
    state.lists = [];
    state.activeListId = null;
    state.pendingRemovals = new Set(); // account-scoped intents don't outlive the session
    state.myGuides = [];
    state.currentGuide = null;
    state.currentGuideId = null;
    state.savedGuide = null;
    clearDraft(); // same shared-device rule as the shortlist
    persist();
    updateShortlistCount();
    renderShortlistPanel();
    renderFeed();
    showToast('Signed out');
  }

  // ---------- Favs grid (mobile-only, /api/config.favsGrid) ----------
  // The shortlist as a discovery tool: named lists of photo tiles ("My
  // Favs"), a tap-to-peek mini modal with a slide-to-plan control, and a
  // square-tile feed with swipe-to-save. Everything below is gated by
  // favsGridActive(): desktop and flag-off never enter these paths.
  const FAVS_MQ = '(max-width: 640px)';
  const FAVS_LIST_CAP = 20;
  const FAVS_NAME_MAX = 40;
  const FAVS_COACH_KEY = 'dayhop_favs_coach_v1';

  // ?favsqa=1 forces the mobile layout on a wide viewport — QA only (the
  // Chrome automation window can't shrink below ~830 px), never linked.
  const FAVS_QA = /[?&]favsqa=1/.test(window.location.search);
  function favsGridActive() {
    return Boolean(state.favsGridFlag) && (FAVS_QA || (window.matchMedia && window.matchMedia(FAVS_MQ).matches));
  }

  function favsId() { return 'local-' + Math.random().toString(36).slice(2, 10); }
  function favsCityLabel() {
    return (!state.locationChosen || !state.city || state.city === GTA_WIDE) ? 'GTA' : state.city;
  }
  function favsMoodLabel(mode) { return mode === 'adventure' ? 'Adventure' : 'R&R'; }
  function favsListById(id) { return state.lists.find(l => l.id === id) || null; }
  function favsActiveList() {
    return favsListById(state.activeListId) || state.lists[0] || null;
  }
  function favsListItems(list) {
    if (!list) return [];
    const wanted = new Set(list.itemIds.map(String));
    return state.shortlist.filter(i => i && wanted.has(String(i.id)));
  }
  function favsListsHolding(ideaId) {
    const id = String(ideaId);
    return state.lists.filter(l => l.itemIds.some(x => String(x) === id));
  }

  // First run on a phone with the flag on: today's flat shortlist becomes
  // one "My Favs" list so nothing a guest saved disappears.
  function favsMigrate() {
    if (state.lists.length === 0) {
      if (state.shortlist.length) {
        favsCreateList({ name: 'My Favs', itemIds: state.shortlist.map(i => i.id), sync: true });
      }
      return;
    }
    favsAdoptStrays();
  }

  // Items saved outside a list (desktop, older sessions) join the active list.
  function favsAdoptStrays() {
    const active = favsActiveList();
    if (!active) return;
    const held = new Set();
    state.lists.forEach(l => l.itemIds.forEach(id => held.add(String(id))));
    let changed = false;
    state.shortlist.forEach(i => {
      if (i && i.id != null && !held.has(String(i.id))) { active.itemIds.push(i.id); changed = true; }
    });
    if (changed) persist();
  }

  function favsCreateList({ name, city = null, mood = null, itemIds = [], sync = true }) {
    if (state.lists.length >= FAVS_LIST_CAP) {
      showToast(`That's ${FAVS_LIST_CAP} lists. Rename or delete one to make room`);
      return favsActiveList();
    }
    const list = {
      id: favsId(),
      name: String(name || 'New list').slice(0, FAVS_NAME_MAX),
      city, mood,
      created_at: new Date().toISOString(),
      itemIds: [...itemIds]
    };
    state.lists.unshift(list);
    state.activeListId = list.id;
    persist();
    if (sync) favsServerCreate(list);
    return list;
  }

  // Every successful generate/browse gets a list named "<City> · <Mood>";
  // the same city + mood on the same Toronto day reuses it.
  function favsEnsureListForFeed() {
    if (!favsGridActive()) return null;
    const city = favsCityLabel();
    const mood = state.mode;
    const today = torontoToday();
    const existing = state.lists.find(l => l.city === city && l.mood === mood &&
      String(l.created_at || '').slice(0, 10) === today);
    if (existing) {
      state.activeListId = existing.id;
      persist();
      return existing;
    }
    // Over the cap: reuse the newest same-city list rather than refuse.
    if (state.lists.length >= FAVS_LIST_CAP) {
      const fallback = state.lists.find(l => l.city === city) || state.lists[0];
      state.activeListId = fallback.id;
      persist();
      return fallback;
    }
    return favsCreateList({ name: `${city} · ${favsMoodLabel(mood)}`, city, mood });
  }

  function favsAssign(idea) {
    if (!state.lists.length || !idea || idea.id == null) return;
    const list = favsActiveList();
    if (!list) return;
    if (!list.itemIds.some(x => String(x) === String(idea.id))) list.itemIds.push(idea.id);
  }

  function favsRenameList(list, name) {
    const clean = String(name || '').trim().slice(0, FAVS_NAME_MAX);
    if (!clean || clean === list.name) return;
    list.name = clean;
    persist();
    if (isLoggedIn() && list.serverId) {
      fetch(`/api/shortlists/${encodeURIComponent(list.serverId)}`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: clean })
      }).catch(() => {});
    }
  }

  function favsDeleteList(list) {
    const items = favsListItems(list);
    state.lists = state.lists.filter(l => l.id !== list.id);
    // Ideas that lived only in this list leave the shortlist too.
    items.forEach(idea => {
      if (favsListsHolding(idea.id).length === 0) {
        state.shortlist = state.shortlist.filter(i => i.id !== idea.id);
        serverShortlistRemove(idea.id);
      }
    });
    if (state.activeListId === list.id) state.activeListId = state.lists[0] ? state.lists[0].id : null;
    persist();
    if (isLoggedIn() && list.serverId) {
      fetch(`/api/shortlists/${encodeURIComponent(list.serverId)}`, { method: 'DELETE', headers: authHeaders() }).catch(() => {});
    }
    updateShortlistCount();
  }

  function favsRemoveFromList(list, idea) {
    list.itemIds = list.itemIds.filter(x => String(x) !== String(idea.id));
    if (favsListsHolding(idea.id).length === 0) {
      state.shortlist = state.shortlist.filter(i => i.id !== idea.id);
      serverShortlistRemove(idea.id);
    }
    persist();
    updateShortlistCount();
  }

  function favsMoveItem(from, to, idea) {
    if (!to || from === to) return;
    from.itemIds = from.itemIds.filter(x => String(x) !== String(idea.id));
    if (!to.itemIds.some(x => String(x) === String(idea.id))) to.itemIds.push(idea.id);
    persist();
    if (isLoggedIn() && to.serverId) {
      fetch(`/api/shortlist/${encodeURIComponent(idea.id)}/move`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ list_id: to.serverId })
      }).catch(() => {});
    }
  }

  // ---- server mirror (signed-in only, best-effort, never blocks) ----
  function favsServerCreate(list) {
    if (!isLoggedIn() || list.serverId) return Promise.resolve();
    return fetch('/api/shortlists', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: list.name, city: list.city, mood: list.mood })
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data && data.list && data.list.id) { list.serverId = data.list.id; persist(); }
    }).catch(() => {});
  }

  async function favsSyncFromServer() {
    if (!isLoggedIn()) return;
    try {
      // Local-only lists go up first so their ids exist server-side.
      for (const l of state.lists) if (!l.serverId) await favsServerCreate(l);
      const res = await fetch('/api/shortlists', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const byIdea = new Map(state.shortlist.map(i => [String(i.id), i]));
      for (const sl of (data.lists || [])) {
        let local = state.lists.find(l => l.serverId === sl.id);
        if (!local) {
          local = { id: favsId(), serverId: sl.id, name: sl.name || 'My Favs', city: sl.city || null, mood: sl.mood || null, created_at: sl.created_at || new Date().toISOString(), itemIds: [] };
          state.lists.push(local);
        }
        const ir = await fetch('/api/shortlist?list=' + encodeURIComponent(sl.id), { headers: authHeaders() });
        if (!ir.ok) continue;
        const items = ((await ir.json()).items || []).map(i => i.idea).filter(i => i && i.id != null);
        items.forEach(idea => {
          if (state.pendingRemovals.has(String(idea.id))) return;
          if (!byIdea.has(String(idea.id))) { state.shortlist.push(idea); byIdea.set(String(idea.id), idea); }
          if (!local.itemIds.some(x => String(x) === String(idea.id))) local.itemIds.push(idea.id);
        });
      }
      if (!favsListById(state.activeListId) && state.lists[0]) state.activeListId = state.lists[0].id;
      favsAdoptStrays();
      persist();
    } catch (e) { /* offline or endpoint missing — local lists stand */ }
  }

  // ---- images ----
  // Tile art: the idea's own photo through the resize proxy, sized to ~2× the
  // tile; the category stock shot when there is none; an illustrated
  // placeholder if even that fails to load (never a grey box or a bare
  // gradient).
  function tileImageUrl(idea, w) {
    return proxiedImage(idea.image_url || categoryImage(idea.category, w), w);
  }
  function tileGlyph(category) {
    const label = CATEGORY_LABELS[category] || CATEGORY_LABELS.general;
    return label.split(' ')[0];
  }
  function wireTileImage(tile, idea, w) {
    const img = tile.querySelector('img');
    if (!img) return;
    img.addEventListener('error', () => {
      if (img.dataset.fallback === '1') { img.src = illustratedTile(idea, 0); return; }
      img.dataset.fallback = '1';
      img.src = categoryImage(idea.category, w);
    });
  }

  // Feed tiles. There is one stock shot per category, so a feed of nine
  // photo-less playgrounds used to show the same picture nine times. Within
  // one feed render each picture is used once: a real photo, else the
  // category's stock shot if no other tile has it yet, else a placeholder
  // drawn for that tile. tileArtFor remembers which one a tile got, so the
  // detail view can say a stock shot is not the place (WeakMap: nothing of
  // this reaches persisted shortlist items).
  let tileArtUsed = new Set();
  let tileArtDrawn = 0;
  const tileArtFor = new WeakMap();
  function resetTileArt() { tileArtUsed = new Set(); tileArtDrawn = 0; }
  function pickTileArt(idea, w, skipPhoto) {
    if (!skipPhoto && idea.image_url && !tileArtUsed.has(idea.image_url)) {
      tileArtUsed.add(idea.image_url);
      return { kind: 'photo', src: proxiedImage(idea.image_url, w) };
    }
    const stockKey = 'stock:' + (CATEGORY_IMAGES[idea.category] ? idea.category : 'general');
    if (!tileArtUsed.has(stockKey)) {
      tileArtUsed.add(stockKey);
      return { kind: 'stock', src: proxiedImage(categoryImage(idea.category, w), w) };
    }
    return { kind: 'illustration', src: illustratedTile(idea, tileArtDrawn++) };
  }
  function wireFeedTileImage(tile, idea, w) {
    const img = tile.querySelector('img');
    if (!img) return;
    img.addEventListener('error', () => {
      const art = tileArtFor.get(idea);
      if (!art || art.kind === 'illustration') return; // an inline SVG does not fail
      const next = art.kind === 'photo'
        ? pickTileArt(idea, w, true)
        : { kind: 'illustration', src: illustratedTile(idea, tileArtDrawn++) };
      tileArtFor.set(idea, next);
      img.src = next.src;
    });
  }

  // A placeholder drawn for one tile: the category glyph over soft shapes.
  // The n-th placeholder of a render steps round the colour wheel by the
  // golden angle from a start seeded by the idea id, so no two in a feed
  // share a colour, and three shape sets vary the pattern.
  function illustratedTile(idea, n) {
    let h = 0;
    for (const ch of String(idea.id || idea.title || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = Math.round((h % 360) + n * 137.508) % 360;
    const bg = `hsl(${hue},34%,34%)`;
    const fg = `hsl(${(hue + 32) % 360},42%,50%)`;
    const shapes = [
      `<circle cx="80" cy="18" r="30" fill="${fg}"/><circle cx="10" cy="92" r="24" fill="${fg}" opacity=".55"/>`,
      `<path d="M0 68 Q25 48 50 66 T100 60 V100 H0Z" fill="${fg}"/><path d="M0 84 Q30 70 60 82 T100 78 V100 H0Z" fill="${fg}" opacity=".55"/>`,
      `<rect x="58" y="-12" width="44" height="44" rx="9" transform="rotate(18 80 10)" fill="${fg}"/><rect x="-8" y="62" width="36" height="36" rx="9" transform="rotate(-14 10 80)" fill="${fg}" opacity=".55"/>`
    ][(h + n) % 3];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><rect width="100" height="100" fill="${bg}"/>${shapes}<text x="46" y="55" font-size="22" text-anchor="middle" dominant-baseline="central">${tileGlyph(idea.category)}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // One badge on every tile: the lowercase tier, or "price varies" when the
  // source gave no price (a tile without a badge read as "free" next to its
  // neighbours).
  const COST_TIERS = ['free', '$', '$$', '$$$'];
  function costLabel(tier) {
    const t = String(tier == null ? '' : tier).trim().toLowerCase();
    return COST_TIERS.includes(t) ? t : 'price varies';
  }

  // The tile heart shows shortlist state: outline until saved, filled once
  // saved. syncTileHearts runs from updateShortlistCount, the one call every
  // save, unsave and Undo already makes, so no heart can drift.
  function isShortlisted(id) {
    return state.shortlist.some(i => String(i.id) === String(id));
  }
  function setTileHeart(btn, saved) {
    btn.classList.toggle('is-saved', saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.setAttribute('aria-label', saved ? 'Saved. Tap to remove from my favs' : 'Save to my favs');
    btn.textContent = saved ? '♥' : '♡';
  }
  function syncTileHearts() {
    document.querySelectorAll('.idea-tile[data-idea-id]').forEach(tile => {
      const btn = tile.querySelector('.tile-save');
      if (btn) setTileHeart(btn, isShortlisted(tile.dataset.ideaId));
    });
  }

  // ---- My Favs page ----
  function openFavs() {
    if (!state.lists.length) favsMigrate();
    if (!state.lists.length) favsCreateList({ name: 'My Favs' });
    favsAdoptStrays();
    renderFavs();
    openPanel('favs-panel');
  }

  let favsRenaming = null; // list id being renamed inline

  function renderFavs() {
    const chips = document.getElementById('favs-chips');
    const grid = document.getElementById('favs-grid');
    const empty = document.getElementById('favs-empty');
    const sub = document.getElementById('favs-sub');
    const buildBtn = document.getElementById('favs-build-btn');
    if (!chips || !grid) return;
    const active = favsActiveList();
    chips.innerHTML = '';

    state.lists.forEach(list => {
      const isActive = active && list.id === active.id;
      const chip = document.createElement('div');
      chip.className = 'favs-chip' + (isActive ? ' is-active' : '');
      chip.setAttribute('role', 'presentation');
      if (isActive && favsRenaming === list.id) {
        chip.classList.add('is-renaming');
        chip.innerHTML = `<input class="favs-rename" type="text" maxlength="${FAVS_NAME_MAX}" aria-label="List name" value="${escapeAttr(list.name)}">` +
          `<button class="favs-chip-del" type="button" aria-label="Delete list">🗑</button>`;
        const input = chip.querySelector('.favs-rename');
        const commit = () => { favsRenaming = null; favsRenameList(list, input.value); renderFavs(); };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); favsRenaming = null; renderFavs(); }
        });
        input.addEventListener('blur', () => { if (favsRenaming === list.id) commit(); });
        chip.querySelector('.favs-chip-del').addEventListener('mousedown', (e) => e.preventDefault());
        chip.querySelector('.favs-chip-del').addEventListener('click', () => {
          const n = favsListItems(list).length;
          if (n && !window.confirm(`Delete "${list.name}" and its ${n} place${n === 1 ? '' : 's'}?`)) return;
          favsRenaming = null;
          favsDeleteList(list);
          renderFavs();
        });
        chips.appendChild(chip);
        requestAnimationFrame(() => { input.focus(); input.select(); });
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'favs-chip-btn';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(Boolean(isActive)));
      const n = favsListItems(list).length;
      btn.innerHTML = `<span class="favs-chip-name">${escapeHtml(list.name)}</span><span class="favs-chip-n">${n}</span>`;
      btn.addEventListener('click', () => {
        if (isActive) { favsRenaming = list.id; renderFavs(); return; }
        state.activeListId = list.id;
        favsRenaming = null;
        persist();
        renderFavs();
      });
      // Long-press = rename (same as tapping the active chip).
      let pressTimer = null;
      btn.addEventListener('touchstart', () => { pressTimer = setTimeout(() => { state.activeListId = list.id; favsRenaming = list.id; persist(); renderFavs(); }, 550); }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach(ev => btn.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));
      chip.appendChild(btn);
      if (isActive) {
        const pen = document.createElement('button');
        pen.type = 'button';
        pen.className = 'favs-chip-pen';
        pen.setAttribute('aria-label', 'Rename list');
        pen.textContent = '✎';
        pen.addEventListener('click', () => { favsRenaming = list.id; renderFavs(); });
        chip.appendChild(pen);
      }
      chips.appendChild(chip);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'favs-chip-btn favs-chip-new';
    add.textContent = '+ New';
    add.addEventListener('click', () => {
      const list = favsCreateList({ name: 'New list' });
      if (list && list.name === 'New list') favsRenaming = list.id;
      renderFavs();
    });
    chips.appendChild(add);

    const items = favsListItems(active);
    grid.innerHTML = '';
    items.forEach((idea, i) => grid.appendChild(createFavTile(idea, active, i)));
    if (empty) empty.hidden = items.length > 0;
    if (sub) sub.textContent = items.length
      ? `${items.length} place${items.length === 1 ? '' : 's'} · tap to peek · slide to plan`
      : 'Tap a tile to peek. Slide right to put it in your day.';
    if (buildBtn) buildBtn.disabled = items.length === 0;
  }

  function createFavTile(idea, list, index) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'favs-tile';
    tile.setAttribute('role', 'listitem');
    tile.setAttribute('aria-label', idea.title || 'Saved place');
    tile.style.setProperty('--i', index);
    tile.innerHTML = `<img src="${escapeAttr(tileImageUrl(idea, 240))}" alt="" loading="lazy" decoding="async">`;
    wireTileImage(tile, idea, 240);
    tile.addEventListener('click', () => openTileModal(idea, { surface: 'favs', list }));
    // Long-press = move sheet (the modal's ⋯ opens the same options).
    let pressTimer = null;
    tile.addEventListener('touchstart', () => { pressTimer = setTimeout(() => openTileModal(idea, { surface: 'favs', list, more: true }), 550); }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(ev => tile.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));
    return tile;
  }

  // ---- feed tiles ----
  function createIdeaTile(idea, index, bestMatch) {
    const tile = document.createElement('div');
    tile.className = 'idea-tile';
    tile.dataset.ideaId = idea.id;
    tile.__idea = idea; // deck mode reads the idea back off the DOM order
    const shelf = idea.section || idea.shelf_label;
    if (shelf) tile.dataset.section = shelf;
    if (shelfSeenObserver) shelfSeenObserver.observe(tile);
    tile.tabIndex = 0;
    tile.setAttribute('role', 'group');
    tile.setAttribute('aria-label', idea.title);
    tile.style.setProperty('--stop-index', index);
    const cost = costLabel(idea.cost_tier);
    const art = pickTileArt(idea, 360);
    tileArtFor.set(idea, art);
    // Nearest-first: every tile says how far (the sort leaves out places
    // with no distance, so there is always a number to show).
    const km = state.sortBy === 'distance' && idea.distance_km != null
      ? `<span class="tile-km">📍 ${escapeHtml(String(idea.distance_km))} km</span>` : '';
    tile.innerHTML = `
      <img src="${escapeAttr(art.src)}" alt="" loading="lazy" decoding="async">
      ${bestMatch ? '<span class="tile-badge">🎯</span>' : (idea.sponsored ? '<span class="tile-badge">⭐</span>' : (idea.wow_reason ? '<span class="tile-badge">✨</span>' : ''))}
      <span class="tile-cost${cost === 'price varies' ? ' tile-cost--unknown' : ''}">${escapeHtml(cost)}</span>
      ${km}
      <span class="tile-name">${escapeHtml(idea.title || '')}</span>
      <button class="tile-save" type="button"></button>
    `;
    wireFeedTileImage(tile, idea, 360);
    const heart = tile.querySelector('.tile-save');
    setTileHeart(heart, isShortlisted(idea.id));
    heart.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isShortlisted(idea.id)) favsUnsaveFromFeed(idea);
      else favsSaveFromFeed(idea, tile, 'button');
    });
    tile.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (tile.dataset.swiped === '1') { delete tile.dataset.swiped; return; }
      track('card_open', idea);
      openTileModal(idea, { surface: 'feed', tile });
    });
    tile.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === tile) {
        e.preventDefault();
        track('card_open', idea);
        openTileModal(idea, { surface: 'feed', tile });
      }
    });
    addTileSwipe(tile, idea);
    return tile;
  }

  // Left swipe = save. Horizontal intent is claimed only past 24 px with the
  // horizontal component clearly winning, so vertical scrolling never fights.
  function addTileSwipe(tile, idea) {
    let sx = 0, sy = 0, dx = 0, claimed = false, live = false;
    tile.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) { live = false; return; }
      live = true; claimed = false; dx = 0;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      tile.style.transition = 'none';
    }, { passive: true });
    tile.addEventListener('touchmove', (e) => {
      if (!live) return;
      dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (!claimed) {
        if (Math.abs(dx) > 24 && Math.abs(dx) > 1.5 * Math.abs(dy)) claimed = true;
        else if (Math.abs(dy) > 12) { live = false; return; }
        else return;
      }
      tile.style.transform = `translateX(${Math.max(-90, Math.min(30, dx))}px)`;
      tile.classList.toggle('tile--saving', dx < -60);
    }, { passive: true });
    const end = () => {
      if (!live) return;
      live = false;
      tile.style.transition = '';
      tile.classList.remove('tile--saving');
      if (claimed) tile.dataset.swiped = '1';
      if (claimed && dx < -60) { favsSaveFromFeed(idea, tile, 'swipe'); return; }
      tile.style.transform = '';
    };
    tile.addEventListener('touchend', end);
    tile.addEventListener('touchcancel', end);
  }

  function favsUnsaveFromFeed(idea) {
    const list = favsActiveList();
    if (list && list.itemIds.some(x => String(x) === String(idea.id))) favsRemoveFromList(list, idea);
    else {
      state.shortlist = state.shortlist.filter(i => i.id !== idea.id);
      persist();
      serverShortlistRemove(idea.id);
      updateShortlistCount();
    }
    renderFeed();
  }

  function favsSaveFromFeed(idea, tile, via) {
    const list = favsActiveList() || favsEnsureListForFeed() || favsCreateList({ name: 'My Favs' });
    if (state.shortlist.find(i => i.id === idea.id)) { favsAssign(idea); persist(); }
    else addToShortlist(idea, tile, { silent: true });
    if (via === 'swipe') track('feed_swipe_shortlist', idea);
    if (navigator.vibrate) navigator.vibrate(12);
    showToast(`Saved to ${list ? list.name : 'My Favs'}`, {
      duration: 4000,
      actionLabel: 'Undo',
      onAction: () => {
        if (list) favsRemoveFromList(list, idea);
        else {
          state.shortlist = state.shortlist.filter(i => i.id !== idea.id);
          persist();
          serverShortlistRemove(idea.id);
          updateShortlistCount();
        }
        renderFeed();
      }
    });
  }

  function favsCoachMark() {
    try {
      if (localStorage.getItem(FAVS_COACH_KEY)) return;
      localStorage.setItem(FAVS_COACH_KEY, '1');
    } catch (e) { return; }
    const feed = document.getElementById('discovery-feed');
    if (!feed || !feed.querySelector('.idea-tile')) return;
    const mark = document.createElement('div');
    mark.className = 'favs-coach';
    mark.setAttribute('role', 'status');
    mark.textContent = '← swipe a tile to save it · tap to peek';
    feed.insertBefore(mark, feed.firstChild);
    setTimeout(() => mark.remove(), 6000);
  }

  // ---- tile mini modal ----
  let tileModalCtx = null;

  function favsWeatherLine(idea) {
    const chip = document.getElementById('tile-weather');
    if (!chip) return;
    const lat = Number(idea.lat), lng = Number(idea.lng);
    const fallback = state.lastWeather && state.lastWeather.temp_c != null
      ? `${state.lastWeather.temp_c}°C · ${state.lastWeather.description || state.lastWeather.condition || ''}`.replace(/ · $/, '')
      : '';
    chip.hidden = !fallback;
    chip.textContent = fallback ? `🌤 ${fallback} now` : '';
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    fetch(`/api/weather?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`)
      .then(r => r.ok ? r.json() : null)
      .then(w => {
        if (!w || w.temp_c == null || !tileModalCtx || tileModalCtx.idea !== idea) return;
        chip.hidden = false;
        chip.textContent = `🌤 ${w.temp_c}°C · ${w.description || w.condition || ''} there now`.replace(/ ·  there/, ' there');
      })
      .catch(() => {});
  }

  // Feed modal runs as a deck: opening one tile queues every other tile still
  // in the feed (DOM order, starting after the tapped one). Save or skip
  // advances straight to the next place; when the deck is empty the modal
  // says "list complete" and jumps to the Favs grid. Founder ask, Sep 5.
  function favsFeedQueueFrom(tile) {
    const tiles = Array.from(document.querySelectorAll('#discovery-feed .idea-tile, .card-feed .idea-tile'));
    const i = tiles.indexOf(tile);
    const ordered = i >= 0 ? tiles.slice(i + 1).concat(tiles.slice(0, i)) : tiles.filter(t => t !== tile);
    return ordered.map(t => ({ tile: t, idea: t.__idea })).filter(q => q.idea);
  }

  // The feed re-renders after a save, so queued tile elements go stale —
  // re-find each tile by idea id at advance time and skip what's been
  // processed meanwhile (saved, skipped, or no longer in the feed).
  function favsNextInQueue(queue) {
    while (queue && queue.length) {
      const next = queue.shift();
      const id = next.idea && next.idea.id;
      if (!id) continue;
      if (state.dismissedIds.has(id)) continue;
      if (state.shortlist.find(i => i.id === id)) continue;
      const live = next.tile.isConnected ? next.tile
        : document.querySelector(`.feed--grid .idea-tile[data-idea-id="${CSS.escape(String(id))}"]`);
      if (!live) continue;
      return { idea: next.idea, tile: live };
    }
    return null;
  }

  function favsDeckComplete(ctx) {
    const content = document.getElementById('tile-content');
    const modal = document.getElementById('tile-modal');
    if (!content || !modal) return;
    const list = favsActiveList();
    const saved = (ctx.deck && ctx.deck.saved) || 0;
    const skipped = (ctx.deck && ctx.deck.skipped) || 0;
    content.innerHTML = `
      <div class="tile-complete" role="status">
        <div class="tile-complete-mark">✓</div>
        <h3 id="tile-title" class="tile-modal-title">List complete</h3>
        <p class="tile-modal-loc">${saved} saved${list ? ` to ${escapeHtml(list.name)}` : ''} · ${skipped} skipped</p>
        <p class="tile-complete-hint">Opening your Favs…</p>
      </div>`;
    if (navigator.vibrate) navigator.vibrate([12, 40, 12]);
    tileModalCtx = null;
    setTimeout(() => {
      if (!modal.hidden) closePanel(modal);
      openFavs();
    }, 1400);
  }

  function openTileModal(idea, ctx) {
    if (ctx.surface === 'feed' && !ctx.queue && ctx.tile) {
      ctx.queue = favsFeedQueueFrom(ctx.tile);
      ctx.deck = { saved: 0, skipped: 0, total: ctx.queue.length + 1 };
    }
    tileModalCtx = Object.assign({ idea }, ctx);
    const isFavs = ctx.surface === 'favs';
    const list = isFavs ? ctx.list : favsActiveList();
    const content = document.getElementById('tile-content');
    if (!content) return;
    const deck = !isFavs && ctx.deck ? ctx.deck : null;
    const left = deck ? ctx.queue.filter(q => q.idea && !state.dismissedIds.has(q.idea.id) && !state.shortlist.find(i => i.id === q.idea.id)).length : 0;
    const location = [idea.venue, idea.location].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
    const facts = [];
    if (idea.distance_km != null) facts.push(`📍 ${idea.distance_km} km`);
    facts.push(escapeHtml(costLabel(idea.cost_tier)));
    if (idea.duration_minutes) facts.push(formatDuration(idea.duration_minutes));
    const others = isFavs ? state.lists.filter(l => l.id !== list.id) : [];
    // The feed tile's art, larger. A stock shot or a drawn placeholder says
    // so: it is not a picture of this place.
    const art = (!isFavs && tileArtFor.get(idea)) || { kind: idea.image_url ? 'photo' : 'stock' };
    const photoSrc = art.kind === 'photo' ? tileImageUrl(idea, 720)
      : art.kind === 'stock' ? proxiedImage(categoryImage(idea.category, 720), 720) : art.src;
    const artNote = art.kind === 'stock' ? 'Illustrative photo, not this place'
      : art.kind === 'illustration' ? 'No photo of this place yet' : '';
    content.innerHTML = `
      ${deck ? `<p class="tile-progress">${left === 0 ? 'Last one' : `${left} more after this`} · ${deck.saved} saved</p>` : ''}
      <div class="tile-modal-photo"><img src="${escapeAttr(photoSrc)}" alt="" decoding="async">${artNote ? `<span class="tile-photo-note">${artNote}</span>` : ''}</div>
      <h3 id="tile-title" class="tile-modal-title">${escapeHtml(idea.title || '')}</h3>
      ${location ? `<p class="tile-modal-loc">${escapeHtml(location)}</p>` : ''}
      <div class="tile-modal-facts">${facts.map(f => `<span>${f}</span>`).join('')}<span id="tile-weather" class="tile-weather" hidden></span></div>
      ${idea.why ? `<p class="tile-modal-why">${escapeHtml(idea.why)}</p>` : ''}
      <div class="tile-slider" id="tile-slider" role="group" aria-label="${isFavs ? 'Slide to plan my day' : 'Slide to add to my day'}">
        <span class="tile-slider-label">${isFavs ? 'Slide to plan my day →' : 'Slide to add to my day →'}</span>
        <button class="tile-slider-knob" id="tile-knob" type="button" aria-label="${isFavs ? 'Plan my day from this list' : 'Add to my day'}">→</button>
      </div>
      <div class="tile-modal-actions">
        ${isFavs
          ? `${others.length ? `<label class="tile-move">Move to <select id="tile-move" aria-label="Move to list"><option value="">…</option>${others.map(l => `<option value="${escapeAttr(l.id)}">${escapeHtml(l.name)}</option>`).join('')}</select></label>` : ''}
             ${idea.maps_url ? `<a class="ghost-btn tile-ghost" href="${escapeAttr(idea.maps_url)}" target="_blank" rel="noopener noreferrer">Map ↗</a>` : ''}
             <button class="linklike tile-remove" id="tile-remove" type="button">Remove from list</button>`
          : `<button class="ghost-btn tile-ghost" id="tile-details" type="button">Details</button>
             <button class="ghost-btn tile-ghost tile-skip" id="tile-skip" type="button">✕ Skip this one</button>`}
      </div>`;
    content.classList.remove('tile-content--in');
    void content.offsetWidth; // restart the slide-in on every deck advance
    content.classList.add('tile-content--in');
    favsWeatherLine(idea);
    track('tile_open', idea);

    const modal = document.getElementById('tile-modal');
    const close = () => { if (!modal.hidden) closePanel(modal); tileModalCtx = null; if (favsPanelOpen()) document.body.style.overflow = 'hidden'; };
    const act = (via) => {
      if (isFavs) {
        const items = favsListItems(list);
        const first = items.filter(i => i.id === idea.id);
        const rest = items.filter(i => i.id !== idea.id);
        track('tile_swipe_plan', idea);
        if (navigator.vibrate) navigator.vibrate(12);
        close();
        handleBuildDay({ items: first.concat(rest), btnId: 'favs-build-btn', footerSel: '#favs-panel .favs-footer', closeIds: ['tile-modal', 'favs-panel'] });
      } else {
        track('tile_swipe_plan', idea);
        favsSaveFromFeed(idea, ctx.tile, via === 'swipe' ? 'swipe' : 'button');
        if (ctx.deck) ctx.deck.saved++;
        advance();
      }
    };
    // Deck mode: hand the modal the next feed tile instead of closing.
    const advance = () => {
      if (!ctx.deck) { close(); return; }
      const next = favsNextInQueue(ctx.queue);
      if (next) openTileModal(next.idea, { surface: 'feed', tile: next.tile, queue: ctx.queue, deck: ctx.deck });
      else favsDeckComplete(ctx);
    };
    wireTileSlider(document.getElementById('tile-slider'), document.getElementById('tile-knob'), () => act('swipe'), () => act('button'));
    // The slider is the one primary action (2026-09-07: the duplicate
    // "Add to my day" button pushed Details/Skip below the fold on phones).
    const primaryBtn = document.getElementById('tile-primary');
    if (primaryBtn) primaryBtn.addEventListener('click', () => act('button'));
    if (isFavs) {
      const mv = document.getElementById('tile-move');
      if (mv) mv.addEventListener('change', () => {
        const to = favsListById(mv.value);
        if (!to) return;
        favsMoveItem(list, to, idea);
        showToast(`Moved to ${to.name}`);
        close();
        renderFavs();
      });
      document.getElementById('tile-remove').addEventListener('click', () => {
        favsRemoveFromList(list, idea);
        showToast(`Removed from ${list.name}`);
        close();
        renderFavs();
        renderFeed();
      });
    } else {
      document.getElementById('tile-details').addEventListener('click', () => { close(); openDetail(idea); });
      document.getElementById('tile-skip').addEventListener('click', () => {
        if (ctx.tile) dismissIdea(idea, ctx.tile);
        if (ctx.deck) ctx.deck.skipped++;
        advance();
      });
    }
    if (modal.hidden || !modal.classList.contains('panel--open')) openPanel('tile-modal');
    else {
      const sheet = modal.querySelector('.panel-sheet');
      if (sheet) sheet.scrollTop = 0;
      const knob = document.getElementById('tile-knob');
      if (knob) knob.focus({ preventScroll: true });
    }
  }

  function favsPanelOpen() {
    const p = document.getElementById('favs-panel');
    return Boolean(p && !p.hidden);
  }

  // A knob dragged ≥70% across its track commits; a plain tap on the knob
  // (or the button under it) does the same without the gesture.
  function wireTileSlider(track, knob, onSwipe, onTap) {
    if (!track || !knob) return;
    let startX = 0, dragging = false, moved = 0;
    const max = () => Math.max(1, track.clientWidth - knob.offsetWidth - 8);
    knob.addEventListener('pointerdown', (e) => {
      dragging = true; moved = 0; startX = e.clientX;
      knob.setPointerCapture && knob.setPointerCapture(e.pointerId);
      knob.style.transition = 'none';
    });
    knob.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      moved = Math.max(0, Math.min(max(), e.clientX - startX));
      knob.style.transform = `translateX(${moved}px)`;
      track.classList.toggle('is-armed', moved >= 0.7 * max());
    });
    const finish = () => {
      if (!dragging) return;
      dragging = false;
      knob.style.transition = '';
      const done = moved >= 0.7 * max();
      track.classList.remove('is-armed');
      if (done) { knob.style.transform = `translateX(${max()}px)`; onSwipe(); return; }
      knob.style.transform = '';
      if (moved < 6) onTap();
    };
    knob.addEventListener('pointerup', finish);
    knob.addEventListener('pointercancel', finish);
    knob.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); }
    });
  }

  function wireFavsGrid() {
    const buildBtn = document.getElementById('favs-build-btn');
    if (buildBtn) buildBtn.addEventListener('click', () => {
      const list = favsActiveList();
      handleBuildDay({ items: favsListItems(list), btnId: 'favs-build-btn', footerSel: '#favs-panel .favs-footer', closeIds: ['favs-panel'] });
    });
    // Re-evaluate the mobile gate on rotation / resize so a tablet flipping
    // past the breakpoint gets the matching feed.
    if (window.matchMedia) {
      const mq = window.matchMedia(FAVS_MQ);
      const onChange = () => { window.__dayhopFavsGrid = favsGridActive(); if (state.favsGridFlag && state.allIdeas.length) renderFeed(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
  }

  // ---------- Init ----------
  // ---------- seasonal urgency strip ----------
  // Shows only inside the campaign window; dismiss sticks per campaign key.
  function initHolidayStrip() {
    const strip = document.getElementById('holiday-strip');
    if (!strip) return;
    // The offer window comes from /api/config (services/promo.js), never
    // from a date written here. When a strip and the checkout disagreed the
    // page won and the customer was billed the other number.
    (window.DayHopConfig || (window.DayHopConfig = fetch('/api/config').then(r => {
      if (!r.ok) throw new Error('config ' + r.status);
      return r.json();
    }))).then(cfg => {
      const promo = cfg && cfg.promo;
      if (!promo || !promo.active || !promo.endsUtc) return;
      const CAMPAIGN = 'promo-' + promo.code.toLowerCase() + '-' + promo.endsUtc.slice(0, 10);
      const END = new Date(promo.endsUtc);
      const now = new Date();
      if (now >= END) return;
      // The Pro upgrade sheet carries the same offer, on the same clock.
      const proPromo = document.getElementById('upgrade-promo');
      if (proPromo) {
        proPromo.innerHTML = '<b>Code ' + promo.code + '</b> at checkout: ' + promo.percentOff +
          '% off your first 3 months ($1.25/mo instead of $5) · ends ' + promo.label + '.';
        proPromo.hidden = false;
      }
      let dismissed = false;
      try { dismissed = localStorage.getItem('dayhop_strip_dismissed') === CAMPAIGN; } catch (e) { /* private mode */ }
      if (dismissed) return;
      const daysLeft = Math.max(1, Math.ceil((END - now) / 86400000));
      document.getElementById('holiday-strip-text').textContent =
        `🍁 ${promo.percentOff}% off until ${promo.label}: every nature guide $5 (was $20), Pro $1.25/mo for 3 months. Code ${promo.code} at checkout · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left.`;
      strip.hidden = false;
      document.getElementById('holiday-strip-close').addEventListener('click', () => {
        strip.hidden = true;
        try { localStorage.setItem('dayhop_strip_dismissed', CAMPAIGN); } catch (e) { /* fine */ }
      });
    }).catch(() => { /* no strip beats a wrong strip */ });
  }

  // ---------- Install prompt (PWA) ----------
  // Chrome hands out ONE beforeinstallprompt event per page load and
  // prompt() consumes it — so stash it and surface calm affordances instead
  // of the browser's mini-infobar: an "Install DayHop" item in the account
  // menu (signed-in users), and a one-time toast with an Install action for
  // everyone else, since signed-out visitors never open that menu. The toast
  // fires once ever (localStorage) — an ignored toast is a "no thanks" —
  // while the menu item keeps quietly offering for whoever changes their mind.
  let deferredInstallEvt = null;

  function installToastSeen() {
    try { return localStorage.getItem('dayhop_install_toast') === '1'; }
    catch (e) { return true; } // private mode: can't persist → never nag
  }

  function markInstallToastSeen() {
    try { localStorage.setItem('dayhop_install_toast', '1'); } catch (e) { /* private mode */ }
  }

  async function promptInstall() {
    const evt = deferredInstallEvt;
    if (!evt) return;
    // The event is single-use: clear the stash and the affordance up front.
    deferredInstallEvt = null;
    removeInstallMenuItem();
    evt.prompt();
    try { await evt.userChoice; } catch (e) { /* closed the native sheet */ }
    // Declined? Chrome offers a fresh event on a future load — the menu
    // item simply reappears then.
  }

  // auth.js owns the account menu's markup; we only append one extra item,
  // above Sign out. Invisible until the user-chip shows (signed-in only).
  function ensureInstallMenuItem() {
    const menu = document.getElementById('user-menu');
    if (!menu || document.getElementById('install-app-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'install-app-btn';
    btn.className = 'user-menu-item';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = '📲 Install DayHop';
    btn.addEventListener('click', () => {
      menu.hidden = true; // mirror the other menu items' close-on-pick
      promptInstall();
    });
    menu.insertBefore(btn, document.getElementById('signout-btn') || null);
  }

  function removeInstallMenuItem() {
    const btn = document.getElementById('install-app-btn');
    if (btn) btn.remove();
  }

  function wireInstallPrompt() {
    // Already running as the installed app → nothing to offer.
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // quiet the mini-infobar; we pick the moment
      deferredInstallEvt = e;
      ensureInstallMenuItem();
      // The toast waits a beat so a stored session has time to resolve —
      // signed-in users get the menu item, not a toast.
      setTimeout(() => {
        if (!deferredInstallEvt || isLoggedIn() || installToastSeen()) return;
        markInstallToastSeen();
        showToast('Add DayHop to your home screen. It works offline', {
          duration: 7000,
          actionLabel: 'Install',
          onAction: promptInstall
        });
      }, 4000);
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallEvt = null;
      removeInstallMenuItem();
    });
  }

  // ---------- Dream Home rail ----------
  // Real open houses an admin entered by hand (/api/dream-homes): open now
  // first, then by next window. Status is re-checked here every minute
  // from the window times, so a card never says "Open now" after the
  // house has closed, and a home whose last window ended leaves the rail.
  const dreamState = { homes: [] };
  const DREAM_DRAWING = `<div class="dream-drawing" role="img" aria-label="Drawing of a house, not a photo of this home">
      <svg viewBox="0 0 72 60" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true" style="color:var(--ink-soft)">
        <path d="M6 28 36 6l30 22"/><path d="M12 24v32h48V24"/><path d="M30 56V40h12v16"/><rect x="18" y="32" width="8" height="8"/><rect x="46" y="32" width="8" height="8"/><path d="M50 16V8h6v12"/>
      </svg>
      <small>Drawing, not a photo of this home</small>
    </div>`;

  function dreamLive(h, now = Date.now()) {
    const ws = (h.windows || []).filter(w => Date.parse(w.end_at) > now);
    if (!ws.length) return null;
    const open = ws.find(w => Date.parse(w.start_at) <= now);
    return { open: Boolean(open), next: open || ws[0], windows: ws };
  }
  const dreamPrice = p => (p != null ? '$' + Number(p).toLocaleString('en-CA') : '');
  function dreamPhotoHtml(h, w) {
    if (!h.photo || !h.photo.url) return DREAM_DRAWING;
    return `<img src="${escapeAttr(proxiedImage(h.photo.url, w))}" alt="Outside ${escapeAttr(h.address)}" loading="lazy"
      onerror="this.onerror=null;this.insertAdjacentHTML('beforebegin', window.__dreamDrawing);this.remove()">`;
  }
  // Google's display rule: show the photo's author, linked, beside it.
  function dreamCreditHtml(h) {
    if (!h.photo || !h.photo.url) return '<p class="dream-credit">No photo of this address yet, so you are looking at a drawing.</p>';
    if (h.photo.source !== 'google') return '';
    const a = h.photo.attribution;
    const who = a && a.name ? (a.uri ? `<a href="${escapeAttr(a.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a>` : escapeHtml(a.name)) : 'a Google Maps contributor';
    return `<p class="dream-credit">Photo: ${who}, via Google Maps. It shows the street outside, not the listing.</p>`;
  }

  function renderDreamRail() {
    const section = document.getElementById('dream-homes');
    const rail = document.getElementById('dream-rail');
    if (!section || !rail) return;
    const now = Date.now();
    const live = dreamState.homes
      .map(h => ({ h, s: dreamLive(h, now) }))
      .filter(x => x.s)
      .sort((a, b) => (a.s.open === b.s.open
        ? Date.parse(a.s.open ? a.s.next.end_at : a.s.next.start_at) - Date.parse(b.s.open ? b.s.next.end_at : b.s.next.start_at)
        : a.s.open ? -1 : 1));
    section.hidden = false;
    if (!live.length) {
      rail.innerHTML = `<p class="dream-empty">Dream homes appear here as this weekend's open houses are added.</p>`;
      return;
    }
    rail.innerHTML = live.map(({ h, s }) => `
      <button type="button" class="dream-card" role="listitem" data-dream="${escapeAttr(h.id)}"
        aria-label="${escapeAttr(`${h.area}, ${dreamPrice(h.price)} asking price, ${s.open ? 'open now' : s.next.label}`)}">
        <div class="dream-photo">
          ${dreamPhotoHtml(h, 480)}
          <span class="dream-badge${s.open ? ' dream-badge--open' : ''}">${s.open ? 'Open now' : escapeHtml(s.next.label)}</span>
        </div>
        <div class="dream-body">
          <p class="dream-area">${escapeHtml(h.area)}</p>
          <p class="dream-price"><strong>${escapeHtml(dreamPrice(h.price))}</strong> asking price</p>
        </div>
      </button>`).join('');
    rail.querySelectorAll('[data-dream]').forEach(btn => btn.addEventListener('click', () => {
      const h = dreamState.homes.find(x => x.id === btn.dataset.dream);
      if (h) openDreamDetail(h);
    }));
  }

  function openDreamDetail(h) {
    const s = dreamLive(h);
    const ideaId = 'dreamhome-' + h.id;
    const saved = Boolean(state.shortlist.find(i => i.id === ideaId));
    document.getElementById('detail-title').textContent = h.area;
    document.getElementById('detail-content').innerHTML = `
      <div class="dream-detail-photo">${dreamPhotoHtml(h, 900)}</div>
      ${dreamCreditHtml(h)}
      <p class="dream-detail-price">${escapeHtml(dreamPrice(h.price))} <span>asking price</span></p>
      <p class="dream-detail-address">${escapeHtml(h.address)} · ${escapeHtml(h.area)}</p>
      <p class="dream-note-label">Open house</p>
      <ul class="dream-windows">${(s ? s.windows : []).map(w => {
        const isOpen = Date.parse(w.start_at) <= Date.now();
        return `<li>${isOpen ? '<span class="dream-badge dream-badge--open">Open now</span>' : ''}<span>${escapeHtml(w.day)}, ${escapeHtml(w.label.replace(/^\S+\s/, ''))}</span></li>`;
      }).join('') || '<li>This open house has ended.</li>'}</ul>
      ${h.note ? `<p class="dream-note-label">Why this one inspires</p><p class="dream-note">${escapeHtml(h.note)}</p>` : ''}
      <div class="dream-actions">
        <a class="primary-btn" href="${escapeAttr(h.maps_url)}" target="_blank" rel="noopener noreferrer">Directions</a>
        <a class="ghost-btn" href="${escapeAttr(h.source_url)}" target="_blank" rel="noopener noreferrer">See the listing</a>
        <button type="button" class="ghost-btn" id="dream-save-btn"${saved ? ' disabled' : ''}>${saved ? 'Saved ✓' : 'Save'}</button>
      </div>
      <p class="dream-fine">Open house times and prices change. Verify with the listing agent before you go.</p>
      <p class="dream-fine">DayHop is not a real estate brokerage and does not sell homes. This is a dreaming and visiting guide, not buying advice.</p>`;
    const save = document.getElementById('dream-save-btn');
    if (save) save.addEventListener('click', () => {
      if (state.shortlist.find(i => i.id === ideaId)) return;
      const next = s && s.next;
      addToShortlist({
        id: ideaId,
        title: `Open house: ${h.area}`,
        category: 'general',
        venue: h.address,
        location: h.area,
        why: h.note || `${dreamPrice(h.price)} asking price.${next ? ` Open house ${next.label}.` : ''}`,
        image_url: h.photo && h.photo.url ? h.photo.url : null,
        url: h.source_url,
        booking_url: h.source_url,
        maps_url: h.maps_url,
        date: next ? next.start_at.slice(0, 10) : null
      }, null);
      save.textContent = 'Saved ✓';
      save.disabled = true;
    });
    openPanel('detail-panel');
  }

  function initDreamHomes() {
    window.__dreamDrawing = DREAM_DRAWING; // <img onerror> swaps a dead photo for the drawing
    fetch('/api/dream-homes')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('dream homes ' + r.status))))
      .then(d => { dreamState.homes = Array.isArray(d.homes) ? d.homes : []; renderDreamRail(); })
      .catch(() => { /* the section stays hidden; the planner is unaffected */ });
    setInterval(() => { if (dreamState.homes.length) renderDreamRail(); }, 60 * 1000);
  }

  function init() {
    initDreamHomes();
    initHolidayStrip();
    loadPersisted();
    renderDraftResume(); // an unsaved plan from last time greets them by name
    renderFeaturedEvent([]); // curated sky pool shows before the feed lands
    wireFeaturedHeightSync();
    wireModeNudge();
    setupLocationCombo();
    updateWhereEmphasis();
    updateShortlistCount();
    wirePanelClosers();

    // A refresh while an overlay was open leaves our synthetic history entry
    // on top — clear the marker so back behaves normally again.
    if (history.state && history.state.dayhopOverlay) history.replaceState(null, '');

    // Instant seasonal eyebrow, refined to the next stat holiday ("Civic
    // Holiday long weekend · Aug 1–3") when the server spotlight answers.
    {
      const eyebrow = document.querySelector('.hero .eyebrow');
      if (eyebrow) eyebrow.textContent = 'Greater Toronto Area · Summer 2026';
    }
    // One /api/config fetch per page load, shared with auth.js via a
    // window-level promise (whichever script runs first creates it).
    (window.DayHopConfig || (window.DayHopConfig = fetch('/api/config').then(r => {
      if (!r.ok) throw new Error('config ' + r.status);
      return r.json();
    })))
      .then(cfg => {
        applySpotlight(cfg && cfg.spotlight);
        // Mobile Favs grid flag: once known, migrate the guest shortlist into
        // a first list and repaint any feed that already rendered as cards.
        state.favsGridFlag = Boolean(cfg && cfg.favsGrid);
        window.__dayhopFavsGrid = favsGridActive();
        if (favsGridActive()) {
          favsMigrate();
          if (state.allIdeas.length) renderFeed();
        }
      })
      .catch(() => {});

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

    // Surprise me: promptless discovery for the "I don't know, dazzle me"
    // visitor. Only offered while the textarea is empty — the moment they
    // start describing a day, the primary flow takes over.
    const surpriseBtn = document.getElementById('prompt-surprise-btn');
    const promptArea = document.getElementById('grok-prompt');
    surpriseBtn.addEventListener('click', handleSurprise);
    const syncSurpriseVisibility = () => { surpriseBtn.hidden = promptArea.value.trim().length > 0; };
    promptArea.addEventListener('input', syncSurpriseVisibility);

    // Voice: talk the request instead of typing it. Bound after the
    // Surprise-me wiring because it dispatches input events that rely on it.
    initVoicePrompt();
    syncSurpriseVisibility();

    // Campaign → product loop: /?plan=<text> arrives from the playbook and
    // ad landings. Prefill the prompt and run it, so a campaign click
    // reaches a generated feed in one tap instead of bouncing off a content
    // page. The param is stripped after use so refresh/share can't re-fire;
    // utm params stay for pixel.js first-touch attribution.
    {
      const params = new URLSearchParams(window.location.search);
      const plan = (params.get('plan') || '').trim().slice(0, 300);
      if (plan) {
        promptArea.value = plan;
        syncSurpriseVisibility();
        track('prompt_prefill_landing');
        params.delete('plan');
        const qs = params.toString();
        history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
        setTimeout(() => {
          promptArea.scrollIntoView({ block: 'center', behavior: 'smooth' });
          document.getElementById('prompt-form').requestSubmit();
        }, 350);
      }
    }

    // Next: append more unrelated-but-awesome (and wider-out) picks below
    // whatever feed is showing.
    document.getElementById('feed-next-btn').addEventListener('click', handleNext);
    document.getElementById('feed-more-btn').addEventListener('click', unfoldFeed);

    // No infinite scroll (removed 2026-09-03): auto-loading fired a wider
    // server gather every ~1.5 viewports of scrolling, which was the one
    // path where a single user could keep buying venue searches. Next is an
    // explicit press, capped at NEXT_PAGE_CAP pages per feed.

    // Mode toggle (R&R / Adventure): tap or swipe, then paint the
    // mode-flavored chrome — accent, hint, placeholder, example prompts,
    // filter chips. Defaults to R&R; returning users keep their last mode.
    wireModeToggle();
    applyModeUi();
    renderFilterChips();
    wireDatePicker();

    // No-results: clear the active filter and show everything again.
    document.getElementById('reset-filter-btn').addEventListener('click', () => setFilter('all'));

    document.getElementById('shortlist-btn').addEventListener('click', () => {
      if (favsGridActive()) { openFavs(); return; } // mobile: the My Favs grid
      exitShortlistSelect(); // each visit starts in browse mode
      renderShortlistPanel();
      openPanel('shortlist-panel');
    });
    wireFavsGrid();

    document.getElementById('build-day-btn').addEventListener('click', handleBuildDay);
    document.getElementById('surprise-me-btn').addEventListener('click', handleSurpriseMe);
    document.getElementById('new-shortlist-btn').addEventListener('click', handleNewShortlist);
    document.getElementById('shortlist-select-btn').addEventListener('click', toggleShortlistSelect);
    document.getElementById('select-delete-btn').addEventListener('click', handleSelectDelete);
    document.getElementById('select-newlist-btn').addEventListener('click', handleSelectNewList);
    // Clear all: same confirm-then-wipe as "Start a new shortlist"; the
    // re-render drops out of select mode once the list is empty.
    document.getElementById('select-clearall-btn').addEventListener('click', handleNewShortlist);
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
    wireMembership();
    wireInstallPrompt();

    // Outbound click tracking (booking links are the affiliate-revenue metric)
    // + booking retention: the link opens in a new tab, so THIS tab is still
    // DayHop — auto-save the idea and invite the user to keep planning.
    document.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('a.card-booking-link');
      if (!link) return;
      const card = link.closest('.idea-card');
      const ideaRef = {
        id: link.dataset.ideaId || (card && card.dataset.id),
        source: link.dataset.ideaSource || undefined,
        price: link.dataset.ideaPrice != null && link.dataset.ideaPrice !== '' ? Number(link.dataset.ideaPrice) : undefined,
        currency: link.dataset.ideaCurrency || undefined,
        section: (card && card.dataset.section) || undefined
      };
      const isMaps = link.classList.contains('card-booking-link--secondary');
      track(isMaps ? 'maps_click' : 'booking_click', ideaRef);
      if (!isMaps) handleBookingRetention(ideaRef, link, card);
    });

    // Offline awareness (PWA): the shell + saved data work offline; live
    // search and AI plans need a connection.
    window.addEventListener('offline', () =>
      showToast("You're offline. Your saved plans and shortlist still work.", { duration: 4500 }));
    window.addEventListener('online', () => showToast('Back online ✨'));

    handleBillingReturn();
    // A stored Supabase session means handleAuthChange is about to refresh
    // Pro status with the real token — the anonymous warm-up here was a
    // guaranteed duplicate round trip for every signed-in visitor.
    let hasStoredSession = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') !== -1) { hasStoredSession = true; break; }
      }
    } catch (e) { /* private mode */ }
    // Deferred to idle: this only gates the "Go Pro" button, and the Supabase
    // usage lookup behind it shouldn't compete with the feed on the wire.
    if (!hasStoredSession) {
      if ('requestIdleCallback' in window) requestIdleCallback(() => refreshProStatus(), { timeout: 2000 });
      else setTimeout(refreshProStatus, 2000);
    }

    renderFeed();

    // Instant discovery: a returning visitor with a remembered location
    // lands on a live feed instead of an empty state.
    // The feed loads for everyone — first-timers get the GTA-wide default
    // (loadBrowseFeed falls back when no location is chosen yet).
    if (!state.allIdeas.length) loadBrowseFeed();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
