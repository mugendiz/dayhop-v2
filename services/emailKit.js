// services/emailKit.js — DayHop V2
// The visual building blocks both weekly newsletters share (services/digest.js
// "The weekend brief", services/tottDigest.js "Talk of the town"): a masthead
// image, picture cards with a category badge and a numbered pick, a weather
// box, buttons, the footer and the open pixel.
//
// Email-client rules this follows: tables for layout, inline styles only
// (clients strip <style>), absolute image URLs, explicit width/height on
// every <img>, PNG/JPEG only (Outlook does not show WebP), and alt text on
// every image so a blocked-images inbox still reads.
//
// Photos (photoFor): a DayHop self-hosted hero, or a partner's own event
// image. NEVER a Google Places photo: Google's terms cover displaying them in
// the product, not reusing them in email, so /api/photo proxy links and
// googleusercontent URLs are refused here. Anything else gets the category's
// own illustrated banner (scripts/build-email-art.js), which is owned art.

const CARD_W = 520;  // inner width of the 560px column
const PHOTO_H = 260;
const BANNER_H = 200;

const INK = '#102A2E', INK_SOFT = '#41585C', CORAL = '#E1502F', MOSS = '#3F6F5C', PAPER = '#FBF7EE', LINE = '#E8E2D4';
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function abs(base, url) {
  if (!url) return null;
  const u = String(url);
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${String(base).replace(/\/+$/, '')}${u}`;
  return null;
}

// ---------- categories ----------
// Badge (emoji + words + colour) and the banner a pick falls back to.
const KINDS = {
  nature: { emoji: '🌲', label: 'Outdoors', color: MOSS, banner: 'cat-nature.png' },
  food: { emoji: '🍽️', label: 'Eat & drink', color: '#B5482A', banner: 'cat-food.png' },
  culture: { emoji: '🏛️', label: 'Culture', color: '#6A4C93', banner: 'cat-culture.png' },
  family: { emoji: '🎈', label: 'Family', color: '#C27C00', banner: 'cat-family.png' },
  water: { emoji: '⛵', label: 'On the water', color: '#2C7A8C', banner: 'cat-water.png' },
  adventure: { emoji: '🧗', label: 'Adventure', color: '#9C3D1F', banner: 'cat-adventure.png' },
  events: { emoji: '🎟️', label: 'Event', color: CORAL, banner: 'cat-events.png' }
};
const NATURE_RE = /\b(trail|hike|park|conservation|garden|forest|falls|lookout|ravine|beach|nature|marsh|farm|orchard|pumpkin|apple)\b/i;

function kindOf(p) {
  const c = String(p.category || '').toLowerCase();
  if (c === 'kids') return 'family';
  if (c === 'food' || c === 'patios') return 'food';
  if (c === 'water' || c === 'cruises') return 'water';
  if (c === 'adventures') return 'adventure';
  if (c === 'culture') return 'culture';
  if (p.date || p.datetime) return 'events';
  if (NATURE_RE.test(`${p.title || ''} ${p.description || ''}`)) return 'nature';
  return 'events';
}

// ---------- photos ----------
const GOOGLE_PHOTO_RE = /\/api\/photo|googleusercontent\.com|maps\.googleapis\.com|ggpht\.com/i;
// Partners whose own event images we may show alongside their listing.
const PARTNER_IMG_RE = /^https:\/\/([a-z0-9-]+\.)*(evbuc\.com|eventbrite\.(ca|com)|ticketm\.net|ticketmaster\.(ca|com)|tmol-prd\.appspot\.com|bibliocommons\.com|toronto\.ca)\//i;

/**
 * The photo for a pick, or null. → { src, credit, alt } with an absolute src.
 * Self-hosted heroes (/img/heroes/…) carry their licence credit; partner
 * event images need none beyond the link to the partner's own page.
 */
function photoFor(p, base) {
  const raw = p && p.image_url;
  if (!raw || GOOGLE_PHOTO_RE.test(raw)) return null;
  const src = abs(base, raw);
  if (!src) return null;
  const selfHosted = /^\/img\//.test(raw) || src.startsWith(`${String(base).replace(/\/+$/, '')}/img/`);
  if (!selfHosted && !PARTNER_IMG_RE.test(src)) return null;
  if (/\.webp(\?|$)/i.test(src)) return null; // Outlook: no WebP
  const c = p.image_credit || null;
  const credit = c && (c.author || c.licence || c.license)
    ? `Photo: ${String(c.author || 'Wikimedia Commons').replace(/\s+/g, ' ').slice(0, 60)}${c.licence || c.license ? `, ${c.licence || c.license}` : ''}`
    : null;
  return { src, credit, alt: String(p.title || 'DayHop pick') };
}

// Links from feeds land on a public page (routes/issues.js) as well as in
// email, so only http(s) gets through; anything else (javascript:, data:)
// becomes the site's own home page.
function safeHref(url, base) {
  return /^https?:\/\//i.test(String(url || '')) ? String(url) : `${String(base).replace(/\/+$/, '')}/`;
}

// ---------- blocks ----------
function masthead(base, kind, alt) {
  const src = `${String(base).replace(/\/+$/, '')}/img/email/${kind === 'tott' ? 'masthead-tott.png' : 'masthead-weekend.png'}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td style="border-radius:14px;overflow:hidden;background:${INK};">
      <img src="${esc(src)}" width="560" height="140" alt="${esc(alt)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:14px;">
    </td></tr></table>`;
}

function button(href, text, { color = CORAL, small = false } = {}) {
  return `<a href="${esc(href)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:700;font-size:${small ? 13.5 : 15.5}px;padding:${small ? '9px 16px' : '13px 28px'};border-radius:10px;font-family:${FONT};">${esc(text)}</a>`;
}

function badge(kind, extra) {
  const k = KINDS[kind] || KINDS.events;
  return `<span style="display:inline-block;background:${k.color};color:#ffffff;font-size:11.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px;">${k.emoji}&nbsp; ${esc(extra || k.label)}</span>`;
}

/**
 * One pick as a picture card.
 * opts: { index, base, link, planLink, ribbon, period, metaLines: [string], description, ctaLabel }
 * period: 'weekend' or 'week', the issue's own span, for the standout banner.
 */
function pickCard(p, { index, base, link: rawLink, planLink: rawPlan, ribbon, period = 'weekend', metaLines = [], description, ctaLabel }) {
  const link = safeHref(rawLink, base);
  const planLink = rawPlan ? safeHref(rawPlan, base) : null;
  const kind = kindOf(p);
  const photo = photoFor(p, base);
  const img = photo
    ? `<a href="${esc(link)}" style="text-decoration:none;"><img src="${esc(photo.src)}" width="${CARD_W}" height="${PHOTO_H}" alt="${esc(photo.alt)}" style="display:block;width:100%;max-width:${CARD_W}px;height:auto;max-height:${PHOTO_H + 60}px;object-fit:cover;border:0;border-radius:14px 14px 0 0;"></a>
       ${photo.credit ? `<p style="margin:4px 16px 0;font-size:10.5px;color:#8a9a9c;">${esc(photo.credit)}</p>` : ''}`
    : `<a href="${esc(link)}" style="text-decoration:none;"><img src="${esc(`${String(base).replace(/\/+$/, '')}/img/email/${(KINDS[kind] || KINDS.events).banner}`)}" width="${CARD_W}" height="${BANNER_H}" alt="${esc(`${(KINDS[kind] || KINDS.events).label}: ${p.title || ''}`)}" style="display:block;width:100%;max-width:${CARD_W}px;height:auto;border:0;border-radius:14px 14px 0 0;"></a>`;
  const metas = metaLines.filter(Boolean).map(m => `<p style="margin:0 0 4px;font-size:13px;color:#6b7c7e;">${esc(m)}</p>`).join('');
  // The forwardable bits (services/issueEnrich.js): the standout gets a
  // banner of its own, every pick a one-line hook and "best for" chips.
  const standoutBar = p.standout
    ? `<tr><td style="background:${CORAL};color:#ffffff;padding:10px 20px;font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;border-radius:13px 13px 0 0;">⭐ If you only do one thing this ${period === 'week' ? 'week' : 'weekend'}</td></tr>`
    : '';
  const hook = p.hook ? `<p style="margin:0 0 8px;font-size:15.5px;font-weight:700;line-height:1.4;color:${CORAL};">${esc(p.hook)}</p>` : '';
  const chips = (p.best_for || []).length
    ? `<p style="margin:2px 0 8px;">${p.best_for.map(t => `<span style="display:inline-block;margin:0 6px 4px 0;background:#F2ECDC;color:${INK};font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;">${esc(BEST_FOR_EMOJI[t] || '✓')} ${esc(t)}</span>`).join('')}</p>`
    : '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#ffffff;border:${p.standout ? `3px solid ${CORAL}` : `1px solid ${LINE}`};border-radius:14px;">
      ${standoutBar}
      <tr><td style="padding:0;">${img}</td></tr>
      <tr><td style="padding:16px 20px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>
          <td style="padding:0 10px 0 0;"><span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:${INK};color:#ffffff;font-weight:800;font-size:14px;">${index + 1}</span></td>
          <td>${badge(kind)}${ribbon ? `&nbsp; <span style="font-size:12px;font-weight:700;color:${CORAL};">${esc(ribbon)}</span>` : ''}</td>
        </tr></table>
        <p style="margin:0 0 6px;font-size:19px;font-weight:800;line-height:1.3;"><a href="${esc(link)}" style="color:${INK};text-decoration:none;">${esc(p.title)}</a></p>
        ${hook}
        ${chips}
        ${metas}
        ${description ? `<p style="margin:6px 0 14px;font-size:14.5px;line-height:1.55;color:#2C4A4E;">${esc(description)}</p>` : ''}
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:0 10px 0 0;">${button(link, ctaLabel || 'See it', { color: INK, small: true })}</td>
          ${planLink ? `<td>${button(planLink, 'Plan the day', { color: CORAL, small: true })}</td>` : ''}
        </tr></table>
      </td></tr>
    </table>`;
}

