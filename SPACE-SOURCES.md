# Celestial scene

`space-scene.js` adds a restrained astronomical background to the satellite Earth.

## Integration

```js
import { createSpaceScene } from './space-scene.js';
const sky = await createSpaceScene({ THREE, scene: space, camera: spaceCam });
// After moving the camera, before rendering a visible globe frame:
sky.update(new Date(), sunDir, cameraAltitudeInEarthRadii);
// On teardown:
sky.dispose();
```

Remove the previous star sphere and its per-frame rotation. Do not run sky.update
while a webcam/native map covers the globe. The module has no animation loop,
interval, light objects, bloom pass, or network polling. Three draw calls cover
all 5,080 stars, the Sun, and the Moon. Moon texture and catalog load once, locally,
without blocking Earth initialization. `sky.stats` reports load and update status.

The sky vertex shaders project onto the far depth boundary; leave the globe's
near/far clipping policy alone. They depth-test against the Earth, use transparent
draw ordering (stars, Sun, Moon), and do not write depth. This supports close
terrain without widening the camera's depth range. Objects have frustum culling
disabled because their apparent depth is controlled in the vertex shader.

## Sources and accuracy

- Stars: the project's existing `assets/bright-stars.json`, Yale Bright Star
  Catalogue, magnitude 6 and brighter, equatorial coordinates in J2000. Spectral
  classes map to approximate display colors. One points mesh, no fake twinkling.
  Earth's sidereal rotation is applied. Precession and proper motion are omitted.
- Moon: approximate orbital position and distance adapted from
  [SunCalc 1.9.0](https://github.com/mourner/suncalc/blob/v1.9.0/suncalc.js), itself
  based on [Louis Strous's astronomical formulas](https://aa.quae.nl/en/reken/hemelpositie.html).
  The BSD two-clause notice is retained in the module. Positions update at most
  once per minute of simulated time. Suitable for a background scene, not for
  observation planning or precise eclipse predictions. Lunar libration and axial
  tilt are not modeled; the map's zero meridian remains Earth-facing.
- Moon surface: **NASA's Scientific Visualization Studio**, Ernie Wright;
  [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720), LRO camera imagery. Original
  [2019 1024x512 JPEG](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_1k.jpg)
  saved unchanged as `assets/moon-lro.jpg`. No external texture request at runtime.
- Sun: uses the same supplied solar direction that lights the Earth. The disk
  subtends approximately 0.53 degrees. A small shader glare surrounds it. It does
  not illuminate or recolor the satellite photograph.

Moon radius is 1,737.4 km relative to an Earth radius of 6,371 km. Its distance is
the calculated ~364,000–406,000 km. Neither celestial disk is enlarged for drama.
Stars use display-adjusted intensity so they remain visible beside the globe;
that is an artistic exposure choice, not a camera exposure simulation. No planets,
nebulae, decorative galaxies, lens flares, or invented star motion are added.
The Moon receives phase lighting from the Sun plus a small constant earthshine
term, not an astrophysical reflected-light model.
