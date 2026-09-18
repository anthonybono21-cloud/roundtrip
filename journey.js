/* Continuous globe travel. Distances use Earth radii; destination alt uses
 * metres. This module owns no clock, camera, player, or animation loop. Capture
 * the displayed pose when starting/interruption occurs, then sample one plan.
 */
const DEG = Math.PI / 180;
const EARTH_METRES = 6371000;
const clamp01 = value => Math.max(0, Math.min(1, value));
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a, b, t) => a + (b - a) * t;
const mixLook = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) });
const origin = { x: 0, y: 0, z: 0 };
const worldUp = { x: 0, y: 1, z: 0 };
const dot = (a, b) => a.x*b.x+a.y*b.y+a.z*b.z;
const cross = (a, b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const scale = (a, s) => ({x:a.x*s,y:a.y*s,z:a.z*s});
const length = a => Math.hypot(a.x,a.y,a.z);
const normalized = a => scale(a,1/length(a));
function north({lat,lng}) {
  return {x:-Math.sin(lat*DEG)*Math.cos(lng*DEG),y:Math.cos(lat*DEG),z:Math.sin(lat*DEG)*Math.sin(lng*DEG)};
}
function backward(p) {
  const n=unit(p);
  return normalized({x:n.x*p.r-p.look.x,y:n.y*p.r-p.look.y,z:n.z*p.r-p.look.z});
}
function screenUp(up, back) {
  const d=dot(up,back);
  let projected={x:up.x-back.x*d,y:up.y-back.y*d,z:up.z-back.z*d};
  if(length(projected)<1e-9) {
    const basis=Math.abs(back.x)<.8?{x:1,y:0,z:0}:worldUp;
    const k=dot(basis,back);
    projected={x:basis.x-back.x*k,y:basis.y-back.y*k,z:basis.z-back.z*k};
  }
  return normalized(projected);
}
function rotate(v,axis,angle) {
  const c=Math.cos(angle),s=Math.sin(angle),k=dot(axis,v)*(1-c),q=cross(axis,v);
  return {x:v.x*c+q.x*s+axis.x*k,y:v.y*c+q.y*s+axis.y*k,z:v.z*c+q.z*s+axis.z*k};
}
function turn(a,b) {
  const c=cross(a,b),s=length(c),d=Math.max(-1,Math.min(1,dot(a,b)));
  return {axis:s>1e-10?scale(c,1/s):screenUp(worldUp,a),angle:Math.atan2(s,d)};
}
// Transport the starting frame as its view direction changes, then gradually
// correct roll. Computing the signed correction once avoids +/-PI oscillation.
function orientation(start,end,desiredUp=north(end)) {
  const a=backward(start),b=backward(end),up=screenUp(start.up,a),full=turn(a,b);
  const carried=rotate(up,full.axis,full.angle),target=screenUp(desiredUp,b);
  let roll=Math.atan2(dot(b,cross(carried,target)),dot(carried,target));
  if(Math.abs(Math.abs(roll)-Math.PI)<1e-8)roll=Math.PI;
  return p => {
    const back=backward(p.pose),move=turn(a,back);
    return rotate(rotate(up,move.axis,move.angle),back,roll*p.progress);
  };
}

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function radius(value, name) {
  finite(value, name);
  if (value <= 1) throw new RangeError(`${name} must be above the surface`);
  return value;
}
function coordinates(value, name) {
  const lat = finite(value.lat, `${name}.lat`);
  if (Math.abs(lat) > 90) throw new RangeError(`${name}.lat is outside the globe`);
  return { lat, lng: finite(value.lng, `${name}.lng`) };
}
function look(value = origin) {
  return { x: finite(value.x, 'look.x'), y: finite(value.y, 'look.y'), z: finite(value.z, 'look.z') };
}
function pose(value) {
  const p = { ...coordinates(value, 'from'), r: radius(value.r, 'from.r'),
    look: look(value.look), up:look(value.up ?? worldUp), fov: finite(value.fov ?? 38, 'from.fov') };
  if(length(cross(p.up,backward(p)))<1e-9)p.up=screenUp(north(p),backward(p));
  return p;
}
function copy(value) { return { ...value, look: { ...value.look }, up: {...value.up} }; }
function unit({ lat, lng }) {
  const cos = Math.cos(lat * DEG);
  return { x: cos * Math.cos(lng * DEG), y: Math.sin(lat * DEG), z: -cos * Math.sin(lng * DEG) };
}
function height(a, b, t) { return 1 + Math.exp(mix(Math.log(a - 1), Math.log(b - 1), t)); }

// Tangent form avoids the unstable sin(theta) denominator in antipodal slerp.
// Exactly opposite points have many shortest paths; choose one deterministically.
function greatCircle(from, to) {
  const a = unit(from), b = unit(to);
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  let tangent = { x: b.x - a.x * dot, y: b.y - a.y * dot, z: b.z - a.z * dot };
  const length = Math.hypot(tangent.x, tangent.y, tangent.z);
  const angle = Math.atan2(length, dot);
  if (length > 1e-10) {
    tangent = { x: tangent.x / length, y: tangent.y / length, z: tangent.z / length };
  } else if (dot < 0) {
    // Keep an equatorial antipodal trip away from the camera-up pole singularity.
    const basis = Math.abs(a.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    tangent = { x: a.y * basis.z - a.z * basis.y, y: a.z * basis.x - a.x * basis.z, z: a.x * basis.y - a.y * basis.x };
    const n = Math.hypot(tangent.x, tangent.y, tangent.z);
    tangent = { x: tangent.x / n, y: tangent.y / n, z: tangent.z / n };
  }
  return {
    angle,
    transport(up,t) { return rotate(up,normalized(cross(a,tangent)),angle*t); },
    sample(t) {
      if (t <= 0) return { lat: from.lat, lng: from.lng };
      if (t >= 1) return { lat: to.lat, lng: to.lng };
      if (angle < 1e-10) return { lat: from.lat, lng: from.lng };
      const c = Math.cos(angle * t), s = Math.sin(angle * t);
      const x = a.x * c + tangent.x * s;
      const y = a.y * c + tangent.y * s;
      const z = a.z * c + tangent.z * s;
      return { lat: Math.asin(Math.max(-1, Math.min(1, y))) / DEG, lng: Math.atan2(-z, x) / DEG };
    },
  };
}

/** Plan departure from the displayed pose, pan above the globe, then descend.
 * from accepts current look, fov and up, including an interrupted flight pose.
 * Apply the returned up to camera.up before lookAt; fixed world-up flips at poles.
 * to accepts {lat,lng,alt,look,fov?}; alt is metres above the spherical Earth.
 * Optional phase weights control time allocation, not world-space geometry.
 */
export function createJourney({ from, to, restR = 2.7, earthRadius = EARTH_METRES,
  pullbackWeight = 0.3, panWeight = 0.45, descentWeight = 0.55 }) {
  const start = pose(from);
  radius(restR, 'restR');
  finite(earthRadius, 'earthRadius');
  if (earthRadius <= 0 || !Number.isFinite(to.alt) || to.alt <= 0) throw new RangeError('Positive Earth radius and destination altitude required');
  const destination = coordinates(to, 'to');
  const end = { ...destination, r: 1 + to.alt / earthRadius, look: look(to.look ?? unit(destination)), up:look(to.up ?? north(destination)), fov: finite(to.fov ?? 46, 'to.fov') };
  const path = greatCircle(start, end);
  // Also straighten an interrupted view before panning; the first frame remains
  // identical even when its radius already happens to be the resting radius.
  const needsPullback = Math.abs(start.r - restR) > 1e-9 || Math.hypot(start.look.x, start.look.y, start.look.z) > 1e-9 || Math.abs(start.fov - 38) > 1e-9;
  for (const [name, value] of Object.entries({ pullbackWeight, panWeight, descentWeight })) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive`);
  }
  const pull = needsPullback ? pullbackWeight : 0;
  const pan = path.angle > 1e-8 ? panWeight : 0;
  const total = pull + pan + descentWeight;
  const pullbackEnd = pull / total, descentStart = (pull + pan) / total;
  const aboveStart={...start,r:restR,look:{...origin}};
  const pullOrientation=orientation(start,aboveStart);
  const panUp=pull?pullOrientation({pose:aboveStart,progress:1}):screenUp(start.up,unit(start));
  const aboveEnd={...end,r:restR,look:{...origin},up:pan?path.transport(panUp,1):panUp};
  const descentOrientation=orientation(aboveEnd,end,end.up);
  end.up=descentOrientation({pose:end,progress:1});
  return {
    pullbackEnd, descentStart, angle: path.angle,
    sample(progress) {
      const t = clamp01(finite(progress, 'progress'));
      if (t === 0) return copy(start);
      if (t === 1) return copy(end);
      if (t < pullbackEnd) {
        const e = ease(t / pullbackEnd);
        const p={ lat: start.lat, lng: start.lng, r: height(start.r, restR, e), look: mixLook(start.look, origin, e), fov: mix(start.fov, 38, e) };
        return {...p,up:pullOrientation({pose:p,progress:e})};
      }
      if (t < descentStart) {
        const e = ease((t - pullbackEnd) / (descentStart - pullbackEnd));
        return { ...path.sample(e), r: restR, look: { ...origin }, up:path.transport(panUp,e), fov: 38 };
      }
      const e = ease((t - descentStart) / (1 - descentStart));
      const p={ ...destination, r: height(restR, end.r, e), look: mixLook(origin, end.look, e), fov: mix(38, end.fov, e) };
      return {...p,up:descentOrientation({pose:p,progress:e})};
    },
  };
}

/** Rise over the location currently displayed. Pass the actual displayed look
 * target and FOV, not the last destination, when retreat interrupts a flight.
 */
export function createRetreat({ from, restR = 2.7 }) {
  const start = pose(from);
  radius(restR, 'restR');
  const end = { ...start, r: restR, look: { ...origin }, fov: 38 };
  const retreatOrientation=orientation(start,end);
  end.up=retreatOrientation({pose:end,progress:1});
  return {
    sample(progress) {
      const t = clamp01(finite(progress, 'progress'));
      if (t === 0) return copy(start);
      if (t === 1) return copy(end);
      const e = ease(t);
      const p={ lat: start.lat, lng: start.lng, r: height(start.r, restR, e), look: mixLook(start.look, origin, e), fov: mix(start.fov, 38, e) };
      return {...p,up:retreatOrientation({pose:p,progress:e})};
    },
  };
}

export function sampleJourney(options, progress) { return createJourney(options).sample(progress); }
export function sampleRetreat(options, progress) { return createRetreat(options).sample(progress); }
