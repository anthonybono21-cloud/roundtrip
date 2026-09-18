import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import { CELESTIAL_STYLE, createSpaceScene, equatorialDirection, moonPosition, siderealAngle } from '../space-scene.js';

test('equatorial coordinates use Roundtrip east-negative-Z convention', () => {
  const v = equatorialDirection(Math.PI / 2, 0, 0);
  assert.ok(Math.abs(v[0]) < 1e-12 && Math.abs(v[2] + 1) < 1e-12);
  assert.deepEqual(equatorialDirection(0, 0, 0), [1, 0, -0]);
  assert.ok(Math.abs(siderealAngle(new Date('2000-01-01T12:00:00Z')) * 180 / Math.PI - 280.46061837) < 1e-8);
});

test('Moon remains at physical distance, with seasonal declination and normalized direction', () => {
  for (let month = 0; month < 12; month++) {
    const moon = moonPosition(new Date(Date.UTC(2026, month, 18)));
    assert.ok(moon.distanceKm > 360000 && moon.distanceKm < 410000);
    assert.ok(Math.abs(moon.dec) < 29 * Math.PI / 180);
    assert.ok(Math.abs(Math.hypot(...moon.direction) - 1) < 1e-12);
  }
});

test('resource lifecycle, optional catalog and minute-rate ephemeris without a renderer', async () => {
  const catalog = JSON.parse(await readFile(new URL('../assets/bright-stars.json', import.meta.url)));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => catalog });
  class TextureLoader { load(url, success) { success(new THREE.Texture()); } }
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.00001, 3);
    camera.position.set(2.7, 0, 0);
    camera.lookAt(0, 0, 0);
    const sky = await createSpaceScene({ THREE: { ...THREE, TextureLoader }, scene, camera });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sky.stats.stars, 5080);
    assert.equal(sky.stats.drawCalls, 3);
    const date = new Date('2026-09-18T12:00:00Z'), sun = new THREE.Vector3(1, 0, 0);
    for (let frame = 0; frame < 120; frame++) sky.update(new Date(+date + frame * 16), sun, 1.7);
    assert.equal(sky.stats.ephemerisUpdates, 1);
    const moonMesh = sky.group.getObjectByName('moon-display-scale-4x');
    const solarMesh = sky.group.getObjectByName('sun-display-diameter-1.19deg');
    assert.equal(moonMesh.scale.x, 4);
    assert.equal(moonMesh.scale.y, moonMesh.scale.x);
    assert.equal(moonMesh.scale.z, moonMesh.scale.x);
    // Display enlargement must not move the Moon or change astronomical phase.
    const lunar = moonPosition(date);
    assert.ok(Math.abs(moonMesh.position.length() * 6371 - lunar.distanceKm) < 1e-8);
    assert.ok(moonMesh.position.clone().normalize().distanceTo(new THREE.Vector3(...lunar.direction)) < 1e-12);
    assert.ok(moonMesh.material.uniforms.sunDirection.value.equals(sun));
    const diskWidth = solarMesh.scale.x * solarMesh.material.uniforms.diskRadius.value;
    const solarDistance = solarMesh.position.distanceTo(camera.position);
    const apparentDiameter = 2 * Math.atan(diskWidth / (2 * solarDistance)) * 180 / Math.PI;
    assert.ok(Math.abs(apparentDiameter - 1.1925) < 1e-10);
    assert.ok(solarMesh.position.clone().sub(camera.position).normalize().equals(sun));
    const moonRadius = moonMesh.geometry.parameters.radius * moonMesh.scale.x;
    const moonAngularDiameter = 2 * Math.asin(moonRadius / moonMesh.position.length()) * 180 / Math.PI;
    assert.ok(moonAngularDiameter > 1.9 && moonAngularDiameter < 2.2);
    assert.equal(moonMesh.material.uniforms.earthshine.value, CELESTIAL_STYLE.moonEarthshine);
    assert.ok(CELESTIAL_STYLE.moonEarthshine > 0 && CELESTIAL_STYLE.moonEarthshine < 0.04);
    sky.update(new Date(+date + 60001), sun, 1.7);
    assert.equal(sky.stats.ephemerisUpdates, 2);
    sky.update(new Date(+date + 120001), sun, 0.001);
    assert.equal(sky.group.visible, false);
    assert.equal(sky.stats.ephemerisUpdates, 2);
    assert.equal(camera.far, 3);
    for (const child of sky.group.children) {
      assert.equal(child.material.depthWrite, false);
      assert.equal(child.material.transparent, true);
      assert.equal(child.frustumCulled, false);
    }
    sky.dispose(); sky.dispose();
    assert.equal(scene.children.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
