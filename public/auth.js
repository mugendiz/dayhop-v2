// public/auth.js — DayHop V2 auth (Supabase Auth)
// Owns the browser Supabase client and the sign-in UI. Publishes the current
// user/token via window.DayHopAuth and a 'dayhop:auth' DOM event so app.js can
// react (gate persistence, migrate the guest shortlist) without importing this.
// Degrades silently when auth isn't configured: the Sign-in button stays hidden
// and the app runs fully anonymous.
(function () {
  'use strict';

  let sb = null;
  const current = { user: null, token: null };
  let mode = 'signin'; // 'signin' | 'signup'

  const $ = (id) => document.getElementById(id);
  const show = (id, on = true) => { const el = $(id); if (el) el.hidden = !on; };

  function emit(event) {
    document.dispatchEvent(new CustomEvent('dayhop:auth', {
      detail: { user: current.user, token: current.token, event }
    }));
  }

  // ---------- lazy supabase-js ----------
  // The ~65 KB gz supabase-js bundle used to sit as a static <script> AHEAD
  // of app.js in the defer queue — every visitor paid its download+parse
  // before the app could fire its first API call. Now it loads on demand:
  // immediately when a stored session (or an OAuth redirect) needs restoring,
  // otherwise only when the user actually opens the sign-in panel.
  // Version pinned: jsDelivr serves exact versions with immutable 1-year
  // caching; the bare "@2" range URL revalidates weekly.
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.2/dist/umd/supabase.min.js';
  let sbScriptPromise = null;
  function loadSupabaseJs() {
    if (window.supabase) return Promise.resolve();
    if (!sbScriptPromise) {
      sbScriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SUPABASE_CDN;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => { sbScriptPromise = null; reject(new Error('supabase-js failed to load')); };
        document.head.appendChild(s);
      });
    }
    return sbScriptPromise;
  }

  // supabase-js persists sessions under "sb-<ref>-auth-token" — presence
  // tells us a returning signed-in user without loading the library.
  function hasStoredSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') !== -1) return true;
      }
    } catch (e) { /* private mode */ }
    return false;
  }

  // OAuth return trip: Supabase parks tokens in the URL (hash for implicit,
  // ?code= for PKCE) — the client must load NOW to complete the sign-in.
  function returningFromOAuth() {
    return /[#&](access_token|refresh_token|error_description)=/.test(location.hash) ||
      /[?&]code=/.test(location.search);
  }

  let clientPromise = null;
  function ensureClient() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      const cfg = await window.DayHopConfig;
      await loadSupabaseJs();
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data } = await sb.auth.getSession();
      setSession(data.session, 'INITIAL');
      sb.auth.onAuthStateChange((event, session) => setSession(session, event));
      return sb;
    })();
    clientPromise.catch(() => { clientPromise = null; }); // failed load → retry on next attempt
    return clientPromise;
  }

  // ---------- init ----------
  async function init() {
    let cfg;
    try {
      // Shared with app.js: whichever script runs first creates the single
      // /api/config fetch for the page load.
      cfg = await (window.DayHopConfig || (window.DayHopConfig = fetch('/api/config').then(r => {
        if (!r.ok) throw new Error('config ' + r.status);
        return r.json();
      })));
    } catch (e) {
      return; // no config → stay anonymous
    }
    if (!cfg.authEnabled) return;

    show('auth-btn', true); // reveal sign-in entry point
    wireUI();
    wireAccountMenu();

    // Signed-in (or mid-OAuth) visitors restore their session right away;
    // everyone else defers the whole supabase-js download until Sign in.
    if (hasStoredSession() || returningFromOAuth()) {
      ensureClient().catch(e => console.warn('[auth] session restore failed:', e.message));
    }
  }

  function setSession(session, event) {
    current.user = session ? { id: session.user.id, email: session.user.email } : null;
    current.token = session ? session.access_token : null;
    updateChrome();
    emit(event);
  }

  // ---------- topbar chrome ----------
  function updateChrome() {
    const signedIn = Boolean(current.user);
    show('auth-btn', !signedIn);
    show('user-chip', signedIn);
    if (signedIn) {
      const emailEl = $('user-email');
      if (emailEl) emailEl.textContent = current.user.email || 'Signed in';
      const initEl = $('user-initial');
      if (initEl) initEl.textContent = (current.user.email || '?').trim().charAt(0).toUpperCase();
    }
  }

  // Account menu: the avatar circle opens a small dropdown holding the
  // email, admin link, and sign-out — identity details stay out of the bar.
  function wireAccountMenu() {
    const avatar = $('user-avatar');
    const menu = $('user-menu');
    if (!avatar || !menu) return;
    const close = () => { menu.hidden = true; avatar.setAttribute('aria-expanded', 'false'); };
    avatar.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = menu.hidden;
      menu.hidden = !opening;
      avatar.setAttribute('aria-expanded', String(opening));
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) close();
    });
  }

  // ---------- modal ----------
  function openAuth() {
    // Start the (lazy) client load the moment the panel opens — by the time
    // the user has typed an email it's long since ready.
    ensureClient().catch(() => setError('Could not reach the sign-in service. Check your connection and try again.'));
    setMode('signin');
    clearError();
    const panel = $('auth-panel');
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('modal--open'));
    document.body.style.overflow = 'hidden';
    // Join app.js's overlay↔history handling so the back button closes
    // this modal too (guarded — app.js loads after us).
    if (window.DayHopOverlayNav) window.DayHopOverlayNav.opened('auth-panel');
    const email = $('auth-email');
    if (email) setTimeout(() => email.focus(), 60);
  }

  function closeAuth() {
    const panel = $('auth-panel');
    panel.classList.remove('modal--open');
    document.body.style.overflow = '';
    setTimeout(() => { panel.hidden = true; }, 200);
    if (window.DayHopOverlayNav) window.DayHopOverlayNav.closed('auth-panel');
  }

  function setMode(next) {
    mode = next;
    const signup = mode === 'signup';
    // Neutral default — most visitors are new, so never open with
    // "Welcome back"; lead with what signing in gets them.
    $('auth-title').textContent = signup ? 'Create your account' : 'Save your plans';
    $('auth-sub').textContent = signup
      ? 'Save your shortlist and day plans, synced across devices.'
      : 'Sign in — or create a free account — to keep your shortlist and plans on every device.';
    $('auth-submit').querySelector('.btn-label').textContent = signup ? 'Create account' : 'Sign in';
    $('auth-toggle-text').textContent = signup ? 'Already have an account?' : 'New to DayHop?';
    $('auth-toggle-btn').textContent = signup ? 'Sign in' : 'Create an account';
    $('auth-password').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  }

  function clearError() { const e = $('auth-error'); if (e) e.textContent = ''; }
  function setError(msg) { const e = $('auth-error'); if (e) e.textContent = msg; }

  function setSubmitting(on) {
    const btn = $('auth-submit');
    btn.classList.toggle('is-loading', on);
    btn.disabled = on;
  }

  // ---------- actions ----------
  async function handleSubmit(e) {
    e.preventDefault();
    clearError();
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    if (!email || !password) return;

    setSubmitting(true);
    try {
      await ensureClient();
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation is enabled on the project.
          setError('Check your email to confirm your account, then sign in.');
          setMode('signin');
          return;
        }
        closeAuth(); // confirmation disabled → signed in immediately
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        closeAuth();
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // One flow for sign-in AND sign-up: Supabase creates the account on a
  // first-time Google login, so the same button serves both modes.
  async function handleGoogle() {
    clearError();
    try {
      await ensureClient();
      // supabase-js v2 RETURNS errors from signInWithOAuth (it doesn't
      // throw) — without this check a misconfigured provider makes the
      // button appear dead.
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
      // Redirects away; the session is picked up on return.
    } catch (err) {
      setError(err.message || 'Could not start Google sign-in.');
    }
  }

  async function handleSignOut() {
    if (!sb) return; // never signed in this page load — nothing to clear
    try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
  }

  // ---------- wiring ----------
  function wireUI() {
    $('auth-btn').addEventListener('click', openAuth);
    $('signout-btn').addEventListener('click', handleSignOut);
    $('google-btn').addEventListener('click', handleGoogle);
    $('auth-form').addEventListener('submit', handleSubmit);
    $('auth-toggle-btn').addEventListener('click', () => { clearError(); setMode(mode === 'signin' ? 'signup' : 'signin'); });
    document.querySelectorAll('[data-close-auth]').forEach(el => el.addEventListener('click', closeAuth));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('auth-panel').hidden) closeAuth();
    });
  }

  // ---------- public API ----------
  window.DayHopAuth = {
    isEnabled: () => Boolean(sb),
    getUser: () => current.user,
    getToken: () => current.token,
    current: () => ({ user: current.user, token: current.token }),
    open: openAuth,
    signOut: handleSignOut
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
