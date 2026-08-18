// services/operatorReport.js — DayHop V2
// The Monday morning operator email: one message, five sections — traffic,
// funnel/retention, acquisition by campaign, outreach pipeline, content
// health. Everything comes from data DayHop already owns (events table,
// outreach CRM, published articles), so the report is the honest monitor of
// what BabyLoveGrowth/Zeely/ads actually delivered — not what their
// dashboards claim. Sent to OPERATOR_REPORT_TO (default dayhopadmin@gmail.com).

const analytics = require('./analytics');
const outreach = require('./outreach');
const { sendEmail } = require('./email');

const REPORT_TO = process.env.OPERATOR_REPORT_TO || 'dayhopadmin@gmail.com';

function pct(n) { return n == null ? 'n/a' : `${n}%`; }

async function buildReport() {
  const [metrics, pipeline] = await Promise.all([
    analytics.metrics({ excludeInternal: true }).catch(() => ({})),
    outreach.summary().catch(() => null)
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
  lines.push('TRAFFIC (external only, last 7 days vs prior 7)');
  lines.push(`  Active users: ${activeCur} (${wow(activeCur, activePrev)})   New users: ${newCur}`);
  lines.push(`  Prompts: ${promptsCur} (${wow(promptsCur, promptsPrev)})   Browses: ${sum(last7, 'browses')}`);
  lines.push(`  Shortlist adds: ${sum(last7, 'shortlist_adds')}   Booking clicks: ${sum(last7, 'booking_clicks')}   Plans built: ${sum(last7, 'plans_built')}`);
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

  lines.push('THIS WEEK, IN ORDER:');
  lines.push('  1. Reply to any outreach responses (CRM tab has one-click FOUNDING50 send).');
  if (pipeline && pipeline.awaiting_approval) lines.push('  2. Approve the queued opener drafts.');
  lines.push('  3. Post the social batch (TikTok still needs its first post).');
  lines.push('  4. 10 minutes of IG/TikTok comment replies.');
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
