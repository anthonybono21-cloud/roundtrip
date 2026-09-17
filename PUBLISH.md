# Publishing Roundtrip

Roundtrip is live at **https://anthonybono21-cloud.github.io/roundtrip/**

ET45 (the desk PC) opens that address once. Every build after this one appears
there on the next refresh, with nothing to do on that machine.

---

## How it is hosted

This repo's root *is* the site. A push to `main` runs
`.github/workflows/pages.yml`, which turns Pages on if it is off, uploads the
repo root, and deploys it. No settings to click, no build step.

The root holds the **source layout** — `index.html`, `assets/`, `vendor/`,
`clouds/`, `cameras.json` — not the bundled single file. Pages serves over http,
so the ES module import and the local textures load natively; `build.py`'s
data-URI inlining exists only so the file works when double-clicked from disk.
Serving the source also means a rebuild changes `index.html` and `cameras.json`
instead of committing a fresh 6.5 MB blob each time, and ET45 re-uses its cached
copy of the ~4.6 MB of textures on every reload.

`Roundtrip.html`, the double-click build, stays in the project files. Run
`python3 build.py` here to regenerate it from this same source.

## The routine, per build

```bash
git clone https://github.com/anthonybono21-cloud/roundtrip
# edit index.html / drop in a new cameras.json
git add -A && git commit -m "Roundtrip build $(date -u +%Y-%m-%dT%H:%MZ)"
git push origin main
```

Pages redeploys in about a minute. The address never changes.

## What the host has to allow

`index.html` is self-contained for code and globe textures, but the dive and the
feed still reach five origins at runtime:

| Origin | Used for | Breaks without it |
|---|---|---|
| `www.youtube.com` (iframe) | the live camera feed | the dive lands on a blank rectangle |
| `server.arcgisonline.com` | Esri World Imagery, descent + ground patches | descent has no ground |
| `s3.amazonaws.com` | terrarium terrain tiles | ground is flat |
| `overpass-api.de` | OSM buildings | no buildings |
| `clouds.matteason.co.uk` | today's real clouds | falls back to the baked texture (fine) |

GitHub Pages is a plain static host with no content security policy of its own,
so all five behave exactly as they do from a double-clicked file. That is why it
is the host.

### Why not a Claude Artifact

Artifact pages run under a CSP admitting scripts only from cdnjs / jsdelivr /
the Tailwind CDN / code.jquery.com and stylesheets only from Google Fonts.
Every other origin is blocked — images, media, fetch and frames alike — silently.
Roundtrip would show the globe (baked in) and then dive into nothing: no
imagery, no terrain, no buildings, empty iframe. Do not re-test this.

## Making ET45 show it full-screen

Once, on that PC: open the URL in Chrome or Edge and press F11. To have it come
up on boot with no keypress, put a shortcut to
`chrome.exe --kiosk --app=https://anthonybono21-cloud.github.io/roundtrip/`
in the Startup folder.

## Verifying

Project sessions cannot check the live experience: this container's egress
blocks `youtube.com` and every tile host, so a headless browser here can load
the page shell but never a real dive or feed. The three things worth a glance on
a real machine after a republish are the globe spinning, a dive keeping ground
detail all the way down, and the feed playing inside the page. Say "unverified
from here" rather than implying a session checked them.
