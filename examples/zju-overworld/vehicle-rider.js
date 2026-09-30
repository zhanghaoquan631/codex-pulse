/**
 * Seat-bound pose controller for createAvatar + createVehicle. No imports.
 * Vehicle front is +Z; seatPositions are cushion references, NOT foot origins.
 * update(dt, speed, travelledMetres) owns the rider pose: do not also call
 * updateAvatar/updateRoleAction while attached. detach()/dispose() restore the
 * supplied rig and release only this controller's assets; the caller owns rig.
 */
const FIT = Object.freeze({
  bicycle: { scale: 1, lean: .78, seatDrop: .0125, seatForward: .035, legs: 1.55 },
  'e-bike': { scale: 1, lean: .40, seatDrop: .0215, seatForward: .025, legs: 1.25 },
  sedan: { scale: .64, lean: .18, seatDrop: .05, seatForward: .045, legs: 1.28, wheel: [-.43, 1.008, .46, .16], floor: .345, footZ: .36 },
  van: { scale: 1, lean: .16, seatDrop: .05, seatForward: .045, legs: 1.08, wheel: [-.43, 1.37, 1.62, .19], floor: .40, footZ: 1.46 },
  shuttle: { scale: 1, lean: .10, seatDrop: .05, seatForward: .04, legs: 1.2, wheel: [-.51, 1.47, 2.47, .20], floor: .50, footZ: 2.38 },
  cart: { scale: .88, lean: .14, seatDrop: .03, seatForward: .035, legs: 1.4, wheel: [-.28, 1.18, .38, .16], floor: .365, footZ: .28 },
});

// Shared between controllers even when callers spread a model into traffic data.
const OCCUPIED = new WeakMap();
const ATTACHED = new WeakMap();

