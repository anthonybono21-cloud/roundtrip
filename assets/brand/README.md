# Roundtrip — Handle Flight

Anthony selected **Handle Flight**, the suitcase and airplane concept. This folder contains that selected identity and its platform exports. The earlier orbit design is not part of this package.

![Handle Flight color logo](handle-flight-color.png)

## Use these masters

| Use | File |
| --- | --- |
| Color mark and wordmark, original stacked arrangement | [handle-flight-color.png](handle-flight-color.png) |
| White mark and wordmark over live video | [handle-flight-white.png](handle-flight-white.png) |
| Color mark alone | [handle-flight-color-mark.png](handle-flight-color-mark.png) |
| White mark alone | [handle-flight-white-mark.png](handle-flight-white-mark.png) |
| Color wordmark alone | [handle-flight-color-wordmark.png](handle-flight-color-wordmark.png) |
| White wordmark alone | [handle-flight-white-wordmark.png](handle-flight-white-wordmark.png) |
| Horizontal color lockup | [handle-flight-color-horizontal.png](handle-flight-color-horizontal.png) |
| Horizontal white lockup | [handle-flight-white-horizontal.png](handle-flight-white-horizontal.png) |

The white PNGs have genuine alpha transparency. Every visible RGB pixel is exactly `#FFFFFF`; antialiasing is carried by alpha. Keep temperature, location, and time as separate app text beside the logo. They are not baked into the artwork.

The supplied wordmark is the selected generated lettering. Do not retype it or substitute the earlier Space Grotesk draft. There is no verified font identity for that lettering. For interface text, keep the app's existing Inter/system sans stack. [Inter](https://github.com/rsms/inter) is available as a free web font.

The identity uses a sampled blue, `#124197`, with a dark backdrop of `#071022` and white `#FFFFFF`. Preserve the color artwork's existing tonal variation. Use white for small text and the video overlay; the blue is the logo accent.

Matching path-based SVGs are provided for the color and white logo, mark, and wordmark, using the same basenames as the six PNGs above.

## Platform files

| Consumer | Files and dimensions |
| --- | --- |
| Browser favicon | `icons/favicon.ico`, containing 16, 32, and 48 px images; matching standalone PNGs are included |
| Apple touch icon | `icons/apple-touch-icon-180.png`, 180 × 180 |
| Web app icons | `icons/icon-192.png` and `icons/icon-512.png` |
| iOS app icon | `icons/ios-1024.png`, 1024 × 1024, opaque square with no rounded corners |
| Android adaptive icon | `icons/android-foreground-432.png` and `icons/android-background-432.png`, each 432 × 432 |
| tvOS layered icon | `tvos/tvos-{size}-{layer}.png`; sizes `1280x768`, `800x480`, `400x240`; layers `back`, `middle`, `front` |
| Fire TV banner | `firetv/firetv-banner-1280x720.png` |
| Fire TV background | `firetv/firetv-background-1920x1080.png` |
| Landscape splash | `splash/splash-dark-1920x1080.png` |
| Portrait splash | `splash/splash-dark-1170x2532.png` |
| Existing native iOS splash slot | `splash/splash-dark-2732x2732.png` |

Small icons use the mark alone. Keep the wordmark in lockups, banners, and splash artwork where it remains readable.

Android's complete visible foreground fits inside a centered 264 px diameter safe circle on the 432 px canvas. This corresponds to the [66 dp safe zone on a 108 dp adaptive layer](https://developer.android.com/codelabs/basic-android-kotlin-compose-training-change-app-icon). Import the full layers without an extra crop.

For tvOS, stack back → middle → front at the matching size in the Xcode image stack. The back layer is opaque; the upper layers contain separate artwork on transparency. See [Apple's layered icon guidance](https://developer.apple.com/library/archive/documentation/General/Conceptual/AppleTV_PG/CreatingParallaxArtwork.html).

The splash artwork is still. Display it while the viewer starts; do not spin the logo or bake a progress indicator into it.

## Sources and verification

The exact selected color and white originals are preserved in `source/`. PNG masters are the reference for the approved appearance. The matching SVGs contain editable paths traced from those masters; they are derived vector exports, not an identified source font. The exporter is `source/generate.py`; the independent package check is `source/verify.py`.

Use Python 3.13 with Pillow and vtracer 0.6.15 to rebuild. The installed vtracer extension crashes under Python 3.14, so the exporter isolates tracing in a compatible interpreter.

From the repository root:

```sh
python -m pip install -r assets/brand/source/requirements.txt
python assets/brand/source/generate.py
python assets/brand/source/verify.py
```

For another working directory, supply absolute script paths. The scripts resolve their image inputs relative to their own location.

[`manifest.json`](manifest.json) lists the files, dimensions, hashes, and package checks. Binary hashes cover exact file bytes; text hashes normalize line endings to LF so Windows and Linux checkouts agree. `source/verification.json` records export details. This is an asset handoff: consumers still need to wire the files into the web viewer and native asset catalogs.

Signed: Codex
