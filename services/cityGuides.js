// services/cityGuides.js — DayHop V2
// Paid city nature guides ($20 PDF): the registry, on-demand pdfkit builds,
// signed download tokens, Stripe checkout creation, and purchase fulfillment
// (email with the PDF attached + a re-download link).
//
// PDFs render from authored data in data/cityGuides/ — never from the live
// feed or autopilot catalog — so a paid product can't silently pick up an
// unreviewed row. Guides marked status:'coming_soon' are listed but not
// sellable (US titles ship only after manual verification).
//
// Money flow: checkout is mode:'payment' with invoice_creation enabled, so
// the existing invoice.paid webhook path books the sale into the ledger
// (billing.js routes guide invoices to 'other_income' via invoice metadata).
// Fulfillment itself rides checkout.session.completed.

const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { GUIDES } = require('../data/cityGuides');
const email = require('./email');
const analytics = require('./analytics');

const PRICE_CENTS = 2000;
const CURRENCY = 'cad';
const TOKEN_DAYS = 30;

// Brand palette (mirrors playbookPdf.js / the web shell).
const INK = '#102A2E';
const INK_SOFT = '#41585C';
const CORAL = '#E1502F';
const MOSS = '#3F6F5C';
const PAPER = '#FBF7EE';

function signingSecret() {
  const s = process.env.GUIDE_DOWNLOAD_SECRET || process.env.ADMIN_KEY;
  if (!s) throw new Error('No GUIDE_DOWNLOAD_SECRET or ADMIN_KEY set — cannot sign download links.');
  return s;
}

function list() {
  return GUIDES.map(g => ({
    slug: g.slug,
    title: g.title,
    subtitle: g.subtitle,
    status: g.status,
    city_keys: g.city_keys,
    price: PRICE_CENTS / 100,
    currency: CURRENCY.toUpperCase(),
    spot_count: g.status === 'live' ? countSpots(g) : null
  }));
}

function bySlug(slug) {
  return GUIDES.find(g => g.slug === slug) || null;
}

function countSpots(g) {
  const c = g.content();
  return c.spots.length + (c.drives ? c.drives.length : 0);
}

// Which live guide matches a browsed city string (feed promo card).
function matchCity(city) {
  const s = String(city || '').toLowerCase();
  if (!s) return null;
  for (const g of GUIDES) {
    if (g.status !== 'live') continue;
    if (g.city_keys.some(k => s.includes(k))) return g;
  }
  return null;
}

// ---------- download tokens ----------
// base64url(slug.exp).hmac — no DB row needed; a token is proof of purchase
// because only fulfillment and the claim endpoint ever mint one.

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signToken(slug, days = TOKEN_DAYS) {
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  const payload = `${slug}.${exp}`;
  const mac = crypto.createHmac('sha256', signingSecret()).update(payload).digest();
  return `${b64url(payload)}.${b64url(mac)}`;
}

