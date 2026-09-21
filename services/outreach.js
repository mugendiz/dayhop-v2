// services/outreach.js — DayHop V2 (sponsorship outreach CRM + cadence engine)
// One source of truth for the outreach pipeline: the `outreach` table. The
// admin panel's CRM tab and the daily cadence tick read and write the same
// rows, so a human action (mark replied, pause) and the automation never
// disagree about state.
//
// Cadence contract (approved 2026-08-18):
//   drafted  — opener written, waiting for OWNER approval (nothing sends)
//   queued   — approved; next tick sends the opener        → sent   (+4 days)
//   sent     — opener out; when due, sends the bump        → bumped (+6 days)
//   bumped   — bump out; when due, sends one closing note  → closed_out (done)
//   replied | won | lost | optout — terminal; cadence never touches them.
// `suppressed` is a hard stop that wins over everything, any stage.
//
// Tone contract: outreach copy is plain, warm, and unsalesy — no manufactured
// scarcity, no call asks, a single soft CTA (reply for the founding partner
// 50% coupon code), and an opt-out line on every send. CASL: opt-out honored
// forever via stage=optout + suppressed.
//
// Requires the Supabase service key; without it every function fails soft
// (empty lists, {sent:false}) so the panel still renders.

const dbClient = require('./db/client');
const { sendEmail } = require('./email');

// One identity across the portfolio (founder decision 2026-09-13). Outreach
// signed "Andrew" here and on YardRule while the LinkedIn profile a recipient
// looks up reads "Mugendi Zoka". CASL wants the sender identified accurately;
// the parenthetical is accurate and still matches everything already sent.
// Overridable by OUTREACH_FROM in the environment.
const OUTREACH_FROM =
  process.env.OUTREACH_FROM || 'Mugendi (Andrew) at DayHop <hello@dayhop.quest>';
const BUMP_AFTER_DAYS = 4;
const CLOSE_AFTER_DAYS = 6; // after the bump (day ~10 overall)
const ACTIVE_STAGES = new Set(['queued', 'sent', 'bumped']);
const TERMINAL_STAGES = new Set(['replied', 'won', 'lost', 'optout', 'closed_out']);
const ALL_STAGES = new Set(['drafted', ...ACTIVE_STAGES, ...TERMINAL_STAGES]);

function hasServiceKey() {
  return dbClient.status().service_key === true;
}
function db() {
  return dbClient.getClient();
}

const SIG = `Andrew Zoka
Founder, DayHop (dayhop.quest)
Richmond Hill, Ontario, Canada
If you'd rather not hear from me, just reply "no thanks" and I won't email again.`;

// Bump + closing note are generated from the row (opener drafts are written
// per venue and stored in row.draft — personalization lives there). Both
// follow the approved low key voice: one specific reason, one soft CTA.
function bumpMessage(row) {
  const first = (row.contact_name || '').trim();
  const greeting = first ? `Hi ${first},` : `Hi ${row.name} team,`;
  const hook = row.hook ? `${row.hook} ` : '';
  return {
    subject: `Re: ${openerSubject(row)}`,
    text: `${greeting}

Andrew from DayHop, just adding a short note in case my last email got buried.

${hook}DayHop shows GTA families what to do on the weekend, and I would genuinely like ${row.name} in there for the season. Setup is online and takes a few minutes.

If it sounds useful, reply and I will send the founding partner 50% coupon code. If the timing is wrong, no worries at all.

${SIG}`
  };
}

function closeMessage(row) {
  const first = (row.contact_name || '').trim();
  const greeting = first ? `Hi ${first},` : `Hi ${row.name} team,`;
  return {
    subject: `Re: ${openerSubject(row)}`,
    text: `${greeting}

Andrew from DayHop, closing the loop so I stop showing up in your inbox.

The founding partner offer stays open if the timing ever gets better, and ${row.name} keeps showing up organically in DayHop either way when it fits what a family asked for. If you ever want the 50% coupon code, it is one reply away.

Thanks for reading these, and have a great season.

${SIG}`
  };
}

function openerSubject(row) {
  const opener = (row.thread || []).find(t => t.type === 'opener');
  if (opener && opener.subject) return opener.subject.replace(/^Re:\s*/i, '');
  return (row.draft && row.draft.subject) || `${row.name} and DayHop`;
}

function nowIso() { return new Date().toISOString(); }
function daysFromNow(d) { return new Date(Date.now() + d * 24 * 3600 * 1000).toISOString(); }

async function logEvent(outreachId, type, actor, payload) {
  if (!hasServiceKey()) return;
  try {
    const { error } = await db().from('outreach_events')
      .insert({ outreach_id: outreachId, type, actor: actor || 'system', payload: payload || null });
    if (error) throw error;
  } catch (err) {
    console.warn('[outreach] event log failed:', err.message);
  }
}

