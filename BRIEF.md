# Roundtrip — a brief

This one page is meant to be handed to someone (or some AI) who has never seen
the project. It says what Roundtrip is, who it is for, how it should feel, what
already works, and exactly what a brand deliverable needs to contain.

Everything in this repository is the app itself. It is public, so it can all be
read directly:

- The app runs live at **https://anthonybono21-cloud.github.io/roundtrip/**
- The code and the docs are at **https://github.com/anthonybono21-cloud/roundtrip**
- [`README.md`](README.md) — how the app works, key by key, feature by feature
- [`cameras.json`](cameras.json) — the camera list, 121 cameras in 40 countries
- [`PUBLISH.md`](PUBLISH.md) — how a change gets published to the live address

## What Roundtrip is

A single web page that shows a 3D earth turning in space — real satellite
imagery, real city lights on the night side, today's real cloud cover — and
then dives. The view leaves orbit, arcs down through the atmosphere to one
specific spot on the planet, lands in the exact frame of a live public webcam,
and crossfades into that camera's feed. You watch the Western Wall in Jerusalem,
or a waterhole in Botswana, or a volcano in the Philippines, for a little while.
Then it pulls back out and flies somewhere else.

That is the whole product. There is no feed, no login, no account, no ads.

## Who it is for

It was built for one desk. Anthony has a display PC at his desk (an ET45) that
sits there all day; Roundtrip is what is on it. It also runs on a tablet and on
a Fire Stick plugged into a TV, and there are Apple, Android and Fire TV
versions in progress. So it has to look right at three very different sizes:
a monitor an arm's length away, a tablet held in a hand, and a television
across a room driven by a remote control with a D-pad.

It is a personal thing rather than a business. Nobody is being sold anything.

## How it should feel

- **Quiet and cinematic.** It is a window, not a dashboard. Nothing blinks,
  nothing demands attention, nothing counts down at you.
- **The camera is the hero.** When a feed is playing, the interface gets out of
  the way almost completely. A few small round buttons rest in the top right at
  about 70% opacity and that is it.
- **Surprising places.** The bar for a camera is "I did not know you could see
  that": sacred sites, remote outposts, volcanoes, animal waterholes, busy
  airports and markets, a live-music stage in Key West. Not a static hotel
  lobby.
- **The earth and the zoom are the core.** Every other feature exists to serve
  the moment where the planet becomes a place. It should be as detailed and as
  smooth as it can be made.
- **It lives in the dark.** The page is space-black. The current interface uses
  Inter (falling back to the system sans) at small sizes, with a warm amber
  (`#ffd479`) as the only real accent against a near-black (`#05070c`) and cool
  blue-greys for text.

## The name

A roundtrip is a journey out and back. That is literally the loop the app makes,
over and over: out from orbit down to a place on the earth, then back up and out
again to the next one. It also carries the older sense of a trip you take for
the going rather than the arriving — you are not travelling to get anywhere,
you are travelling to look.

## What exists today

Working and live right now:

- The globe: NASA satellite imagery, night lights, atmosphere, stars, real
  cloud cover updated through the day with shadows.
- The dive: an arc from orbit to real terrain and real building shapes, handing
  over to the live video at about 6 km up so the last frame of the render and
  the first frame of the feed match.
- 121 cameras in 40 countries, each with a researched viewpoint so the dive
  lands in the camera's actual frame.
- Rotation: a shuffled deck, every camera once per cycle, a few seconds in orbit
  between dives.
- Sound: the webcams' own audio, quiet, with a speaker toggle.
- Search: press `/` or the magnifier. Tag chips for places, scenes and moods,
  forgiving spelling, and a "Play these" button that narrows the rotation.
- Thumbs up and thumbs down, on the arrow keys or two buttons, to shape what
  comes round.
- Keys: `N` next, `Space` hold, `Esc` back to orbit, `/` search, `M` sound,
  `↑`/`↓` thumbs, `F` fullscreen, `H` help.

In progress, not finished:

- A tap/click menu that reveals actions instead of changing the scene, so
  nothing happens by accident.
- A pin map mode.
- A Fire TV build with D-pad navigation and larger overlays.
- Native Apple and Android apps.

## What a brand deliverable needs

There is no brand yet — no logo, no wordmark, nothing chosen deliberately. The
colours and type above are placeholders that happened during building, and can
be replaced entirely.

A complete deliverable is:

1. **Mark** — an app icon that reads at 16 px in a browser tab and at TV size
   across a room. Square-safe, since most of the places it lands are squares or
   circles. Vector (SVG) plus PNG.
2. **Wordmark** — "Roundtrip" set as a lockup, on its own and beside the mark.
   Vector.
3. **Colour** — a small palette with hex values, built for a black background,
   naming one accent. Say what is text, what is accent, what is background.
4. **Type** — a typeface for the interface and one for display if they differ.
   It must be free to use and available as a web font, since the app loads in a
   browser.
5. **Favicon and icon sizes** — this is where most of the work is:
   - web: `favicon.ico` (16/32/48), plus 180×180 Apple touch icon and
     192×192 and 512×512 PNGs
   - iOS: 1024×1024 master, square, no transparency, no rounded corners
   - Android adaptive: a 432×432 foreground layer and a background layer,
     with the mark inside the safe circle
   - tvOS: layered app icon, 1280×768 and 400×240
   - Fire TV: 1280×720 banner and a 1920×1080 background
6. **Splash / loading screen** — what is on screen for the second or two before
   the earth appears. Dark, still, no spinner if it can be avoided.

Optional but welcome: a short line of guidance on what the brand is *not*, so
later decisions stay consistent.

## Where to put the files

Drop everything into **`assets/brand/`** in this repository, in whatever folder
structure makes sense (`assets/brand/icons/`, `assets/brand/mark.svg`, and so
on). Source files are welcome alongside the exports.

Nothing else needs doing with them. A Claude thread on this project picks the
files up from `assets/brand/`, wires the favicon and every icon size into the
app and the native shells, applies the palette and type, builds the splash
screen, and publishes it. The brand work does not need to touch any code.
