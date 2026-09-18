# Roundtrip

The viewer for the ET45 desk app: a spinning earth in space that flies down
into each live webcam and hands over to the feed. Built entirely on free, keyless data.

## Run it

Double-click **`Roundtrip.html`**. That is the whole thing: one file, no
server, no install, no API key. Chrome or Edge.

Everything else in this folder is the same app in editable pieces
(`index.html` + `assets/` + `vendor/`), plus `cameras.json`. If you serve the
folder over http, `index.html` reads `cameras.json` so the camera list can be
edited without rebuilding. Opened off the disk, the single file uses the copy
baked into itself.

After editing `cameras.json`, rebuild the single file with `build.py`
(needs Python): `python build.py`.

## A tap shows what you can do

Nothing floats over the picture at rest. A tap, a click anywhere, the OK button
on a remote or a press of `←` or `→` brings up a strip along the bottom:

**Skip · Back · Stay · Sound · Search · Good · Drop · Globe · Full · Keys**

It changes nothing by itself. Skipping to another camera is one of the things
offered there, not what touching the screen does to you, which is the whole
point of it. Arrows walk the strip, `Enter` presses, `Esc` or a remote's Back
closes it, and it fades out after a few seconds alone. `Back` returns to the
camera before this one; press it again to keep walking back.

The speaker, the magnifier and the two thumbs used to sit in the top-right
corner and are items in this strip now.

`menu.js` is the whole thing: it draws itself, knows nothing about the globe,
and is handed its actions by the page, in the shape `search.js` is written in.
Another feature adds one without touching either file:

```js
Roundtrip.menu.addItem({ id:'map', label:'Map', icon:'map', run(){ … } }, 'full');
```

On a television `tv.js` hands its own menu over to this one, so a D-pad and a
finger drive exactly the same strip.

## Keys

| key | what it does |
| --- | --- |
| tap/click, `←`, `→` | show the actions |
| `P` | pin map: every camera on the globe, pick one and stay on it |
| `/` | open search: places, scenes and tags |
| `N` | dive to the next camera now |
| `Space` | hold this camera, cancel the rotation |
| `↑` | good camera: keep it, and let it come round a little more often |
| `↓` | bad camera: drop it from the rotation here and move straight on |
| `R` | the older spelling of `↓` |
| `Esc` | pull back to orbit, and release a search set |
| `F` | fullscreen |
| `H` | show/hide the key list |
| `Shift+X` | print this browser's votes to the console |

`Roundtrip.offAir()` lists cameras held back right now by a `live_window`: the
part-time and seasonal ones are kept in the list and returned to the rotation
when they are actually broadcasting, rather than rejected.

## On a television

Roundtrip recognises a Fire TV or another 10-foot screen from its user agent
and sizes the whole overlay off the viewport instead of in desk pixels, inside
a 5% title-safe margin. `?tv=1` forces that layout on a desktop and `?tv=0`
forces it off on a television; either choice is remembered.

The remote is keyboard handling, since a Fire TV's buttons arrive as ordinary
key events. `tv.js` holds it, self-contained like `search.js`, and it does
nothing unless the page decided it is on a television.

| remote | what it does |
| --- | --- |
| Select | show what you can do here, and change nothing on its own |
| ▶ / fast forward | next camera |
| ◀ / rewind | the camera before |
| ▲ / ▼ | the thumbs, as on a keyboard |
| Play/Pause | stay on this one |
| Back | pull out to orbit, rather than out of the app |

While the pin map is open the D-pad steps from camera to camera and Select
stays on the one you are looking at; Back closes the map. "Map of every
camera" is a row on the Select menu.

A Fire TV remote's Back button is wired to browser history rather than to
Escape, so `tv.js` keeps a spare history entry to absorb it. The first press of
anything also takes the page full screen, which is what loses Silk's title bar.

`firetv/` is the app that puts Roundtrip on the home row without a browser;
`firetv/README.md` covers what it is and how it is installed.
## The pin map

