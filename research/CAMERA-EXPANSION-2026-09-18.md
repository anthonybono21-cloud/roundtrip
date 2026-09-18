# Camera expansion review — September 18, 2026

This release adds **434** technically reviewed cameras for **674 total**. Discovery stopped at 434; the original 500 target is superseded. The strongest qualified views were selected from the completed research, with 26 additional qualified views kept in local reserve.

## Scope of verification

This is a technical camera review, not a grant of content rights. Source-provider terms govern permitted display, attribution and reuse. Embedding a provider's player and rebroadcasting footage on a separate channel require separate consideration; this review establishes no rebroadcast permission.

A final integration check also found that the Split HLS feed stalled in the browser's native player but played at 1920×1080 using the existing MSE/HLS.js path. The player now tries MSE once after a native decoding error or eight visible seconds without playback, preserving its overall startup deadline and native-only device support. Fourteen focused lifecycle tests pass.

## Quality ratings

- 5: **29** — exceptional framing with interesting activity.
- 4: **195** — strong composition and observed activity.
- 3: **210** — useful view with occasional activity or source-quality limitations.
- Scores 0–2 were not imported. Ratings reflect the sampled view, not a guarantee of continuous action.

## Verification and search

The selected views cover **44 countries**: 314 YouTube streams and 120 public HLS streams. Each imported record includes dated playback/live checks, actual visual inspection, observed scene movement, a score explanation, public source, location/timezone and curated search tags. A title, thumbnail or advancing clock alone did not qualify a stream. A dated Heathrow broadcast was held because it would become a replay.

Search supports subjects and places as well as `quality-5`, `quality-4` and `quality-3`. Curated tags survive future tag regeneration. Optional publisher attribution is displayed alongside the globe credits.

FedEx search includes the restored Memphis airport stream and the newly added Cologne Bonn cargo apron camera. Cologne directly shows the FedEx building and aircraft; its source is 640×480, rated 3. Minneapolis remains an unconfirmed FedEx-specific lead.

Coordinates are approximate scene anchors; exact camera mounts have not been surveyed. Checks were performed on desktop browsers and decoded frames on September 18. Availability, weather and activity can change. This pass does not claim an ET401 hardware test.

The importer preserves all previous catalog records and rejects invalid, duplicate or unverified candidates. The adjacent JSON report records the exact selection. Raw research and diagnostic downloads stay local.

Signed: Codex
