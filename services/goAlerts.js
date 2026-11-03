// services/goAlerts.js — DayHop V2
// "Email me when this status changes" on a Go Now share card (/go).
//
// Only City of Toronto park washrooms have a live status, so only they can
// be watched. Consent: the request subscribes through the newsletter's
// double opt-in (source 'go_alert', routes/goNow.js); an alert only goes to
// a CONFIRMED address, with the newsletter's one-click unsubscribe.
//
// Storage: public.api_cache rows like services/paradeReminders.js
// ("go-alert:<id>" → { emails, last }, "go-alert:index" → ids). No service
// key → memory. The 15 minute sweep in server.js runs runAlertSweep.

const db = require('./db/client');

const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const mem = new Map();
const hasDb = () => db.status().service_key === true;

async function put(key, value) {
  if (!hasDb()) { mem.set(key, value); return; }
  const { error } = await db.getClient().from('api_cache').upsert({
    key, payload: { v: value },
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) throw new Error(`go alert write failed: ${error.message}`);
}

async function get(key) {
  if (!hasDb()) return mem.has(key) ? mem.get(key) : null;
  const { data, error } = await db.getClient().from('api_cache').select('payload').eq('key', key).maybeSingle();
  if (error) throw new Error(`go alert read failed: ${error.message}`);
  return data && data.payload ? data.payload.v : null;
}

// watch() and the sweep read, change and write the same rows. One web
// process runs DayHop, so a promise chain makes those writes take turns and
// two parents tapping "Alert me" at the same moment both stick.
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

/** Watch one stop for an email. status: the stop's status right now. */
function watch(id, email, status) {
  return serial(async () => {
    const row = (await get(`go-alert:${id}`)) || { emails: [], last: status };
    if (!row.emails.includes(email)) row.emails.push(email);
    row.emails = row.emails.slice(-2000);
    await put(`go-alert:${id}`, row);
    const index = (await get('go-alert:index')) || [];
    if (!index.includes(id)) { index.push(id); await put('go-alert:index', index.slice(-5000)); }
  });
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The alert email. p: the stop (services/goNow shape). Pure apart from base URL. */
function alertEmail(p, token) {
  const newsletter = require('./newsletter');
  const base = newsletter.baseUrl();
  const word = p.washroom_status === 'open' ? 'is open again' : 'just closed';
  const subject = `${p.name} ${word}`;
  const url = `${base}/go?p=${encodeURIComponent(p.id)}&utm_source=newsletter&utm_medium=email&utm_campaign=go_alert`;
  const text = [
    `${p.name} ${word}, according to the City of Toronto's washroom feed.`,
    p.notes ? p.notes : null,
    '',
    `See it and the nearest alternatives: ${url}`,
    '',
    `Unsubscribe: ${newsletter.unsubscribeUrl(token)}`,
    'DayHop · Richmond Hill, Ontario, Canada · admin@dayhop.quest'
  ].filter(v => v !== null).join('\n');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#FBF7EE;">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#102A2E;">
    <p style="font-size:21px;font-weight:700;margin:0;">DayHop Washroom Map</p>
    <h1 style="font-size:23px;line-height:1.3;margin:16px 0 10px;">${esc(p.name)} ${esc(word)}</h1>
    <p style="font-size:15.5px;line-height:1.6;margin:0 0 10px;">According to the City of Toronto's park washroom feed.${p.notes ? ` ${esc(p.notes)}` : ''}</p>
    <p style="margin:0 0 18px;"><a href="${esc(url)}" style="color:#E1502F;font-weight:700;">See it and the nearest alternatives</a></p>
    ${newsletter.complianceFooter(token)}
  </div></body></html>`;
  return { subject, text, html };
}

/**
 * Email confirmed watchers of every stop whose open/closed status changed
 * since the last sweep. deps for tests: { places, listSubscribed, send }.
 */
async function sweepOnce(deps = {}) {
  const index = (await get('go-alert:index').catch(() => null)) || [];
  if (!index.length) return { watched: 0, changed: 0, sent: 0 };
  const goNow = require('./goNow');
  const newsletter = require('./newsletter');
  const places = deps.places || await goNow.allPlaces();
  const byId = new Map(places.map(p => [p.id, p]));
  const send = deps.send || require('./email').sendEmail;
  let changed = 0, sent = 0, confirmed = null;
  for (const id of index) {
    try {
      const row = await get(`go-alert:${id}`);
      const p = byId.get(id);
      if (!row || !p || p.washroom_status === 'unknown' || p.washroom_status === row.last) continue;
      changed++;
      row.last = p.washroom_status;
      await put(`go-alert:${id}`, row); // claim first: a crash skips one alert, never doubles it
      if (!confirmed) confirmed = await (deps.listSubscribed || newsletter.listSubscribed)();
      const wanted = new Set(row.emails);
      for (const r of confirmed.filter(s => wanted.has(s.email))) {
        const res = await send({ to: r.email, ...alertEmail(p, r.token), unsubscribeUrl: newsletter.unsubscribeUrl(r.token) });
        if (res && res.sent) sent++;
      }
    } catch (err) {
      console.warn(`[go-alert] ${id} failed:`, err.message);
    }
  }
  if (changed) console.log(`[go-alert] ${changed} status changes, ${sent} alerts sent`);
  return { watched: index.length, changed, sent };
}

// The sweep writes the same rows as watch(), so it takes its turn too.
function runAlertSweep(deps = {}) { return serial(() => sweepOnce(deps)); }

module.exports = { watch, runAlertSweep, alertEmail, _mem: mem };
