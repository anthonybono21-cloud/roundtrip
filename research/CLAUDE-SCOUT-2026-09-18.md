# Camera scout, September 18 2026 (Claude)

Anthony asked for more vacation spots worldwide, a separate North America
pass, busy city streets, and indoor places with lots of movement. This adds
**258** cameras, for **932** total. Scene set: `claude-scout-2026-09-18`.

## How they were chosen

Seven research agents, one per area: Europe vacation, Asia-Pacific vacation,
South America and Africa vacation, North America west, North America east,
city streets worldwide, and indoor activity. Every camera was checked the same
way: yt-dlp live status and `playable_in_embed`, then ffmpeg decoded two frames
5 s apart and a person looked at both. HLS feeds also had to answer with
`Access-Control-Allow-Origin: *` on the playlist and the video pieces, with no
token in the address, because the page fetches them straight from GitHub Pages.

Scores use the same scale as the 434-camera import (0 dead, 1 wall, 2 static,
3 occasional activity, 4 steady movement, 5 exceptional). Only 3-5 imported:
27 fives, 114 fours, 117 threes. Import ran through
`tools/import-expansion500.py`, which also deduped against the catalog.
Existing records are unchanged; new records were tagged by `tag.py`.

- 243 YouTube, 15 HLS, 35 countries (US 101, Mexico 19, Spain 19, Brazil 14,
  Italy 13, Chile 10).
- Tags: 206 new cameras carry `vacation`, 44 `street`, 26 `indoor`.
- 12 indoor venues carry a `live_window` with their opening hours, so the
  rotation skips them while closed.

## Held back

- Eight good streams whose channels end the broadcast every 2-12 hours and
  start a new video id (Chicago lakefront, Las Vegas Strip, Hermitage kitten
  room, Copacabana Posto 6, Santiago Tobalaba, Bariloche Mitre, Pattaya Soi
  Buakhao, Two Friends Key West). A fixed id would go dead within a day.
- Everything the agents put in reserve: score 2, night scenes too dark to
  judge (about 70, mostly Asia and Africa, to recheck in local daylight),
  a naturist beach, a red-light street, a vertical video, a possible restream.
- ipcamlive cameras (four 5-rated Andes ski cams, Fiji, Tahiti) and Swellnet
  surf cams need the stream address resolved at play time; not built.

## Search

`search.js` now maps vacation, holiday, resort, street(s) and indoors, and the
browse chips include vacation and street.

## Checked

`node --test tests/*.mjs` 36/36, `pytest tests/test_import_expansion500.py`
19/19, `build.py` OK. In headless Chrome from a local server: 932 cameras
load; `find('vacation')` 415, `find('street')` 272, `find('indoor')` 45; a new
YouTube camera (Kaanapali) and a new HLS camera (Rome, Vittoriano) both flew
in and played. Not tested on the ET401, the KC50 or the Fire TV.

Signed: Claude
