#!/usr/bin/env node
// scripts/build-email-art.js — the newsletters' own artwork, drawn here as
// SVG and rendered to PNG with sharp into public/img/email/.
//
//   node scripts/build-email-art.js
//
// Owned art, so it costs nothing per send and needs no credit line: two
// mastheads (one per newsletter) and a banner per category, used whenever a
// pick has no licence-clean photo. PNG only: Outlook does not show WebP.
// Drawn at 2x (1120 x 280 mastheads, 1040 x 400 banners) for sharp phones.
// DayHop palette: ink #102A2E, coral #E1502F, moss #3F6F5C, paper #FBF7EE,
// contour lines with exactly one coral thread, as in the city guides.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'public', 'img', 'email');
const INK = '#102A2E', CORAL = '#E1502F', MOSS = '#3F6F5C', PAPER = '#FBF7EE', SAND = '#F2ECDC', MARIGOLD = '#FFB627';
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// Wavy contour lines across a band; line `coral` is the one coral thread.
function contours(w, y0, h, n, seed, coral = Math.floor(n / 2), stroke = MOSS, op = 0.55) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const y = y0 + (h / n) * i;
    let d = `M -20 ${y.toFixed(1)}`;
    for (let x = -20; x <= w + 20; x += 16) {
      const yy = y + Math.sin((x + seed * 41 + i * 67) / 90) * 9 + Math.cos((x + i * 23) / 37) * 4;
      d += ` L ${x} ${yy.toFixed(1)}`;
    }
    out += `<path d="${d}" fill="none" stroke="${i === coral ? CORAL : stroke}" stroke-width="${i === coral ? 3.2 : 1.4}" opacity="${i === coral ? 1 : op}"/>`;
  }
  return out;
}

