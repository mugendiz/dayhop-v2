#!/usr/bin/env node
// scripts/simulate-buyer.js — a made-up buyer goes through the real
// personalized-guide pipeline, minus the card charge.
//
//   1. their order form is validated by the same code as POST /checkout
//   2. a paid Stripe session is built from the same metadata checkout writes
//   3. the real fulfillment build runs (Grok author when asked, photos)
//   4. they "download" through the signed-link path
//
// Safe by construction: no production database (no fake sale in revenue,
// no rows written), and no email address on the session (nothing is sent).
// Google, Grok, Overpass and Wikimedia calls are real and cost a little.
//
//   PERSONAL_GUIDE_AUTHOR=grok node scripts/simulate-buyer.js [out-dir]

require('dotenv').config();
delete process.env.SUPABASE_SERVICE_KEY;
const fs = require('fs');
const path = require('path');
const { validateOrder } = require('../services/personalGuide');
const fulfillment = require('../services/personalGuideFulfill');
const store = require('../services/personalGuideStore');

// The persona: written the way a real parent would fill the form.
const PERSONA = {
  who: {
    mom: 'Noor, 36. The considerate one: plans ahead, reads reviews, wants clean washrooms, calm mornings, a real lunch, and Leila in bed by 7:30. Would rather do one thing well than three things rushed. Watches the budget.',
    dad: 'Sam, 38. The adventurer: trail runs at dawn, mountain bikes, climbing gyms, anything with mud or a view. Happy to drive an hour for the right hike.',
    kid: 'Leila, 6. Loves animals, water slides, and asking why. Gets tired by mid afternoon. Scared of very loud places.'
  },
  form: {
    city: 'Richmond Hill',
    start: '2026-10-28',
    end: '2026-11-30',
    name: 'Noor, Sam and Leila',
    notes: 'Visiting family for 5 weeks. Leila is 6: animals, water slides, lots of questions, tired by 3, dislikes loud places. Noor likes calm mornings, clean washrooms, good lunch spots, early bedtimes, and a sensible budget. Sam wants real adventure: dawn trails, mountain biking, climbing, viewpoints, happy to drive an hour. Give each of us days that are ours, and some quiet ones.'
  }
};

(async () => {
  const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
  console.log('PERSONA');
  Object.values(PERSONA.who).forEach(w => console.log('  ' + w));

  // 1. the form, as POST /api/personal-guides/checkout validates it
  const v = validateOrder(PERSONA.form);
  if (!v.ok) throw new Error(`checkout would refuse this order: ${v.error} ${v.message}`);
  console.log(`\n1. order accepted: ${v.order.city}, ${v.order.start} to ${v.order.end}, notes ${v.order.notes.length} chars`);

  // 2. what Stripe hands back after payment
  const session = {
    id: `cs_test_sim_${Date.now()}`,
    mode: 'payment', payment_status: 'paid', amount_total: 2000, currency: 'cad',
    customer_details: { email: null }, // no address: nothing is emailed
    metadata: fulfillment.metadataFor(v.order)
  };
  console.log(`2. paid session ${session.id}, metadata round-trips: ${JSON.stringify(fulfillment.orderFromSession(session)) === JSON.stringify(v.order)}`);

  // 3. the real build
  const t0 = Date.now();
  console.log(`3. building (author: ${process.env.PERSONAL_GUIDE_AUTHOR === 'grok' ? 'Grok' : 'code'}) ...`);
  const result = await fulfillment.runBuild(session);
  console.log(`   ${result} in ${Math.round((Date.now() - t0) / 1000)} s`);

  // 4. the download link the thank-you page and the email hand out
  const sid = fulfillment.verifyToken(fulfillment.signToken(session.id));
  const pdf = await fulfillment.renderPdf(sid);
  const g = await store.getGuide(sid);
  const pdfPath = path.join(outDir, 'simulated-buyer-guide.pdf');
  fs.writeFileSync(pdfPath, pdf);
  fs.writeFileSync(path.join(outDir, 'simulated-buyer-guide.json'), JSON.stringify({ persona: PERSONA, guide: g }, null, 2));

  // How varied is it? Count each place across the Grok sections.
  if (g.grok) {
    const count = new Map();
    const bump = t => count.set(t, (count.get(t) || 0) + 1);
    g.grok.mustSee.forEach(x => bump(x.title));
    g.grok.weeks.forEach(w => w.plan.forEach(x => bump(x.title)));
    g.grok.rainy.forEach(x => bump(x.title));
    const outings = g.grok.weeks.reduce((n, w) => n + w.plan.length, 0);
    console.log(`\n   ${g.grok.mustSee.length} must-sees, ${g.grok.weeks.length} weeks, ${outings} outings, ${g.grok.events.length} events, ${count.size} different places`);
    console.log(`   places used more than twice: ${[...count].filter(([, n]) => n > 2).map(([t, n]) => `${t} x${n}`).join(', ') || 'none'}`);
    console.log(`   dropped by checks: ${(g.grokChecks && g.grokChecks.dropped.length) || 0}`);
    (g.grokChecks ? g.grokChecks.dropped : []).forEach(d => console.log(`     [${d.section}] ${d.title}: ${d.reason}`));
  }
  console.log(`   photos: ${g.photos ? Object.keys(g.photos.byTitle).length : 0} places`);
  console.log(`4. downloaded ${Math.round(pdf.length / 1024)} KB → ${pdfPath}`);
})().catch(err => { console.error(err.stack || err.message); process.exit(1); });
