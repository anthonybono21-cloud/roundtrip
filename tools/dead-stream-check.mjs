/* Drives the real index.html in Chromium with a stand-in YouTube player, to
   prove that a camera which has died leaves the deck, that a camera which is
   merely off the air tonight is only rested and comes back, and that a camera
   which is fine is never touched.

   The page cannot be checked against YouTube itself from a sandbox, and
   pointing it at live ids would make the result depend on whatever those
   channels happen to be doing today. So every request off the box is
   intercepted: the camera list is a four-camera fixture, and
   www.youtube.com/embed/<id> is answered by a page that speaks the same
   postMessage handshake the real embed does and then behaves like a dead
   stream, a replay, a stall or a healthy feed. Everything on the page under
   test - the player watcher, the drop, the storage, the deck filter, the
   report - is the shipped code.

     node tools/dead-stream-check.mjs

   Needs playwright and a Chromium build. Point PLAYWRIGHT_PACKAGE and
   CHROMIUM_PATH at them if they are not where this expects. Exits non-zero
   with a list of what failed. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PKG  = process.env.PLAYWRIGHT_PACKAGE || 'playwright';
const EXE  = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 8781;

let chromium;
try { ({ chromium } = (await import(PKG)).default ?? await import(PKG)); }
catch { console.error('playwright not found; set PLAYWRIGHT_PACKAGE'); process.exit(2); }

const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
               '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
               '.ico':'image/x-icon', '.css':'text/css', '.svg':'image/svg+xml',
               '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory())
    return void res.writeHead(404).end('no');
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(PORT, r));

const cam = (name, video_id, category, pose) => ({
  name, kind:'youtube', video_id, location:'Nowhere', country:'XX', category,
  audio:'ambience', ads:'no', timezone:'UTC',
  pose:{ ...pose, alt_m:30, heading:0, pitch:-5, fov:60 } });
const CAMS = { rejects:[], cameras:[
  cam('Healthy Harbour',          'ok1',     'coast',  { lat:10, lng:10 }),
  cam('Blocked Embed Bay',        'dead1',   'coast',  { lat:20, lng:20 }),
  cam('Yesterday Replay Street',  'replay1', 'street', { lat:30, lng:30 }),
  cam('Silent Stall Square',      'stall1',  'square', { lat:40, lng:40 }),
  cam('Off Air Island',           'ended1',  'coast',  { lat:50, lng:50 }),
]};
let deck = CAMS;                     // what the page is served right now

/* The stand-in. It says nothing until it is asked to, exactly like the embed,
   so the page's own handshake is what is being tested. */
const player = id => `<!doctype html><meta charset=utf-8>
<body style="margin:0;background:#123;color:#fff;font:14px sans-serif">
<div style="padding:8px">stand-in player: ${id}</div>
<script>
const say = o => parent.postMessage(JSON.stringify(o), '*');
let asked = false;
addEventListener('message', e => {
  let d; try { d = JSON.parse(e.data); } catch { return; }
  if (!d || asked) return;
  if (d.event !== 'listening' && d.func !== 'addEventListener') return;
  asked = true;
  const id = ${JSON.stringify(id)}, every = f => setInterval(f, 500);
  setTimeout(() => {
    if (id === 'dead1') return say({ event:'onError', info:150 });   // embedding off
    if (id === 'ended1') return say({ event:'onStateChange', info:0 });  // off the air
    if (id === 'ok1'){                                              // live, at the edge
      say({ event:'onStateChange', info:1 });
      return every(() => say({ event:'infoDelivery',
        info:{ duration:0, currentTime:0, playerState:1 } }));
    }
    if (id === 'replay1'){                       // yesterday's 20 hours, from the top
      let t = 0;
      say({ event:'onStateChange', info:1 });
      return every(() => say({ event:'infoDelivery',
        info:{ duration:75000, currentTime:t += 0.5, playerState:1 } }));
    }
    say({ event:'onStateChange', info:3 });      // answers, buffers, never plays
    every(() => say({ event:'infoDelivery',
      info:{ duration:0, currentTime:0, playerState:3 } }));
  }, 300);
});
</script>`;