function weatherIcon(w) {
  if (!w) return '🌤️';
  if (w.is_rainy) return '🌧️';
  if (w.is_extreme_cold) return '🥶';
  if (w.is_extreme_heat) return '🥵';
  if (/snow/i.test(w.description || '')) return '❄️';
  if (/cloud|overcast/i.test(w.description || '')) return '⛅';
  return '☀️';
}

function weatherBox(w, text) {
  if (!w || !text) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-left:5px solid #FFB627;border-radius:12px;padding:14px 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:34px;line-height:1;padding:0 14px 0 0;vertical-align:middle;">${weatherIcon(w)}</td>
        <td style="vertical-align:middle;">
          <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${MOSS};font-weight:700;">Weekend weather</p>
          <p style="margin:2px 0 0;font-size:15px;line-height:1.45;color:${INK};">${w.temp_c != null ? `<b style="font-size:18px;">${esc(Math.round(w.temp_c))}°C</b>&nbsp; ` : ''}${esc(text)}</p>
        </td>
      </tr></table>
    </td></tr></table>`;
}

function footer(unsub) {
  return `<p style="margin:30px 0 0;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:#6b7c7e;">
      You're receiving this because you subscribed at dayhop.quest.<br>
      DayHop · Richmond Hill, Ontario, Canada · <a href="mailto:admin@dayhop.quest" style="color:#6b7c7e;">admin@dayhop.quest</a><br>
      <a href="${unsub}" style="color:#6b7c7e;">Unsubscribe</a>. One click, no questions.
    </p>`;
}

function page(inner) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:${PAPER};">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px 36px;font-family:${FONT};color:${INK};">
${inner}
  </div></body></html>`;
}

