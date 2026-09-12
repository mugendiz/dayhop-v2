// scripts/newsletter-remind.js — ONE confirmation reminder to people who asked
// for the newsletter and never clicked confirm.
//
// Why this exists: on 2026-09-12 the list was 11 subscribed / 10 pending / 1
// unsubscribed. The digest itself was healthy (11 of 11 delivered every week,
// 18-45% open rate) — the loss was that 45% of the people who asked for it
// never completed the double opt-in, so they have never received anything.
//
// CASL: the reminder is a confirmation request for an opt-in the person
// started themselves, inside the 6-month implied-consent window that their
// inquiry opens. It goes ONCE per address, ever — the log file below is what
// guarantees that. Anyone still pending after it is left alone for good.
//
//   node scripts/newsletter-remind.js            # preview, sends nothing
//   node scripts/newsletter-remind.js --send
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const newsletter = require('../services/newsletter');
const { sendEmail, isConfigured } = require('../services/email');

const LOG = path.join(__dirname, '..', 'social', 'ops', 'newsletter-reminders.json');
const MIN_AGE_DAYS = Number(process.env.MIN_AGE_DAYS || 2);
const MAX_AGE_DAYS = 180; // outside the CASL implied-consent window: do not contact

const load = () => (fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : []);

function body(token) {
  return `You asked for the DayHop weekend brief — one click left.

We never sent it, because the subscription was never confirmed. Canadian anti-spam law means we can't email you until you say yes, so nothing has gone out.

Confirm here and two things arrive: The GTA Family Weekend Playbook (70+ outings actually worth your Saturday), and a short Thursday note on what's on around the GTA this weekend — real places, checked against the weather and any park advisory.

${newsletter.confirmUrl(token)}

If you'd rather not, do nothing. This is the only reminder you'll get from us.

DayHop · Richmond Hill, Ontario, Canada · admin@dayhop.quest`;
}

async function main() {
  const send = process.argv.includes('--send');
  if (!isConfigured()) { console.error('email not configured'); process.exit(1); }
  const log = load();
  const already = new Set(log.map(r => r.email.toLowerCase()));
  const pending = await newsletter.listPending({ minAgeDays: MIN_AGE_DAYS });

  let queued = 0, sent = 0;
  for (const r of pending) {
    const ageDays = (Date.now() - Date.parse(r.created_at)) / 86400000;
    const mask = r.email.replace(/(.{2}).*(@.*)/, '$1***$2');
    if (already.has(r.email.toLowerCase())) { console.log(`   skip (already reminded)  ${mask}`); continue; }
    // Three of the ten pending rows were the founder testing the funnel
    // (production-e2e, pdf-prod-test, an @example.com). Never email those.
    if (/test|e2e|qa/i.test(r.consent_source || '') || /@example\.(com|org|net)$/i.test(r.email)) {
      console.log(`   skip (test row: ${r.consent_source})  ${mask}`); continue;
    }
    if (ageDays > MAX_AGE_DAYS) { console.log(`   skip (${Math.round(ageDays)}d old, outside the consent window)  ${mask}`); continue; }
    queued++;
    if (!send) { console.log(`   would remind  ${mask}  (pending ${Math.round(ageDays)}d, source ${r.consent_source || '?'})`); continue; }
    const result = await sendEmail({
      to: r.email,
      subject: 'One click left on your DayHop subscription',
      text: body(r.token),
      html: '<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#102A2E;white-space:pre-wrap">'
        + body(r.token).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>') + '</div>'
    });
    console.log(`   ${result.sent ? 'SENT ' + result.id : 'FAILED ' + result.reason}  ${mask}`);
    if (result.sent) { log.push({ email: r.email, id: result.id, at: new Date().toISOString() }); sent++; }
    fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
    await new Promise(res => setTimeout(res, 1200));
  }
  console.log(`\npending: ${pending.length} · eligible: ${queued} · sent: ${sent}`);
  if (!send) console.log('Preview only — add --send to actually send. One reminder per address, ever.');
}

main().catch(e => { console.error(e); process.exit(1); });
