/* Checks the viewer's own isLiveNow against a table of cases, and then asks it
   about every camera in the list at every hour of a week.

   The function is lifted straight out of index.html rather than copied here,
   so this cannot drift from what actually ships. Two things it is looking for:
   a window that answers the wrong way on a day boundary, and a window that
   quietly hides a camera for good - a camera nobody ever sees is the same as a
   camera that was never added, and nothing else in the repo would notice.

     node tools/live-window-check.mjs
*/
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const from = src.indexOf('const DAYNAMES =');
const start = src.indexOf('function isLiveNow(cam){');
const end = src.indexOf('\n}\n', start) + 3;
if (from < 0 || start < 0 || end < 3){
  console.error('could not find isLiveNow in index.html'); process.exit(2);
}
const mod = 'let NOW = new Date();\nconst now = () => NOW;\n'
          + src.slice(from, end)
          + '\nexport { isLiveNow };\nexport const setNow = d => { NOW = d; };\n';
const tmp = path.join(ROOT, '.live-window-check.tmp.mjs');
fs.writeFileSync(tmp, mod);
let isLiveNow, setNow;
try { ({ isLiveNow, setNow } = await import('file://' + tmp)); }
finally { fs.unlinkSync(tmp); }

const fails = [];
const check = (what, got, want) => {
  const ok = got === want;
  console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : ` (got ${got}, wanted ${want})`));
  if (!ok) fails.push(what);
};
const at = iso => setNow(new Date(iso));

console.log('the cases');
const shop = { live_window:{ tz:'Asia/Tokyo', from:'09:00', to:'18:00',
                             weekdays:['mon','wed','thu','fri','sat','sun'] } };
at('2026-10-27T04:00:00Z');   // Tuesday, 13:00 in Tokyo
check('a shop closed on Tuesday is held back on Tuesday', isLiveNow(shop), false);
at('2026-10-28T04:00:00Z');
check('and dealt on Wednesday', isLiveNow(shop), true);
at('2026-10-28T23:00:00Z');   // 08:00 Thursday in Tokyo, before it opens
check('and still held back outside its hours', isLiveNow(shop), false);

const nightly = { live_window:{ tz:'UTC', from:'20:00', to:'02:00', weekdays:['fri'] } };
at('2026-10-30T21:00:00Z');
check('a Friday-night venue is on air on Friday evening', isLiveNow(nightly), true);
at('2026-10-31T01:00:00Z');
check('and after midnight, which is still Friday night', isLiveNow(nightly), true);
at('2026-10-31T21:00:00Z');
check('but not the following evening', isLiveNow(nightly), false);

const sets = { live_window:{ tz:'UTC', from:'11:00', to:'20:00', sets:[
  { from:'11:30', to:'14:30', weekdays:['mon','fri'] },
  { from:'16:30', to:'19:30' } ] } };
at('2026-10-26T12:00:00Z');
check('a set that only runs some days counts on one of them', isLiveNow(sets), true);
at('2026-10-27T12:00:00Z');
check('and not on the others', isLiveNow(sets), false);
at('2026-10-27T17:00:00Z');
check('while a set with no days of its own still counts', isLiveNow(sets), true);

check('a camera with no window is always on air', isLiveNow({}), true);
check('an unreadable zone never hides a camera',
      isLiveNow({ live_window:{ tz:'Not/AZone', from:'09:00', to:'10:00', weekdays:['mon'] } }), true);

console.log('\nthe list');
const cams = JSON.parse(fs.readFileSync(path.join(ROOT, 'cameras.json'), 'utf8')).cameras;
const windowed = cams.filter(c => c.live_window);

/* Five-minute steps, not hourly: Muttville's outdoor playland is on air from
   08:15 to 08:45, and an hourly grid steps straight over it and reports a
   camera nobody ever sees. And a whole year, a week per month, because a
   salmon-run camera is legitimately dark in October - sampling one week in
   autumn says nothing about whether its window can ever open. */
const STEP = 5 * 60e3, WEEK = 7 * 24 * 3600e3;
function minutesOn(cam, weekStart){
  let n = 0;
  for (let t = weekStart; t < weekStart + WEEK; t += STEP){
    setNow(new Date(t));
    if (isLiveNow(cam)) n += 5;
  }
  return n;
}
const sample = Date.UTC(2026, 9, 25);          // a Sunday in a plain week
const mins = new Map(windowed.map(c => [c.name, minutesOn(c, sample)]));
const seasonal = c => !!(c.live_window.season?.from && c.live_window.season?.to);
for (const c of windowed.slice().sort((a, b) => mins.get(a.name) - mins.get(b.name))){
  const h = (mins.get(c.name) / 60).toFixed(1);
  console.log(`  ${h.padStart(5)} h this week  ${c.name}${seasonal(c) ? '  (seasonal)' : ''}`);
}

// Anything at zero now has to prove it can open at all, somewhere in the year.
const quiet = windowed.filter(c => !mins.get(c.name));
const never = [];
for (const c of quiet){
  let ever = 0;
  for (let m = 0; m < 12 && !ever; m++) ever = minutesOn(c, Date.UTC(2026, m, 4));
  if (!ever) never.push(c.name); else console.log(`  (${c.name} is out of season now, open elsewhere in the year)`);
}
check(`none of the ${windowed.length} windowed cameras is hidden all year`, never.length, 0);
if (never.length) console.log('   hidden for good: ' + never.join(', '));

console.log(fails.length ? `\n${fails.length} failed` : '\nall good');
process.exit(fails.length ? 1 : 0);
