// middleware/auth.js — DayHop V2
// Verifies a Supabase Auth access token (sent as `Authorization: Bearer <jwt>`)
// and attaches the user to the request. Anonymous requests pass through with no
// user; routes decide whether to require one.
//
// Graceful degradation: with no Supabase configured (local dev / in-memory),
// there is no auth provider, so the persistence routes fall back to the legacy
// client-supplied owner id rather than hard-blocking.

const { isConfigured, getClient } = require('../services/db/client');

// Best-effort: if a valid token is present, set req.user + req.accessToken.
async function attachUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token || !isConfigured()) return next();

  try {
    const { data, error } = await getClient().auth.getUser(token);
    if (!error && data && data.user) {
      req.user = { id: data.user.id, email: data.user.email };
      req.accessToken = token;
    }
  } catch (e) {
    // Invalid/expired token → treat as anonymous, never crash the request.
    console.warn('[auth] token verification failed:', e.message);
  }
  next();
}

// Gate a route to a signed-in user. Sets req.ownerId to the authenticated
// user's id so routes never trust a client-supplied owner. When Supabase
// isn't configured at all, fall back to the legacy ownerId from the request
// so local in-memory dev keeps working.
function requireUser(req, res, next) {
  if (req.user) {
    req.ownerId = req.user.id;
    req.dbCtx = { accessToken: req.accessToken };
    return next();
  }
  if (!isConfigured()) {
    const legacy = (req.body && req.body.ownerId) || req.query.ownerId;
    if (!legacy) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'ownerId is required when auth is not configured.' });
    }
    req.ownerId = legacy;
    req.dbCtx = undefined;
    return next();
  }
  return res.status(401).json({
    error: 'AUTH_REQUIRED',
    message: 'Sign in to save and sync your shortlist and day plans.'
  });
}

module.exports = { attachUser, requireUser };
