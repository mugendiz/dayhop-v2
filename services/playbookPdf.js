// services/playbookPdf.js — DayHop V2
// The Weekend Playbook as a downloadable PDF, attached to the welcome email.
// Generated with pdfkit (pure JS — no headless browser, safe on Render's
// free tier) from the same shared data as /playbook, and cached: the catalog
// changes at most weekly (Sunday discovery scan), so one build serves many
// welcomes. Fails soft — a build error means the welcome email simply goes
// out without the attachment (the Playbook link still works).

const PDFDocument = require('pdfkit');
const { sectioned, isRainProof, isNew } = require('./playbookData');

// Brand palette (mirrors the web version)
const INK = '#102A2E';
const INK_SOFT = '#41585C';
const CORAL = '#E1502F';
const MOSS = '#3F6F5C';
const PAPER_DIM = '#F2ECDC';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
let cache = null; // { buffer, at, count }

function chipsLine(e) {
  const bits = [];
  if (e.cost_tier) bits.push(e.cost_tier);
  if (e.good_for_ages) bits.push(`ages ${e.good_for_ages}`);
  if (isRainProof(e)) bits.push('rain-proof');
  if (isNew(e)) bits.push('NEW');
  return bits.join('  ·  ');
}

function buildBuffer() {
  return new Promise((resolve, reject) => {
    const { entries, sections, freeCount, rainProofCount } = sectioned();
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 64, bottom: 64, left: 64, right: 64 },
      bufferPages: true,
      info: { Title: 'The GTA Family Weekend Playbook', Author: 'DayHop' }
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), count: entries.length }));
    doc.on('error', reject);

    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ---------- cover ----------
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FBF7EE');
    doc.fill(INK).font('Helvetica-Bold').fontSize(30).text('DayHop', 64, 150);
    doc.moveDown(1.2);
    doc.fontSize(40).text('The GTA Family\nWeekend Playbook', { width: W });
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(15).fill(INK_SOFT)
      .text(`${entries.length} outings actually worth your Saturday — hand-curated and verified, organized by age, budget, and rain-proofness.`, { width: W });
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(13).fill(MOSS)
      .text(`${freeCount} completely free   ·   ${rainProofCount} rain-proof   ·   updated ${new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'America/Toronto' })}`);
    doc.font('Helvetica').fontSize(10.5).fill(INK_SOFT)
      .text('The live version regenerates weekly as new places are discovered and verified — your link from the welcome email always has the freshest copy.', 64, doc.page.height - 150, { width: W });
    doc.font('Helvetica').fontSize(9.5).fill(INK_SOFT)
      .text('DayHop · Richmond Hill, Ontario, Canada · dayhop.quest · admin@dayhop.quest', 64, doc.page.height - 100, { width: W });

    // ---------- sections ----------
    for (const s of sections) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(22).fill(INK).text(`${s.label}`, { width: W });
      doc.font('Helvetica').fontSize(11).fill(MOSS).text(`${s.entries.length} picks — ${s.blurb}`, { width: W });
      doc.moveDown(0.8);

      for (const e of s.entries) {
        // Keep each entry block on one page.
        const blockHeight =
          doc.heightOfString(e.title, { width: W, lineGap: 1 }) +
          doc.heightOfString(e.description || '', { width: W }) + 46;
        if (doc.y + blockHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();

        const link = e.booking_url || e.maps_url || null;
        doc.font('Helvetica-Bold').fontSize(13).fill(INK)
          .text(e.title, { width: W, lineGap: 1, link, underline: false });
        const where = e.venue || e.location;
        if (where && where !== e.title) {
          doc.font('Helvetica').fontSize(9).fill(INK_SOFT).text(where, { width: W });
        }
        doc.moveDown(0.15);
        doc.font('Helvetica').fontSize(10.5).fill(INK_SOFT).text(e.description || '', { width: W });
        const meta = chipsLine(e);
        if (meta) {
          doc.moveDown(0.12);
          doc.font('Helvetica-Bold').fontSize(8.5).fill(CORAL).text(meta, { width: W });
        }
        doc.moveDown(0.7);
      }
    }

    // ---------- back page ----------
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(20).fill(INK).text('Turn any of these into a full day', { width: W });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(12).fill(INK_SOFT)
      .text('Tell the DayHop planner what kind of day you want, in one sentence — it builds the whole thing with real venues, timing, and live weather.', { width: W });
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(13).fill(CORAL)
      .text('dayhop.quest', { link: 'https://dayhop-v2.onrender.com/', width: W });
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(9).fill(INK_SOFT).text(
      'You received this Playbook because you subscribed to the DayHop weekend brief. ' +
      'Every email we send includes a one-click unsubscribe. ' +
      'DayHop · Richmond Hill, Ontario, Canada · admin@dayhop.quest', { width: W });

    // Page numbers (skip cover).
    const range = doc.bufferedPageRange();
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8.5).fill(INK_SOFT)
        .text(`The GTA Family Weekend Playbook — ${i + 1}`, 64, doc.page.height - 42, {
          width: W, align: 'center', lineBreak: false
        });
    }
    doc.end();
  });
}

/** Cached PDF buffer (12h). Returns { buffer, count } or null on failure. */
async function getPlaybookPdf() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  try {
    const { buffer, count } = await buildBuffer();
    cache = { buffer, count, at: Date.now() };
    console.log(`[playbook-pdf] built: ${count} entries, ${(buffer.length / 1024).toFixed(0)} KB`);
    return cache;
  } catch (err) {
    console.warn('[playbook-pdf] build failed (welcome email goes out without attachment):', err.message);
    return null;
  }
}

module.exports = { getPlaybookPdf };
