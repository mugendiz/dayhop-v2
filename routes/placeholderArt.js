// routes/placeholderArt.js — DayHop V2
// The image a card shows when a place has no photo: an illustrated card in
// DayHop's palette, one scene per category, with the place's own name set
// on it. It replaces nine Unsplash stock photos that repeated across every
// photo-less card in a category, and a stock photo of "a beach" beside a
// specific place read as a picture of that place. An illustration with the
// name on it never pretends to be a photo.
//
//   GET /art/placeholder.svg?c=<category>&t=<place name>
//
// Pure SVG (no fonts to load, no network), deterministic per name, cached
// for 30 days. Colours and scene details vary by a hash of the name so a
// row of photo-less cards does not look like one card repeated.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const INK = '#102A2E';
const PAPER = '#FBF7EE';
const CORAL = '#E1502F';
const MOSS = '#3F6F5C';
const MARIGOLD = '#FFB627';

// Background pairs per category: [top, bottom].
const SKIES = {
  water: [['#BFE3E8', '#7FC4CF'], ['#CFE8F5', '#86B9D9'], ['#D7EEE6', '#8CC7B3']],
  adventures: [['#F6D9B8', '#E9A77C'], ['#E2E8D0', '#A9BF8E'], ['#F3E2C7', '#D9A86C']],
  culture: [['#EFE2D0', '#D8B996'], ['#E6DDEA', '#B9A6C9'], ['#F2E6D8', '#C9A889']],
  food: [['#FCE3D3', '#F2A98A'], ['#FBEBC9', '#F0C27A'], ['#F7DCD6', '#E39C8E']],
  kids: [['#FFF0C2', '#FFD06B'], ['#DDF1E4', '#9BD6B0'], ['#FDE2E4', '#F5A8B4']],
  patios: [['#FFE9C7', '#F6B87A'], ['#F9DED0', '#EBA083'], ['#FDF0CF', '#EFCB79']],
  cruises: [['#CBE6F2', '#7DB6D6'], ['#D9ECF4', '#99C3DE'], ['#C6E2EC', '#6FA8C4']],
  worldcup: [['#D5ECD3', '#8CC489'], ['#E2F1D9', '#A6D18E'], ['#CFE6CF', '#7DB57A']],
  general: [['#E4EEDF', '#AFC9A2'], ['#EAE6D6', '#C2B98F'], ['#DCEBE4', '#9CC5B2']]
};
const LABELS = {
  water: 'On the water', adventures: 'Adventure', culture: 'Culture', food: 'Food and drink',
  kids: 'For the kids', patios: 'Patio', cruises: 'On the water', worldcup: 'Big game', general: 'Day out'
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Up to two lines of about `max` characters, breaking on spaces.
function wrap(text, max = 22) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length <= max) lines[lines.length - 1] = (cur + ' ' + w).trim();
    else if (lines.length < 2) lines.push(w);
    else { lines[1] = (lines[1] + ' ' + w).trim(); }
  }
  if (lines[1] && lines[1].length > max) lines[1] = lines[1].slice(0, max - 1).trim() + '…';
  return lines.filter(Boolean);
}

