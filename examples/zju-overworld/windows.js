/* Standalone opening windows + avatar climb pose. No DOM, downloads or renderer. */

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// Outward offset from the wall, feet origin above floor. The first part lets
// hands find the sill; translation through the wall happens after the leg lift.
export const CLIMB_DURATION = 2.2;
const CLIMB_PATH = [
  [0, -.78, 0], [.12, -.52, 0], [.28, -.45, .28],
  [.40, -.45, .98], [.48, -.13, 1.03], [.64, .42, 1.10], [.83, .88, 1.03], [1, 1.2, .9],
];

function samplePath(progress, sill = 1) {
  const p = clamp01(progress);
  let index = 1;
  while (index < CLIMB_PATH.length - 1 && p > CLIMB_PATH[index][0]) index++;
  const a = CLIMB_PATH[index - 1], b = CLIMB_PATH[index];
  const t = smooth((p - a[0]) / (b[0] - a[0]));
  return { normal: mix(a[1], b[1], t), rise: mix(a[2], b[2], t) * sill };
}

/**
 * Window dimensions include the outer frame. Group uses world axes: +Y up,
 * width along +Z, outward normal side * +X. y is the floor base elevation.
 * The negative-Z leaf slides behind the positive-Z leaf, exposing the left half.
 * blocks() tests a world point/sphere, so pass body midpoint, not feet height.
 * Sill wall and whole-avatar movement collision remain the caller's concern.
 */
