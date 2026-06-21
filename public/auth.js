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

  // ---------- init ----------
  async function init() {
    let cfg;
    try {
      cfg = await fetch('/api/config').then(r => r.json());
    } catch (e) {
      return; // no config → stay anonymous
    }
    if (!cfg.authEnabled || !window.supabase) return;

    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    show('auth-btn', true); // reveal sign-in entry point
    wireUI();

    const { data } = await sb.auth.getSession();
    setSession(data.session, 'INITIAL');

    sb.auth.onAuthStateChange((event, session) => setSession(session, event));
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
    }
  }

  // ---------- modal ----------
  function openAuth() {
    setMode('signin');
    clearError();
    const panel = $('auth-panel');
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('modal--open'));
    document.body.style.overflow = 'hidden';
    const email = $('auth-email');
    if (email) setTimeout(() => email.focus(), 60);
  }

  function closeAuth() {
    const panel = $('auth-panel');
    panel.classList.remove('modal--open');
    document.body.style.overflow = '';
    setTimeout(() => { panel.hidden = true; }, 200);
  }

  function setMode(next) {
    mode = next;
    const signup = mode === 'signup';
    $('auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
    $('auth-sub').textContent = signup
      ? 'Save your shortlist and day plans, synced across devices.'
      : 'Sign in to save your shortlist and plans across devices.';
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

  async function handleGoogle() {
    clearError();
    try {
      await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      // Redirects away; the session is picked up on return.
    } catch (err) {
      setError(err.message || 'Could not start Google sign-in.');
    }
  }

  async function handleSignOut() {
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
