// scripts/retire-out-of-region.js — one-time (re-runnable) cleanup for
// public.auto_catalog: applies the publish-time geography gate
// (services/regionGate.js) to every active auto-published entry and flips
// out-of-region rows to status 'retired'. Retired rows stay in the table
// for audit (GET /api/admin/catalog?status=retired) — nothing is deleted.
// Usage: node scripts/retire-out-of-region.js [--dry-run]
require('dotenv').config();
const dbClient = require('../services/db/client');
const { regionVerdict } = require('../services/regionGate');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dbClient.status().service_key !== true) {
    console.error('No Supabase service key configured — nothing to do.');
    process.exit(1);
  }
  const db = dbClient.getClient();
  const { data, error } = await db.from('auto_catalog')
    .select('id, entry, status').eq('status', 'active').limit(2000);
  if (error) throw error;

  let kept = 0, retired = 0;
  for (const row of data || []) {
    const e = row.entry || {};
    const verdict = regionVerdict({
      lat: e.lat, lng: e.lng,
      text: [e.location, e.venue, e.title].filter(Boolean).join(' | ')
    });
    if (verdict.pass) { kept++; continue; }
    console.log(`retire  ${row.id}  "${e.title}" (${e.location}) — ${verdict.reason}`);
    if (!dryRun) {
      const { error: upErr } = await db.from('auto_catalog')
        .update({ status: 'retired' }).eq('id', row.id);
      if (upErr) { console.error(`  FAILED: ${upErr.message}`); continue; }
    }
    retired++;
  }
  console.log(`\n${data.length} active rows: ${kept} kept, ${retired} ${dryRun ? 'would be retired (dry run)' : 'retired'}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