export function createWindow(THREE, {
  x = 16, z = 0, y = 0, side = 1, width = 5.4, height = 2, sill = 1,
} = {}) {
  for (const [label, value] of Object.entries({ x, y, z, width, height, sill })) {
    if (!Number.isFinite(value)) throw new TypeError(`Window ${label} must be finite`);
  }
  if (width < 1.8 || height < 1.3 || sill < 0) throw new RangeError('Window needs width >= 1.8, height >= 1.3, sill >= 0');
  side = side < 0 ? -1 : 1;
  const group = new THREE.Group();
  group.name = 'campus-opening-window';
  group.position.set(x, y, z);
  const frame = .095, sashBar = .066, overlap = .035;
  const innerWidth = width - 2 * frame, innerHeight = height - 2 * frame;
  const sashWidth = innerWidth / 2 + overlap;
  const closedMovingZ = -innerWidth / 4 + overlap / 2;
  const fixedZ = innerWidth / 4 - overlap / 2;
  const travel = fixedZ - closedMovingZ;
  const geometries = [], colliders = [];
  const materials = {
    frame: new THREE.MeshStandardMaterial({ color: 0xd3d7cb, roughness: .6, metalness: .2 }),
    track: new THREE.MeshStandardMaterial({ color: 0x687a70, roughness: .54, metalness: .42 }),
    handle: new THREE.MeshStandardMaterial({ color: 0xb49d66, roughness: .42, metalness: .52 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xc6e6e0, transparent: true, opacity: .10, roughness: .12, metalness: .03, depthWrite: false, side: THREE.DoubleSide }),
  };
  function box(parent, name, depth, h, w, px, py, pz, material) {
    const geometry = new THREE.BoxGeometry(depth, h, w);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(px, py, pz);
    mesh.castShadow = material !== materials.glass;
    mesh.receiveShadow = material !== materials.glass;
    if (material === materials.glass) mesh.renderOrder = 2;
    parent.add(mesh);
    return mesh;
  }
  function frameBox(name, d, h, w, px, py, pz, material = materials.frame) {
    const mesh = box(group, name, d, h, w, px, py, pz, material);
    colliders.push({ x: px, y: py, z: pz, hx: d / 2, hy: h / 2, hz: w / 2 });
    return mesh;
  }
  frameBox('outer-sill', .36, frame, width, 0, sill + frame / 2, 0);
  frameBox('outer-head', .21, frame, width, 0, sill + height - frame / 2, 0);
  frameBox('outer-jamb-negative-z', .21, innerHeight, frame, 0, sill + height / 2, -width / 2 + frame / 2);
  frameBox('outer-jamb-positive-z', .21, innerHeight, frame, 0, sill + height / 2, width / 2 - frame / 2);
  // Both rails stay above/below the aperture and inside the outer frame bounds.
  for (const railX of [-.052, .052]) {
    box(group, 'lower-slide-track', .024, .023, innerWidth, railX, sill + frame + .0115, 0, materials.track);
    box(group, 'upper-slide-track', .024, .023, innerWidth, railX, sill + height - frame - .0115, 0, materials.track);
  }
  function makeSash(name, localX, localZ) {
    const leaf = new THREE.Group();
    leaf.name = name;
    leaf.position.set(localX, sill + height / 2, localZ);
    group.add(leaf);
    for (const sign of [-1, 1]) {
      box(leaf, 'sash-vertical-frame', .056, innerHeight, sashBar, 0, 0, sign * (sashWidth - sashBar) / 2, materials.frame);
      box(leaf, 'sash-horizontal-frame', .056, sashBar, sashWidth - 2 * sashBar, 0, sign * (innerHeight - sashBar) / 2, 0, materials.frame);
    }
    box(leaf, 'clear-glazing', .012, innerHeight - 2 * sashBar, sashWidth - 2 * sashBar, 0, 0, 0, materials.glass);
    // A pull handle projects into the room, aligned with the closing stile.
    const handleZ = name === 'moving-sash' ? sashWidth / 2 - .115 : -sashWidth / 2 + .115;
    const handleX = -side * .07;
    box(leaf, 'handle-backplate', .018, .22, .045, -side * .039, 0, handleZ, materials.track);
    box(leaf, 'handle-pull', .035, .16, .035, handleX, 0, handleZ, materials.handle);
    for (const sign of [-1, 1]) box(leaf, 'handle-post', .065, .025, .035, -side * .052, sign * .066, handleZ, materials.handle);
    return leaf;
  }
  const moving = makeSash('moving-sash', -side * .052, closedMovingZ);
  const fixed = makeSash('fixed-sash', side * .052, fixedZ);
  let amount = 0, target = 0, disposed = false;
  const gapMin = -innerWidth / 2;
  const gapMax = fixedZ - sashWidth / 2;
  const gapCenterZ = z + (gapMin + gapMax) / 2;
  const insidePoint = Object.freeze({ x: x - side * .78, y, z: gapCenterZ });
  const outsidePoint = Object.freeze({ x: x + side * 1.2, y: y + .9 * sill, z: gapCenterZ });
  const climbCenter = Object.freeze({ x, z: gapCenterZ });

  const api = {
    group, leaves: [moving, fixed], moving, fixed, x, y, z, side, width, height, sill,
    floorY: y, innerWidth, innerHeight, insidePoint, outsidePoint, climbCenter,
    opening: Object.freeze({ x, minZ: z + gapMin, maxZ: z + gapMax, minY: y + sill + frame + .023, maxY: y + sill + height - frame - .023, width: gapMax - gapMin }),
    get open() { return target === 1; },
    get amount() { return amount; },
    get isPassable() { return amount >= .95; },
    setOpen(value) { if (!disposed) target = value ? 1 : 0; return api; },
    update(dt = 0) {
      if (disposed) return api;
      const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
      // Exponential response is frame-rate independent; no overshoot on reversal.
      amount += (target - amount) * (1 - Math.exp(-delta * 5.7));
      if (Math.abs(target - amount) < .0005) amount = target;
      moving.position.z = closedMovingZ + amount * travel;
      group.userData.windowAmount = amount;
      return api;
    },
    blocks(px, py, pz, radius = .28) {
      if (disposed || ![px, py, pz].every(Number.isFinite)) return false;
      const r = Math.max(0, Number.isFinite(radius) ? radius : 0);
      const lx = px - x, ly = py - y, lz = pz - z;
      const inBox = b => Math.abs(lx - b.x) <= b.hx + r && Math.abs(ly - b.y) <= b.hy + r && Math.abs(lz - b.z) <= b.hz + r;
      if (colliders.some(inBox)) return true;
      for (const leaf of [moving, fixed]) {
        if (inBox({ x: leaf.position.x, y: leaf.position.y, z: leaf.position.z, hx: .029, hy: innerHeight / 2, hz: sashWidth / 2 })) return true;
      }
      return false;
    },
    getClimbWaypoints() {
      return CLIMB_PATH.map(([progress, normal, rise]) => ({ progress, x: x + side * normal, y: y + rise * sill, z: gapCenterZ }));
    },
    getClimbPoint(progress) {
      const point = samplePath(progress, sill);
      return { x: x + side * point.normal, y: y + point.rise, z: gapCenterZ };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      group.removeFromParent();
    },
  };
  group.userData.windowAmount = 0;
  group.userData.isOpeningWindow = true;
  return api;
}

