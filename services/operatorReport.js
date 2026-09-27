// services/operatorReport.js — DayHop V2
// The Monday morning operator email: one message, five sections — traffic,
// funnel/retention, acquisition by campaign, outreach pipeline, content
// health. Everything comes from data DayHop already owns (events table,
// outreach CRM, published articles), so the report is the honest monitor of
// what BabyLoveGrowth/Zeely/ads actually delivered — not what their
// dashboards claim. Sent to OPERATOR_REPORT_TO (default dayhopadmin@gmail.com).

const analytics = require('./analytics');
const outreach = require('./outreach');
const accounting = require('./accounting');
const { sendEmail } = require('./email');

const REPORT_TO = process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com';

function pct(n) { return n == null ? 'n/a' : `${n}%`; }

function money(cents, cur) {
  const v = (Math.abs(cents) / 100).toFixed(2);
  return `${cents < 0 ? '-' : ''}${String(cur).toUpperCase() === 'USD' ? 'US$' : 'CA$'}${v}`;
}

// Ledger totals are Stripe-backed, so they are the only revenue number in
// this report that cannot be inflated by a test session or a bot.
function ledgerLine(summary) {
  const cur = summary && summary.by_currency ? summary.by_currency : {};
  const parts = Object.entries(cur).map(([code, b]) =>
    `${money(b.income_cents, code)} in / ${money(b.expense_cents, code)} out / net ${money(b.net_cents, code)}`);
  return parts.length ? parts.join('  ·  ') : 'no ledger rows';
}

function incomeCents(summary) {
  const cur = summary && summary.by_currency ? summary.by_currency : {};
  return Object.values(cur).reduce((a, b) => a + (b.income_cents || 0), 0);
}

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}

// Dated commitments that cost money or close a decision. These were living in
// a plan document and in Claude session reminders, both of which evaporate;
// a renewal that quietly bills because nobody was reminded is the most
// expensive kind of forgotten task. Past dates drop off by themselves.
const DEADLINES = [
  { on: '2026-09-19', what: 'Gate 1 — is there an external dollar yet?', act: 'If not, the Oct 3 rule is live.' },
  { on: '2026-09-21', what: 'FALL75 ends 23:59 Toronto', act: 'Extend it or replace it — do not let the $5 price expire untested.' },
  { on: '2026-10-01', what: 'SuperGrok renews US$30', act: 'Cancellation decided 2026-09-27 — confirm it processed. The product runs on API credits, not a SuperGrok seat, so nothing breaks.' },
  { on: '2026-10-10', what: 'Zeely renews US$79.95', act: 'Cancellation decided 2026-09-27 — confirm it processed before this date.' },
  { on: '2026-09-27', what: 'BLG billing date — pause takes effect', act: 'BLG stays fully active/usable through this date (already paid for); billing drops to $0 after, autopilot cadence stops.' },
  { on: '2026-10-03', what: 'Gate 2 — day-30 maintenance-mode decision', act: 'On zero revenue, take the rule at its word.' },
  { on: '2027-02-13', what: 'BLG pause (5mo from Sep 27 billing date) resumes billing ~2027-02-27', act: 'Decide cancel vs. continue before it auto-resumes — confirm exact resume date from BLG\'s pause confirmation.' }
];

function deadlineLines(today = new Date()) {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return DEADLINES
    .map(d => ({ ...d, days: Math.round((Date.parse(d.on + 'T00:00:00Z') - t) / 864e5) }))
    .filter(d => d.days >= 0)
    .sort((a, b) => a.days - b.days)
    .map(d => `  ${d.on}  ${d.days === 0 ? 'TODAY' : `${d.days}d`.padStart(5)}  ${d.what}\n           ${d.act}`);
}

