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

const SECTION_KEYS = ['spots', 'drives', 'trails', 'views', 'waters', 'fishing', 'heritage'];

function countSpots(g) {
  // Unique places only: entries marked facetOf are another lens on a hub
  // entry, not a new place — counting them would inflate the honest number.
  const c = g.content();
  return SECTION_KEYS.reduce((n, k) =>
    n + (Array.isArray(c[k]) ? c[k].filter(s => !s.facetOf).length : 0), 0);
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
// missing asset degrades the typography, never the sale. Primary faces are
// the website's own brand type (Satoshi display / Inter body — the same
// faces the web shell speaks); National Park + Crimson remain the second
// rung, Helvetica the floor.
function registerFonts(doc) {
  const LADDER = [
    {
      display: 'Satoshi-Bold.ttf', displayLight: 'Satoshi-Medium.ttf',
      body: 'Inter-Regular.ttf', bodyItalic: 'Inter-Italic.ttf', bodyBold: 'Inter-Bold.ttf'
    },
    {
      display: 'NationalPark-Bold.ttf', displayLight: 'NationalPark-Regular.ttf',
      body: 'CrimsonPro-Regular.ttf', bodyItalic: 'CrimsonPro-Italic.ttf', bodyBold: 'CrimsonPro-Bold.ttf'
    }
  ];
  for (const rung of LADDER) {
    try {
      doc.registerFont('Display', path.join(FONT_DIR, rung.display));
      doc.registerFont('DisplayLight', path.join(FONT_DIR, rung.displayLight));
      doc.registerFont('Body', path.join(FONT_DIR, rung.body));
      doc.registerFont('BodyItalic', path.join(FONT_DIR, rung.bodyItalic));
      doc.registerFont('BodyBold', path.join(FONT_DIR, rung.bodyBold));
      return { display: 'Display', displayLight: 'DisplayLight', body: 'Body', bodyItalic: 'BodyItalic', bodyBold: 'BodyBold' };
    } catch (err) {
      console.warn(`[city-guides] font rung unavailable (${rung.display}):`, err.message);
    }
  }
  return { display: 'Helvetica-Bold', displayLight: 'Helvetica', body: 'Helvetica', bodyItalic: 'Helvetica-Oblique', bodyBold: 'Helvetica-Bold' };
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
  // Fold diacritics outside Latin-1 to their base letters — the display
  // face lacks glyphs like ǎ and would print tofu into a photographer's name.
  const author = String(credit.author || 'UNKNOWN')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return `PHOTO: ${author} · ${lic} · WIKIMEDIA COMMONS`;
}

// pdfkit's `cover` scales but does NOT clip — the spill must be fenced.
// `focal` ('top'|'center', from credits.json) keeps the subject in frame
// when the crop is tight.
function photoBand(doc, buffer, x, y, w, h, focal) {
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.image(buffer, x, y, { cover: [w, h], align: 'center', valign: focal === 'top' ? 'top' : 'center' });
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

// Smooth closed curve through projected points (quadratics via midpoints) —
// turns the surveyed polygon into a shoreline.
function smoothClosedPath(doc, pts) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[n - 1], pts[0]);
  doc.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const m2 = mid(pts[i], pts[(i + 1) % n]);
    doc.quadraticCurveTo(pts[i][0], pts[i][1], m2[0], m2[1]);
  }
  doc.closePath();
}

function drawLocatorMap(doc, guide, F, x, y, w, h) {
  const B = MAP_BOUNDS;
  const px = (lon) => x + ((lon - B.lonW) / (B.lonE - B.lonW)) * w;
  const py = (lat) => y + ((B.latN - lat) / (B.latN - B.latS)) * h;
  const here = parseCoords(guide.coords);
  if (!here || here.lon < B.lonW || here.lon > B.lonE || here.lat < B.latS || here.lat > B.latN) return false;

  // Frame + graticule ticks at every half degree — the survey's fingerprints.
  doc.rect(x, y, w, h).lineWidth(0.8).stroke(MOSS);
  for (let lon = Math.ceil(B.lonW * 2) / 2; lon <= B.lonE; lon += 0.5) {
    doc.moveTo(px(lon), y).lineTo(px(lon), y + 4).lineWidth(0.5).stroke(MOSS);
    doc.moveTo(px(lon), y + h).lineTo(px(lon), y + h - 4).lineWidth(0.5).stroke(MOSS);
  }
  for (let lat = Math.ceil(B.latS * 2) / 2; lat <= B.latN; lat += 0.5) {
    doc.moveTo(x, py(lat)).lineTo(x + 4, py(lat)).lineWidth(0.5).stroke(MOSS);
    doc.moveTo(x + w, py(lat)).lineTo(x + w - 4, py(lat)).lineWidth(0.5).stroke(MOSS);
  }

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

  // Lake Simcoe: smoothed shoreline, same ruled water.
  const simcoePts = SIMCOE_SHORE.map(([lat, lon]) => [px(lon), py(lat)]);
  doc.save();
  smoothClosedPath(doc, simcoePts);
  doc.lineWidth(1.1).stroke(INK);
  smoothClosedPath(doc, simcoePts);
  doc.clip();
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

// ---------- computed instruments: the sun clock ----------
// NOAA-simplified sunrise/sunset for the guide's own coordinates — computed,
// never looked up, like everything else on a surveyed page. Returns minutes
// UTC; formatting happens on the Toronto clock (DST-correct via Intl).
function sunMinutesUTC(lat, lon, y, m, d) {
  const rad = Math.PI / 180;
  const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const g = (2 * Math.PI / 365) * (N - 1 + 0.5);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHA = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl))
    - Math.tan(lat * rad) * Math.tan(decl);
  if (cosHA < -1 || cosHA > 1) return null; // polar edge cases — not Ontario
  const ha = Math.acos(cosHA) / rad;
  return {
    rise: 720 - 4 * (lon + ha) - eqtime,
    set: 720 - 4 * (lon - ha) - eqtime
  };
}

function torontoClock(y, m, d, minutesUTC) {
  const t = new Date(Date.UTC(y, m - 1, d, 0, Math.round(minutesUTC)));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true
  }).format(t).replace(/\s?([ap])\.?m\.?/i, ' $1m');
}

