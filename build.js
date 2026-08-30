// build.js — minify + content-hash the app shell into public/dist/ (runs on
// postinstall, so Render's plain `npm install` build command picks it up).
// Two output layers:
//   - dist/assets/<name>.<hash8>.min.<ext>  — immutable, cached 1 year.
//     dist/index.html + dist/sw.js are rewritten to reference these, so a
//     deploy changes the URLs and no client can pair old JS with new HTML.
//   - dist/<name>.min.<ext> (legacy)        — same bytes under the stable
//     names, still served at max-age=300 for HTML/SW cached before hashing.
// Source files stay untouched and unminified — they ARE the documentation.
const esbuild = require('esbuild');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const targets = [
  { in: 'public/pixel.js', url: '/pixel.js', base: 'pixel', ext: 'js' },
  { in: 'public/app.js', url: '/app.js', base: 'app', ext: 'js' },
  { in: 'public/auth.js', url: '/auth.js', base: 'auth', ext: 'js' },
  { in: 'public/motion.js', url: '/motion.js', base: 'motion', ext: 'js' },
  { in: 'public/css/main.css', url: '/css/main.css', base: 'main', ext: 'css' }
];

const distDir = path.join(__dirname, 'public', 'dist');
const assetsDir = path.join(distDir, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
// Sweep stale hashed files so the dir doesn't accrete one set per deploy.
for (const f of fs.readdirSync(assetsDir)) fs.unlinkSync(path.join(assetsDir, f));

async function main() {
  const manifest = {}; // '/app.js' -> '/assets/app.<h8>.min.js'
  const hashes = [];
  for (const t of targets) {
    const r = await esbuild.build({
      entryPoints: [path.join(__dirname, t.in)],
      minify: true,
      bundle: false,
      write: false,
      logLevel: 'silent'
    });
    const bytes = r.outputFiles[0].contents;
    const h = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 8);
    hashes.push(h);
    const hashedName = `${t.base}.${h}.min.${t.ext}`;
    fs.writeFileSync(path.join(assetsDir, hashedName), bytes);
    fs.writeFileSync(path.join(distDir, `${t.base}.min.${t.ext}`), bytes); // legacy
    manifest[t.url] = '/assets/' + hashedName;
    const from = fs.statSync(path.join(__dirname, t.in)).size;
    console.log(`[build] ${t.in} ${(from / 1024).toFixed(0)}K -> ${(bytes.length / 1024).toFixed(0)}K  (${hashedName})`);
  }

  const deployHash = crypto.createHash('sha1').update(hashes.join('.')).digest('hex').slice(0, 8);

  // dist/index.html — same document, hashed asset URLs.
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  for (const [url, hashed] of Object.entries(manifest)) {
    html = html.split(`src="${url}"`).join(`src="${hashed}"`);
    html = html.split(`href="${url}"`).join(`href="${hashed}"`);
  }
  fs.writeFileSync(path.join(distDir, 'index.html'), html);

  // dist/sw.js — precache the hashed URLs; cache name keyed to the deploy so
  // activation sweeps the previous shell automatically.
  let sw = fs.readFileSync(path.join(__dirname, 'public', 'sw.js'), 'utf8');
  for (const [url, hashed] of Object.entries(manifest)) {
    sw = sw.split(`'${url}'`).join(`'${hashed}'`);
  }
  sw = sw.replace(/dayhop-shell-v(\d+)/, (m, v) => `dayhop-shell-v${v}-${deployHash}`);
  fs.writeFileSync(path.join(distDir, 'sw.js'), sw);

  fs.writeFileSync(path.join(distDir, 'asset-manifest.json'),
    JSON.stringify({ deployHash, assets: manifest }, null, 2));
  console.log(`[build] deploy ${deployHash}: hashed shell + rewritten index.html/sw.js`);
}

main().catch(err => {
  // A failed build must never break install/deploy — production falls back
  // to serving the unminified sources under the original URLs. Costs ~2x
  // gzipped wire size, so shout in the deploy log instead of whispering.
  console.error('========================================');
  console.error('[build] FAILED: production will serve UNMINIFIED sources');
  console.error('[build]', err.message);
  console.error('========================================');
});
