/**
 * Physical room-local lift. Player positions are feet positions, in room space.
 * Keep group at the origin. Apply update().deltaY to the player ONLY when carrying.
 * Static colliders share interiors.js's AABB format; blocks() adds moving geometry.
 * Floor indices are zero-based. All geometry, materials and textures are owned here.
 */
export function createElevator(THREE, { floors = 2, floorHeight = 3.6 } = {}) {
  floors = Math.max(1, Math.floor(Number(floors) || 2));
  if (!Number.isFinite(floorHeight) || floorHeight < 3.05) floorHeight = 3.6;
  const group = new THREE.Group(); group.name = 'physical-elevator';
  const cabin = new THREE.Group(); cabin.name = 'elevator-cabin'; group.add(cabin);
  const cameraMeshes = [], colliders = [], doors = [], buttons = [];
  const geometries = new Set(), materials = new Set(), textures = new Set(), targets = new Set();
  const height = (floors - 1) * floorHeight + 3.05;
  const FRONT = -14.15, CAR_FRONT = -14.28, REAR = -17.6, HALF_OPENING = .76;
  const DOOR_RATE = .78, MAX_SPEED = 1.4, ACCELERATION = .85;
  let y = 0, floor = 0, target = 0, doorAmount = 1, state = 'open';
  let elapsedInside = 0, boarded = false, lastInside = false, lastPosition = null;
  let hold = 0, pending = null, motion = null, tripPassenger = false, disposed = false;
  let clock = 0, lastVisualKey = '';

  const material = (options) => { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; };
  const steel = material({ color: 0x9baaa9, metalness: .82, roughness: .3 });
  const satin = material({ color: 0xc5cecb, metalness: .65, roughness: .36 });
  const dark = material({ color: 0x253b3b, metalness: .68, roughness: .3 });
  const trim = material({ color: 0xd1c29c, metalness: .75, roughness: .27 });
  const wall = material({ color: 0xbfc6c1, metalness: .35, roughness: .43 });
  const stone = material({ color: 0xc8c6b6, roughness: .82 });
  const black = material({ color: 0x112624, roughness: .38 });
  const light = material({ color: 0xf6f8e9, emissive: 0xf6f8e9, emissiveIntensity: 2.3, roughness: .4 });
  const green = material({ color: 0x79e4bd, emissive: 0x5fe6af, emissiveIntensity: .8, roughness: .35 });
  const amber = material({ color: 0xf4d18a, emissive: 0xe5af48, emissiveIntensity: .7, roughness: .35 });
  function ownGeometry(g) { geometries.add(g); return g; }
  function mesh(parent, geometry, mat, x, yy, z, name = '') {
    const m = new THREE.Mesh(ownGeometry(geometry), mat); m.position.set(x, yy, z);
    m.name = name; m.castShadow = true; m.receiveShadow = true; m.userData.elevatorOwned = true;
    parent.add(m); cameraMeshes.push(m); return m;
  }
  function box(parent, w, h, d, x, yy, z, mat, name = '', solid = false) {
    const m = mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, yy, z, name);
    if (solid) colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, minY: yy - h / 2, maxY: yy + h / 2, elevator: true });
    return m;
  }
  function tube(parent, a, b, radius, mat, name) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), length = av.distanceTo(bv);
    const m = mesh(parent, new THREE.CylinderGeometry(radius, radius, length, 10), mat, 0, 0, 0, name);
    m.position.copy(av).add(bv).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.sub(av).normalize()); return m;
  }
  function label(parent, text, x, yy, z, w, h, options = {}) {
    let canvas = null, ctx = null, texture = null;
    if (typeof document !== 'undefined' && document.createElement) {
      canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.max(96, Math.round(512 * h / w));
      ctx = canvas.getContext('2d');
      if (ctx) { texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture); }
    }
    const mat = new THREE.MeshBasicMaterial({ color: texture ? 0xffffff : (options.color || 0xbcf1d8), map: texture, side: THREE.DoubleSide }); materials.add(mat);
    const m = mesh(parent, new THREE.PlaneGeometry(w, h), mat, x, yy, z, 'label-' + text);
    m.rotation.y = options.rotation || 0; m.castShadow = false; m.receiveShadow = false;
    let previous = null;
    function write(value) {
      m.userData.text = String(value); if (previous === value) return; previous = value;
      if (!ctx) return;
      ctx.fillStyle = options.background || '#17332f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = options.color || '#b9f5d5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(canvas.height * (options.fontScale || .6))}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(String(value), canvas.width / 2, canvas.height / 2, canvas.width * .94); texture.needsUpdate = true;
    }
    write(text); return { mesh: m, write, texture };
  }

  // Enclosed shaft; the existing room slab must have a matching 3.5 × 3.8 m hole.
  for (const sign of [-1, 1]) {
    box(group, .16, height, 3.72, sign * 1.67, height / 2, -16.06, dark, 'shaft-side', true);
    tube(group, [sign * 1.56, .1, -17.48], [sign * 1.56, height - .1, -17.48], .035, steel, 'guide-rail');
  }
  box(group, 3.5, height, .15, 0, height / 2, -17.865, dark, 'shaft-back', true);
  box(group, 3.5, .12, 3.8, 0, -.15, -16.1, dark, 'shaft-pit');

  function doorPair(parent, yy, z, prefix) {
    const doorGroup = new THREE.Group(); doorGroup.name = prefix; parent.add(doorGroup);
    const leaves = [-1, 1].map(sign => {
      const leaf = new THREE.Group(); doorGroup.add(leaf);
      box(leaf, HALF_OPENING, 2.36, .065, 0, yy + 1.19, z, steel, prefix + '-leaf');
      for (const xx of [-.355, .355]) box(leaf, .013, 2.3, .01, xx, yy + 1.19, z + .038, trim, 'door-edge');
      // Brushed vertical inlays remain attached to their own sliding leaf.
      for (const xx of [-.22, .22]) box(leaf, .008, 2.25, .005, xx, yy + 1.19, z + .036, satin, 'brushed-inlay');
      leaf.userData.sign = sign; return leaf;
    });
    return { group: doorGroup, left: leaves[0], right: leaves[1], leaves, doorAmount: 0, y: yy };
  }

  for (let i = 0; i < floors; i++) {
    const fy = i * floorHeight;
    const landing = new THREE.Group(); landing.name = `elevator-landing-${i + 1}`; group.add(landing);
    // Facing is inside the shaft footprint and never projects into adjacent classrooms.
    for (const sign of [-1, 1]) {
      box(landing, .82, 2.48, .18, sign * 1.17, fy + 1.24, FRONT - .05, satin, 'landing-jamb', true);
      box(landing, .07, 2.48, .23, sign * .797, fy + 1.24, FRONT + .005, trim, 'door-surround');
      box(landing, .15, floorHeight, .18, sign * 1.665, fy + floorHeight / 2, FRONT - .05, wall, 'shaft-front-edge', true);
    }
    box(landing, 3.2, floorHeight - 2.44, .2, 0, fy + (floorHeight + 2.44) / 2, FRONT - .05, satin, 'landing-header', true);
    box(landing, 1.6, .045, .24, 0, fy + 2.405, FRONT, trim, 'door-header-trim');
    box(landing, 1.63, .035, .29, 0, fy - .022, FRONT + .08, steel, 'landing-sill');
    for (const zz of [-.01, .07, .15]) box(landing, 1.54, .005, .012, 0, fy + .002, FRONT + zz, dark, 'sill-track');
    const pair = doorPair(landing, fy, FRONT, `landing-doors-${i + 1}`);
    pair.floor = i; pair.group = landing;
    pair.display = label(landing, '1F', 0, fy + 2.7, FRONT + .063, .8, .27);
    label(landing, `${i + 1}F`, -1.19, fy + 2.04, FRONT + .051, .38, .31, { background: '#aebbb5', color: '#284641' });
    const callPlate = box(landing, .22, .51, .035, 1.21, fy + 1.24, FRONT + .068, dark, 'landing-call-panel');
    const callButton = mesh(landing, new THREE.CylinderGeometry(.059, .059, .017, 20), trim, 1.21, fy + 1.22, FRONT + .095, 'call-button'); callButton.rotation.x = Math.PI / 2;
    callButton.userData.elevatorAction = { type: 'call', floor: i }; callPlate.userData.elevatorAction = callButton.userData.elevatorAction;
    label(landing, '↕', 1.21, fy + 1.22, FRONT + .106, .084, .086, { background: '#cabc99', color: '#24463b' });
    pair.callLight = box(landing, .07, .019, .01, 1.21, fy + 1.4, FRONT + .09, green, 'call-indicator');
    doors.push(pair);
  }

  // The main car is 3 × 3 × 2.9 m, plus its short entrance sill/throat.
  box(cabin, 3, .13, 3, 0, -.065, -16.1, steel, 'car-platform');
  box(cabin, 2.86, .019, 2.83, 0, .011, -16.09, stone, 'car-stone-floor');
  box(cabin, 2.92, .13, .47, 0, -.065, -14.37, steel, 'car-entrance-platform');
  for (const sign of [-1, 1]) {
    box(cabin, .095, 2.9, 3, sign * 1.455, 1.45, -16.1, wall, 'cabin-side-wall');
    box(cabin, .095, 2.9, .48, sign * 1.455, 1.45, -14.36, satin, 'cabin-door-return');
    box(cabin, .016, .14, 3.25, sign * 1.398, .12, -15.98, dark, 'car-kickplate');
    for (const zz of [-17.07, -16.04, -15.06]) box(cabin, .012, 2.56, .018, sign * 1.399, 1.42, zz, steel, 'wall-panel-seam');
    tube(cabin, [sign * 1.315, 1.0, -17.2], [sign * 1.315, 1.0, -14.91], .032, trim, 'side-handrail');
    for (const zz of [-16.98, -15.08]) tube(cabin, [sign * 1.395, 1, zz], [sign * 1.315, 1, zz], .022, steel, 'handrail-bracket');
  }
  box(cabin, 3, 2.9, .095, 0, 1.45, REAR + .0475, wall, 'cabin-back-wall');
  box(cabin, 2.85, .14, .015, 0, .12, REAR + .103, dark, 'rear-kickplate');
  tube(cabin, [-1.25, 1, -17.36], [1.25, 1, -17.36], .032, trim, 'rear-handrail');
  for (const xx of [-1.02, 1.02]) tube(cabin, [xx, 1, -17.49], [xx, 1, -17.36], .022, steel, 'rear-handrail-bracket');
  box(cabin, 3, .10, 3.45, 0, 2.85, -15.88, steel, 'cabin-ceiling');
  box(cabin, 2.48, .03, 2.22, 0, 2.789, -16.03, satin, 'ceiling-inset');
  for (const xx of [-1.16, 1.16]) box(cabin, .08, .021, 2.56, xx, 2.765, -16.03, light, 'ceiling-light-strip');
  box(cabin, 1.0, .025, .72, 0, 2.756, -16.02, light, 'ceiling-light');
  const lamp = new THREE.PointLight(0xfff2d7, 7, 5.5, 2); lamp.position.set(0, 2.5, -16.1); cabin.add(lamp);
  for (let i = -4; i <= 4; i++) box(cabin, .045, .012, .24, i * .105, 2.765, -17.22, dark, 'ceiling-vent');

  // A real planar rear mirror, with a satin fallback on renderers without targets.
  box(cabin, 2.24, 1.33, .026, 0, 1.9, -17.491, trim, 'mirror-frame');
  const mirrorFallback = material({ color: 0xc6ddd8, metalness: 1, roughness: .025, envMapIntensity: 1.6 });
  const mirror = mesh(cabin, new THREE.PlaneGeometry(2.17, 1.26), mirrorFallback, 0, 1.9, -17.474, 'rear-mirror');
  mirror.castShadow = false;
  if (THREE.WebGLRenderTarget && THREE.ShaderMaterial) {
    const renderTarget = new THREE.WebGLRenderTarget(384, 256); targets.add(renderTarget);
    const textureMatrix = new THREE.Matrix4();
    const mirrorMat = new THREE.ShaderMaterial({
      uniforms: { reflection: { value: renderTarget.texture }, textureMatrix: { value: textureMatrix }, ready: { value: 0 } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 mirrorUv; void main(){ mirrorUv=textureMatrix*modelMatrix*vec4(position,1.0); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D reflection; uniform float ready; varying vec4 mirrorUv; void main(){ vec3 reflected=texture2DProj(reflection,mirrorUv).rgb; gl_FragColor=vec4(mix(vec3(.61,.73,.70),reflected*.86+vec3(.035,.052,.047),ready),1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }'
    }); materials.add(mirrorMat); mirror.material = mirrorMat;
    const reflectedCamera = new THREE.PerspectiveCamera(), normal = new THREE.Vector3(), mirrorWorld = new THREE.Vector3(), cameraWorld = new THREE.Vector3();
    const direction = new THREE.Vector3(), up = new THREE.Vector3(), clip = new THREE.Vector4(), q = new THREE.Vector4(), plane = new THREE.Plane();
    let reflecting = false, lastReflection = -1;
    mirror.onBeforeRender = (renderer, scene, camera) => {
      if (disposed || reflecting || !camera.isPerspectiveCamera || !renderer.setRenderTarget || clock - lastReflection < .075) return;
      normal.set(0, 0, 1).transformDirection(mirror.matrixWorld); mirrorWorld.setFromMatrixPosition(mirror.matrixWorld); cameraWorld.setFromMatrixPosition(camera.matrixWorld);
      if (direction.subVectors(cameraWorld, mirrorWorld).dot(normal) <= 0 || cameraWorld.distanceTo(mirrorWorld) > 12) return;
      reflectedCamera.position.copy(cameraWorld).addScaledVector(normal, -2 * direction.dot(normal));
      camera.getWorldDirection(direction); direction.reflect(normal); up.set(0, 1, 0).transformDirection(camera.matrixWorld).reflect(normal);
      reflectedCamera.up.copy(up); reflectedCamera.lookAt(direction.add(reflectedCamera.position));
      reflectedCamera.near = camera.near; reflectedCamera.far = camera.far; reflectedCamera.projectionMatrix.copy(camera.projectionMatrix); reflectedCamera.updateMatrixWorld();
      textureMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(reflectedCamera.projectionMatrix).multiply(reflectedCamera.matrixWorldInverse);
      plane.setFromNormalAndCoplanarPoint(normal, mirrorWorld).applyMatrix4(reflectedCamera.matrixWorldInverse); clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pm = reflectedCamera.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + pm[8]) / pm[0], (Math.sign(clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]); clip.multiplyScalar(2 / clip.dot(q));
      pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1 - .002; pm[14] = clip.w;
      const oldTarget = renderer.getRenderTarget(), oldXR = renderer.xr.enabled, oldShadow = renderer.shadowMap.autoUpdate;
      const oldViewport = renderer.getViewport(new THREE.Vector4()), oldScissor = renderer.getScissor(new THREE.Vector4()), oldScissorTest = renderer.getScissorTest();
      try {
        reflecting = true; mirror.visible = false; renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(renderTarget); renderer.setScissorTest(false); renderer.clear(); renderer.render(scene, reflectedCamera);
        mirrorMat.uniforms.ready.value = 1; lastReflection = clock;
      } finally {
        mirror.visible = true; reflecting = false; renderer.xr.enabled = oldXR; renderer.shadowMap.autoUpdate = oldShadow;
        renderer.setRenderTarget(oldTarget); renderer.setViewport(oldViewport); renderer.setScissor(oldScissor); renderer.setScissorTest(oldScissorTest);
      }
    };
  }

  // Car doors travel with the car; outer landing doors stay at their floor.
  for (const sign of [-1, 1]) box(cabin, .67, 2.9, .1, sign * 1.115, 1.45, CAR_FRONT - .055, satin, 'car-front-return');
  box(cabin, 1.58, .39, .1, 0, 2.605, CAR_FRONT - .055, steel, 'car-door-header');
  const carDoors = doorPair(cabin, 0, CAR_FRONT, 'car-doors');
  const cabinDisplay = label(cabin, '1F', 0, 2.605, CAR_FRONT - .112, .68, .22, { rotation: Math.PI });
  label(cabin, '求是 · 电梯', -.95, 2.54, CAR_FRONT - .112, .58, .17, { rotation: Math.PI, background: '#aab9b2', color: '#284841' });
  label(cabin, '限载 8 人 / 630 kg', 0, .51, -17.487, 1.35, .14, { background: '#acbdb6', color: '#28453d' });
  box(cabin, .5, 1.54, .035, 1.065, 1.35, CAR_FRONT - .117, dark, 'car-control-panel');
  const panelDisplay = label(cabin, '1F', 1.065, 1.94, CAR_FRONT - .141, .32, .16, { rotation: Math.PI });
  // Up to 3 columns keeps all floor buttons inside the physical plate.
  const columns = floors > 8 ? 3 : floors > 4 ? 2 : 1, rows = Math.ceil(floors / columns), spacingY = Math.min(.16, .94 / Math.max(1, rows));
  for (let i = 0; i < floors; i++) {
    const xx = 1.065 + ((i % columns) - (columns - 1) / 2) * .135, yy = 1.72 - Math.floor(i / columns) * spacingY;
    const button = mesh(cabin, new THREE.CylinderGeometry(.047, .047, .012, 20), trim, xx, yy, CAR_FRONT - .15, `floor-button-${i + 1}`); button.rotation.x = Math.PI / 2;
    const face = label(cabin, String(i + 1), xx, yy, CAR_FRONT - .159, .065, .065, { rotation: Math.PI, background: '#cabc99', color: '#24463b', fontScale: .72 });
    button.userData.elevatorAction = face.mesh.userData.elevatorAction = { type: 'floor', floor: i }; buttons.push({ mesh: button, label: face, floor: i });
  }
  for (const [xx, text, action] of [[.956, '◀▶', 'open'], [1.177, '▶◀', 'close']]) {
    const button = box(cabin, .155, .10, .016, xx, .69, CAR_FRONT - .15, trim, 'door-' + action + '-button');
    const face = label(cabin, text, xx, .69, CAR_FRONT - .162, .137, .07, { rotation: Math.PI, background: '#cabc99', color: '#24463b', fontScale: .62 });
    button.userData.elevatorAction = face.mesh.userData.elevatorAction = { type: action }; buttons.push({ mesh: button, label: face, action });
  }

  const validFloor = i => Number.isInteger(i) && i >= 0 && i < floors;
  function containsCabin(p) {
    return !!p && Math.abs(p.x) <= 1.28 && p.z >= -17.32 && p.z <= -14.61 && p.y >= y - .18 && p.y <= y + 1.1;
  }
  function atThreshold(p) {
    return !!p && Math.abs(p.y - y) < 1.2 && Math.abs(p.x) < 1.05 && p.z > -14.65 && p.z < -13.79;
  }
  function startTrip() {
    if (pending === null || pending.floor === floor || doorAmount !== 0) return false;
    if (pending.mode === 'cabin' && !lastInside) { pending = null; target = floor; return false; }
    target = pending.floor;
    const distance = Math.abs(target * floorHeight - y), ramp = Math.min(MAX_SPEED / ACCELERATION, Math.sqrt(distance / ACCELERATION));
    const peak = ACCELERATION * ramp, cruise = Math.max(0, (distance - ACCELERATION * ramp * ramp) / peak);
    motion = { start: y, distance, direction: Math.sign(target * floorHeight - y), ramp, peak, cruise, duration: 2 * ramp + cruise, elapsed: 0 };
    tripPassenger = lastInside; pending = null; state = 'moving'; return true;
  }
  function openDoor() {
    if (disposed || state === 'moving') return false;
    pending = null; target = floor; hold = 3.2; state = doorAmount === 1 ? 'open' : 'opening'; return true;
  }
  function closeDoor() {
    if (disposed || state === 'moving') return false;
    hold = 0; state = atThreshold(lastPosition) ? 'opening' : (doorAmount === 0 ? 'ready' : 'closing'); return true;
  }
  function requestFloor(index) {
    if (disposed || !validFloor(index) || state === 'moving' || !containsCabin(lastPosition)) return false;
    if (index === floor) return openDoor();
    target = index; pending = { floor: index, mode: 'cabin' }; boarded = true; hold = 0;
    state = atThreshold(lastPosition) ? 'opening' : (doorAmount === 0 ? 'ready' : 'closing'); return true;
  }
  function call(index) {
    if (disposed || !validFloor(index)) return false;
    if (state === 'moving') return !tripPassenger && target === index;
    if (index === floor) return openDoor();
    if (lastInside || boarded) return false;
    target = index; pending = { floor: index, mode: 'call' }; hold = 0;
    state = atThreshold(lastPosition) ? 'opening' : (doorAmount === 0 ? 'ready' : 'closing'); return true;
  }
  function updateVisuals() {
    cabin.position.y = y;
    function setPair(pair, amount) {
      pair.doorAmount = amount;
      for (const leaf of pair.leaves) leaf.position.x = leaf.userData.sign * (HALF_OPENING / 2 + amount * HALF_OPENING);
    }
    setPair(carDoors, doorAmount);
    for (const door of doors) setPair(door, door.floor === floor && state !== 'moving' ? doorAmount : 0);
    const shownFloor = state === 'moving' ? Math.round(y / floorHeight) : floor;
    const arrow = state === 'moving' ? motion.direction > 0 ? ' ↑' : ' ↓' : '';
    const displayText = `${shownFloor + 1}F${arrow}`, key = `${displayText}:${target}:${state}`;
    if (key !== lastVisualKey) {
      lastVisualKey = key; cabinDisplay.write(displayText); panelDisplay.write(displayText);
      for (const door of doors) { door.display.write(displayText); door.callLight.material = (state === 'moving' && door.floor === target) ? amber : green; }
      for (const b of buttons) if (b.floor !== undefined) b.mesh.material = (target === b.floor && (state === 'moving' || pending)) ? amber : trim;
    }
  }
  function update(dt, playerPosition) {
    if (disposed) return { deltaY: 0, carrying: false, inCabin: false, state: 'disposed', floor, target, y, doorAmount };
    const duration = Math.max(0, Math.min(.5, Number(dt) || 0)), oldY = y;
    let carried = false, remaining = duration;
    if (playerPosition) lastPosition = { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z };
    else lastPosition = null;
    // Substeps keep the safety beam and motion transitions independent of frame rate.
    do {
      const step = Math.min(1 / 60, remaining); remaining -= step; clock += step; hold = Math.max(0, hold - step);
      const p = lastPosition && { ...lastPosition, y: lastPosition.y + (carried || tripPassenger ? y - oldY : 0) };
      lastInside = containsCabin(p);
      if (state === 'moving') {
        carried = carried || tripPassenger;
        motion.elapsed = Math.min(motion.duration, motion.elapsed + step);
        const t = motion.elapsed;
        let distance;
        if (t < motion.ramp) distance = .5 * ACCELERATION * t * t;
        else if (t < motion.ramp + motion.cruise) distance = .5 * ACCELERATION * motion.ramp * motion.ramp + motion.peak * (t - motion.ramp);
        else distance = motion.distance - .5 * ACCELERATION * (motion.duration - t) ** 2;
        y = motion.start + motion.direction * distance;
        if (t >= motion.duration) {
          y = target * floorHeight; floor = target; motion = null; state = 'opening'; hold = 4;
          elapsedInside = 0; boarded = false; tripPassenger = false;
        }
      } else {
        if (lastInside) { elapsedInside += step; if (elapsedInside >= .4) boarded = true; }
        else { elapsedInside = 0; boarded = false; if (pending?.mode === 'cabin' && !atThreshold(p)) { pending = null; target = floor; } }
        if (state === 'closing' && atThreshold(p)) { state = 'opening'; hold = .9; }
        if (state === 'opening') { doorAmount = Math.min(1, doorAmount + DOOR_RATE * step); if (doorAmount >= 1) state = 'open'; }
        else if (state === 'closing') { doorAmount = Math.max(0, doorAmount - DOOR_RATE * step); if (doorAmount <= 0) state = 'ready'; }
        else if (state === 'open' && hold <= 0 && !atThreshold(p) && (pending || boarded)) state = 'closing';
        if (state === 'ready' && pending) startTrip();
      }
    } while (remaining > 1e-8);
    if (lastPosition && carried) lastPosition.y += y - oldY;
    lastInside = containsCabin(lastPosition); updateVisuals();
    return { deltaY: y - oldY, carrying: carried || lastInside, inCabin: lastInside, state, floor, target, y, doorAmount };
  }

  function blocks(x, feetY, z, radius = .27, bodyHeight = 1.7) {
    if (disposed) return false;
    const hit = (x0, x1, z0, z1, minY, maxY) => feetY + bodyHeight > minY + .025 && feetY < maxY - .025 && x > x0 - radius && x < x1 + radius && z > z0 - radius && z < z1 + radius;
    for (const c of colliders) if (hit(c.x0, c.x1, c.z0, c.z1, c.minY, c.maxY)) return true;
    if (feetY + bodyHeight > y + .03 && feetY < y + 2.9) {
      if (hit(-1.51, -1.405, -17.6, -14.12, y, y + 2.9) || hit(1.405, 1.51, -17.6, -14.12, y, y + 2.9) || hit(-1.5, 1.5, -17.6, -17.495, y, y + 2.9)) return true;
      for (const sign of [-1, 1]) {
        if (hit(sign < 0 ? -1.45 : .78, sign < 0 ? -.78 : 1.45, CAR_FRONT - .12, CAR_FRONT, y, y + 2.9)) return true;
      }
      // During travel the entire front aperture is sealed, including vertical gaps between landings.
      if (state === 'moving' && hit(-1.48, 1.48, CAR_FRONT - .07, FRONT + .06, y, y + 2.9)) return true;
      for (const sign of [-1, 1]) {
        const center = sign * (HALF_OPENING / 2 + doorAmount * HALF_OPENING);
        if (hit(center - HALF_OPENING / 2, center + HALF_OPENING / 2, CAR_FRONT - .04, CAR_FRONT + .04, y, y + 2.38)) return true;
      }
    }
    for (const door of doors) {
      for (const sign of [-1, 1]) {
        const center = sign * (HALF_OPENING / 2 + door.doorAmount * HALF_OPENING);
        if (hit(center - HALF_OPENING / 2, center + HALF_OPENING / 2, FRONT - .04, FRONT + .04, door.y, door.y + 2.38)) return true;
      }
    }
    return false;
  }
  function dispose() {
    if (disposed) return; disposed = true; mirror.onBeforeRender = () => {};
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose(); for (const rt of targets) rt.dispose();
    group.removeFromParent(); cameraMeshes.length = 0; colliders.length = 0;
  }
  updateVisuals();
  return {
    group, cabin, doors, carDoors, cameraMeshes, colliders, buttons, mirror,
    get y() { return y; }, get floor() { return floor; }, get target() { return target; },
    get doorAmount() { return doorAmount; }, get state() { return state; },
    get velocity() { if (!motion) return 0; const t = motion.elapsed; return motion.direction * Math.min(motion.peak, ACCELERATION * t, ACCELERATION * (motion.duration - t)); },
    floorHeight, floors, update, requestFloor, call, openDoor, closeDoor, containsCabin, blocks, dispose,
    // Support helper for host gravity: valid on the platform and entrance sill only.
    supportHeight(p) { return p && Math.abs(p.x) < 1.39 && p.z > -17.48 && p.z < -14.09 && p.y >= y - .22 && p.y < y + 1.35 ? y : null; }
  };
}