async function buildReport() {
  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const [metrics, pipeline, money7, monthToDate, lifetime] = await Promise.all([
    analytics.metrics({ excludeInternal: true }).catch(() => ({})),
    outreach.summary().catch(() => null),
    accounting.summary({ from: isoDaysAgo(7) }).catch(() => null),
    accounting.summary({ from: monthStart }).catch(() => null),
    accounting.summary({}).catch(() => null)
  ]);

  const daily = metrics.daily || [];
  const last7 = daily.slice(-7);
  const prev7 = daily.slice(-14, -7);
  const sum = (rows, k) => rows.reduce((a, d) => a + (d[k] || 0), 0);
  const wow = (cur, prev) => prev ? `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}%` : 'n/a';

  const activeCur = sum(last7, 'active_users'), activePrev = sum(prev7, 'active_users');
  const promptsCur = sum(last7, 'prompts'), promptsPrev = sum(prev7, 'prompts');
  const newCur = sum(last7, 'new_users');

  const lines = [];
  lines.push(`DayHop operator report — week of ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  // A dead daily cadence is otherwise invisible — nobody notices the email
  // that didn't arrive. Only warns once the process has been up long enough
  // that the cadence had a real chance to fire.
  const heartbeat = require('./heartbeat');
  if (heartbeat.isStale('outreach_cadence', 26)) {
    lines.push('!! WARNING: the outreach cadence has not fired in over a day — check /health schedulers.');
    lines.push('');
  }
  // Money first. Every other number in this email is a means to this one,
  // and for months the report had no revenue line at all — so a week with
  // CA$0 could still read as a busy week.
  const lifetimeIncome = incomeCents(lifetime);
  lines.push('MONEY (ledger, Stripe-backed — the only number that cannot be faked)');
  lines.push(`  Last 7 days:   ${ledgerLine(money7)}`);
  lines.push(`  Month to date: ${ledgerLine(monthToDate)}`);
  lines.push(`  Lifetime:      ${ledgerLine(lifetime)}`);
  if (!lifetimeIncome) {
    lines.push('  >> No external dollar has ever landed. Nothing below matters until one does.');
  }
  lines.push('');

  lines.push('TRAFFIC (external only, last 7 days vs prior 7)');
  lines.push(`  Active users: ${activeCur} (${wow(activeCur, activePrev)})   New users: ${newCur}`);
  lines.push(`  Prompts: ${promptsCur} (${wow(promptsCur, promptsPrev)})   Browses: ${sum(last7, 'browses')}`);
  lines.push(`  Shortlist adds: ${sum(last7, 'shortlist_adds')}   Booking clicks: ${sum(last7, 'booking_clicks')}   Plans built: ${sum(last7, 'plans_built')}`);
  // Raw event counts include crawlers and founder QA; user counts do not.
  // Without this line a 589-browse month reads as 589 human visits.
  const tr = metrics.traffic;
  if (tr && tr.internal && tr.external) {
    const total = tr.internal.events + tr.external.events;
    const share = total ? Math.round((tr.internal.events / total) * 100) : 0;
    lines.push(`  Reality check: ${share}% of all events are founder/internal; bot filter also drops ${(metrics.bots && metrics.bots.events) || 0} crawler events.`);
  }
  lines.push('');

  if (metrics.retention && metrics.retention.week4_avg != null) {
    lines.push('RETENTION');
    lines.push(`  Week-4 average: ${pct(metrics.retention.week4_avg)} (measured over ${metrics.retention.measured_users} users)`);
    lines.push('');
  }

  const sources = (metrics.acquisition && metrics.acquisition.sources) || [];
  lines.push('ACQUISITION BY CAMPAIGN (all time, from UTM attribution)');
  if (sources.length) {
    for (const s of sources) {
      lines.push(`  ${s.source}/${s.campaign}: ${s.prompts || 0} prompts started, ${s.subscribers} subscribers, ${s.signups} signups, ${s.checkouts} checkouts`);
    }
  } else {
    lines.push('  No attributed conversions yet.');
  }
  lines.push('');

  if (pipeline) {
    lines.push('OUTREACH PIPELINE');
    lines.push(`  ${pipeline.total} prospects — ` +
      Object.entries(pipeline.by_stage).map(([k, v]) => `${k}: ${v}`).join(', '));
    if (pipeline.awaiting_approval) lines.push(`  >> ${pipeline.awaiting_approval} opener draft${pipeline.awaiting_approval === 1 ? '' : 's'} awaiting your approval in the CRM tab`);
    if (pipeline.replied) lines.push(`  >> ${pipeline.replied} replied/won — check admin@dayhop.quest and follow up`);
    lines.push('');
  }

  const aff = metrics.affiliate;
  if (aff) {
    lines.push('AFFILIATE');
    lines.push(`  Viator clicks (30d): ${aff.clicks_30d}`);
    lines.push('');
  }

  // This list used to be four hardcoded lines that never changed, still
  // named the retired FOUNDING50 code, still claimed TikTok had no posts,
  // and skipped "2." whenever there were no drafts to approve. An action
  // list that cannot react to the numbers above it is just decoration —
  // these are derived, ranked by how close each one sits to a dollar.
  const actions = [];
  if (pipeline && pipeline.replied) {
    actions.push(`Answer the ${pipeline.replied} outreach repl${pipeline.replied === 1 ? 'y' : 'ies'} at admin@dayhop.quest — a warm reply is the shortest path to the first dollar (Spotlight is CA$99/mo, code FOUNDING).`);
  }
  if (!lifetimeIncome) {
    actions.push('Put the working $5 guide offer in front of every human you can name — confirmed subscribers, creators, past signups. The offer only became correct end-to-end on Sep 11; nobody has been shown it yet.');
  }
  if (pipeline && pipeline.awaiting_approval) {
    actions.push(`Approve the ${pipeline.awaiting_approval} queued opener draft${pipeline.awaiting_approval === 1 ? '' : 's'} in the CRM tab.`);
  }
  const lastIssue = metrics.digest && metrics.digest.issues && metrics.digest.issues[0];
  if (lastIssue && lastIssue.ctr_pct != null) {
    actions.push(`Email is the only channel with real engagement (last issue: ${pct(lastIssue.open_rate_pct)} open, ${pct(lastIssue.ctr_pct)} CTR on ${lastIssue.sent} sent). Grow that list before anything else.`);
  }
  if (aff && aff.clicks_30d === 0) {
    actions.push('Viator has produced 0 clicks in 30 days — stop counting on affiliate income this quarter.');
  }
  const due = deadlineLines();
  if (due.length) {
    lines.push('DEADLINES (money and decisions, nearest first)');
    due.forEach(l => lines.push(l));
    lines.push('');
  }

  lines.push('THIS WEEK, IN ORDER:');
  actions.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`));
  lines.push('');
  lines.push('Dashboard: https://dayhop.quest/admin.html');

  return lines.join('\n');
}

async function sendReport() {
  const text = await buildReport();
  const res = await sendEmail({
    to: REPORT_TO,
    subject: `DayHop weekly: your Monday operator report`,
    text,
    html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
  });
  if (res.sent) console.log(`[report] Monday operator report sent to ${REPORT_TO}`);
  else console.warn('[report] operator report send failed:', res.reason);
  return res;
}

module.exports = { buildReport, sendReport };