`P`, or **Map** on the action strip, stops the rotation and puts every camera
on the globe at once. It is the same globe: the same sun, the same live
clouds, the same night lights, the same sprites the orbit view already carries.
What changes is who is flying it.

- **Drag** to spin the earth, **wheel or pinch** to come closer, `+` and `-` do
  the same. A flick coasts and settles.
- **Hover or tap a pin** for the camera's name, where it is, the local time and
  whether the sun is up there. A camera that is off air right now, because of
  its `live_window`, is a dimmer blue dot and says so.
- **Arrow keys step from pin to pin** in the direction pressed, and the globe
  swings round when the next one is near the limb, so the whole world is
  reachable from a Fire Stick remote without a pointer. `Enter` picks.
- **Picking one dives to it and stays there.** No dwell timer, no next camera.
  `Esc` leaves the feed and hands you back to the pin map you chose it from,
  rather than to the rotation.
- A camera thumbed down loses its pin too.

Left alone for four seconds the globe turns very slowly on its own, about a
degree every two seconds, so it still reads as alive without walking away from
whatever you were pointing at. Everything in the mode is per second rather than
per frame, so a flick travels the same distance on a 60Hz desk panel, a 120Hz
tablet and a Fire Stick that is dropping frames.

`CFG.mapSpin` is that idle turn in degrees per second.

**Entry points**, for anything that wants to open the mode from outside:

| from | call |
| --- | --- |
| keyboard | `P` |
| the action strip | the `map` item, added the way `menu.js` documents |
| a remote | `window.RoundtripPins` — `open`, `close`, `toggle`, `isOpen`, `step(dx,dy)`, `pick()`; `tv.js` drives these |
| anywhere else | `Roundtrip.pinMap()` toggles; `pinMap(true)` / `pinMap(false)` force it |
| ask | `Roundtrip.pinMapOn()` |

`Roundtrip.pinMap(true)` from a feed is safe: it retreats to orbit first and
opens the map when it lands there.

While the map is up it owns the picture: a press on the globe is a drag or a
pick, not a call for the action strip, and the D-pad steps between pins instead
of skipping cameras. `Esc`, `P`, or Back on a remote hands the picture back.

## Thumbs up and thumbs down

**Good** and **Drop** in the action strip, or the up and down arrow keys
without moving a hand.

Thumbs down is immediate, because it means "I do not want to see that again":
the camera leaves this browser's deck on the spot and the next dive starts.
A still image posing as a live stream is exactly what it is for. Thumbs up
keeps the camera and nudges it a little earlier in the shuffle - gently, and
only within a cycle, so the deck still deals every camera exactly once and a
favourite crowds nothing out. The same thumb again takes the mark off.

Votes are kept in `localStorage` under `roundtrip.votes`, so a browser holds
its own verdicts for good. `Roundtrip.votes()` prints them as a list, each
entry carrying the camera's key, name, location and the moment of the verdict:

    [{ key: "2umaXl_TvIg", vote: -1, name: "...", location: "...",
       url: "...", at: "2026-09-17T22:24:51.383Z" }]

That is the list `cameras.json` is pruned from: a `vote: -1` becomes an entry
in `rejects` with a `reject_reason` and a `rejected_at`.

### Where the votes go

