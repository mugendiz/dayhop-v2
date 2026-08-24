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

// The anchor product: every live guide in one purchase, priced so a single
// $20 guide reads as the sampler. Sold through the same checkout/fulfill
// path under this pseudo-slug.
const BUNDLE = {
  slug: 'ontario-collection',
  title: 'The Complete Ontario Collection',
  subtitle: 'All six guides — every trail, lookout, waterway, and fishing spot we\'ve field-checked, in one library.',
  price_cents: 5900
};

// Brand palette (mirrors playbookPdf.js / the web shell).
const INK = '#102A2E';
const INK_SOFT = '#41585C';
const CORAL = '#E1502F';
const MOSS = '#3F6F5C';
const PAPER = '#FBF7EE';
const PAPER_DIM = '#F2ECDC';

function signingSecret() {
  const s = process.env.GUIDE_DOWNLOAD_SECRET || process.env.ADMIN_KEY;
  if (!s) throw new Error('No GUIDE_DOWNLOAD_SECRET or ADMIN_KEY set — cannot sign download links.');
  return s;
}

function list() {
  const liveCount = GUIDES.filter(g => g.status === 'live').length;
  const bundleEntry = {
    slug: BUNDLE.slug,
    title: BUNDLE.title,
    subtitle: BUNDLE.subtitle,
    status: 'live',
    type: 'bundle',
    includes: liveCount,
    price: BUNDLE.price_cents / 100,
    currency: CURRENCY.toUpperCase()
  };
  return [bundleEntry].concat(GUIDES.map(g => ({
    slug: g.slug,
    title: g.title,
    subtitle: g.subtitle,
    status: g.status,
    city_keys: g.city_keys,
    price: PRICE_CENTS / 100,
    currency: CURRENCY.toUpperCase(),
    spot_count: g.status === 'live' ? countSpots(g) : null
  })));
}

function bySlug(slug) {
  return GUIDES.find(g => g.slug === slug) || null;
}

const SECTION_KEYS = ['spots', 'drives', 'trails', 'views', 'waters', 'fishing'];

