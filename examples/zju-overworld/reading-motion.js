/** Independent, rig-owned animated book. Inject Three.js; no imports or module state. */
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const defaults = { cover: '#668D86', paper: '#F0E7CF', ink: '#82918B',
  cycleDuration: 5.8, flipDuration: 1.35, tilt: -1.03, offset: [0, .22, .315] };

/**
 * Create once per rig; returns the same rig.readingMotion across module URLs.
 * options: cover/paper/ink colours, offset [x,y,z], tilt, cycleDuration,
 * flipDuration, phase (seconds), autoDispose (default true).
 */
export function createReadingMotion(THREE, rig, options = {}) {
  if (!rig?.joints?.torso || !rig.joints.handL || !rig.joints.handR) {
    throw new TypeError('createReadingMotion expects a jointed createAvatar rig');
  }
  if (rig.readingMotion && !rig.readingMotion.disposed) return rig.readingMotion;
  const config = { ...defaults, ...options };
  const flipDuration = clamp(Number(config.flipDuration) || defaults.flipDuration, .45, 3);
  const cycleDuration = Math.max(flipDuration + 1, Number(config.cycleDuration) || defaults.cycleDuration);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, metalness: 0, flatShading: true });
  material.name = 'reading-motion:book-material';
  const group = new THREE.Group();
  group.name = 'reading-motion:book';
  group.userData.readingMotion = true;
  group.position.fromArray(config.offset);
  group.rotation.x = config.tilt;
  rig.joints.torso.add(group);
  const hinge = new THREE.Group();
  hinge.name = 'reading-motion:page-hinge';
  hinge.position.z = .023;
  group.add(hinge);
  const geometries = [];
  const makeBatch = (parts, name, parent, curl = false) => {
    const attributes = { position: [], normal: [], color: [] };
    for (const part of parts) {
      const geometry = new THREE.BoxGeometry(...part.size, ...(part.segments || []));
      const flat = geometry.toNonIndexed();
      flat.translate(...part.position);
      const p = flat.getAttribute('position').array, n = flat.getAttribute('normal').array;
      const color = new THREE.Color(part.color);
      attributes.position.push(...p); attributes.normal.push(...n);
      for (let index = 0; index < p.length / 3; index++) attributes.color.push(color.r, color.g, color.b);
      flat.dispose(); geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, values] of Object.entries(attributes)) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, 3));
    if (curl) {
      // A thin, gently curled solid page with printing on both faces.
      const position = geometry.getAttribute('position');
      for (let index = 0; index < position.count; index++) {
        position.setZ(index, position.getZ(index) + .0045 * Math.sin(clamp(-position.getX(index) / .179) * Math.PI));
      }
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const staticParts = [];
  const box = (parts, size, position, color, segments) => parts.push({ size, position, color, segments });
  // Two separate 12 mm covers and page blocks, with a solid cloth spine.
  box(staticParts, [.022, .26, .026], [0, 0, -.007], config.cover);
  for (const sign of [-1, 1]) {
    box(staticParts, [.183, .257, .012], [sign * .097, 0, -.015], config.cover);
    box(staticParts, [.175, .241, .024], [sign * .094, 0, .003], '#DDD5BB');
    box(staticParts, [.177, .243, .003], [sign * .094, 0, .017], config.paper);
    box(staticParts, [.105, .009, .0015], [sign * .094, .09, .0195], '#6E827C');
    for (let row = 0; row < 6; row++) {
      box(staticParts, [.139 - (row % 3) * .009, .0032, .0015], [sign * .094, .064 - row * .023, .0195], config.ink);
    }
    for (let layer = 0; layer < 3; layer++) {
      box(staticParts, [.176, .0016, .0016], [sign * .094, -.121, -.004 + layer * .007], '#BFC1AC');
    }
  }
  const body = makeBatch(staticParts, 'reading-motion:covers-and-spread', group);
  const leafParts = [];
  box(leafParts, [.179, .239, .0018], [-.0895, 0, 0], config.paper, [8, 1, 1]);
  for (const face of [-1, 1]) {
    box(leafParts, [.103, .008, .001], [-.0895, .089, face * .00155], '#6E827C');
    for (let row = 0; row < 6; row++) {
      box(leafParts, [.137 - (row % 3) * .011, .0031, .001], [-.0895, .063 - row * .023, face * .00155], config.ink, [7, 1, 1]);
    }
  }
  const leaf = makeBatch(leafParts, 'reading-motion:turning-page', hinge, true);
  hinge.visible = false;

  const poseCache = new Map(), applied = new Set(), hiddenProps = new Map();
  const math = { direction: new THREE.Vector3(), unit: new THREE.Vector3(), plane: new THREE.Vector3(),
    elbow: new THREE.Vector3(), forearm: new THREE.Vector3(), rest: new THREE.Vector3(),
    upper: new THREE.Quaternion(), lower: new THREE.Quaternion(), inverse: new THREE.Quaternion(),
    hand: new THREE.Quaternion(), desiredHand: new THREE.Quaternion(), palm: new THREE.Quaternion(),
    euler: new THREE.Euler(), left: new THREE.Vector3(), right: new THREE.Vector3(), grip: new THREE.Vector3(),
    point: new THREE.Vector3() };
  const component = {
    rig, group, hinge, meshes: { body, leaf }, material, geometries,
    elapsed: Number.isFinite(options.phase) ? options.phase : 0,
    turnProgress: 0, turnCount: 0, active: false, disposed: false,
    drawCalls: 2, flipDuration, cycleDuration,
    resetPose() {
      if (this.disposed) return this;
      for (const joint of applied) {
        const pose = poseCache.get(joint);
        if (joint.quaternion.angleTo(pose.after) < 1e-7) joint.quaternion.copy(pose.before);
      }
      applied.clear();
      for (const [prop, saved] of hiddenProps) {
        // Role replacement detaches old groups; never move or resurrect them.
        if (prop.parent && prop.visible === false && rig.roleKey === saved.role && rig.roleAction === saved.action) prop.visible = saved.visible;
      }
      hiddenProps.clear();
      return this;
    },
    update(dt = 0, frame = {}) {
      if (this.disposed) return this;
      this.resetPose();
      this.active = frame.active !== false;
      group.visible = this.active;
      if (!this.active) return this;
      const weight = Number.isFinite(frame.weight) ? clamp(frame.weight) : 1;
      if (weight <= 0) { group.visible = false; return this; }
      const delta = Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
      this.elapsed += delta;
      const phase = ((this.elapsed % cycleDuration) + cycleDuration) % cycleDuration;
      const start = cycleDuration - flipDuration - .4;
      const external = Number.isFinite(frame.progress);
      const progress = external ? clamp(frame.progress) : clamp((phase - start) / flipDuration);
      this.turnProgress = progress;
      this.turnCount = Math.max(0, Math.floor(this.elapsed / cycleDuration));
      const turning = external || (phase >= start && phase < start + flipDuration + .15);
      hinge.visible = turning;
      hinge.rotation.y = smooth(progress) * Math.PI;
      // The turned leaf settles above the left page block instead of curling into it.
      hinge.position.z = .023 + smooth(progress) * .006;
      group.position.fromArray(config.offset);
      group.position.y += Math.sin(this.elapsed * 1.4) * .0015;
      group.updateMatrix();

      // Suppress only exposed role props; no role module imports or ownership changes.
      if (frame.suppressRoleProps !== false) for (const prop of rig.roleGroups || []) {
        if (!/:readingBook$|:handItem$|:basketball$/.test(prop.name)) continue;
        hiddenProps.set(prop, { visible: prop.visible, role: rig.roleKey, action: rig.roleAction });
        prop.visible = false;
      }
      const applyQuaternion = (joint, target) => {
        let saved = poseCache.get(joint);
        if (!saved) { saved = { before: joint.quaternion.clone(), after: joint.quaternion.clone() }; poseCache.set(joint, saved); }
        saved.before.copy(joint.quaternion);
        joint.quaternion.slerp(target, weight);
        saved.after.copy(joint.quaternion); applied.add(joint);
      };
      const solveArm = (side, target, handOrientation) => {
        const upper = rig.joints[`upperArm${side}`], lower = rig.joints[`lowerArm${side}`], hand = rig.joints[`hand${side}`];
        const l1 = lower.position.length(), l2 = hand.position.length();
        math.direction.copy(target).sub(upper.position);
        const distance = clamp(math.direction.length(), .03, l1 + l2 - .001);
        math.direction.normalize();
        const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
        const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
        math.plane.set(side === 'L' ? .38 : -.38, -1, -.12);
        math.plane.addScaledVector(math.direction, -math.plane.dot(math.direction)).normalize();
        math.elbow.copy(math.direction).multiplyScalar(along).addScaledVector(math.plane, height);
        math.rest.copy(lower.position).normalize();
        math.upper.setFromUnitVectors(math.rest, math.unit.copy(math.elbow).normalize());
        math.forearm.copy(math.direction).multiplyScalar(distance).sub(math.elbow);
        math.inverse.copy(math.upper).invert();
        math.forearm.applyQuaternion(math.inverse).normalize();
        math.rest.copy(hand.position).normalize();
        math.lower.setFromUnitVectors(math.rest, math.forearm);
        math.inverse.copy(math.upper).multiply(math.lower).invert();
        math.hand.copy(math.inverse).multiply(handOrientation);
        applyQuaternion(upper, math.upper); applyQuaternion(lower, math.lower); applyQuaternion(hand, math.hand);
      };
      math.left.set(.213, .005, -.012).applyMatrix4(group.matrix);
      math.right.set(-.213, .005, -.012);
      // The right hand catches the near edge, follows the rotating page past the
      // spine, releases it, and comes back; the left hand continues supporting.
      math.grip.set(-.092, .083, .015).applyAxisAngle(math.point.set(0, 1, 0), hinge.rotation.y);
      math.grip.x -= .06; math.grip.z += hinge.position.z;
      const reach = external ? 1 : smooth((phase - (start - .34)) / .34);
      const release = smooth((progress - .57) / .36);
      if (turning || (phase >= start - .34 && phase < start)) math.right.lerp(math.grip, reach * (1 - release));
      math.right.applyMatrix4(group.matrix);
      math.palm.setFromEuler(math.euler.set(0, 0, -Math.PI / 2));
      math.desiredHand.copy(group.quaternion).multiply(math.palm);
      solveArm('L', math.left, math.desiredHand);
      math.palm.setFromEuler(math.euler.set(0, -Math.sin(progress * Math.PI) * .45 * (1 - release), Math.PI / 2));
      math.desiredHand.copy(group.quaternion).multiply(math.palm);
      solveArm('R', math.right, math.desiredHand);
      math.hand.setFromEuler(math.euler.set(.27 + Math.sin(this.elapsed * .8) * .018,
        turning ? -.045 * Math.cos(progress * Math.PI) : Math.sin(this.elapsed * .5) * .02, 0));
      applyQuaternion(rig.joints.head, math.hand);
      rig.group.updateWorldMatrix(true, true);
      return this;
    },
    dispose() {
      if (this.disposed) return;
      this.resetPose(); this.disposed = true; this.active = false;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
      if (rig.readingMotion === this) delete rig.readingMotion;
    },
  };
  group.visible = false;
  rig.readingMotion = component;
  if (config.autoDispose !== false) {
    const previousDispose = rig.dispose;
    let disposedRig = false;
    rig.dispose = function disposeReadingAvatar() {
      if (disposedRig) return;
      disposedRig = true;
      component.dispose();
      if (previousDispose) previousDispose.call(rig);
    };
  }
  return component;
}

export function updateReadingMotion(component, dt = 0, options = {}) { return component?.update(dt, options); }
export function resetReadingPose(component) { return component?.resetPose(); }
export function disposeReadingMotion(component) { return component?.dispose(); }
