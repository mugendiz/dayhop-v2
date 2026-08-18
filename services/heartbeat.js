// services/heartbeat.js — DayHop V2
// Last-run timestamps for the scheduled jobs. Five cadences hang off one
// instance's clock; before this, the only symptom of a dead scheduler was
// an email that quietly never arrived. /health (operator view) surfaces
// these, and the Monday report warns when the daily cadence goes stale.
// In-memory by design: a deploy resets it, which is why staleness checks
// also look at process uptime before crying wolf.

const runs = new Map(); // job name -> ISO timestamp of last fire

function record(name) {
  runs.set(name, new Date().toISOString());
}

function status() {
  return {
    process_uptime_hours: Math.round(process.uptime() / 36) / 100,
    last_runs: Object.fromEntries(runs)
  };
}

/** True when `name` should have fired within `maxAgeHours` and didn't —
 *  only after the process has been up long enough to have had the chance. */
function isStale(name, maxAgeHours) {
  if (process.uptime() < maxAgeHours * 3600) return false;
  const at = runs.get(name);
  return !at || Date.now() - Date.parse(at) > maxAgeHours * 3600 * 1000;
}

module.exports = { record, status, isStale };