function countSpots(g) {
  const c = g.content();
  return SECTION_KEYS.reduce((n, k) => n + (Array.isArray(c[k]) ? c[k].length : 0), 0);
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

// ---------- PDF build: "Quiet Cartography" ----------
// The design system lives in docs/design/guide-pdf-philosophy.md. Short
// version: topographic-map and park-signage language — a per-city contour
// motif built from repeated thin moss lines, exactly one coral gesture per
// composition, National Park lettering for display, Crimson for reading
// text, coordinates and tiny reference markers as page furniture.

const path = require('path');
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const pdfCache = new Map(); // slug -> { buffer, at }

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');

// Logical font names → registered TTFs, with built-in fallbacks so a
// missing asset degrades the typography, never the sale.
function registerFonts(doc) {
  try {
    doc.registerFont('Display', path.join(FONT_DIR, 'NationalPark-Bold.ttf'));
    doc.registerFont('DisplayLight', path.join(FONT_DIR, 'NationalPark-Regular.ttf'));
    doc.registerFont('Body', path.join(FONT_DIR, 'CrimsonPro-Regular.ttf'));
    doc.registerFont('BodyItalic', path.join(FONT_DIR, 'CrimsonPro-Italic.ttf'));
    doc.registerFont('BodyBold', path.join(FONT_DIR, 'CrimsonPro-Bold.ttf'));
    return { display: 'Display', displayLight: 'DisplayLight', body: 'Body', bodyItalic: 'BodyItalic', bodyBold: 'BodyBold' };
  } catch (err) {
    console.warn('[city-guides] fonts unavailable, falling back to Helvetica:', err.message);
    return { display: 'Helvetica-Bold', displayLight: 'Helvetica', body: 'Helvetica', bodyItalic: 'Helvetica-Oblique', bodyBold: 'Helvetica-Bold' };
  }
}

// Deterministic per-slug randomness — same guide, same art, every build.
function makeRng(slug) {
  let s = 2166136261;
  for (const ch of slug) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  s = s >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Each motif is the city's geography abstracted — never labeled, just felt.
// All draw inside the clipped field (y 395–745) with moss lines and one
// coral gesture.
const MOTIFS = {
  // The Rouge's meander terraces: stacked flowing bands.
  markham(doc, r) {
    for (let i = 0; i < 13; i++) {
      const y = 415 + i * 25;
      const amp = 8 + r() * 12;
      const coral = i === 7;
      let px = -12, py = y + (r() - 0.5) * 6;
      doc.moveTo(px, py);
      for (let x = 56; x <= 680; x += 68) {
        const ny = y + (r() - 0.5) * amp;
        doc.bezierCurveTo(px + 22, py - amp, x - 22, ny + amp, x, ny);
        px = x; py = ny;
      }
      doc.lineWidth(coral ? 1.4 : 0.7).stroke(coral ? CORAL : MOSS);
    }
  },
  // Kettle-lake contours on the moraine: drifting nested rings.
  'richmond-hill'(doc, r) {
    const clusters = [
      { cx: 235, cy: 565, n: 15, base: 13 },
      { cx: 455, cy: 468, n: 8, base: 10 },
      { cx: 468, cy: 668, n: 6, base: 9 }
    ];
    for (const cl of clusters) {
      let rw = cl.base, cx = cl.cx, cy = cl.cy;
      for (let i = 0; i < cl.n; i++) {
        doc.ellipse(cx, cy, rw, rw * (0.55 + r() * 0.12)).lineWidth(0.7).stroke(MOSS);
        rw += 9 + r() * 5;
        cx += (r() - 0.5) * 8;
        cy += (r() - 0.5) * 6;
      }
    }
    doc.circle(235, 565, 3.4).lineWidth(1.5).stroke(CORAL);
  },
  // The Nokiidaa: one river spine, boardwalk ticks crossing it.
  newmarket(doc, r) {
    let x = 268, y = 402;
    const pts = [];
    doc.moveTo(x, y);
    while (y < 738) {
      const ny = y + 30;
      const nx = 268 + Math.sin((ny - 402) / 52) * 52 + (r() - 0.5) * 10;
      doc.bezierCurveTo(x + (r() - 0.5) * 14, y + 15, nx + (r() - 0.5) * 14, ny - 15, nx, ny);
      pts.push([nx, ny]);
      x = nx; y = ny;
    }
    doc.lineWidth(1.7).stroke(MOSS);
    pts.forEach((p, i) => {
      doc.moveTo(p[0] - 15, p[1]).lineTo(p[0] + 15, p[1])
        .lineWidth(i === 4 ? 1.4 : 0.7).stroke(i === 4 ? CORAL : MOSS);
    });
  },
  // Ravines cutting down to the lake; one low sun.
  toronto(doc, r) {
    for (const bx of [88, 198, 330, 452, 546]) {
      let x = bx, y = 402;
      doc.moveTo(x, y);
      while (y < 638) {
        const ny = y + 38 + r() * 22;
        x += (306 - x) * 0.16 + (r() - 0.5) * 26;
        doc.lineTo(x, ny);
        y = ny;
      }
      doc.lineWidth(0.8).stroke(MOSS);
    }
    for (let i = 0; i < 7; i++) {
      const y = 658 + i * 12;
      doc.moveTo(44, y).lineTo(568, y).lineWidth(0.7).stroke(MOSS);
    }
    doc.circle(497, 452, 15).lineWidth(1.5).stroke(CORAL);
  },
  // The escarpment brow and its hundred falls, pooling below.
  hamilton(doc, r) {
    doc.moveTo(56, 468).lineTo(556, 468).lineWidth(1.5).stroke(MOSS);
    for (let i = 0; i < 18; i++) {
      const x = 88 + i * 25 + (r() - 0.5) * 8;
      const len = 55 + r() * 135;
      const coral = i === 9;
      doc.moveTo(x, 471)
        .bezierCurveTo(x - 2.5, 471 + len * 0.4, x + 2.5, 471 + len * 0.75, x, 471 + len)
        .lineWidth(coral ? 1.4 : 0.7).stroke(coral ? CORAL : MOSS);
    }
    for (let i = 0; i < 3; i++) {
      const y = 688 + i * 11;
      doc.moveTo(120, y).lineTo(492, y).lineWidth(0.7).stroke(MOSS);
    }
  },
  // The lake as a disc of ruled water; one coral bay on the rim.
  'lake-simcoe'(doc, r) {
    const cx = 306, cy = 568, R = 150;
    doc.circle(cx, cy, R).lineWidth(1.5).stroke(MOSS);
    doc.save();
    doc.circle(cx, cy, R - 7).clip();
    for (let y = cy - R; y <= cy + R; y += 13) {
      let px = cx - R - 10, py = y + (r() - 0.5) * 2;
      doc.moveTo(px, py);
      for (let x = px + 40; x <= cx + R + 20; x += 40) {
        const ny = y + (r() - 0.5) * 3;
        doc.bezierCurveTo(px + 13, py - 2.5, x - 13, ny + 2.5, x, ny);
        px = x; py = ny;
      }
      doc.lineWidth(0.6).stroke(MOSS);
    }
    doc.restore();
    const a1 = -Math.PI / 3, a2 = -Math.PI / 6;
    doc.path(
      `M ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)} ` +
      `A ${R} ${R} 0 0 1 ${cx + R * Math.cos(a2)} ${cy + R * Math.sin(a2)}`
    ).lineWidth(1.8).stroke(CORAL);
  }
};

const ETIQUETTE = [
  'Stay on marked trails — shortcuts erode banks and trample the understory that makes these places worth visiting.',
  'Pack out everything you pack in, including fruit peels and dog bags. Bins at trailheads fill fast on weekends.',
  'Dogs on leash unless a sign says otherwise — for wildlife, other visitors, and your dog near water and cliff edges.',
  'Conditions change: trails flood in spring, close after storms, and ice over silently in shoulder season. If a barrier is up, it is up for a reason.',
  'Paid or reservation-gated sites change their rules seasonally — check the official page before a long drive.'
];

// ---------- photography (Wikimedia Commons, openly licensed) ----------
// Fetched + hand-curated by scripts/fetch-guide-photos.js; credits.json is
// the attribution ledger and every used credit prints on the back page.
const fs = require('fs');
const PHOTO_DIR = path.join(__dirname, '..', 'assets', 'photos');
let _photoCredits = null;
function photoCredits() {
  if (_photoCredits) return _photoCredits;
  try {
    _photoCredits = JSON.parse(fs.readFileSync(path.join(PHOTO_DIR, 'credits.json'), 'utf8'));
  } catch (e) { _photoCredits = {}; }
  return _photoCredits;
}
function loadPhoto(key) {
  try {
    const buffer = fs.readFileSync(path.join(PHOTO_DIR, `${key}.jpg`));
    return { buffer, credit: photoCredits()[key] || null };
  } catch (e) { return null; }
}
function creditLine(credit) {
  if (!credit) return 'WIKIMEDIA COMMONS';
  const lic = String(credit.license || '').toUpperCase();
  return `PHOTO: ${String(credit.author || 'UNKNOWN').toUpperCase()} · ${lic} · WIKIMEDIA COMMONS`;
}

// pdfkit's `cover` scales but does NOT clip — the spill must be fenced.
function photoBand(doc, buffer, x, y, w, h) {
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.image(buffer, x, y, { cover: [w, h], align: 'center', valign: 'center' });
  doc.restore();
}

// Section label → photo-key suffix. Each opener looks for
// assets/photos/<slug>-<suffix>.jpg and renders without a band when the
// curation didn't find a worthy image (quality over completeness).
const SECTION_PHOTO_KEYS = {
  'The places': 'places',
  'On the trail': 'trails',
  'Worth the climb': 'views',
  'On the water': 'waters',
  'Casting lines': 'fishing'
};

// ---------- locator mini map ----------
// A stylized-but-true Southern Ontario locator drawn in the Quiet
// Cartography language: ink shoreline, ruled moss water, one coral stake
// on the guide's city. Real coordinates, simplified shorelines.
const MAP_BOUNDS = { lonW: -80.35, lonE: -78.55, latS: 43.05, latN: 44.75 };
// North shore of Lake Ontario, west to east (lat, lon) — runs frame edge
// to frame edge so the ruled water reads as one continuous lake.
const ONTARIO_SHORE = [
  [43.10, -80.35], [43.14, -80.15], [43.20, -79.95], [43.26, -79.87],
  [43.30, -79.79], [43.39, -79.67], [43.47, -79.62], [43.55, -79.57],
  [43.60, -79.50], [43.63, -79.45], [43.64, -79.36], [43.70, -79.23],
  [43.76, -79.13], [43.81, -79.02], [43.85, -78.92], [43.87, -78.80],
  [43.90, -78.65], [43.92, -78.55]
];
// Lake Simcoe outline, clockwise from the north (lat, lon): the main body
// with Cook's Bay reaching south and Kempenfelt Bay poking west at Barrie.
const SIMCOE_SHORE = [
  [44.60, -79.42], [44.56, -79.30], [44.46, -79.22], [44.34, -79.24],
  [44.27, -79.36], [44.19, -79.48], [44.16, -79.53], [44.23, -79.54],
  [44.31, -79.51], [44.36, -79.55], [44.38, -79.68], [44.43, -79.61],
  [44.50, -79.55], [44.56, -79.50]
];

function parseCoords(str) {
  const m = /([\d.]+)°\s*N\s*·\s*([\d.]+)°\s*W/.exec(String(str || ''));
  return m ? { lat: Number(m[1]), lon: -Number(m[2]) } : null;
}

function drawLocatorMap(doc, guide, F, x, y, w, h) {
  const B = MAP_BOUNDS;
  const px = (lon) => x + ((lon - B.lonW) / (B.lonE - B.lonW)) * w;
  const py = (lat) => y + ((B.latN - lat) / (B.latN - B.latS)) * h;
  const here = parseCoords(guide.coords);
  if (!here || here.lon < B.lonW || here.lon > B.lonE || here.lat < B.latS || here.lat > B.latN) return false;

  // Frame
  doc.rect(x, y, w, h).lineWidth(0.8).stroke(MOSS);

  // Lake Ontario: shoreline + ruled water below it.
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.moveTo(px(ONTARIO_SHORE[0][1]), py(ONTARIO_SHORE[0][0]));
  for (const [lat, lon] of ONTARIO_SHORE.slice(1)) doc.lineTo(px(lon), py(lat));
  doc.lineWidth(1.2).stroke(INK);
  doc.save();
  // Water polygon: shoreline down to the frame bottom.
  doc.moveTo(px(ONTARIO_SHORE[0][1]), py(ONTARIO_SHORE[0][0]));
  for (const [lat, lon] of ONTARIO_SHORE.slice(1)) doc.lineTo(px(lon), py(lat));
  doc.lineTo(x + w, y + h).lineTo(x, y + h).closePath().clip();
  for (let ly = y + 8; ly < y + h; ly += 7) {
    doc.moveTo(x, ly).lineTo(x + w, ly).lineWidth(0.45).stroke(MOSS);
  }
  doc.restore();

  // Lake Simcoe: closed blob, same ruled water.
  doc.save();
  doc.moveTo(px(SIMCOE_SHORE[0][1]), py(SIMCOE_SHORE[0][0]));
  for (const [lat, lon] of SIMCOE_SHORE.slice(1)) doc.lineTo(px(lon), py(lat));
  doc.closePath();
  doc.lineWidth(1.1).stroke(INK);
  doc.moveTo(px(SIMCOE_SHORE[0][1]), py(SIMCOE_SHORE[0][0]));
  for (const [lat, lon] of SIMCOE_SHORE.slice(1)) doc.lineTo(px(lon), py(lat));
  doc.closePath().clip();
  for (let ly = y; ly < y + h; ly += 7) {
    doc.moveTo(x, ly).lineTo(x + w, ly).lineWidth(0.45).stroke(MOSS);
  }
  doc.restore();

  // Sister cities as quiet moss dots; the guide's city as the coral stake.
  for (const g of GUIDES) {
    if (g.status !== 'live' || g.slug === guide.slug) continue;
    const p = parseCoords(g.coords);
    if (!p) continue;
    doc.circle(px(p.lon), py(p.lat), 1.7).fill(MOSS);
  }
  doc.circle(px(here.lon), py(here.lat), 3.2).fill(CORAL);
  doc.circle(px(here.lon), py(here.lat), 6.2).lineWidth(1).stroke(CORAL);
  doc.restore();

  // Labels: the city (display), the lakes (whisper), the caption.
  const cx = px(here.lon), cy = py(here.lat);
  const labelLeft = cx > x + w - 110;
  doc.font(F.display).fontSize(8.5).fillColor(INK)
    .text(guide.title.replace(/ (Nature Guide|City Nature Spots)$/, '').toUpperCase(),
      labelLeft ? cx - 130 : cx + 11, cy - 4,
      { width: 120, align: labelLeft ? 'right' : 'left', characterSpacing: 1.2, lineBreak: false });
  doc.font(F.displayLight).fontSize(6.5).fillColor(INK_SOFT)
    .text('LAKE ONTARIO', x + w * 0.42, y + h - 24, { characterSpacing: 2, lineBreak: false })
    .text('LAKE SIMCOE', px(-79.44) - 24, py(44.42) - 3, { characterSpacing: 1.6, lineBreak: false });
  return true;
}

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

    const F = registerFonts(doc);
    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const total = SECTION_KEYS.reduce((n, k) => n + (Array.isArray(c[k]) ? c[k].length : 0), 0);
    const rng = makeRng(guide.slug);
    const usedPhotos = [];
    // Real AcroForm checkboxes — clickable and saveable in any PDF reader,
    // printed as an empty square on paper. One per entry: the been-there
    // ledger that turns a reading product into a using product.
    doc.initForm();

    // Every page stands on brand paper, never printer-white.
    doc.on('pageAdded', () => {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAPER);
    });

    // A short moss rule — the system's recurring gesture.
    const rule = (x, y, w, color = MOSS) =>
      doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.8).stroke(color);

    // ---------- cover ----------
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAPER);
    doc.lineCap('round');

    doc.font(F.displayLight).fontSize(9.5).fillColor(INK_SOFT)
      .text('DAYHOP · FIELD GUIDE', 64, 76, { characterSpacing: 3.2 });
    rule(64, 96, 118);

    doc.font(F.display).fontSize(37).fillColor(INK)
      .text(guide.title.toUpperCase(), 64, 122, { width: W, characterSpacing: 0.6, lineGap: 4 });
    doc.moveDown(0.45);
    doc.font(F.bodyItalic).fontSize(13.5).fillColor(INK_SOFT)
      .text(guide.subtitle, { width: W - 60, lineGap: 2 });
    doc.moveDown(0.9);
    doc.font(F.display).fontSize(9.5).fillColor(MOSS)
      .text(`${total} PLACES · ${c.itineraries.length} DAY PLANS · FOUR SEASONS`, { characterSpacing: 2.2 });
    doc.moveDown(0.55);
    doc.font(F.displayLight).fontSize(8).fillColor(INK_SOFT)
      .text(`${guide.coords || ''}   ·   FIELD-CHECKED EDITION · ${new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'America/Toronto' }).toUpperCase()}`,
        { characterSpacing: 1.8 });

    // The city's geography, abstracted — clipped to its field so nothing
    // ever touches the footer.
    doc.save();
    doc.rect(0, 395, doc.page.width, 350).clip();
    (MOTIFS[guide.slug] || MOTIFS.markham)(doc, rng);
    doc.restore();

    // Text below the bottom margin makes pdfkit spawn a page — suspend the
    // margin while placing the cover footer.
    const mb = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(F.displayLight).fontSize(7).fillColor(INK_SOFT)
      .text('DAYHOP · RICHMOND HILL, ONTARIO · DAYHOP.QUEST · ADMIN@DAYHOP.QUEST', 64, 758,
        { width: W, align: 'center', characterSpacing: 1.6, lineBreak: false });
    doc.page.margins.bottom = mb;

    // ---------- frontispiece: the place itself, then the map ----------
    const hero = loadPhoto(`${guide.slug}-hero`);
    doc.addPage();
    if (hero) {
      usedPhotos.push(hero.credit);
      photoBand(doc, hero.buffer, 0, 0, doc.page.width, 316);
      doc.font(F.displayLight).fontSize(6.5).fillColor(INK_SOFT)
        .text(creditLine(hero.credit), 64, 326, { width: W, characterSpacing: 1.4, lineBreak: false });
    }
    const mapTop = hero ? 372 : 96;
    doc.font(F.display).fontSize(13).fillColor(INK)
      .text('WHERE THIS GUIDE LIVES', 64, mapTop, { characterSpacing: 1.8 });
    rule(64, doc.y + 6, 118);
    if (drawLocatorMap(doc, guide, F, 64, mapTop + 30, W, 280)) {
      doc.font(F.displayLight).fontSize(7.5).fillColor(INK_SOFT)
        .text(`SOUTHERN ONTARIO · ${(guide.coords || '').toUpperCase()} · MOSS DOTS MARK THE OTHER DAYHOP GUIDES`,
          64, mapTop + 30 + 280 + 10, { width: W, characterSpacing: 1.4, lineBreak: false });
    }

    // ---------- "If you only have…" ----------
    // Travellers buy guides with a checkout time looming — serve the
    // time-budgeted reader before the completionist.
    if (Array.isArray(c.quick) && c.quick.length) {
      doc.addPage();
      doc.font(F.display).fontSize(20).fillColor(INK)
        .text('IF YOU ONLY HAVE…', 64, 72, { characterSpacing: 1.6 });
      rule(64, doc.y + 8, 118);
      doc.y += 20;
      doc.font(F.bodyItalic).fontSize(11.5).fillColor(MOSS)
        .text('Four ready answers for four sizes of day — every stop is covered in depth later in the guide.', 64, doc.y, { width: W - 40, lineGap: 2 });
      doc.moveDown(1.1);
      for (const q of c.quick) {
        doc.font(F.display).fontSize(13).fillColor(CORAL)
          .text(q.have.toUpperCase(), 64, doc.y, { characterSpacing: 1.4 });
        doc.moveDown(0.2);
        doc.font(F.body).fontSize(11).fillColor(INK_SOFT).text(q.plan, { width: W, lineGap: 2.2 });
        doc.moveDown(0.95);
      }
    }

    // Section opener: letterspaced display over a short rule, blurb in the
    // notebook voice, and — where assigned — the guide's second photograph.
    const opener = (label, blurb) => {
      doc.addPage();
      let top = 72;
      const photoKey = SECTION_PHOTO_KEYS[label];
      if (photoKey) {
        const ph = loadPhoto(`${guide.slug}-${photoKey}`);
        if (ph) {
          usedPhotos.push(ph.credit);
          photoBand(doc, ph.buffer, 0, 0, doc.page.width, 190);
          doc.font(F.displayLight).fontSize(6.5).fillColor(INK_SOFT)
            .text(creditLine(ph.credit), 64, 198, { width: W, characterSpacing: 1.4, lineBreak: false });
          top = 224;
        }
      }
      doc.font(F.display).fontSize(20).fillColor(INK)
        .text(label.toUpperCase(), 64, top, { width: W, characterSpacing: 1.6 });
      rule(64, doc.y + 8, 118);
      doc.y += 20;
      if (blurb) {
        doc.font(F.bodyItalic).fontSize(11.5).fillColor(MOSS).text(blurb, 64, doc.y, { width: W - 40, lineGap: 2 });
        doc.moveDown(0.9);
      }
    };

    // ---------- intro / how to use ----------
    opener('Before you head out');
    doc.font(F.body).fontSize(11.5).fillColor(INK_SOFT).text(c.intro, 64, doc.y, { width: W, lineGap: 2.5 });
    doc.moveDown(1);
    // "How it works" sits in a dim-paper panel — the page's one solid block.
    const HOW =
      'Every entry tells you why it earns a spot, the season or time it shines, who it suits, what it costs, and one tip locals know. ' +
      'Names are tappable — each links to the place in Google Maps for live directions, hours, and closures. ' +
      'Cost markers: FREE, $ (under ~$10/person), $$ (~$10–25), $$$ (day-trip money). ' +
      'The small square beside each name is a real checkbox — tick places off as you go and save the PDF; it remembers. ' +
      'Details like fees and gate hours drift over the seasons; the link is always the source of truth.';
    doc.font(F.body).fontSize(10.5);
    const howH = doc.heightOfString(HOW, { width: W - 36, lineGap: 2 });
    const panelY = doc.y;
    doc.roundedRect(64, panelY, W, howH + 54, 8).fill(PAPER_DIM);
    doc.font(F.display).fontSize(10).fillColor(MOSS)
      .text('HOW THIS GUIDE WORKS', 82, panelY + 15, { characterSpacing: 2 });
    doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT)
      .text(HOW, 82, doc.y + 6, { width: W - 36, lineGap: 2 });
    doc.y = panelY + howH + 62;

    // ---------- seasonal calendar ----------
    doc.moveDown(1.1);
    doc.font(F.display).fontSize(14).fillColor(INK).text('THE YEAR AT A GLANCE', { characterSpacing: 1.8 });
    rule(64, doc.y + 6, 118);
    doc.y += 16;
    for (const s of c.seasons) {
      doc.font(F.display).fontSize(10).fillColor(MOSS).text(s.label.toUpperCase(), 64, doc.y, { characterSpacing: 1.5 });
      doc.moveDown(0.15);
      doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(s.text, { width: W, lineGap: 1.8 });
      doc.moveDown(0.5);
    }

    // ---------- spots ----------
    let spotNo = 0;
    const renderSpots = (label, blurb, spots) => {
      opener(label, blurb);
      for (const sp of spots) {
        spotNo++;
        doc.font(F.body).fontSize(10.5);
        const bodyH =
          doc.heightOfString(sp.why, { width: W }) +
          (sp.tip ? doc.heightOfString(sp.tip, { width: W }) : 0) + 78 +
          (sp.access ? 14 : 0);
        if (doc.y + bodyH > doc.page.height - doc.page.margins.bottom) doc.addPage();

        const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sp.maps || sp.name)}`;
        // Reference marker line: coral number, then the surveyed location.
        doc.font(F.displayLight).fontSize(7.5).fillColor(CORAL)
          .text(String(spotNo).padStart(2, '0'), 64, doc.y, { characterSpacing: 1.5, continued: true })
          .fillColor(INK_SOFT)
          .text('  ·  ' + sp.area.toUpperCase(), { characterSpacing: 1.5 });
        doc.moveDown(0.12);
        // Been-there checkbox in the left margin, riding the name line. A
        // static square is drawn first so viewers that skip widget
        // appearances (and paper) still show the box; the interactive
        // field sits exactly on top of it.
        doc.rect(44, doc.y + 2, 11, 11).lineWidth(0.9).stroke(MOSS);
        try {
          doc.formCheckbox(`been-${guide.slug}-${spotNo}`, 44, doc.y + 2, 11, 11, {
            borderColor: MOSS, backgroundColor: PAPER
          });
        } catch (e) { /* a reader without form support still sees the square */ }
        doc.font(F.display).fontSize(13.5).fillColor(INK).text(sp.name, 64, doc.y, { width: W, link });
        doc.moveDown(0.16);
        doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(sp.why, { width: W, lineGap: 1.8 });
        if (sp.tip) {
          doc.moveDown(0.15);
          doc.font(F.bodyItalic).fontSize(10).fillColor(MOSS).text(`Local tip: ${sp.tip}`, { width: W, lineGap: 1.4 });
        }
        doc.moveDown(0.18);
        const chips = [sp.route, sp.cost, sp.ages, sp.best].filter(Boolean).join('  ·  ');
        if (chips) doc.font(F.display).fontSize(7.5).fillColor(CORAL).text(chips.toUpperCase(), { characterSpacing: 1.2 });
        // The logistics line — parking, transit, facilities, footing — in
        // quiet moss under the coral chips.
        if (sp.access) {
          doc.moveDown(0.08);
          doc.font(F.displayLight).fontSize(7.5).fillColor(MOSS).text(sp.access.toUpperCase(), { characterSpacing: 1.1 });
        }
        doc.moveDown(0.85);
      }
    };
    renderSpots('The places', `${c.spots.length} spots, roughly north to south — each one worth a morning on its own.`, c.spots);
    if (c.drives && c.drives.length) {
      renderSpots('Worth the short drive', 'Just past the city line, and worth the extra minutes on the road.', c.drives);
    }
    if (c.trails && c.trails.length) {
      renderSpots('On the trail', 'Hiking and biking routes — distances and surfaces in the markers, so you can match the route to the day.', c.trails);
    }
    if (c.views && c.views.length) {
      renderSpots('Worth the climb', 'The lookouts and long sightlines — where this landscape shows you what it is.', c.views);
    }
    if (c.waters && c.waters.length) {
      renderSpots('On the water', 'Paddle routes, river walks, and shorelines — the slow-moving side of the map.', c.waters);
    }
    if (c.fishing && c.fishing.length) {
      renderSpots('Casting lines',
        'Shore-accessible public fishing. An Ontario fishing licence (Outdoors Card) is required for most anglers, and seasons, limits, and sanctuaries are set per provincial zone — check ontario.ca before you cast.', c.fishing);
    }

    // ---------- itineraries ----------
    opener('Ready-made days', 'Proven combinations — follow them as written or swap any stop.');
    for (const it of c.itineraries) {
      doc.font(F.body).fontSize(10.5);
      const itH = it.steps.reduce((h, s) => h + doc.heightOfString(s, { width: W - 18 }) + 8, 0) + 70;
      if (doc.y + itH > doc.page.height - doc.page.margins.bottom) doc.addPage();
      doc.font(F.display).fontSize(13).fillColor(INK).text(it.title.toUpperCase(), 64, doc.y, { width: W, characterSpacing: 0.8 });
      if (it.blurb) {
        doc.moveDown(0.1);
        doc.font(F.bodyItalic).fontSize(10.5).fillColor(MOSS).text(it.blurb, { width: W });
      }
      doc.moveDown(0.35);
      for (const step of it.steps) {
        doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(`—  ${step}`, { width: W - 18, lineGap: 1.8 });
        doc.moveDown(0.18);
      }
      doc.moveDown(0.7);
    }

    // ---------- etiquette + back page ----------
    opener('Trail sense');
    for (const line of ETIQUETTE) {
      doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(`—  ${line}`, { width: W, lineGap: 1.8 });
      doc.moveDown(0.3);
    }
    doc.moveDown(1.4);
    doc.font(F.display).fontSize(14).fillColor(INK)
      .text('TURN ANY PAGE INTO A PLANNED DAY', { characterSpacing: 1.6 });
    rule(64, doc.y + 6, 118);
    doc.y += 16;
    doc.font(F.body).fontSize(11).fillColor(INK_SOFT).text(
      'Tell the DayHop planner what kind of day you want, in one sentence — it builds the itinerary with real venues, timing, and live weather. Government weather and safety advisories included, never faked.', 64, doc.y, { width: W, lineGap: 2 });
    doc.moveDown(0.5);
    doc.font(F.display).fontSize(11).fillColor(CORAL)
      .text('DAYHOP.QUEST', { link: 'https://dayhop-v2.onrender.com/', characterSpacing: 2 });
    doc.moveDown(1.8);
    doc.font(F.body).fontSize(8.5).fillColor(INK_SOFT).text(
      `© ${new Date().getFullYear()} DayHop. Licensed for personal use — please don't redistribute; it's how a very small team keeps making these. ` +
      'Purchased guides include free updated editions: re-download from your receipt link any time. Questions or a spot that changed? admin@dayhop.quest', { width: W, lineGap: 1.5 });

    // Photo attribution — the licenses require it, and the photographers
    // earned it.
    const credits = usedPhotos.filter(Boolean);
    if (credits.length) {
      doc.moveDown(0.9);
      doc.font(F.display).fontSize(8.5).fillColor(MOSS).text('PHOTOGRAPHY', { characterSpacing: 2 });
      doc.moveDown(0.25);
      for (const cr of credits) {
        doc.font(F.body).fontSize(8.5).fillColor(INK_SOFT).text(
          `${cr.author} — ${cr.license}, via Wikimedia Commons`,
          { width: W, lineGap: 1.2, link: cr.source || undefined });
      }
    }

    // Page furniture (skip cover): a centred hairline over the folio.
    const range = doc.bufferedPageRange();
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(i);
      const bm = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const cx = doc.page.width / 2;
      doc.moveTo(cx - 20, doc.page.height - 50).lineTo(cx + 20, doc.page.height - 50).lineWidth(0.6).stroke(MOSS);
      doc.font(F.displayLight).fontSize(7).fillColor(INK_SOFT)
        .text(`${guide.title.toUpperCase()} — ${i + 1}`, 64, doc.page.height - 42,
          { width: W, align: 'center', characterSpacing: 1.6, lineBreak: false });
      doc.page.margins.bottom = bm;
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

// ---------- free sampler ----------
// One favourite from each live guide, full design quality — the test
// drive. Gated behind the newsletter double opt-in (rides the welcome
// email beside the Playbook) and explicitly licensed to share.

let samplerCache = null; // { buffer, at }

function buildSamplerPdf() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 64, bottom: 64, left: 64, right: 64 },
      bufferPages: true,
      info: { Title: 'The DayHop Ontario Sampler', Author: 'DayHop' }
    });
    const chunks = [];
    doc.on('data', ch => chunks.push(ch));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.on('pageAdded', () => doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAPER));

    const F = registerFonts(doc);
    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAPER);
    doc.lineCap('round');

    doc.font(F.displayLight).fontSize(9.5).fillColor(INK_SOFT)
      .text('DAYHOP · FREE SAMPLER · SHARE THIS ONE FREELY', 64, 76, { characterSpacing: 3 });
    doc.moveTo(64, 96).lineTo(182, 96).lineWidth(0.8).stroke(MOSS);
    doc.font(F.display).fontSize(30).fillColor(INK)
      .text('ONE FAVOURITE FROM\nEACH CITY GUIDE', 64, 122, { width: W, characterSpacing: 0.6, lineGap: 4 });
    doc.moveDown(0.5);
    doc.font(F.bodyItalic).fontSize(12.5).fillColor(INK_SOFT)
      .text('Six field-checked places, exactly as they appear in the full guides — same depth, same honesty, same links to live directions.', { width: W - 60, lineGap: 2 });
    doc.moveDown(1.2);

    for (const g of GUIDES.filter(g => g.status === 'live')) {
      const sp = g.content().spots[0];
      doc.font(F.body).fontSize(10.5);
      const need = doc.heightOfString(sp.why, { width: W }) + 92;
      if (doc.y + need > doc.page.height - doc.page.margins.bottom) doc.addPage();
      doc.font(F.displayLight).fontSize(7.5).fillColor(CORAL)
        .text(`FROM THE ${g.title.toUpperCase()} · ${countSpots(g)} PLACES IN THE FULL GUIDE`, 64, doc.y, { characterSpacing: 1.4 });
      doc.moveDown(0.12);
      const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sp.maps || sp.name)}`;
      doc.font(F.display).fontSize(14).fillColor(INK).text(sp.name, { width: W, link });
      doc.moveDown(0.15);
      doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(sp.why, { width: W, lineGap: 1.8 });
      if (sp.tip) {
        doc.moveDown(0.12);
        doc.font(F.bodyItalic).fontSize(10).fillColor(MOSS).text(`Local tip: ${sp.tip}`, { width: W, lineGap: 1.4 });
      }
      doc.moveDown(0.9);
    }

    doc.moveDown(0.6);
    doc.font(F.display).fontSize(13).fillColor(INK)
      .text('THE FULL GUIDES', { characterSpacing: 1.8 });
    doc.moveTo(64, doc.y + 6).lineTo(182, doc.y + 6).lineWidth(0.8).stroke(MOSS);
    doc.y += 14;
    doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(
      'Each city guide carries 31–37 field-checked places — trails with distances and surfaces, lookouts, waterways, ' +
      'legal fishing spots, parking-and-washroom notes on every entry, ready-made day plans, and a season-by-season calendar. ' +
      'Free updated editions with every purchase.', { width: W, lineGap: 2 });
    doc.moveDown(0.4);
    doc.font(F.display).fontSize(11).fillColor(CORAL)
      .text('DAYHOP.QUEST/GUIDES', { link: 'https://dayhop-v2.onrender.com/guides', characterSpacing: 2 });
    doc.moveDown(1);
    doc.font(F.body).fontSize(8.5).fillColor(INK_SOFT).text(
      'This sampler is free to share — send it to anyone who\'d use it. The full guides are how a very small team keeps making them. · DayHop, Richmond Hill, Ontario', { width: W, lineGap: 1.4 });
    doc.end();
  });
}

