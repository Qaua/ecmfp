// ULGI accuracy check: compares past forecasts with ERA5 reanalysis (observation proxy).
// Usage (Node 18+):  node accuracy.js 48.97 89.96 2026-10-01 2026-10-30
// Prints MAE and bias per model and for the 3-model median, per variable.
const MODELS = ['ecmwf_ifs025', 'icon_seamless', 'gfs_seamless'];
const VARS = ['temperature_2m', 'wind_speed_10m', 'precipitation'];

function url(base, lat, lon, s, e, extra) {
  return `${base}?latitude=${lat}&longitude=${lon}&start_date=${s}&end_date=${e}` +
    `&hourly=${VARS.join(',')}&timezone=GMT${extra || ''}`;
}
async function getJson(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u);
  return r.json();
}
function pick(h, base, m, n) {
  const k1 = base + '_' + m, k2 = base;
  const a = h[k1] || h[k2];
  if (!a) throw new Error('missing ' + k1);
  return a.slice(0, n);
}
function median3(a, b, c) {
  return [a, b, c].sort((x, y) => x - y)[1];
}
function stats(pairs) {
  if (!pairs.length) return { mae: null, bias: null, n: 0 };
  let ae = 0, be = 0;
  for (const [f, o] of pairs) { ae += Math.abs(f - o); be += f - o; }
  return { mae: +(ae / pairs.length).toFixed(3), bias: +(be / pairs.length).toFixed(3), n: pairs.length };
}

async function run(lat, lon, s, e, deps = { getJson }) {
  const obsU = url('https://archive-api.open-meteo.com/v1/archive', lat, lon, s, e);
  const fcU = url('https://historical-forecast-api.open-meteo.com/v1/forecast', lat, lon, s, e) +
    '&models=' + MODELS.join(',');
  const [obs, fc] = await Promise.all([deps.getJson(obsU), deps.getJson(fcU)]);
  const t = obs.hourly.time;
  const n = t.length;
  const report = {};
  for (const v of VARS) {
    const o = obs.hourly[v];
    const perModel = {};
    const series = MODELS.map(m => pick(fc.hourly, v, m, n));
    MODELS.forEach((m, i) => {
      const pairs = [];
      for (let k = 0; k < n; k++) if (series[i][k] != null && o[k] != null) pairs.push([series[i][k], o[k]]);
      perModel[m] = stats(pairs);
    });
    const medPairs = [];
    for (let k = 0; k < n; k++) {
      const vals = series.map(sr => sr[k]);
      if (vals.some(x => x == null) || o[k] == null) continue;
      medPairs.push([median3(...vals), o[k]]);
    }
    report[v] = { models: perModel, median: stats(medPairs) };
  }
  return { period: [s, e], hours: n, report };
}

module.exports = { run, url, median3, stats };

if (require.main === module) {
  const [lat, lon, s, e] = process.argv.slice(2);
  if (!s || !e) { console.error('Usage: node accuracy.js <lat> <lon> <start YYYY-MM-DD> <end YYYY-MM-DD>'); process.exit(1); }
  run(lat, lon, s, e).then(r => console.log(JSON.stringify(r, null, 2))).catch(err => { console.error(err.message); process.exit(1); });
}node accuracy.js 48.97 89.96 2026-10-01 2026-10-30