function masthead({ title, kicker, accent }) {
  const W = 1120, H = 280;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${INK}"/>
  ${contours(W, 30, 230, 9, title.length, 6, '#6E9C88', 0.5)}
  <circle cx="${W - 150}" cy="96" r="54" fill="${accent}"/>
  <circle cx="${W - 150}" cy="96" r="70" fill="none" stroke="${accent}" stroke-width="2" opacity="0.6"/>
  <circle cx="${W - 150}" cy="96" r="86" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.35"/>
  <rect x="56" y="58" width="300" height="74" rx="10" fill="${INK}" opacity="0.88"/>
  <text x="70" y="118" font-family="${FONT}" font-size="64" font-weight="800" fill="${PAPER}" letter-spacing="1">DayHop</text>
  <rect x="56" y="160" width="${Math.min(560, 40 + title.length * 28)}" height="90" rx="10" fill="${INK}" opacity="0.88"/>
  <text x="72" y="196" font-family="${FONT}" font-size="22" font-weight="700" fill="${MARIGOLD}" letter-spacing="5">${kicker}</text>
  <text x="70" y="238" font-family="${FONT}" font-size="40" font-weight="800" fill="#FFFFFF">${title}</text>
</svg>`;
}

// One small scene per category, drawn from plain shapes (no fonts, no emoji,
// so it renders the same on any machine that runs this script).
const SCENES = {
  nature: (W, H) => `
    <circle cx="${W - 210}" cy="120" r="56" fill="${CORAL}"/>
    <path d="M0 ${H - 120} Q 260 ${H - 230} 520 ${H - 140} T ${W} ${H - 150} V ${H} H 0 Z" fill="#8DB59A"/>
    <path d="M0 ${H - 70} Q 300 ${H - 160} 640 ${H - 80} T ${W} ${H - 90} V ${H} H 0 Z" fill="${MOSS}"/>
    ${[120, 190, 250, 820, 880].map((x, i) => `<path d="M${x} ${H - 60 - i % 2 * 20} l 34 -110 l 34 110 Z" fill="${INK}"/>`).join('')}`,
  food: (W, H) => `
    <circle cx="${W / 2}" cy="${H / 2 + 10}" r="120" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>
    <circle cx="${W / 2}" cy="${H / 2 + 10}" r="82" fill="${SAND}"/>
    <circle cx="${W / 2 - 20}" cy="${H / 2}" r="26" fill="${CORAL}"/><circle cx="${W / 2 + 30}" cy="${H / 2 + 26}" r="20" fill="${MOSS}"/><circle cx="${W / 2 + 14}" cy="${H / 2 - 30}" r="14" fill="${MARIGOLD}"/>
    <rect x="${W / 2 - 220}" y="${H / 2 - 100}" width="12" height="220" rx="6" fill="${INK}"/>
    <rect x="${W / 2 + 208}" y="${H / 2 - 100}" width="12" height="220" rx="6" fill="${INK}"/>
    ${[0, 1, 2].map(i => `<path d="M${W / 2 - 40 + i * 40} ${H / 2 - 150} q 14 -20 0 -40" stroke="${INK}" stroke-width="5" fill="none" opacity="0.55"/>`).join('')}`,
  culture: (W, H) => `
    <path d="M${W / 2 - 220} ${H / 2 - 40} L ${W / 2} ${H / 2 - 140} L ${W / 2 + 220} ${H / 2 - 40} Z" fill="${INK}"/>
    <rect x="${W / 2 - 220}" y="${H / 2 - 40}" width="440" height="18" fill="${INK}"/>
    ${[0, 1, 2, 3, 4].map(i => `<rect x="${W / 2 - 190 + i * 88}" y="${H / 2 - 10}" width="34" height="150" fill="${i === 2 ? CORAL : MOSS}"/>`).join('')}
    <rect x="${W / 2 - 240}" y="${H / 2 + 140}" width="480" height="22" fill="${INK}"/>`,
  family: (W, H) => `
    <path d="M${W / 2 - 60} 70 l 90 90 l -90 90 l -90 -90 Z" fill="${CORAL}"/>
    <path d="M${W / 2 - 60} 250 q 40 60 -20 120 t 10 90" stroke="${INK}" stroke-width="5" fill="none"/>
    <circle cx="${W / 2 + 200}" cy="140" r="48" fill="${MARIGOLD}"/><path d="M${W / 2 + 200} 188 v 160" stroke="${INK}" stroke-width="4"/>
    <circle cx="${W / 2 + 290}" cy="180" r="38" fill="${MOSS}"/><path d="M${W / 2 + 290} 218 v 130" stroke="${INK}" stroke-width="4"/>
    <path d="M0 ${H - 50} H ${W}" stroke="${MOSS}" stroke-width="10"/>`,
  water: (W, H) => `
    <circle cx="190" cy="110" r="50" fill="${MARIGOLD}"/>
    <path d="M${W / 2 - 40} 250 h 220 l -40 56 h -140 Z" fill="${INK}"/>
    <path d="M${W / 2 + 60} 80 v 166 l -110 -18 Z" fill="${CORAL}"/>
    ${[0, 1, 2].map(i => `<path d="M-20 ${300 + i * 34} q 60 -24 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0" stroke="${i === 1 ? '#5FA8B8' : MOSS}" stroke-width="7" fill="none"/>`).join('')}`,
  adventure: (W, H) => `
    <path d="M60 ${H - 40} L 320 120 L 470 270 L 640 60 L 980 ${H - 40} Z" fill="${INK}"/>
    <path d="M640 60 L 700 140 L 660 130 L 640 160 L 610 130 L 580 140 Z" fill="#FFFFFF"/>
    <path d="M640 60 v -40" stroke="${INK}" stroke-width="5"/><path d="M640 20 l 50 14 l -50 14 Z" fill="${CORAL}"/>
    <path d="M200 ${H - 40} q 120 -60 260 -100 t 180 -140" stroke="${MARIGOLD}" stroke-width="6" fill="none" stroke-dasharray="14 12"/>`,
  events: (W, H) => `
    <path d="M-20 70 Q ${W / 2} 190 ${W + 20} 70" stroke="${INK}" stroke-width="4" fill="none"/>
    ${Array.from({ length: 11 }, (_, i) => { const x = 60 + i * 92; const y = 70 + Math.sin(Math.PI * (x / W)) * 112; return `<circle cx="${x}" cy="${y + 22}" r="16" fill="${[CORAL, MARIGOLD, MOSS][i % 3]}"/>`; }).join('')}
    <rect x="${W / 2 - 200}" y="${H / 2 + 20}" width="400" height="140" rx="16" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>
    <circle cx="${W / 2 - 200}" cy="${H / 2 + 90}" r="22" fill="${SAND}"/><circle cx="${W / 2 + 200}" cy="${H / 2 + 90}" r="22" fill="${SAND}"/>
    <path d="M${W / 2 - 110} ${H / 2 + 52} v 76" stroke="${INK}" stroke-width="4" stroke-dasharray="8 8"/>
    <path d="M${W / 2 + 10} ${H / 2 + 62} l 14 30 l 32 4 l -24 22 l 6 32 l -28 -16 l -28 16 l 6 -32 l -24 -22 l 32 -4 Z" fill="${CORAL}"/>`
};

function banner(kind) {
  const W = 1040, H = 400;
  const bg = { nature: '#EAF2E6', food: '#FBEAE4', culture: SAND, family: '#FFF3D6', water: '#E3F0F2', adventure: '#E9EEE8', events: '#FBEAE4' }[kind] || PAPER;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  ${contours(W, 20, 360, 8, kind.length, 99, MOSS, 0.18)}
  ${SCENES[kind](W, H)}
</svg>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const jobs = [
    ['masthead-weekend.png', masthead({ title: 'Your weekend, sorted', kicker: 'THE WEEKEND BRIEF', accent: CORAL })],
    ['masthead-tott.png', masthead({ title: 'Talk of the town', kicker: 'THIS WEEK IN THE GTA', accent: MARIGOLD })],
    ...Object.keys(SCENES).map(k => [`cat-${k}.png`, banner(k)])
  ];
  for (const [name, svg] of jobs) {
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(path.join(OUT, name));
    console.log(name, `${Math.round(fs.statSync(path.join(OUT, name)).size / 1024)} KB`);
  }
})().catch(err => { console.error(err); process.exit(1); });
