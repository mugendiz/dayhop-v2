// build.js — minify the app shell into public/dist/ (runs on postinstall,
// so Render's plain `npm install` build command picks it up with no
// blueprint change). ~40% of app.js/main.css bytes are comments and
// whitespace — great documentation for the repo, dead weight on the wire
// and in the phone's JS parser. Source files stay untouched; server.js
// serves the minified bytes under the ORIGINAL URLs in production, so
// index.html and sw.js never need to know this step exists.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const targets = [
  { in: 'public/app.js', out: 'public/dist/app.min.js' },
  { in: 'public/auth.js', out: 'public/dist/auth.min.js' },
  { in: 'public/motion.js', out: 'public/dist/motion.min.js' },
  { in: 'public/css/main.css', out: 'public/dist/main.min.css' }
];

fs.mkdirSync(path.join(__dirname, 'public', 'dist'), { recursive: true });

Promise.all(targets.map(t =>
  esbuild.build({
    entryPoints: [path.join(__dirname, t.in)],
    outfile: path.join(__dirname, t.out),
    minify: true,
    bundle: false,
    logLevel: 'silent'
  }).then(() => {
    const from = fs.statSync(path.join(__dirname, t.in)).size;
    const to = fs.statSync(path.join(__dirname, t.out)).size;
    console.log(`[build] ${t.in} ${(from / 1024).toFixed(0)}K -> ${(to / 1024).toFixed(0)}K`);
  })
)).catch(err => {
  // A failed minify must never break install/deploy — production simply
  // falls back to serving the unminified sources.
  console.warn('[build] minification failed (serving unminified sources):', err.message);
});
