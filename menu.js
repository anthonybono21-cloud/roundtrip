/* Roundtrip menu.
   ────────────────────────────────────────────────────────────────────────
   A tap, a click or the OK button on a remote brings up a row of actions.
   It never changes what is on screen by itself: skipping to another camera
   is one of the things you can choose here, not what touching the screen
   does to you.

   Self-contained, in the shape of search.js: it builds its own markup and
   its own styles, knows nothing about the globe, and is handed its items by
   the page. Publishes window.RoundtripMenu. Never throws into the app.

   An item is:
     { id, label, icon:'skip' | svg:'<path …>', run(), state(),
       close:true|false }
   `state()` returns { disabled, pressed, hidden, label, icon } and is asked
   again every time the menu opens or anything is pressed, so an item can
   describe itself (Sound on / Silent) rather than being told.

   Another feature can add its own action without touching this file or the
   page's item list:
     Roundtrip.menu.addItem({ id:'map', label:'Map', icon:'map',
                              run(){ … } }, 'fullscreen');
   which is how the pin-map mode drops in beside the rest.

   Driving it: arrows move, Enter or Space presses, Escape or Back closes.
   Left and right are the natural pair on a D-pad, up and down do the same
   thing so a remote cannot get stuck, and the whole row is one tab stop.
*/
(function (global) {
  'use strict';

  /* ── icons ─────────────────────────────────────────────────────────────
     24×24, stroked not filled, matching the rest of the app's line weight. */
  const ICONS = {
    skip:  '<path d="M6.5 5.2 16 12l-9.5 6.8z"/><path d="M18.6 5.4v13.2"/>',
    prev:  '<path d="M17.5 5.2 8 12l9.5 6.8z"/><path d="M5.4 5.4v13.2"/>',
    stay:  '<path d="M12 21.2v-6.4"/><path d="M8.4 2.8h7.2l-1 6.2 2.6 2.6v1.6H6.8v-1.6l2.6-2.6z"/>',
    sound: '<path d="M4 9.2v5.6h3.4L12.8 19V5L7.4 9.2H4z"/><path d="M16.3 9a4.2 4.2 0 0 1 0 6"/>'
         + '<path d="M19 6.4a8 8 0 0 1 0 11.2"/>',
    mute:  '<path d="M4 9.2v5.6h3.4L12.8 19V5L7.4 9.2H4z"/><path d="M16.6 9.8l4.8 4.4"/>'
         + '<path d="M21.4 9.8l-4.8 4.4"/>',
    search:'<circle cx="11" cy="11" r="6.4"/><path d="M15.8 15.8 20 20"/>',
    up:    '<path d="M7 10.5v9H4.6a.6.6 0 0 1-.6-.6v-7.8a.6.6 0 0 1 .6-.6H7z"/>'
         + '<path d="M7 10.5l4.4-6.2a.9.9 0 0 1 1.6.5v4.3h4.7a2 2 0 0 1 2 2.4l-1.2 5.8'
         + 'a2.4 2.4 0 0 1-2.3 1.9H7"/>',
    down:  '<path d="M7 13.5v-9H4.6a.6.6 0 0 0-.6.6v7.8c0 .33.27.6.6.6H7z"/>'
         + '<path d="M7 13.5l4.4 6.2a.9.9 0 0 0 1.6-.5v-4.3h4.7a2 2 0 0 0 2-2.4l-1.2-5.8'
         + 'A2.4 2.4 0 0 0 16.2 4.8H7"/>',
    globe: '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/>'
         + '<path d="M12 3.6a13.6 13.6 0 0 1 0 16.8a13.6 13.6 0 0 1 0-16.8"/>',
    full:  '<path d="M9 4.2H4.2V9"/><path d="M15 4.2h4.8V9"/><path d="M15 19.8h4.8V15"/>'
         + '<path d="M9 19.8H4.2V15"/>',
    exit:  '<path d="M4.2 9H9V4.2"/><path d="M19.8 9H15V4.2"/><path d="M19.8 15H15v4.8"/>'
         + '<path d="M4.2 15H9v4.8"/>',
    map:   '<path d="M9 4.6 3.8 6.8v12.6L9 17.2l6 2.2 5.2-2.2V4.6L15 6.8z"/>'
         + '<path d="M9 4.6v12.6"/><path d="M15 6.8v12.6"/>',
    keys:  '<circle cx="12" cy="12" r="8.4"/>'
         + '<path d="M9.7 9.5a2.4 2.4 0 1 1 3.1 2.6c-.6.2-.85.7-.85 1.3v.4"/>'
         + '<path d="M12 17.1h.01"/>',
  };

  /* ── styles ────────────────────────────────────────────────────────────
     A glass strip along the bottom, lifted clear of the credits. Items are
     at least 48px tall with the label under the glyph, because this is
     driven by a finger on a tablet and by a thumb-stick on a TV remote as
     often as by a mouse. */
  const CSS = `
  #rt-menu{position:fixed;z-index:30;left:50%;
    bottom:calc(30px + env(safe-area-inset-bottom,0px));
    transform:translate(-50%,16px);width:min(680px,calc(100vw - 24px));
    opacity:0;pointer-events:none;
    transition:opacity .22s ease,transform .22s ease}
  #rt-menu.on{opacity:1;pointer-events:auto;transform:translate(-50%,0)}
  #rt-menu .bar{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;
    padding:8px;border-radius:20px;
    background:rgba(8,13,22,.72);border:1px solid rgba(255,255,255,.12);
    backdrop-filter:blur(18px) saturate(1.25);-webkit-backdrop-filter:blur(18px) saturate(1.25);
    box-shadow:0 18px 50px rgba(0,0,0,.55)}
  #rt-menu .mi{-webkit-appearance:none;appearance:none;border:0;background:none;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
    min-width:62px;padding:8px 6px 7px;border-radius:14px;cursor:pointer;color:#e8eef7;
    font:500 10px/1.1 inherit;letter-spacing:.04em;
    transition:background .15s ease,color .15s ease,transform .1s ease;
    touch-action:manipulation;-webkit-tap-highlight-color:transparent}
  #rt-menu .mi svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.7;
    stroke-linecap:round;stroke-linejoin:round;
    filter:drop-shadow(0 1px 3px rgba(0,0,0,.55))}
  #rt-menu .mi .lb{opacity:.82;white-space:nowrap}
  #rt-menu .mi:hover,#rt-menu .mi.sel{background:rgba(255,255,255,.13);outline:none}
  #rt-menu .mi.sel{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)}
  #rt-menu .mi:active{transform:scale(.94)}
  #rt-menu .mi.on{color:#ffd479;background:rgba(255,212,121,.16)}
  #rt-menu .mi.on.sel{box-shadow:inset 0 0 0 1.5px rgba(255,212,121,.75)}
  #rt-menu .mi.dim{opacity:.3;pointer-events:none}
  #rt-menu .mi[hidden]{display:none}
  /* A finger needs a bigger target than a cursor does, and a TV is looked at
     from across a room, so both get more room and a brighter panel. */
  @media (hover:none),(pointer:coarse){
    #rt-menu .mi{min-width:70px;padding:10px 8px 9px;font-size:11px}
    #rt-menu .mi svg{width:26px;height:26px;stroke-width:1.85}
    #rt-menu .bar{background:rgba(6,10,18,.8)}
  }
  @media (max-width:560px){
    #rt-menu .mi{min-width:56px;padding:7px 4px 6px;font-size:10px}
    #rt-menu .mi svg{width:22px;height:22px}
  }
  `;

  let root, barEl, hooks = {}, items = [], nodes = new Map();
  let open = false, sel = -1, idleTimer = null;

  const svgWrap = body => '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  const iconOf = it => svgWrap(it.svg || ICONS[it.icon] || ICONS.keys);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  function mount() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.id = 'rt-menu';
    root.setAttribute('role', 'menu');
    root.setAttribute('aria-label', 'Roundtrip actions');
    root.innerHTML = '<div class="bar"></div>';
    barEl = root.querySelector('.bar');
    document.body.appendChild(root);

    // Moving over the strip keeps it up. It is deliberately movement and not
    // hovering: a cursor left sitting where the strip appears would otherwise
    // pin it open for good, and there is no leaving to notice, since the
    // pointer never moved.
    root.addEventListener('pointermove', nudge);
    root.addEventListener('pointerenter', nudge);
    root.addEventListener('pointerleave', nudge);
    // A press on the strip is not a press on the scene behind it.
    root.addEventListener('pointerdown', e => e.stopPropagation());

    build();
  }

  function build() {
    if (!barEl) return;
    barEl.textContent = '';
    nodes.clear();
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mi';
      b.id = 'rt-mi-' + it.id;
      b.dataset.id = it.id;
      b.setAttribute('role', 'menuitem');
      b.innerHTML = iconOf(it) + '<span class="lb">' + esc(it.label) + '</span>';
      b.addEventListener('click', e => { e.preventDefault(); press(i); });
      b.addEventListener('pointerenter', () => { if (!b.classList.contains('dim')) select(i); });
      barEl.appendChild(b);
      nodes.set(it.id, b);
    });
    sync();
  }

  /* Ask every item how it is doing, and repaint. Cheap enough to run on
     every open and every press, which is the only way the sound glyph and
     the cast thumbs can be right without the page pushing at us. */
  function sync() {
    for (const it of items) {
      const b = nodes.get(it.id);
      if (!b) continue;
      let s = {};
      try { s = (it.state && it.state()) || {}; } catch { s = {}; }
      b.hidden = !!s.hidden;
      b.classList.toggle('dim', !!s.disabled);
      b.classList.toggle('on', !!s.pressed);
      b.setAttribute('aria-disabled', String(!!s.disabled));
      if (it.toggle) b.setAttribute('aria-pressed', String(!!s.pressed));
      const label = s.label || it.label;
      b.querySelector('.lb').textContent = label;
      b.setAttribute('aria-label', s.title || label);
      b.title = s.title || label;
      const icon = s.icon || it.icon;
      if (icon && b.dataset.icon !== icon) {
        b.dataset.icon = icon;
        b.querySelector('svg').outerHTML = svgWrap(ICONS[icon] || it.svg || ICONS.keys);
      }
    }
    if (sel >= 0 && !usable(sel)) select(nextUsable(sel, 1));
  }

  const usable = i => {
    const it = items[i], b = it && nodes.get(it.id);
    return !!b && !b.hidden && !b.classList.contains('dim');
  };

  function nextUsable(from, step) {
    for (let n = 1; n <= items.length; n++) {
      const i = ((from + step * n) % items.length + items.length) % items.length;
      if (usable(i)) return i;
    }
    return -1;
  }

  function select(i) {
    if (sel >= 0 && items[sel]) nodes.get(items[sel].id)?.classList.remove('sel');
    sel = i;
    if (sel >= 0 && items[sel]) {
      const b = nodes.get(items[sel].id);
      b?.classList.add('sel');
      if (b) root.setAttribute('aria-activedescendant', b.id);
    } else {
      root.removeAttribute('aria-activedescendant');
    }
  }

  function press(i) {
    if (i < 0 || !usable(i)) return;
    const it = items[i];
    select(i);
    let closes = it.close !== false;
    try { if (it.run && it.run() === false) closes = false; } catch (e) { console.warn(e); }
    if (closes) close();
    else { sync(); nudge(); }
  }

  /* Restart the fade-out clock. */
  function nudge() {
    clearTimeout(idleTimer);
    if (!open) return;
    idleTimer = setTimeout(close, hooks.idle || 6000);
  }

  function show(opts) {
    if (!root) return;
    open = true;
    sync();
    root.classList.add('on');
    if (sel < 0 || !usable(sel)) select(nextUsable(-1, 1));
    try { hooks.onOpen && hooks.onOpen(); } catch (e) { console.warn(e); }
    if (!(opts && opts.sticky)) nudge(); else clearTimeout(idleTimer);
  }
  function close() {
    if (!root || !open) return;
    open = false;
    clearTimeout(idleTimer);
    root.classList.remove('on');
    try { hooks.onClose && hooks.onClose(); } catch (e) { console.warn(e); }
  }
  function toggle() { open ? close() : show(); }

  /* The page hands keys here first while the menu is up. Returns true when
     the key was ours, so the app's own shortcuts stay out of the way. */
  function key(e) {
    if (!open) return false;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') { select(nextUsable(sel, 1)); nudge(); return true; }
    if (k === 'ArrowLeft'  || k === 'ArrowUp')   { select(nextUsable(sel, -1)); nudge(); return true; }
    if (k === 'Home') { select(nextUsable(-1, 1)); nudge(); return true; }
    if (k === 'End')  { select(nextUsable(items.length, -1)); nudge(); return true; }
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') { press(sel); return true; }
    // Escape, and the several spellings of a remote's back button.
    if (k === 'Escape' || k === 'Backspace' || k === 'BrowserBack' || k === 'GoBack') {
      close(); return true;
    }
    // Anything else is a shortcut the app still owns; keep the strip up for
    // a moment so its effect can be seen.
    nudge();
    return false;
  }

  global.RoundtripMenu = {
    init(opts) {
      hooks = opts || {};
      items = (hooks.items || []).slice();
      if (!root) mount(); else build();
      return this;
    },
    /* Add an action, optionally before an existing one by id. */
    addItem(def, beforeId) {
      if (!def || !def.id || items.some(i => i.id === def.id)) return this;
      const at = beforeId ? items.findIndex(i => i.id === beforeId) : -1;
      if (at >= 0) items.splice(at, 0, def); else items.push(def);
      build();
      return this;
    },
    removeItem(id) {
      const at = items.findIndex(i => i.id === id);
      if (at >= 0) { items.splice(at, 1); build(); }
      return this;
    },
    open: show, close, toggle, key, sync,
    isOpen: () => open,
    ids: () => items.map(i => i.id),
    icons: ICONS,
  };
})(window);