function verifyToken(token) {
  try {
    const [p, m] = String(token || '').split('.');
    if (!p || !m) return null;
    const payload = Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    const [slug, expStr] = payload.split('.');
    const exp = Number(expStr);
    if (!slug || !Number.isFinite(exp) || exp < Date.now()) return null;
    const mac = crypto.createHmac('sha256', signingSecret()).update(payload).digest();
    const given = Buffer.from(m.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (given.length !== mac.length || !crypto.timingSafeEqual(given, mac)) return null;
    return bySlug(slug) ? slug : null;
  } catch (e) {
    return null;
  }
}

// ---------- PDF build ----------

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const pdfCache = new Map(); // slug -> { buffer, at }

const ETIQUETTE = [
  'Stay on marked trails — shortcuts erode banks and trample the understory that makes these places worth visiting.',
  'Pack out everything you pack in, including fruit peels and dog bags. Bins at trailheads fill fast on weekends.',
  'Dogs on leash unless a sign says otherwise — for wildlife, other visitors, and your dog near water and cliff edges.',
  'Conditions change: trails flood in spring, close after storms, and ice over silently in shoulder season. If a barrier is up, it is up for a reason.',
  'Paid or reservation-gated sites change their rules seasonally — check the official page before a long drive.'
];

function buildGuidePdf(guide) {
  return new Promise((resolve, reject) => {
    const c = guide.content();
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 64, bottom: 64, left: 64, right: 64 },
      bufferPages: true,
      info: { Title: guide.title, Author: 'DayHop' }
    });
    const chunks = [];
    doc.on('data', ch => chunks.push(ch));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const total = c.spots.length + (c.drives ? c.drives.length : 0);

    // ---------- cover ----------
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAPER);
    doc.fill(INK).font('Helvetica-Bold').fontSize(30).text('DayHop', 64, 140);
    doc.moveDown(1.1);
    doc.fontSize(34).text(guide.title, { width: W });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(14).fill(INK_SOFT).text(guide.subtitle, { width: W });
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fill(MOSS)
      .text(`${total} places · ${c.itineraries.length} ready-made day plans · season-by-season calendar`);
    doc.font('Helvetica').fontSize(10).fill(INK_SOFT)
      .text(`Edition: ${new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'America/Toronto' })}. Every place link opens live directions and current hours in Google Maps.`,
        64, doc.page.height - 150, { width: W });
    doc.fontSize(9.5)
      .text('DayHop · Richmond Hill, Ontario, Canada · dayhop.quest · admin@dayhop.quest', 64, doc.page.height - 100, { width: W });

    // ---------- intro / how to use ----------
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(22).fill(INK).text('Before you head out', { width: W });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11.5).fill(INK_SOFT).text(c.intro, { width: W, lineGap: 2 });
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fill(INK).text('How this guide works', { width: W });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10.5).fill(INK_SOFT).text(
      'Every entry tells you why it earns a spot, the season or time it shines, who it suits, what it costs, and one tip locals know. ' +
      'Names are tappable — each links to the place in Google Maps for live directions, hours, and closures. ' +
      'Cost markers: FREE, $ (under ~$10/person), $$ (~$10–25), $$$ (day-trip money). ' +
      'Details like fees and gate hours drift over the seasons; the link is always the source of truth.', { width: W, lineGap: 2 });

    // ---------- seasonal calendar ----------
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(16).fill(INK).text('The year at a glance', { width: W });
    doc.moveDown(0.4);
    for (const s of c.seasons) {
      doc.font('Helvetica-Bold').fontSize(11.5).fill(MOSS).text(s.label, { width: W });
      doc.font('Helvetica').fontSize(10.5).fill(INK_SOFT).text(s.text, { width: W, lineGap: 1.5 });
      doc.moveDown(0.45);
    }

    // ---------- spots ----------
    const renderSpots = (label, blurb, spots) => {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(22).fill(INK).text(label, { width: W });
      doc.font('Helvetica').fontSize(11).fill(MOSS).text(blurb, { width: W });
      doc.moveDown(0.8);
      for (const sp of spots) {
        const bodyH =
          doc.heightOfString(sp.name, { width: W }) +
          doc.heightOfString(sp.why, { width: W }) +
          (sp.tip ? doc.heightOfString(sp.tip, { width: W }) : 0) + 64;
        if (doc.y + bodyH > doc.page.height - doc.page.margins.bottom) doc.addPage();

        const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sp.maps || sp.name)}`;
        doc.font('Helvetica-Bold').fontSize(13.5).fill(INK).text(sp.name, { width: W, link });
        doc.font('Helvetica').fontSize(9).fill(INK_SOFT).text(sp.area, { width: W });
        doc.moveDown(0.18);
        doc.font('Helvetica').fontSize(10.5).fill(INK_SOFT).text(sp.why, { width: W, lineGap: 1.5 });
        if (sp.tip) {
          doc.moveDown(0.15);
          doc.font('Helvetica-Oblique').fontSize(10).fill(MOSS).text(`Local tip: ${sp.tip}`, { width: W, lineGap: 1 });
        }
        doc.moveDown(0.15);
        const chips = [sp.cost, sp.ages, sp.best].filter(Boolean).join('   ·   ');
        if (chips) doc.font('Helvetica-Bold').fontSize(8.5).fill(CORAL).text(chips, { width: W });
        doc.moveDown(0.7);
      }
    };
    renderSpots('The places', `${c.spots.length} spots, roughly north to south — each one worth a morning on its own.`, c.spots);
    if (c.drives && c.drives.length) {
      renderSpots('Worth the short drive', 'Just past the city line, and worth the extra minutes on the road.', c.drives);
    }

    // ---------- itineraries ----------
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(22).fill(INK).text('Ready-made days', { width: W });
    doc.font('Helvetica').fontSize(11).fill(MOSS).text('Proven combinations — follow them as written or swap any stop.', { width: W });
    doc.moveDown(0.8);
    for (const it of c.itineraries) {
      const itH = doc.heightOfString(it.title, { width: W }) +
        it.steps.reduce((h, s) => h + doc.heightOfString(s, { width: W - 16 }) + 8, 0) + 60;
      if (doc.y + itH > doc.page.height - doc.page.margins.bottom) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).fill(INK).text(it.title, { width: W });
      if (it.blurb) doc.font('Helvetica').fontSize(10).fill(INK_SOFT).text(it.blurb, { width: W });
      doc.moveDown(0.3);
      for (const step of it.steps) {
        doc.font('Helvetica').fontSize(10.5).fill(INK_SOFT).text(`—  ${step}`, { width: W - 16, indent: 0, lineGap: 1.5 });
        doc.moveDown(0.15);
      }
      doc.moveDown(0.6);
    }

    // ---------- etiquette + back page ----------
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(18).fill(INK).text('Trail sense', { width: W });
    doc.moveDown(0.4);
    for (const line of ETIQUETTE) {
      doc.font('Helvetica').fontSize(10.5).fill(INK_SOFT).text(`—  ${line}`, { width: W, lineGap: 1.5 });
      doc.moveDown(0.25);
    }
    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(16).fill(INK).text('Turn any page of this guide into a planned day', { width: W });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11).fill(INK_SOFT).text(
      'Tell the DayHop planner what kind of day you want, in one sentence — it builds the itinerary with real venues, timing, and live weather. Government weather and safety advisories included, never faked.', { width: W, lineGap: 2 });
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(12.5).fill(CORAL).text('dayhop.quest', { link: 'https://dayhop-v2.onrender.com/', width: W });
    doc.moveDown(1.6);
    doc.font('Helvetica').fontSize(8.5).fill(INK_SOFT).text(
      `© ${new Date().getFullYear()} DayHop. Licensed for personal use — please don't redistribute; it's how a very small team keeps making these. ` +
      'Purchased guides include free updated editions: re-download from your receipt link any time. Questions or a spot that changed? admin@dayhop.quest', { width: W, lineGap: 1.5 });

    // Page numbers (skip cover).
    const range = doc.bufferedPageRange();
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8.5).fill(INK_SOFT)
        .text(`${guide.title} — ${i + 1}`, 64, doc.page.height - 42, { width: W, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

async function getPdf(slug) {
  const guide = bySlug(slug);
  if (!guide || guide.status !== 'live') return null;
  const hit = pdfCache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.buffer;
  const buffer = await buildGuidePdf(guide);
  pdfCache.set(slug, { buffer, at: Date.now() });
  console.log(`[city-guides] built ${slug}: ${(buffer.length / 1024).toFixed(0)} KB`);
  return buffer;
}

// ---------- fulfillment ----------
// Called from the Stripe webhook on checkout.session.completed (mode:
// 'payment' + metadata.guide). Never throws — Stripe must get its 2xx; a
// failed email can be recovered from the claim endpoint or a manual resend.

async function fulfillPurchase(session) {
  const slug = session.metadata && session.metadata.guide;
  const guide = bySlug(slug);
  if (!guide) return `guide purchase with unknown slug "${slug}" (ignored)`;
  const to = (session.customer_details && session.customer_details.email) || session.customer_email || null;

  analytics.recordEvent({
    type: 'guide_purchase',
    ownerKey: session.client_reference_id || 'anon',
    meta: { guide: slug, amount_cents: session.amount_total || PRICE_CENTS }
  });

  if (!to) return `guide ${slug} purchased but session has no email (claim link still works)`;
  try {
    const token = signToken(slug);
    const origin = process.env.PUBLIC_ORIGIN || 'https://dayhop-v2.onrender.com';
    const link = `${origin}/api/cityguides/download?t=${token}`;
    const pdf = await getPdf(slug).catch(() => null);
    const result = await email.sendEmail({
      to,
      subject: `Your ${guide.title} is here 🌲`,
      html:
        `<p>Thank you! Your copy of <strong>${guide.title}</strong> is attached.</p>` +
        `<p>It's also yours to re-download for the next ${TOKEN_DAYS} days (fresh editions included): ` +
        `<a href="${link}">download the guide</a>.</p>` +
        '<p>Every place name in the PDF links straight to live directions and hours. ' +
        'If a spot has changed on the ground, tell us — admin@dayhop.quest — and we\'ll fix the next edition.</p>' +
        '<p>— DayHop, Richmond Hill, Ontario</p>',
      text:
        `Thank you! Your copy of ${guide.title} is attached.\n\n` +
        `Re-download any time in the next ${TOKEN_DAYS} days: ${link}\n\n` +
        'If a spot has changed on the ground, tell us: admin@dayhop.quest\n— DayHop',
      attachments: pdf ? [{ filename: `DayHop-${slug}-nature-guide.pdf`, content: pdf }] : undefined
    });
    return `guide ${slug} fulfilled → ${to} (email ${result.sent ? 'sent' : `FAILED: ${result.reason}`})`;
  } catch (err) {
    console.error('[city-guides] fulfillment error:', err.message);
    return `guide ${slug} fulfillment errored: ${err.message}`;
  }
}

module.exports = {
  GUIDES, PRICE_CENTS, CURRENCY,
  list, bySlug, matchCity,
  signToken, verifyToken,
  getPdf, fulfillPurchase
};
