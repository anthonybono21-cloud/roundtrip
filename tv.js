/* Roundtrip on a television.
 *
 * Self-contained, like search.js: drop it in with a <script> tag and it
 * publishes window.RoundtripRemote. It does nothing at all unless the page
 * decided it is on a 10-foot screen (documentElement carries `tv`, set by the
 * detection block in index.html, forced with ?tv=1).
 *
 * What it is for: on a Fire Stick there is no mouse and no keyboard. There is
 * a remote with a D-pad, a select button, a back button and a play button, and
 * in the Silk browser those arrive as ordinary key events. So this is keyboard
 * handling, with three wrinkles a desk keyboard does not have:
 *
 *   - Back on a Fire TV remote is wired to browser history, not to Escape, so
 *     pressing it would walk out of the app. A dummy history entry catches it.
 *   - The remote's transport keys report under several different names and
 *     numbers depending on the device and the browser build, so every one of
 *     them is listened for.
 *   - Anthony asked that a press reveal actions rather than silently change
 *     the scene, so Select opens a menu instead of doing anything.
 *
 * If another build lands a tap menu as window.RoundtripMenu, or a pin map as
 * window.RoundtripPins, this hands over to them rather than competing.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  if (!root.classList.contains('tv')) return;

  var app = function () { return window.Roundtrip || null; };
  var search = function () { return window.RoundtripSearch || null; };

  /* ── what the remote sends ──────────────────────────────────────────────
     Names first, because a modern browser gives real ones; the numbers are
     the fallback for older Fire OS builds, where e.key can be 'Unidentified'.
     Fire TV models differ on the media keys, hence the lists. */
  var NAME = {
    up:    ['ArrowUp', 'Up'],
    down:  ['ArrowDown', 'Down'],
    left:  ['ArrowLeft', 'Left'],
    right: ['ArrowRight', 'Right'],
    ok:    ['Enter', 'NumpadEnter', 'Select', 'Accept'],
    back:  ['Escape', 'Esc', 'Backspace', 'BrowserBack', 'GoBack', 'XF86Back'],
    play:  ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'Play', 'Pause'],
    ff:    ['MediaFastForward', 'FastForward', 'MediaTrackNext', 'AudioTrackNext'],
    rw:    ['MediaRewind', 'Rewind', 'MediaTrackPrevious', 'AudioTrackPrevious'],
    menu:  ['ContextMenu', 'Menu', 'Info', 'F10']
  };
  var CODE = {
    38: 'up', 40: 'down', 37: 'left', 39: 'right',
    13: 'ok', 23: 'ok',
    27: 'back', 8: 'back', 166: 'back',
    179: 'play', 415: 'play', 19: 'play', 178: 'play',
    417: 'ff', 228: 'ff', 425: 'ff',
    412: 'rw', 227: 'rw', 424: 'rw',
    93: 'menu', 82: 'menu', 457: 'menu'
  };

  function nameOf(e) {
    var k = e.key;
    if (k && k !== 'Unidentified') {
      for (var g in NAME) {
        if (NAME[g].indexOf(k) >= 0) return g;
      }
    }
    return CODE[e.keyCode] || null;
  }

  /* ── the actions ────────────────────────────────────────────────────────
     Everything goes through window.Roundtrip so the remote and the keyboard
     take exactly the same path through the app. */
  var seen = [];          // cameras this sitting, oldest first: Left walks back
  var backSteps = 0;      // how far back Left has already walked

  function record(cam) {
    if (!cam) return;
    if (seen[seen.length - 1] === cam) return;
    seen.push(cam);
    if (seen.length > 40) seen.shift();
    backSteps = 0;
  }

  var Act = {
    next: function () {
      var a = app(); if (!a) return;
      backSteps = 0;
      a.requestDive(a.pickNext());
    },
    prev: function () {
      var a = app(); if (!a) return;
      var i = seen.length - 2 - backSteps;
      if (i < 0) { a.note('Nothing further back this sitting.'); return; }
      backSteps++;
      var cam = seen[i];
      a.requestDive(cam);
      // requestDive re-records it on arrival, which would reset the walk, so
      // keep the step count by marking this one as a deliberate step back.
      seen.push(cam); if (seen.length > 40) seen.shift();
    },
    hold: function () {
      var a = app(); if (!a || !a.hold) return;
      var on = a.hold();
      a.note(on ? 'Staying on ' + (a.state.cam ? a.state.cam.name : 'this one') + '.'
                : 'Back in the rotation.');
    },
    sound: function () {
      var a = app(); if (!a) return;
      a.toggleSound();
      a.note(a.audio && a.audio.on ? 'Sound on.' : 'Sound off.');
    },
    voteUp:   function () { var a = app(); if (a && a.state.cam) a.castVote(1); },
    voteDown: function () { var a = app(); if (a && a.state.cam) a.castVote(-1); },
    search:   function () { var s = search(); if (s) s.open(''); },
    orbit:    function () {
      var a = app(); if (!a) return;
      a.clearSet();
      if (a.state.cam) a.backToOrbit();
    },
    pins: function () {
      var p = window.RoundtripPins;
      if (p && p.open) p.open();
    }
  };

  /* ── the menu ───────────────────────────────────────────────────────────
     A press of Select reveals this rather than changing the scene, which is
     the whole point: on a remote, every skip should be asked for. */
  var el = null, rows = [], sel = 0, open = false;

  function style() {
    var css = document.createElement('style');
    css.textContent = [
      '#rt-tv{position:fixed;left:50%;bottom:12vh;transform:translate(-50%,2vh);',
      '  z-index:60;min-width:min(38vw,520px);opacity:0;pointer-events:none;',
      '  transition:opacity .18s ease,transform .18s ease;',
      '  background:rgba(8,13,22,.86);border:1px solid rgba(255,255,255,.12);',
      '  border-radius:1.2vh;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      '  box-shadow:0 2vh 6vh rgba(0,0,0,.6);overflow:hidden;',
      '  font:400 clamp(11px,1.8vh,24px)/1.4 "Inter","Segoe UI",system-ui,sans-serif;',
      '  color:#e8eef7}',
      '#rt-tv.on{opacity:1;pointer-events:auto;transform:translate(-50%,0)}',
      '#rt-tv .hd{padding:1.2vh 1.8vw .6vh;font-size:clamp(8px,1.15vh,15px);',
      '  letter-spacing:.16em;text-transform:uppercase;color:#8fa3bd}',
      '#rt-tv .it{display:flex;align-items:baseline;gap:1vw;padding:1.1vh 1.8vw;',
      '  border-left:.4vh solid transparent;cursor:pointer}',
      '#rt-tv .it.sel{background:rgba(255,255,255,.09);border-left-color:#ffd479}',
      '#rt-tv .it .k{margin-left:auto;font-size:clamp(8px,1.2vh,16px);color:#8fa3bd}',
      '#rt-tv .ft{padding:.9vh 1.8vw 1.2vh;font-size:clamp(8px,1.2vh,16px);',
      '  color:#8fa3bd;opacity:.75;border-top:1px solid rgba(255,255,255,.08)}'
    ].join('');
    document.head.appendChild(css);
  }

  function items() {
    var a = app(), live = !!(a && a.state && a.state.cam);
    var held = !!(a && a.state && a.state.pinned);
    var snd  = !!(a && a.audio && a.audio.on);
    var list = [];
    list.push({ t: 'Next camera', k: 'right', f: Act.next });
    if (seen.length > 1) list.push({ t: 'Previous camera', k: 'left', f: Act.prev });
    if (live) list.push({ t: held ? 'Let it move on again' : 'Stay on this one',
                          k: 'play', f: Act.hold });
    list.push({ t: snd ? 'Sound off' : 'Sound on', f: Act.sound });
    if (live) {
      list.push({ t: 'Good camera, show it more', k: 'up', f: Act.voteUp });
      list.push({ t: 'Drop this camera', k: 'down', f: Act.voteDown });
    }
    list.push({ t: 'Search places and scenes', f: Act.search });
    if (window.RoundtripPins && window.RoundtripPins.open)
      list.push({ t: 'Map of every camera', f: Act.pins });
    if (live) list.push({ t: 'Back to orbit', k: 'back', f: Act.orbit });
    return list;
  }

  var KEYCAP = { right: '▶', left: '◀', up: '▲', down: '▼',
                 play: 'play', back: 'back' };

  function build() {
    el = document.createElement('div');
    el.id = 'rt-tv';
    el.setAttribute('role', 'menu');
    document.body.appendChild(el);
  }

  function paint() {
    var html = '<div class="hd">Roundtrip</div>';
    rows.forEach(function (r, i) {
      html += '<div class="it' + (i === sel ? ' sel' : '') + '" data-i="' + i + '" role="menuitem">' +
              '<span>' + r.t + '</span>' +
              (r.k ? '<span class="k">' + KEYCAP[r.k] + '</span>' : '') + '</div>';
    });
    html += '<div class="ft">Up and down to choose, select to do it, back to close</div>';
    el.innerHTML = html;
  }

  function show() {
    // A build that ships its own tap menu owns this; do not draw a second one.
    if (window.RoundtripMenu && window.RoundtripMenu.open) { window.RoundtripMenu.open(); return; }
    if (!el) build();
    rows = items(); sel = 0; open = true;
    paint();
    el.classList.add('on');
  }

  function hide() {
    open = false;
    if (el) el.classList.remove('on');
  }

  function move(d) {
    if (!rows.length) return;
    sel = (sel + d + rows.length) % rows.length;
    paint();
  }

  function choose() {
    var r = rows[sel];
    hide();
    if (r && r.f) r.f();
  }

  /* Clicking works too, for a mouse or a Fire TV remote's cursor mode. */
  document.addEventListener('click', function (e) {
    if (!open || !el) return;
    var it = e.target.closest ? e.target.closest('#rt-tv .it') : null;
    if (!it) return;
    sel = +it.dataset.i;
    choose();
  });

  /* ── back ───────────────────────────────────────────────────────────────
     The Fire TV remote's back button is wired to browser history, so without
     this it walks out of Roundtrip and into a blank Silk tab. One dummy entry
     absorbs the press; it is re-armed each time so it never runs out. */
  function armBack() {
    try {
      if (history.state && history.state.rtBack) return;
      history.pushState({ rtBack: 1 }, '');
    } catch (e) {}
  }
  addEventListener('popstate', function () {
    armBack();
    doBack();
  });

  function doBack() {
    var s = search();
    if (s && s.isOpen && s.isOpen()) { s.close ? s.close() : esc(); return; }
    // The tap menu closes before anything else, the same as it does on the
    // key path above. This is the path that matters inside the Fire TV app,
    // where the activity turns the remote's Back into history navigation and
    // no key event ever reaches the page.
    var m = window.RoundtripMenu;
    if (m && m.isOpen && m.isOpen()) { m.close(); return; }
    if (open) { hide(); return; }
    Act.orbit();
  }

  function esc() {
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  /* ── full screen ────────────────────────────────────────────────────────
     Silk keeps a title bar over the page. The first real press of the remote
     is a user gesture, which is the only moment a browser will grant this. */
  var asked = false;
  function goFull() {
    if (asked || document.fullscreenElement) return;
    asked = true;
    var b = document.body;
    var f = b.requestFullscreen || b.webkitRequestFullscreen;
    if (f) { try { f.call(b).catch(function () {}); } catch (e) {} }
  }

  /* ── the handler ────────────────────────────────────────────────────────
     Capture, so the menu can swallow the D-pad before the page's own keydown
     listener reads it as a vote. */
  addEventListener('keydown', function (e) {
    if (!e.isTrusted) return;            // our own synthetic Escape, ignore it
    var g = nameOf(e);
    if (!g) return;
    goFull();

    var s = search();
    if (s && s.isOpen && s.isOpen()) {
      // The search box does its own arrows, Enter and Escape. Only rescue the
      // remote's back button, which does not send an Escape.
      if (g === 'back' && e.key !== 'Escape') { e.preventDefault(); esc(); }
      return;
    }

    // The tap menu, when the build has one, owns the D-pad while it is up:
    // it is the same strip a finger gets, and the page's own handler walks
    // it. Without this, Right would skip a camera underneath it.
    var m = window.RoundtripMenu;
    if (m && m.isOpen && m.isOpen()) {
      if (g === 'back' && e.key !== 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation(); m.close();
      }
      return;
    }

    // The pin map draws its own selection on the globe, so while it is open
    // the D-pad steps between cameras and select picks one, instead of the
    // remote's usual next/previous. Translated here rather than left to the
    // page, because on older Fire OS builds e.key is 'Unidentified' and only
    // the key codes above identify the D-pad at all.
    var pm = window.RoundtripPins;
    if (pm && pm.isOpen && pm.isOpen()) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (g === 'up') pm.step(0, -1);
      else if (g === 'down') pm.step(0, 1);
      else if (g === 'left') pm.step(-1, 0);
      else if (g === 'right') pm.step(1, 0);
      else if (g === 'ok' || g === 'play') pm.pick();
      else if (g === 'back' || g === 'menu') pm.close();
      return;
    }

    if (open) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (g === 'up') move(-1);
      else if (g === 'down') move(1);
      else if (g === 'ok' || g === 'right') choose();
      else if (g === 'back' || g === 'left') hide();
      return;
    }

    if (g === 'ok' || g === 'menu') { e.preventDefault(); e.stopImmediatePropagation(); show(); return; }
    if (g === 'right' || g === 'ff') { e.preventDefault(); e.stopImmediatePropagation(); Act.next(); return; }
    if (g === 'left'  || g === 'rw') { e.preventDefault(); e.stopImmediatePropagation(); Act.prev(); return; }
    if (g === 'play') { e.preventDefault(); e.stopImmediatePropagation(); Act.hold(); return; }
    if (g === 'back' && e.key !== 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); doBack(); return; }
    // Up and down are left to the page: they are the thumbs, on the remote as
    // on the keyboard.
  }, true);

  /* ── the help panel, in remote words ────────────────────────────────── */
  function retitleHelp() {
    var h = document.getElementById('help');
    if (!h) return;
    h.innerHTML =
      '<div><b>Select</b> &nbsp;what you can do here</div>' +
      '<div><b>&#9654;</b> &nbsp;next camera &nbsp; <b>&#9664;</b> &nbsp;the one before</div>' +
      '<div><b>&#9650;</b> &nbsp;good camera, show it more</div>' +
      '<div><b>&#9660;</b> &nbsp;bad camera, drop it</div>' +
      '<div><b>Play</b> &nbsp;stay on this one</div>' +
      '<div><b>Back</b> &nbsp;pull out to orbit</div>';
  }

  /* ── how fast is it actually going ──────────────────────────────────────
     Not measurable from a project session: a headless browser here rasterises
     in software, so every millisecond it reports is its own. On the real
     stick it is measurable, and this is the only place that can do it.

     Its own requestAnimationFrame loop does not ask for extra frames — a
     callback fires once per frame that the page was going to draw anyway — so
     it samples the real cadence at no cost. `?fps=1` puts a line a second on
     the console, which is what comes out of `adb logcat -s chromium`. */
  var frames = [], last = 0;
  function sample(t) {
    // A gap of a second is not a slow frame, it is the page having been left
    // alone: a backgrounded tab, a paused app, the first frames after a load.
    // Counting those makes every reading look catastrophic.
    if (last && t - last < 1000) {
      frames.push(t - last);
      if (frames.length > 600) frames.shift();
    }
    last = t;
    requestAnimationFrame(sample);
  }
  function stats(n) {
    var a = frames.slice(-(n || 120)).sort(function (x, y) { return x - y; });
    if (a.length < 8) return null;
    var med = a[a.length >> 1];
    return { fps: Math.round(1000 / med),
             median_ms: +med.toFixed(1),
             worst_ms: +a[a.length - 1].toFixed(1),
             // The frame a tenth of the way from the slow end: one bad frame
             // is a hiccup, a bad tenth is a stutter you can see.
             p90_ms: +a[Math.floor(a.length * 0.9)].toFixed(1),
             frames: a.length };
  }

  /* ── boot ───────────────────────────────────────────────────────────── */
  function start() {
    style();
    armBack();
    retitleHelp();
    requestAnimationFrame(sample);
    // One line at boot, so a log off the device says which layout it took and
    // on what. Without it there is no way to tell a television that failed to
    // be recognised from one that was.
    try {
      console.log('Roundtrip TV: layout on, ' + innerWidth + 'x' + innerHeight +
                  ' css, dpr ' + (devicePixelRatio || 1) +
                  (/\bfiretv\b/.test(root.className) ? ', fire tv' : ''));
    } catch (e) {}
    try {
      if (new URLSearchParams(location.search).get('fps') === '1') {
        setInterval(function () {
          var s = stats(120);
          if (s) console.log('Roundtrip fps: ' + s.fps + ' median ' + s.median_ms +
                             'ms, p90 ' + s.p90_ms + 'ms, worst ' + s.worst_ms +
                             'ms, phase ' + (app() ? app().state.phase : '?'));
        }, 1000);
      }
    } catch (e) {}
    // Keep the trail of cameras for the Previous action. Cheap, and it needs
    // no hook inside the build, which several threads are editing at once.
    setInterval(function () {
      var a = app();
      if (a && a.state) record(a.state.cam);
    }, 400);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();

  window.RoundtripRemote = {
    open: show, close: hide, isOpen: function () { return open; },
    actions: Act, keyName: nameOf, seen: function () { return seen.slice(); },
    // RoundtripRemote.fps() over adb is how the dive gets judged on the
    // television rather than guessed at from here.
    fps: stats
  };
})();
