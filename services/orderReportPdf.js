// services/orderReportPdf.js — DayHop V2
// The customers and orders report (services/orderReport.js) as a PDF:
// headline numbers, products, cities, then every checkout. Same rows as the
// CSV, so the same promise holds: no email, name, phone or Stripe id, only
// the anonymous C- code and the city. pdfkit, like the playbook PDF.

const PDFDocument = require('pdfkit');

const INK = '#102A2E';
const INK_SOFT = '#41585C';
const MOSS = '#3F6F5C';
const LINE = '#D9D2C0';
const PAPER_DIM = '#F2ECDC';

// Helvetica covers Latin-1 only; anything else (an emoji in a product name)
// would print as garbage, so it is dropped rather than mangled.
const latin1 = s => String(s == null ? '' : s).replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim();

function buildOrderReportPdf(report, { compress = true } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER', layout: 'landscape', compress,
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: { Title: 'DayHop user report', Author: 'DayHop' }
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = doc.page.margins.left;
    const W = doc.page.width - L - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const s = report.summary;

    // ---------- header ----------
    doc.fill(MOSS).font('Helvetica-Bold').fontSize(11).text('DAYHOP', L, 40, { characterSpacing: 1.5 });
    doc.fill(INK).font('Helvetica-Bold').fontSize(24).text('User report', L, 56);
    doc.fill(INK).font('Helvetica-Bold').fontSize(12).text(latin1(report.period || (report.since ? `Since ${report.since}` : 'All time')), L, 86);
    doc.fill(INK_SOFT).font('Helvetica').fontSize(9.5).text(
      `Generated ${report.generated_on}. Founder and team data removed: ${report.founder_excluded || 0} records. ` +
      'No emails or names; each C- code is one anonymous person, the same in every section.',
      L, 102, { width: W }
    );

    // ---------- headline tiles ----------
    const totals = {};
    for (const p of s.by_product) if (p.revenue_cents) totals[p.currency] = (totals[p.currency] || 0) + p.revenue_cents;
    const revenueText = Object.keys(totals).length
      ? Object.entries(totals).map(([cur, c]) => `${(c / 100).toFixed(2)} ${cur}`).join(' + ')
      : '0.00';
    const nl = s.newsletter || {};
    const mem = s.memberships || {};
    const tiles = [
      ['Acquired', String(s.acquired)],
      ['Attempted only', String(s.attempted_only)],
      ['Revenue', revenueText],
      ['Signups', String(nl.signed_up || 0)],
      ['Unsubscribes', String(nl.unsubscribed || 0)],
      ['Pro cancelled', String(mem.cancelled || 0)]
    ];
    const tileW = (W - (tiles.length - 1) * 10) / tiles.length;
    let y = 124;
    tiles.forEach(([label, value], i) => {
      const x = L + i * (tileW + 10);
      doc.roundedRect(x, y, tileW, 52, 6).fill(PAPER_DIM);
      doc.fill(INK_SOFT).font('Helvetica').fontSize(9).text(label.toUpperCase(), x + 10, y + 9, { width: tileW - 20, characterSpacing: 0.5, lineBreak: false, ellipsis: true });
      doc.fill(INK).font('Helvetica-Bold').fontSize(value.length > 14 ? 12 : 18).text(latin1(value), x + 10, y + 23, { width: tileW - 20, lineBreak: false, ellipsis: true });
    });
    y += 70;

    // ---------- tables ----------
    function table(title, cols, rows, { startY, maxRows = Infinity, width = W } = {}) {
      let ty = startY;
      const drawHead = () => {
        let x = L;
        doc.fill(INK_SOFT).font('Helvetica-Bold').fontSize(8.5);
        for (const c of cols) { doc.text(c.label.toUpperCase(), x + 3, ty, { width: c.w - 6, lineBreak: false }); x += c.w; }
        ty += 13;
        doc.moveTo(L, ty - 2).lineTo(L + width, ty - 2).lineWidth(0.6).strokeColor(LINE).stroke();
      };
      if (title) {
        doc.fill(INK).font('Helvetica-Bold').fontSize(12).text(title, L, ty);
        ty += 18;
      }
      drawHead();
      let n = 0;
      for (const r of rows) {
        if (n >= maxRows) break;
        if (ty + 14 > bottom()) {
          doc.addPage();
          ty = doc.page.margins.top;
          drawHead();
        }
        let x = L;
        doc.fill(INK).font('Helvetica').fontSize(8.5);
        for (const c of cols) {
          doc.text(latin1(r[c.key]), x + 3, ty, { width: c.w - 6, height: 11, lineBreak: false, ellipsis: true });
          x += c.w;
        }
        ty += 14;
        n++;
      }
      if (!rows.length) {
        doc.fill(INK_SOFT).font('Helvetica').fontSize(9).text('Nothing yet.', L + 3, ty);
        ty += 14;
      }
      return ty + 14;
    }

    // Month by month first: the shape of the period at a glance.
    if ((s.by_month || []).length) {
      y = table('Month by month', [
        { key: 'label', label: 'Month', w: 80 },
        { key: 'acquired', label: 'Acquired', w: 70 },
        { key: 'attempted', label: 'Attempted', w: 70 },
        { key: 'revenue', label: 'Revenue', w: 90 },
        { key: 'signups', label: 'Newsletter signups', w: 120 },
        { key: 'unsubscribes', label: 'Unsubscribes', w: 95 },
        { key: 'memberships_started', label: 'Pro started', w: 85 },
        { key: 'memberships_cancelled', label: 'Pro cancelled', w: W - 610 }
      ], s.by_month, { startY: y });
      if (y + 140 > bottom()) { doc.addPage(); y = doc.page.margins.top; }
    }

    // Products and cities side by side.
    const half = (W - 20) / 2;
    const productRows = s.by_product.map(p => ({ product: p.product, acquired: p.acquired, revenue: p.revenue || '', attempted: p.attempted_only }));
    const productsEnd = table('By product', [
      { key: 'product', label: 'Product', w: half - 190 },
      { key: 'acquired', label: 'Acquired', w: 60 },
      { key: 'revenue', label: 'Revenue', w: 70 },
      { key: 'attempted', label: 'Attempted', w: 60 }
    ], productRows, { startY: y, maxRows: 10, width: half });
    // Cities table drawn in the right half, from the same top.
    let cy = y;
    const CX = L + half + 20;
    doc.fill(INK).font('Helvetica-Bold').fontSize(12).text('By city', CX, cy);
    cy += 18;
    doc.fill(INK_SOFT).font('Helvetica-Bold').fontSize(8.5)
      .text('CITY', CX + 3, cy, { width: half - 90, lineBreak: false })
      .text('CHECKOUTS', CX + half - 84, cy, { width: 80, lineBreak: false });
    cy += 13;
    doc.moveTo(CX, cy - 2).lineTo(CX + half, cy - 2).lineWidth(0.6).strokeColor(LINE).stroke();
    for (const c of s.by_city.slice(0, 10)) {
      doc.fill(INK).font('Helvetica').fontSize(8.5)
        .text(latin1(c.city), CX + 3, cy, { width: half - 90, lineBreak: false, ellipsis: true })
        .text(String(c.orders), CX + half - 84, cy, { width: 80, lineBreak: false });
      cy += 14;
    }
    y = Math.max(productsEnd, cy + 14);

    // Every checkout.
    if (y + 60 > bottom()) { doc.addPage(); y = doc.page.margins.top; }
    table('Every checkout, newest first', [
      { key: 'date', label: 'Date', w: 64 },
      { key: 'time', label: 'Time', w: 38 },
      { key: 'customer', label: 'Customer', w: 62 },
      { key: 'city', label: 'City', w: 100 },
      { key: 'product', label: 'Product', w: 160 },
      { key: 'outcome', label: 'Outcome', w: 140 },
      { key: 'amount', label: 'Amount', w: 90 },
      { key: 'discount', label: 'Discount', w: W - 654 }
    ], report.rows, { startY: y });

    // Newsletter and memberships: signups, unsubscribes, cancellations.
    const section = (title, cols, rows) => {
      doc.addPage();
      table(title, cols, rows, { startY: doc.page.margins.top });
    };
    section('Newsletter: signups and unsubscribes', [
      { key: 'customer', label: 'Customer', w: 70 },
      { key: 'city', label: 'City', w: 120 },
      { key: 'signed_up', label: 'Signed up', w: 80 },
      { key: 'confirmed', label: 'Confirmed', w: 80 },
      { key: 'unsubscribed', label: 'Unsubscribed', w: 90 },
      { key: 'status', label: 'Status', w: 150 },
      { key: 'source', label: 'Where they signed up', w: W - 590 }
    ], report.newsletter || []);
    section('Pro memberships: starts and cancellations', [
      { key: 'customer', label: 'Customer', w: 70 },
      { key: 'city', label: 'City', w: 120 },
      { key: 'started', label: 'Started', w: 80 },
      { key: 'trial_ends', label: 'Trial ends', w: 80 },
      { key: 'cancelled', label: 'Cancelled on', w: 90 },
      { key: 'ends', label: 'Ends', w: 80 },
      { key: 'status', label: 'Status', w: W - 520 }
    ], report.memberships || []);

    if (report.truncated) {
      doc.fill(INK_SOFT).font('Helvetica').fontSize(9).text('Stopped at 2000 checkouts; narrow the date to see older ones.');
    }
    doc.end();
  });
}

module.exports = { buildOrderReportPdf };