// Columns: p, torso lean, hips lean, left thigh, left knee, right thigh,
// right knee, upper arm, elbow, arm spread. Angles use the real avatar rig's
// downward-rest limbs; negative thigh/upper-arm X lifts them toward +Z.
const POSES = [
  [0, .00, 0, 0, .02, 0, .02, -.06, -.05, .04],
  [.12, .28, 0, -.28, .80, -.10, .12, -.82, -.55, .10],
  [.28, .39, .04, -1.48, 2.55, -.40, .95, -.48, -.30, .10],
  [.48, .53, .07, -1.72, 1.92, -1.16, 1.75, -.80, -.75, .14],
  [.64, .33, .03, -.80, 1.00, -1.67, 1.93, -1.10, -.42, .37],
  [.83, .15, 0, -.30, .47, -.63, .83, -.42, -.34, .42],
  [1, .06, 0, -.10, .15, .08, .12, -.12, -.08, .18],
];

/**
 * Call after updateAvatar(rig, dt, 0, 'idle') during a 2.2s climb. The caller
 * points rig.group +Z outward and moves it along window.getClimbPoint(p).
 * Only joints and motionRoot.position.y change; normal updateAvatar restores
 * these on its next frames. Optional {sill=1} matches a custom window sill.
 * All four createAvatar() variants share this skeleton and are supported.
 */
export function applyClimbPose(rig, progress, { sill = 1 } = {}) {
  if (!rig?.joints || !rig.motionRoot) return rig;
  const p = clamp01(progress), j = rig.joints;
  let index = 1;
  while (index < POSES.length - 1 && p > POSES[index][0]) index++;
  const a = POSES[index - 1], b = POSES[index];
  const t = smooth((p - a[0]) / (b[0] - a[0]));
  const v = a.map((value, i) => mix(value, b[i], t));
  const rotate = (name, rx = 0, ry = 0, rz = 0) => { if (j[name]) j[name].rotation.set(rx, ry, rz); };
  rig.motionRoot.position.y = 0;
  j.torso.scale.y = 1;
  rotate('hips', v[2], 0, 0);
  rotate('torso', v[1], 0, .025 * Math.sin(p * Math.PI * 2));
  rotate('head', -v[1] * .62, 0, 0);
  rotate('upperLegL', v[3], 0, .035 * Math.sin(p * Math.PI));
  rotate('lowerLegL', v[4]);
  rotate('upperLegR', v[5], 0, -.035 * Math.sin(p * Math.PI));
  rotate('lowerLegR', v[6]);
  rotate('footL', -.10 - .16 * Math.sin(p * Math.PI));
  rotate('footR', -.10 - .14 * Math.sin(p * Math.PI));
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1;
    rotate(`upperArm${side}`, v[7], 0, sign * v[9]);
    rotate(`lowerArm${side}`, v[8]);
    rotate(`hand${side}`, -.15, 0, sign * .055);
  }

  // Two-bone reach targets the actual sill during hand placement and pull-up.
  // Shoulder coordinates are read from the posed hierarchy, so leaning does
  // not make the palms float above it. Hands release as the hips clear the sill.
  const contact = smooth((p - .035) / .085) * (1 - smooth((p - .30) / .08));
  if (contact > 0 && rig.group?.worldToLocal) {
    const path = samplePath(p, sill);
    const target = rig.group.position.clone();
    const shoulder = rig.group.position.clone();
    rig.group.updateWorldMatrix(true, true);
    for (const side of ['L', 'R']) {
      const upper = j[`upperArm${side}`], lower = j[`lowerArm${side}`];
      if (!upper || !lower) continue;
      target.set(side === 'L' ? .265 : -.265, sill + .205 - path.rise, -path.normal);
      rig.group.localToWorld(target);
      upper.parent.worldToLocal(target);
      shoulder.copy(upper.position);
      const dy = target.y - shoulder.y, dz = target.z - shoulder.z;
      const l1 = Math.abs(lower.position.y), l2 = Math.abs(j[`hand${side}`].position.y) + .04;
      const d = Math.min(l1 + l2 - .0001, Math.max(Math.abs(l1 - l2) + .0001, Math.hypot(dy, dz)));
      const elbow = -Math.acos(Math.max(-1, Math.min(1, (d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2))));
      const upperAngle = Math.atan2(-dz, -dy) - Math.atan2(l2 * Math.sin(elbow), l1 + l2 * Math.cos(elbow));
      upper.rotation.x = mix(upper.rotation.x, upperAngle, contact);
      upper.rotation.z *= 1 - contact;
      lower.rotation.x = mix(lower.rotation.x, elbow, contact);
      // Flatten palms onto the sill in the forward/up plane.
      j[`hand${side}`].rotation.x = mix(-.15, -Math.PI / 2 - upperAngle - elbow - v[1] - v[2], contact);
    }
  }
  rig.group?.updateWorldMatrix(true, true);
  return rig;
}
