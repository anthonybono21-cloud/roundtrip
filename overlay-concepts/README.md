# Roundtrip overlay studies

Serve this directory from the repository root; open `/overlay-concepts/`.

Three selectable, working layouts share one still camera thumbnail. They do not instantiate any YouTube player, modify the app, write settings, or send votes.

1. **Place first (recommended):** lower-left cluster. City/country leads, micro-place beneath it, large temperature/time below, enlarged stacked logo beside all three lines.
2. **Wide rail:** shallower horizontal band. Logo and location on left; temperature/time on right.
3. **Open corners:** city and micro-place at upper left, conditions lower left, enlarged logo lower right.

The layout uses a 16:10 stage to represent the requested 1920×1200 ET401 landscape view. All overlay measurements use the stage width, so the phone view shows the same composition at scale. Review controls reflow on a 390px phone. Sample values are intentionally frozen to compare layouts fairly. The camera thumbnail is a remote YouTube still, not live playback; its embedded date/time and any camera labels belong to the source image.

## Brand motion

The exact approved white lockup and wordmark remain unchanged. The traced mark has the plane, its trail, and part of the handle joined in one path. Rather than risk cutting the handle, this concept animates a clipped **duplicate** of the existing plane shape around the unchanged lockup. Thus a plane remains at its original position during the flourish. This is an honest motion study, not a claim that the production mark is already separated into independently editable parts.

The flourish lasts 1.85 seconds, uses Web Animations transform/opacity only, and rests at least 90 seconds automatically. The preview control can replay it. Pause, background-tab cancellation, and `prefers-reduced-motion` are supported. No continuous animation or per-frame JavaScript. A clean single-plane departure would need a separately prepared approved plane/trail vector with a reviewed seam; do not mask the current whole handle or redraw the brand casually.

## Verification

Reviewed using the Codex browser at 1920×1200 and 390×844. Layout selection and comparison controls work, approved logo assets and thumbnail load, and the preview flight plays. Reduced-motion is checked through browser media emulation. This is a design review gate: no layout has been applied to the live app.

Files: `index.html`, `style.css`, `studio.js`, `plane.svg`. `inspect.html` is a local visual anatomy check of the seven existing SVG paths; it is not linked from the studio.

Signed: Codex
