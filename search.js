/* Roundtrip search.
   ────────────────────────────────────────────────────────────────────────
   Type a word, get every camera that matches it. Self-contained: it builds
   its own panel and its own styles, knows nothing about the globe, and talks
   to the app through the four callbacks passed to init().

   Publishes window.RoundtripSearch. Never throws into the app.

   Matching is deliberately forgiving. A camera is indexed on its name, its
   location, its country and its tags, and a query term scores against each
   of those - exact tag first, then prefixes, then substrings, then an edit
   distance that survives one or two typos. Several words are an AND: every
   word has to land somewhere, and the scores add up.

   The list is never truncated. "beach" means all fourteen beaches, scrolled,
   because a search that hides half its answers is a worse map than the globe.
*/
(function (global) {
  'use strict';

  /* ── text ──────────────────────────────────────────────────────────── */

  // Accents off, punctuation to spaces: "Kilpisjarvi" finds Kilpisjärvi and
  // "st peters" finds St Peter's.
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  const words = s => norm(s).split(' ').filter(Boolean);

  /* Levenshtein with transposition, abandoned once it passes `max`. Typos are
     adjacent-key slips and swapped letters, which is exactly what this covers:
     "phillipines", "venise", "singapor". */
  function within(a, b, max) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = [], prev = [], cur = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < best) best = v;
      }
      if (best > max) return max + 1;     // no cell can recover
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }
  const slack = t => (t.length >= 8 ? 2 : t.length >= 5 ? 1 : 0);

  /* Words people type that are not the words in the data. The right-hand side
     is matched as if it were a tag, at a slight discount, so "zoo" finds the
     aquariums and "sunset" finds the west-facing cams. */
  const SYNONYMS = {
    zoo: ['aquarium', 'wildlife', 'animals', 'safari', 'waterhole'],
    animal: ['wildlife', 'animals', 'safari', 'waterhole', 'zoo'],
    animals: ['wildlife', 'safari', 'waterhole', 'zoo'],
    nature: ['wildlife', 'mountain', 'forest', 'waterhole', 'ocean'],
    sea: ['ocean', 'coast', 'beach'],
    ocean: ['sea', 'coast', 'beach'],
    water: ['ocean', 'sea', 'river', 'lake', 'harbor'],
    snow: ['ski', 'alpine', 'glacier', 'arctic', 'mountain'],
    ski: ['snow', 'alpine', 'mountain'],
    plane: ['airport', 'planes', 'aviation', 'plane spotting'],
    planes: ['airport', 'aviation', 'plane spotting'],
    airplane: ['airport', 'planes', 'aviation'],
    train: ['railway', 'trains', 'rail'],
    trains: ['railway', 'rail'],
    bird: ['birds', 'feeder', 'nest', 'birding'],
    birds: ['feeder', 'nest', 'birding'],
    fish: ['aquarium', 'underwater', 'reef', 'ocean'],
    church: ['sacred', 'cathedral', 'religion'],
    temple: ['sacred', 'religion', 'worship'],
    mosque: ['sacred', 'islam', 'religion'],
    holy: ['sacred', 'religion', 'pilgrimage'],
    night: ['night lights', 'aurora', 'dark sky', 'neon'],
    lights: ['night lights', 'neon'],
    aurora: ['northern lights', 'dark sky'],
    'northern lights': ['aurora'],
    sunset: ['sunset-facing'],
    sunrise: ['sunrise-facing'],
    sound: ['has-sound'],
    audio: ['has-sound'],
    music: ['live music', 'stage'],
    busy: ['crowd', 'people'],
    people: ['crowd', 'busy'],
    calm: ['quiet'],
    quiet: ['calm', 'solitude'],
    downtown: ['city', 'skyline', 'urban'],
    skyscraper: ['skyline', 'high rises', 'city'],
    tropical: ['beach', 'island', 'palms'],
    island: ['tropical', 'coast'],
    surf: ['surfing', 'waves'],
    mountains: ['mountain', 'peaks', 'alpine'],
    volcano: ['crater', 'lava', 'eruption'],
  };

  /* Chips shown before anything is typed - the whole point being that the
     tags are browsable without knowing a single one of them. */
  const BROWSE = [
    ['Places', ['europe', 'asia', 'africa', 'north america', 'south america',
                'oceania', 'usa', 'italy', 'japan', 'philippines', 'nyc',
                'hawaii', 'caribbean', 'alps', 'arctic']],
    ['Scenes', ['beach', 'city', 'skyline', 'mountain', 'volcano', 'harbor',
                'waterhole', 'underwater', 'aquarium', 'airport', 'landmark',
                'sacred', 'square', 'glacier', 'aurora', 'wildlife', 'zoo',
                'market', 'stage', 'railway']],
    ['Moods',  ['busy', 'quiet', 'night lights', 'sunset', 'sunrise',
                'tropical', 'snow', 'has-sound', 'always-on']],
  ];

  /* ── index ─────────────────────────────────────────────────────────── */

  let cams = [], index = [], hooks = {};

  function build(list) {
    cams = list || [];
    index = cams.map(cam => {
      const tags = (cam.tags || []).map(norm).filter(Boolean);
      const name = norm(cam.name);
      const where = norm((cam.location || '') + ' ' + (cam.country || ''));
      const bag = new Set();
      tags.forEach(t => t.split(' ').forEach(w => bag.add(w)));
      words(name).forEach(w => bag.add(w));
      words(where).forEach(w => bag.add(w));
      return { cam, tags, tagSet: new Set(tags), name, where,
               nameWords: words(name), whereWords: words(where), bag: [...bag] };
    });
  }

  // How well one query term fits one camera. 0 means it does not.
  function termScore(e, term, discount) {
    let best = 0;
    const hit = v => { if (v > best) best = v; };

    if (e.tagSet.has(term)) hit(110);
    if (best < 110) {
      for (const t of e.tags) {
        if (t.startsWith(term)) { hit(term.length >= 3 ? 82 : 70); continue; }
        if (t.includes(' ' + term)) hit(68);
        else if (term.length >= 4 && t.includes(term)) hit(52);
      }
    }
    for (const w of e.nameWords) {
      if (w === term) hit(74);
      else if (w.startsWith(term)) hit(58);
    }
    if (term.length >= 3 && e.name.includes(term)) hit(44);
    for (const w of e.whereWords) {
      if (w === term) hit(70);
      else if (w.startsWith(term)) hit(54);
    }
    if (term.length >= 3 && e.where.includes(term)) hit(40);

    // Typos, last: only worth trying when nothing above landed cleanly.
    const s = slack(term);
    if (best < 50 && s > 0) {
      for (const w of e.bag) {
        const d = within(term, w, s);
        if (d <= s) hit(48 - 12 * d);
      }
    }
    return best * (discount || 1);
  }

  function score(e, terms) {
    let total = 0;
    for (const term of terms) {
      let best = termScore(e, term, 1);
      for (const syn of (SYNONYMS[term] || [])) {
        const v = termScore(e, syn, 0.62);
        if (v > best) best = v;
      }
      if (!best) return 0;                 // every word has to land somewhere
      total += best;
    }
    return total;
  }

  function search(q) {
    const terms = words(q);
    if (!terms.length) return [];
    const out = [];
    for (const e of index) {
      const s = score(e, terms);
      if (s > 0) out.push({ cam: e.cam, score: s, entry: e });
    }
    // Score first; on a tie, the ones actually on air, then alphabetical, so
    // the order is the same every time you type the same thing.
    out.sort((a, b) =>
      b.score - a.score ||
      (live(b.cam) - live(a.cam)) ||
      a.cam.name.localeCompare(b.cam.name));
    return out;
  }
  const live = cam => { try { return hooks.isLiveNow ? (hooks.isLiveNow(cam) ? 1 : 0) : 1; }
                        catch { return 1; } };

  /* Which of a camera's tags to show on its row: the ones that explain why it
     came up, then anything that reads like a place or a scene. */
  function chipsFor(entry, terms) {
    const picked = [];
    for (const t of entry.tags) {
      if (picked.length >= 3) break;
      if (terms.some(term => t === term || t.startsWith(term))) picked.push(t);
    }
    for (const t of entry.tags) {
      if (picked.length >= 3) break;
      if (!picked.includes(t)) picked.push(t);
    }
    return picked;
  }

  /* ── panel ─────────────────────────────────────────────────────────── */

  const CSS = `
  #rt-search{position:fixed;left:50%;top:0;transform:translate(-50%,-14px);
    width:min(560px,calc(100vw - 40px));z-index:40;
    opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease}
  #rt-search.on{opacity:1;pointer-events:auto;transform:translate(-50%,54px)}
  #rt-search .box{background:var(--panel,rgba(8,13,22,.72));
    border:1px solid var(--edge,rgba(255,255,255,.10));border-radius:14px;
    backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);
    box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden}
  #rt-search .top{display:flex;align-items:center;gap:10px;padding:12px 14px}
  #rt-search .top svg{width:17px;height:17px;flex:0 0 auto;fill:none;
    stroke:var(--dim,#8fa3bd);stroke-width:1.8;stroke-linecap:round}
  #rt-search input{flex:1;background:none;border:0;outline:none;
    color:var(--ink,#e8eef7);font:400 16px/1.3 inherit;padding:2px 0}
  #rt-search input::placeholder{color:var(--dim,#8fa3bd);opacity:.7}
  #rt-search .count{font-size:11px;letter-spacing:.11em;text-transform:uppercase;
    color:var(--dim,#8fa3bd);white-space:nowrap}
  #rt-search .play{border:1px solid var(--edge,rgba(255,255,255,.10));background:rgba(255,255,255,.07);
    color:var(--ink,#e8eef7);border-radius:999px;padding:5px 12px;font:500 12px/1 inherit;
    cursor:pointer;white-space:nowrap;transition:background .15s ease}
  #rt-search .play:hover{background:rgba(255,212,121,.22)}
  #rt-search .list{max-height:min(52vh,420px);overflow-y:auto;overscroll-behavior:contain;
    border-top:1px solid var(--edge,rgba(255,255,255,.10))}
  #rt-search .list:empty{display:none}
  #rt-search .row{display:flex;align-items:baseline;gap:10px;padding:9px 14px;cursor:pointer;
    border-bottom:1px solid rgba(255,255,255,.045)}
  #rt-search .row:last-child{border-bottom:0}
  #rt-search .row.sel,#rt-search .row:hover{background:rgba(255,255,255,.075)}
  #rt-search .row .t{min-width:0;flex:1}
  #rt-search .row .n{font-size:14px;color:var(--ink,#e8eef7);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #rt-search .row .w{font-size:12px;color:var(--dim,#8fa3bd);margin-top:1px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #rt-search .row.off .n,#rt-search .row.off .w{opacity:.45}
  #rt-search .row .off-air{font-size:10px;letter-spacing:.1em;text-transform:uppercase;
    color:#ffd479;opacity:.7;white-space:nowrap}
  #rt-search .tags{display:flex;gap:5px;flex:0 0 auto;max-width:47%;flex-wrap:wrap;
    justify-content:flex-end}
  #rt-search .chip{font-size:11px;color:var(--dim,#8fa3bd);background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.07);border-radius:999px;padding:2px 8px;cursor:pointer;
    white-space:nowrap}
  #rt-search .chip:hover{color:var(--ink,#e8eef7);background:rgba(255,212,121,.2)}
  #rt-search .browse{padding:10px 14px 13px;border-top:1px solid var(--edge,rgba(255,255,255,.10))}
  #rt-search .browse h4{margin:8px 0 6px;font:500 10px/1 inherit;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim,#8fa3bd);opacity:.8}
  #rt-search .browse h4:first-child{margin-top:2px}
  #rt-search .browse .g{display:flex;flex-wrap:wrap;gap:5px}
  #rt-search .none{padding:14px;font-size:13px;color:var(--dim,#8fa3bd)}
  #rt-search .hint{padding:8px 14px 10px;font-size:11px;color:var(--dim,#8fa3bd);opacity:.65;
    border-top:1px solid rgba(255,255,255,.05)}

  /* The magnifier, sitting under the speaker and behaving like it. The host
     page has a .hud-btn class that says the same thing, but this file stays
     self-contained, so the rules are repeated rather than inherited. */
  #rt-mag{position:fixed;border-radius:50%;
    right:calc(34px + env(safe-area-inset-right,0px));
    top:calc(108px + env(safe-area-inset-top,0px));width:42px;height:42px;
    display:grid;place-items:center;cursor:pointer;z-index:9;
    background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);
    backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
    opacity:.34;transition:opacity .25s ease,background .25s ease,transform .12s ease;
    touch-action:manipulation;-webkit-tap-highlight-color:transparent}
  #rt-mag:hover,#rt-mag:focus-visible{opacity:1;background:rgba(255,255,255,.15);outline:none}
  #rt-mag:active{transform:scale(.93)}
  #rt-mag svg{width:19px;height:19px;fill:none;stroke:var(--ink,#e8eef7);stroke-width:1.7;
    stroke-linecap:round;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}
  /* A touch screen never hovers, so a 34% glyph would stay 34% and be
     invisible over the lit globe. There it rests bright and hits 44px+. */
  @media (hover:none),(pointer:coarse){
    #rt-mag{width:50px;height:50px;opacity:.94;
      top:calc(116px + env(safe-area-inset-top,0px));
      background:rgba(9,15,25,.52);border-color:rgba(255,255,255,.32);
      box-shadow:0 2px 10px rgba(0,0,0,.35)}
    #rt-mag:hover,#rt-mag:focus-visible{background:rgba(9,15,25,.66)}
    #rt-mag svg{width:24px;height:24px;stroke-width:1.9}
  }

  /* The pill that says the rotation is currently a subset. */
  #rt-set{position:fixed;right:40px;top:32px;font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;color:#ffd479;opacity:0;transition:opacity .4s;
    pointer-events:none;text-align:right;max-width:40ch}
  #rt-set.on{opacity:1}
  #rt-set small{display:block;letter-spacing:.08em;opacity:.6;text-transform:none;font-size:10px}
  `;

  const MAG = '<svg viewBox="0 0 24 24" aria-hidden="true">'
            + '<circle cx="11" cy="11" r="6.4"/><path d="M15.8 15.8 20 20"/></svg>';

  let root, input, listEl, countEl, playEl, browseEl, setEl, magEl;
  let rows = [], sel = -1, open = false, lastTerms = [], lastResults = [];

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function mount() {
    const style = el('style'); style.textContent = CSS;
    document.head.appendChild(style);

    root = el('div'); root.id = 'rt-search';
    root.innerHTML =
      '<div class="box">'
      + '<div class="top">' + MAG
      + '<input type="text" spellcheck="false" autocomplete="off"'
      + ' placeholder="Search places, scenes, tags…" aria-label="Search cameras">'
      + '<span class="count"></span><button class="play" hidden></button></div>'
      + '<div class="list"></div><div class="browse"></div>'
      + '<div class="hint">Enter flies there · Esc closes</div>'
      + '</div>';
    document.body.appendChild(root);

    input  = root.querySelector('input');
    listEl = root.querySelector('.list');
    countEl = root.querySelector('.count');
    playEl = root.querySelector('.play');
    browseEl = root.querySelector('.browse');

    magEl = el('div'); magEl.id = 'rt-mag';
    magEl.setAttribute('role', 'button');
    magEl.tabIndex = 0;
    magEl.title = 'Search cameras  /';
    magEl.setAttribute('aria-label', 'Search cameras');
    magEl.innerHTML = MAG;
    document.body.appendChild(magEl);

    setEl = el('div'); setEl.id = 'rt-set';
    document.body.appendChild(setEl);

    magEl.addEventListener('click', () => toggle());
    magEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', onKey);
    playEl.addEventListener('click', playThese);
    root.addEventListener('mousedown', e => e.stopPropagation());
    document.addEventListener('mousedown', e => {
      if (open && !root.contains(e.target) && e.target !== magEl && !magEl.contains(e.target))
        close();
    });

    // Browsing chips are static; build them once.
    for (const [title, tags] of BROWSE) {
      browseEl.appendChild(el('h4', null, title));
      const g = el('div', 'g');
      for (const t of tags) {
        const c = el('button', 'chip', t);
        c.type = 'button';
        c.addEventListener('click', () => { input.value = t; render(); input.focus(); });
        g.appendChild(c);
      }
      browseEl.appendChild(g);
    }
  }

  function render() {
    const q = input.value;
    const terms = words(q);
    lastTerms = terms;
    listEl.textContent = '';
    rows = []; sel = -1;

    if (!terms.length) {
      lastResults = [];
      countEl.textContent = cams.length + ' cameras';
      playEl.hidden = true;
      browseEl.style.display = '';
      return;
    }
    browseEl.style.display = 'none';

    const res = search(q);
    lastResults = res;
    countEl.textContent = res.length ? res.length + (res.length === 1 ? ' match' : ' matches')
                                     : 'nothing';
    playEl.hidden = res.length < 2;
    playEl.textContent = 'Play these ' + res.length;

    if (!res.length) {
      listEl.appendChild(el('div', 'none',
        'No camera matches that. Try a place, a country, or a tag like beach, volcano or night lights.'));
      return;
    }

    // Every match, in one scrolling list: a search that hides results is worse
    // than no search.
    const frag = document.createDocumentFragment();
    res.forEach((r, i) => {
      const onAir = live(r.cam);
      const row = el('div', 'row' + (onAir ? '' : ' off'));
      const t = el('div', 't');
      t.appendChild(el('div', 'n', escape(r.cam.name)));
      t.appendChild(el('div', 'w', escape(r.cam.location || r.cam.country || '')));
      row.appendChild(t);
      if (!onAir) row.appendChild(el('span', 'off-air', 'off air'));
      const tags = el('div', 'tags');
      for (const tag of chipsFor(r.entry, terms)) {
        const c = el('button', 'chip', escape(tag));
        c.type = 'button';
        c.addEventListener('click', ev => {
          ev.stopPropagation();
          input.value = tag; render(); input.focus();
        });
        tags.appendChild(c);
      }
      row.appendChild(tags);
      row.addEventListener('click', () => go(i));
      frag.appendChild(row);
      rows.push(row);
    });
    listEl.appendChild(frag);
    listEl.scrollTop = 0;
    select(0);
  }

  const escape = s => String(s).replace(/[&<>]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function select(i) {
    if (!rows.length) return;
    if (sel >= 0 && rows[sel]) rows[sel].classList.remove('sel');
    sel = Math.max(0, Math.min(rows.length - 1, i));
    rows[sel].classList.add('sel');
    rows[sel].scrollIntoView({ block: 'nearest' });
  }

  function go(i) {
    const r = lastResults[i == null ? sel : i];
    if (!r) return;
    close();
    try { hooks.onPick && hooks.onPick(r.cam); } catch (e) { console.warn(e); }
  }

  function playThese() {
    if (lastResults.length < 2) return;
    const list = lastResults.map(r => r.cam);
    const label = input.value.trim();
    close();
    try { hooks.onPlaySet && hooks.onPlaySet(list, label); } catch (e) { console.warn(e); }
  }

  function onKey(e) {
    const k = e.key;
    if (k === 'Escape') { close(); e.preventDefault(); e.stopPropagation(); return; }
    if (k === 'ArrowDown') { select(sel + 1); e.preventDefault(); }
    else if (k === 'ArrowUp') { select(sel - 1); e.preventDefault(); }
    else if (k === 'Enter') {
      if (e.shiftKey && lastResults.length > 1) playThese(); else go();
      e.preventDefault();
    }
    e.stopPropagation();          // the app's shortcuts are not typing keys
  }

  function show(prefill) {
    if (!root) return;
    open = true;
    root.classList.add('on');
    if (prefill != null) input.value = prefill;
    render();
    input.focus();
    input.select();
  }
  function close() {
    if (!root) return;
    open = false;
    root.classList.remove('on');
    input.blur();
  }
  function toggle() { open ? close() : show(); }

  /* The pill in the corner while the rotation is a subset. */
  function showSet(label, n) {
    if (!setEl) return;
    if (!n) { setEl.classList.remove('on'); setEl.textContent = ''; return; }
    setEl.innerHTML = escape(label || 'set') + ' · ' + n
                    + '<small>Esc plays everything again</small>';
    setEl.classList.add('on');
  }

  global.RoundtripSearch = {
    init(opts) {
      hooks = opts || {};
      build(hooks.cams);
      if (!root) mount();
      return this;
    },
    open: show, close, toggle,
    isOpen: () => open,
    showSet,
    search,                     // RoundtripSearch.search('beach') in the console
    tagsOf: cam => (cam && cam.tags) || [],
  };
})(window);