// The scene for a category, drawn in a 1200x750 frame. r() gives 0..1
// values from the name's hash, so details shift from card to card.
function scene(cat, r) {
  const sunX = 760 + r(0) * 300, sunY = 120 + r(1) * 90;
  const sun = `<circle cx="${sunX}" cy="${sunY}" r="${58 + r(2) * 26}" fill="${MARIGOLD}" opacity="0.95"/>`;
  const hills = (y, c, o = 1) => `<path d="M0 ${y} C 220 ${y - 70 - r(3) * 40}, 420 ${y - 20}, 640 ${y - 60 - r(4) * 50} S 1040 ${y - 30}, 1200 ${y - 80} L1200 750 L0 750 Z" fill="${c}" opacity="${o}"/>`;
  const waves = y => [0, 1, 2].map(i => `<path d="M0 ${y + i * 34} q 50 -18 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0" fill="none" stroke="${PAPER}" stroke-width="5" opacity="${0.75 - i * 0.2}"/>`).join('');
  switch (cat) {
    case 'water':
    case 'cruises': {
      const boat = cat === 'cruises' || r(5) > 0.5
        ? `<g transform="translate(${260 + r(6) * 360} 400)"><path d="M0 0 L180 0 L150 44 L30 44 Z" fill="${CORAL}"/><rect x="82" y="-120" width="8" height="120" fill="${INK}"/><path d="M90 -116 L160 -12 L90 -12 Z" fill="${PAPER}"/></g>` : '';
      return `${sun}<rect y="430" width="1200" height="320" fill="#4F9DB3"/>${boat}${waves(470)}`;
    }
    case 'adventures':
      return `${sun}<path d="M80 560 L360 180 L520 380 L700 140 L1010 560 Z" fill="${MOSS}"/><path d="M700 140 L760 220 L640 220 Z" fill="${PAPER}"/><path d="M360 180 L410 250 L310 250 Z" fill="${PAPER}"/><rect x="${696}" y="70" width="6" height="74" fill="${INK}"/><path d="M702 72 L760 90 L702 108 Z" fill="${CORAL}"/>${hills(620, '#2F5A4A')}`;
    case 'culture':
      return `${sun}${hills(640, '#8E9F86', 0.6)}<g transform="translate(330 250)"><path d="M0 70 L270 0 L540 70 Z" fill="${INK}"/><rect x="10" y="70" width="520" height="22" fill="${INK}"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${40 + i * 104}" y="104" width="44" height="236" fill="${PAPER}"/>`).join('')}<rect x="0" y="340" width="540" height="30" fill="${INK}"/></g>`;
    case 'food':
      return `${sun}<ellipse cx="600" cy="470" rx="290" ry="120" fill="${PAPER}"/><ellipse cx="600" cy="460" rx="210" ry="82" fill="#F7E7CF"/><circle cx="${540 + r(7) * 40}" cy="450" r="34" fill="${CORAL}"/><circle cx="640" cy="440" r="26" fill="${MOSS}"/><circle cx="600" cy="480" r="22" fill="${MARIGOLD}"/><rect x="250" y="330" width="14" height="250" rx="7" fill="${INK}"/><rect x="936" y="330" width="14" height="250" rx="7" fill="${INK}"/>`;
    case 'kids': {
      const balloons = [CORAL, MOSS, MARIGOLD].map((c, i) => {
        const x = 380 + i * 150 + r(8 + i) * 60, y = 210 + r(11 + i) * 90;
        return `<path d="M${x} ${y + 70} q -12 80 10 170" fill="none" stroke="${INK}" stroke-width="3"/><ellipse cx="${x}" cy="${y}" rx="52" ry="66" fill="${c}"/>`;
      }).join('');
      return `${sun}${hills(620, '#7FB58C')}${balloons}`;
    }
    case 'patios':
      return `${sun}${hills(640, '#C9A26E', 0.5)}<g transform="translate(470 210)"><path d="M0 120 Q 130 -20 260 120 Z" fill="${CORAL}"/><path d="M60 120 Q 130 40 200 120" fill="none" stroke="${PAPER}" stroke-width="6"/><rect x="126" y="120" width="8" height="240" fill="${INK}"/><rect x="40" y="300" width="180" height="16" rx="8" fill="${INK}"/></g>`;
    case 'worldcup':
      return `${sun}<rect y="470" width="1200" height="280" fill="#5FA05B"/><circle cx="600" cy="420" r="96" fill="${PAPER}" stroke="${INK}" stroke-width="6"/><path d="M600 360 L640 390 L625 436 L575 436 L560 390 Z" fill="${INK}"/>`;
    default: {
      const pinX = 520 + r(14) * 160;
      return `${sun}${hills(600, '#9DBB92')}${hills(680, MOSS)}<g transform="translate(${pinX} 230)"><path d="M60 0 C 110 0 130 40 130 70 C 130 120 60 190 60 190 C 60 190 -10 120 -10 70 C -10 40 10 0 60 0 Z" fill="${CORAL}"/><circle cx="60" cy="68" r="26" fill="${PAPER}"/></g>`;
    }
  }
}

function placeholderSvg({ category, title }) {
  const cat = SKIES[category] ? category : 'general';
  const hash = crypto.createHash('sha1').update(`${cat}|${title || ''}`).digest();
  const r = i => hash[i % hash.length] / 255;
  const [top, bottom] = SKIES[cat][hash[19] % SKIES[cat].length];
  // The name only: "Lil Play Cafe — play space and coffee" prints as "Lil
  // Play Cafe" (no dash punctuation on a customer surface, and it fits).
  const name = String(title || '').split(/\s[—–-]\s|:\s/)[0].trim();
  const lines = wrap(name || LABELS[cat]);
  // Contour lines across the sky, the DayHop motif, with one coral thread.
  const contours = [0, 1, 2, 3].map(i => `<path d="M-20 ${70 + i * 34} C 300 ${50 + i * 34 + r(i) * 20}, 700 ${90 + i * 34}, 1220 ${60 + i * 34}" fill="none" stroke="${i === 2 ? CORAL : INK}" stroke-width="${i === 2 ? 3 : 1.5}" opacity="${i === 2 ? 0.55 : 0.12}"/>`).join('');
  const textY = lines.length > 1 ? 620 : 660;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750" width="1200" height="750" role="img" aria-label="${esc(`Illustration: ${name || LABELS[cat]}`)}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="${INK}" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity="0.72"/></linearGradient></defs>
<rect width="1200" height="750" fill="url(#g)"/>${contours}${scene(cat, r)}
<rect width="1200" height="750" fill="url(#fade)"/>
<text x="64" y="${textY - 64}" font-family="-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" font-size="30" font-weight="700" letter-spacing="5" fill="${MARIGOLD}">${esc(LABELS[cat].toUpperCase())}</text>
${lines.map((l, i) => `<text x="64" y="${textY + i * 76}" font-family="-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" font-size="68" font-weight="800" fill="${PAPER}">${esc(l)}</text>`).join('')}
</svg>`;
}

router.get('/placeholder.svg', (req, res) => {
  const category = String(req.query.c || 'general').toLowerCase().slice(0, 20);
  const title = String(req.query.t || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 80);
  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=2592000, immutable');
  res.send(placeholderSvg({ category, title }));
});

module.exports = { router, placeholderSvg, wrap };