// Replace only the two stock, merged pedal/crank pieces with articulated ones.
// The selection is restricted to their exact spatial region in vehicle-models.
function makePedals(T, vehicle) {
  const body = vehicle.group.children.find(child => child.name === 'Merged body, trim and interior');
  if (!body?.geometry || body.geometry.index) return null;
  const original = body.geometry, p = original.attributes.position, keep = [];
  let removed = 0;
  for (let i = 0; i < p.count; i += 3) {
    let pedal = true;
    for (let k = i; k < i + 3; k++) {
      const x = Math.abs(p.getX(k)), y = p.getY(k), z = p.getZ(k);
      if (x < .088 || x > .225 || y < .220 || y > .462 || z < -.200 || z > .002) pedal = false;
    }
    if (pedal) removed += 3; else keep.push(i, i + 1, i + 2);
  }
  if (!removed) return null;
  const geometry = new T.BufferGeometry();
  for (const [name, attribute] of Object.entries(original.attributes)) {
    const values = new attribute.array.constructor(keep.length * attribute.itemSize);
    for (let n = 0; n < keep.length; n++) for (let j = 0; j < attribute.itemSize; j++) values[n * attribute.itemSize + j] = attribute.array[keep[n] * attribute.itemSize + j];
    geometry.setAttribute(name, new T.BufferAttribute(values, attribute.itemSize, attribute.normalized));
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  body.geometry = geometry;
  const root = new T.Group(); root.name = 'Animated bicycle crank and pedals';
  root.position.set(0, .34, -.10); vehicle.group.add(root);
  const metal = new T.MeshStandardMaterial({ color: '#a9b6b8', roughness: .58, metalness: .14 });
  const rubber = new T.MeshStandardMaterial({ color: '#252c2e', roughness: .85 });
  const radius = Math.hypot(.105, .05), crankGeometry = new T.CylinderGeometry(.012, .012, radius, 6);
  const pedalGeometry = new T.BoxGeometry(.13, .028, .075), pedals = [];
  for (const sign of [1, -1]) {
    const crank = new T.Mesh(crankGeometry, metal);
    crank.position.set(sign * .11, sign * radius / 2, 0); crank.castShadow = true; root.add(crank);
    const pedal = new T.Mesh(pedalGeometry, rubber);
    pedal.position.set(sign * .155, sign * radius, 0); pedal.castShadow = true; root.add(pedal); pedals.push(pedal);
  }
  return { radius, update(phase) { root.rotation.x = phase; for (const pedal of pedals) pedal.rotation.x = -phase; },
    dispose() { root.removeFromParent(); if (body.geometry === geometry) body.geometry = original; geometry.dispose(); crankGeometry.dispose(); pedalGeometry.dispose(); metal.dispose(); rubber.dispose(); } };
}

export function createVehicleRider(THREE, vehicle, rig, options = {}) {
  const T = THREE, type = vehicle?.type === 'ebike' ? 'e-bike' : vehicle?.type, baseFit = FIT[type];
  if (!baseFit || !vehicle?.group || !vehicle.seatPositions?.length || !rig?.group || !rig.joints?.hips) throw new TypeError('createVehicleRider requires a supported vehicle and a jointed campus avatar.');
  const passenger = options.passenger === true;
  const driverIndex = type === 'shuttle' ? vehicle.seatPositions.length - 1 : 0;
  const seatIndex = passenger ? (options.seatIndex ?? (type === 'shuttle' ? 0 : 1)) : driverIndex;
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= vehicle.seatPositions.length || (passenger && seatIndex === driverIndex)) throw new RangeError('Choose an available passenger seat; the driver seat is reserved.');
  if (ATTACHED.has(rig)) throw new Error('This avatar is already attached to a vehicle; detach it first.');
  const occupied = OCCUPIED.get(vehicle.group) || new Map();
  if (occupied.has(seatIndex)) throw new Error(`Vehicle seat ${seatIndex} is already occupied.`);
  const fit = passenger ? { ...baseFit, lean: .025, scale: type === 'shuttle' ? (seatIndex >= 6 ? .63 : .93) : type === 'cart' ? .78 : baseFit.scale, legs: type === 'shuttle' && seatIndex >= 6 ? 1.60 : baseFit.legs } : baseFit;
  const j = rig.joints, root = rig.group;
  for (const name of ['torso', 'head', 'upperArmL', 'lowerArmL', 'handL', 'upperLegL', 'lowerLegL', 'footL', 'upperArmR', 'lowerArmR', 'handR', 'upperLegR', 'lowerLegR', 'footR']) if (!j[name]) throw new TypeError(`Missing rider joint: ${name}`);
  const oldParent = root.parent, snapshots = [];
  root.traverse(object => snapshots.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), visible: object.visible }));
  for (const object of [rig.shadow, rig.groundShadow]) if (object?.isObject3D && !snapshots.some(saved => saved.object === object)) snapshots.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), visible: object.visible });
  const oldDriving = root.userData.vehicleRider;
  const oldPassenger = root.userData.vehiclePassenger;
  const seat = vehicle.seatPositions[seatIndex].clone(), twoWheels = type === 'bicycle' || type === 'e-bike';
  const s = fit.scale, pelvis = rig.meshes?.pelvis;
  pelvis?.geometry.computeBoundingBox();
  const pelvisBottom = pelvis ? pelvis.position.y + pelvis.geometry.boundingBox.min.y * pelvis.scale.y : -.115;
  vehicle.group.add(root); root.rotation.set(0, 0, 0); root.scale.setScalar(s); root.visible = true;
  rig.motionRoot?.position.set(0, 0, 0); rig.motionRoot?.rotation.set(0, 0, 0); rig.motionRoot?.scale.set(1, 1, 1);
  for (const joint of Object.values(j)) { joint.rotation.set(0, 0, 0); joint.scale.set(1, 1, 1); }
  // The service cart has a narrow two-place bench: keep both shoulders inside
  // its cushions while the IK still places the driver's hands on the wheel.
  if (type === 'cart') for (const side of ['L', 'R']) j[`upperArm${side}`].position.x *= .83;
  root.position.set(seat.x, seat.y - fit.seatDrop - s * (j.hips.position.y + pelvisBottom), seat.z + fit.seatForward);
  root.userData.vehicleRider = type;
  if (passenger) root.userData.vehiclePassenger = seatIndex;
  occupied.set(seatIndex, rig); OCCUPIED.set(vehicle.group, occupied); ATTACHED.set(rig, vehicle.group);
  // Ground decals and hand-held action props have no place on a seated rider.
  root.traverse(object => {
    if (/shadow/i.test(object.name) || object.userData?.groundShadow || (object.parent === root && object.geometry?.type === 'CircleGeometry') || /role:.*:(handItem|readingBook|basketball)(:|$)/.test(object.name)) object.visible = false;
  });
  for (const shadow of [rig.shadow, rig.groundShadow]) if (shadow?.isObject3D) shadow.visible = false;
  if (!twoWheels) for (const [name, mesh] of Object.entries(rig.meshes || {})) if (/backpack|bagSeam|^strap|^satchel/i.test(name)) mesh.visible = false;

  const jointSet = new Set(Object.values(j));
  const stretchSegment = (joint, end, factor) => {
    end.position.y *= factor;
    for (const child of joint.children) if (!jointSet.has(child)) { child.position.y *= factor; child.scale.y *= factor; }
  };
  for (const side of ['L', 'R']) {
    stretchSegment(j[`upperLeg${side}`], j[`lowerLeg${side}`], fit.legs);
    stretchSegment(j[`lowerLeg${side}`], j[`foot${side}`], fit.legs);
  }
  const inverseRoot = new T.Matrix4(), rootQuaternion = new T.Quaternion();
  const parentQuaternion = new T.Quaternion(), desired = new T.Quaternion();
  const start = new T.Vector3(), direction = new T.Vector3(), bend = new T.Vector3(), middle = new T.Vector3(), end = new T.Vector3(), segment = new T.Vector3();
  const down = new T.Vector3(0, -1, 0), palmOrientation = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2), footOrientation = new T.Quaternion();
  const palmOffset = new T.Vector3(0, -.039, 0).applyQuaternion(palmOrientation);
  const limbs = ['L', 'R'].map((side, index) => ({ side, sign: index ? -1 : 1,
    arm: j[`upperArm${side}`], forearm: j[`lowerArm${side}`], hand: j[`hand${side}`], thigh: j[`upperLeg${side}`], shin: j[`lowerLeg${side}`], foot: j[`foot${side}`],
    grip: new T.Vector3(), ankle: new T.Vector3(), handTarget: new T.Vector3(), footTarget: new T.Vector3(),
    armPole: new T.Vector3((index ? -1 : 1) * (passenger || type === 'cart' ? .03 : .45), -1, -.12), legPole: new T.Vector3((index ? -1 : 1) * (passenger || type === 'cart' ? .02 : .22), .06, 1),
    armRest: new T.Vector3(), legRest: new T.Vector3(),
  }));
  const fromVehicle = (point, target) => target.copy(point).sub(root.position).multiplyScalar(1 / s);
  const positionInRig = (object, target) => { object.updateWorldMatrix(true, false); return target.setFromMatrixPosition(object.matrixWorld).applyMatrix4(inverseRoot); };
  const orientInRig = (object, orientation) => {
    object.parent.getWorldQuaternion(parentQuaternion);
    parentQuaternion.premultiply(rootQuaternion).invert();
    object.quaternion.copy(parentQuaternion).multiply(orientation);
    object.updateWorldMatrix(false, false);
  };
  const pointSegment = (object, rest, vector) => {
    desired.setFromUnitVectors(rest, vector.normalize()); orientInRig(object, desired);
  };
  const solve = (upper, lower, tip, rest, target, pole, tipOrientation) => {
    positionInRig(upper, start); direction.copy(target).sub(start);
    const a = lower.position.length(), b = tip.position.length(), distance = direction.length();
    if (distance < 1e-7) return;
    direction.multiplyScalar(1 / distance);
    const d = Math.max(Math.abs(a - b) + 1e-5, Math.min(a + b - 1e-5, distance));
    const along = (a * a + d * d - b * b) / (2 * d), height = Math.sqrt(Math.max(0, a * a - along * along));
    bend.copy(pole).addScaledVector(direction, -pole.dot(direction)).normalize();
    middle.copy(start).addScaledVector(direction, along).addScaledVector(bend, height);
    segment.copy(middle).sub(start); pointSegment(upper, down, segment);
    end.copy(start).addScaledVector(direction, d); segment.copy(end).sub(middle);
    pointSegment(lower, rest, segment);
    orientInRig(tip, tipOrientation);
  };
  const pedals = !passenger && type === 'bicycle' ? makePedals(T, vehicle) : null;
  let phase = Math.atan2(.05, .105), elapsed = 0, detached = false;

  function setTargets() {
    for (const limb of limbs) {
      const sign = limb.sign;
      if (passenger) limb.grip.set(seat.x + sign * .15 * s, seat.y + .15 * s, seat.z + .28 * s);
      else if (twoWheels) limb.grip.set(sign * (type === 'bicycle' ? .27 : .29), type === 'bicycle' ? 1.07 : 1.05, type === 'bicycle' ? .43 : .45);
      else limb.grip.set(fit.wheel[0] + sign * fit.wheel[3] * .82, fit.wheel[1] + fit.wheel[3] * .48, fit.wheel[2] - fit.wheel[3] * .48 * Math.sin(.45));
      fromVehicle(limb.grip, limb.handTarget).sub(palmOffset);
      if (passenger) limb.ankle.set(seat.x + sign * .11 * s, fit.floor + .1 * s, seat.z + .38 * s);
      else if (type === 'bicycle') {
        const radius = pedals?.radius || Math.hypot(.105, .05);
        limb.ankle.set(sign * .155, .34 + sign * Math.cos(phase) * radius + .014 + .1 * s, -.10 + sign * Math.sin(phase) * radius - .057 * s);
      } else if (type === 'e-bike') limb.ankle.set(sign * .10, .381 + .1 * s, .10);
      else limb.ankle.set(seat.x + sign * .11 * s, fit.floor + .1 * s, fit.footZ - .057 * s);
      fromVehicle(limb.ankle, limb.footTarget);
    }
  }
  j.torso.rotation.x = fit.lean;
  root.updateWorldMatrix(true, true); inverseRoot.copy(root.matrixWorld).invert(); root.getWorldQuaternion(rootQuaternion).invert();
  setTargets();
  // Chibi arms need a length fit on full-size handlebars; preserve joint widths,
  // the original wardrobe, and all hand geometry while extending the segments.
  for (const limb of limbs) {
    positionInRig(limb.arm, start);
    const reach = start.distanceTo(limb.handTarget), length = limb.forearm.position.length() + limb.hand.position.length();
    const factor = Math.max(1, reach * 1.07 / length);
    stretchSegment(limb.arm, limb.forearm, factor); stretchSegment(limb.forearm, limb.hand, factor);
    limb.armRest.copy(limb.hand.position).normalize(); limb.legRest.copy(limb.foot.position).normalize();
  }

  function update(dt = 0, speed = 0, travelled) {
    if (detached) return rig;
    const delta = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
    elapsed += delta;
    const movement = Number.isFinite(travelled) ? travelled : (Number.isFinite(speed) ? speed : 0) * delta;
    if (type === 'bicycle') phase = (phase + movement / .34 / 2.6) % (Math.PI * 2);
    // Pelvis stays on the cushion; a tiny cycling rock does not drift the rider.
    j.hips.rotation.set(0, 0, type === 'bicycle' && Math.abs(movement) > 1e-6 ? Math.sin(phase) * .012 : 0);
    j.torso.rotation.set(fit.lean, 0, 0); j.torso.scale.set(1, 1, 1);
    j.head.rotation.set(-fit.lean * .78, Math.sin(elapsed * .55) * .018, 0);
    root.updateWorldMatrix(true, false); inverseRoot.copy(root.matrixWorld).invert(); root.getWorldQuaternion(rootQuaternion).invert();
    setTargets();
    for (const limb of limbs) {
      solve(limb.thigh, limb.shin, limb.foot, limb.legRest, limb.footTarget, limb.legPole, footOrientation);
      solve(limb.arm, limb.forearm, limb.hand, limb.armRest, limb.handTarget, limb.armPole, palmOrientation);
    }
    pedals?.update(phase);
    root.updateWorldMatrix(false, true);
    return rig;
  }
  function detach() {
    if (detached) return rig;
    detached = true; pedals?.dispose(); root.removeFromParent();
    for (const saved of snapshots) { saved.object.position.copy(saved.position); saved.object.quaternion.copy(saved.quaternion); saved.object.scale.copy(saved.scale); saved.object.visible = saved.visible; }
    if (oldDriving === undefined) delete root.userData.vehicleRider; else root.userData.vehicleRider = oldDriving;
    if (oldPassenger === undefined) delete root.userData.vehiclePassenger; else root.userData.vehiclePassenger = oldPassenger;
    if (occupied.get(seatIndex) === rig) occupied.delete(seatIndex);
    if (!occupied.size) OCCUPIED.delete(vehicle.group);
    ATTACHED.delete(rig);
    if (oldParent) oldParent.add(root);
    root.updateWorldMatrix(true, true);
    return rig;
  }
  update(0, 0, 0);
  return { rig, seatIndex, seatPosition: seat.clone(), type, passenger, update, detach, dispose: detach };
}
