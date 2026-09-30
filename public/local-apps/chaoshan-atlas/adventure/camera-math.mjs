/**
 * Camera and aiming geometry, independent of Three.js and game state.
 * Boxes use the level schema: centre x/z, width w, depth d, baseY (default 0),
 * height (default 3.5), and optional rotation around Y in radians, matching Three.js.
 * Pass only walls and currently closed doors that
 * should obstruct the camera; this module deliberately does not filter kinds.
 */
const EPSILON = 1e-9;
const CONTACT_GAP = 1e-4;
const AXES = ['x', 'y', 'z'];
const ESCAPE_DIRECTIONS = [
  {x:1,y:0,z:0}, {x:-1,y:0,z:0},
  {x:0,y:1,z:0}, {x:0,y:-1,z:0},
  {x:0,y:0,z:1}, {x:0,y:0,z:-1},
];

function checkPoint(point, name) {
  if (!point || AXES.some(axis => !Number.isFinite(point[axis]))) {
    throw new TypeError(`${name} must contain finite x, y and z coordinates`);
  }
}

function checkPadding(padding) {
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError('padding must be a finite non-negative number');
  }
}

/** Keep a visible body's aim point on the reticle, but converge at body depth.
 * A nearby front face may be above the lower weapon origin even when the
 * reticle points down. Body depth avoids reversing that attack upward.
 */
export function bodyAimDistance(origin, direction, bodyCenter, nearDistance=0) {
  checkPoint(origin,'origin'); checkPoint(direction,'direction'); checkPoint(bodyCenter,'bodyCenter'); checkPadding(nearDistance);
  const length=Math.hypot(direction.x,direction.y,direction.z);
  if(length<EPSILON)return nearDistance;
  const depth=((bodyCenter.x-origin.x)*direction.x+(bodyCenter.y-origin.y)*direction.y+(bodyCenter.z-origin.z)*direction.z)/length;
  return Math.max(nearDistance,depth);
}

function boundsFor(box, padding) {
  const {x, z, w, d, height=3.5, baseY=0, rotation=0} = box;
  if (![x,z,w,d,height,baseY,rotation].every(Number.isFinite) || w < 0 || d < 0 || height < 0) {
    throw new TypeError('box must have finite x/z, non-negative w/d/height and finite baseY');
  }
  return {
    x,z,rotation,
    min: {x:-w/2-padding, y:baseY-padding, z:-d/2-padding},
    max: {x:w/2+padding, y:baseY+height+padding, z:d/2+padding},
  };
}

/** Inverse of a Three.js Y rotation; y is already an absolute world height. */
export function boxLocalPoint(point, box) {
  const angle=box.rotation||0,c=Math.cos(angle),s=Math.sin(angle);
  const dx=point.x-box.x,dz=point.z-box.z;
  return {x:c*dx-s*dz,y:point.y,z:s*dx+c*dz};
}

function contains(point, bounds, strict=false) {
  point=boxLocalPoint(point,bounds);
  return AXES.every(axis => strict
    ? point[axis] > bounds.min[axis]+EPSILON && point[axis] < bounds.max[axis]-EPSILON
    : point[axis] >= bounds.min[axis]-EPSILON && point[axis] <= bounds.max[axis]+EPSILON);
}

// Unclipped ray interval. Keeping the exit lets the camera distinguish moving
// away from a touched face from moving into it. Directions are unit vectors.
function rayInterval(origin, direction, bounds, strict=false) {
  origin=boxLocalPoint(origin,bounds);
  const c=Math.cos(bounds.rotation),s=Math.sin(bounds.rotation);
  direction={x:c*direction.x-s*direction.z,y:direction.y,z:s*direction.x+c*direction.z};
  let enter = -Infinity;
  let exit = Infinity;
  for (const axis of AXES) {
    const position = origin[axis], velocity = direction[axis];
    if (Math.abs(velocity) < EPSILON) {
      if (strict
        ? position <= bounds.min[axis]+EPSILON || position >= bounds.max[axis]-EPSILON
        : position < bounds.min[axis]-EPSILON || position > bounds.max[axis]+EPSILON) return null;
      continue;
    }
    const a = (bounds.min[axis]-position)/velocity;
    const b = (bounds.max[axis]-position)/velocity;
    enter = Math.max(enter, Math.min(a,b));
    exit = Math.min(exit, Math.max(a,b));
    if (strict ? enter >= exit-EPSILON : enter > exit+EPSILON) return null;
  }
  return {enter, exit};
}

