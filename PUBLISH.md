# Publishing Roundtrip

Intended address: **https://anthonybono21-cloud.github.io/roundtrip/**

**It is not serving yet.** GitHub Pages is still switched off for this repo
(`has_pages: false`). Everything else is built, pushed and verified; see
"How it is hosted" for the one owner-only setting that turns it on.

ET45 (the desk PC) opens that address once. Every build after this one appears
there on the next refresh, with nothing to do on that machine.

---

## How it is hosted

GitHub Pages serves this repo's `main` branch from the root. A push to `main`
is a deploy; there is no build step and no workflow.

**Pages is on.** Anthony enabled it from `main` at 22:33 UTC on 17 Sep 2026,
and the site has served from that commit onwards. Nothing below needs doing
again; it is kept because it is what the hour before that flip cost, and it
would be repeated on any new repo.

**Turning Pages on is a one-time repo setting that only the repo owner can do.**
It cannot be automated from a project session:

- `actions/configure-pages@v5` with `enablement: true` **fails** here. The
  Actions runner token cannot switch Pages on for a repo that has never had it.
  Both attempts failed at that step, so upload and deploy never ran and the
  address 404ed while the workflow list still displayed the runs as green.
  The workflow has been removed; do not re-add it.
- Pushing a `gh-pages` branch does **not** auto-enable Pages either. That legacy
  behaviour is gone; `has_pages` stayed `false` after the push.
- The Pages REST API (`/repos/{owner}/{repo}/pages`) is **blocked by the agent
  proxy** (403), so a session cannot enable it directly even with a token.

The setting, for reference: repo **Settings → Pages → Source: Deploy from a
branch → `main` / (root) → Save**, at
<https://github.com/anthonybono21-cloud/roundtrip/settings/pages>.

Verify it took with `curl -s https://api.github.com/repos/anthonybono21-cloud/roundtrip | grep has_pages`
— that endpoint is not proxy-blocked, so a session can confirm enablement
without any tool that prompts the user.

The root holds the **source layout** — `index.html`, `assets/`, `vendor/`,
`clouds/`, `cameras.json` — not the bundled single file. Pages serves over http,
so the ES module import and the local textures load natively; `build.py`'s
data-URI inlining exists only so the file works when double-clicked from disk.
Serving the source also keeps each rebuild to a small diff instead of a fresh
6.5 MB blob, and lets ET45 re-use its cached copy of the ~4.6 MB of textures.

Note the name collision, and it has already caused one wrong diagnosis: the
bare address serves **`index.html`**, which in this repo is the **editable
module source**, needing `assets/`, `vendor/`, `clouds/` and `search.js` beside
it. That is the file every user-visible change has to reach. `Roundtrip.html`
is the single-file double-click build, it is gitignored and **not in this repo
at all**, so a fix present only there is a fix nobody on the site can see;
`python3 build.py` regenerates it from this same source for sending as a file.

This layout is verified: served over plain http and driven in headless
Chromium, every local asset returns 200 (only `favicon.ico` 404s, harmless),
there are no page errors, and the globe renders with city lights, clouds and
the terminator. Only the external hosts below fail, and only because a session's
egress blocks them.

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
| `gibs.earthdata.nasa.gov` | NASA GIBS cloud source used by `clouds/` | falls back with the above |

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
