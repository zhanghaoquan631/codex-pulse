import {resetTeachingPose} from './teaching-pose.js?v=11';
/** Joint-local role props. No textures, external imports, shared materials or physics. */
export const ROLE_OPTIONS = Object.freeze([
  { id: 'student', key: 'student', label: '在校学生', defaultAction: 'idle', description: '课程书本与校园学生证' },
  { id: 'teacher', key: 'teacher', label: '授课老师', defaultAction: 'idle', description: '讲义夹板与蓝色工作证' },
  { id: 'runner', key: 'runner', label: '校园跑者', defaultAction: 'idle', description: '运动发带、腕带与腰间水壶' },
  { id: 'basketball', key: 'basketball', label: '篮球队员', defaultAction: 'dribble', description: '07 号球衣与低多边形篮球' },
  { id: 'staff', key: 'staff', label: '校园后勤', defaultAction: 'idle', description: '反光工作背心、工作证与腰间工具袋' },
  { id: 'visitor', key: 'visitor', label: '来访游客', defaultAction: 'idle', description: '相机与折叠校园导览图' },
]);

export const ROLE_ACTIONS = Object.freeze([
  { id: 'idle', label: '自然站立' }, { id: 'teaching', label: '讲课' },
  { id: 'reading', label: '阅读' }, { id: 'chatting', label: '交谈' },
  { id: 'dribble', label: '运球' }, { id: 'shoot', label: '投篮' },
]);

const states = new WeakMap();
const actionIds = new Set(ROLE_ACTIONS.map(action => action.id));
const aliases = { teacher: 'teaching', lecture: 'teaching', read: 'reading', chat: 'chatting',
  basketball: 'dribble', shooting: 'shoot', dribbling: 'dribble', none: 'idle', auto: 'auto' };
const WHITE = '#EFE8D5';
const INK = '#46505A';

function removeAssets(state) {
  for (const group of state.groups) group.removeFromParent();
  for (const geometry of state.geometries) geometry.dispose();
  state.material?.dispose();
  state.groups = [];
  state.geometries = [];
  state.props = {};
  state.material = null;
}

function getState(rig) {
  let state = states.get(rig);
  if (state) return state;
  state = { groups: [], geometries: [], material: null, props: {}, pose: new Map(), poseCache: new Map(),
    action: 'idle', elapsed: 0, totalTime: 0, disposed: false, key: null };
  states.set(rig, state);
  const previousDispose = rig.dispose;
  rig.dispose = function disposeRoleAvatar() {
    if (state.disposed) return;
    state.disposed = true;
    resetRolePose(rig);
    removeAssets(state);
    states.delete(rig);
    if (previousDispose) previousDispose.call(rig);
  };
  return state;
}

/**
 * Restore just the last pose layer. Optional before updateAvatar for exact layering.
 * Returns the rig. This never changes root, hips, torso, legs or feet.
 */
export function resetRolePose(rig) {
  rig.readingMotion?.update(0,{active:false});resetTeachingPose(rig);
  const state = states.get(rig);
  if (!state) return rig;
  for (const [joint, pose] of state.pose) {
    // Avoid overwriting a newer base animation or a different caller's joint pose.
    if (joint.quaternion.angleTo(pose.after) < 1e-7) joint.quaternion.copy(pose.before);
  }
  state.pose.clear();
  return rig;
}

/**
 * Replace one avatar's role props, leaving wardrobe and base materials intact.
 * roleKey: student | teacher | runner | basketball | staff | visitor.
 * Call again after identity creation; repeat calls with the same key are free.
 * Unknown keys fall back to student. All owned GPU assets join rig.dispose().
 */