async function getSamplerPdf() {
  if (samplerCache && Date.now() - samplerCache.at < CACHE_TTL_MS) return samplerCache.buffer;
  try {
    const buffer = await buildSamplerPdf();
    samplerCache = { buffer, at: Date.now() };
    console.log(`[city-guides] sampler built: ${(buffer.length / 1024).toFixed(0)} KB`);
    return buffer;
  } catch (err) {
    console.warn('[city-guides] sampler build failed:', err.message);
    return null;
  }
}

// ---------- fulfillment ----------
// Called from the Stripe webhook on checkout.session.completed (mode:
// 'payment' + metadata.guide). Never throws — Stripe must get its 2xx; a
// failed email can be recovered from the claim endpoint or a manual resend.

async function fulfillPurchase(session) {
  const slug = session.metadata && session.metadata.guide;
  const isBundle = slug === BUNDLE.slug;
  const guide = isBundle ? null : bySlug(slug);
  if (!isBundle && !guide) return `guide purchase with unknown slug "${slug}" (ignored)`;
  const to = (session.customer_details && session.customer_details.email) || session.customer_email || null;

  analytics.recordEvent({
    type: 'guide_purchase',
    ownerKey: session.client_reference_id || 'anon',
    meta: { guide: slug, amount_cents: session.amount_total || (isBundle ? BUNDLE.price_cents : PRICE_CENTS) }
  });

  if (!to) return `guide ${slug} purchased but session has no email (claim link still works)`;
  const origin = process.env.PUBLIC_ORIGIN || 'https://dayhop-v2.onrender.com';
  try {
    if (isBundle) {
      const live = GUIDES.filter(g => g.status === 'live');
      const rows = live.map(g => {
        const link = `${origin}/api/cityguides/download?t=${signToken(g.slug)}`;
        return { g, link };
      });
      const attachments = [];
      for (const { g } of rows) {
        const pdf = await getPdf(g.slug).catch(() => null);
        if (pdf) attachments.push({ filename: `DayHop-${g.slug}-nature-guide.pdf`, content: pdf });
      }
      const result = await email.sendEmail({
        to,
        subject: 'Your Complete Ontario Collection is here 🌲',
        html:
          '<p>Thank you! All six DayHop guides are attached, and each is yours to re-download for the next ' +
          `${TOKEN_DAYS} days (fresh editions included):</p><ul>` +
          rows.map(({ g, link }) => `<li><a href="${link}">${g.title}</a></li>`).join('') +
          '</ul><p>Every place name links straight to live directions and hours. ' +
          'A spot changed on the ground? Tell us — admin@dayhop.quest — and the next edition fixes it.</p>' +
          '<p>— DayHop, Richmond Hill, Ontario</p>',
        text:
          `Thank you! All six DayHop guides are attached. Re-download links (valid ${TOKEN_DAYS} days):\n\n` +
          rows.map(({ g, link }) => `${g.title}: ${link}`).join('\n') +
          '\n\nA spot changed? Tell us: admin@dayhop.quest\n— DayHop',
        attachments: attachments.length ? attachments : undefined
      });
      return `bundle fulfilled → ${to} (${attachments.length} PDFs, email ${result.sent ? 'sent' : `FAILED: ${result.reason}`})`;
    }

    const token = signToken(slug);
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
  GUIDES, BUNDLE, PRICE_CENTS, CURRENCY,
  list, bySlug, matchCity,
  signToken, verifyToken,
  getPdf, getSamplerPdf, fulfillPurchase
};
