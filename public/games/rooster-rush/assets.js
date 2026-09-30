import * as THREE from './vendor/three.module.js';

// Original, self-contained clay characters. No downloaded character assets.
export const palette = Object.freeze({
  cream: 0xfff3d7, white: 0xfffbef, red: 0xf54b35, orange: 0xffad35,
  teal: 0x235e59, tealLight: 0x3f8171, ink: 0x253c37, wood: 0xb7733d,
  tan: 0xf5cc84, green: 0x69ac55, roof: 0xd34b38,
});

const materials = new Map();
const templates = new Map();
const geometry = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 14),
  cap: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
};

function mat(color, roughness = 0.78, metalness = 0) {
  const key = `${color}-${roughness}-${metalness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return materials.get(key);
}

function part(parent, shape, color, position, scale, rotation = [0, 0, 0], material) {
  const mesh = new THREE.Mesh(geometry[shape] || shape, material || mat(color));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ball(parent, color, position, scale, rotation) {
  return part(parent, 'sphere', color, position, scale, rotation);
}

function group(parent, position = [0, 0, 0]) {
  const node = new THREE.Group();
  node.position.set(...position);
  if (parent) parent.add(node);
  return node;
}

// Merge a rigid subassembly into one draw call per material, while leaving the
// parent pivot intact. A non-indexed buffer also keeps this independent of addons.
function bake(rigid) {
  rigid.updateMatrixWorld(true);
  const inverseRoot = rigid.matrixWorld.clone().invert();
  const buckets = new Map();
  const originals = [];
  rigid.traverse(node => {
    if (!node.isMesh) return;
    const transformed = (node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone());
    transformed.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, node.matrixWorld));
    if (!buckets.has(node.material)) buckets.set(node.material, []);
    buckets.get(node.material).push(transformed);
    originals.push(node);
  });
  for (const mesh of originals) mesh.removeFromParent();
  for (const [material, pieces] of buckets) {
    const merged = new THREE.BufferGeometry();
    for (const attribute of ['position', 'normal', 'uv']) {
      const length = pieces.reduce((n, item) => n + (item.attributes[attribute]?.array.length || 0), 0);
      if (!length || pieces.some(item => !item.attributes[attribute])) continue;
      const values = new Float32Array(length);
      let offset = 0;
      for (const piece of pieces) {
        values.set(piece.attributes[attribute].array, offset);
        offset += piece.attributes[attribute].array.length;
      }
      merged.setAttribute(attribute, new THREE.BufferAttribute(values, attribute === 'uv' ? 2 : 3));
    }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = mesh.receiveShadow = true;
    rigid.add(mesh);
    for (const piece of pieces) piece.dispose();
  }
  return rigid;
}

function eyes(parent, x, y, spread, size = .074) {
  for (const side of [-1, 1]) {
    ball(parent, palette.white, [x, y, side * spread], [size * 1.16, size * 1.24, size * .53]);
    ball(parent, palette.ink, [x + size * .32, y + size * .02, side * (spread + size * .37)], [size * .58, size * .76, size * .3]);
    ball(parent, 0xffffff, [x + size * .5, y + size * .31, side * (spread + size * .64)], [size * .16, size * .19, size * .09]);
  }
}

function groundModel(model) {
  const floor = new THREE.Box3().setFromObject(model).min.y;
  model.traverse(node => { if (node.isMesh) node.geometry.translate(0, -floor, 0); });
  return model;
}

export function createRooster() {
  const rooster = group();
  rooster.name = 'Rooster';
  const body = group(rooster, [0, .69, 0]);
  ball(body, 0xe7e7d9, [-.065, .02, 0], [.53, .6, .44], [0, 0, -.04]);
  ball(body, 0xf1f0e3, [.17, .1, 0], [.39, .5, .405]);
  // A compact, pale feather fan follows the plump body close to the ground.
  for (const [x, y, z, tilt, color] of [
    [-.6, -.34, -.13, 1.75, 0xc8d0c6],
    [-.64, -.28, .005, 1.72, 0xdfe3d5],
    [-.6, -.35, .14, 1.78, 0xd4dacd],
  ]) {
    ball(body, color, [x, y, z], [.085, .235, .09], [.14 * Math.sign(z), 0, tilt]);
  }
  ball(body, palette.teal, [-.47, -.36, -.12], [.09, .1, .045], [0, 0, .7]);
  bake(body);

  const head = group(rooster, [.25, 1.055, 0]);
  ball(head, 0xf1f0e3, [0, .045, 0], [.265, .285, .26]);
  ball(head, 0xf1f0e3, [-.16, -.08, 0], [.28, .275, .27]);
  for (const [x, y, radius] of [[-.25, .365, .092], [-.15, .44, .107], [-.04, .395, .086]]) {
    ball(head, 0xbb241b, [x, y, 0], [radius, radius * 1.22, .082]);
  }
  // A rounded upper beak with a distinct lower lip.
  part(head, 'cone', 0xe99926, [.335, -.105, 0], [.11, .285, .142], [0, 0, -Math.PI / 2]);
  ball(head, 0xd68922, [.29, -.17, 0], [.115, .042, .118]);
  for (const side of [-1, 1]) {
    ball(head, 0xbb241b, [.21, -.235, side * .055], [.052, .085, .048], [0, 0, -.16]);
    ball(head, 0xe7dcc0, [.13, -.105, side * .235], [.075, .045, .025]);
  }
  eyes(head, .18, .105, .227, .079);
  for (const side of [-1, 1]) {
    ball(head, palette.ink, [.164, .221, side * .215], [.079, .025, .025], [side * .12, 0, -.4]);
  }
  bake(head);

  const leftWing = group(rooster, [.16, .79, .385]);
  const rightWing = group(rooster, [.16, .79, -.385]);
  for (const [wing, side] of [[leftWing, 1], [rightWing, -1]]) {
    ball(wing, 0xd8dcd0, [-.055, -.14, 0], [.225, .27, .102], [0, side * .08, -.28]);
    for (let i = 0; i < 3; i++) {
      ball(wing, 0xe9e9db, [-.12 + i * .075, -.265 + i * .026, side * .035], [.068, .115, .075], [0, 0, -.35]);
    }
    bake(wing);
  }

  const leftLeg = group(rooster, [0, .19, .21]);
  const rightLeg = group(rooster, [0, .19, -.21]);
  for (const leg of [leftLeg, rightLeg]) {
    part(leg, 'cylinder', 0xe6a335, [0, -.065, 0], [.039, .15, .039]);
    ball(leg, 0xe6a335, [.045, -.145, 0], [.125, .045, .077]);
    for (const side of [-1, 0, 1]) {
      ball(leg, 0xe6a335, [.11, -.155, side * .047], [.115, .035, .03], [0, side * -.16, 0]);
    }
    bake(leg);
  }
  rooster.userData = { body, leftWing, rightWing, leftLeg, rightLeg, head };
  return rooster;
}

export function createEnemy(type = 'goomba') {
  const cacheKey = `enemy:${type}`;
  if (templates.has(cacheKey)) return templates.get(cacheKey).clone();
  const enemy = group();
  enemy.name = type;
  if (type === 'koopa' || type === 'turtle') {
    ball(enemy, palette.tan, [0, .26, 0], [.31, .23, .27]);
    ball(enemy, 0xffedba, [-.07, .27, 0], [.34, .1, .3]);
    ball(enemy, 0x477d48, [-.075, .38, 0], [.33, .26, .28]);
    ball(enemy, 0x80b85d, [-.09, .46, 0], [.255, .21, .22]);
    ball(enemy, palette.tan, [.29, .44, 0], [.19, .225, .17]);
    ball(enemy, palette.tan, [.44, .375, 0], [.15, .095, .145]);
    for (const x of [-.22, .16]) for (const z of [-.205, .205]) {
      ball(enemy, 0xe8ae53, [x, .1, z], [.13, .1, .11]);
    }
    for (const side of [-1, 1]) {
      ball(enemy, 0xfbedb4, [-.1, .49, side * .218], [.018, .125, .017], [.3, 0, -.4]);
    }
    eyes(enemy, .35, .49, .15, .061);
  } else if (type === 'spiky' || type === 'spike') {
    ball(enemy, 0x576679, [0, .33, 0], [.31, .29, .28]);
    ball(enemy, 0xa6a7b2, [.185, .285, 0], [.19, .19, .235]);
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI * .4 + i * Math.PI * 1.65 / 7;
      const x = Math.cos(a) * .28;
      const y = .33 + Math.sin(a) * .25;
      const spike = part(enemy, 'cone', 0xffeccb, [x, y, 0], [.076, .24, .075]);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const spike = part(enemy, 'cone', 0xffeccb, [-.18 + i * .14, .42, side * .26], [.065, .19, .065]);
        spike.rotation.x = side * Math.PI * .37;
      }
      ball(enemy, 0x3d4658, [-.07, .07, side * .2], [.17, .07, .095]);
    }
    eyes(enemy, .27, .355, .16, .062);
  } else {
    ball(enemy, 0xf2d9a7, [0, .265, 0], [.23, .22, .22]);
    part(enemy, 'cap', 0xb66a39, [0, .4, 0], [.4, .33, .34]);
    ball(enemy, 0xd4874a, [-.05, .49, 0], [.31, .23, .28]);
    for (const side of [-1, 1]) {
      ball(enemy, 0x70442e, [.03, .07, side * .195], [.2, .075, .12], [0, side * -.14, 0]);
      ball(enemy, 0xffe9bb, [.24, .36, side * .15], [.058, .09, .042]);
      ball(enemy, palette.ink, [.28, .365, side * .169], [.024, .047, .023]);
      ball(enemy, 0x774629, [.255, .465, side * .146], [.071, .025, .046], [side * .18, 0, -.22]);
    }
  }
  bake(enemy);
  groundModel(enemy);
  enemy.userData.type = type;
  templates.set(cacheKey, enemy);
  return enemy.clone();
}

export function createMushroom() {
  if (templates.has('mushroom')) return templates.get('mushroom').clone();
  const mushroom = group();
  mushroom.name = 'Power mushroom';
  ball(mushroom, palette.cream, [0, .25, 0], [.18, .235, .17]);
  part(mushroom, 'cap', palette.red, [0, .38, 0], [.37, .3, .34]);
  ball(mushroom, palette.white, [0, .65, 0], [.1, .035, .09]);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const spot = ball(mushroom, palette.white, [Math.sin(a) * .25, .525, Math.cos(a) * .225], [.076, .073, .025]);
    spot.rotation.y = a;
    spot.rotation.x = -.55;
  }
  for (const z of [-.065, .065]) ball(mushroom, palette.ink, [.164, .28, z], [.015, .045, .018]);
  groundModel(bake(mushroom));
  templates.set('mushroom', mushroom);
  return mushroom.clone();
}

export function createRocket() {
  if (templates.has('rocket')) return templates.get('rocket').clone();
  const rocket = group();
  rocket.name = 'Rocket';
  part(rocket, 'cylinder', 0xfff2cb, [0, .18, 0], [.155, .58, .155], [0, 0, -Math.PI / 2]);
  part(rocket, 'cone', palette.red, [.39, .18, 0], [.157, .26, .157], [0, 0, -Math.PI / 2]);
  part(rocket, 'cylinder', palette.teal, [-.29, .18, 0], [.12, .08, .12], [0, 0, -Math.PI / 2]);
  for (const side of [-1, 1]) {
    ball(rocket, palette.red, [-.17, .18, side * .16], [.16, .04, .13], [0, side * -.4, 0]);
    ball(rocket, 0x80c3c4, [.075, .18, side * .147], [.08, .08, .018]);
  }
  part(rocket, 'box', palette.red, [-.19, .35, 0], [.2, .19, .044], [0, 0, -.3]);
  part(rocket, 'cone', 0xffb638, [-.53, .18, 0], [.104, .36, .104], [0, 0, Math.PI / 2]);
  part(rocket, 'cone', 0xfff0a0, [-.43, .18, 0], [.066, .2, .066], [0, 0, Math.PI / 2]);
  groundModel(bake(rocket));
  templates.set('rocket', rocket);
  return rocket.clone();
}

export function createCoop() {
  const coop = group();
  coop.name = 'Finish chicken coop';
  part(coop, 'box', 0x82502c, [0, .865, 0], [2.04, 1.61, 1.55]);
  // Broad weathered boards, divided by fine dark battens.
  for (let i = 0; i < 6; i++) {
    part(coop, 'box', i % 2 ? 0xa36534 : 0xaa6c39, [-.86 + i * .345, .865, .79], [.33, 1.61, .04]);
    part(coop, 'box', 0x683d24, [-1.025 + i * .345, .86, .827], [.028, 1.64, .037]);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      part(coop, 'box', i % 2 ? 0xa36534 : 0xaa6c39, [side * 1.035, .865, -.624 + i * .31], [.038, 1.61, .295]);
      part(coop, 'box', 0x683d24, [side * 1.061, .86, -.775 + i * .31], [.031, 1.64, .027]);
    }
    part(coop, 'box', 0x59331e, [side * 1.04, .865, .823], [.07, 1.69, .08]);
  }
  // The entrance sits low under an unpainted, narrow wooden lintel.
  part(coop, 'box', 0x221a10, [.09, .53, .836], [.575, 1.025, .048]);
  for (const side of [-1, 1]) part(coop, 'box', 0x57381e, [.09 + side * .322, .545, .877], [.052, 1.08, .071]);
  part(coop, 'box', 0x57381e, [.09, 1.083, .878], [.704, .06, .071]);
  part(coop, 'box', 0x51321b, [0, .047, 0], [2.22, .094, 1.78]);
  part(coop, 'box', 0x684125, [.09, .034, 1.045], [.71, .067, .47]);
  part(coop, 'box', 0x663a22, [0, 1.66, 0], [2.2, .095, 1.75]);

  // Four planar roof faces meet in one peak, like a little farm pavilion.
  const roofGeometry = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).toNonIndexed();
  roofGeometry.computeVertexNormals();
  part(coop, roofGeometry, 0xa71920, [0, 2.135, 0], [1.77, .9, 1.44]);
  part(coop, 'box', 0x74151a, [0, 1.691, 0], [2.52, .055, 2.049]);
  // Small circular vent on the front wall, with a simple dark cross frame.
  part(coop, 'cylinder', 0x51371f, [-.59, 1.16, .838], [.151, .036, .151], [Math.PI / 2, 0, 0]);
  part(coop, 'cylinder', 0x181c13, [-.59, 1.16, .865], [.123, .028, .123], [Math.PI / 2, 0, 0]);
  part(coop, 'box', 0x916034, [-.59, 1.16, .887], [.024, .256, .025]);
  part(coop, 'box', 0x916034, [-.59, 1.16, .889], [.256, .024, .025]);
  // A modest dark weathervane replaces the bright finish flag.
  part(coop, 'cylinder', 0x4b2921, [0, 2.8, 0], [.021, .48, .021]);
  ball(coop, 0x572921, [0, 2.59, 0], [.05, .055, .05]);
  ball(coop, 0x572921, [0, 3.05, 0], [.075, .068, .039]);
  ball(coop, 0x692b20, [.065, 3.09, 0], [.038, .04, .031]);
  part(coop, 'cone', 0x4b2921, [-.062, 3.065, 0], [.049, .092, .032], [0, 0, -.7]);
  return bake(coop);
}
