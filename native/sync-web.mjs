/* Copies the published Roundtrip web app into native/www, which is what the
   iOS and Android shells bundle and load.

   The repo root is the source of truth for the app: index.html is the file
   GitHub Pages serves and the file every other thread edits. Nothing here
   writes back to it. The one change made on the way in is a single <script>
   tag appended before </body>, which loads the native bridge — so the web
   build stays exactly as it ships and only the bundled copy knows it is
   running inside an app.

   The file list is read out of index.html rather than written down here. Other
   threads add files to the app constantly — tv.js turned up the same afternoon
   this was written — and a hardcoded list would ship an app missing whatever
   was added last, which fails at runtime rather than at build time.

   Run: node sync-web.mjs   (or npm run sync-web) */

import { cp, rm, mkdir, readFile, writeFile, access, stat } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const www  = join(here, 'www');

// The page itself, and the two things it fetches at runtime rather than
// referencing in markup.
const ALWAYS = ['index.html', 'cameras.json', 'favicon.ico'];
// Pulled in by JS at runtime (three.js, textures, the cloud build's assets),
// so no tag mentions them.
const DIRS = ['assets', 'vendor'];

const BRIDGE = 'roundtrip-native.js';
const TAG = `<script src="./${BRIDGE}"></script>`;

const exists = async p => { try { await access(p); return true; } catch { return false; } };

/* Every "./thing" the page names: script src, stylesheet href, module import.
   One regex over the whole file catches all three, which is the point. */
async function referenced(html) {
  const found = new Set();
  for (const [, path] of html.matchAll(/["'`]\.\/([A-Za-z0-9_\-./]+)["'`]/g)) {
    // Keep it inside the repo, and keep it to the first path segment for
    // anything nested, so clouds/et45-clouds-inline.js brings its whole folder.
    const clean = normalize(path);
    if (clean.startsWith('..')) continue;
    found.add(clean.includes('/') ? clean.split('/')[0] : clean);
  }
  return found;
}

const html = await readFile(join(repo, 'index.html'), 'utf8');
const wanted = new Set([...ALWAYS, ...DIRS, ...(await referenced(html))]);

await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });

const missing = [];
for (const name of [...wanted].sort()) {
  const from = join(repo, name);
  if (!(await exists(from))) { missing.push(name); continue; }
  const isDir = (await stat(from)).isDirectory();
  await cp(from, join(www, name), isDir ? { recursive: true } : {});
  console.log(`  ${name}${isDir ? '/' : ''}`);
}

// The bridge itself lives in native/bridge and is copied in beside the app.
await cp(join(here, 'bridge', BRIDGE), join(www, BRIDGE));
console.log(`  ${BRIDGE}  (native only)`);

// Append the bridge to the bundled index.html, never to the repo's own.
const page = join(www, 'index.html');
let bundled = await readFile(page, 'utf8');
if (!bundled.includes(TAG)) {
  if (!bundled.includes('</body>')) throw new Error('index.html has no </body> to append to');
  await writeFile(page, bundled.replace('</body>', `${TAG}\n</body>`));
  console.log('  index.html  (bridge tag appended)');
}

if (missing.length) {
  console.warn(`\n  index.html names ${missing.length} path(s) that are not in the repo: ${missing.join(', ')}`);
}
console.log('www is up to date.');
