# GeoColor image delivery

## Status and migration gate

This workflow is prepared in an isolated branch. It has not changed the live
site, GitHub settings, or the existing source checkout. Deployment remains
unverified until a real workflow run and a production image/manifest check.

The repository currently serves GitHub Pages from `main` / root, with
`build_type: legacy` (verified through the Pages API). Before using `pages.yml`,
change this SAME repository's Pages source to **GitHub Actions**. Review and
approve that migration first. Do not create another repository or website.
The former `PUBLISH.md` warning concerned enabling a not-yet-enabled site;
this site is already enabled. Do not invoke `configure-pages` enablement.

Rollback: restore Pages source to `main` / root and restore the prior application
commit if needed. The original app files and history remain in Git. Scheduled
image updates stop when this workflow is disabled.

## Why a build-time image relay is needed

NOAA's GOES-East/West image endpoints permit browser CORS. CIRA SLIDER's
metadata and imagery endpoints currently do not. WebGL cannot use CIRA image
pixels directly, even though an ordinary image element can display them.
GitHub Actions fetches public imagery and includes it in the existing Pages
artifact. There is no continuously running server, secret API key, new hosting
provider, or sequence of binary image commits.

The task runs on main pushes, manual dispatch, and at UTC minutes 7, 27 and 47.
GitHub may delay scheduled jobs. These are periodically refreshed images,
not a live video stream or a guaranteed twenty-minute freshness SLA.

## Assets and timestamps

`tools/update-satellite.py --output assets/satellite` creates five disk images,
one CONUS image, and `manifest.json`.

- NOAA GOES19/GOES18: original 1808-square JPEG bytes, without recompression.
- NOAA GOES19 CONUS: original 5000 by 3000 JPEG, with genuine state outlines.
- CIRA Himawari, Meteosat 0 degrees, Meteosat 45.5E: sixteen zoom-2 tiles per
  satellite, stitched and encoded at JPEG quality 93, matching the recovered
  original rendering pipeline.
- `image` is a filename relative to `assets/satellite/manifest.json`.
- CIRA `timestamp` is its metadata capture time. NOAA stable URLs do not expose
  a trustworthy capture timestamp, so `timestamp` is null. Their HTTP
  `Last-Modified` and request `receivedAt` are recorded separately. Neither is
  falsely called the capture time.
- `generatedAt` means manifest assembly time; it does not imply every image
  was refreshed. Each entry has `stale`, `receivedAt`, and its original timestamp.

The browser must retain imagery throughout a flight and switch refreshed
textures between journeys. Do not add new lighting/cloud shading to GeoColor:
its pixels already contain daylight, infrared nighttime clouds, and static
reference city lights. Credit NOAA/CIRA/RAMMB, JMA, and EUMETSAT.

## Failure behavior

Each request has at most two attempts and a twenty-second timeout, within an
overall four-minute budget. Tile requests have at most four concurrent workers.
Images must decode, have the expected dimensions, and contain image variation.
Space-only corner tiles are valid. The completed stitched disk is checked.

Actions restores its last successful satellite cache. On an individual source
failure the script verifies the prior image hash and retains it, marks it stale,
and logs a workflow warning. If no valid prior image exists for a required
source, the run fails and no new Pages deployment occurs. All-source failure
with an existing complete cache can publish the existing image set, explicitly
stale. The manifest is written atomically only after all required images exist.

The cache key rotates hourly. Scheduled images only enter the deployment
artifact/cache, never commits or native APK build triggers. Site assembly uses
`git archive HEAD`, so unrelated local files cannot enter the artifact. It
preserves existing public paths, including the two APK download links.

For an offline replay of an already verified image set:

```
python tools/update-satellite.py --output PREVIEW/assets/satellite --offline-from VERIFIED/assets/satellite
```

Offline copying preserves original timestamps; it does not claim new imagery.

## Required deployment checks

1. Confirm the first workflow completes and that the existing site URL serves
   the intended application commit.
2. Fetch the production manifest and every referenced image, checking hashes
   and dimensions.
3. View North America, Europe, and Asia and a journey across hemispheres. Confirm
   there is no reset to North America, and that cloud/location alignment survives
   the image projection and detail transition.
4. Confirm at least one unattended scheduled run updates image capture times or
   reports retained data correctly before calling the updater operational.
5. Check that the existing APK download URLs still work.
