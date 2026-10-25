// services/personalGuidePdf.js — DayHop V2
// Renders a personalized trip guide (services/personalGuide.js record) as a
// keepsake PDF in the city guides' "Quiet Cartography" language: contour
// lines, one coral thread, Satoshi/Inter type, coordinates as furniture.
// Pure over the stored record: same record in, same pages out, so a
// re-download a year later is the same book.
//
// House copy rule applies to every string written here (no dash
// punctuation); quoted Wikipedia text and listing names print as sourced.

const PDFDocument = require('pdfkit');
const { registerFonts } = require('./cityGuides');
const { placeSet } = require('./samePlace');

const INK = '#102A2E';
const INK_SOFT = '#41585C';
const CORAL = '#E1502F';
const MOSS = '#3F6F5C';
const PAPER = '#FBF7EE';
const PAPER_DIM = '#F2ECDC';
const LINE = '#E3DCC9';

const M = 64;           // side margin
const TOP = 72;
const BOTTOM = 70;

function fmtDate(ymd, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!ymd) return '';
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-CA', Object.assign({ timeZone: 'UTC' }, opts));
}
function fmtRange(a, b) {
  if (!b || a === b) return fmtDate(a, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const sameYear = a.slice(0, 4) === b.slice(0, 4);
  return `${fmtDate(a, { month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} to ${fmtDate(b, { month: 'long', day: 'numeric', year: 'numeric' })}`;
}
function coordsLabel(c) {
  const ns = c.lat >= 0 ? 'N' : 'S', ew = c.lng >= 0 ? 'E' : 'W';
  return `${Math.abs(c.lat).toFixed(2)}° ${ns} · ${Math.abs(c.lng).toFixed(2)}° ${ew}`;
}

// "9350 Markham Rd, Markham, ON L3P 3J3, Canada" → "9350 Markham Rd, Markham".
const cleanWhere = s => String(s || '').replace(/,\s*Canada$/, '').replace(/,?\s*ON\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d/, '').replace(/,\s*ON$/, '').trim();

// One recommendation per place. What the edition features up front (Grok's
// must-sees, plan, rainy picks and events, or the code edition's must-sees)
// leaves the catalog chapters, and a place two chapters both list (a trail
// that is also a day trip, a drive that is also a day trip) stays in the
// first. The persona run printed Edwards Gardens twice in one chapter and
// every must-see again further on.
const PLACEHOLDER_ROUTE = /^(un)?signed route$|^unnamed\b/i;
function featureOnce(g, G) {
  const ids = r => r.listing || r;
  const seen = placeSet(G
    ? [...G.mustSee.map(ids), ...G.weeks.flatMap(w => w.plan.map(ids)), ...G.rainy.map(ids), ...G.events.map(e => e.title)]
    : g.mustSee);
  const keep = list => (list || []).filter(e => seen.claim(e));
  const osmKeep = list => (list || []).filter(e => !PLACEHOLDER_ROUTE.test(String(e.name).trim()) && seen.claim(e.name));
  return {
    nature: keep(g.nature), hike: osmKeep(g.routes.hike), bike: osmKeep(g.routes.bike),
    drives: keep(g.drives), dayTrips: keep(g.dayTrips),
    food: keep(g.food), culture: keep(g.culture), family: keep(g.family), active: keep(g.active), more: keep(g.more)
  };
}

// Pixels for every photo the record references (services/placePhotos.js),
// loaded before drawing because pdfkit draws synchronously. A guide with no
// photos (older records, tests) renders the photo-free layout.
async function prefetchPhotos(g) {
  const out = { byTitle: new Map(), scenes: [] };
  if (!g.photos) return out;
  const { loadPixels } = require('./placePhotos');
  const jobs = [
    ...Object.entries(g.photos.byTitle || {}).map(([title, ref]) => ({ title, ref })),
    ...(g.photos.scenes || []).map(ref => ({ scene: true, title: ref.subject, ref }))
  ];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const buf = await loadPixels(j.ref);
      if (!buf) continue;
      const p = { buf, ref: j.ref, title: j.title };
      if (j.scene) out.scenes.push(p); else out.byTitle.set(j.title, p);
    }
  }));
  return out;
}