export function applyRole(THREE, rig, roleKey = 'student') {
  if (!rig?.group || !rig.joints?.torso || !rig.joints?.handL || !rig.meshes) {
    throw new TypeError('applyRole expects a rig returned by createAvatar');
  }
  const role = ROLE_OPTIONS.find(entry => entry.id === roleKey) || ROLE_OPTIONS[0];
  const state = getState(rig);
  if (state.key === role.id) return rig;
  resetRolePose(rig);
  removeAssets(state);
  state.key = role.id;
  state.action = 'idle';
  state.elapsed = 0;
  state.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95,
    metalness: 0, flatShading: true });
  state.material.name = `role:${role.id}:vertex-colours`;
  const buckets = new Map();
  const bucket = (id, joint) => {
    if (!buckets.has(id)) buckets.set(id, { id, joint, pieces: [] });
    return buckets.get(id);
  };
  const piece = (id, joint, geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.applyMatrix4(transform);
    const values = flat.getAttribute('position');
    const shade = new THREE.Color(color);
    const colors = new Float32Array(values.count * 3);
    for (let index = 0; index < values.count; index++) shade.toArray(colors, index * 3);
    bucket(id, joint).pieces.push({ position: values.array.slice(),
      normal: flat.getAttribute('normal').array.slice(), color: colors });
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  };
  const box = (id, joint, size, position, color, rotation) =>
    piece(id, joint, new THREE.BoxGeometry(...size), color, position, rotation);
  const badge = (id, color) => {
    for (const sign of [-1, 1]) box(id, 'torso', [.017, .144, .014], [sign * .043, .293, .221], color, [0, 0, sign * -.28]);
    box(id, 'torso', [.09, .101, .019], [0, .185, .224], WHITE);
    box(id, 'torso', [.074, .018, .005], [0, .223, .237], color);
    box(id, 'torso', [.024, .033, .006], [-.021, .18, .238], color);
    box(id, 'torso', [.029, .01, .006], [.015, .184, .238], INK);
  };
  // Every role can enter reading without allocating during the animation loop.
  box('readingBook', 'torso', [.305, .2, .032], [0, .163, .355], '#6E8E8D', [-.5, 0, 0]);
  box('readingBook', 'torso', [.279, .174, .014], [0, .17, .374], WHITE, [-.5, 0, 0]);
  box('readingBook', 'torso', [.01, .176, .018], [0, .17, .382], '#A9B1A4', [-.5, 0, 0]);

  if (role.id === 'student') {
    badge('torso', '#809870');
    box('handItem', 'handL', [.052, .203, .162], [.078, -.025, .016], '#A793BA');
    box('handItem', 'handL', [.035, .18, .151], [.078, -.025, .018], WHITE);
    box('handItem', 'handL', [.011, .205, .166], [.105, -.025, .016], '#806C91');
    box('handItem', 'handL', [.015, .047, .024], [.076, .086, .064], '#DDAC72');
  } else if (role.id === 'teacher') {
    badge('torso', '#6F8FAB');
    box('handItem', 'handL', [.216, .294, .025], [.024, -.028, .092], '#A98D6F');
    box('handItem', 'handL', [.186, .253, .01], [.024, -.03, .111], WHITE);
    box('handItem', 'handL', [.071, .027, .012], [.024, .114, .12], INK);
    for (let row = 0; row < 4; row++) box('handItem', 'handL', [.137 - row * .012, .008, .007], [.024, .039 - row * .035, .12], '#ADB7B0');
    box('handItem', 'handL', [.012, .16, .014], [.125, -.025, .117], '#52697D');
  } else if (role.id === 'runner') {
    // Front/side bands leave hair geometry untouched across all eight identities.
    box('head', 'head', [.387, .039, .022], [0, .267, .187], '#DFBC7B');
    for (const sign of [-1, 1]) box('head', 'head', [.019, .039, .35], [sign * .205, .267, 0], '#DFBC7B');
    box('wrist', 'handR', [.161, .04, .174], [0, .019, 0], '#F0E9D4');
    box('wrist', 'handR', [.075, .041, .013], [0, .019, .095], '#586E79');
    box('torso', 'torso', [.45, .045, .025], [0, -.005, .221], '#62736B');
    box('torso', 'torso', [.087, .105, .037], [.143, -.024, .24], '#53655E');
    piece('torso', 'torso', new THREE.CylinderGeometry(.031, .031, .13, 7), '#ABC4C2', [-.169, -.01, .247]);
    box('torso', 'torso', [.048, .025, .045], [-.169, .068, .247], '#566F71');
  } else if (role.id === 'basketball') {
    box('torso', 'torso', [.405, .348, .027], [0, .154, .214], '#BD775A');
    box('torso', 'torso', [.405, .348, .027], [0, .154, -.205], '#BD775A');
    for (const sign of [-1, 1]) {
      box('torso', 'torso', [.035, .336, .011], [sign * .18, .154, .234], WHITE);
      box('torso', 'torso', [.035, .04, .366], [sign * .18, .325, .011], WHITE);
    }
    box('torso', 'torso', [.127, .031, .01], [0, .313, .235], WHITE);
    // Block digits 07 are real geometry merged into the jersey's one draw call.
    const digit = (value, x) => {
      const segments = value === '0' ? [0, 1, 2, 3, 4, 5] : [0, 1, 2];
      const layout = [[0, .077, .065, .014], [.033, .039, .014, .07], [.033, -.039, .014, .07],
        [0, -.077, .065, .014], [-.033, -.039, .014, .07], [-.033, .039, .014, .07]];
      for (const part of segments) {
        const [dx, dy, w, h] = layout[part];
        box('torso', 'torso', [w, h, .009], [x + dx, .163 + dy, .236], WHITE);
      }
    };
    digit('0', -.055); digit('7', .055);
    box('wrist', 'handR', [.161, .037, .173], [0, .019, 0], WHITE);
    piece('basketball', 'root', new THREE.SphereGeometry(.125, 10, 7), '#CB864D');
    for (const rotation of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
      piece('basketball', 'root', new THREE.TorusGeometry(.1255, .0038, 3, 16), '#665344', [0, 0, 0], rotation);
    }
  } else if (role.id === 'staff') {
    for (const sign of [-1, 1]) {
      box('torso', 'torso', [.18, .382, .029], [sign * .117, .143, .216], '#B1AF68');
      box('torso', 'torso', [.046, .359, .011], [sign * .137, .144, .238], '#E9E4BA');
    }
    box('torso', 'torso', [.431, .368, .025], [0, .146, -.205], '#B1AF68');
    box('torso', 'torso', [.422, .034, .015], [0, .09, .24], '#E9E4BA');
    box('torso', 'torso', [.422, .034, .015], [0, .09, -.225], '#E9E4BA');
    box('torso', 'torso', [.062, .075, .015], [.075, .242, .254], WHITE);
    box('torso', 'torso', [.047, .015, .009], [.075, .261, .267], '#637A76');
    box('torso', 'torso', [.124, .137, .08], [-.207, -.064, .09], '#7D806B');
    for (const sign of [-1, 1]) box('torso', 'torso', [.018, .084, .022], [-.208 + sign * .031, .016, .09], '#57696A');
  } else if (role.id === 'visitor') {
    for (const sign of [-1, 1]) box('torso', 'torso', [.018, .198, .018], [sign * .067, .266, .233], '#73818B', [0, 0, sign * -.34]);
    box('torso', 'torso', [.168, .113, .066], [0, .14, .258], '#637581');
    piece('torso', 'torso', new THREE.CylinderGeometry(.042, .046, .035, 8), '#3F4F5C', [0, .143, .311], [Math.PI / 2, 0, 0]);
    box('torso', 'torso', [.034, .022, .02], [-.051, .195, .269], '#D4CFB8');
    box('handItem', 'handL', [.211, .165, .025], [.029, -.028, .082], '#D7D5B7');
    box('handItem', 'handL', [.019, .153, .012], [.029, -.028, .102], '#93AD96');
    for (const sign of [-1, 1]) {
      box('handItem', 'handL', [.064, .065, .009], [.029 + sign * .061, -.013, .102], '#AEC3A2');
      box('handItem', 'handL', [.012, .137, .008], [.029 + sign * .035, -.028, .112], '#A4BACA', [0, 0, sign * .2]);
    }
  }

  for (const entry of buckets.values()) {
    const vertexCount = entry.pieces.reduce((sum, item) => sum + item.position.length, 0);
    const geometry = new THREE.BufferGeometry();
    for (const attribute of ['position', 'normal', 'color']) {
      const data = new Float32Array(vertexCount);
      let offset = 0;
      for (const item of entry.pieces) { data.set(item[attribute], offset); offset += item[attribute].length; }
      geometry.setAttribute(attribute, new THREE.BufferAttribute(data, 3));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    state.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, state.material);
    mesh.name = `role:${role.id}:${entry.id}:mesh`;
    mesh.castShadow = mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.name = `role:${role.id}:${entry.id}`;
    group.userData.roleProp = true;
    group.add(mesh);
    (entry.joint === 'root' ? rig.group : rig.joints[entry.joint]).add(group);
    state.props[entry.id] = group;
    state.groups.push(group);
  }
  state.props.readingBook.visible = false;
  if (state.props.basketball) state.props.basketball.position.set(-.405, .77, .22);
  rig.roleKey = role.id;
  rig.roleGroups = state.groups;
  rig.roleInfo = { key: role.id, label: role.label, defaultAction: role.defaultAction,
    maxDrawCalls: state.geometries.length, drawCalls: state.geometries.length - 1 };
  rig.group.userData.roleKey = role.id;
  rig.group.updateWorldMatrix(true, true);
  return rig;
}

