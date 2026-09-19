# EarthCam scout, September 19 2026 (Claude)

Anthony asked for basically all of EarthCam's YouTube livestreams, plus the
Western Wall camera at the Temple Archaeological Park. This adds **21**
cameras, for **953** total. Scene set: `earthcam-2026-09-19`.

## What EarthCam runs on YouTube

- One official channel: @EarthCam (UC6qrG3W8SMK0jior2olka3g, 888K
  subscribers). Its /streams tab had 46 live streams at 11:05 ET. 22 were
  already in the catalog and 24 were new.
- The other channels called "EarthCam" or "EarthCam Live" have 7 to 181
  subscribers and carry reuploads, shorts or nothing. @EarthCamLive has no
  streams, and @EarthCamTV belongs to someone else. None were used.
- EarthCam keeps fixed ids. The 24 new streams went live between February 28
  and September 11 2026 (Flight 93 restarted on 9/11, Lincoln Harbor on
  9/10). Older same-title videos on the channel are broadcasts that ended.
  YouTube keeps only the last 12 hours of a long stream, so they are not a
  sign of a 12-hour rotation. No new stream was held back for rotating.

## How they were checked

The same checks as 9/18 ran on all 25 streams: yt-dlp live status and
`playable_in_embed`, then ffmpeg decoded two frames 5 s apart and I looked at
both. All 25 were live and embeddable. The ten that looked static got a
second look: five more frames 30 s apart. Only 3-5 imported, through
`tools/import-expansion500.py`, which also deduped against the catalog.

Scores: 1 five, 4 fours, 16 threes. 20 are EarthCam and 1 is the Western Wall
stream, which went in at 5.

Best five:

1. Western Wall, Temple Archaeological Park (zp6LNSoq000, 5). High view up
   the Wall from its southern end, with a dense crowd at prayer.
2. 9/11 Memorial reflecting pool from above (ZYQlLQHz2Mg, 4). Water pours
   into the pool, and visitors walk the edge.
3. Coney Island, Luna Park and the beach (H67j7H-7QD0, 4). The Cyclone, the
   Wonder Wheel, the Parachute Jump and the elevated subway, with traffic.
4. Tamariu cove, Costa Brava (fTh5ssC1z-c, 4). A busy beach and dozens of
   boats at anchor.
5. River's Edge Park and the Omaha skyline, Council Bluffs (qsrevo5Vdkw, 4).
   A crowd under the 33-foot "Looking Up" statue.

Coordinates are the named landmark or host building from OpenStreetMap. The
host is used when EarthCam names it, for example Terminal Tower, One
Vanderbilt or the Sheraton Lincoln Harbor. Three are rougher: Midway (airport
point), Scrub Island (island point) and Coney Island (Luna Park; the camera
building is not published).

Weather today pulled some 3s down. The Skydeck was in cloud, and rain spotted
the lens at Midway and at the Jamestown buffalo. They were scored as seen.

## Held back

Four scored 2 on both looks. They are in the `reserve` list of
`earthcam-2026-09-19/candidates.json` with full data, so a recheck at a busier
hour only needs a new score:

- Giraffe barn, Greenville Zoo (AIwsO8sB0LM). Empty stall; the giraffe was
  out in the yard, which did go in.
- Snowman Cam, Gaylord, Michigan (IU_-Pl9O5jQ). No animals in 2.5 minutes.
  The snowman wears a Lions shirt.
- Sanibel beach from the Shalimar resort (4LTSTw4jnZc). Dune plants fill
  most of the frame, and the beach is far back.
- Milwaukee Riverwalk and the Bronze Fonz (MT5Og9gOKuM). Nobody walked by on
  a wet morning.

## Checked

`cameras.json` parses and went from 932 to 953 (+21). The first 932 records
and the top-level fields match HEAD exactly, and the git diff is 2511
insertions with 0 deletions. The new records' tags are exactly what
`tag.py`'s `tags_for` produces. I did not run `tag.py` over the whole file,
because it would rewrite the tags on 563 older records whose poses changed
after they were tagged. The 9/18 import also tagged only its new records.
`node --test tests/*.mjs` 36/36 and `pytest tests/test_import_expansion500.py`
19/19. Not tested in a browser or on the tablets or TV.

Signed: Claude