async function list() {
  if (!hasServiceKey()) return [];
  const { data, error } = await db().from('outreach').select('*')
    .order('next_touch_due', { ascending: true, nullsFirst: false }).limit(500);
  if (error) throw error;
  return data || [];
}

async function get(id) {
  if (!hasServiceKey()) return null;
  const { data, error } = await db().from('outreach').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function history(id, limit = 50) {
  if (!hasServiceKey()) return [];
  const { data, error } = await db().from('outreach_events').select('*')
    .eq('outreach_id', id).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

async function update(id, patch, actor, eventType, eventPayload) {
  const { data, error } = await db().from('outreach')
    .update(Object.assign({ updated_at: nowIso() }, patch)).eq('id', id).select().single();
  if (error) throw error;
  if (eventType) await logEvent(id, eventType, actor, eventPayload);
  return data;
}

/** Add or replace a prospect row. Openers land as stage=drafted (never sends). */
async function upsert(row, actor) {
  if (!row || !row.name || !row.email) throw new Error('name and email are required');
  const id = row.id || 'out-' + String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const full = {
    id,
    kind: row.kind === 'investor' ? 'investor' : 'venue',
    name: row.name,
    contact_name: row.contact_name || null,
    email: String(row.email).trim(),
    tier: row.tier || null,
    stage: ALL_STAGES.has(row.stage) ? row.stage : 'drafted',
    hook: row.hook || null,
    draft: row.draft || null,
    thread: row.thread || [],
    last_touch_at: row.last_touch_at || null,
    next_touch_due: row.next_touch_due || null,
    suppressed: Boolean(row.suppressed),
    notes: row.notes || null,
    updated_at: nowIso()
  };
  const { data, error } = await db().from('outreach').upsert(full, { onConflict: 'id' }).select().single();
  if (error) throw error;
  await logEvent(id, 'upsert', actor, { stage: full.stage });
  return data;
}

/** Owner approval: drafted → queued. The next daily tick sends the opener. */
async function approve(id, actor) {
  const row = await get(id);
  if (!row) throw new Error(`unknown outreach row: ${id}`);
  if (row.stage !== 'drafted') throw new Error(`only drafted rows can be approved (is: ${row.stage})`);
  if (!row.draft || !row.draft.subject || !row.draft.text) throw new Error('row has no opener draft to approve');
  return update(id, { stage: 'queued', next_touch_due: nowIso() }, actor, 'approved');
}

/** Human stage override from the panel (mark replied/won/lost/optout, or pause). */
async function setStage(id, stage, actor) {
  if (!ALL_STAGES.has(stage)) throw new Error(`stage must be one of: ${[...ALL_STAGES].join(', ')}`);
  const patch = { stage };
  if (TERMINAL_STAGES.has(stage)) patch.next_touch_due = null;
  if (stage === 'optout') patch.suppressed = true;
  return update(id, patch, actor, 'stage_change', { stage });
}

async function setSuppressed(id, suppressed, actor) {
  return update(id, { suppressed: Boolean(suppressed) }, actor, 'stage_change', { suppressed: Boolean(suppressed) });
}

async function addNote(id, note, actor) {
  const row = await get(id);
  if (!row) throw new Error(`unknown outreach row: ${id}`);
  const stamped = `[${new Date().toISOString().slice(0, 10)} ${actor || 'admin'}] ${note}`;
  const notes = row.notes ? `${row.notes}\n${stamped}` : stamped;
  return update(id, { notes }, actor, 'note', { note });
}

async function sendStep(row, type, message, nextStage, nextDueDays) {
  const res = await sendEmail({
    to: row.email,
    subject: message.subject,
    text: message.text,
    html: `<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${message.text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    from: OUTREACH_FROM
  });
  if (!res.sent) {
    // Leave the row due — the next tick retries. A bounce-class failure gets
    // surfaced in the audit trail either way.
    await logEvent(row.id, 'send_failed', 'system', { step: type, reason: res.reason });
    return false;
  }
  const thread = [...(row.thread || []), { type, resend_id: res.id, subject: message.subject, at: nowIso() }];
  await update(row.id, {
    stage: nextStage,
    thread,
    last_touch_at: nowIso(),
    next_touch_due: nextDueDays == null ? null : daysFromNow(nextDueDays)
  }, 'system', 'sent', { step: type, resend_id: res.id, subject: message.subject });
  console.log(`[outreach] ${type} sent to ${row.name} (${row.email})`);
  return true;
}

/**
 * Daily cadence tick. Sends whatever is due, one email per row per tick.
 * Safe to call any time — rows advance only when next_touch_due has passed,
 * and terminal/suppressed rows are never touched.
 */
async function tick() {
  if (!hasServiceKey()) return { processed: 0 };
  const { data, error } = await db().from('outreach').select('*')
    .eq('suppressed', false)
    .in('stage', [...ACTIVE_STAGES])
    .lte('next_touch_due', nowIso())
    .limit(20); // stays well inside Resend's daily free-tier quota
  if (error) { console.warn('[outreach] tick query failed:', error.message); return { processed: 0 }; }

  let processed = 0;
  for (const row of data || []) {
    try {
      if (row.stage === 'queued') {
        if (row.draft && row.draft.subject && row.draft.text) {
          const ok = await sendStep(row, 'opener', row.draft, 'sent', BUMP_AFTER_DAYS);
          if (ok) processed++;
        }
      } else if (row.stage === 'sent') {
        const ok = await sendStep(row, 'bump', bumpMessage(row), 'bumped', CLOSE_AFTER_DAYS);
        if (ok) processed++;
      } else if (row.stage === 'bumped') {
        const ok = await sendStep(row, 'close', closeMessage(row), 'closed_out', null);
        if (ok) processed++;
      }
      await new Promise(r => setTimeout(r, 700)); // Resend rate limit headroom
    } catch (err) {
      console.warn(`[outreach] cadence step failed for ${row.id}:`, err.message);
    }
  }
  if (processed) console.log(`[outreach] cadence tick sent ${processed} email${processed === 1 ? '' : 's'}`);
  return { processed };
}

/** Resend webhook signal (delivered/opened/bounced) → audit trail + flags. */
async function recordEmailEvent(resendId, type) {
  if (!hasServiceKey() || !resendId) return false;
  const { data, error } = await db().from('outreach').select('id, thread, suppressed')
    .filter('thread', 'cs', JSON.stringify([{ resend_id: resendId }])).limit(1);
  if (error || !data || !data.length) return false;
  const row = data[0];
  await logEvent(row.id, type, 'resend', { resend_id: resendId });
  if (type === 'bounced') {
    // A hard bounce means the address is bad — stop the cadence.
    await db().from('outreach').update({ suppressed: true, updated_at: nowIso() }).eq('id', row.id);
    console.warn(`[outreach] ${row.id} bounced — cadence suppressed`);
  }
  return true;
}

// The live founding-partner terms, as published on /advertise — kept here so
// the one-click reply below can't drift from the page the prospect will
// actually land on (the exact drift that burned the Sep 8 guide customer
// per services/promo.js: copy updated, checkout wasn't, and the customer
// was quoted a price the page never promised).
const FOUNDING_CODE = 'FOUNDING';
const FOUNDING_TERMS = '$99/mo Spotlight, locked in until your monthly report shows 500+ families ' +
  'seeing your venue — then list price with 30 days\' notice, or cancel anytime';

/**
 * The FOUNDING one-clicker: when a prospect replies interested, staff hit
 * one button and the code + signup link goes out on the same thread. Logs to
 * the audit trail; does not change stage (a human decides won/lost).
 */
async function sendCoupon(id, actor) {
  const row = await get(id);
  if (!row) throw new Error(`unknown outreach row: ${id}`);
  const first = (row.contact_name || '').trim();
  const greeting = first ? `Hi ${first},` : `Hi ${row.name} team,`;
  const message = {
    subject: `Re: ${openerSubject(row)}`,
    text: `${greeting}

Great to hear from you. Here is everything you need:

Coupon code: ${FOUNDING_CODE} (${FOUNDING_TERMS})
Sign up here: https://dayhop.quest/advertise?utm_source=outreach&utm_campaign=founding

The whole thing takes a few minutes online, and you can cancel anytime. If anything is unclear while you set it up, just reply here and I will sort it out the same day.

${SIG}`
  };
  const res = await sendEmail({
    to: row.email,
    subject: message.subject,
    text: message.text,
    html: `<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${message.text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    from: OUTREACH_FROM
  });
  if (!res.sent) throw new Error(res.reason || 'send failed');
  const thread = [...(row.thread || []), { type: 'coupon', resend_id: res.id, subject: message.subject, at: nowIso() }];
  await update(row.id, { thread, last_touch_at: nowIso() }, actor, 'coupon_sent', { resend_id: res.id });
  return { sent: true, id: res.id };
}

/** Pipeline rollup for the panel header and the Monday report. */
async function summary() {
  const rows = await list().catch(() => []);
  const byStage = {};
  for (const r of rows) byStage[r.stage] = (byStage[r.stage] || 0) + 1;
  return {
    total: rows.length,
    by_stage: byStage,
    due_now: rows.filter(r => !r.suppressed && ACTIVE_STAGES.has(r.stage)
      && r.next_touch_due && Date.parse(r.next_touch_due) <= Date.now()).length,
    awaiting_approval: rows.filter(r => r.stage === 'drafted' && !r.suppressed && r.draft).length,
    replied: (byStage.replied || 0) + (byStage.won || 0)
  };
}

// ---------- Panel roles ----------
// admin_users is the authority (owner | deputy | operator): the DB row wins
// over ADMIN_EMAILS so an ownership transfer sticks even while the old owner
// is still in the env var. Env owners are only a fallback for emails with no
// row (bootstrap, or the DB is unreachable). Exactly one owner row exists
// (partial unique index); it can't be deleted, only swapped by
// transferOwnership. Cached 60s so every admin request doesn't hit the table.
let _rolesCache = { at: 0, rows: [] };
async function roleFor(email) {
  if (!email) return null;
  const lower = String(email).toLowerCase();
  if (hasServiceKey()) {
    if (Date.now() - _rolesCache.at > 60 * 1000) {
      const { data, error } = await db().from('admin_users').select('email, role');
      if (!error) _rolesCache = { at: Date.now(), rows: data || [] };
    }
    const hit = _rolesCache.rows.find(r => String(r.email).toLowerCase() === lower);
    if (hit) return hit.role;
  }
  return require('./entitlements').isAdmin({ email: lower }) ? 'owner' : null;
}

async function listTeam() {
  if (!hasServiceKey()) return [];
  const { data, error } = await db().from('admin_users').select('*').order('created_at');
  if (error) throw error;
  return data || [];
}

async function addTeamMember(email, role, actor) {
  if (!email || !/.+@.+\..+/.test(email)) throw new Error('a valid email is required');
  // Owner is never added here — only the seed or transferOwnership creates one.
  if (!['deputy', 'operator'].includes(role)) throw new Error('role must be deputy or operator');
  const lower = String(email).toLowerCase();
  const { data: existing } = await db().from('admin_users').select('role').eq('email', lower).maybeSingle();
  if (existing && existing.role === 'owner') throw new Error('that email is the owner — transfer ownership instead');
  const { data, error } = await db().from('admin_users')
    .upsert({ email: lower, role, added_by: actor || null }, { onConflict: 'email' })
    .select().single();
  if (error) throw error;
  _rolesCache.at = 0;
  return data;
}

async function removeTeamMember(email) {
  const lower = String(email).toLowerCase();
  const { data: existing } = await db().from('admin_users').select('role').eq('email', lower).maybeSingle();
  if (existing && existing.role === 'owner') {
    throw new Error('the owner cannot be removed — transfer ownership first');
  }
  const { error } = await db().from('admin_users').delete().eq('email', lower);
  if (error) throw error;
  _rolesCache.at = 0;
  return true;
}

// Atomic swap via the transfer_ownership SQL function: target must already
// be a deputy; the old owner is demoted to deputy in the same transaction.
async function transferOwnership(targetEmail) {
  if (!hasServiceKey()) throw new Error('service key required');
  const { error } = await db().rpc('transfer_ownership', {
    new_owner_email: String(targetEmail || '').toLowerCase()
  });
  if (error) throw new Error(error.message || 'transfer failed');
  _rolesCache.at = 0;
  return true;
}

// Boot-time bootstrap: guarantee an owner row exists so the panel's Team
// section always shows who the owner is. Seeds from ADMIN_EMAILS (first
// entry) or the baked-in founder. Fail-soft — a missing service key or DB
// hiccup must never block boot.
async function ensureOwnerSeed() {
  if (!hasServiceKey()) return false;
  try {
    const { data, error } = await db().from('admin_users').select('email').eq('role', 'owner').limit(1);
    if (error) throw error;
    if (data && data.length) return false;
    const seed = String(process.env.ADMIN_EMAILS || '').split(',')
      .map(e => e.trim().toLowerCase()).filter(Boolean)[0] || 'mugendiz@gmail.com';
    const { error: upErr } = await db().from('admin_users')
      .upsert({ email: seed, role: 'owner', added_by: 'seed' }, { onConflict: 'email' });
    if (upErr) throw upErr;
    _rolesCache.at = 0;
    console.log(`[outreach] owner row seeded: ${seed}`);
    return true;
  } catch (err) {
    console.warn('[outreach] owner seed skipped:', err.message);
    return false;
  }
}

module.exports = {
  list, get, history, upsert, approve, setStage, setSuppressed, addNote,
  tick, recordEmailEvent, summary, sendCoupon,
  roleFor, listTeam, addTeamMember, removeTeamMember,
  transferOwnership, ensureOwnerSeed,
  // Exported for the copy-drift regression test (test/outreachCoupon.test.js).
  FOUNDING_CODE, FOUNDING_TERMS
};
