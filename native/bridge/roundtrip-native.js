/* Roundtrip, running inside the iPhone, iPad, Mac and Android apps.

   This file is bundled only into the native shells (sync-web.mjs copies it in
   and appends the one <script> tag that loads it). On the web it is never
   fetched, so the published site is byte-for-byte what it always was.

   What it adds is the map. The web build's globe is stitched from free raster
   tiles, which is as much detail as a browser can pull down; inside an app
   there is a real map engine already on the device — MapKit on Apple, MapLibre
   with terrain on Android — so the apps get a third view alongside the globe
   and the feed: every camera as a pin on a 3D satellite map you can push
   around with a finger, and tapping one dives into it.

   It is deliberately self-contained and defensive. If the plugin is missing,
   if the app object never turns up, if anything throws, the page is left
   exactly as it was and Roundtrip runs as the plain web app.  */

(function () {
  'use strict';

  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;

  var Map = null;
  try { Map = Cap.registerPlugin('RoundtripMap'); } catch (e) { return; }
  if (!Map) return;

  var PLATFORM = (Cap.getPlatform && Cap.getPlatform()) || 'unknown';

  /* ── the button ──────────────────────────────────────────────────────────
     The right-hand HUD column is speaker, magnifier, then the two thumbs, at
     50px steps. The map slots in third and pushes the thumbs down, which is
     why this restyles them rather than hanging the new button off the bottom
     of a column that is half the time not there. */
  var CSS = [
    '#rt-map-btn{position:fixed;border-radius:50%;',
    '  right:calc(34px + env(safe-area-inset-right,0px));',
    '  top:calc(158px + env(safe-area-inset-top,0px));width:46px;height:46px;',
    '  display:grid;place-items:center;cursor:pointer;z-index:9;',
    '  background:rgba(9,15,25,.42);border:1px solid rgba(255,255,255,.26);',
    '  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
    '  opacity:.72;transition:opacity .25s ease,background .25s ease,transform .12s ease;',
    '  touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
    '#rt-map-btn:hover,#rt-map-btn:focus-visible{opacity:1;background:rgba(18,28,44,.62);outline:none}',
    '#rt-map-btn:active{transform:scale(.93)}',
    '#rt-map-btn svg{width:19px;height:19px;fill:none;stroke:var(--ink,#e8eef7);stroke-width:1.7;',
    '  stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}',
    '#voteup{top:calc(208px + env(safe-area-inset-top,0px))}',
    '#votedown{top:calc(258px + env(safe-area-inset-top,0px))}',
    '@media (hover:none),(pointer:coarse){',
    '  #rt-map-btn{width:50px;height:50px;opacity:.94;',
    '    top:calc(174px + env(safe-area-inset-top,0px));',
    '    background:rgba(9,15,25,.52);border-color:rgba(255,255,255,.32);',
    '    box-shadow:0 2px 10px rgba(0,0,0,.35)}',
    '  #rt-map-btn:hover,#rt-map-btn:focus-visible{background:rgba(9,15,25,.66)}',
    '  #rt-map-btn svg{width:24px;height:24px;stroke-width:1.9}',
    '  #voteup{top:calc(232px + env(safe-area-inset-top,0px))}',
    '  #votedown{top:calc(290px + env(safe-area-inset-top,0px))}',
    '}'
  ].join('\n');

  // A map pin, in the same one-weight line style as the speaker and magnifier.
  var PIN = '<svg viewBox="0 0 24 24" aria-hidden="true">'
          + '<path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.9 12 21 12 21Z"/>'
          + '<circle cx="12" cy="10" r="2.4"/></svg>';

  /* ── state ───────────────────────────────────────────────────────────── */

  var open = false;         // the native map is on screen
  var wasPinned = false;    // rotation state to put back when it closes
  var app = null;           // window.Roundtrip, once it exists

  function camKey(cam) { return cam.video_id || cam.name; }

  // Pins are sent over the bridge as plain data; the native side knows nothing
  // about a camera beyond where it is and what to call it.
  function pins() {
    var cams = (app && app.state && app.state.cams) || [];
    var out = [], i, c;
    for (i = 0; i < cams.length; i++) {
      c = cams[i];
      if (!c.pose || typeof c.pose.lat !== 'number' || typeof c.pose.lng !== 'number') continue;
      out.push({
        id: camKey(c),
        name: c.name || '',
        subtitle: c.location || c.country || '',
        lat: c.pose.lat,
        lng: c.pose.lng,
        live: app.isLiveNow ? !!app.isLiveNow(c) : true
      });
    }
    return out;
  }

  // Where to open the map. On a camera, over that camera; otherwise over
  // whatever the globe is about to dive into, so the map opens somewhere the
  // eye already is rather than over the mid-Atlantic.
  function focus() {
    var cam = (app && app.state && app.state.cam) || null;
    if (!cam && app && app.state && app.state.cams && app.state.cams.length) {
      try { cam = app.state.cams[0]; } catch (e) { cam = null; }
    }
    if (cam && cam.pose) {
      return { lat: cam.pose.lat, lng: cam.pose.lng, id: camKey(cam), zoom: 14 };
    }
    return { lat: 20, lng: 0, zoom: 2 };
  }

  function show() {
    if (open || !app) return;
    open = true;
    // Hold the rotation: the dive timer runs on regardless of what is drawn on
    // top of it, and coming back to a feed you never chose is disorienting.
    // Set directly rather than through Roundtrip.hold(), which also lights the
    // "pinned" badge — that would sit under the map unseen and then flash on
    // the way out.
    try { wasPinned = !!app.state.pinned; app.state.pinned = true; } catch (e) {}
    Map.show({ pins: pins(), focus: focus() }).catch(function (err) {
      open = false;
      try { app.state.pinned = wasPinned; } catch (e) {}
      console.warn('[roundtrip-native] map failed to open', err);
    });
  }

  function hide() {
    if (!open) return;
    open = false;
    try { app.state.pinned = wasPinned; } catch (e) {}
    Map.hide().catch(function () {});
  }

  function diveTo(id) {
    var cams = (app && app.state && app.state.cams) || [], i;
    for (i = 0; i < cams.length; i++) {
      if (camKey(cams[i]) === id) {
        hide();
        try { app.requestDive(cams[i]); } catch (e) { console.warn(e); }
        return;
      }
    }
    hide();
  }

  /* ── wiring ──────────────────────────────────────────────────────────── */

  function button() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var el = document.createElement('div');
    el.id = 'rt-map-btn';
    el.className = 'hud-btn';
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.title = 'Map of every camera';
    el.setAttribute('aria-label', 'Map of every camera');
    el.innerHTML = PIN;
    el.addEventListener('click', show);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); show(); }
    });
    document.body.appendChild(el);
  }

  function listen() {
    // A pin was tapped: leave the map and dive, which is the whole point of it.
    Map.addListener('pinTapped', function (ev) { if (ev && ev.id) diveTo(ev.id); });
    // Closed from the native side (the back button, a swipe, the done button).
    Map.addListener('mapClosed', function () {
      open = false;
      try { app.state.pinned = wasPinned; } catch (e) {}
    });
  }

  // The app object is published at the very end of boot, after the globe is
  // built, so there is nothing to hang a pin list off until then.
  function whenReady(fn) {
    var tries = 0;
    (function poll() {
      if (window.Roundtrip && window.Roundtrip.state && window.Roundtrip.state.cams) return fn();
      if (++tries > 600) return;              // 60s, then give up quietly
      setTimeout(poll, 100);
    })();
  }

  function start() {
    whenReady(function () {
      app = window.Roundtrip;
      try { button(); listen(); } catch (e) { console.warn('[roundtrip-native]', e); }
      // A small handle for the same reasons Roundtrip has one.
      app.native = { platform: PLATFORM, map: Map, showMap: show, hideMap: hide, pins: pins };
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
