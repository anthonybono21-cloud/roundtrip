/* Roundtrip's inexpensive, Earth-fixed celestial background.
 * No animation loop, timers, post-processing, remote ephemeris, or scene lights.
 * Call update only when a globe frame will actually be rendered.
 * Positions are approximate visual astronomy, not navigation/observation data.
 */
const DEG = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);
const EARTH_KM = 6371;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// Display scale approved for the travel scene. Orbital positions and solar
// direction remain astronomical; apparent sizes intentionally are not to scale.
export const CELESTIAL_STYLE = Object.freeze({
  moonScale: 4,
  moonEarthshine: 0.028,
  sunScale: 2.25,
  sunPhysicalDiameterDegrees: 0.53,
  sunDiskRadiusUV: 0.2,
  starMinSize: 3.2,
  starMaxSize: 6,
  starMinIntensity: 0.66,
  backgroundStars: 6000
});

export function siderealAngle(date) {
  const days = (+date - J2000) / 86400000;
  return (((280.46061837 + 360.98564736629 * days) % 360) + 360) % 360 * DEG;
}

// Same convention as index.html: (lat=0, lon=0) is +X; east points toward -Z.
export function equatorialDirection(ra, dec, sidereal = 0) {
  const longitude = ra - sidereal;
  return [Math.cos(dec) * Math.cos(longitude), Math.sin(dec), -Math.cos(dec) * Math.sin(longitude)];
}