const browser = await chromium.launch({ executablePath: EXE, args:[
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--mute-audio'] });
const ctx = await browser.newContext({ viewport:{ width:1280, height:720 } });
const page = await ctx.newPage();
const reports = [];

// The most recently added route wins, so the catch-all goes on first.
await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
await page.route('**/cameras.json', r =>
  r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(deck) }));
await page.route('https://www.youtube.com/embed/**', r =>
  r.fulfill({ status:200, contentType:'text/html',
              body: player(new URL(r.request().url()).pathname.split('/').pop()) }));
await page.route('https://ntfy.sh/**', async r => {
  reports.push(JSON.parse(r.request().postData() || '{}'));
  await r.fulfill({ status:200, contentType:'text/plain', body:'ok' });
});

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil:'load' });
await page.waitForFunction(() => !!window.Roundtrip, null, { timeout:30000 });

const phase = () => page.evaluate(() => document.querySelector('#phase').textContent);
const dead  = () => page.evaluate(() => window.Roundtrip.dead().map(d => d.name));
const off   = () => page.evaluate(() => window.Roundtrip.offline().map(d => d.name));
const resting = name => page.evaluate(n => Object.values(window.Roundtrip.deadLog)
  .some(v => v.name === n && v.code == null && v.rest > Date.now()), name);

async function onOrbit(){            // a dive asked for mid-retreat is lost
  for (let i = 0; i < 60; i++){
    if (await phase() === 'orbit') return;
    await page.waitForTimeout(500);
  }
}
/* Land on a camera and wait for the page to make up its mind about it rather
   than for a fixed stretch of the clock: a landing is about four seconds of
   dive plus up to seven of settle hold if the player is buffering, so a fixed
   wait is a race the test loses at random. `hold` is how long to stay on a
   camera the page is expected to keep. */
