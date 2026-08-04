// public/motion.js — DayHop V2 motion stack
//
// Division of labour (deliberate):
//   1. Native CSS scroll-driven animations (main.css) do the everyday work —
//      card reveals, section fades, hero recede. Compositor thread, zero JS.
//   2. Lenis smooths the page scroll itself so those reveals play out on
//      silk instead of ratchet clicks.
//   3. GSAP + ScrollTrigger are reserved for a handful of high-impact
//      moments: the Best Match entrance, its photo parallax, and the
//      re-plan celebration.
//
// Everything here is optional garnish: each layer feature-detects, honours
// prefers-reduced-motion (live, not just at load), and the app is fully
// functional if this file never runs.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hasGsap = () => typeof window.gsap !== 'undefined';

  // ---------- Lenis: buttery page scroll ----------
  // Wheel/keyboard smoothing on the root scroller only. Touch scrolling is
  // left native (Lenis default) — mobile momentum physics are already good,
  // and fighting them feels worse than not trying.
  let lenis = null;

  function initLenis() {
    if (lenis || typeof window.Lenis === 'undefined' || reduceMotion.matches) return;
    lenis = new window.Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // easeOutExpo
      smoothWheel: true
    });

    // Overlays own their own scroll: panels, modals, and the location
    // dropdown must never have their wheel events hijacked by the page.
    document.querySelectorAll('.panel-sheet, .modal-card, .location-listbox')
      .forEach(el => el.setAttribute('data-lenis-prevent', ''));

    if (hasGsap() && window.ScrollTrigger) {
      // One clock: GSAP's ticker drives Lenis, Lenis updates ScrollTrigger.
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add((time) => lenis.raf(time * 1000));
      window.gsap.ticker.lagSmoothing(0);
    } else {
      // Re-read `lenis` each frame: destroyLenis() (reduced-motion switch
      // mid-session) nulls it, and the queued frame must wind down quietly
      // instead of throwing on a dead reference.
      const raf = (time) => {
        if (!lenis) return;
        lenis.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }
  }

  function destroyLenis() {
    if (!lenis) return;
    lenis.destroy();
    lenis = null;
  }

  // Respect a mid-session switch of the OS motion setting.
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) destroyLenis();
    else initLenis();
  });

  // ---------- GSAP setup ----------
  function initGsap() {
    if (!hasGsap() || !window.ScrollTrigger) return false;
    window.gsap.registerPlugin(window.ScrollTrigger);
    return true;
  }

  // Kill ScrollTriggers whose trigger element left the DOM (the feed
  // re-renders often — triggers must not leak).
  function reapDeadTriggers() {
    if (!window.ScrollTrigger) return;
    window.ScrollTrigger.getAll().forEach(t => {
      const el = t.trigger;
      if (el && !document.contains(el)) t.kill();
    });
  }

  // ---------- Moment 1: Best Match entrance ----------
  // The one dramatic beat in the feed. The card rises as one piece, then its
  // interior details cascade — flag, title, evidence chips, actions — and
  // the photo keeps a slow parallax drift for as long as it's on screen.
  function bestMatchIn(card) {
    if (!card) return;
    if (reduceMotion.matches || !hasGsap()) return; // CSS fallback handles arrival
    card.classList.remove('is-entering'); // GSAP owns the entrance from here

    const gsap = window.gsap;
    reapDeadTriggers();

    const photo = card.querySelector('.best-match-photo img');
    const flag = card.querySelector('.best-match-flag');
    const bits = card.querySelectorAll(
      '.best-match-kicker, .best-match-body h3, .best-match-body .why, .match-reasons, .best-match-body .card-meta, .best-match .card-booking-link, .best-match-actions'
    );

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from(card, { y: 34, opacity: 0, scale: 0.98, duration: 0.65 })
      .from(photo, { scale: 1.12, duration: 1.1, ease: 'power2.out' }, 0)
      .from(flag, { y: -12, opacity: 0, duration: 0.4 }, 0.3)
      .from(bits, { y: 14, opacity: 0, duration: 0.45, stagger: 0.06, clearProps: 'all' }, 0.25);

    // Parallax: the photo has 12% headroom (CSS height: 112%) — spend it
    // slowly across the card's whole trip through the viewport.
    if (photo && window.ScrollTrigger) {
      gsap.fromTo(photo, { yPercent: 0 }, {
        yPercent: -9,
        ease: 'none',
        scrollTrigger: {
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6
        }
      });
    }
  }

  // ---------- Moment 2: re-plan celebration ----------
  // The plan just reshaped itself around what the user said. Settle the
  // "what changed" panel in with a soft cascade — acknowledgement, not
  // confetti.
  function celebrateReplan(summaryEl) {
    if (!summaryEl || summaryEl.hidden) return;
    if (reduceMotion.matches || !hasGsap()) return;
    const gsap = window.gsap;
    const items = summaryEl.querySelectorAll('li');
    gsap.from(summaryEl, { y: -8, opacity: 0, duration: 0.4, ease: 'power2.out', clearProps: 'all' });
    if (items.length) {
      gsap.from(items, { x: -10, opacity: 0, duration: 0.35, stagger: 0.09, delay: 0.15, ease: 'power2.out', clearProps: 'all' });
    }
  }

  // ---------- Idle ticker sleep ----------
  // gsap.ticker otherwise wakes the main thread ~60×/s for the life of the
  // page — while the user reads a static feed, while a panel sits open.
  // Sleep it after a few quiet seconds; anything that could start motion
  // wakes it (and GSAP wakes itself whenever a new tween starts, so the
  // Best Match entrance is never frozen). Lenis's eased scrolling emits
  // 'scroll' events the whole way, which keep re-arming the timer.
  function installTickerSleep() {
    if (!hasGsap()) return;
    const ticker = window.gsap.ticker;
    let idleTimer = null;
    const IDLE_MS = 3000;
    const rearm = () => {
      ticker.wake();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => ticker.sleep(), IDLE_MS);
    };
    ['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown', 'scroll'].forEach(ev =>
      window.addEventListener(ev, rearm, { passive: true }));
    rearm();
  }

  // ---------- Library loading ----------
  // Lenis + GSAP + ScrollTrigger (~46 KB gz combined) used to be three
  // hard <script> tags on every load. They're garnish (this file's header
  // says so) — now they load only where they'd actually run: motion not
  // reduced, no Save-Data, and a reasonably capable device.
  const LIBS = [
    'https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js',
    'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
    'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js'
  ];

  function shouldLoadMotion() {
    if (reduceMotion.matches) return false;
    const conn = navigator.connection;
    if (conn && conn.saveData) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
    return true;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // dynamic scripts default to async — order matters (gsap before ScrollTrigger)
      s.onload = resolve;
      s.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  let libsRequested = false;
  function loadLibsAndBoot() {
    if (libsRequested) return;
    libsRequested = true;
    Promise.all(LIBS.map(loadScript)).then(() => {
      initGsap();
      initLenis();
      installTickerSleep();
    }).catch(() => { /* CSS scroll-driven animations carry the experience */ });
  }

  // ---------- Boot ----------
  function boot() {
    if (shouldLoadMotion()) loadLibsAndBoot();
  }

  // If the OS motion setting flips to "no preference" mid-session and the
  // libraries were skipped at boot, pick them up then.
  reduceMotion.addEventListener('change', () => {
    if (!reduceMotion.matches && shouldLoadMotion()) loadLibsAndBoot();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // `reap` lets app.js clear dead ScrollTriggers on every feed re-render —
  // previously they were only reaped inside the NEXT bestMatchIn call, so
  // leaving prompt results for browse mode (no hero) left parallax triggers
  // scrubbing detached DOM on every scroll frame for the rest of the session.
  window.DayHopMotion = { bestMatchIn, celebrateReplan, reap: reapDeadTriggers };
})();