async function renderPersonalGuidePdf(g) {
  const pix = await prefetchPhotos(g);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER', margins: { top: TOP, bottom: BOTTOM, left: M, right: M }, bufferPages: true,
      info: { Title: `${g.order.city}: your DayHop trip guide`, Author: 'DayHop', Subject: fmtRange(g.order.start, g.order.end) }
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc, g, pix);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function draw(doc, g, pix = { byTitle: new Map(), scenes: [] }) {
  const F = registerFonts(doc);
  const W = doc.page.width - 2 * M;
  const PW = doc.page.width;
  const pageBottom = () => doc.page.height - BOTTOM;
  const sections = [];
  const city = g.order.city;
  const G = g.grok || null;

  const paper = () => doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAPER);
  doc.on('pageAdded', paper);
  paper();

  // ---------- photos ----------
  // Every photo drawn is credited at the back (author, licence, source).
  const credits = new Map();
  const shownBig = new Set();
  let sceneIdx = 0;
  const photoOf = title => (title && pix.byTitle.get(title)) || null;
  // Beside an entry, with no caption, a photo reads as "this is the place",
  // so only photos OF it go there: a DayHop hero, the place's own Wikipedia
  // article, or a Commons file named for it. A photo merely taken nearby is
  // shown large, captioned "Near …" (a Metro store is not Kart Town).
  const thumbOf = title => { const p = photoOf(title); return p && !p.ref.near ? p : null; };
  const nextScene = () => (pix.scenes.length ? pix.scenes[sceneIdx++ % pix.scenes.length] : null);
  const unusedPlacePhoto = () => [...pix.byTitle.values()].find(p => !shownBig.has(p)) || null;
  const placeLabel = p => String(p.title || '').split(/\s[—–-]\s|:\s/)[0];
  const captionOf = p => (p.ref.near ? `Near ${placeLabel(p)}` : placeLabel(p));
  const photoAt = (p, x, y, w, h, r = 0) => {
    doc.save();
    if (r) doc.roundedRect(x, y, w, h, r).clip(); else doc.rect(x, y, w, h).clip();
    if (!p.img) p.img = doc.openImage(p.buf); // embedded once, reused on every page
    doc.image(p.img, x, y, { cover: [w, h], align: 'center', valign: p.ref.focal === 'top' ? 'top' : 'center' });
    doc.restore();
    const k = p.ref.local || p.ref.url;
    if (!credits.has(k)) credits.set(k, p);
  };
  const creditText = p => {
    const c = p.ref.credit || {};
    return `${captionOf(p)} · Photo: ${String(c.author || 'Wikimedia Commons').normalize('NFD').replace(/[̀-ͯ]/g, '')}, ${c.licence || ''}`;
  };
  // Photos waiting to be shown large at the end of the current chapter.
  let chapterPhotos = [];
  let fillable = false;
  // The empty tail of a page becomes a captioned photograph: a place from
  // this chapter first, then any place not yet shown large, then the town.
  const fillRest = () => {
    if (!fillable) return;
    const room = pageBottom() - doc.y - 16;
    if (room < 150) return;
    const p = chapterPhotos.find(x => !shownBig.has(x)) || unusedPlacePhoto() || nextScene();
    if (!p) return;
    shownBig.add(p);
    const h = Math.min(room - 20, 340);
    const y = doc.y + 12;
    photoAt(p, M, y, W, h, 8);
    // The caption sits at the margin's edge: lift the margin while writing
    // it, or pdfkit starts a blank page for one line of credit.
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(F.displayLight).fontSize(7).fillColor(INK_SOFT)
      .text(creditText(p).toUpperCase(), M, y + h + 6, { width: W, characterSpacing: 1, lineBreak: false, ellipsis: true });
    doc.page.margins.bottom = keep;
  };

  const contours = (y0, h, seed) => {
    doc.save();
    for (let i = 0; i < 9; i++) {
      const y = y0 + (h / 9) * i;
      doc.moveTo(-10, y);
      for (let x = -10; x <= doc.page.width + 10; x += 8) {
        doc.lineTo(x, y + Math.sin((x + seed * 37 + i * 61) / 70) * 7 + Math.cos((x + i * 13) / 31) * 3);
      }
      doc.lineWidth(i === 4 ? 1.6 : 0.6).strokeColor(i === 4 ? CORAL : MOSS).stroke();
    }
    doc.restore();
  };

  // ---------- cover ----------
  // A full-bleed photograph of the place when there is one; the contour
  // motif when there is not.
  const coverPhoto = pix.scenes[0] || unusedPlacePhoto();
  let titleY = 284;
  if (coverPhoto) {
    if (pix.scenes[0]) sceneIdx = 1;
    shownBig.add(coverPhoto);
    photoAt(coverPhoto, 0, 0, PW, 430);
    doc.rect(0, 430, PW, 3).fill(CORAL);
    doc.font(F.displayLight).fontSize(6.5).fillColor(INK_SOFT)
      .text(creditText(coverPhoto).toUpperCase(), M, 440, { width: W, align: 'right', characterSpacing: 1, lineBreak: false, ellipsis: true });
    titleY = 486;
  } else {
    contours(70, 150, g.order.city.length);
  }
  doc.font(F.displayLight).fontSize(9).fillColor(INK_SOFT)
    .text('DAYHOP · A TRIP GUIDE MADE FOR ONE TRIP', M, titleY - 24, { width: W, characterSpacing: 2.4 });
  doc.font(F.display).fontSize(city.length > 14 ? 40 : 54).fillColor(INK)
    .text(city.toUpperCase(), M, titleY, { width: W, characterSpacing: 1.2, lineGap: -4 });
  doc.moveDown(0.3);
  doc.font(F.bodyItalic).fontSize(15).fillColor(MOSS).text(fmtRange(g.order.start, g.order.end), M, doc.y, { width: W });
  if (g.order.name || g.order.party) {
    doc.moveDown(0.6);
    doc.font(F.body).fontSize(12).fillColor(INK_SOFT)
      .text([g.order.name && `Made for ${g.order.name}`, g.order.party && `Travelling ${g.order.party}`].filter(Boolean).join(' · '), M, doc.y, { width: W });
  }
  // The book at a glance: big numbers over small labels, a coral rule above.
  const C = featureOnce(g, G);
  const nights = Math.round((Date.parse(g.order.end) - Date.parse(g.order.start)) / 864e5) + 1;
  const stats = [
    [nights, nights === 1 ? 'day' : 'days'],
    [(G ? G.mustSee : g.mustSee).length, 'must-sees'],
    [(G ? G.events : g.events.trip).length, 'events on your dates'],
    G ? [G.weeks.reduce((n, w) => n + w.plan.length, 0), 'planned outings'] : [g.days.length, 'day plans'],
    [g.overnight.camping.length + g.overnight.rv.length, 'places to camp']
  ].filter(([n]) => n > 0).slice(0, 5);
  const statY = Math.max(doc.y + 46, doc.page.height - 156);
  doc.rect(M, statY - 18, W, 0.8).fill(LINE);
  doc.rect(M, statY - 18, 118, 2).fill(CORAL);
  const colW = W / Math.max(stats.length, 1);
  stats.forEach(([n, label], i) => {
    const x = M + i * colW;
    doc.font(F.display).fontSize(26).fillColor(INK).text(String(n), x, statY, { width: colW - 8, lineBreak: false });
    doc.font(F.displayLight).fontSize(7).fillColor(INK_SOFT).text(label.toUpperCase(), x, statY + 32, { width: colW - 8, characterSpacing: 1.2 });
  });
  doc.font(F.displayLight).fontSize(7.5).fillColor(INK_SOFT)
    .text(coordsLabel(g.center).toUpperCase(), M, Math.min(statY + 66, doc.page.height - 40), { width: W, characterSpacing: 1.6, lineBreak: false });

  // ---------- page furniture ----------
  // A chapter opens under a full-bleed photo band: a place from the chapter
  // (items) when one has a photo, otherwise a photo of the town.
  const opener = (label, blurb, items = []) => {
    fillRest();
    doc.addPage();
    fillable = true;
    sections.push({ label, page: doc.bufferedPageRange().count - 1, no: sections.length + 1 });
    chapterPhotos = items.map(e => photoOf(e.photoTitle || e.title)).filter(Boolean);
    // Bands headline a chapter: only photos OF a place, or the town itself.
    const band = chapterPhotos.find(p => !shownBig.has(p) && !p.ref.near)
      || [...pix.byTitle.values()].find(p => !shownBig.has(p) && !p.ref.near)
      || nextScene();
    let top = TOP;
    if (band) {
      shownBig.add(band);
      photoAt(band, 0, 0, PW, 200);
      doc.rect(0, 200, PW, 2).fill(CORAL);
      doc.font(F.displayLight).fontSize(6.5).fillColor(INK_SOFT)
        .text(creditText(band).toUpperCase(), M, 208, { width: W, align: 'right', characterSpacing: 1, lineBreak: false, ellipsis: true });
      top = 226;
    }
    // Chapter number as a small coral kicker over the title.
    doc.font(F.displayLight).fontSize(8).fillColor(CORAL)
      .text(`CHAPTER ${String(sections.length).padStart(2, '0')}`, M, top, { width: W, characterSpacing: 2.2, lineBreak: false });
    top += 15;
    doc.font(F.display).fontSize(20).fillColor(INK).text(label.toUpperCase(), M, top, { width: W, characterSpacing: 1.6 });
    doc.rect(M, doc.y + 6, 118, 2).fill(CORAL);
    doc.y += 20;
    if (blurb) {
      doc.font(F.bodyItalic).fontSize(11).fillColor(MOSS).text(blurb, M, doc.y, { width: W - 30, lineGap: 2 });
      doc.moveDown(0.9);
    }
  };
  const sub = label => {
    if (doc.y + 60 > pageBottom()) { fillRest(); doc.addPage(); }
    doc.moveDown(0.4);
    doc.font(F.display).fontSize(10.5).fillColor(MOSS).text(label.toUpperCase(), M, doc.y, { width: W, characterSpacing: 1.4 });
    doc.moveDown(0.35);
  };
  const para = (text, opts = {}) => {
    doc.font(opts.italic ? F.bodyItalic : F.body).fontSize(opts.size || 10.5).fillColor(opts.color || INK);
    const h = doc.heightOfString(text, { width: W, lineGap: 2 });
    if (doc.y + Math.min(h, 120) > pageBottom()) { fillRest(); doc.addPage(); }
    doc.text(text, M, doc.y, { width: W, lineGap: 2 });
    doc.moveDown(0.6);
  };
  const meta = e => [
    e.date && `${fmtDate(e.date)}${e.end && e.end !== e.date ? ` to ${fmtDate(e.end)}` : ''}${e.time ? `, ${e.time}` : ''}`,
    cleanWhere(e.where),
    e.km != null && `${e.km} km from ${city}`,
    e.rating && `${e.rating.toFixed(1)}★${e.reviews ? ` (${e.reviews.toLocaleString('en-CA')})` : ''}`,
    e.cost && e.cost !== 'free' ? e.cost : e.cost === 'free' ? 'free' : null,
    e.ages && `ages ${e.ages}`
  ].filter(Boolean).join(' · ');
  const THUMB_W = 104, THUMB_H = 78;
  const BADGE_W = 40, BADGE_H = 44;
  // A calendar leaf: weekday, day, month, in paper on ink.
  const dateBadge = (ymd, x, y, fill = INK) => {
    doc.roundedRect(x, y, BADGE_W, BADGE_H, 5).fill(fill);
    const line = (t, font, size, dy) => doc.font(font).fontSize(size).fillColor(PAPER)
      .text(t, x, y + dy, { width: BADGE_W, align: 'center', characterSpacing: size < 9 ? 0.8 : 0, lineBreak: false });
    line(fmtDate(ymd, { weekday: 'short' }).toUpperCase(), F.displayLight, 6.5, 6);
    line(fmtDate(ymd, { day: 'numeric' }), F.display, 16, 14);
    line(fmtDate(ymd, { month: 'short' }).toUpperCase(), F.displayLight, 6.5, 32);
  };
  // A coral disc with a number: the must-sees are a ranked list.
  const numberDisc = (n, cx, cy, r = 10) => {
    doc.circle(cx, cy, r).fill(CORAL);
    doc.font(F.display).fontSize(r > 10 ? 11 : 9.5).fillColor(PAPER)
      .text(String(n), cx - r, cy - (r > 10 ? 6.5 : 5.6), { width: 2 * r, align: 'center', lineBreak: false });
  };
  const thumbsShown = new Set();
  // One listing. opts:
  //   badge: 'YYYY-MM-DD'  a date leaf instead of a dot
  //   number: n            a numbered coral disc (on the photo when there is one)
  //   tag: 'text'          a small coral kicker over the title
  //   noPhoto / freshThumb no thumbnail / only a thumbnail not shown before
  //   noMeta / noWhat      leave out the meta line / the description
  const entry = (e, opts = {}) => {
    const what = e.what && !opts.noWhat ? e.what : '';
    let p = opts.noPhoto ? null : thumbOf(e.photoTitle || e.title);
    if (p && opts.freshThumb && thumbsShown.has(p)) p = null;
    // A dated entry keeps its leaf on the left and puts the photo right.
    const photoRight = !!(p && opts.badge);
    const lead = photoRight ? BADGE_W + 14 : p ? THUMB_W + 14 : opts.badge ? BADGE_W + 14 : opts.number ? 30 : 14;
    const tx = M + lead;                          // text column
    const tw = M + W - tx - (photoRight ? THUMB_W + 14 : 0);
    const m = opts.noMeta ? '' : meta(e);
    doc.font(F.body).fontSize(9.8);
    const textH = 24 + (opts.tag ? 12 : 0) + (m ? 12 : 0) + (e.url ? 12 : 0) + (what ? doc.heightOfString(what, { width: tw - 4, lineGap: 1.5 }) : 0);
    const need = Math.max(textH, p ? THUMB_H + 6 : opts.badge ? BADGE_H + 4 : 0);
    if (doc.y + need > pageBottom()) { fillRest(); doc.addPage(); }
    const y = doc.y;
    if (photoRight) {
      dateBadge(opts.badge, M, y + 1, opts.badgeFill || INK);
      photoAt(p, M + W - THUMB_W, y + 2, THUMB_W, THUMB_H, 6);
      thumbsShown.add(p);
    } else if (p) {
      photoAt(p, M, y + 2, THUMB_W, THUMB_H, 6);
      thumbsShown.add(p);
      if (opts.number) numberDisc(opts.number, M + 14, y + 16, 11);
    } else if (opts.badge) dateBadge(opts.badge, M, y + 1, opts.badgeFill || INK);
    else if (opts.number) numberDisc(opts.number, M + 10, y + 7);
    else doc.circle(M + 3, y + 6, 2.4).fill(opts.dot || MOSS);
    doc.y = y;
    if (opts.tag) doc.font(F.displayLight).fontSize(7).fillColor(CORAL).text(opts.tag.toUpperCase(), tx, y, { width: tw, characterSpacing: 1.4 });
    doc.font(F.bodyBold).fontSize(11).fillColor(INK).text(e.title, tx, doc.y + (opts.tag ? 2 : 0), { width: tw, link: e.maps, underline: false });
    if (m) doc.font(F.body).fontSize(8.6).fillColor(INK_SOFT).text(m, tx, doc.y + 1, { width: tw });
    if (what) doc.font(F.body).fontSize(9.8).fillColor(INK).text(what, tx, doc.y + 3, { width: tw - 4, lineGap: 1.5 });
    if (e.url) doc.font(F.body).fontSize(8.6).fillColor(CORAL).text(opts.urlLabel || (e.date ? 'Tickets and details' : 'Website'), tx, doc.y + 2, { link: e.url, underline: true, width: tw });
    const floor = y + (p ? THUMB_H + 4 : opts.badge ? BADGE_H + 2 : 0);
    if (doc.y < floor) doc.y = floor;
    // A hairline under each entry keeps a long chapter readable as a list.
    const ruleY = doc.y + 7;
    if (ruleY < pageBottom()) doc.rect(tx, ruleY, M + W - tx, 0.5).fill(LINE);
    doc.y = ruleY + 10;
  };
  const list = (items, empty, opts) => {
    if (!items || !items.length) { if (empty) para(empty, { italic: true, color: INK_SOFT, size: 10 }); return; }
    items.forEach(e => entry(e, opts));
  };
  const osmEntry = e => entry({
    title: e.name, maps: `https://www.google.com/maps/search/?api=1&query=${e.lat != null ? `${e.lat},${e.lng}` : encodeURIComponent(e.name + ', Ontario')}`,
    km: e.km, where: e.operator,
    // older records say just "local": say what it is
    what: e.notes.length ? e.notes.map(n => (/^(local|regional|national|international)$/.test(n) ? `${n} network` : n)).join(', ') : '',
    url: e.website || e.osm_url
  }, { urlLabel: e.website ? 'Website' : 'Map record' });
  // Map-record entries (routes, docks, service centres) as a two-column
  // grid: name, one line of facts, a link. A dozen of them read as a
  // directory, not a dozen half-empty entries.
  const osmGrid = items => {
    const colW = (W - 24) / 2;
    for (let i = 0; i < items.length; i += 2) {
      const row = items.slice(i, i + 2);
      const facts = e => [e.km != null && `${e.km} km`, e.operator, ...e.notes.map(n => (/^(local|regional|national|international)$/.test(n) ? `${n} network` : n))].filter(Boolean).join(' · ');
      doc.font(F.bodyBold).fontSize(10);
      const h = Math.max(...row.map(e => doc.heightOfString(e.name, { width: colW }))) + 28;
      if (doc.y + h > pageBottom()) { fillRest(); doc.addPage(); }
      const y = doc.y;
      row.forEach((e, c) => {
        const x = M + c * (colW + 24);
        const maps = `https://www.google.com/maps/search/?api=1&query=${e.lat != null ? `${e.lat},${e.lng}` : encodeURIComponent(e.name + ', Ontario')}`;
        doc.rect(x, y, 2, h - 8).fill(c ? MOSS : CORAL);
        doc.font(F.bodyBold).fontSize(10).fillColor(INK).text(e.name, x + 10, y, { width: colW - 10, link: maps });
        const f = facts(e);
        if (f) doc.font(F.body).fontSize(8.4).fillColor(INK_SOFT).text(f, x + 10, doc.y + 1, { width: colW - 10, lineBreak: false, ellipsis: true });
        doc.font(F.body).fontSize(8.4).fillColor(CORAL).text(e.website ? 'Website' : 'Map record', x + 10, doc.y + 1, { width: colW - 10, link: e.website || e.osm_url, underline: true, lineBreak: false });
      });
      doc.y = y + h;
    }
    doc.moveDown(0.3);
  };
  const pageOf = label => { const s = sections.find(x => x.label === label); return s ? s.page + 1 : null; };

  // ---------- contents (filled after, when pages are known) ----------
  doc.addPage();
  const tocPage = doc.bufferedPageRange().count - 1;

  // ---------- welcome ----------
  opener('Before you go', `${g.order.name ? `${g.order.name}, this` : 'This'} book was put together for ${fmtRange(g.order.start, g.order.end)} in ${city}. Keep it, write in it, bring it home.`);
  if (G) para(`This edition was written by Grok, xAI's model, from DayHop's listings for ${city} and its own live search, then checked by DayHop: every place and event in it is a real listing or has a source link that loaded on ${fmtDate(g.built_at.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}. Anything that could not be checked was left out.`);
  else para(`Everything here is a real place or event, gathered for your dates on ${fmtDate(g.built_at.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })} from the sources listed at the back: the DayHop catalog, Google Maps listings, event listings, OpenStreetMap and Wikipedia. Every name links to live directions. It was assembled for you, not walked by us, so check hours and bookings before you set out.`);
  para('Start with the must-sees, look at what is on during your dates, then let the day plans carry you. The last pages are yours: a journal, a list of the places you made it to, and room for tickets and stubs.');
  sub('Handy links');
  [['Ontario Parks reservations', g.links.ontarioParks], ['Road conditions, Ontario 511', g.links.ontario511], [`Weather for ${city}`, g.links.weather]]
    .forEach(([t, u]) => { doc.font(F.body).fontSize(10).fillColor(CORAL).text(t, M, doc.y, { link: u, underline: true }); doc.moveDown(0.3); });

  // ---------- history ----------
  if (g.history && (g.history.summary || g.history.history.length)) {
    opener(`${city}, then and now`, 'The story of the place you are about to stand in, in the words of the people who keep it on Wikipedia.');
    if (g.history.summary) para(g.history.summary);
    if (g.history.history.length) { sub('A short history'); g.history.history.forEach(p => para(p)); }
    doc.font(F.body).fontSize(8).fillColor(INK_SOFT)
      .text(`From the Wikipedia article "${g.history.title}", ${g.history.license}. Read the whole article.`, M, doc.y + 4, { width: W, link: g.history.url, underline: true });
  }

  if (G) {
    const pick = (r, what) => Object.assign({}, r.listing || {}, { title: r.title, what, url: r.url || null, maps: r.maps });
    if (G.letter) {
      opener('A letter for your trip', null);
      // Set like a letter: larger type, a coral thread down the margin.
      const y0 = doc.y, p0 = doc.bufferedPageRange().count;
      G.letter.split(/\n+/).forEach(p => para(p, { size: 12 }));
      if (doc.bufferedPageRange().count === p0) doc.rect(M - 16, y0 + 2, 2, doc.y - y0 - 14).fill(CORAL);
      if (G.season_notes) { sub(`${city} this time of year`); para(G.season_notes); }
    }
    const MUST = 'Must-sees for your crew';
    const ON = 'On during your trip';
    opener(MUST, `Chosen for ${G.party}. Each one is here once; the plan below tells you the day.`, G.mustSee);
    if (!G.mustSee.length) para('No must-sees passed the checks this time.', { italic: true, color: INK_SOFT, size: 10 });
    G.mustSee.forEach((r, i) => entry(pick(r, r.why), { number: i + 1 }));
    opener(ON, `What is happening in and around ${city} on your dates, found by Grok and checked against its sources.`);
    if (!G.events.length) para('No events with a working source link were found for your dates.', { italic: true, color: INK_SOFT, size: 10 });
    G.events.forEach(e => entry(Object.assign({}, e, { what: e.why, date: e.end ? e.date : null }), { badge: e.date, badgeFill: CORAL }));
    const mustIds = placeSet(G.mustSee.map(r => r.listing || r));
    const eventIds = placeSet(G.events.map(e => e.title));
    if (G.weeks.length) {
      opener('Week by week', 'A plan for the whole trip. Must-sees and events take their day here and point back to their page. Swap anything; it is your trip.', G.weeks.flatMap(w => w.plan));
      G.weeks.forEach(w => {
        // "Week 1: Oct 28 to Nov 3" → a moss pill "WEEK 1" and the dates.
        const [wk, span] = String(w.label).split(/:\s*/);
        if (doc.y + 120 > pageBottom()) { fillRest(); doc.addPage(); }
        doc.moveDown(0.5);
        const y = doc.y;
        doc.font(F.display).fontSize(8.5);
        const pillW = doc.widthOfString(wk.toUpperCase(), { characterSpacing: 1.4 }) + 18;
        doc.roundedRect(M, y, pillW, 18, 9).fill(MOSS);
        doc.fillColor(PAPER).text(wk.toUpperCase(), M, y + 5, { width: pillW, align: 'center', characterSpacing: 1.4, lineBreak: false });
        if (span) doc.font(F.displayLight).fontSize(9).fillColor(INK_SOFT).text(span.toUpperCase(), M + pillW + 10, y + 5, { width: W - pillW - 10, characterSpacing: 1.4, lineBreak: false });
        doc.y = y + 26;
        if (w.theme) para(w.theme, { italic: true, color: MOSS, size: 10.5 });
        w.plan.forEach(it => {
          // verify() flags these; records built before it did are matched here.
          const isMust = it.mustSee || mustIds.has(it.listing || it);
          const isEvent = it.event || eventIds.has(it.title);
          const back = isMust ? `Must-see, page ${pageOf(MUST)}` : isEvent ? `On your dates, page ${pageOf(ON)}` : null;
          entry(Object.assign({}, pick(it, it.note), { date: null, photoTitle: it.title }),
            { badge: it.date, tag: back, noPhoto: !!back, noMeta: !!back, freshThumb: true });
        });
      });
    }
    // verify() keeps planned places out of the rainy picks; older records
    // are filtered here.
    const plannedIds = placeSet([...G.mustSee, ...G.weeks.flatMap(w => w.plan)].map(r => r.listing || r));
    const rainy = G.rainy.filter(r => !plannedIds.has(r.listing || r));
    if (rainy.length) { opener('Rainy and cold days', 'Indoor backups for the days the weather wins, none of them already in your plan.', rainy); list(rainy.map(r => pick(r, r.note))); }
    if (G.kid_tips.length || G.packing.length) {
      opener(/^with /.test(G.party) ? `Travelling ${G.party}` : `Tips for ${G.party}`, null);
      if (G.kid_tips.length) {
        sub('Tips');
        G.kid_tips.forEach((t, i) => {
          doc.font(F.body).fontSize(10.5);
          const h = doc.heightOfString(t, { width: W - 36, lineGap: 2 });
          if (doc.y + h + 10 > pageBottom()) { fillRest(); doc.addPage(); }
          const y = doc.y;
          doc.font(F.display).fontSize(12).fillColor(CORAL).text(String(i + 1).padStart(2, '0'), M, y, { width: 28, lineBreak: false });
          doc.font(F.body).fontSize(10.5).fillColor(INK).text(t, M + 36, y + 1, { width: W - 36, lineGap: 2 });
          doc.y = Math.max(doc.y, y + 14) + 9;
        });
      }
      if (G.packing.length) {
        // Two columns of tick boxes: a checklist, not a paragraph.
        sub('Packing list');
        const colW = (W - 24) / 2;
        const half = Math.ceil(G.packing.length / 2);
        doc.font(F.body).fontSize(10.5);
        for (let i = 0; i < half; i++) {
          const row = [G.packing[i], G.packing[i + half]].filter(Boolean);
          const h = Math.max(...row.map(t => doc.heightOfString(t, { width: colW - 18 })));
          if (doc.y + h + 8 > pageBottom()) doc.addPage();
          const y = doc.y;
          row.forEach((t, c) => {
            const x = M + c * (colW + 24);
            doc.rect(x, y + 1.5, 10, 10).lineWidth(0.8).strokeColor(MOSS).stroke();
            doc.font(F.body).fontSize(10.5).fillColor(INK).text(t, x + 18, y, { width: colW - 18 });
          });
          doc.y = y + h + 8;
        }
      }
    }
  }

  // ---------- must-sees ----------
  if (!G) opener('Must-sees while you are here', 'You did not ask for these, and you should not leave without them: DayHop picks within the hour, and the places people who have been here love most.', g.mustSee);
  if (!G && !g.mustSee.length) para('No standout picks found nearby this time.', { italic: true, color: INK_SOFT, size: 10 });
  if (!G) g.mustSee.forEach((e, i) => entry(e, { number: i + 1 }));

  // ---------- events ----------
  if (!G) opener('On during your trip', `What is happening in and around ${city} on your dates.`);
  if (!G && !g.events.trip.length) para('No ticketed events listed for your dates yet. Local listings fill in close to the date, so check again the week before.', { italic: true, color: INK_SOFT, size: 10 });
  if (!G) g.events.trip.forEach(e => entry(Object.assign({}, e, { date: e.end && e.end !== e.date ? e.date : null }), e.date ? { badge: e.date, badgeFill: CORAL } : { dot: CORAL }));
  if (!G && g.events.month.length) {
    sub(`Also in ${g.events.monthLabel}`);
    list(g.events.month, null, { noWhat: true });
  }

  // ---------- day plans ----------
  if (!G && g.days.length) {
    opener('Your days', 'One way to spend each day, nearest stops together. Swap anything; it is your trip.', g.days.flatMap(d => d.stops));
    g.days.forEach(day => {
      sub(fmtDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' }));
      day.stops.forEach(s => entry(Object.assign({}, s, { photoTitle: s.title, title: `${s.when}: ${s.title}` }), { noWhat: true }));
    });
  }

  // ---------- outdoors ----------
  opener('Parks, trails and water', 'The green and blue parts of the map, from big conservation areas to the lookout locals keep to themselves.', C.nature);
  list(C.nature, 'No parks were found in the listings for this place.');
  if (C.hike.length) { sub('Named hiking trails'); C.hike.forEach(osmEntry); }

  opener('By bike', 'Routes with names and signs, and where to rent a bike if you did not bring one.');
  if (C.bike.length) osmGrid(C.bike); else para('No named cycling routes are mapped near here. Quiet side roads and park paths still count.', { italic: true, color: INK_SOFT });
  if (g.routes.bikeShare.length) { sub('Bike rental and bike share'); osmGrid(g.routes.bikeShare); }

  opener('By car, together', 'Drives worth taking for the drive itself, and day trips worth the road.', [...C.drives, ...C.dayTrips]);
  if (C.drives.length) { sub('Scenic drives'); list(C.drives); }
  sub('Day trips from here');
  list(C.dayTrips, 'No DayHop day trips are mapped within reach of this place yet.');

  // ---------- overnight ----------
  opener('Sleeping under the sky', 'Campgrounds, RV and van sites, dump stations and highway service centres, with any car. Rules for overnight stays change; confirm with the site before you settle in.');
  const sleepOk = !g.overnight.missing.includes('sleep') && !g.overnight.missing.includes('all');
  sub('Campgrounds');
  if (g.overnight.camping.length) g.overnight.camping.forEach(osmEntry);
  else para(sleepOk ? 'No campgrounds are mapped within 30 km.' : 'The campground map could not be reached when this edition was built; see the links below.', { italic: true, color: INK_SOFT });
  if (g.overnight.rv.length) { sub('RV and van sites'); g.overnight.rv.forEach(osmEntry); }
  if (g.overnight.dump.length) { sub('Dump stations'); osmGrid(g.overnight.dump); }
  if (g.overnight.rest.length) { sub('Highway service centres and rest areas'); osmGrid(g.overnight.rest); }
  sub('Find more');
  [['Ontario Parks campsite reservations', g.links.ontarioParks], ['iOverlander: traveller reports of van-friendly spots near here', g.links.overlander]]
    .forEach(([t, u]) => { doc.font(F.body).fontSize(10).fillColor(CORAL).text(t, M, doc.y, { link: u, underline: true, width: W }); doc.moveDown(0.3); });

  // ---------- the regular DayHop feed ----------
  if (C.food.length) { opener('Eat, drink, warm up', 'The best-reviewed tables and counters near your trip.', C.food); list(C.food); }
  if (C.culture.length) { opener('Culture and history', 'Museums, galleries, old streets and the places that hold the story.', C.culture); list(C.culture); }
  if (C.family.length || C.active.length) {
    opener('Play', 'For the kids, the kid in you, and anyone who needs to move.', [...C.family, ...C.active]);
    if (C.family.length) { sub('Family'); list(C.family); }
    if (C.active.length) { sub('Active and adventurous'); list(C.active); }
  }
  if (C.more.length) { opener('Also worth knowing', null, C.more); list(C.more); }

  // ---------- keepsake pages ----------
  // Writing pages are for writing: no filler photograph over the lines
  // (the persona run put Santa on top of "Next time, we will").
  const lines = (prompt, top) => {
    doc.font(F.bodyItalic).fontSize(14).fillColor(MOSS).text(prompt, M, top, { width: W });
    let y = doc.y + 18;
    while (y < pageBottom()) { doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.5).strokeColor(LINE).stroke(); y += 26; }
    fillable = false;
  };
  const ruled = (prompt) => {
    fillRest();
    doc.addPage();
    const band = [...pix.byTitle.values()].find(p => !shownBig.has(p) && !p.ref.near) || nextScene();
    let top = TOP;
    if (band) { shownBig.add(band); photoAt(band, 0, 0, PW, 150); doc.rect(0, 150, PW, 2).fill(CORAL); top = 176; }
    lines(prompt, top);
  };
  opener('Trip journal', 'Write it down while it is fresh. Future you will thank you.');
  lines('The moment I want to remember', doc.y + 6);
  ruled('What surprised us');
  ruled('Next time, we will');

  opener('Places we made it to', 'Tick them off as you go.');
  const tickSet = placeSet();
  const ticks = (G ? [...G.mustSee, ...G.weeks.flatMap(w => w.plan)] : [...g.mustSee, ...g.days.flatMap(d => d.stops)]).filter(e => tickSet.claim(e.title)).slice(0, 26);
  ticks.forEach(e => {
    const p = thumbOf(e.title);
    if (doc.y + (p ? 44 : 22) > pageBottom()) doc.addPage();
    const y = doc.y;
    doc.rect(M, y + (p ? 13 : 1), 10, 10).lineWidth(0.8).strokeColor(MOSS).stroke();
    if (p) photoAt(p, M + 20, y, 48, 36, 4);
    doc.font(F.body).fontSize(10.5).fillColor(INK).text(e.title, M + (p ? 78 : 18), y + (p ? 11 : 0), { width: W - 80 });
    doc.y = Math.max(doc.y, y + (p ? 40 : 0));
    doc.moveDown(0.5);
  });
  opener('Tickets, stubs, pressed leaves', null);
  fillable = false;
  doc.rect(M, doc.y + 10, W, pageBottom() - doc.y - 20).dash(4, { space: 4 }).lineWidth(0.6).strokeColor(LINE).stroke().undash();

  // ---------- credits ----------
  opener('Sources and credits', null);
  fillable = false;
  para(`Assembled by DayHop on ${fmtDate(g.built_at.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })} for ${fmtRange(g.order.start, g.order.end)}. Listings change; every name links to live directions.`, { size: 9.5 });
  para('Places: the DayHop curated catalog and Google Maps listings. Events: DayHop event sources and Ticketmaster. Parks and trails: OpenStreetMap and the DayHop catalog.', { size: 9.5 });
  if (G) para(`Written with Grok (${G.model}) on ${fmtDate(g.built_at.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}. Each place is a DayHop listing or carries the source Grok found; each event's source link was checked.`, { size: 9.5 });
  para('Map data © OpenStreetMap contributors, available under the Open Database License (openstreetmap.org/copyright).', { size: 9.5 });
  if (g.history) para(`History text from Wikipedia, "${g.history.title}", licensed ${g.history.license} (creativecommons.org/licenses/by-sa/4.0). Quoted unchanged.`, { size: 9.5 });
  if (credits.size) {
    sub('Photographs');
    // Two columns, each credit linked to its source page.
    const colW = (W - 20) / 2;
    let col = 0, top = doc.y, cy = top, low = top;
    for (const p of credits.values()) {
      const c = p.ref.credit || {};
      const t = `${captionOf(p)}: ${String(c.author || '').normalize('NFD').replace(/[̀-ͯ]/g, '')}, ${c.licence || ''}`;
      doc.font(F.body).fontSize(7.8).fillColor(INK_SOFT);
      const h = doc.heightOfString(t, { width: colW });
      if (cy + h > pageBottom()) {
        if (col === 0) { col = 1; cy = top; } else { doc.addPage(); col = 0; top = cy = low = TOP; }
      }
      doc.text(t, M + col * (colW + 20), cy, { width: colW, link: c.source || undefined });
      cy += h + 3;
      low = Math.max(low, cy);
    }
    doc.y = low + 10;
  }
  para('Something wrong or changed? Tell us at admin@dayhop.quest. If this guide did not help your trip, write within 14 days and we will refund it.', { size: 9.5, color: MOSS });

  // ---------- fill contents + folios ----------
  doc.switchToPage(tocPage);
  doc.font(F.display).fontSize(20).fillColor(INK).text('CONTENTS', M, TOP, { width: W, characterSpacing: 1.6 });
  doc.rect(M, doc.y + 6, 118, 2).fill(CORAL);
  // Numbered, with a dotted leader to the page number.
  let y = doc.y + 30;
  const step = sections.length > 20 ? 21 : 25;
  for (const s of sections) {
    const pg = String(s.page + 1);
    doc.font(F.displayLight).fontSize(9).fillColor(CORAL).text(String(s.no).padStart(2, '0'), M, y + 2, { width: 26, lineBreak: false, characterSpacing: 1 });
    doc.font(F.body).fontSize(11.5).fillColor(INK);
    const lw = Math.min(doc.widthOfString(s.label), W - 100);
    doc.text(s.label, M + 30, y, { width: W - 100, lineBreak: false, ellipsis: true });
    doc.font(F.displayLight).fontSize(11);
    const pw = doc.widthOfString(pg);
    doc.fillColor(INK_SOFT).text(pg, M + W - 40, y, { width: 40, align: 'right', lineBreak: false });
    const x0 = M + 30 + lw + 8, x1 = M + W - pw - 8;
    if (x1 > x0) doc.moveTo(x0, y + 10).lineTo(x1, y + 10).dash(0.6, { space: 3 }).lineWidth(0.6).strokeColor(LINE).stroke().undash();
    y += step;
  }
  const total = doc.bufferedPageRange().count;
  for (let i = 1; i < total; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(F.displayLight).fontSize(7.5).fillColor(INK_SOFT)
      .text(`${city.toUpperCase()} · ${fmtRange(g.order.start, g.order.end).toUpperCase()}   ${i + 1}`, M, doc.page.height - 44, { width: W, align: 'right', characterSpacing: 1.2, lineBreak: false });
    doc.page.margins.bottom = keep;
  }
}

module.exports = { renderPersonalGuidePdf };
