#!/usr/bin/env node
// scripts/offer-email.js — mail the running guide offer to the confirmed list.
//
// Lane A2 of the 19-day plan. The guides have never been offered directly to
// the people who asked for the Playbook: every guide checkout on record either
// came from a cold page or was the founder testing. This sends one honest
// email to the only audience that has given consent and shown it clicks
// (last digest: 27% open, 67% click-to-open).
//
//   node scripts/offer-email.js               # preview — who, and the copy
//   node scripts/offer-email.js --send        # actually send
//   node scripts/offer-email.js --send --to someone@example.com   # one person
//
// Three guards, because a bad send here is unrecoverable:
//   1. CONFIRMED subscribers only. Pending rows never consented (CASL) —
//      scripts/newsletter-remind.js is the right tool for those.
//   2. The offer is verified against live Stripe first. We do not advertise a
//      price checkout will not charge; that already cost us a customer on Sep 8.
//   3. Every send is logged. Re-running never mails the same person twice.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nl = require('../services/newsletter');
const promo = require('../services/promo');
const { sendEmail } = require('../services/email');

const LOG = path.join(__dirname, '..', 'social', 'ops', 'offer-email-sent.json');
const CAMPAIGN = 'guides-offer-2026-09';
const SITE = process.env.PUBLIC_ORIGIN || 'https://dayhop.quest';

// Founder addresses and test rows — never count as audience, never get mailed.
const EXCLUDE = new Set([
  'zokaamazon@gmail.com', 'mugendi2001@yahoo.com', 'mugendiz@gmail.com',
  'zokaamazon+pdf@gmail.com', 'adtest@example.com', 'dayhopadmin@gmail.com'
]);

function log() {
  try { return JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch (e) { return {}; }
}
function remember(email, id) {
  const all = log();
  (all[CAMPAIGN] = all[CAMPAIGN] || {})[email] = { at: new Date().toISOString(), id };
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, JSON.stringify(all, null, 2));
}

function copy(p) {
  const subject = `Your city guide is $${5} until ${p.label}`;
  const text = `You signed up for the GTA Family Weekend Playbook, so you know the part
of DayHop that matters: every place is field-checked, with the parking,
washroom and footing notes that decide whether a day actually works.

The city guides are the long version. Ranked tables, live map links, and
those notes on every single entry — six Ontario cities, as PDFs.

Until ${p.label} they are $5 instead of $20. The code is applied for you at
checkout; there is nothing to type.

  One city   ${SITE}/guides
  All six    ${SITE}/guides  (the collection, $14.75 instead of $59)

Every future edition is free, forever. And if a guide doesn't hand you a day
you actually want, reply to this email — refunded, no questions.

— Mugendi
   DayHop, Richmond Hill`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#FBF7EE;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#102A2E;">
    <p style="font-size:22px;font-weight:700;margin:0 0 4px;">DayHop</p>
    <h1 style="font-size:24px;line-height:1.25;margin:18px 0 10px;">Your city guide is $5 until ${p.label}</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
      You signed up for the GTA Family Weekend Playbook, so you know the part of
      DayHop that matters: every place is field-checked, with the parking,
      washroom and footing notes that decide whether a day actually works.
    </p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
      The city guides are the long version. Ranked tables, live map links, and
      those notes on every single entry — six Ontario cities, as PDFs.
    </p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 22px;">
      Until <strong>${p.label}</strong> they are <strong>$5 instead of $20</strong>.
      The code is applied for you at checkout; there is nothing to type.
    </p>
    <a href="${SITE}/guides?src=offer-email"
       style="display:inline-block;background:#E1502F;color:#fff;text-decoration:none;font-size:17px;font-weight:700;padding:14px 26px;border-radius:6px;">See the guides &rarr;</a>
    <p style="font-size:15px;line-height:1.6;margin:22px 0 0;color:#3c4f52;">
      All six as a collection is $14.75 instead of $59. Every future edition is
      free, forever &mdash; and if a guide doesn't hand you a day you actually
      want, reply to this email. Refunded, no questions.
    </p>
    <p style="font-size:16px;line-height:1.6;margin:22px 0 0;">&mdash; Mugendi</p>
    __FOOTER__
  </div></body></html>`;
  return { subject, text, html };
}

(async () => {
  const send = process.argv.includes('--send');
  // indexOf returns -1 when --to is absent, and argv[0] is the node binary —
  // which silently matched nobody and made every run look like an empty list.
  const toAt = process.argv.indexOf('--to');
  const only = toAt === -1 ? '' : String(process.argv[toAt + 1] || '').trim().toLowerCase();

  // Guard 2 — never advertise a price checkout will not charge.
  const p = promo.publicConfig();
  const check = await promo.verify();
  if (!p.active) {
    console.error(`REFUSING: the ${p.code} window closed at ${p.endsUtc}. There is no $5 offer to mail.`);
    process.exitCode = 1; return;
  }
  if (check.ok === false) {
    console.error(`REFUSING: ${check.reason}`);
    console.error('Run `node scripts/promo-check.js` and fix the offer before mailing anyone.');
    process.exitCode = 1; return;
  }
  if (check.ok === null) console.warn(`(could not verify against Stripe: ${check.reason})`);

  const already = log()[CAMPAIGN] || {};
  const all = await nl.listSubscribed();
  const targets = all
    .filter(s => !EXCLUDE.has(String(s.email).toLowerCase()))
    .filter(s => !already[s.email])
    .filter(s => !only || s.email === only);

  const { subject, text, html } = copy(p);
  console.log(`offer   : ${p.code}, ${p.percentOff}% off, until ${p.label} (verified: ${check.ok === true ? 'yes' : check.ok === null ? 'unchecked' : 'NO'})`);
  console.log(`subject : ${subject}`);
  console.log(`list    : ${all.length} confirmed, ${all.length - targets.length - Object.keys(already).length} excluded as founder/test, ${Object.keys(already).length} already sent`);
  console.log(`sending : ${targets.length} recipient${targets.length === 1 ? '' : 's'}\n`);
  for (const s of targets) console.log('   ', s.email);

  if (!send) {
    console.log('\n--- copy ---\n');
    console.log(text);
    console.log('\nPreview only. Re-run with --send to mail it.');
    return;
  }
  if (!targets.length) { console.log('\nNothing to send.'); return; }

  let ok = 0;
  for (const s of targets) {
    const body = html.replace('__FOOTER__', nl.complianceFooter ? nl.complianceFooter(s.token) : '');
    const res = await sendEmail({
      to: s.email, subject, text, html: body,
      unsubscribeUrl: nl.unsubscribeUrl(s.token)
    });
    if (res.sent) { remember(s.email, res.id || null); ok++; console.log('  sent  ', s.email); }
    else console.error('  FAILED', s.email, res.reason);
  }
  console.log(`\n${ok}/${targets.length} sent. Logged to ${path.relative(process.cwd(), LOG)}.`);
})();
