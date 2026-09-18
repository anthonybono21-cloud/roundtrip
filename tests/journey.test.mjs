import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourney, createRetreat } from '../journey.js';
import * as THREE from '../vendor/three.module.js';

const R = 6371000;
const from = { lat: 35, lng: -85, r: 2.7, look: { x: 0, y: 0, z: 0 }, up: {x:0,y:1,z:0}, fov: 38 };
const to = { lat: -33.86, lng: 151.21, alt: 8282, look: { x: -.727, y: -.557, z: -.399 } };
const position = p => {
  const lat = p.lat * Math.PI / 180, lng = p.lng * Math.PI / 180;
  return [Math.cos(lat) * Math.cos(lng) * p.r, Math.sin(lat) * p.r, -Math.cos(lat) * Math.sin(lng) * p.r];
};
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const finite = p => assert.ok([p.lat, p.lng, p.r, p.fov, ...Object.values(p.look), ...Object.values(p.up)].every(Number.isFinite));
function camera(p) {
  const c=new THREE.PerspectiveCamera();
  c.position.fromArray(position(p));c.up.set(p.up.x,p.up.y,p.up.z);
  c.lookAt(p.look.x,p.look.y,p.look.z);
  return c;
}

test('journey endpoints preserve the displayed pose, and pan finishes before descending', () => {
  const flight = createJourney({ from, to });
  assert.deepEqual(flight.sample(0), from);
  const {up,...end}=flight.sample(1);
  assert.deepEqual(end, { lat: to.lat, lng: to.lng, r: 1 + to.alt / R, look: to.look, fov: 46 });
  assert.ok(Object.values(up).every(Number.isFinite));
  assert.equal(flight.sample(flight.descentStart / 2).r, 2.7);
  const descended = flight.sample((1 + flight.descentStart) / 2);
  assert.equal(descended.lat, to.lat);
  assert.equal(descended.lng, to.lng);
  assert.ok(descended.r < 2.7 && descended.r > 1 + to.alt / R);
});

test('interrupt retreat starts at the exact displayed pose and rises over that location', () => {
  const interrupted = createJourney({ from, to }).sample(.73);
  const retreat = createRetreat({ from: interrupted });
  assert.deepEqual(retreat.sample(0), interrupted);
  let previousR = interrupted.r;
  for (let i = 0; i <= 100; i++) {
    const p = retreat.sample(i / 100);
    finite(p);
    assert.equal(p.lat, interrupted.lat);
    assert.equal(p.lng, interrupted.lng);
    assert.ok(p.r >= previousR - 1e-12);
    previousR = p.r;
  }
  const end = retreat.sample(1);
  const next = createJourney({ from: end, to: { ...to, lat: 51.5, lng: -.1 } });
  assert.deepEqual(next.sample(0), end);
});

test('dateline takes the short path and antipodes remain finite and continuous', () => {
  const dateline = createJourney({ from: { ...from, lat: 0, lng: 179 }, to: { ...to, lat: 0, lng: -179 } });
  assert.ok(Math.abs(dateline.angle - 2 * Math.PI / 180) < 1e-12);
  assert.ok(Math.abs(dateline.sample(dateline.descentStart / 2).lng) > 179.99);
  for (const end of [{ lat: 0, lng: 180 }, { lat: 0, lng: 179.9999999 }, { lat: -90, lng: 10 }]) {
    const start = { ...from, lat: end.lat === -90 ? 90 : 0, lng: 0 };
    const flight = createJourney({ from: start, to: { ...to, ...end } });
    let previous = position(flight.sample(0));
    for (let i = 1; i <= 1000; i++) {
      const p = flight.sample(i / 1000);
      finite(p);
      assert.ok(distance(previous, position(p)) < .04, 'no position jump');
      previous = position(p);
    }
  }
});

test('arbitrary low-altitude start pulls out before panning, without mutating inputs', () => {
  const start = Object.freeze({ ...from, r: 1.003, look: Object.freeze({ x: .4, y: .6, z: .3 }), fov: 45 });
  const flight = createJourney({ from: start, to });
  assert.deepEqual(flight.sample(0), start);
  const rise = flight.sample(flight.pullbackEnd / 2);
  assert.equal(rise.lat, start.lat);
  assert.equal(rise.lng, start.lng);
  assert.ok(rise.r > start.r);
  for (const boundary of [flight.pullbackEnd, flight.descentStart]) {
    const before = flight.sample(boundary - 1e-6), after = flight.sample(boundary + 1e-6);
    assert.ok(distance(position(before), position(after)) < 1e-8);
    assert.ok(distance(Object.values(before.look), Object.values(after.look)) < 1e-8);
    assert.ok(Math.abs(before.fov - after.fov) < 1e-8);
  }
  assert.deepEqual(flight.sample(-1), start);
  assert.deepEqual(flight.sample(2), flight.sample(1));
});

test('same location skips the pan; invalid geometry fails explicitly', () => {
  const flight = createJourney({ from, to: { ...to, lat: from.lat, lng: from.lng } });
  assert.equal(flight.descentStart, 0);
  assert.throws(() => createJourney({ from, to: { ...to, alt: 0 } }), RangeError);
  assert.throws(() => createJourney({ from: { ...from, r: 1 }, to }), RangeError);
  assert.throws(() => flight.sample(NaN), TypeError);
});

test('actual Three camera orientation stays continuous through both poles and dateline', () => {
  const routes=[
    [{lat:45,lng:0},{lat:45,lng:180}],
    [{lat:-45,lng:0},{lat:-45,lng:180}],
    [{lat:30,lng:179},{lat:30,lng:-179}],
    [{lat:90,lng:0},{lat:-90,lng:0}],
  ];
  for(const [a,b] of routes) {
    const flight=createJourney({from:{...from,...a},to:{...b,alt:8282}});
    let previous=camera(flight.sample(0));
    for(let i=1;i<=1200;i++) {
      const p=flight.sample(i/1200);finite(p);
      const next=camera(p),delta=previous.quaternion.angleTo(next.quaternion)*180/Math.PI;
      assert.ok(delta<2,`camera rotation jumped ${delta} degrees on ${JSON.stringify(a)}→${JSON.stringify(b)} at ${i}`);
      previous=next;
    }
  }
});

test('a polar pan can be interrupted, retreated and resumed without orientation snap', () => {
  const flight=createJourney({from:{...from,lat:45,lng:0},to:{lat:45,lng:180,alt:8282}});
  const interrupted=flight.sample(flight.descentStart*.65);
  const retreat=createRetreat({from:interrupted});
  assert.deepEqual(retreat.sample(0),interrupted);
  let previous=camera(interrupted);
  for(let i=1;i<=600;i++) {
    const next=camera(retreat.sample(i/600));
    assert.ok(previous.quaternion.angleTo(next.quaternion)*180/Math.PI<2);
    previous=next;
  }
  const end=retreat.sample(1);
  const nextFlight=createJourney({from:end,to:{lat:35,lng:139,alt:8282}});
  assert.deepEqual(nextFlight.sample(0),end);
  assert.ok(previous.quaternion.angleTo(camera(nextFlight.sample(1e-6)).quaternion)<1e-6);
});
