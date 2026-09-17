# Publishing Roundtrip to a live URL

Goal: ET45 (the desk PC) opens one address once and always shows the newest
build, with nobody touching that machine again.

Status as of 2026-09-17: **not published yet.** The blocker is below. Once a
GitHub repo is attached to this project, the routine in "The routine" takes one
command per build.

---

## What Roundtrip needs from a host

`Roundtrip.html` is self-contained for code and globe textures (three.js, the
camera list, Blue Marble day/night, topo, stars and the cloud fallback are all
baked in as data URIs). It is **not** self-contained for the dive or the feed.
At runtime the page still reaches four origins:

| Origin | Used for | Breaks without it |
|---|---|---|
| `www.youtube.com` (iframe) | the live camera feed | the dive lands on a blank rectangle |
| `server.arcgisonline.com` | Esri World Imagery, the descent + ground patches | descent has no ground |
| `s3.amazonaws.com` | terrarium terrain tiles | ground is flat |
| `overpass-api.de` | OSM buildings | no buildings |
| `clouds.matteason.co.uk` | today's real clouds | falls back to the baked texture (fine) |

So the host must allow a cross-origin **iframe** to YouTube and cross-origin
**images/fetch** to those tile hosts. That is the whole requirement.

## Why Claude Artifacts cannot host it

Artifact pages are served under a content security policy that admits scripts
only from cdnjs / jsdelivr / the Tailwind CDN / code.jquery.com, and stylesheets
only from Google Fonts. Every other origin is blocked, for every resource type —
images, media, fetch/XHR and frames — and blocked silently, with nothing in the
UI to say so.

Published on an artifact, Roundtrip would show the spinning globe (that part is
all baked in) and then dive into nothing: no satellite imagery, no terrain, no
buildings, and an empty iframe where the camera should be. That is the exact half
of the app Anthony cares about, so the artifact route is closed. Do not re-test it.

Related environment fact, already recorded in project memory: this container's
egress policy blocks youtube.com, arcgisonline.com and the tile hosts (`000` on
CONNECT), so a headless browser **here** cannot verify a live dive either, on any
host. Rendering is verified on a real machine, not from a session.

## The route that works: GitHub Pages

A GitHub Pages site is a plain static host with no CSP of its own, so the iframe
and the tile fetches behave exactly as they do from a double-clicked file. It is
free, it needs no build step, and the URL never changes between builds —
which is the whole point for ET45.

**What is needed once:** a GitHub repository attached to this project
(Project settings → Resources). Any repo works, public or private; Pages needs
it public, or a paid plan for a private one, so a public repo holding only this
static page is the default choice. Nothing in the repo is secret — the app has
no keys, by project rule.

## The routine (once a repo is attached)

Per build, from a project session:

```bash
cd earth-dive-prototype
python3 build.py                      # index.html + assets -> Roundtrip.html
cp Roundtrip.html <repo>/index.html   # Pages serves index.html at the root
cd <repo> && git add -A \
  && git commit -m "Roundtrip build $(date -u +%Y-%m-%dT%H:%MZ)" \
  && git push -u origin main
```

Pages redeploys in under a minute. The address stays the same, so ET45 shows the
new build on its next refresh.

**One-time setup in the repo**, in this order:

1. Push `Roundtrip.html` as `index.html` at the repo root.
2. Add an empty `.nojekyll` file at the root, so Jekyll does not touch it.
3. Turn on Pages: repo Settings → Pages → Source: *Deploy from a branch*,
   branch `main`, folder `/ (root)`.
4. The site lands at `https://<owner>.github.io/<repo>/`. That is ET45's URL.

Note the file is ~6.5 MB. That is well inside Pages' 1 GB site limit, but it is
one 6.5 MB download on a cold load. If that ever matters, push the *source*
layout instead (`index.html` + `assets/` + `vendor/` + `clouds/` + `cameras.json`)
— Pages serves it over http, so the module loading and the local textures that
`build.py` exists to work around are not a problem there, and each asset then
caches separately. The single file is the default because it is also the
double-click deliverable.

### Making ET45 show it full-screen

Once, on that PC: open the URL in Chrome or Edge, press F11 for full screen. To
have it come up on boot without a keypress, a shortcut to
`chrome.exe --kiosk --app=<url>` in the Startup folder does it. This is the only
step that touches ET45, and it is done once.

## Keeping it honest

After any republish, the things worth checking on a real machine are the three
that depend on the network: the globe spins, a dive shows ground detail all the
way down, and the feed plays inside the page. A session cannot check any of them
(see the egress note above); say so rather than implying a check happened.