const BEST_FOR_EMOJI = { Free: '🆓', Toddlers: '🧸', 'Rainy day': '☔', 'Date night': '🌙', 'Day trip': '🚗', Kids: '🎈' };

// ---------- sharing ----------
// The public web copy of an issue (routes/issues.js) and the links that
// pass it on. Every shared link carries utm_source=share and the channel,
// so pixel.js records where a forwarded reader came from.
const ISSUE_PATH = { weekend: 'weekend', tott: 'talk-of-the-town' };
function issueUrl(base, kind, date) {
  return `${String(base).replace(/\/+$/, '')}/${ISSUE_PATH[kind] || 'weekend'}/${date}`;
}
function tagged(url, medium, kind) {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'share');
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_campaign', kind === 'tott' ? 'tott' : 'weekend');
  return u.toString();
}
function shareLinks(webUrl, kind, subject) {
  const title = subject || (kind === 'tott' ? 'Talk of the town on DayHop' : 'This weekend on DayHop');
  const viaEmail = tagged(webUrl, 'email', kind);
  return {
    web: tagged(webUrl, 'web', kind),
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`Thought you'd like ${kind === 'tott' ? "this week's" : "this weekend's"} picks from DayHop:\n\n${viaEmail}`)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${tagged(webUrl, 'whatsapp', kind)}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tagged(webUrl, 'facebook', kind))}`,
    copy: tagged(webUrl, 'copy', kind)
  };
}

/**
 * The share row. opts.wrap tracks clicks in the email; opts.web adds a
 * real copy button (scripts are stripped in email, so there it is a link).
 */
function shareRow(links, { wrap: track = u => u, web = false, heading = 'Know a family who would love this?' } = {}) {
  // The click tracker only redirects to http(s) (routes/digestTrack.js), and
  // a mail client opens mailto: itself, so "Forward to a friend" is never
  // wrapped. Its attribution rides the utm tags on the link inside the body.
  const wrap = (u, ch) => (/^mailto:/i.test(u) ? u : track(u, ch));
  const pill = (href, text, bg) => `<a href="${esc(href)}" ${/^https?:/.test(href) ? 'target="_blank" rel="noopener"' : ''} style="display:inline-block;margin:0 6px 8px 0;background:${bg};color:#ffffff;text-decoration:none;font-weight:700;font-size:13.5px;padding:9px 14px;border-radius:999px;font-family:${FONT};">${text}</a>`;
  const copy = web
    ? `<button type="button" data-copy="${esc(links.copy)}" style="display:inline-block;margin:0 6px 8px 0;background:#ffffff;color:${INK};border:1.5px solid ${INK};font-weight:700;font-size:13.5px;padding:8px 14px;border-radius:999px;cursor:pointer;font-family:${FONT};">🔗 Copy link</button>`
    : pill(wrap(links.web, 'web'), '🔗 Open and share the web version', INK);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
    <tr><td style="background:#ffffff;border:2px dashed #E1502F;border-radius:14px;padding:16px 18px;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:${INK};">${esc(heading)} 💌</p>
      <p style="margin:0 0 12px;font-size:13.5px;color:#41585C;">Pass it on. They can get their own copy free.</p>
      ${pill(wrap(links.email, 'email'), '✉️ Forward to a friend', CORAL)}${pill(wrap(links.whatsapp, 'whatsapp'), '💬 WhatsApp', '#1DA851')}${pill(wrap(links.facebook, 'facebook'), 'Facebook', '#1877F2')}${copy}
    </td></tr></table>`;
}

// /?plan=<text> prefills and runs the planner (public/app.js); the UTM tags
// make newsletter traffic visible in acquisition, which it never was.
function planUrl(base, title, campaign) {
  const q = new URLSearchParams({ plan: `Plan a family day around ${title}`.slice(0, 300), utm_source: 'newsletter', utm_medium: 'email', utm_campaign: campaign });
  return `${String(base).replace(/\/+$/, '')}/?${q.toString()}`;
}

module.exports = { safeHref, masthead, pickCard, weatherBox, button, footer, page, photoFor, kindOf, planUrl, esc, KINDS, GOOGLE_PHOTO_RE, issueUrl, shareLinks, shareRow };