/**
 * Optional upper-body pose layer; call AFTER updateAvatar. No leg/root transforms.
 * actionKey: idle | teaching | reading | chatting | dribble | shoot | auto.
 * options: { weight: 0..1, loop: boolean, progress: 0..1 }.
 * progress overrides the looping 2.4 s shooting cycle. Basketball is a local visual
 * prop, never a physics body. Other actions can be applied to every role/gender.
 */
export function updateRoleAction(rig, dt = 0, actionKey = 'auto', options = {}) {
  const state = states.get(rig);
  if (!state || state.disposed) return rig;
  let action = aliases[actionKey] || actionKey;
  if (action === 'auto') action = ROLE_OPTIONS.find(role => role.id === state.key).defaultAction;
  if (!actionIds.has(action)) action = 'idle';
  const delta = Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
  if (action !== state.action) { state.action = action; state.elapsed = 0; }
  state.elapsed += delta;
  state.totalTime += delta;
  const weight = Number.isFinite(options.weight) ? Math.min(1, Math.max(0, options.weight)) : 1;
  resetRolePose(rig);
  const t = state.elapsed;
  const joints = rig.joints;
  const pose = (id, x, y = 0, z = 0) => {
    const joint = joints[id];
    if (!joint || weight === 0) return;
    let saved = state.poseCache.get(joint);
    if (!saved) {
      saved = { before: joint.quaternion.clone(), after: joint.quaternion.clone(),
        target: joint.quaternion.clone(), euler: joint.rotation.clone() };
      state.poseCache.set(joint, saved);
    }
    saved.before.copy(joint.quaternion);
    saved.target.setFromEuler(saved.euler.set(x, y, z));
    joint.quaternion.slerp(saved.target, weight);
    saved.after.copy(joint.quaternion);
    state.pose.set(joint, saved);
  };
  const reading = action === 'reading' && weight > 0;
  state.props.readingBook.visible = reading;
  if (state.props.handItem) state.props.handItem.visible = !reading;
  const ball = state.props.basketball;
  if (ball) {
    ball.visible = !reading;
    ball.position.set(-.405, .77, .22);
    ball.rotation.set(0, 0, 0);
  }
  if (action === 'teaching') {
    pose('upperArmL', -.22, 0, -.12);
    pose('lowerArmL', -1.14);
    pose('upperArmR', -.9 + Math.sin(t * 1.8) * .12, -.1, -.53);
    pose('lowerArmR', -.36 + Math.sin(t * 2.3) * .12);
    pose('handR', -.16, 0, Math.sin(t * 2.3) * .11);
    pose('head', -.025, Math.sin(t * .75) * .16);
  } else if (action === 'reading') {
    pose('upperArmL', -.68, 0, -.15);
    pose('upperArmR', -.68, 0, .15);
    pose('lowerArmL', -1.02);
    pose('lowerArmR', -1.02);
    pose('handL', .12, 0, -.09);
    pose('handR', .12, 0, .09);
    pose('head', .24 + Math.sin(t * .9) * .02, Math.sin(t * .5) * .025);
  } else if (action === 'chatting') {
    pose('upperArmL', -.28 + Math.sin(t * 1.9) * .11, 0, -.12);
    pose('upperArmR', -.33 + Math.sin(t * 1.9 + 1.2) * .14, 0, .11);
    pose('lowerArmL', -.58 - Math.sin(t * 1.9) * .2);
    pose('lowerArmR', -.64 - Math.sin(t * 1.9 + 1.2) * .19);
    pose('handR', -.12, 0, Math.sin(t * 2) * .15);
    pose('head', Math.sin(t * 2.1) * .045, Math.sin(t * .8) * .12);
  } else if (action === 'dribble') {
    const bounce = Math.abs(Math.sin(t * 5.6));
    pose('upperArmR', -.13 - bounce * .24, 0, -.28);
    pose('lowerArmR', -.12 - bounce * .37);
    pose('handR', .2 + bounce * .25);
    pose('head', .075, -.035);
    if (ball) {
      ball.position.set(-.405, .129 + bounce * .64, .245);
      ball.rotation.set(t * 2.1, t * 1.2, .25);
    }
  } else if (action === 'shoot') {
    const progress = Number.isFinite(options.progress) ? Math.max(0, Math.min(1, options.progress))
      : options.loop === false ? Math.min(1, t / 2.4) : (t % 2.4) / 2.4;
    const lift = Math.min(1, progress / .28);
    const recover = progress > .82 ? Math.max(0, 1 - (progress - .82) / .18) : 1;
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      pose(`upperArm${side}`, (-.7 - lift * 1.82) * recover, 0, -sign * .16 * recover);
      pose(`lowerArm${side}`, (-.95 + lift * .69) * recover);
      pose(`hand${side}`, (-.05 - lift * .43) * recover);
    }
    pose('head', -.16 * lift * recover);
    if (ball) {
      if (progress <= .28) ball.position.set(0, 1.03 + lift * .53, .385);
      else if (progress < .82) {
        const flight = (progress - .28) / .54;
        ball.position.set(0, 1.56 + Math.sin(flight * Math.PI) * 1.22 - .2 * flight, .385 + 1.7 * flight);
        ball.rotation.set(-flight * 7, 0, flight * 2);
      } else ball.visible = false;
    }
  }
  rig.roleAction = action;
  rig.group.userData.roleAction = action;
  rig.group.updateWorldMatrix(true, true);
  return rig;
}
