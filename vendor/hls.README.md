# HLS playback

Pinned hls.js 1.7.3, light production build, Apache-2.0 (see hls.LICENSE).
Source: https://github.com/video-dev/hls.js/tree/v1.7.3
Distribution: https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.light.min.js

Loaded only for direct HLS feeds when native HLS playback is unavailable.
The player keeps the source resolution and releases its decoder, worker and
segment requests when Roundtrip switches cameras. Native bundles copy vendor/.

Signed: Codex
