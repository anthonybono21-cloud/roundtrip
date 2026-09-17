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

## Keys

| key | what it does |
| --- | --- |
| `/` | open search: places, scenes and tags |
| `N` | dive to the next camera now |
| `Space` | hold this camera, cancel the rotation |
| `R` | reject this camera and skip on (remembered in this browser) |
| `Esc` | pull back to orbit, and release a search set |
| `F` | fullscreen |
| `H` | show/hide the key list |
| `Shift+X` | print the local reject list to the console |

`Roundtrip.offAir()` lists cameras held back right now by a `live_window`: the
part-time and seasonal ones are kept in the list and returned to the rotation
when they are actually broadcasting, rather than rejected.

## Search

Press `/`, or click the magnifier under the speaker. Type a place, a scene or a
tag and every camera that matches is listed - all of them, scrolled, never a
top-five. `Enter` or a click flies there through the normal dive; **Play these**
narrows the rotation to exactly that set until `Esc` hands the world back.

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