So that pruning does not wait on anyone exporting anything, the page also sends
the ledger to a public [ntfy.sh](https://ntfy.sh) topic:

    https://ntfy.sh/roundtrip-cam-votes-et45-9k4m2x

No account, no key and nothing secret in the page, which is the only sort of
endpoint a page served straight off GitHub Pages can safely talk to. It is a
public channel and the contents are camera names and a thumb - nothing about
the person watching. Read it back with:

    curl -s 'https://ntfy.sh/roundtrip-cam-votes-et45-9k4m2x/json?poll=1&since=all'

Each message is one snapshot from one browser: `{ app, kind, device, at, up,
down, votes }`, where `device` is a short random id kept in `localStorage` so
the desk PC's ledger and the tablet's can be told apart. Take the newest
snapshot per `device` and merge; older ones are supersets of nothing and can be
dropped.

Two details make that reliable. Every message carries the **whole** ledger
rather than a change, and one goes out shortly after each load as well as after
each vote, so the topic's roughly twelve-hour retention cannot lose a verdict a
browser still remembers. And sending is best-effort and silent - a plain body
with no custom headers, so there is no CORS preflight to fail, and a vote that
cannot leave now leaves on the next load. Nothing about it can affect what is
on screen.

## Adverts over the camera

The feeds are embedded YouTube players and YouTube runs its own advertising
inside them, so a monetised channel can meet a landing with a pre-roll. Three
things are done about it, in the order they actually help.

**A signed-in Premium account removes them at the source.** An embedded player
honours the viewer's own subscription, and that is the only thing here that
removes an advert rather than working around it. In a browser, being signed in
to YouTube in the same browser is already enough. Inside the Fire TV app the
cookie jar belongs to the shell, so the shell does the sign-in: the **Ads**
item in the action strip calls `RoundtripShell.signIn()`, the app swaps to a
plain desktop user agent (Google refuses a sign-in from a user agent carrying
the WebView's `; wv`), and runs the sign-in in two steps — Google, then
YouTube's channel picker — before coming back to the globe with the account's
cookies kept. The second step is not optional politeness: the channel chosen
there is where everything this television watches gets recorded, so a Brand
Account channel keeps 130-odd webcams out of the account holder's own watch
history and recommendations while Premium, which belongs to the Google Account
rather than to any one channel, still reaches the players. The password is
typed on the television by the person whose account it is; nothing in the app
or the runbook accepts one over adb, from the page or from an intent extra,
and the app drops out of immersive mode for the sign-in so the on-screen
keyboard has room. `setAcceptThirdPartyCookies` is the other half
of that: the players are `youtube.com` frames inside a `github.io` page, so
without it no account could ever reach them. The Ads item only appears where it
is useful — inside the TV app, or on a device that has actually had an advert
land on it.

**Nothing is revealed over an advert that can be waited out.** `enablejsapi=1`
is on every embed and a `listening` handshake starts the player reporting on
itself. An advert gives itself away by having a short, finite length where a
live stream has none, so while one is running the landing holds on the matched
ground render for up to `CFG.adHold` (6 s) and the sound stays down. Past that
cap the feed comes up regardless: a long unskippable advert is not worth
stalling the rotation for.

**Whatever still gets through is remembered.** Each advert seen is counted
against that camera in `roundtrip.adseen` on the device, and `adWeight()` deals
those cameras later in the cycle — the same shape as the thumbs, and never a
drop, because dropping cameras is what the thumbs are for. Each camera also
carries an `ads` field (`no`, `yes`, `unknown`) guessed from what the channel
is, so a device that has watched nothing yet already leans toward the
institutional feeds. What a device has seen outranks that guess as soon as it
has seen anything.

What is deliberately **not** done is blocking the adverts' own requests. It
breaks YouTube's terms for embedded players, and a player that is fought with
is a player that stops playing — the feed is the whole product.

## Search

Press `/`, or **Search** in the action strip. Type a place, a scene or a
tag and every camera that matches is listed - all of them, scrolled, never a
top-five. `Enter` or a click flies there through the normal dive; **Play these**
narrows the rotation to exactly that set until `Esc` hands the world back.

Names people actually type are understood: **nyc**, **big apple**, **la**,
**socal**, **sf**, **bay area**, **dc**, **oz**, **aotearoa**, **holland**,
**mecca**, **wailing wall**, **venezia**, **firenze**, **rio**, **scandinavia**,
**middle east**. Two-word ones survive the tokenizer, so "new york city" is one
name and not three words. One and two letter terms match exactly rather than by
prefix, so "la" is Los Angeles and not every lake, landmark and lava field.
Aliases live in two places on purpose: `tag.py` writes the ones it knows into a
camera's tags at build time, and `search.js` expands what is typed, so a camera
added by hand answers to its nickname without being run through the tagger.

The box opens on a tag list, so nothing has to be known in advance: the chips
under Places, Scenes and Moods are searches, and so is every chip on a result
row. Clicking `beach` on the Copacabana row lists all eighteen beaches.

Matching is forgiving on purpose. A term is scored against the camera's tags
first, then its name, then its location, then against an edit distance that
survives a typo or two, so `phillipines` and `venise` both land. Several words
are an AND. A handful of words people type that are not in the data are mapped
across - `zoo` reaches the aquariums and the safari cams, `planes` reaches the
airports - at a discount, so the literal matches still sort first.

Every camera carries a `tags` array in `cameras.json` covering three things:

- **place** - city, region, country, continent and the aliases people actually
  type: `nyc`, `ph`, `uk`, `mecca`, `rockies`.
- **scene** - `beach`, `skyline`, `volcano`, `waterhole`, `zoo`, `underwater`,
  `airport`, `sacred`, `stage`.
- **quality** - `busy`, `quiet`, `night lights`, `sunset-facing`,
  `sunrise-facing`, `always-on`, `part-time`, `has-sound`.

`python3 tag.py` regenerates the whole array from the camera's own fields plus a
hand-written table of what no field knows - that the Long Beach penguin cam is
penguins, that Abbey Road is the Beatles. Edit `tag.py`, not `cameras.json`.
`sunset-facing` comes from the pose heading, `has-sound` only from a camera
confirmed to carry real ambience or live music (`audio: "unknown"` means nobody
has listened yet, so it makes no promise).

`search.js` is the whole feature: it builds its own panel and styles, matches
against the list, and talks to the globe through four callbacks. The app calls
`RoundtripSearch.init()` once and adds one line to the key handler. From the
console, `Roundtrip.find('beach')` runs the same match the box does.

## Poses, and the alignment tool

120 cameras in 40 countries. Each carries a `pose` (position, heading, pitch,
field of view) and the dive lands in its frame. Positions are researched to the
mount; headings and fields of view are researched estimates, marked
`"aligned": false`, each with a `confidence` and the `basis` it was worked out
from. Cameras that see a tank, a feeder or a burrow rather than a view carry
`"view": "topdown"` and land looking straight down at the spot, because there is
no geographic scene to match.

`alt_m` is **eye height above the ground**, not elevation above sea level. The
terrain model already supplies the ground, so a pose that puts a village's
altitude in `alt_m` parks the camera that far above the mountain. Every pose in
this build was checked against the real terrain before shipping, which is how a
dozen of them were caught.

There is also a maintenance tool for checking one by hand, not part of the
normal UI and deliberately not on the key list: press `A` while a feed is
playing and the live frame is held at half opacity over the render so the two
can be compared. Arrows turn and tilt, `[` and `]` change field of view,
`PageUp`/`PageDown` change eye height, `WASD` nudge position, `Shift` for fine
steps, `Shift+S` copies the corrected pose and remembers it in this browser.
Locally stored poses override the shipped ones on load. Field names are frozen
and documented in `../POSE-FORMAT.md`.

## How the zoom works

The hard part is that no single texture covers both a planet and a street, so
the view is a chain of layers that fade into each other by altitude:

| altitude | what you are looking at |
| --- | --- |
| orbit → 300km | NASA Blue Marble and Black Marble on a sphere, today's real clouds, real sun terminator, atmosphere limb, starfield |
| 2166 → 306km | a satellite mosaic laid on the sphere around the destination, 600km across |
| 331 → 83km | a sharper one, 122km across; the cloud deck leaves over this window |
| 86 → 20km | sharper again, 27km across |
| 22 → 7km | the sharpest, 10km across, cut from the same tile grid as the ground scene below |
| 6km | the handoff: the globe and the ground scene are at the *same* camera pose, at the same resolution, under the same light and haze, so the crossfade is not a cut |
| 6km → 500m | ground scene in metres: 11km of real elevation, satellite drape, haze |
| 500m → landing | a 900m patch at the highest zoom available, plus extruded OpenStreetMap buildings |
| landing | crossfade to the live feed, framed to match |

Each layer's tile budget is set from arithmetic rather than by feel: at the
altitude where a layer reaches full opacity, one of its pixels has to be no
larger than one screen pixel. The sharpest layer is fit to the *same* tile grid
as the ground scene's own wide patch, so the two agree to the metre and the
crossfade is not a resolution jump. Every layer's border is feathered, so no
layer's square edge ever shows against the coarser one underneath it.

The globe and the ground are two separate scenes on purpose. The globe works in
earth radii and the ground works in metres; one scene spanning both destroys
depth-buffer precision.

Departure holds on the globe until every tile for the destination has loaded
*and* been uploaded to the GPU, so the descent never hitches and never drops
into untextured grey. While a feed plays, the next destination's tiles are
pulled into the browser cache in the background.

## Where the data comes from

| layer | source | cost |
| --- | --- | --- |
| globe day/night | NASA Blue Marble + Black Marble, vendored in `assets/` | public domain |
| clouds | clouds.matteason.co.uk, refreshed every 3 hours, with a bundled offline fallback | CC0, EUMETSAT attribution |
| descent imagery | Esri World Imagery tiles | free, attribution required |
| terrain | AWS open terrain tiles, terrarium encoding | free |
| buildings | OpenStreetMap via Overpass | free |
| live feeds | the project's verified YouTube cams | free |
| search tags | derived in `tag.py` from the camera records | free |

No account, no key, no billing. The attribution line bottom-right is required
by Esri's and OpenStreetMap's terms; leave it in.

## Tuning

`CFG` near the top of the script holds everything worth changing: dwell time,
the length of each phase of the flight, the handoff altitude and approach
pitch, patch sizes, whether to follow the sun, whether to fetch buildings.

From the browser console:

- `Roundtrip.dive('Rialto')` — jump straight to a camera by name
- `Roundtrip.setTime('2026-09-17T06:20:00Z')` — preview another time of day, which
  relights the globe and the ground; `Roundtrip.setTime(null)` returns to now
- `Roundtrip.CFG.dwell = 20` — change timings while watching
- `Roundtrip.parts()` — the live scene objects

`?time=2026-09-17T06:20:00Z` on the URL does the same as `setTime` at boot.

## Known limits

- Imagery stops being sharp somewhere around zoom 18–19 depending on the place,
  which is a limit of free satellite tiles, not of the code. Cities look better
  than coastlines and wilderness.
- Buildings come from OpenStreetMap footprints with heights where tagged and a
  sensible default where not, so they are real massing, not photogrammetry.
- At night the render is lit above what physics would give it. A physically
  correct night is a black screen, which does not survive a crossfade to a
  brightly lit feed.
- Overpass is rate-limited and sometimes slow. Buildings load in the background
  and are skipped rather than waited on, and are cached per camera.
- The cloud deck casts a shadow on the ground below it, offset by the deck's own
  height over the sine of the sun's elevation, so it lengthens toward the
  terminator. It leaves on descent in the same window the deck does, or a grey
  smudge would survive onto the sharp imagery after the clouds had gone.
- The container this was built in cannot reach Esri, AWS terrain, Overpass or
  YouTube, so the globe and the clouds are verified against the real sources but
  the descent is verified against a stand-in tile server. The screenshots marked
  `standin-tiles` are that stand-in: a checkerboard with a red north edge and a
  blue west edge, which is what makes a misaligned or flipped mosaic obvious.