// ---------- computed instruments: QR squares ----------
// One small QR per entry — the printed page's version of the tappable name.
// Ink-on-paper so it scans; fail-soft so a missing dep degrades the feature,
// never the sale.
function mapsLink(sp) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sp.maps || sp.name)}`;
}

async function buildQrMap(c) {
  let QRCode;
  try { QRCode = require('qrcode'); } catch (e) { return {}; }
  const out = {};
  const lists = SECTION_KEYS.map(k => c[k]).concat([c.bonus && c.bonus.entries]);
  for (const list of lists) {
    for (const sp of (Array.isArray(list) ? list : [])) {
      const link = mapsLink(sp);
      if (out[link]) continue;
      try {
        out[link] = await QRCode.toBuffer(link, {
          margin: 0, scale: 3, color: { dark: INK, light: PAPER }
        });
      } catch (e) { /* entry simply renders without a square */ }
    }
  }
  return out;
}

// ---------- poster covers: "Surveyed Light" ----------
// The WPA-poster ancestor of Quiet Cartography: the place distilled to five
// flat colours inside a drawn frame — banded light, stacked silhouettes,
// ruled water, one living witness, one coral disc. Scene art is authored
// per slug; guides without one keep the typographic motif cover.
const MARIGOLD = '#FFB627';
const FADED_MOSS = '#A9BFAE';

function drawMarkhamPoster(doc, F, guide, total) {
  const W = doc.page.width;
  // frame
  doc.rect(30, 30, W - 60, doc.page.height - 60).lineWidth(2).stroke(INK);
  doc.rect(38, 38, W - 76, doc.page.height - 76).lineWidth(0.7).stroke(INK);
  // title band
  doc.font(F.displayLight).fontSize(8).fillColor(MOSS)
    .text('DAYHOP  ·  FIELD  GUIDES', 0, 64, { width: W, align: 'center', characterSpacing: 4 });
  const title = guide.title.replace(/ (Nature Guide|City Nature Spots)$/, '').toUpperCase();
  let ts = 72;
  doc.font(F.display).fontSize(ts);
  while (doc.widthOfString(title, { characterSpacing: 6 }) > 448) { ts -= 1; doc.fontSize(ts); }
  doc.fillColor(INK).text(title, 0, 82, { width: W, align: 'center', characterSpacing: 6 });
  doc.font(F.displayLight).fontSize(12.5).fillColor(MOSS)
    .text('NATURE  GUIDE', 0, 168, { width: W, align: 'center', characterSpacing: 9 });

  // scene window — Milne reservoir at last light, the heron on watch
  const SX = 58, SW = W - 116, SY = 206, SH = 434, SB = SY + SH;
  doc.save();
  doc.rect(SX, SY, SW, SH).clip();
  doc.rect(SX, SY, SW, SH).fill(PAPER);
  for (const [by, bh] of [[SY + 148, 11], [SY + 166, 7], [SY + 179, 4]]) {
    doc.rect(SX, by, SW, bh).fill(MARIGOLD);
  }
  const sunX = SX + SW * 0.68, sunY = SY + 72;
  doc.circle(sunX, sunY, 72).lineWidth(0.7).stroke(CORAL);
  doc.circle(sunX, sunY, 60).lineWidth(0.9).stroke(CORAL);
  doc.circle(sunX, sunY, 47).fill(CORAL);
  // far ridge
  doc.moveTo(SX, SY + 206);
  doc.quadraticCurveTo(SX + SW * 0.18, SY + 184, SX + SW * 0.38, SY + 198);
  doc.quadraticCurveTo(SX + SW * 0.55, SY + 210, SX + SW * 0.72, SY + 194);
  doc.quadraticCurveTo(SX + SW * 0.88, SY + 180, SX + SW, SY + 196);
  doc.lineTo(SX + SW, SY + 252).lineTo(SX, SY + 252).closePath().fill(FADED_MOSS);
  // treeline
  {
    const baseY = SY + 216;
    doc.moveTo(SX, baseY + 26);
    let x = SX, li = 0;
    const lumps = [
      [26, 18], [34, 26], [22, 14], [40, 30], [30, 20], [24, 26], [38, 18],
      [28, 24], [34, 30], [22, 16], [40, 26], [30, 20], [26, 24], [36, 18], [30, 26]
    ];
    while (x <= SX + SW) {
      const [w, h] = lumps[li % lumps.length];
      doc.quadraticCurveTo(x + w / 2, baseY + 26 - h, x + w, baseY + 26 - Math.max(4, h * 0.35));
      x += w; li++;
    }
    doc.lineTo(x, baseY + 70).lineTo(SX, baseY + 70).closePath().fill(MOSS);
  }
  for (const [fx, ph] of [[0.12, 34], [0.30, 46], [0.47, 30], [0.81, 40], [0.93, 30]]) {
    const px = SX + SW * fx, base = SY + 244;
    doc.moveTo(px, base - ph);
    for (let t = 0; t < 4; t++) {
      const tw = 4.5 + t * 3.2, tyy = base - ph + 8 + t * (ph - 10) / 4;
      doc.lineTo(px + tw, tyy).lineTo(px + tw * 0.35, tyy);
    }
    doc.lineTo(px + 1.4, base).lineTo(px - 1.4, base);
    for (let t = 3; t >= 0; t--) {
      const tw = 4.5 + t * 3.2, tyy = base - ph + 8 + t * (ph - 10) / 4;
      doc.lineTo(px - tw * 0.35, tyy).lineTo(px - tw, tyy);
    }
    doc.closePath().fill(MOSS);
  }
  // ruled water + marigold reflection
  const waterTop = SY + 284;
  for (let wy = waterTop; wy < SB - 26; wy += 7) {
    const inset = Math.max(0, (waterTop + 40 - wy)) * 1.8;
    doc.moveTo(SX + inset, wy).lineTo(SX + SW - inset, wy)
      .lineWidth(wy < waterTop + 40 ? 0.5 : 0.8).stroke(MOSS);
  }
  {
    const widths = [30, 18, 40, 24, 46, 20, 38, 26, 44, 16, 34, 22];
    const offs = [0, -6, 4, -3, 6, -8, 2, 5, -4, 7, -2, 3];
    let i = 0;
    for (let wy = waterTop + 4; wy < SB - 34; wy += 7) {
      const w0 = widths[i % widths.length] * (0.7 + (wy - waterTop) / (SB - waterTop) * 0.8);
      const ox = offs[i % offs.length];
      doc.moveTo(sunX + ox - w0 / 2, wy).lineTo(sunX + ox + w0 / 2, wy).lineWidth(2).stroke(MARIGOLD);
      i++;
    }
  }
  // bank + cattails
  doc.moveTo(SX, SB - 34);
  doc.quadraticCurveTo(SX + SW * 0.22, SB - 46, SX + SW * 0.45, SB - 36);
  doc.quadraticCurveTo(SX + SW * 0.70, SB - 27, SX + SW, SB - 38);
  doc.lineTo(SX + SW, SB).lineTo(SX, SB).closePath().fill(INK);
  const cattail = (x, h, lean) => {
    const topY = SB - 34 - h;
    doc.moveTo(x, SB - 30).quadraticCurveTo(x + lean * 0.4, SB - 34 - h * 0.55, x + lean, topY + 16)
      .lineWidth(1.5).stroke(INK);
    doc.save();
    doc.translate(x + lean, topY + 8).rotate(lean * 1.2, { origin: [0, 0] });
    doc.roundedRect(-2.2, -9, 4.4, 18, 2.2).fill(INK);
    doc.restore();
    doc.moveTo(x + lean * 0.7, topY + 1).lineTo(x + lean * 0.7, topY - 7).lineWidth(0.9).stroke(INK);
  };
  cattail(SX + 36, 96, 4); cattail(SX + 52, 128, -3); cattail(SX + 66, 82, 6);
  cattail(SX + 88, 112, -5); cattail(SX + 104, 74, 3);
  for (const [bx, bh, bl] of [[SX + 30, 110, -14], [SX + 60, 140, 18], [SX + 96, 120, -20], [SX + 112, 96, 14]]) {
    doc.moveTo(bx, SB - 30).quadraticCurveTo(bx + bl * 0.2, SB - 30 - bh * 0.7, bx + bl, SB - 30 - bh)
      .lineWidth(1.8).stroke(INK);
  }
  // the heron
  {
    const hx = SX + SW * 0.40, hy = SB - 38;
    doc.lineCap('round');
    doc.moveTo(hx - 2, hy + 2).lineTo(hx + 2, hy - 56).lineWidth(2.4).stroke(INK);
    doc.moveTo(hx + 18, hy - 2).lineTo(hx + 9, hy - 56).lineWidth(2.4).stroke(INK);
    doc.moveTo(hx - 30, hy - 78);
    doc.quadraticCurveTo(hx - 8, hy - 98, hx + 24, hy - 94);
    doc.quadraticCurveTo(hx + 52, hy - 90, hx + 62, hy - 74);
    doc.lineTo(hx + 74, hy - 62);
    doc.quadraticCurveTo(hx + 48, hy - 52, hx + 20, hy - 50);
    doc.quadraticCurveTo(hx - 12, hy - 50, hx - 26, hy - 62);
    doc.quadraticCurveTo(hx - 33, hy - 70, hx - 30, hy - 78);
    doc.closePath().fill(INK);
    doc.moveTo(hx - 20, hy - 84);
    doc.quadraticCurveTo(hx - 44, hy - 96, hx - 42, hy - 122);
    doc.quadraticCurveTo(hx - 41, hy - 138, hx - 32, hy - 144);
    doc.lineWidth(9).stroke(INK);
    doc.save();
    doc.translate(hx - 30, hy - 146).rotate(-8, { origin: [0, 0] });
    doc.ellipse(0, 0, 8.5, 5.5).fill(INK);
    doc.restore();
    doc.moveTo(hx - 34, hy - 148).lineTo(hx - 72, hy - 139).lineTo(hx - 32, hy - 141).closePath().fill(INK);
    doc.moveTo(hx - 24, hy - 149).quadraticCurveTo(hx - 12, hy - 154, hx - 6, hy - 150).lineWidth(1.2).stroke(INK);
    doc.circle(hx - 29, hy - 146.5, 1.4).fill(PAPER);
  }
  doc.restore();
  doc.rect(SX, SY, SW, SH).lineWidth(1.1).stroke(INK);

  // sub band + surveyor's stamp
  doc.font(F.displayLight).fontSize(8.5).fillColor(MOSS)
    .text('ROUGE  VALLEY  TRAILS   ·   MILL  PONDS   ·   THE  QUIET  FOREST  CORNERS', 0, SB + 22,
      { width: W, align: 'center', characterSpacing: 2.4 });
  doc.moveTo(W / 2 - 59, SB + 44).lineTo(W / 2 + 59, SB + 44).lineWidth(0.8).stroke(MOSS);
  doc.font(F.displayLight).fontSize(6.5).fillColor(INK)
    .text(`${total}  FIELD-CHECKED  PLACES   ·   RANKED  TABLES   ·   FOUR  SEASONS   ·   EVERY  ENTRY  LINKED  LIVE`, 0, SB + 54,
      { width: W, align: 'center', characterSpacing: 1.8 });
  const edition = new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'America/Toronto' }).toUpperCase();
  doc.font(F.displayLight).fontSize(6.5).fillColor(MOSS)
    .text(`DAYHOP  ·  ${(guide.coords || '').toUpperCase()}  ·  FIELD-CHECKED  EDITION  ·  ${edition}`, 0, SB + 68,
      { width: W, align: 'center', characterSpacing: 1.8 });
}

function drawRichmondHillPoster(doc, F, guide, total) {
  const W = doc.page.width;
  // frame
  doc.rect(30, 30, W - 60, doc.page.height - 60).lineWidth(2).stroke(INK);
  doc.rect(38, 38, W - 76, doc.page.height - 76).lineWidth(0.7).stroke(INK);
  // title band
  doc.font(F.displayLight).fontSize(8).fillColor(MOSS)
    .text('DAYHOP  ·  FIELD  GUIDES', 0, 64, { width: W, align: 'center', characterSpacing: 4 });
  const title = guide.title.replace(/ (Nature Guide|City Nature Spots)$/, '').toUpperCase();
  let ts = 72;
  doc.font(F.display).fontSize(ts);
  while (doc.widthOfString(title, { characterSpacing: 4 }) > 460) { ts -= 1; doc.fontSize(ts); }
  doc.fillColor(INK).text(title, 0, 86, { width: W, align: 'center', characterSpacing: 4 });
  doc.font(F.displayLight).fontSize(12.5).fillColor(MOSS)
    .text('NATURE  GUIDE', 0, 168, { width: W, align: 'center', characterSpacing: 9 });

  // scene window — a kettle lake on the moraine, the loon on watch
  const SX = 58, SW = W - 116, SY = 206, SH = 434, SB = SY + SH;
  doc.save();
  doc.rect(SX, SY, SW, SH).clip();
  doc.rect(SX, SY, SW, SH).fill(PAPER);
  for (const [by, bh] of [[SY + 138, 11], [SY + 156, 7], [SY + 169, 4]]) {
    doc.rect(SX, by, SW, bh).fill(MARIGOLD);
  }
  const sunX = SX + SW * 0.30, sunY = SY + 68;
  doc.circle(sunX, sunY, 70).lineWidth(0.7).stroke(CORAL);
  doc.circle(sunX, sunY, 58).lineWidth(0.9).stroke(CORAL);
  doc.circle(sunX, sunY, 45).fill(CORAL);
  // far moraine ridge — the long rolling spine
  doc.moveTo(SX, SY + 196);
  doc.quadraticCurveTo(SX + SW * 0.22, SY + 168, SX + SW * 0.45, SY + 190);
  doc.quadraticCurveTo(SX + SW * 0.66, SY + 208, SX + SW * 0.85, SY + 182);
  doc.quadraticCurveTo(SX + SW * 0.95, SY + 170, SX + SW, SY + 178);
  doc.lineTo(SX + SW, SY + 246).lineTo(SX, SY + 246).closePath().fill(FADED_MOSS);
  // near ridge treeline — deep moss canopies
  {
    const baseY = SY + 212;
    doc.moveTo(SX, baseY + 24);
    let x = SX, li = 0;
    const lumps = [
      [30, 20], [24, 14], [38, 26], [28, 18], [34, 28], [22, 15], [40, 24],
      [26, 20], [36, 30], [24, 16], [32, 22], [28, 26], [38, 18], [30, 24]
    ];
    while (x <= SX + SW) {
      const [w, h] = lumps[li % lumps.length];
      doc.quadraticCurveTo(x + w / 2, baseY + 24 - h, x + w, baseY + 24 - Math.max(4, h * 0.35));
      x += w; li++;
    }
    doc.lineTo(x, baseY + 62).lineTo(SX, baseY + 62).closePath().fill(MOSS);
  }
  for (const [fx, ph] of [[0.08, 32], [0.26, 42], [0.55, 30], [0.68, 44], [0.90, 34]]) {
    const px = SX + SW * fx, base = SY + 238;
    doc.moveTo(px, base - ph);
    for (let t = 0; t < 4; t++) {
      const tw = 4.2 + t * 3, tyy = base - ph + 8 + t * (ph - 10) / 4;
      doc.lineTo(px + tw, tyy).lineTo(px + tw * 0.35, tyy);
    }
    doc.lineTo(px + 1.3, base).lineTo(px - 1.3, base);
    for (let t = 3; t >= 0; t--) {
      const tw = 4.2 + t * 3, tyy = base - ph + 8 + t * (ph - 10) / 4;
      doc.lineTo(px - tw * 0.35, tyy).lineTo(px - tw, tyy);
    }
    doc.closePath().fill(MOSS);
  }
  // the kettle lake — ruled water, reflection under the sun
  const waterTop = SY + 274;
  for (let wy = waterTop; wy < SB - 26; wy += 7) {
    const inset = Math.max(0, (waterTop + 40 - wy)) * 1.8;
    doc.moveTo(SX + inset, wy).lineTo(SX + SW - inset, wy)
      .lineWidth(wy < waterTop + 40 ? 0.5 : 0.8).stroke(MOSS);
  }
  {
    const widths = [28, 16, 38, 22, 44, 18, 36, 24, 42, 14, 32, 20];
    const offs = [0, 5, -4, 3, -6, 7, -2, -5, 4, -7, 2, -3];
    let i = 0;
    for (let wy = waterTop + 4; wy < SB - 34; wy += 7) {
      const w0 = widths[i % widths.length] * (0.7 + (wy - waterTop) / (SB - waterTop) * 0.8);
      doc.moveTo(sunX + offs[i % offs.length] - w0 / 2, wy)
        .lineTo(sunX + offs[i % offs.length] + w0 / 2, wy).lineWidth(2).stroke(MARIGOLD);
      i++;
    }
  }
  // foreground bank
  doc.moveTo(SX, SB - 36);
  doc.quadraticCurveTo(SX + SW * 0.28, SB - 26, SX + SW * 0.55, SB - 36);
  doc.quadraticCurveTo(SX + SW * 0.78, SB - 46, SX + SW, SB - 40);
  doc.lineTo(SX + SW, SB).lineTo(SX, SB).closePath().fill(INK);
  // shoreline pines standing on the right bank — the moraine's signature
  const bigPine = (px, baseY, h) => {
    doc.moveTo(px - 1.6, baseY).lineTo(px - 1.6, baseY - 8).lineTo(px + 1.6, baseY - 8).lineTo(px + 1.6, baseY)
      .closePath().fill(INK);
    doc.moveTo(px, baseY - h);
    for (let t = 0; t < 5; t++) {
      const tw = 6 + t * 5.2, tyy = baseY - h + 10 + t * (h - 18) / 5;
      doc.lineTo(px + tw, tyy).lineTo(px + tw * 0.32, tyy);
    }
    doc.lineTo(px + 2, baseY - 6).lineTo(px - 2, baseY - 6);
    for (let t = 4; t >= 0; t--) {
      const tw = 6 + t * 5.2, tyy = baseY - h + 10 + t * (h - 18) / 5;
      doc.lineTo(px - tw * 0.32, tyy).lineTo(px - tw, tyy);
    }
    doc.closePath().fill(INK);
  };
  bigPine(SX + SW * 0.80, SB - 40, 128);
  bigPine(SX + SW * 0.90, SB - 34, 168);
  bigPine(SX + SW * 0.97, SB - 38, 108);
  // the loon — floating, facing the light
  {
    const lx = SX + SW * 0.42, ly = SB - 78;
    doc.lineCap('round');
    doc.moveTo(lx - 30, ly);
    doc.quadraticCurveTo(lx - 22, ly - 16, lx + 2, ly - 17);
    doc.quadraticCurveTo(lx + 28, ly - 16, lx + 40, ly - 5);
    doc.lineTo(lx + 50, ly - 12);
    doc.lineTo(lx + 46, ly).closePath().fill(INK);
    doc.moveTo(lx - 18, ly - 12);
    doc.quadraticCurveTo(lx - 30, ly - 26, lx - 28, ly - 40);
    doc.lineWidth(8).stroke(INK);
    doc.save();
    doc.translate(lx - 29, ly - 45).rotate(-6, { origin: [0, 0] });
    doc.ellipse(0, 0, 7.5, 5.2).fill(INK);
    doc.restore();
    doc.moveTo(lx - 34, ly - 47).lineTo(lx - 52, ly - 42).lineTo(lx - 33, ly - 41).closePath().fill(INK);
    // the necklace — the loon's paper stripes
    for (let i = 0; i < 4; i++) {
      doc.moveTo(lx - 30 + i * 2.4, ly - 33).lineTo(lx - 29 + i * 2.4, ly - 27).lineWidth(1.1).stroke(PAPER);
    }
    doc.circle(lx - 30, ly - 45.5, 1.3).fill(PAPER);
    // wake
    doc.moveTo(lx + 56, ly - 2).lineTo(lx + 92, ly - 2).lineWidth(0.5).stroke(MOSS);
    doc.moveTo(lx - 40, ly - 2).lineTo(lx - 62, ly - 2).lineWidth(0.5).stroke(MOSS);
  }
  doc.restore();
  doc.rect(SX, SY, SW, SH).lineWidth(1.1).stroke(INK);

  // sub band + surveyor's stamp
  doc.font(F.displayLight).fontSize(8.5).fillColor(MOSS)
    .text('KETTLE  LAKES   ·   THE  OAK  RIDGES  MORAINE   ·   THE  GREEN  SEAMS', 0, SB + 22,
      { width: W, align: 'center', characterSpacing: 2.4 });
  doc.moveTo(W / 2 - 59, SB + 44).lineTo(W / 2 + 59, SB + 44).lineWidth(0.8).stroke(MOSS);
  doc.font(F.displayLight).fontSize(6.5).fillColor(INK)
    .text(`${total}  FIELD-CHECKED  PLACES   ·   RANKED  TABLES   ·   FOUR  SEASONS   ·   EVERY  ENTRY  LINKED  LIVE`, 0, SB + 54,
      { width: W, align: 'center', characterSpacing: 1.8 });
  const edition = new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'America/Toronto' }).toUpperCase();
  doc.font(F.displayLight).fontSize(6.5).fillColor(MOSS)
    .text(`DAYHOP  ·  ${(guide.coords || '').toUpperCase()}  ·  FIELD-CHECKED  EDITION  ·  ${edition}`, 0, SB + 68,
      { width: W, align: 'center', characterSpacing: 1.8 });
}

const POSTER_COVERS = { markham: drawMarkhamPoster, 'richmond-hill': drawRichmondHillPoster };

// ---------- entry stamps ----------
// Each place's thumbnail: a surveyor's medallion in the left rail — moss
// ring, ink pictogram, the same engraved economy as the cover. Keyed by
// the guide's c.icons map; entries without one keep the plain layout.
const STAMP_ICONS = {
  dam(doc, cx, cy) {
    doc.moveTo(cx - 7, cy - 2).lineTo(cx + 7, cy - 2).lineWidth(1.3).stroke(INK);
    for (const dx of [-4, 0, 4]) doc.moveTo(cx + dx, cy - 2).lineTo(cx + dx, cy + 3).lineWidth(0.8).stroke(INK);
    doc.moveTo(cx - 6, cy + 6).lineTo(cx + 6, cy + 6).lineWidth(0.5).stroke(INK);
  },
  pond(doc, cx, cy) {
    doc.circle(cx, cy, 6.5).lineWidth(0.8).stroke(INK);
    doc.circle(cx, cy, 3.6).lineWidth(0.6).stroke(INK);
    doc.circle(cx, cy, 1).fill(INK);
  },
  lake(doc, cx, cy) {
    for (const [dy, w0] of [[-3.5, 12], [0.5, 10], [4.5, 7]]) {
      doc.moveTo(cx - w0 / 2, cy + dy).lineTo(cx + w0 / 2, cy + dy).lineWidth(0.9).stroke(INK);
    }
  },
  creek(doc, cx, cy) {
    doc.moveTo(cx - 6, cy + 7).quadraticCurveTo(cx + 5, cy + 3, cx - 1, cy - 1)
      .quadraticCurveTo(cx - 7, cy - 5, cx + 6, cy - 7).lineWidth(1.3).stroke(INK);
  },
  forest(doc, cx, cy) {
    const pine = (x, y, h) => {
      doc.moveTo(x, y - h).lineTo(x + h * 0.42, y).lineTo(x - h * 0.42, y).closePath().fill(INK);
      doc.moveTo(x, y).lineTo(x, y + 2.4).lineWidth(0.9).stroke(INK);
    };
    pine(cx - 3.5, cy + 3, 9.5); pine(cx + 4, cy + 4, 6.5);
  },
  meadow(doc, cx, cy) {
    for (const [dx, lean] of [[-4, -3], [0, 0.5], [4, 3.5]]) {
      doc.moveTo(cx + dx, cy + 7).quadraticCurveTo(cx + dx + lean * 0.4, cy, cx + dx + lean, cy - 6)
        .lineWidth(1.1).stroke(INK);
    }
    doc.circle(cx + 5.5, cy - 6, 1).fill(INK);
  },
  valley(doc, cx, cy) {
    doc.moveTo(cx - 7, cy - 4).lineTo(cx, cy + 4).lineTo(cx + 7, cy - 4).lineWidth(1.2).stroke(INK);
    doc.moveTo(cx - 4.5, cy - 6.5).lineTo(cx, cy - 1.5).lineTo(cx + 4.5, cy - 6.5).lineWidth(0.7).stroke(INK);
  },
  marsh(doc, cx, cy) {
    doc.moveTo(cx - 6.5, cy + 6).lineTo(cx + 6.5, cy + 6).lineWidth(0.6).stroke(INK);
    doc.moveTo(cx - 1, cy + 6).lineTo(cx - 1, cy - 2).lineWidth(1).stroke(INK);
    doc.roundedRect(cx - 2.4, cy - 7, 2.8, 6, 1.4).fill(INK);
    doc.moveTo(cx + 3.5, cy + 6).quadraticCurveTo(cx + 5, cy, cx + 6.5, cy - 4).lineWidth(0.9).stroke(INK);
  },
  lookout(doc, cx, cy) {
    doc.moveTo(cx - 7, cy + 5).lineTo(cx, cy - 5.5).lineTo(cx + 7, cy + 5).lineWidth(1.2).stroke(INK);
    doc.moveTo(cx - 8, cy + 5).lineTo(cx + 8, cy + 5).lineWidth(0.5).stroke(INK);
    doc.circle(cx + 5, cy - 4.5, 1.3).fill(INK);
  },
  fish(doc, cx, cy) {
    doc.ellipse(cx - 1.5, cy, 5.2, 2.9).fill(INK);
    doc.moveTo(cx + 3, cy).lineTo(cx + 7, cy - 3).lineTo(cx + 7, cy + 3).closePath().fill(INK);
    doc.circle(cx - 4.2, cy - 0.6, 0.7).fill(PAPER);
  },
  mill(doc, cx, cy) {
    doc.circle(cx, cy, 6).lineWidth(1).stroke(INK);
    for (const a of [0, 45, 90, 135]) {
      const r = a * Math.PI / 180;
      doc.moveTo(cx - Math.cos(r) * 6, cy - Math.sin(r) * 6)
        .lineTo(cx + Math.cos(r) * 6, cy + Math.sin(r) * 6).lineWidth(0.7).stroke(INK);
    }
    doc.circle(cx, cy, 1.2).fill(INK);
  },
  farm(doc, cx, cy) {
    for (const [y0, w0] of [[-4, 9], [0, 12], [4, 15]]) {
      doc.moveTo(cx - w0 / 2, cy + y0).lineTo(cx + w0 / 2, cy + y0).lineWidth(1).stroke(INK);
    }
  },
  heritage(doc, cx, cy) {
    doc.moveTo(cx - 6.5, cy - 1).lineTo(cx, cy - 6.5).lineTo(cx + 6.5, cy - 1).lineWidth(1.2).stroke(INK);
    doc.rect(cx - 5, cy - 1, 10, 8).lineWidth(1).stroke(INK);
    doc.rect(cx - 1.3, cy + 3.4, 2.6, 3.6).fill(INK);
  },
  patio(doc, cx, cy) {
    doc.moveTo(cx - 8, cy).quadraticCurveTo(cx, cy - 10.5, cx + 8, cy).closePath().fill(INK);
    doc.moveTo(cx, cy).lineTo(cx, cy + 7).lineWidth(1.1).stroke(INK);
    doc.moveTo(cx - 4, cy + 7).lineTo(cx + 4, cy + 7).lineWidth(0.9).stroke(INK);
  }
};

function drawStamp(doc, icon, cx, cy) {
  doc.circle(cx, cy, 13).lineWidth(1).stroke(MOSS);
  doc.circle(cx, cy, 10.5).lineWidth(0.4).stroke(MOSS);
  STAMP_ICONS[icon](doc, cx, cy);
}

async function buildGuidePdf(guide) {
  const c = guide.content();
  const qrMap = await buildQrMap(c);
  return new Promise((resolve, reject) => {
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
    const total = SECTION_KEYS.reduce((n, k) =>
      n + (Array.isArray(c[k]) ? c[k].filter(s => !s.facetOf).length : 0), 0);
    const hubNo = {}; // place name -> its number, for facet cross-references
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

    if (POSTER_COVERS[guide.slug]) {
      POSTER_COVERS[guide.slug](doc, F, guide, total);
    } else {
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
    } // end typographic-cover fallback

    // ---------- frontispiece: the place itself, then the map ----------
    const hero = loadPhoto(`${guide.slug}-hero`);
    doc.addPage();
    if (hero) {
      usedPhotos.push(hero.credit);
      photoBand(doc, hero.buffer, 0, 0, doc.page.width, 316, hero.credit && hero.credit.focal);
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

    // ---------- contents (filled in after rendering, when pages are known) ----------
    const sections = []; // { label, pageIndex }
    doc.addPage();
    const tocPageIndex = doc.bufferedPageRange().count - 1;
    const markSection = (label) => {
      const dest = 'sec-' + sections.length;
      sections.push({ label, pageIndex: doc.bufferedPageRange().count - 1, dest });
      doc.addNamedDestination(dest);
      try { doc.outline.addItem(label); } catch (e) { /* outline is nice-to-have */ }
    };

    // ---------- whitespace furniture ----------
    // Deep page tails get reclaimed: first as ruled note lines the reader
    // writes on (the margins are part of a field guide), then — if paper
    // still remains — by the city's own contour motif.
    const pageBottom = () => doc.page.height - doc.page.margins.bottom;
    const motifBand = (top, height) => {
      let h = Math.min(height, 340);
      // Never cut through the motif's coral thread (markham row 7 sits at
      // local y≈168–215): a clipped coral crest reads as a defect where a
      // clipped moss hairline reads as an edge.
      if (h > 162 && h < 218) h = 160;
      if (h < 60) return;
      doc.save();
      doc.rect(64, top, W, h).clip();
      // The cover motifs draw at y≈395–745; shift that field into the band.
      doc.translate(0, top - 400);
      (MOTIFS[guide.slug] || MOTIFS.markham)(doc, makeRng(guide.slug + ':tail'));
      doc.restore();
      // Erase the ragged last strip: crest tips of the next row otherwise
      // peek over the clip edge as disconnected fragments.
      doc.rect(64, top + h - 14, W, 14).fill(PAPER);
    };
    const noteLines = (count) => {
      for (let i = 0; i < count; i++) {
        doc.y += 26;
        for (let dx = 64; dx < 64 + W; dx += 6) doc.circle(dx, doc.y, 0.5).fill(MOSS);
      }
      doc.y += 8;
    };
    const fillTail = () => {
      let room = pageBottom() - doc.y;
      if (room < 220) return;
      doc.y += 16;
      doc.font(F.display).fontSize(10).fillColor(MOSS)
        .text('NOTES FROM THE FIELD', 64, doc.y, { characterSpacing: 2 });
      doc.moveDown(0.2);
      doc.font(F.bodyItalic).fontSize(9).fillColor(INK_SOFT)
        .text('Dates, sightings, who was along — the margins are part of the guide.', 64, doc.y, { width: W });
      doc.y += 6;
      noteLines(Math.min(6, Math.floor((pageBottom() - 40 - doc.y) / 26)));
      room = pageBottom() - doc.y;
      if (room > 140) motifBand(doc.y + 16, room - 24);
    };

    // ---------- "If you only have…" ----------
    // Travellers buy guides with a checkout time looming — serve the
    // time-budgeted reader before the completionist.
    if (Array.isArray(c.quick) && c.quick.length) {
      doc.addPage();
      markSection('If you only have…');
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
      // Pace math in the tail, then the survey takes the paper back.
      if (pageBottom() - doc.y > 170) {
        const PACE = 'Plan on 3 km/h with kids or cameras, 4–5 km/h at an adult walking clip — and add fifteen minutes for every stop you swear will take five.';
        doc.font(F.body).fontSize(10.5);
        const pH = doc.heightOfString(PACE, { width: W - 36, lineGap: 2 });
        const py = doc.y + 4;
        doc.roundedRect(64, py, W, pH + 46, 8).fill(PAPER_DIM);
        doc.font(F.display).fontSize(10).fillColor(MOSS).text('PACE MATH', 82, py + 13, { characterSpacing: 2 });
        doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(PACE, 82, doc.y + 5, { width: W - 36, lineGap: 2 });
        doc.y = py + pH + 56;
      }
      if (pageBottom() - doc.y > 140) motifBand(doc.y + 14, pageBottom() - doc.y - 22);
    }

    // Section opener: letterspaced display over a short rule, blurb in the
    // notebook voice, and — where assigned — the guide's second photograph.
    const opener = (label, blurb) => {
      doc.addPage();
      markSection(label);
      let top = 72;
      const photoKey = SECTION_PHOTO_KEYS[label];
      if (photoKey) {
        const ph = loadPhoto(`${guide.slug}-${photoKey}`);
        if (ph) {
          usedPhotos.push(ph.credit);
          photoBand(doc, ph.buffer, 0, 0, doc.page.width, 190, ph.credit && ph.credit.focal);
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

    // ---------- choose by numbers: trail table, amenity index, shortlists --
    // The decision tools: every trail measured, every park scored — the
    // pages that answer "which one, today, with my crew" before the reading
    // pages explain why. Gated on structured data so guides without it
    // simply skip the section.
    const trailRows = (c.trails || []).filter(t => t.tr)
      .sort((a, b) => (a.tr.boots - b.tr.boots) || (a.tr.km - b.tr.km));
    const amenRows = (c.spots || []).filter(s => s.amen);
    if (trailRows.length || amenRows.length) {
      opener('Choose by numbers',
        'Every trail measured, every park scored on what decides a family outing. The reading pages tell you why; these tables tell you which.');

      const CLIMB_W = ['FLAT', 'ROLLING', 'HILLY'];
      const SHADE_W = ['OPEN', 'PART', 'FULL'];
      const CROWD_W = ['QUIET', 'LIGHT', 'BUSY'];

      if (trailRows.length) {
        doc.font(F.display).fontSize(14).fillColor(INK).text('THE TRAIL TABLE', 64, doc.y, { characterSpacing: 1.8 });
        rule(64, doc.y + 6, 118);
        doc.y += 18;
        // Column plan: name rail + seven measured columns, easiest first.
        const COLS = [
          { label: 'KM', x: 242, w: 26 }, { label: 'TYPE', x: 270, w: 52 },
          { label: 'SURFACE', x: 324, w: 60 }, { label: 'CLIMB', x: 386, w: 38 },
          { label: 'SHADE', x: 426, w: 36 }, { label: 'CROWDS', x: 464, w: 38 },
          { label: 'BOOTS', x: 504, w: 44 }
        ];
        const headY = doc.y;
        doc.font(F.displayLight).fontSize(5.5).fillColor(MOSS);
        doc.text('TRAIL', 64, headY, { characterSpacing: 1.2, lineBreak: false });
        for (const col of COLS) doc.text(col.label, col.x, headY, { width: col.w, align: 'center', characterSpacing: 1, lineBreak: false });
        doc.moveTo(64, headY + 10).lineTo(64 + W, headY + 10).lineWidth(0.5).stroke(MOSS);
        let rowY = headY + 17;
        for (const t of trailRows) {
          const d0 = t.tr;
          // Explicit link rect — the text `link` option emits NaN coords
          // under lineBreak:false (same pdfkit quirk as the TOC rows).
          doc.font(F.display).fontSize(9.5).fillColor(INK)
            .text(t.name, 64, rowY, { width: 176, lineBreak: false });
          doc.link(64, rowY - 2, 176, 13, mapsLink(t));
          const cells = [
            String(d0.km), d0.kind.toUpperCase(), d0.surface.toUpperCase(),
            CLIMB_W[d0.climb] || '', SHADE_W[d0.shade] || '', CROWD_W[d0.crowd] || ''
          ];
          doc.font(F.displayLight).fontSize(6.5).fillColor(INK_SOFT);
          cells.forEach((v, i) => doc.text(v, COLS[i].x, rowY + 2, { width: COLS[i].w, align: 'center', characterSpacing: 0.6, lineBreak: false }));
          // Boots: effort 1–5 as filled marks on the survey line.
          for (let b = 0; b < 5; b++) {
            const bx = 506 + b * 8.4, by = rowY + 5;
            if (b < d0.boots) doc.circle(bx, by, 2.2).fill(MOSS);
            else doc.circle(bx, by, 2.2).lineWidth(0.7).stroke(MOSS);
          }
          if (d0.pick) {
            doc.font(F.bodyItalic).fontSize(8.5).fillColor(MOSS)
              .text(d0.pick, 64, rowY + 12, { width: W - 60, lineBreak: false });
          }
          rowY += 30;
          doc.moveTo(64, rowY - 8).lineTo(64 + W, rowY - 8).lineWidth(0.3).stroke(MOSS);
        }
        doc.y = rowY + 2;
        doc.font(F.displayLight).fontSize(6.5).fillColor(INK_SOFT)
          .text('BOOTS — EFFORT, 1 (A STROLL) TO 5 (A WORKOUT). ONE-WAY ROUTES: PLAN THE RETURN OR THE TRANSIT EXIT.', 64, doc.y, { characterSpacing: 1, lineBreak: false });
        doc.y += 20;
      }

      if (Array.isArray(c.shortlists) && c.shortlists.length) {
        if (doc.y + 40 + c.shortlists.length * 32 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        doc.font(F.display).fontSize(14).fillColor(INK).text('THE SHORTLISTS', 64, doc.y, { characterSpacing: 1.8 });
        rule(64, doc.y + 6, 118);
        doc.y += 16;
        for (const s of c.shortlists) {
          if (doc.y + 34 > doc.page.height - doc.page.margins.bottom) doc.addPage();
          doc.font(F.display).fontSize(8.5).fillColor(MOSS)
            .text(s.title.toUpperCase(), 64, doc.y, { characterSpacing: 1.4 });
          doc.moveDown(0.12);
          doc.font(F.body).fontSize(10).fillColor(INK_SOFT).text(s.text, { width: W, lineGap: 1.4 });
          doc.moveDown(0.42);
        }
      }

      if (amenRows.length) {
        doc.addPage();
        doc.font(F.display).fontSize(14).fillColor(INK).text('THE PARK AMENITY INDEX', 64, 72, { characterSpacing: 1.8 });
        rule(64, doc.y + 6, 118);
        doc.y += 16;
        doc.font(F.bodyItalic).fontSize(10.5).fillColor(MOSS)
          .text('The ten-second answer to "will this park work for us" — scored on the ground, not from a brochure.', 64, doc.y, { width: W - 40, lineGap: 2 });
        doc.moveDown(1);
        const AMEN_COLS = [
          { key: 'lot', label: 'LOT' }, { key: 'wash', label: 'WASH' },
          { key: 'play', label: 'PLAY' }, { key: 'shade', label: 'SHADE' },
          { key: 'picnic', label: 'PICNIC' }, { key: 'wheels', label: 'WHEELS' },
          { key: 'water', label: 'WATER' }, { key: 'fish', label: 'FISH' },
          { key: 'transit', label: 'TRANSIT' }
        ];
        const gridX = 234, colW = Math.floor((W - (gridX - 64)) / AMEN_COLS.length);
        const headY = doc.y + 4;
        doc.font(F.displayLight).fontSize(5.5).fillColor(MOSS);
        doc.text('PARK', 64, headY, { characterSpacing: 1.2, lineBreak: false });
        AMEN_COLS.forEach((col, i) =>
          doc.text(col.label, gridX + i * colW, headY, { width: colW, align: 'center', characterSpacing: 0.8, lineBreak: false }));
        doc.moveTo(64, headY + 10).lineTo(64 + W, headY + 10).lineWidth(0.5).stroke(MOSS);
        // The coral stake: the fullest house in the survey.
        let bestIdx = 0, bestSum = -1;
        amenRows.forEach((s, i) => {
          const sum = Object.values(s.amen).reduce((n, v) => n + v, 0);
          if (sum > bestSum) { bestSum = sum; bestIdx = i; }
        });
        let rowY = headY + 18;
        const ellipsize = (name, maxW) => {
          let n = name;
          doc.font(F.displayLight).fontSize(8.5);
          while (n.length > 4 && doc.widthOfString(n) > maxW) n = n.slice(0, -2).trimEnd() + '…';
          return n;
        };
        amenRows.forEach((s, i) => {
          if (i % 2 === 1) doc.rect(64, rowY - 4.5, W, 19).fill(PAPER_DIM);
          if (i === bestIdx) doc.circle(58, rowY + 4, 2.4).fill(CORAL);
          doc.font(F.displayLight).fontSize(8.5).fillColor(INK)
            .text(ellipsize(s.name, gridX - 64 - 10), 64, rowY, { lineBreak: false });
          doc.link(64, rowY - 2, gridX - 64 - 10, 13, mapsLink(s));
          AMEN_COLS.forEach((col, j) => {
            const v = s.amen[col.key];
            const cx = gridX + j * colW + colW / 2, cy = rowY + 4;
            if (v === 2) doc.circle(cx, cy, 2.8).fill(MOSS);
            else if (v === 1) doc.circle(cx, cy, 2.8).lineWidth(0.9).stroke(MOSS);
          });
          rowY += 19;
        });
        doc.y = rowY + 8;
        // Legend marks drawn as vectors — National Park has no ●/○ glyphs.
        {
          const ly = doc.y + 3;
          doc.font(F.displayLight).fontSize(6.5).fillColor(INK_SOFT);
          doc.circle(68, ly, 2.8).fill(MOSS);
          let lx = 76;
          doc.text('ON SITE OR GOOD', lx, ly - 3, { characterSpacing: 0.8, lineBreak: false });
          lx += doc.widthOfString('ON SITE OR GOOD', { characterSpacing: 0.8 }) + 18;
          doc.circle(lx, ly, 2.8).lineWidth(0.9).stroke(MOSS);
          lx += 8;
          doc.fillColor(INK_SOFT).text('SEASONAL, PARTIAL, OR NEARBY', lx, ly - 3, { characterSpacing: 0.8, lineBreak: false });
          doc.y = ly + 7;
          doc.text('BLANK — NONE, OR NOT YET FIELD-VERIFIED (WE ONLY MARK WHAT WE\'VE CHECKED)', 64, doc.y, { characterSpacing: 0.8, width: W });
        }
        doc.moveDown(0.4);
        doc.font(F.displayLight).fontSize(6.5).fillColor(CORAL)
          .text('THE CORAL STAKE MARKS THE FULLEST HOUSE IN THE SURVEY', 64, doc.y, { characterSpacing: 1.2, lineBreak: false });
        doc.moveDown(1.2);
        doc.font(F.displayLight).fontSize(6.5).fillColor(MOSS)
          .text('LOT PARKING · WASHROOMS · PLAYGROUND · SHADE · PICNIC TABLES · STROLLERS & WHEELS · OPEN WATER · SHORE FISHING · TRANSIT REACH', 64, doc.y, { characterSpacing: 0.8, width: W });
        if (pageBottom() - doc.y > 140) motifBand(doc.y + 16, pageBottom() - doc.y - 24);
      }
    }

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
      'The QR square on each entry\'s right edge opens the same live map link from a printed page. ' +
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
    // The year as a picture: a month band with season spans and coral dots
    // on the headline moments (blossom, beach, colour, ice).
    {
      const bandY = doc.y + 14;
      const bandW = W;
      const mx = (m) => 64 + (m / 12) * bandW; // m: 0..12 month fractions
      doc.moveTo(64, bandY).lineTo(64 + bandW, bandY).lineWidth(0.7).stroke(MOSS);
      const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
      for (let m = 0; m < 12; m++) {
        doc.moveTo(mx(m), bandY - 3).lineTo(mx(m), bandY + 3).lineWidth(0.7).stroke(MOSS);
        doc.font(F.displayLight).fontSize(6).fillColor(INK_SOFT)
          .text(MONTHS[m], mx(m) + 1.5, bandY + 7, { characterSpacing: 0, lineBreak: false });
      }
      // Season spans (thicker moss) + labels above. Winter wraps the year.
      const spans = [
        { from: 3, to: 5, label: 'SPRING' }, { from: 5, to: 8, label: 'SUMMER' },
        { from: 8, to: 10, label: 'FALL' }, { from: 10, to: 12, label: 'WINTER' }, { from: 0, to: 2 }
      ];
      for (const s of spans) {
        doc.moveTo(mx(s.from) + 2, bandY).lineTo(mx(s.to) - 2, bandY).lineWidth(2.4).stroke(MOSS);
        if (s.label) {
          doc.font(F.display).fontSize(6.5).fillColor(MOSS)
            .text(s.label, mx(s.from) + 2, bandY - 14, { characterSpacing: 1.6, lineBreak: false });
        }
      }
      // The coral moments of the year.
      for (const m of [4.5, 6.8, 9.5, 0.5]) doc.circle(mx(m), bandY, 2.6).fill(CORAL);
      doc.y = bandY + 24;
    }
    for (const s of c.seasons) {
      doc.font(F.display).fontSize(10).fillColor(MOSS).text(s.label.toUpperCase(), 64, doc.y, { characterSpacing: 1.5 });
      doc.moveDown(0.15);
      doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(s.text, { width: W, lineGap: 1.8 });
      doc.moveDown(0.5);
    }

    // ---------- the almanac: month by month + the sun clock ----------
    // The re-open engine: what the land is doing each month, and computed
    // sunrise/sunset for the guide's own coordinates. Gated on authored data.
    if (Array.isArray(c.almanac) && c.almanac.length) {
      opener('The almanac', 'What the land is doing, month by month — and when the sun clocks in and out. The coral month is the one you plan a year around.');
      for (const mo of c.almanac) {
        doc.font(F.body).fontSize(10);
        const h = doc.heightOfString(mo.text, { width: W - 52, lineGap: 1.6 });
        if (doc.y + h + 14 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        const y0 = doc.y;
        if (mo.key) doc.circle(58, y0 + 5, 2.6).fill(CORAL);
        doc.font(F.display).fontSize(9.5).fillColor(mo.key ? CORAL : MOSS)
          .text(mo.m.toUpperCase(), 64, y0, { characterSpacing: 2, lineBreak: false });
        doc.font(F.body).fontSize(10).fillColor(INK_SOFT)
          .text(mo.text, 116, y0 - 1, { width: W - 52, lineGap: 1.6 });
        doc.y = Math.max(doc.y, y0 + h) + 9;
      }

      // The sun clock — a computed instrument, mid-month, local clock.
      const here = parseCoords(guide.coords);
      if (here) {
        const yearNow = new Date().getFullYear();
        const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
        if (doc.y + 300 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        else doc.y += 10;
        doc.font(F.display).fontSize(14).fillColor(INK).text('THE SUN CLOCK', 64, doc.y === 0 ? 72 : doc.y, { characterSpacing: 1.8 });
        rule(64, doc.y + 6, 118);
        doc.y += 16;
        const headY = doc.y;
        doc.font(F.displayLight).fontSize(5.5).fillColor(MOSS);
        doc.text('MONTH', 64, headY, { characterSpacing: 1.2, lineBreak: false });
        doc.text('SUNRISE', 200, headY, { width: 80, align: 'center', characterSpacing: 1.2, lineBreak: false });
        doc.text('SUNSET', 300, headY, { width: 80, align: 'center', characterSpacing: 1.2, lineBreak: false });
        doc.text('DAYLIGHT', 410, headY, { width: 90, align: 'right', characterSpacing: 1.2, lineBreak: false });
        doc.moveTo(64, headY + 9).lineTo(64 + W, headY + 9).lineWidth(0.5).stroke(MOSS);
        let sy = headY + 15;
        for (let m = 1; m <= 12; m++) {
          const s = sunMinutesUTC(here.lat, here.lon, yearNow, m, 15);
          if (!s) continue;
          const dayMin = Math.round(s.set - s.rise);
          doc.font(F.displayLight).fontSize(7.5).fillColor(INK)
            .text(MONTH_NAMES[m - 1], 64, sy, { characterSpacing: 1.4, lineBreak: false });
          doc.font(F.displayLight).fontSize(7.5).fillColor(INK_SOFT)
            .text(torontoClock(yearNow, m, 15, s.rise).toUpperCase(), 200, sy, { width: 80, align: 'center', characterSpacing: 1, lineBreak: false })
            .text(torontoClock(yearNow, m, 15, s.set).toUpperCase(), 300, sy, { width: 80, align: 'center', characterSpacing: 1, lineBreak: false })
            .text(`${Math.floor(dayMin / 60)} H ${String(dayMin % 60).padStart(2, '0')} M`, 410, sy, { width: 90, align: 'right', characterSpacing: 1, lineBreak: false });
          sy += 14.5;
        }
        doc.y = sy + 8;
        doc.font(F.displayLight).fontSize(6.5).fillColor(INK_SOFT)
          .text(`COMPUTED FOR ${(guide.coords || '').toUpperCase()} · MID-MONTH · LOCAL CLOCK, DST INCLUDED · GOLDEN HOUR ≈ THE LAST HOUR BEFORE SUNSET`,
            64, doc.y, { characterSpacing: 0.8, width: W });
      }
    }

    // ---------- field notes: the interesting-facts layer ----------
    // Numbered surveyor's marginalia that fill the almanac's remaining
    // paper (and flow onward), with occasional small plates.
    if (Array.isArray(c.facts) && c.facts.length) {
      if (doc.y + 130 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      else doc.y += 22;
      doc.font(F.display).fontSize(14).fillColor(INK).text('FIELD NOTES', 64, doc.y, { characterSpacing: 1.8 });
      rule(64, doc.y + 6, 118);
      doc.y += 16;
      let noteNo = 0;
      for (const f of c.facts) {
        noteNo++;
        doc.font(F.body).fontSize(10);
        const th = doc.heightOfString(f.n, { width: W - 52, lineGap: 1.6 });
        if (doc.y + th + (f.photo ? 126 : 0) + 16 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        const y0 = doc.y;
        doc.font(F.display).fontSize(8).fillColor(MOSS)
          .text('N° ' + String(noteNo).padStart(2, '0'), 64, y0 + 1, { characterSpacing: 1.5, lineBreak: false });
        doc.font(F.body).fontSize(10).fillColor(INK_SOFT).text(f.n, 116, y0, { width: W - 52, lineGap: 1.6 });
        doc.y = Math.max(doc.y, y0 + th);
        if (f.photo) {
          const ph = loadPhoto(f.photo);
          if (ph) {
            usedPhotos.push(ph.credit);
            const py = doc.y + 6;
            photoBand(doc, ph.buffer, 116, py, W - 52, 100, ph.credit && ph.credit.focal);
            doc.rect(116, py, W - 52, 100).lineWidth(0.8).stroke(INK);
            doc.font(F.displayLight).fontSize(6).fillColor(INK_SOFT)
              .text(creditLine(ph.credit), 116, py + 105, { characterSpacing: 1.2, lineBreak: false });
            doc.y = py + 116;
          }
        }
        doc.moveDown(0.55);
      }
      if (pageBottom() - doc.y > 140) motifBand(doc.y + 14, pageBottom() - doc.y - 22);
    }

    // ---------- spots ----------
    let spotNo = 0;
    const renderSpots = (label, blurb, spots) => {
      opener(label, blurb);
      for (const sp of spots) {
        // Facet: another lens on a hub place — stamp, cross-reference, and
        // the activity delta only. No number, no checkbox, no re-description.
        if (sp.facetOf) {
          doc.font(F.body).fontSize(10);
          const fh = doc.heightOfString(sp.why, { width: W, lineGap: 1.6 }) + 52;
          if (doc.y + fh > doc.page.height - doc.page.margins.bottom) doc.addPage();
          const fIcon = c.icons && c.icons[sp.name];
          if (fIcon && STAMP_ICONS[fIcon]) drawStamp(doc, fIcon, 45, doc.y + 8);
          const hn = hubNo[sp.facetOf];
          doc.font(F.displayLight).fontSize(7.5).fillColor(CORAL)
            .text(hn ? `SEE N° ${String(hn).padStart(2, '0')}` : 'SEE THE PLACES', 64, doc.y, { characterSpacing: 1.5, continued: true })
            .fillColor(INK_SOFT)
            .text('  ·  ' + (sp.area || sp.facetOf).toUpperCase(), { characterSpacing: 1.5 });
          doc.moveDown(0.12);
          doc.font(F.display).fontSize(11.5).fillColor(INK).text(sp.name, 64, doc.y, { width: W, link: mapsLink(sp) });
          doc.moveDown(0.14);
          doc.font(F.body).fontSize(10).fillColor(INK_SOFT).text(sp.why, { width: W, lineGap: 1.6 });
          if (sp.best) {
            doc.moveDown(0.14);
            doc.font(F.display).fontSize(7.5).fillColor(CORAL).text(sp.best.toUpperCase(), { characterSpacing: 1.2 });
          }
          doc.moveDown(0.7);
          continue;
        }
        spotNo++;
        hubNo[sp.name] = spotNo;
        doc.font(F.body).fontSize(10.5);
        const bodyH =
          doc.heightOfString(sp.why, { width: W - 44 }) +
          (sp.tip ? doc.heightOfString(sp.tip, { width: W }) : 0) + 78 +
          (sp.access ? 14 : 0) +
          (c.photos && c.photos[sp.name] ? (c.photos[sp.name].size === 'large' ? 194 : 134) : 0);
        if (doc.y + bodyH > doc.page.height - doc.page.margins.bottom) doc.addPage();

        const link = mapsLink(sp);
        const qr = qrMap[link];
        // The printed page's tap target: a small ink QR on the right rail,
        // level with the entry's marker line. Name and body wrap short of it.
        if (qr) {
          try { doc.image(qr, 64 + W - 34, doc.y, { width: 34, height: 34 }); } catch (e) { /* render without */ }
        }
        const entryW = qr ? W - 44 : W;
        // Reference marker line: coral number, then the surveyed location.
        doc.font(F.displayLight).fontSize(7.5).fillColor(CORAL)
          .text(String(spotNo).padStart(2, '0'), 64, doc.y, { characterSpacing: 1.5, continued: true })
          .fillColor(INK_SOFT)
          .text('  ·  ' + sp.area.toUpperCase(), { characterSpacing: 1.5 });
        doc.moveDown(0.12);
        // Left rail: the entry's stamp medallion (when the guide's icons
        // map names one) with the been-there checkbox beneath — otherwise
        // the checkbox alone rides the name line. A static square is drawn
        // first so viewers that skip widget appearances (and paper) still
        // show the box; the interactive field sits exactly on top of it.
        const railIcon = c.icons && c.icons[sp.name];
        let boxX = 44, boxY = doc.y + 2;
        if (railIcon && STAMP_ICONS[railIcon]) {
          drawStamp(doc, railIcon, 45, doc.y + 10);
          boxX = 39.5; boxY = doc.y + 28;
        }
        doc.rect(boxX, boxY, 11, 11).lineWidth(0.9).stroke(MOSS);
        try {
          doc.formCheckbox(`been-${guide.slug}-${spotNo}`, boxX, boxY, 11, 11, {
            borderColor: MOSS, backgroundColor: PAPER
          });
        } catch (e) { /* a reader without form support still sees the square */ }
        doc.font(F.display).fontSize(13.5).fillColor(INK).text(sp.name, 64, doc.y, { width: entryW, link });
        doc.moveDown(0.16);
        doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(sp.why, { width: entryW, lineGap: 1.8 });
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
        // Flagship sub-blocks: an anchor place's every use on one spread —
        // THE WALK / THE PADDLE / THE CAST — replacing scattered repeats.
        if (Array.isArray(sp.flagship) && sp.flagship.length) {
          for (const fb of sp.flagship) {
            doc.font(F.body).fontSize(10);
            const fbH = doc.heightOfString(fb.x, { width: W - 20, lineGap: 1.6 }) + 26;
            if (doc.y + fbH > doc.page.height - doc.page.margins.bottom) doc.addPage();
            doc.moveDown(0.42);
            doc.font(F.display).fontSize(8.5).fillColor(MOSS)
              .text(fb.t.toUpperCase(), 64, doc.y, { characterSpacing: 1.8 });
            doc.moveDown(0.12);
            doc.font(F.body).fontSize(10).fillColor(INK_SOFT).text(fb.x, 84, doc.y, { width: W - 20, lineGap: 1.6 });
          }
        }
        // Photo plate: an openly-licensed photograph of the place itself,
        // framed like a plate in a field monograph, credit beneath.
        const plate = c.photos && c.photos[sp.name];
        if (plate) {
          const ph = loadPhoto(plate.key);
          if (ph) {
            usedPhotos.push(ph.credit);
            const phH = plate.size === 'large' ? 168 : 108;
            if (doc.y + phH + 26 > doc.page.height - doc.page.margins.bottom) doc.addPage();
            const py = doc.y + 6;
            photoBand(doc, ph.buffer, 64, py, W, phH, ph.credit && ph.credit.focal);
            doc.rect(64, py, W, phH).lineWidth(0.8).stroke(INK);
            doc.font(F.displayLight).fontSize(6).fillColor(INK_SOFT)
              .text(creditLine(ph.credit), 64, py + phH + 5, { width: W, characterSpacing: 1.2, lineBreak: false });
            doc.y = py + phH + 14;
          }
        }
        doc.moveDown(0.78);
      }
      // Field companions: a labelled species-plate row closing the section —
      // honest wildlife images, never a stand-in photo of some other park.
      const comp = c.companions && c.companions[label];
      if (comp && Array.isArray(comp.species) && comp.species.length) {
        const shots = comp.species.map(s => ({ s, ph: loadPhoto(s.key) })).filter(x => x.ph).slice(0, 3);
        if (shots.length) {
          const gap = 12, cw = Math.floor((W - gap * (shots.length - 1)) / shots.length), chh = 96;
          if (doc.y + chh + 100 > pageBottom()) doc.addPage();
          doc.y += 10;
          doc.font(F.display).fontSize(10).fillColor(MOSS)
            .text('FIELD COMPANIONS', 64, doc.y, { characterSpacing: 2 });
          if (comp.note) {
            doc.moveDown(0.15);
            doc.font(F.bodyItalic).fontSize(9).fillColor(INK_SOFT).text(comp.note, 64, doc.y, { width: W });
          }
          doc.y += 8;
          const rowY = doc.y;
          shots.forEach((x, i) => {
            const px = 64 + i * (cw + gap);
            usedPhotos.push(x.ph.credit);
            photoBand(doc, x.ph.buffer, px, rowY, cw, chh, x.ph.credit && x.ph.credit.focal);
            doc.rect(px, rowY, cw, chh).lineWidth(0.8).stroke(INK);
            doc.font(F.display).fontSize(7).fillColor(INK)
              .text(x.s.label.toUpperCase(), px, rowY + chh + 6, { width: cw, characterSpacing: 1, lineBreak: false });
            if (x.s.sub) {
              doc.font(F.displayLight).fontSize(6).fillColor(INK_SOFT)
                .text(x.s.sub.toUpperCase(), px, rowY + chh + 16, { width: cw, characterSpacing: 0.8, lineBreak: false });
            }
          });
          doc.y = rowY + chh + 28;
          doc.font(F.displayLight).fontSize(5.5).fillColor(INK_SOFT)
            .text(shots.map(x => creditLine(x.ph.credit)).join('   ·   '), 64, doc.y, { width: W, characterSpacing: 0.6 });
          doc.y += 16;
        }
      }
      fillTail();
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
    if (c.heritage && c.heritage.length) {
      renderSpots('The heritage layer',
        'The human history threaded through the green — an artist\'s village, settler mills, and streets older than the province. Every entry pairs with a park in this book.', c.heritage);
    }

    // ---------- bonus page: patios & rooftops ----------
    // The edition's rotating food shortlist. Unnumbered and outside the
    // field-checked count/ledger — these are venues, not nature spots.
    // Slots are sponsorable; the disclosure panel says exactly how.
    if (c.bonus && Array.isArray(c.bonus.entries) && c.bonus.entries.length) {
      opener('Bonus: ' + c.bonus.title, c.bonus.blurb);
      for (const b of c.bonus.entries) {
        const link = mapsLink(b);
        const qr = qrMap[link];
        doc.font(F.body).fontSize(10.5);
        const bh = doc.heightOfString(b.why, { width: W - 44 }) + 60;
        if (doc.y + bh > pageBottom()) doc.addPage();
        if (qr) {
          try { doc.image(qr, 64 + W - 34, doc.y, { width: 34, height: 34 }); } catch (e) { /* without */ }
        }
        drawStamp(doc, 'patio', 45, doc.y + 10);
        doc.font(F.displayLight).fontSize(7.5).fillColor(INK_SOFT)
          .text(b.area.toUpperCase(), 64, doc.y, { characterSpacing: 1.5 });
        doc.moveDown(0.12);
        doc.font(F.display).fontSize(13.5).fillColor(INK).text(b.name, 64, doc.y, { width: W - 44, link });
        doc.moveDown(0.16);
        doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(b.why, { width: W - 44, lineGap: 1.8 });
        if (b.pair) {
          doc.moveDown(0.18);
          doc.font(F.display).fontSize(7.5).fillColor(CORAL).text(b.pair.toUpperCase(), { characterSpacing: 1.2 });
        }
        doc.moveDown(0.8);
      }
      if (c.bonus.disclosure) {
        doc.moveDown(0.3);
        doc.font(F.body).fontSize(9.5);
        const dh = doc.heightOfString(c.bonus.disclosure, { width: W - 36, lineGap: 1.6 });
        if (doc.y + dh + 48 > pageBottom()) doc.addPage();
        const py = doc.y;
        doc.roundedRect(64, py, W, dh + 44, 8).fill(PAPER_DIM);
        doc.font(F.display).fontSize(9).fillColor(MOSS).text('HOW THIS PAGE WORKS', 82, py + 13, { characterSpacing: 2 });
        doc.font(F.body).fontSize(9.5).fillColor(INK_SOFT).text(c.bonus.disclosure, 82, doc.y + 5, { width: W - 36, lineGap: 1.6 });
        doc.y = py + dh + 52;
      }
      fillTail();
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
      doc.moveDown(0.4);
      // Steps as a timeline: numbered coral stops on a moss route line.
      let prevDotY = null;
      it.steps.forEach((step, si) => {
        const stepY = doc.y;
        const dotY = stepY + 6;
        if (prevDotY != null) {
          doc.moveTo(71, prevDotY + 7).lineTo(71, dotY - 7).lineWidth(1).stroke(MOSS);
        }
        doc.circle(71, dotY, 6.5).fill(CORAL);
        doc.font(F.display).fontSize(6.5).fillColor('#FFFFFF')
          .text(String(si + 1), 66, dotY - 3.2, { width: 10, align: 'center', lineBreak: false });
        doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT)
          .text(step, 88, stepY, { width: W - 26, lineGap: 1.8 });
        prevDotY = dotY;
        doc.moveDown(0.3);
      });
      doc.moveDown(0.6);
    }

    // ---------- the day pack: tickable checklists ----------
    // Real AcroForm boxes like the been-there ledger — tick before the door,
    // save the PDF, it remembers. Shared across every guide.
    {
      opener('The day pack', 'Three lists, checked at the door. Tick them in any PDF reader and save — the boxes remember.');
      const PACKS = [
        ['The every-trip pack', [
          'Water — a litre per person, more in July heat',
          'Snacks that survive a backpack',
          'Bug spray (May–September) and sunscreen',
          'Phone charged — and this PDF saved offline',
          'Small first-aid kit, plus any personal meds',
          'Hat, and one layer more than the forecast suggests',
          'Dry socks waiting in the car — hiking\'s cheapest luxury',
          'A bag to carry your garbage back out'
        ]],
        ['With small companions', [
          'Double the snacks, halve the distance plan',
          'Wipes, and a full change of clothes',
          'Towel — every child finds the water',
          'Bucket or net for pond edges (catch, look, release)',
          'The stroller check: match your wheels to the SURFACE column',
          'Patience for the fourth playground stop'
        ]],
        ['Winter add-ons', [
          'Traction cleats — valley paths ice first',
          'Thermos of something hot',
          'Headlamp: dark arrives before 5 pm',
          'Sit pad for cold benches',
          'Hand warmers in the glovebox'
        ]]
      ];
      PACKS.forEach(([title, items], gi) => {
        if (doc.y + 30 + items.length * 19 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        doc.font(F.display).fontSize(10.5).fillColor(MOSS)
          .text(title.toUpperCase(), 64, doc.y, { characterSpacing: 1.8 });
        doc.moveDown(0.4);
        for (let ii = 0; ii < items.length; ii++) {
          const y0 = doc.y;
          doc.rect(64, y0 + 1, 11, 11).lineWidth(0.9).stroke(MOSS);
          try {
            doc.formCheckbox(`pack-${guide.slug}-${gi}-${ii}`, 64, y0 + 1, 11, 11, {
              borderColor: MOSS, backgroundColor: PAPER
            });
          } catch (e) { /* square still prints */ }
          doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT)
            .text(items[ii], 84, y0, { width: W - 20, lineGap: 1.4 });
          doc.y = Math.max(doc.y, y0 + 13) + 6;
        }
        doc.moveDown(0.7);
      });

      // ---------- the field ledger: ranks earned, not given ----------
      const ranks = Array.isArray(c.ledger) && c.ledger.length === 4
        ? c.ledger : ['Day Scout', 'Pathfinder', 'Field Ranger', 'Completionist'];
      // Thresholds scale with the honest place count.
      const thresholds = [5, Math.round(total * 0.4), Math.round(total * 0.7), total];
      if (doc.y + 220 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      else doc.y += 6;
      doc.font(F.display).fontSize(14).fillColor(INK).text('THE FIELD LEDGER', 64, doc.y, { characterSpacing: 1.8 });
      rule(64, doc.y + 6, 118);
      doc.y += 16;
      doc.font(F.body).fontSize(10.5).fillColor(INK_SOFT).text(
        `All ${total} places in this book carry a been-there checkbox. Tick them as you go — the ranks below are earned on the ground, claimed here.`,
        64, doc.y, { width: W, lineGap: 2 });
      doc.moveDown(1.2);
      const stampY = doc.y + 40;
      thresholds.forEach((th, ri) => {
        const cx = 64 + (W * (ri + 0.5)) / 4;
        const last = ri === 3;
        const ring = last ? CORAL : MOSS;
        doc.circle(cx, stampY, 36).lineWidth(1.4).stroke(ring);
        doc.circle(cx, stampY, 30).lineWidth(0.6).stroke(ring);
        doc.font(F.display).fontSize(16).fillColor(last ? CORAL : INK)
          .text(String(th), cx - 30, stampY - 12, { width: 60, align: 'center', lineBreak: false });
        doc.font(F.displayLight).fontSize(5.5).fillColor(INK_SOFT)
          .text('PLACES', cx - 30, stampY + 6, { width: 60, align: 'center', characterSpacing: 2, lineBreak: false });
        // Rank label shrinks to fit its column — long titles wrapped into
        // the checkbox before this.
        let rs = 7.5;
        doc.font(F.display).fontSize(rs);
        while (doc.widthOfString(ranks[ri].toUpperCase(), { characterSpacing: 1.2 }) > 116 && rs > 5.5) {
          rs -= 0.5; doc.fontSize(rs);
        }
        doc.fillColor(INK)
          .text(ranks[ri].toUpperCase(), cx - 60, stampY + 47, { width: 120, align: 'center', characterSpacing: 1.2, lineBreak: false });
        doc.rect(cx - 5.5, stampY + 62, 11, 11).lineWidth(0.9).stroke(ring);
        try {
          doc.formCheckbox(`rank-${guide.slug}-${ri}`, cx - 5.5, stampY + 62, 11, 11, {
            borderColor: ring, backgroundColor: PAPER
          });
        } catch (e) { /* square still prints */ }
      });
      doc.y = stampY + 90;

      // ---------- the firsts log ----------
      // The ledger's memory: first heron, first salmon leap, first
      // trillium — logged by hand on ruled lines.
      if (pageBottom() - doc.y > 210) {
        doc.y += 16;
        doc.font(F.display).fontSize(14).fillColor(INK).text('FIRSTS', 64, doc.y, { characterSpacing: 1.8 });
        rule(64, doc.y + 6, 118);
        doc.y += 14;
        doc.font(F.bodyItalic).fontSize(9.5).fillColor(INK_SOFT)
          .text('First heron. First salmon leap. First trillium of the spring. Log them — a year from now this table is the best page in the book.', 64, doc.y, { width: W, lineGap: 1.6 });
        doc.y += 10;
        doc.font(F.displayLight).fontSize(5.5).fillColor(MOSS);
        doc.text('THE FIRST', 64, doc.y, { characterSpacing: 1.2, lineBreak: false });
        doc.text('WHERE', 268, doc.y, { characterSpacing: 1.2, lineBreak: false });
        doc.text('WHEN', 440, doc.y, { characterSpacing: 1.2, lineBreak: false });
        doc.y += 2;
        noteLines(Math.min(6, Math.floor((pageBottom() - 40 - doc.y) / 26)));
      }
      if (pageBottom() - doc.y > 140) motifBand(doc.y + 14, pageBottom() - doc.y - 22);
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

    // ---------- fill the contents page (pages are known now) ----------
    doc.switchToPage(tocPageIndex);
    doc.font(F.display).fontSize(20).fillColor(INK)
      .text('CONTENTS', 64, 72, { characterSpacing: 2 });
    rule(64, 100, 118);
    let tocY = 128;
    for (const s of sections) {
      const num = String(s.pageIndex + 1);
      doc.font(F.display).fontSize(11.5).fillColor(INK)
        .text(s.label.toUpperCase(), 64, tocY, { characterSpacing: 1.4, lineBreak: false });
      const labelW = doc.widthOfString(s.label.toUpperCase(), { characterSpacing: 1.4 });
      doc.font(F.displayLight).fontSize(9).fillColor(INK_SOFT)
        .text(num, 64, tocY + 1.5, { width: W, align: 'right', lineBreak: false });
      const dotsStart = 64 + labelW + 10;
      const dotsEnd = 64 + W - doc.widthOfString(num) - 12;
      for (let dx = dotsStart; dx < dotsEnd; dx += 7) {
        doc.circle(dx, tocY + 8, 0.6).fill(MOSS);
      }
      // Whole row is one tap target (explicit rect — the goTo text option
      // emits NaN coords under lineBreak:false).
      doc.goTo(64, tocY - 3, W, 20, s.dest);
      tocY += 26;
    }
    doc.font(F.bodyItalic).fontSize(10).fillColor(MOSS)
      .text('Every line is tappable — and so is every place name in the book.', 64, tocY + 12, { width: W });
    // The survey reclaims the contents page's lower half.
    {
      const top = tocY + 48, bottom = doc.page.height - 74;
      if (bottom - top > 140) motifBand(top, bottom - top);
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