/* Lunar approximation adapted from SunCalc 1.9.0, moonCoords:
 * https://github.com/mourner/suncalc/blob/v1.9.0/suncalc.js
 * Copyright (c) 2014, Vladimir Agafonkin. All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
export function moonPosition(date) {
  const d = (+date - J2000) / 86400000;
  const anomaly = (134.963 + 13.064993 * d) * DEG;
  const latitudeArgument = (93.272 + 13.229350 * d) * DEG;
  const longitude = (218.316 + 13.176396 * d) * DEG + 6.289 * DEG * Math.sin(anomaly);
  const latitude = 5.128 * DEG * Math.sin(latitudeArgument);
  const obliquity = 23.4397 * DEG;
  const ra = Math.atan2(Math.sin(longitude) * Math.cos(obliquity) - Math.tan(latitude) * Math.sin(obliquity), Math.cos(longitude));
  const dec = Math.asin(Math.sin(latitude) * Math.cos(obliquity) + Math.cos(latitude) * Math.sin(obliquity) * Math.sin(longitude));
  const distanceKm = 385001 - 20905 * Math.cos(anomaly);
  return { ra, dec, distanceKm, direction: equatorialDirection(ra, dec, siderealAngle(date)) };
}

// Pin sky depth to the far boundary. No enlarged far plane or loss of terrain
// depth precision is necessary. Opaque globe geometry naturally occludes it.
const skyDepth = 'gl_Position.z = gl_Position.w;';

export async function createSpaceScene({ THREE, scene, camera }) {
  const group = new THREE.Group();
  group.name = 'roundtrip-celestial-sky';
  scene.add(group);
  let disposed = false;
  let lastAstrometry = -Infinity;
  const sunDirection = new THREE.Vector3(1, 0, 0);
  const towardEarth = new THREE.Vector3();
  const fromTextureMeridian = new THREE.Vector3(1, 0, 0);
  const resources = [];
  const keep = object => (resources.push(object), object);
  const stats = { stars: 0, drawCalls: 2, ephemerisUpdates: 0, moonTexture: 'loading', starCatalog: 'loading', lastUpdate: null,
    moonDisplayScale: CELESTIAL_STYLE.moonScale,
    sunDiameterDegrees: CELESTIAL_STYLE.sunPhysicalDiameterDegrees * CELESTIAL_STYLE.sunScale };
  const starOpacity = { value: 0.88 };
  const dpr = { value: Math.min(globalThis.devicePixelRatio || 1, 2) };

  // A modestly enlarged ~1.19 degree disk, with a warm local glow in the same
  // draw call. Neither the disk nor glow changes the underlying Earth imagery.
  const sunMaterial = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    uniforms: { strength: { value: 1 }, diskRadius: { value: CELESTIAL_STYLE.sunDiskRadiusUV } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);${skyDepth}}`,
    fragmentShader: `varying vec2 vUv; uniform float strength; uniform float diskRadius;
      void main(){
        float r=length(vUv-0.5)*2.0;
        float disk=1.0-smoothstep(diskRadius*0.97,diskRadius,r);
        float outside=max(r-diskRadius,0.0);
        float glow=exp(-outside*8.0)*0.24*(1.0-smoothstep(0.65,1.0,r));
        float alpha=clamp(disk+glow,0.0,1.0)*strength;
        if(alpha<0.002)discard;
        float limb=clamp(r/diskRadius,0.0,1.0);
        vec3 diskColor=mix(vec3(1.0,0.985,0.92),vec3(1.0,0.88,0.62),limb*limb*0.65);
        gl_FragColor=vec4(mix(vec3(1.0,0.70,0.32),diskColor,disk),alpha);
      }`
  }));
  const sun = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), sunMaterial);
  sun.name = 'sun-display-diameter-1.19deg';
  const sunDistance = 80;
  sun.scale.setScalar(2 * sunDistance * Math.tan(stats.sunDiameterDegrees * 0.5 * DEG) / CELESTIAL_STYLE.sunDiskRadiusUV);
  sun.renderOrder = -20;
  sun.frustumCulled = false;
  group.add(sun);

  const moonMaterial = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    uniforms: { sunDirection: { value: sunDirection }, map: { value: null }, hasMap: { value: false }, opacity: { value: 1 }, earthshine: { value: CELESTIAL_STYLE.moonEarthshine } },
    vertexShader: `varying vec2 vUv; varying vec3 vNormal;
      void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);${skyDepth}}`,
    fragmentShader: `varying vec2 vUv; varying vec3 vNormal;
      uniform vec3 sunDirection; uniform sampler2D map; uniform bool hasMap; uniform float opacity; uniform float earthshine;
      void main(){
        vec3 surface=hasMap?texture2D(map,vUv).rgb:vec3(0.48);
        float lit=max(dot(normalize(vNormal),sunDirection),0.0);
        // Gentle earthshine reveals the unlit surface without flattening phase.
        gl_FragColor=vec4(surface*(earthshine+(1.0-earthshine)*sqrt(lit)),opacity);
        #include <colorspace_fragment>
      }`
  }));
  const moon = new THREE.Mesh(keep(new THREE.SphereGeometry(1737.4 / EARTH_KM, 32, 20)), moonMaterial);
  moon.name = 'moon-display-scale-4x';
  moon.scale.setScalar(CELESTIAL_STYLE.moonScale);
  moon.renderOrder = -10;
  moon.frustumCulled = false;
  group.add(moon);

  // Same-origin original NASA LRO map, optional and non-blocking.
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(new URL('./assets/moon-lro.jpg', import.meta.url).href, texture => {
    if (disposed) { texture.dispose(); return; }
    texture.colorSpace = THREE.SRGBColorSpace;
    keep(texture);
    moonMaterial.uniforms.map.value = texture;
    moonMaterial.uniforms.hasMap.value = true;
    stats.moonTexture = 'NASA LRO';
  }, undefined, () => { stats.moonTexture = 'neutral fallback'; });

  let stars = null;
  const fetchController = new AbortController();
  // Do not block the Earth boot on this small optional catalog.
  fetch(new URL('./assets/bright-stars.json', import.meta.url), { signal: fetchController.signal })
    .then(response => { if (!response.ok) throw new Error(`Star catalog HTTP ${response.status}`); return response.json(); })
    .then(catalog => {
      if (disposed) return;
      if (!Array.isArray(catalog.ra) || catalog.ra.length !== catalog.dec?.length || catalog.ra.length !== catalog.mag?.length) throw new Error('Invalid star catalog');
      const positions = [], colors = [], sizes = [], intensities = [];
      const palette = ['#a3bbff', '#bacdff', '#dce5ff', '#f4f3ff', '#fff3d8', '#ffdfb3', '#ffc28b'].map(hex => new THREE.Color(hex));
      for (let i = 0; i < catalog.ra.length; i++) {
        const mag = catalog.mag[i];
        if (!Number.isFinite(mag) || !Number.isFinite(catalog.ra[i]) || !Number.isFinite(catalog.dec[i])) continue;
        positions.push(...equatorialDirection(catalog.ra[i] * DEG, catalog.dec[i] * DEG));
        const color = palette[clamp(catalog.cls?.[i] ?? 4, 0, 6)];
        colors.push(color.r, color.g, color.b);
        // TV-scale exposure: keep the faint catalog members visible beside
        // a bright Earth instead of losing them to subpixel point falloff.
        sizes.push(clamp(5.4 - mag * 0.34, CELESTIAL_STYLE.starMinSize, CELESTIAL_STYLE.starMaxSize));
        intensities.push(clamp(Math.pow(10, -0.035 * (mag - 1)), CELESTIAL_STYLE.starMinIntensity, 1.0));
      }
      // Stable decorative depth between the real catalog stars. Generated once,
      // uniformly across the sphere, in the same buffer and single draw call.
      // These are explicitly scenery, not additional astronomical catalog data.
      let seed = 0x524f554e;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < CELESTIAL_STYLE.backgroundStars; i++) {
        const y = random() * 2 - 1, angle = random() * Math.PI * 2;
        const radius = Math.sqrt(1 - y * y);
        positions.push(radius * Math.cos(angle), y, radius * Math.sin(angle));
        colors.push(0.78, 0.84, 1);
        sizes.push(1.4 + random() * 1.1);
        intensities.push(0.28 + random() * 0.22);
      }
      const geometry = keep(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute('pointSize', new THREE.Float32BufferAttribute(sizes, 1));
      geometry.setAttribute('intensity', new THREE.Float32BufferAttribute(intensities, 1));
      const material = keep(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: true, vertexColors: true, toneMapped: false,
        blending: THREE.AdditiveBlending,
        uniforms: { opacity: starOpacity, pixelRatio: dpr },
        vertexShader: `attribute float pointSize;attribute float intensity;uniform float pixelRatio;
          varying vec3 vColor;varying float vIntensity;
          void main(){vColor=color;vIntensity=intensity;
          // Translation-free view: stars have no artificial near-Earth parallax.
          vec3 direction=mat3(viewMatrix)*mat3(modelMatrix)*position;
          gl_Position=projectionMatrix*vec4(direction,1.0);${skyDepth}
          gl_PointSize=pointSize*pixelRatio;}`,
        fragmentShader: `varying vec3 vColor;varying float vIntensity;uniform float opacity;
          void main(){float radius=length(gl_PointCoord-0.5)*2.0;
          float alpha=(1.0-smoothstep(0.4,1.0,radius))*vIntensity*opacity;
          if(alpha<0.008)discard;gl_FragColor=vec4(vColor,alpha);
          #include <colorspace_fragment>
          }`
      }));
      stars = new THREE.Points(geometry, material);
      stars.name = 'yale-bright-star-catalog';
      stars.renderOrder = -30;
      stars.frustumCulled = false;
      stars.rotation.y = -siderealAngle(Number.isFinite(lastAstrometry) ? lastAstrometry : Date.now());
      group.add(stars);
      stats.stars = positions.length / 3;
      stats.catalogStars = stats.stars - CELESTIAL_STYLE.backgroundStars;
      stats.backgroundStars = CELESTIAL_STYLE.backgroundStars;
      stats.drawCalls = 3;
      stats.starCatalog = 'Yale J2000';
    }).catch(error => { if (!disposed) stats.starCatalog = `unavailable: ${error.message}`; });

  function update(date, solarDirection, altitude = 1) {
    if (disposed) return;
    const timestamp = +date;
    if (!Number.isFinite(timestamp)) return;
    // No GPU draw calls on the final ground approach; fade completes above it.
    group.visible = altitude > 0.002;
    if (!group.visible) return;
    const fade = clamp((altitude - 0.002) / 0.028, 0, 1);
    starOpacity.value = 0.88 * fade;
    sunMaterial.uniforms.strength.value = fade;
    moonMaterial.uniforms.opacity.value = fade;
    if (solarDirection?.lengthSq() > 0) sunDirection.copy(solarDirection).normalize();
    // Sun effectively at infinity. Keep its direction fixed while the observer moves.
    sun.position.copy(camera.position).addScaledVector(sunDirection, sunDistance);
    sun.quaternion.copy(camera.quaternion);
    dpr.value = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (Math.abs(timestamp - lastAstrometry) < 60000) return;
    lastAstrometry = timestamp;
    const lunar = moonPosition(date);
    moon.position.fromArray(lunar.direction).multiplyScalar(lunar.distanceKm / EARTH_KM);
    // Keep the map's 0-degree meridian Earth-facing; libration is not modeled.
    towardEarth.copy(moon.position).normalize().negate();
    moon.quaternion.setFromUnitVectors(fromTextureMeridian, towardEarth);
    if (stars) stars.rotation.y = -siderealAngle(date);
    stats.ephemerisUpdates++;
    stats.lastUpdate = new Date(timestamp).toISOString();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    fetchController.abort();
    group.removeFromParent();
    for (const resource of resources) resource.dispose();
    group.clear();
  }

  return { update, dispose, group, stats };
}
