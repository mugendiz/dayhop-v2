// services/paradeReminders.js — DayHop V2
// "Email me the night before my town's parade" (routes/parades.js).
//
// Consent: the request itself subscribes the person to the newsletter
// through the normal double opt-in (services/newsletter.subscribe, source
// 'parade_reminder'), and the box says so. A reminder only goes to an
// address that has CONFIRMED by the evening before; a pending or
// unsubscribed address gets nothing. Every reminder carries the newsletter's
// one-click unsubscribe.
//
// Storage: public.api_cache rows like issueStore.js (keys
// "parade-remind:<slug>" with the list of emails, "parade-remind-sent:<slug>"
// once that parade's reminders went out). No service key → memory.
//
// Sweep: server.js runs runReminderSweep every 15 minutes; a parade is due
// from 5 p.m. Toronto time on the day before, once.

const db = require('./db/client');
const { PARADES } = require('../data/santaParades2026');

const TTL_MS = 120 * 24 * 60 * 60 * 1000; // the season, with room to spare
const mem = new Map();
const hasDb = () => db.status().service_key === true;
const DUE_HOUR = 17;

async function put(key, value) {
  if (!hasDb()) { mem.set(key, value); return; }
  const { error } = await db.getClient().from('api_cache').upsert({
    key, payload: { v: value },
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) throw new Error(`parade reminder write failed: ${error.message}`);
}

async function get(key) {
  if (!hasDb()) return mem.has(key) ? mem.get(key) : null;
  const { data, error } = await db.getClient().from('api_cache').select('payload').eq('key', key).maybeSingle();
  if (error) throw new Error(`parade reminder read failed: ${error.message}`);
  return data && data.payload ? data.payload.v : null;
}

const bySlug = slug => PARADES.find(p => p.slug === slug) || null;

/** Add an email to a parade's reminder list. → { ok, parade } */
async function addReminder(slug, email) {
  const parade = bySlug(slug);
  if (!parade) return { ok: false, reason: 'unknown-parade' };
  const list = (await get(`parade-remind:${slug}`)) || [];
  if (!list.includes(email)) {
    list.push(email);
    await put(`parade-remind:${slug}`, list.slice(-5000));
  }
  return { ok: true, parade };
}

const torontoParts = now => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false });
  const o = Object.fromEntries(f.formatToParts(now).map(p => [p.type, p.value]));
  return { day: `${o.year}-${o.month}-${o.day}`, hour: Number(o.hour) % 24 };
};

function dayBefore(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Parades whose reminder is due at `now` (the evening before). Pure. */
function dueParades(now = new Date()) {
  const { day, hour } = torontoParts(now);
  return PARADES.filter(p => dayBefore(p.date) === day && hour >= DUE_HOUR);
}

function fmtDay(ymd) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The reminder email for one parade. token: the subscriber's newsletter token. */
function reminderEmail(p, token) {
  const newsletter = require('./newsletter');
  const base = newsletter.baseUrl();
  const when = `${fmtDay(p.date)}${p.time ? `, ${p.time}` : ''}`;
  const subject = `Tomorrow: the ${p.town} Santa Claus Parade 🎅`;
  const pageUrl = `${base}/santa-parades?utm_source=newsletter&utm_medium=email&utm_campaign=parade_reminder#${p.slug}`;
  const text = [
    `The ${p.name} is tomorrow.`,
    '',
    `When: ${when}${p.time ? '' : ' (start time not posted yet, check the official page)'}`,
    `Where: ${p.where}`,
    p.note ? p.note : null,
    `Official page: ${p.official_url}`,
    '',
    `Every GTA parade on one map: ${pageUrl}`,
    '',
    'Dress warm, bring a blanket to sit on, and get there early for a curb spot.',
    '',
    `Unsubscribe: ${newsletter.unsubscribeUrl(token)}`,
    'DayHop · Richmond Hill, Ontario, Canada · admin@dayhop.quest'
  ].filter(v => v !== null).join('\n');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#FBF7EE;">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#102A2E;">
    <p style="font-size:21px;font-weight:700;margin:0;">DayHop</p>
    <h1 style="font-size:24px;line-height:1.25;margin:16px 0 10px;">The ${esc(p.town)} parade is tomorrow 🎅</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 6px;"><b>When:</b> ${esc(when)}${p.time ? '' : ' (start time not posted yet, check the official page)'}</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 6px;"><b>Where:</b> ${esc(p.where)}</p>
    ${p.note ? `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;color:#2C4A4E;">${esc(p.note)}</p>` : ''}
    <p style="margin:0 0 18px;"><a href="${esc(p.official_url)}" style="color:#E1502F;font-weight:700;">Official parade page</a> &nbsp;·&nbsp; <a href="${esc(pageUrl)}" style="color:#3F6F5C;font-weight:700;">Every GTA parade on one map</a></p>
    <p style="font-size:15px;line-height:1.6;margin:0;color:#2C4A4E;">Dress warm, bring a blanket to sit on, and get there early for a curb spot.</p>
    ${newsletter.complianceFooter(token)}
  </div></body></html>`;
  return { subject, html, text };
}

/**
 * Send every due parade's reminders once. deps for tests:
 * { now, send, listSubscribed }. Never throws.
 */
async function runReminderSweep(deps = {}) {
  const now = deps.now || new Date();
  const due = dueParades(now);
  if (!due.length) return { due: 0, sent: 0 };
  const newsletter = require('./newsletter');
  const send = deps.send || require('./email').sendEmail;
  const listSubscribed = deps.listSubscribed || newsletter.listSubscribed;
  let sent = 0;
  for (const p of due) {
    try {
      if (await get(`parade-remind-sent:${p.slug}`)) continue;
      // Claim first: a crash mid-run skips some reminders, never doubles one.
      await put(`parade-remind-sent:${p.slug}`, now.toISOString());
      const wanted = new Set((await get(`parade-remind:${p.slug}`)) || []);
      if (!wanted.size) continue;
      const confirmed = (await listSubscribed()).filter(r => wanted.has(r.email));
      for (const r of confirmed) {
        const msg = reminderEmail(p, r.token);
        const res = await send({ to: r.email, ...msg, unsubscribeUrl: newsletter.unsubscribeUrl(r.token) });
        if (res && res.sent) sent++;
      }
      console.log(`[parade-remind] ${p.slug}: ${confirmed.length} confirmed of ${wanted.size} asked, ${sent} sent so far`);
    } catch (err) {
      console.warn(`[parade-remind] ${p.slug} failed:`, err.message);
    }
  }
  return { due: due.length, sent };
}

/** Reminder counts per parade, for the admin and the weekly report. */
async function counts() {
  const out = {};
  for (const p of PARADES) out[p.slug] = ((await get(`parade-remind:${p.slug}`).catch(() => null)) || []).length;
  return out;
}

module.exports = { addReminder, dueParades, reminderEmail, runReminderSweep, counts, _mem: mem };