async function land(name, { hold = 0, moves = false, strikes = 0,
                            strikeOf = ['stall1', 'stalls'] } = {}){
  await page.evaluate(() => window.Roundtrip.backToOrbit());  // don't sit out the dwell
  await onOrbit();
  await page.evaluate(n => window.Roundtrip.dive(n), name);
  if (moves){
    // Dropped on the way down, or shown and then left: either way the camera
    // is out of the rotation now. A player state only rests a camera, so that
    // counts as having moved on too, and so does a strike tally going up when
    // the strike is not yet the one that matters.
    for (let i = 0; i < 100; i++){
      if ((await dead()).includes(name)) break;
      // Wait for the tally when one is asked for. A camera that is already
      // resting from the landing before is resting on the way in, so testing
      // that first would leave this landing before its own strike lands.
      if (strikes){
        if (await page.evaluate(([k, kind]) =>
              (window.Roundtrip.deadLog[k] || {})[kind] || 0, strikeOf) >= strikes) break;
      } else if (await resting(name)) break;
      await page.waitForTimeout(500);
    }
  } else {
    for (let i = 0; i < 80; i++){
      if (await phase() === 'live') break;
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(hold * 1000);
  }
  console.log('  landed on', name, '· dropped so far:', (await dead()).join(', ') || 'nothing');
}

const fails = [];
const check = (what, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };

console.log('a healthy camera');
await land('Healthy Harbour', { hold: 14 });
check('a healthy camera is not dropped', !(await dead()).includes('Healthy Harbour'));

console.log('an embed the owner has turned off');
await land('Blocked Embed Bay', { moves: true });
check('a blocked embed is dropped', (await dead()).includes('Blocked Embed Bay'));
check('and it is out of the deck',
      !(await page.evaluate(() => window.Roundtrip.order())).includes('Blocked Embed Bay'));

/* A player state is about the moment and must never drop a camera. Of the 52
   cameras dropped on one of these by 16 November, 39 were broadcasting when
   they were asked; of the 10 dropped on one in the week to 23 November, all
   ten were. So a state rests the camera for a few hours instead, and after
   DEAD_OFFLINE separate landings it is reported under its own softer kind. */
console.log('a restarted broadcast left up as a recording, twice');
await land('Yesterday Replay Street', { moves: true, strikes: 1,
                                        strikeOf: ['replay1', 'replay'] });
check('a recording report rests it instead of dropping it',
      !(await dead()).includes('Yesterday Replay Street')
      && await resting('Yesterday Replay Street'));
check('and it is out of the rotation while it rests',
      !(await page.evaluate(() => window.Roundtrip.order())).includes('Yesterday Replay Street'));
await land('Yesterday Replay Street', { moves: true, strikes: 2,
                                        strikeOf: ['replay1', 'replay'] });
check('the second report still does not drop it',
      !(await dead()).includes('Yesterday Replay Street'));
check('and by then it is reported as off the air, not as dead',
      (await off()).includes('Yesterday Replay Street'));

console.log('a permanent broadcast that is off the air tonight');
await land('Off Air Island', { moves: true, strikes: 1,
                               strikeOf: ['ended1', 'offline'] });
check('one off-the-air report rests it and nothing more',
      !(await dead()).includes('Off Air Island') && await resting('Off Air Island'));
await land('Healthy Harbour', { hold: 12 });
check('and a camera that plays is untouched by it',
      !(await dead()).includes('Off Air Island'));
await land('Off Air Island', { moves: true, strikes: 2,
                               strikeOf: ['ended1', 'offline'] });
check('a second off-the-air report on another landing still does not drop it',
      !(await dead()).includes('Off Air Island'));
check('it is reported as off the air instead', (await off()).includes('Off Air Island'));

console.log('a player that answers but never plays, three times');
for (let i = 1; i <= 3; i++){
  await land('Silent Stall Square', { moves: true, strikes: i });
  check(`stall ${i} of 3 never drops it`,
        !(await dead()).includes('Silent Stall Square'));
}
check('three stalls are reported as off the air', (await off()).includes('Silent Stall Square'));

check('all three are resting and only the blocked embed is really gone',
      (await page.evaluate(() => window.Roundtrip.resting())).length === 3
      && (await dead()).length === 1);

/* The whole point of a rest: the camera comes back. Winding the stored rest
   back into the past is what the clock does three hours later anyway. */
await page.evaluate(() => {
  for (const v of Object.values(window.Roundtrip.deadLog))
    if (v.code == null && v.rest) v.rest = Date.now() - 1000;
});
check('and a rest that is up leaves nothing standing down',
      (await page.evaluate(() => window.Roundtrip.resting())).length === 0);

await land('Healthy Harbour', { hold: 18 });
check('the healthy camera is still fine after all that',
      !(await dead()).includes('Healthy Harbour'));
check('nothing reached the thumbs',
      (await page.evaluate(() => window.Roundtrip.votes())).length === 0);
check('the reports went out under the two separate kinds',
      reports.some(r => r.kind === 'cam-dead')
      && reports.some(r => r.kind === 'cam-offline')
      && reports.every(r => r.kind === 'cam-dead' || r.kind === 'cam-offline'));
check('and a camera is never on both lists at once',
      !reports.filter(r => r.kind === 'cam-dead').flatMap(r => r.cams.map(c => c.key))
        .some(k => reports.filter(r => r.kind === 'cam-offline')
          .flatMap(r => r.cams.map(c => c.key)).includes(k)));

const stored = await page.evaluate(() => localStorage.getItem('roundtrip.dead'));
await page.reload({ waitUntil:'load' });
await page.waitForFunction(() => !!window.Roundtrip, null, { timeout:30000 });
const after = await dead();
check('a fresh drop survives a reload', after.length === 1 && !after.includes('Healthy Harbour'));
check('and it is kept apart from the thumbs',
      !!stored && (await page.evaluate(() => localStorage.getItem('et45.rejects'))) === null);

// Mark every camera dead and the deck still has to deal one, or an eager
// check could empty the rotation.
await page.evaluate(cams => cams.forEach(c =>
  window.Roundtrip.dropDead(c, 'test', 'by hand')), deck.cameras);
for (let i = 0; i < 6; i++){
  await page.evaluate(() => window.Roundtrip.skipNext());
  await page.waitForTimeout(1500);
}
check('with every camera marked dead the deck still deals',
      (await page.evaluate(() => window.Roundtrip.order())).length > 0);

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nall good');
process.exit(fails.length ? 1 : 0);