/**
 * Distance in metres to the first ray/box contact, or null if no contact lies
 * within maxDistance. direction need not be normalized. An origin inside or
 * on the box returns 0, including a zero-length direction at that point.
 */
export function segmentBoxDistance(origin, direction, box, maxDistance=Infinity, padding=0) {
  checkPoint(origin, 'origin');
  checkPoint(direction, 'direction');
  checkPadding(padding);
  if (maxDistance !== Infinity && (!Number.isFinite(maxDistance) || maxDistance < 0)) {
    throw new RangeError('maxDistance must be non-negative');
  }
  const bounds = boundsFor(box, padding);
  if (contains(origin, bounds)) return 0;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < EPSILON) return null;
  const unit = {x:direction.x/length, y:direction.y/length, z:direction.z/length};
  const hit = rayInterval(origin, unit, bounds);
  if (!hit || hit.exit < 0) return null;
  const distance = Math.max(0, hit.enter);
  return distance <= maxDistance+EPSILON ? Math.min(distance,maxDistance) : null;
}

// A shoulder/eye anchor can already overlap the clearance shell of a wall.
// Find the shortest clear axial escape from the UNION of boxes, so adjoining
// walls cannot bounce the correction back and forth at their shared seam.
function recoverAnchor(anchor, desired, bounds) {
  if (!bounds.some(box => contains(anchor, box, true))) return anchor;
  let best = null;
  const toward = {x:desired.x-anchor.x,y:desired.y-anchor.y,z:desired.z-anchor.z};
  for (const direction of ESCAPE_DIRECTIONS) {
    const intervals = bounds.map(box => rayInterval(anchor,direction,box,true))
      .filter(hit => hit && hit.exit >= 0)
      .sort((a,b) => a.enter-b.enter);
    let distance = 0;
    for (const hit of intervals) {
      if (hit.enter > distance+CONTACT_GAP) break;
      distance = Math.max(distance,hit.exit+CONTACT_GAP);
    }
    const alignment = direction.x*toward.x+direction.y*toward.y+direction.z*toward.z;
    if (!best || distance < best.distance-EPSILON ||
        (Math.abs(distance-best.distance) < EPSILON && alignment > best.alignment)) {
      best = {distance,alignment,point:{
        x:anchor.x+direction.x*distance,
        y:anchor.y+direction.y*distance,
        z:anchor.z+direction.z*distance,
      }};
    }
  }
  return best.point;
}

/**
 * Resolve a third/first-person camera against padded, optionally rotated boxes. padding is a
 * world-space clearance for the near plane (choose it for the camera FOV and
 * near value). A small contact gap avoids resting exactly on a padded face.
 *
 * distance is the actual distance from the ORIGINAL anchor to the result;
 * blocked means the desired endpoint changed. If the anchor is inside a
 * padded box it is first moved to the closest clear axial point, then swept
 * toward desired. That recovery may move the camera off the original segment.
 * Apply position smoothing BEFORE this final collision resolve, never after.
 */
export function resolveCameraPosition(anchor, desired, boxes, padding=0.22) {
  checkPoint(anchor, 'anchor');
  checkPoint(desired, 'desired');
  checkPadding(padding);
  const bounds = boxes.map(box => boundsFor(box,padding));
  const start = recoverAnchor(anchor,desired,bounds);
  const delta = {x:desired.x-start.x,y:desired.y-start.y,z:desired.z-start.z};
  const length = Math.hypot(delta.x,delta.y,delta.z);
  let point = {...start};
  if (length > EPSILON) {
    const unit = {x:delta.x/length,y:delta.y/length,z:delta.z/length};
    let distance = length;
    for (const box of bounds) {
      const hit = rayInterval(start,unit,box,true);
      if (!hit || hit.exit <= EPSILON || hit.enter > length+EPSILON) continue;
      distance = Math.min(distance,Math.max(0,hit.enter-CONTACT_GAP));
    }
    point = {x:start.x+unit.x*distance,y:start.y+unit.y*distance,z:start.z+unit.z*distance};
  }
  return {
    ...point,
    distance:Math.hypot(point.x-anchor.x,point.y-anchor.y,point.z-anchor.z),
    blocked:Math.hypot(point.x-desired.x,point.y-desired.y,point.z-desired.z) > EPSILON,
  };
}
