import * as THREE from 'three';
import { createInkMaterial, createInkLineMaterial, INK_COLORS } from './ink-materials.mjs';

// Original, procedural character art. World convention: metres, +Y up, +Z forward.
// All meshes belong to their returned Group; geometries/materials are shared.
const geometries = new Map();
const materials = new Map();
const palette = {
  indigo: INK_COLORS.blue, indigoDark: INK_COLORS.blue, red: INK_COLORS.red,
  skin: INK_COLORS.blue, paper: INK_COLORS.blue, outlinePaper: INK_COLORS.blue, white: INK_COLORS.blue,
  ink: INK_COLORS.blue, inkBlue: INK_COLORS.blue, charcoal: INK_COLORS.blue,
  jade: INK_COLORS.green, glow: INK_COLORS.orange, violet: INK_COLORS.blue,
  gold: INK_COLORS.orange, bronze: INK_COLORS.brown, wood: INK_COLORS.brown,
  straw: INK_COLORS.brown, sand: INK_COLORS.brown, green: INK_COLORS.green,
  steel: INK_COLORS.blue, leather: INK_COLORS.blue, faceInk: INK_COLORS.blue,
};

function geometry(kind) {
  if (!geometries.has(kind)) {
    let value;
    switch (kind) {
      case 'box': value = new THREE.BoxGeometry(1, 1, 1); break;
      case 'orb': value = new THREE.IcosahedronGeometry(1, 1); break;
      case 'head': value = new THREE.SphereGeometry(1, 16, 12); break;
      case 'tube': value = new THREE.CylinderGeometry(1, 1, 1, 6); break;
      case 'taper': value = new THREE.CylinderGeometry(0.76, 1, 1, 8); break;
      case 'cone': value = new THREE.ConeGeometry(1, 1, 7); break;
      case 'ring': value = new THREE.TorusGeometry(1, 0.13, 4, 12); break;
      case 'bow': value = new THREE.TorusGeometry(1, 0.065, 4, 12, Math.PI); break;
      default: throw new Error(`Unknown character geometry: ${kind}`);
    }
    geometries.set(kind, value);
  }
  return geometries.get(kind);
}

function material(color, luminous = false, override) {
  const hex = override ?? palette[color] ?? color;
  const key = `${color}:${hex}:${luminous}`;
  if (!materials.has(key)) {
    const whitePaper = ['skin', 'paper', 'white', 'steel', 'outlinePaper'].includes(color);
    materials.set(key, color === 'faceInk'
      ? new THREE.MeshBasicMaterial({ color: hex, toneMapped: false })
      : createInkMaterial({ ink: hex, tone: color === 'outlinePaper' ? .12 : whitePaper ? .36 : .72,
        accent: color === 'red' ? .12 : luminous ? .09 : override ? .045 : .012,
        spacing: 7.5, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  }
  return materials.get(key);
}

function mesh(parent, kind, color, size, position = [0, 0, 0], rotation = [0, 0, 0], luminous = false) {
  let ancestor = parent, override;
  while (ancestor) {
    if (ancestor.userData.inkOverride !== undefined) { override = ancestor.userData.inkOverride; break; }
    ancestor = ancestor.parent;
  }
  const penColor = override ?? palette[color] ?? color;
  const item = new THREE.Mesh(geometry(kind), material(color, luminous, override));
  item.scale.set(...size);
  item.position.set(...position);
  item.rotation.set(...rotation);
  item.castShadow = false;
  item.receiveShadow = false;
  parent.add(item);
  // Narrow silhouettes and a few structural edges; never full triangle wireframe.
  if (Math.max(...size) > .03 && Math.min(...size) > .018 && color !== 'faceInk') {
    const outlineKey = `outline:${penColor}`;
    if (!materials.has(outlineKey)) materials.set(outlineKey,
      new THREE.MeshBasicMaterial({ color: penColor, side: THREE.BackSide, toneMapped: false }));
    const shell = new THREE.Mesh(geometry(kind), materials.get(outlineKey));
    const pen = .0025;
    shell.scale.set(...size.map(s => 1 + pen / Math.max(s, .015)));
    shell.userData.visualOutline = true;
    shell.name = 'thin-pen-silhouette';
    item.add(shell);
  }
  if (['box', 'cone'].includes(kind) && Math.max(...size) > .12 && color !== 'faceInk') {
    const edgeKey = `edges:${kind}`, lineKey = `line:${penColor}`;
    if (!geometries.has(edgeKey)) geometries.set(edgeKey, new THREE.EdgesGeometry(geometry(kind), 32));
    if (!materials.has(lineKey)) materials.set(lineKey, createInkLineMaterial(penColor, { opacity: .6 }));
    const edge = new THREE.LineSegments(geometries.get(edgeKey), materials.get(lineKey));
    edge.name = 'structural-pen-lines'; edge.userData.visualOutline = true;
    item.add(edge);
  }
  return item;
}

function pivot(parent, name, position = [0, 0, 0]) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  return group;
}

function segment(parent, color, a, b, radius = 0.035) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const item = mesh(parent, 'tube', color, [radius, direction.length(), radius]);
  item.position.copy(start).add(end).multiplyScalar(0.5);
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return item;
}

// Curved pen strokes share geometry across every instance of the same creature.
function penCurve(parent, points, radius = .014, color = 'faceInk') {
  const key = `curve:${radius}:${JSON.stringify(points)}`;
  if (!geometries.has(key)) {
    const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    geometries.set(key, new THREE.TubeGeometry(path, Math.max(8, points.length * 3), radius, 5, false));
  }
  return mesh(parent, key, color, [1, 1, 1]);
}

function newCharacter(name, height, colliderRadius, kind = 'humanoid') {
  const root = new THREE.Group();
  root.name = name;
  const motion = pivot(root, 'character-motion');
  root.userData.height = height;
  root.userData.colliderRadius = colliderRadius;
  root.userData.characterKind = kind;
  if (['inkling', 'shade', 'brute', 'archer', 'boss', 'doodler', 'lantern', 'crab'].includes(kind)) root.userData.inkOverride = INK_COLORS.red;
  root.userData.rig = { motion };
  root.userData.animation = { attack: 0, death: 0, gait: 0, previousTime: null };
  return root;
}

function finishCharacter(root) {
  // Measure decorated geometry too: hats/horns must fit the reported height.
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3(),partBounds=new THREE.Box3();
  root.traverse(part=>{if(!part.isMesh||part.userData.visualOutline)return;if(!part.geometry.boundingBox)part.geometry.computeBoundingBox();partBounds.copy(part.geometry.boundingBox).applyMatrix4(part.matrixWorld);bounds.union(partBounds);});
  const targetHeight = root.userData.height;
  const ratio = targetHeight / Math.max(0.01, bounds.max.y - bounds.min.y);
  const motion = root.userData.rig.motion;
  motion.scale.multiplyScalar(ratio);
  motion.position.y = -bounds.min.y * ratio;
  root.userData.motionRestY = motion.position.y;
  // Visual proportions can evolve without changing the original collider data.
  const colliderRadii = { hero: .28982951205173424, inkling: .275458600930083,
    shade: .36388866783051543, brute: .5391145019706811, archer: .22552363636574904,
    boss: .8849385228429968, merchant: .28421652421652416, villager: .27430199430199426,
    doodler: .38, lantern: .38, crab: .68 };
  root.userData.colliderRadius = colliderRadii[root.userData.enemyType ?? root.userData.npcKind ?? 'hero']
    ?? root.userData.colliderRadius;
  root.userData.rigScale = motion.scale.y;
  root.updateMatrixWorld(true);
  return root;
}

function eyes(head, height, depth, spacing, luminous = false) {
  for (const side of [-1, 1]) {
    mesh(head, 'head', 'faceInk', [0.011, 0.018, 0.008],
      [side * spacing, height, depth], [0, 0, side * -0.09], luminous);
  }
}

function humanoid({ name, shirt = 'indigo', trousers = 'indigoDark', height = 1.7,
  skin = 'skin', width = 1, kind = 'humanoid' } = {}) {
  const root = newCharacter(name, height, 0.29 * width * height / 1.7, kind);
  const rig = root.userData.rig;
  const motion = rig.motion;
  const factor = height / 1.7;
  motion.scale.setScalar(factor);
  rig.body = pivot(motion, 'body', [0, 0.91, 0]);
  mesh(rig.body, 'taper', shirt, [0.18 * width, 0.40, 0.085], [0, 0.20, 0]);
  segment(rig.body, trousers, [-.12 * width, -.07, 0], [.12 * width, -.07, 0], .026);
  rig.neck=mesh(motion, 'tube', skin, [0.024, 0.13, 0.024], [0, 1.365, 0]);
  rig.head = pivot(motion, 'head', [0, 1.50, 0]);
  mesh(rig.head, 'head', skin, [0.18, 0.18, 0.165]);
  eyes(rig.head, 0.024, 0.157, 0.059, skin === 'ink');
  segment(rig.head, 'faceInk', [-.035, -.054, .157], [0, -.064, .165], .006);
  segment(rig.head, 'faceInk', [0, -.064, .165], [.036, -.052, .157], .006);
  for (const [side, armName, legName, handName] of [
    [-1, 'leftArm', 'leftLeg', 'leftHand'], [1, 'rightArm', 'rightLeg', 'rightHand'],
  ]) {
    const arm = rig[armName] = pivot(motion, armName, [side * 0.195 * width, 1.235, 0]);
    mesh(arm, 'taper', shirt, [0.033, 0.21, 0.034], [0, -0.095, 0]);
    mesh(arm, 'tube', skin, [0.020, 0.27, 0.020], [0, -0.325, 0.015]);
    mesh(arm, 'head', skin, [0.032, 0.042, 0.027], [0, -0.48, 0.02]);
    rig[handName] = pivot(arm, handName, [0, -0.475, 0.065]);
    const leg = rig[legName] = pivot(motion, legName, [side * 0.13 * width, 0.80, 0]);
    mesh(leg, 'tube', trousers, [0.024, 0.37, 0.024], [0, -0.18, 0]);
    mesh(leg, 'tube', trousers, [0.021, 0.35, 0.021], [0, -0.53, 0]);
    mesh(leg, 'head', 'charcoal', [0.039, 0.036, 0.086], [0, -0.732, 0.045]);
  }
  root.userData.rigScale = factor;
  return root;
}

/** V2 red-scarf traveller restored; firearm sockets and two-hand poses retained. */
export function createHero() {
  const root = humanoid({ name: 'Scarlet-scarf traveller', kind: 'hero' });
  const rig = root.userData.rig;
  mesh(rig.head, 'ring', 'red', [.18, .166, .105], [0, .07, 0], [Math.PI / 2, 0, 0]);
  mesh(rig.body, 'ring', 'red', [.074, .068, .17], [0, .425, 0], [Math.PI / 2, 0, 0]);
  segment(rig.body, 'faceInk', [.055, .02, .085], [.025, .355, .085], .004);
  for (const y of [.14, .24, .34]) segment(rig.body, 'faceInk', [-.02, y, .085], [.05, y, .086], .004);
  const scarf = rig.scarf = pivot(rig.body, 'scarf-tail', [-.055, .405, -.04]);
  mesh(scarf, 'box', 'red', [.060, .24, .012], [-.035, -.115, -.035], [-.20, 0, -.28]);
  mesh(scarf, 'box', 'red', [.038, .19, .012], [.018, -.09, -.045], [-.35, 0, .25]);
  mesh(rig.body, 'head', 'leather', [.064, .085, .035], [.195, -.015, 0]);
  // Retain V2 skin/sleeves/palms exactly at rest; repose the same meshes for two-hand guns.
  rig.armSegments=[];
  for(const side of[-1,1]){
    const arm=rig[side<0?'leftArm':'rightArm'],hand=rig[side<0?'leftHand':'rightHand'];
    const [upper,lower,palm]=arm.children.filter(child=>child.isMesh);
    const restTransforms=[upper,lower,palm,hand].map(node=>({node,position:node.position.toArray(),quaternion:node.quaternion.toArray(),scale:node.scale.toArray()}));
    rig.armSegments.push({arm,upper,lower,palm,hand,side,restElbow:[0,-.20,.012],restHand:hand.position.toArray(),
      upperRadius:[upper.scale.x,upper.scale.z],lowerRadius:[lower.scale.x,lower.scale.z],
      palmOffset:palm.position.clone().sub(hand.position).toArray(),restTransforms});
  }
  rig.gunAim=pivot(rig.motion,'two-hand-firearm-aim',[.17,1.08,.22]);
  root.userData.firearmSocket=rig.gunAim;
  for(const side of ['left','right']){
    const leg=rig[side+'Leg'],parts=leg.children.filter(c=>c.isMesh),knee=pivot(leg,side+'-knee',[0,-.37,0]);
    for(const part of parts.slice(1)){leg.remove(part);knee.add(part);part.position.y+=.37;}
    rig[side+'Knee']=knee;
    rig[side+'Foot']=parts.at(-1);
  }
  root.userData.visualStyle='scarlet-scarf-traveller';
  root.userData.weaponSocket = rig.rightHand;
  root.userData.offhandSocket = rig.leftHand;
  finishCharacter(root);
  rig.poseRest=['body','head','neck','leftArm','rightArm','leftHand','rightHand','leftLeg','rightLeg','leftKnee','rightKnee','gunAim'].map(key=>{
    const node=rig[key];return {node,position:node.position.clone(),rotation:node.rotation.clone(),scale:node.scale.clone()};
  });
  return root;
}

const posedFeetBounds=new THREE.Box3(),posedOtherFoot=new THREE.Box3(),poseRootPosition=new THREE.Vector3(),poseRootScale=new THREE.Vector3();
function groundPosedFeet(root){
  const rig=root.userData.rig;root.updateWorldMatrix(true,true);
  posedFeetBounds.setFromObject(rig.leftFoot);posedOtherFoot.setFromObject(rig.rightFoot);posedFeetBounds.union(posedOtherFoot);
  root.getWorldPosition(poseRootPosition);root.getWorldScale(poseRootScale);
  rig.motion.position.y+=(poseRootPosition.y+.003-posedFeetBounds.min.y)/Math.max(.001,poseRootScale.y);
}

function createInkling() {
  const root = newCharacter('Inkling', 1.06, 0.28, 'inkling');
  const rig = root.userData.rig;
  rig.body = pivot(rig.motion, 'body', [0, .46, 0]);
  mesh(rig.body, 'taper', 'inkBlue', [.12, .28, .075]);
  rig.head = pivot(rig.body, 'head', [0, .33, 0]);
  mesh(rig.head, 'head', 'paper', [.21, .205, .18]);
  eyes(rig.head, .014, .171, .073, true);
  segment(rig.head, 'faceInk', [-.057, .058, .161], [-.091, .076, .151], .007);
  segment(rig.head, 'faceInk', [.057, .058, .161], [.091, .076, .151], .007);
  mesh(rig.head, 'cone', 'ink', [.047, .11, .046], [-.13, .18, -.015], [0, 0, -.3]);
  mesh(rig.head, 'cone', 'ink', [.047, .11, .046], [.13, .18, -.015], [0, 0, .3]);
  for (const [side, armName, legName] of [[-1, 'leftArm', 'leftLeg'], [1, 'rightArm', 'rightLeg']]) {
    const arm = rig[armName] = pivot(rig.body, armName, [side * .11, .085, 0]);
    segment(arm, 'ink', [0, 0, 0], [side * .055, -.24, .025], .019);
    mesh(arm, 'head', 'ink', [.029, .034, .027], [side * .055, -.24, .025]);
    const leg = rig[legName] = pivot(rig.motion, legName, [side * .075, .325, 0]);
    segment(leg, 'ink', [0, 0, 0], [side * .028, -.28, .025], .021);
    mesh(leg, 'head', 'ink', [.037, .035, .07], [side * .028, -.29, .05]);
  }
  return root;
}

function createShade() {
  const root = newCharacter('Veiled shade', 1.92, 0.32, 'shade');
  const rig = root.userData.rig;
  rig.body = pivot(rig.motion, 'body', [0, 0.90, 0]);
  mesh(rig.body, 'taper', 'violet', [0.32, 0.80, 0.20], [0, -0.07, 0]);
  mesh(rig.body, 'cone', 'ink', [0.27, 0.72, 0.18], [0, 0.51, -0.035]);
  rig.head = pivot(rig.motion, 'head', [0, 1.52, 0.11]);
  mesh(rig.head, 'head', 'paper', [0.15, 0.20, 0.13]);
  eyes(rig.head, 0.009, 0.128, 0.052, true);
  for (let index = 0; index < 5; index++) {
    const x = (index - 2) * 0.107;
    mesh(rig.body, 'cone', index % 2 ? 'violet' : 'ink', [0.074, 0.48, 0.055],
      [x, -0.57 + (index % 2) * 0.045, 0], [Math.PI, 0, (index - 2) * 0.08]);
  }
  for (const [side, armName, legName] of [[-1, 'leftArm', 'leftLeg'], [1, 'rightArm', 'rightLeg']]) {
    const arm = rig[armName] = pivot(rig.motion, armName, [side * 0.265, 1.28, 0]);
    mesh(arm, 'taper', 'violet', [0.029, 0.45, 0.025], [0, -0.20, 0]);
    mesh(arm, 'cone', 'jade', [0.028, 0.24, 0.025], [0, -0.50, 0.015], [Math.PI, 0, 0]);
    rig[legName] = pivot(rig.motion, legName);
  }
  return root;
}

function createBrute() {
  const root = humanoid({ name: 'Stone-ink brute', height: 2.16, width: 1.55,
    shirt: 'inkBlue', trousers: 'ink', skin: 'ink', kind: 'brute' });
  const rig = root.userData.rig;
  mesh(rig.body, 'head', 'charcoal', [.34, .29, .12], [0, .18, -.025]);
  for (const side of [-1, 1]) {
    const arm = side < 0 ? rig.leftArm : rig.rightArm;
    mesh(arm, 'head', 'charcoal', [.13, .16, .10], [0, -.40, .01]);
    mesh(rig.head, 'cone', 'bronze', [0.09, 0.27, 0.075], [side * 0.14, 0.14, -0.02], [0, 0, side * -0.55]);
  }
  mesh(rig.head, 'head', 'paper', [.153, .157, .032], [0, -.014, .14]);
  eyes(rig.head, .011, .174, .065, true);
  return root;
}

function createArcher() {
  const root = humanoid({ name: 'Reed-mask archer', height: 1.77, width: 0.82,
    shirt: 'jade', trousers: 'inkBlue', skin: 'ink', kind: 'archer' });
  const rig = root.userData.rig;
  mesh(rig.head, 'cone', 'inkBlue', [0.205, 0.33, 0.19], [0, 0.17, -0.045], [-0.18, 0, 0]);
  mesh(rig.head, 'head', 'paper', [0.145, 0.16, 0.045], [0, -0.01, 0.132]);
  mesh(rig.head, 'cone', 'gold', [0.04, 0.15, 0.045], [0, -0.049, 0.22], [Math.PI / 2, 0, 0]);
  eyes(rig.head, 0.025, 0.183, 0.06, true);
  for (const side of [-1, 1]) {
    segment(rig.head, 'bronze', [side * 0.12, 0.08, 0], [side * 0.24, 0.33, -0.04], 0.018);
    segment(rig.head, 'bronze', [side * 0.2, 0.24, -0.02], [side * 0.3, 0.28, 0], 0.013);
  }
  mesh(rig.body, 'tube', 'wood', [0.095, 0.56, 0.095], [0.11, 0.16, -0.245], [0, 0, -0.15]);
  for (const x of [0.07, 0.11, 0.15]) {
    segment(rig.body, 'sand', [x, 0.24, -0.245], [x + 0.05, 0.61, -0.245], 0.009);
  }
  const bow = pivot(rig.leftHand, 'reed-bow');
  mesh(bow, 'bow', 'wood', [0.44, 0.28, 0.28], [0, 0, 0], [0, 0, -Math.PI / 2]);
  segment(bow, 'paper', [0, -0.44, 0], [0, 0.44, 0], 0.008);
  return root;
}

function createBoss() {
  const root = newCharacter('Masked ink guardian', 3.30, 0.86, 'boss');
  const rig = root.userData.rig;
  rig.body = pivot(rig.motion, 'body', [0, 1.32, -0.07]);
  mesh(rig.body, 'head', 'ink', [.62, .77, .28], [0, .45, -.06]);
  mesh(rig.body, 'ring', 'bronze', [0.33, 0.29, 0.14], [0, 0.35, 0.44]);
  mesh(rig.body, 'orb', 'jade', [0.13, 0.15, 0.075], [0, 0.35, 0.47], [0, 0, 0], true);
  rig.head = pivot(rig.motion, 'head', [0, 2.44, 0.08]);
  mesh(rig.head, 'head', 'paper', [.43, .46, .30]);
  for (const side of [-1, 1]) {
    mesh(rig.head, 'box', 'faceInk', [.020, .24, .010], [side * .24, -.058, .27], [0, 0, side * -.15]);
    mesh(rig.head, 'box', 'faceInk', [.12, .036, .012], [side * .151, .05, .295],
      [0, 0, side * 0.15], true);
    mesh(rig.head, 'cone', 'sand', [0.145, 0.59, 0.13], [side * 0.38, 0.43, -0.08], [0.10, 0, side * -0.48]);
    mesh(rig.head, 'cone', 'paper', [0.073, 0.27, 0.076], [side * 0.19, -0.38, 0.33], [Math.PI, 0, side * 0.12]);
    const armName = side < 0 ? 'leftArm' : 'rightArm';
    const arm = rig[armName] = pivot(rig.motion, armName, [side * 0.73, 2.07, -0.015]);
    mesh(arm, 'head', 'ink', [.17, .21, .16], [side * .02, -.05, 0]);
    mesh(arm, 'taper', 'inkBlue', [.070, .85, .07], [side * .055, -.56, .02]);
    mesh(arm, 'head', 'charcoal', [.18, .21, .14], [side * .075, -1.05, .09]);
    for (const claw of [-1, 0, 1]) {
      mesh(arm, 'cone', 'paper', [0.052, 0.20, 0.052],
        [side * 0.075 + claw * 0.13, -1.16, 0.31], [Math.PI * 0.72, 0, 0]);
    }
    const legName = side < 0 ? 'leftLeg' : 'rightLeg';
    const leg = rig[legName] = pivot(rig.motion, legName, [side * 0.33, 1.12, -0.04]);
    mesh(leg, 'taper', 'ink', [.085, .64, .085], [0, -.28, 0]);
    mesh(leg, 'tube', 'inkBlue', [.064, .37, .066], [0, -.72, .015]);
    mesh(leg, 'head', 'charcoal', [.115, .095, .23], [0, -1.01, .10]);
  }
  for (let index = 0; index < 7; index++) {
    const angle = -1.2 + index * 0.4;
    mesh(rig.body, 'cone', index % 2 ? 'inkBlue' : 'ink', [0.16, 0.49, 0.15],
      [Math.sin(angle) * 0.8, 0.71 + Math.cos(angle) * 0.29, -0.32],
      [-0.45, 0, -angle]);
  }
  rig.tail = pivot(rig.body, 'tail', [0, -0.24, -0.41]);
  segment(rig.tail, 'ink', [0, 0, 0], [0.12, -0.11, -0.59], 0.11);
  mesh(rig.tail, 'orb', 'inkBlue', [0.18, 0.16, 0.24], [0.12, -0.11, -0.65]);
  return root;
}

function chargeMark(parent, position, size) {
  const cue = pivot(parent, 'attack-warning', position);
  cue.userData.inkOverride = INK_COLORS.orange;
  mesh(cue, 'ring', 'glow', [size, size, size * .4]);
  for (const side of [-1, 1]) segment(cue, 'faceInk', [side * size * 1.45, -.02, 0],
    [side * size * 1.9, .045, 0], .008);
  // Hidden after height measurement, so decorations never change collider size.
  return cue;
}

/** Round paper head/belly and bent ink strokes, with an original pencil emitter. */
function createDoodler() {
  const root = newCharacter('Doodler · 涂鸦墨兵', 1.8, .38, 'doodler');
  const rig = root.userData.rig;
  rig.body = pivot(rig.motion, 'round-belly', [0, .89, 0]);
  mesh(rig.body, 'head', 'outlinePaper', [.282, .278, .12]);
  penCurve(rig.body, [[-.06, -.04, .119], [0, -.068, .135], [.075, -.035, .118]], .006);
  segment(rig.motion, 'faceInk', [0, 1.10, 0], [.015, 1.25, 0], .022);
  rig.head = pivot(rig.motion, 'round-head', [.012, 1.49, 0]);
  mesh(rig.head, 'head', 'outlinePaper', [.31, .281, .235]);
  eyes(rig.head, .018, .224, .084);
  penCurve(rig.head, [[-.14, .094, .209], [-.096, .114, .226], [-.049, .091, .228]], .012);
  segment(rig.head, 'faceInk', [.044, .074, .23], [.134, .112, .214], .012);
  penCurve(rig.head, [[-.055, -.071, .222], [.005, -.088, .234], [.056, -.068, .222]], .009);
  rig.hat = pivot(rig.head, 'crooked-cap', [.025, .199, -.025]);
  rig.hat.rotation.z = -.16;
  // Ordinary enemies stay bare-headed; the old hat anchor remains animation-compatible.
  for (const side of [-1, 1]) {
    const leg = rig[side < 0 ? 'leftLeg' : 'rightLeg'] = pivot(rig.motion,
      side < 0 ? 'leftLeg' : 'rightLeg', [side * .145, .64, 0]);
    penCurve(leg, [[0, 0, 0], [side * .014, -.22, -.02], [-side * .012, -.43, .02],
      [side * .012, -.55, .015]], .015);
    mesh(leg, 'head', 'outlinePaper', [.065, .038, .104], [side * .012, -.59, .06]);
    const arm = rig[side < 0 ? 'leftArm' : 'rightArm'] = pivot(rig.motion,
      side < 0 ? 'leftArm' : 'rightArm', [side * .263, 1.045, 0]);
    penCurve(arm, [[0, 0, 0], [side * .10, -.14, .025], [side * .045, -.205, .135],
      [side * .008, -.11, .255]], .015);
    mesh(arm, 'head', 'outlinePaper', [.032, .030, .043], [side * .008, -.11, .26]);
  }
  rig.weapon = pivot(rig.rightArm, 'pencil-launcher', [.008, -.075, .255]);
  mesh(rig.weapon, 'tube', 'paper', [.048, .43, .048], [0, .024, .115], [Math.PI / 2, 0, 0]);
  mesh(rig.weapon, 'cone', 'paper', [.047, .145, .047], [0, .024, .40], [Math.PI / 2, 0, 0]);
  mesh(rig.weapon, 'cone', 'faceInk', [.015, .055, .015], [0, .024, .486], [Math.PI / 2, 0, 0]);
  mesh(rig.weapon, 'tube', 'paper', [.053, .055, .053], [0, .024, -.12], [Math.PI / 2, 0, 0]);
  segment(rig.weapon, 'faceInk', [-.031, .061, -.075], [-.031, .061, .31], .006);
  rig.muzzle = pivot(rig.weapon, 'pencil-tip', [0, .024, .51]);
  rig.chargeCue = chargeMark(rig.weapon, [0, .024, .53], .075);
  return root;
}

/** A floating paper lantern; the game supplies hover height on the outer root. */
function createLantern() {
  const root = newCharacter('Lantern · 灯笼精', 1.4, .38, 'lantern');
  const rig = root.userData.rig;
  rig.body = pivot(rig.motion, 'lantern-body', [0, .92, 0]);
  mesh(rig.body, 'head', 'paper', [.315, .415, .29]);
  for (const y of [-.35, .35]) {
    mesh(rig.body, 'tube', 'paper', [.23, .065, .22], [0, y, 0]);
    mesh(rig.body, 'ring', 'paper', [.248, .237, .16], [0, y, 0], [Math.PI / 2, 0, 0]);
  }
  for (let index = 0; index < 10; index++) {
    const angle = index * Math.PI / 5;
    const points = [-.35, -.23, 0, .23, .35].map(y => {
      const radius = .319 * Math.sqrt(1 - (y / .51) ** 2);
      return [Math.sin(angle) * radius, y, Math.cos(angle) * radius * .923];
    });
    penCurve(rig.body, points, .008);
  }
  rig.handle = pivot(rig.body, 'hanging-loop', [0, .39, 0]);
  penCurve(rig.handle, [[-.105, 0, 0], [-.09, .12, 0], [.035, .16, 0], [.102, .065, 0], [.105, 0, 0]], .016);
  rig.head = pivot(rig.body, 'lantern-face', [0, .055, .274]);
  eyes(rig.head, 0, .017, .092);
  for (const side of [-1, 1]) segment(rig.head, 'faceInk', [side * .14, .059, .007], [side * .055, .031, .018], .011);
  mesh(rig.head, 'head', 'faceInk', [.037, .057, .011], [0, -.12, .016]);
  rig.tails = [];
  for (let index = 0; index < 3; index++) {
    const tail = pivot(rig.body, `paper-tail-${index}`, [(index - 1) * .105, -.385, 0]);
    mesh(tail, 'box', 'paper', [.064, .28 + index * .032, .012], [0, -.13 - index * .016, 0]);
    penCurve(tail, [[-.014, -.03, .009], [.012, -.09, .009], [-.014, -.155, .009], [.012, -.22, .009]], .005);
    rig.tails.push(tail);
  }
  rig.tassel = pivot(rig.body, 'tassel', [0, -.43, -.025]);
  for (const x of [-.045, -.022, 0, .022, .045]) {
    penCurve(rig.tassel, [[x * .3, 0, 0], [x, -.24, .025], [x * 1.3, -.40 + Math.abs(x), .045]], .007);
  }
  rig.chargeCue = chargeMark(rig.body, [0, -.105, .319], .069);
  // Semantic anchors keep generic rig consumers compatible; this creature has no legs.
  rig.leftArm = rig.tails[0]; rig.rightArm = rig.tails[2];
  rig.leftLeg = pivot(rig.motion, 'leftLeg'); rig.rightLeg = pivot(rig.motion, 'rightLeg');
  return root;
}

/** Six separate walking legs, two hinged pincers and a high coiled paper shell. */
function createCrab() {
  const root = newCharacter('Crab · 寄甲蟹', 1.1, .68, 'crab');
  const rig = root.userData.rig;
  rig.body = pivot(rig.motion, 'crab-body', [0, .33, 0]);
  mesh(rig.body, 'head', 'paper', [.47, .21, .40]);
  rig.shell = pivot(rig.body, 'coiled-shell', [0, .16, -.11]);
  mesh(rig.shell, 'head', 'paper', [.435, .395, .425]);
  const coil = [];
  for (let index = 0; index <= 28; index++) {
    const angle = index / 28 * Math.PI * 4.4, radius = .29 * (1 - index / 33);
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    coil.push([x, .05 + y, .426 * Math.sqrt(Math.max(.12, 1 - (x / .45) ** 2 - ((.05 + y) / .41) ** 2)) + .01]);
  }
  penCurve(rig.shell, coil, .010);
  rig.head = pivot(rig.body, 'crab-face', [0, .045, .37]);
  rig.eyestalks = [];
  for (const side of [-1, 1]) {
    const stalk = pivot(rig.head, side < 0 ? 'left-eye-stalk' : 'right-eye-stalk', [side * .17, 0, 0]);
    penCurve(stalk, [[0, 0, 0], [side * .033, .18, .028], [side * .061, .35, .008]], .017);
    mesh(stalk, 'head', 'paper', [.062, .074, .049], [side * .061, .35, .008]);
    mesh(stalk, 'head', 'faceInk', [.014, .023, .009], [side * .061, .35, .055]);
    segment(stalk, 'faceInk', [side * .061 - .034, .396, .050], [side * .061 + .034, .397, .047], .009);
    rig.eyestalks.push(stalk);
  }
  penCurve(rig.head, [[-.08, -.035, .025], [0, -.055, .052], [.08, -.035, .025]], .010);
  rig.legs = []; rig.pincers = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index++) {
      const leg = pivot(rig.body, `walking-leg-${side}-${index}`, [side * .38, -.03, (index - 1) * .24]);
      leg.userData.side = side; leg.userData.index = index;
      penCurve(leg, [[0, 0, 0], [side * .25, .025, (index - 1) * .045],
        [side * .35, -.09, (index - 1) * .08], [side * .44, -.26, (index - 1) * .13]], .022);
      mesh(leg, 'head', 'paper', [.048, .025, .045], [side * .44, -.26, (index - 1) * .13]);
      rig.legs.push(leg);
    }
    const arm = rig[side < 0 ? 'leftArm' : 'rightArm'] = pivot(rig.body,
      side < 0 ? 'leftArm' : 'rightArm', [side * .33, .055, .29]);
    penCurve(arm, [[0, 0, 0], [side * .21, .075, .10], [side * .30, .025, .23]], .032);
    const claw = pivot(arm, side < 0 ? 'left-pincer' : 'right-pincer', [side * .30, .025, .26]);
    mesh(claw, 'head', 'paper', [.12, .09, .12]);
    const fingers = [];
    for (const opening of [-1, 1]) {
      const finger = pivot(claw, `pincer-finger-${opening}`, [opening * .061, 0, .06]);
      penCurve(finger, [[0, 0, 0], [opening * .067, .006, .08], [opening * .051, .01, .18],
        [-opening * .035, .012, .235]], .029, 'paper');
      finger.userData.opening = opening; fingers.push(finger);
    }
    rig.pincers.push({ root: claw, fingers, side });
  }
  rig.leftLeg = rig.legs[0]; rig.rightLeg = rig.legs[3];
  rig.chargeCue = chargeMark(rig.head, [0, .17, .06], .07);
  return root;
}

/** Distinct silhouettes; unknown types intentionally use the small inkling. */
export function createEnemy(type = 'inkling') {
  const creators = { inkling: createInkling, shade: createShade, brute: createBrute,
    archer: createArcher, boss: createBoss, doodler: createDoodler, lantern: createLantern, crab: createCrab };
  const knownType = Object.hasOwn(creators, type) ? type : 'inkling';
  const root = creators[knownType]();
  root.userData.enemyType = knownType;
  finishCharacter(root);
  if (root.userData.rig.chargeCue) root.userData.rig.chargeCue.visible = false;
  return root;
}

export function createNPC(kind = 'villager') {
  const merchant = kind === 'merchant';
  const root = humanoid({ name: merchant ? 'Travelling merchant' : 'Village resident',
    shirt: merchant ? 'sand' : 'green', trousers: 'charcoal', height: merchant ? 1.72 : 1.66 });
  const rig = root.userData.rig;
  root.userData.npcKind = merchant ? 'merchant' : 'villager';
  mesh(rig.head, 'cone', 'straw', [0.36, 0.15, 0.30], [0, 0.18, -0.015]);
  if (merchant) {
    mesh(rig.body, 'box', 'leather', [0.052, 0.5, 0.025], [-0.08, 0.22, 0.179], [0, 0, 0.46]);
    mesh(rig.body, 'box', 'wood', [0.46, 0.46, 0.20], [0, 0.16, -0.25]);
    for (const x of [-0.17, 0.17]) {
      mesh(rig.body, 'box', 'bronze', [0.035, 0.47, 0.025], [x, 0.16, -0.365]);
    }
    mesh(rig.body, 'orb', 'red', [0.10, 0.13, 0.07], [0.24, 0.035, 0.15]);
    mesh(rig.head, 'cone', 'paper', [0.08, 0.17, 0.042], [0, -0.145, 0.134], [Math.PI, 0, 0]);
  } else {
    mesh(rig.body, 'box', 'paper', [0.29, 0.39, 0.021], [0, 0.11, 0.176]);
    mesh(rig.body, 'box', 'sand', [0.43, 0.048, 0.021], [0, 0.2, 0.18]);
  }
  return finishCharacter(root);
}

/** Handheld weapons use the origin as their grip; melee shafts run along +Y.
 * Crossbow bolts fire along +Z. Returned meshes may also be shown as shop items. */
export function createWeapon(id = 'sword') {
  if(id==='rifle'||id==='shotgun')return createPaperFirearm(id);
  const root = new THREE.Group();
  const knownId = ['sword', 'spear', 'crossbow', 'staff','knife','pan'].includes(id) ? id : 'sword';
  root.name = `Weapon: ${knownId}`;
  root.userData.weaponId = knownId;
  root.userData.gripAxis = knownId === 'crossbow' ? '+Z' : '+Y';
  if(knownId==='knife'){
    mesh(root,'box','leather',[.065,.22,.045],[0,-.035,0]);
    mesh(root,'box','steel',[.10,.025,.065],[0,.085,0]);
    mesh(root,'box','outlinePaper',[.07,.26,.018],[0,.225,0]);
    mesh(root,'cone','steel',[.043,.14,.012],[0,.425,0]);
    segment(root,'faceInk',[.019,.1,.011],[.019,.35,.011],.004);
    root.userData.tacticalTool='knife';
  }else if(knownId==='pan'){
    mesh(root,'box','wood',[.064,.38,.045],[0,.035,0]);
    mesh(root,'tube','outlinePaper',[.24,.048,.24],[0,.42,0],[Math.PI/2,0,0]);
    mesh(root,'ring','steel',[.24,.24,.24],[0,.42,.03]);
    mesh(root,'tube','faceInk',[.19,.008,.19],[0,.42,-.026],[Math.PI/2,0,0]);
    root.userData.tacticalTool='pan';
  }else if (knownId === 'sword') {
    mesh(root, 'tube', 'leather', [0.035, 0.25, 0.036], [0, -0.045, 0]);
    mesh(root, 'orb', 'bronze', [0.045, 0.046, 0.045], [0, -0.185, 0]);
    mesh(root, 'box', 'gold', [0.25, 0.042, 0.074], [0, 0.105, 0]);
    mesh(root, 'box', 'steel', [0.081, 0.73, 0.026], [0, 0.49, 0]);
    mesh(root, 'cone', 'steel', [0.048, 0.18, 0.017], [0, 0.942, 0]);
    mesh(root, 'box', 'paper', [0.008, 0.70, 0.028], [0.027, 0.49, 0]);
    mesh(root, 'box', 'red', [0.042, 0.20, 0.015], [0.063, -0.19, 0], [0, 0, -0.35]);
  } else if (knownId === 'spear') {
    mesh(root, 'tube', 'wood', [0.031, 1.68, 0.031], [0, 0.33, 0]);
    mesh(root, 'tube', 'bronze', [0.044, 0.16, 0.044], [0, 1.15, 0]);
    mesh(root, 'cone', 'steel', [0.075, 0.36, 0.037], [0, 1.39, 0]);
    for (const side of [-1, 1]) {
      mesh(root, 'box', 'red', [0.038, 0.26, 0.019], [side * 0.07, 1.0, 0], [0, 0, side * 0.36]);
    }
    mesh(root, 'tube', 'leather', [0.036, 0.29, 0.036], [0, 0, 0]);
  } else if (knownId === 'crossbow') {
    mesh(root, 'box', 'wood', [0.095, 0.092, 0.66], [0, 0.08, 0.18]);
    mesh(root, 'box', 'leather', [0.075, 0.23, 0.095], [0, -0.005, -0.10], [-0.20, 0, 0]);
    segment(root, 'bronze', [-0.34, 0.09, 0.25], [0, 0.09, 0.43], 0.029);
    segment(root, 'bronze', [0, 0.09, 0.43], [0.34, 0.09, 0.25], 0.029);
    segment(root, 'paper', [-0.34, 0.11, 0.25], [0, 0.11, -0.05], 0.008);
    segment(root, 'paper', [0, 0.11, -0.05], [0.34, 0.11, 0.25], 0.008);
    segment(root, 'wood', [0, 0.14, -0.15], [0, 0.14, 0.54], 0.01);
    mesh(root, 'cone', 'steel', [0.026, 0.11, 0.023], [0, 0.14, 0.58], [Math.PI / 2, 0, 0]);
  } else {
    mesh(root, 'tube', 'wood', [0.033, 1.42, 0.033], [0, 0.35, 0]);
    mesh(root, 'tube', 'jade', [0.042, 0.21, 0.042], [0, 0, 0]);
    mesh(root, 'ring', 'gold', [0.21, 0.25, 0.18], [0, 1.18, 0]);
    mesh(root, 'orb', 'glow', [0.095, 0.12, 0.075], [0, 1.18, 0], [0, 0, 0], true);
    mesh(root, 'box', 'red', [0.078, 0.24, 0.016], [0.13, 1.0, 0], [0, 0, -0.24]);
  }
  return root;
}

/** Original paper firearm geometry. Grip at origin; muzzle +Z. No combat rules here. */
function createPaperFirearm(id){
  const root=new THREE.Group();root.name=`Weapon: ${id}`;
  const shotgun=id==='shotgun',kick=pivot(root,'firearm-recoil');
  root.userData.weaponId=id;root.userData.kind='firearm';root.userData.gripAxis='+Z';
  const rig=root.userData.rig={kick};
  // Thin box receiver, cut-looking stock and open sight strokes rather than realistic metal.
  mesh(kick,'box','outlinePaper',[.112,.16,shotgun?.41:.37],[0,.12,.11]);
  mesh(kick,'box','outlinePaper',[.085,.15,.25],[0,.095,-.23],[.08,0,0]);
  mesh(kick,'box','outlinePaper',[.125,.23,.048],[0,.08,-.37],[.08,0,0]);
  mesh(kick,'box','outlinePaper',[.076,.23,.10],[0,-.055,-.035],[-.19,0,0]);
  penCurve(kick,[[-.045,.01,.025],[-.056,-.105,.11],[-.047,-.135,.19],[-.047,-.015,.20]],.006);
  const barrelLength=shotgun?.69:.53,barrelCenter=shotgun?.61:.57,muzzleZ=barrelCenter+barrelLength/2;
  mesh(kick,'tube','outlinePaper',[shotgun?.033:.024,barrelLength,shotgun?.033:.024],[0,.151,barrelCenter],[Math.PI/2,0,0]);
  mesh(kick,'tube','faceInk',[shotgun?.019:.012,.012,shotgun?.019:.012],[0,.151,muzzleZ+.007],[Math.PI/2,0,0]);
  if(shotgun){
    mesh(kick,'tube','outlinePaper',[.025,.55,.025],[0,.078,.55],[Math.PI/2,0,0]);
    rig.pump=pivot(kick,'pump-fore-end',[0,.085,.45]);mesh(rig.pump,'box','outlinePaper',[.128,.115,.235]);
    for(const z of[-.085,-.04,.005,.05,.095])segment(rig.pump,'faceInk',[-.065,.058,z],[.065,.058,z],.003);
  }else{
    mesh(kick,'box','outlinePaper',[.124,.122,.28],[0,.108,.40]);
    rig.magazine=pivot(kick,'detachable-magazine',[0,-.08,.165]);mesh(rig.magazine,'box','outlinePaper',[.08,.245,.125],[0,-.072,0],[.1,0,0]);
    for(const z of[.30,.37,.44])segment(kick,'faceInk',[-.064,.154,z],[.064,.154,z],.0035);
  }
  rig.bolt=pivot(kick,'charging-bolt',[.07,.15,.03]);mesh(rig.bolt,'box','faceInk',[.028,.035,.08]);
  mesh(kick,'box','outlinePaper',[.025,.064,.032],[0,.207,muzzleZ-.065]);
  penCurve(kick,[[-.031,.19,-.015],[-.031,.245,-.015],[.031,.245,-.015],[.031,.19,-.015]],.0045);
  segment(kick,'faceInk',[-.057,.205,-.08],[-.057,.205,.28],.0035);
  rig.muzzle=pivot(kick,'muzzle-socket',[0,.151,muzzleZ+.022]);
  rig.support=pivot(kick,'support-hand-socket',[0,.07,shotgun?.42:.37]);
  rig.flash=pivot(rig.muzzle,'paper-muzzle-flash');rig.flash.userData.inkOverride=INK_COLORS.orange;
  for(let i=0;i<5;i++){const angle=i*Math.PI*2/5;segment(rig.flash,'faceInk',[Math.cos(angle)*.035,Math.sin(angle)*.035,0],[Math.cos(angle)*.13,Math.sin(angle)*.13,.05],.01);}
  rig.flash.visible=false;
  root.userData.muzzleSocket=rig.muzzle;root.userData.supportSocket=rig.support;
  root.userData.restPose={magazine:rig.magazine?.position.toArray(),pump:rig.pump?.position.toArray(),bolt:rig.bolt.position.toArray()};
  return root;
}

/** Model-only shot/reload feedback; host supplies real shot pulses and reload progress. */
export function animateWeapon(root,{firePulse=0,reloading=false,reloadProgress=0,aiming=false,time=0}={}){
  if(root?.userData?.kind!=='firearm')return;
  const rig=root.userData.rig,rest=root.userData.restPose,shot=THREE.MathUtils.clamp(Number(firePulse)||0,0,1),progress=THREE.MathUtils.clamp(Number(reloadProgress)||0,0,1),reload=reloading?Math.sin(progress*Math.PI):0,shotgun=root.userData.weaponId==='shotgun';
  rig.kick.position.set(0,0,-shot*(shotgun?.075:.045));rig.kick.rotation.set(-shot*(shotgun?.115:.065)+reload*.18,0,reload*-.08);
  rig.flash.visible=shot>.58&&!reloading;rig.flash.rotation.z=(Number(time)||0)*2.1;
  if(rig.magazine){rig.magazine.position.fromArray(rest.magazine);rig.magazine.position.y-=reload*.23;rig.magazine.rotation.x=reload*-.3;}
  if(rig.pump){rig.pump.position.fromArray(rest.pump);rig.pump.position.z-=Math.sin(Math.PI*shot)*.12+reload*.035;}
  rig.bolt.position.fromArray(rest.bolt);rig.bolt.position.z-=shot*.065;
  root.userData.aiming=!!aiming;
}

function reposePaperArm(part,elbow,hand){
  for(const [item,a,b,r]of[[part.upper,[0,0,0],elbow,part.upperRadius||[.014,.014]],[part.lower,elbow,hand,part.lowerRadius||[.013,.013]]]){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
    item.position.copy(start).add(end).multiplyScalar(.5);item.scale.set(r[0],direction.length(),r[1]);item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  }part.hand.position.set(...hand);
  if(part.palm)part.palm.position.set(...hand).add(new THREE.Vector3(...part.palmOffset));
}

/** Update only the internal rig. Never moves/turns the returned world root.
 * moving accepts a boolean or normalized 0..1 amount. New enemies also accept
 * attackPhase, remaining telegraph/recovering seconds, charging and hitFlash.
 * World x/y/z, hover height and facingX/facingZ remain the host's responsibility. */
export function animateCharacter(group, { moving = false, attacking = false,
  jumping = false, dead = false, time = 0, dt, telegraph = 0, charging = false,
  recovering = 0, attackPhase = 'idle', hitFlash = 0, weaponId = null, aiming = false,
  reloading = false, reloadProgress = 0, firePulse = 0, stance='stand',lean=0,guarding=false } = {}) {
  const rig = group?.userData?.rig;
  if (!rig) return;
  const state = group.userData.animation;
  const now = Number.isFinite(time) ? time : 0;
  const inferredDt = state.previousTime === null ? 0 : now - state.previousTime;
  const delta = Math.max(0, Math.min(0.10, Number.isFinite(dt) ? dt : inferredDt));
  state.previousTime = now;
  const amount = typeof moving === 'number' ? THREE.MathUtils.clamp(moving, 0, 1) : moving ? 1 : 0;
  state.gait += delta * (group.userData.characterKind === 'boss' ? 5.2 : 9.6) * amount;
  state.attack = attacking ? state.attack + delta : 0;
  state.death = THREE.MathUtils.damp(state.death, dead ? 1 : 0, 10, delta);
  const gait = Math.sin(state.gait);
  const oppositeGait = Math.sin(state.gait + Math.PI);
  const breathing = Math.sin(now * 2.1);
  const attack = attacking ? Math.sin(Math.min(1, (state.attack % 0.62) / 0.62) * Math.PI) : 0;
  const alive = 1 - state.death;
  const phase = group.userData.characterKind;
  const special = ['doodler', 'lantern', 'crab'].includes(phase);
  const winding = !dead && (telegraph > 0 || attackPhase === 'telegraph');
  const rushing = !dead && (charging || attackPhase === 'charging');
  const resting = !dead && (recovering > 0 || attackPhase === 'recovering');
  if (special) {
    const released = state.wasWinding && !winding && !dead;
    state.release = released ? 1 : Math.max(0, (state.release || 0) - delta * 5);
    state.wasWinding = winding;
    state.hit = dead ? 0 : Math.max(THREE.MathUtils.clamp(Number(hitFlash) / .15 || 0, 0, 1), (state.hit || 0) - delta * 7);
  }
  const motion = rig.motion;
  if(phase==='hero'){
    for(const rest of rig.poseRest||[]){rest.node.position.copy(rest.position);rest.node.rotation.copy(rest.rotation);rest.node.scale.copy(rest.scale);}
    motion.scale.setScalar(group.userData.rigScale||1);motion.position.x=0;motion.position.z=0;motion.rotation.z=0;
  }
  const stride = (phase === 'boss' ? 0.33 : phase === 'inkling' ? 0.54 : 0.51) * amount * alive;

  // Reset just the properties owned by this function, keeping the rest-pose
  // attachment positions and any outer transforms chosen by the host game.
  if (rig.leftLeg) rig.leftLeg.rotation.set(jumping ? -0.55 : gait * stride, 0, 0);
  if (rig.rightLeg) rig.rightLeg.rotation.set(jumping ? 0.42 : oppositeGait * stride, 0, 0);
  if (rig.leftArm) rig.leftArm.rotation.set(oppositeGait * stride * 0.8 - attack * 0.30, 0, -0.055);
  if (rig.rightArm) rig.rightArm.rotation.set(gait * stride * 0.8 - attack * 1.65, 0, 0.055 + attack * 0.13);
  if (rig.head) rig.head.rotation.set(breathing * 0.018 - attack * 0.09, Math.sin(now * 0.8) * 0.045, 0);
  if (rig.body) rig.body.rotation.set(-amount * 0.055 + attack * 0.10, attack * 0.22, gait * amount * 0.02);
  motion.position.y = (group.userData.motionRestY || 0)
    + (Math.abs(Math.cos(state.gait)) * amount * 0.023 + breathing * 0.008) * alive;
  motion.rotation.x = -state.death * Math.PI * 0.49;
  motion.position.y += state.death * group.userData.colliderRadius * 0.45;
  if (rig.scarf) rig.scarf.rotation.set(-amount * 0.40 + breathing * 0.05, Math.sin(now * 5) * amount * 0.08, 0);
  if (rig.tail) rig.tail.rotation.y = Math.sin(now * 2.6) * 0.28 * alive;

  if(phase==='hero'&&rig.armSegments){
    const gun=rig.gunAim.children.find(c=>c.userData.kind==='firearm'),id=weaponId||gun?.userData.weaponId;
    const holdingGun=!dead&&(id==='rifle'||id==='shotgun');
    rig.gunAim.rotation.set(holdingGun&&reloading?.22:0,0,holdingGun&&reloading?-.16:0);
    rig.gunAim.position.set(.17,1.08+(aiming?.09:0),.22);
    for(const part of rig.armSegments){
      if(!holdingGun){
        if(part.restTransforms)for(const rest of part.restTransforms){rest.node.position.fromArray(rest.position);rest.node.quaternion.fromArray(rest.quaternion);rest.node.scale.fromArray(rest.scale);}
        else reposePaperArm(part,part.restElbow,part.restHand);
        continue;
      }
      part.arm.rotation.set(0,0,0);
      const support=part.side<0,fore=support?(id==='shotgun'?.42:.37):0;
      const target=new THREE.Vector3(0,support?.07:0,fore).applyEuler(rig.gunAim.rotation).add(rig.gunAim.position).sub(part.arm.position);
      if(support&&reloading){const r=Math.sin(THREE.MathUtils.clamp(Number(reloadProgress)||0,0,1)*Math.PI);target.y-=r*.18;target.z-=r*.17;}
      const hand=target.toArray(),elbow=[hand[0]*.4+part.side*.10,hand[1]*.5-.18,hand[2]*.46-.025];reposePaperArm(part,elbow,hand);
    }
    if(holdingGun){rig.body.rotation.set(-amount*.035,0,gait*amount*.012);rig.head.rotation.x=aiming?-.055:0;}
    if(gun)animateWeapon(gun,{firePulse:dead?0:firePulse,reloading:!dead&&reloading,reloadProgress,aiming,time:now});
  }

  if(phase==='hero'&&!dead){
    const scale=group.userData.rigScale||1;
    if(stance==='crouch'){
      motion.position.y-=.64*scale;
      rig.leftLeg.rotation.x=-1.5+gait*amount*.12;rig.rightLeg.rotation.x=-1.5-gait*amount*.12;
      rig.leftKnee.rotation.x=2.7;rig.rightKnee.rotation.x=2.7;
      // Flex hips and knees while retaining the head and torso dimensions.
      for(const node of[rig.body,rig.head,rig.neck,rig.leftArm,rig.rightArm])node.position.y-=.24;
      rig.body.rotation.x=.13;rig.gunAim.position.y-=.24;
    }else if(stance==='prone'){
      motion.position.set(0,0,0);motion.rotation.set(0,0,0);
      rig.body.position.set(0,.18,-.03);rig.body.rotation.set(Math.PI/2,0,0);
      rig.head.position.set(0,.25,.42);rig.head.rotation.set(-.04,Math.sin(now*.8)*.025,0);
      rig.neck.position.set(0,.23,.32);rig.neck.rotation.x=Math.PI/2;
      for(const side of[-1,1]){
        const leg=rig[side<0?'leftLeg':'rightLeg'],knee=rig[side<0?'leftKnee':'rightKnee'],arm=rig[side<0?'leftArm':'rightArm'];
        leg.position.set(side*.13,.12,-.04);leg.rotation.set(Math.PI/2,0,side*.12);
        knee.rotation.set(0,0,-side*(2.50+gait*amount*.10));
        arm.position.set(side*.24,.20,.14);arm.rotation.set(0,0,0);
      }
      rig.gunAim.rotation.set(0,0,0);rig.gunAim.position.set(.15,.24,-.08);
    }
    const gun=rig.gunAim.children.find(c=>c.userData.kind==='firearm');
    if(gun&&stance!=='stand')for(const part of rig.armSegments){
      part.arm.rotation.set(0,0,0);const support=part.side<0;
      const hand=new THREE.Vector3(0,support?.07:0,support?(weaponId==='shotgun'?.42:.37):0).applyEuler(rig.gunAim.rotation).add(rig.gunAim.position).sub(part.arm.position).toArray();
      reposePaperArm(part,[hand[0]*.4+part.side*.1,hand[1]*.45-.07,hand[2]*.45],hand);
    }
    if(!gun&&stance==='prone')for(const part of rig.armSegments){
      const hand=[part.side*-.02,-.11,.35],elbow=[part.side*.13,-.13,.16];reposePaperArm(part,elbow,hand);part.hand.rotation.x=Math.PI/2;
    }
    if(guarding&&weaponId==='pan'){
      if(stance==='prone'){rig.rightHand.rotation.x=0;rig.leftHand.rotation.x=0;}
      else{rig.rightArm.rotation.set(-1.2,-.1,-.65);rig.leftArm.rotation.set(-.7,0,.2);}
    }
    if(stance!=='prone'){motion.rotation.z=lean*.13;motion.position.x=-lean*.17;}
    if(stance==='crouch'||stance==='prone')groundPosedFeet(group);
    group.userData.stance=stance;group.userData.guarding=guarding;
  }

  if (phase === 'shade') {
    motion.position.y += (0.12 + Math.sin(now * 2.6) * 0.065) * alive;
    rig.leftArm.rotation.x -= 0.25 + attack * 0.8;
    rig.rightArm.rotation.x -= 0.25;
    rig.body.rotation.z += Math.sin(now * 1.5) * 0.045;
  } else if (phase === 'inkling') {
    motion.position.y += Math.abs(gait) * amount * 0.105 * alive;
    rig.body.rotation.z = gait * amount * 0.13 * alive;
  } else if (phase === 'archer') {
    rig.leftArm.rotation.x = -1.18 - attack * 0.1;
    rig.leftArm.rotation.y = -0.2;
    rig.rightArm.rotation.x = -0.9 - attack * 0.25;
    rig.rightArm.rotation.y = -0.62 + attack * 0.3;
  } else if (phase === 'boss') {
    rig.leftArm.rotation.x -= attack * 1.2;
    rig.body.rotation.x -= 0.10;
  } else if (phase === 'doodler') {
    const wind = winding ? THREE.MathUtils.clamp(1 - telegraph / .75, .12, 1) : 0;
    const kick = Math.max(state.release, attack * .6) * alive;
    rig.leftArm.rotation.set(-.16 - wind * .78 - kick * .2, -.18 * wind, -.08 - wind * .22);
    rig.rightArm.rotation.set(-.10 - wind * .27 - kick * .36, -.13 * wind, .035);
    rig.body.rotation.set(-amount * .06 + wind * .16 + kick * .09, -.11 * wind, gait * amount * .06);
    rig.head.rotation.set(-wind * .07 - state.hit * .20, .02 * breathing, -.07 * wind);
    rig.hat.rotation.z = -.16 + Math.sin(now * 12) * state.hit * .14;
    rig.weapon.rotation.x = kick * .27;
    rig.weapon.position.z = .255 - kick * .07;
    rig.leftLeg.rotation.x *= winding ? .22 : 1;
    rig.rightLeg.rotation.x *= winding ? .22 : 1;
    motion.position.y += Math.abs(gait) * amount * .027 * alive;
  } else if (phase === 'lantern') {
    const wind = winding ? THREE.MathUtils.clamp(1 - telegraph / .8, .12, 1) : 0;
    const kick = Math.max(state.release, attack * .45) * alive;
    rig.body.scale.set(1 + wind * .16 + state.hit * .055,
      1 - wind * .11 - state.death * .42, 1 + wind * .12);
    rig.body.rotation.set(-amount * .12 + kick * .30, Math.sin(now * 1.5) * .065,
      Math.sin(now * 2.3) * .055 * alive);
    rig.head.rotation.set(-wind * .12, 0, 0);
    rig.handle.rotation.z = Math.sin(now * 3.8) * .12 * alive;
    for (let index = 0; index < rig.tails.length; index++) {
      const tail = rig.tails[index];
      tail.rotation.set(Math.sin(now * 5.2 + index) * .18 + amount * .38 + wind * .36 - kick * .35,
        0, Math.sin(now * 3.8 + index * 1.7) * (.12 + wind * .14) * alive);
    }
    rig.tassel.rotation.set(amount * .35 + Math.sin(now * 4.4) * .11, 0, Math.sin(now * 3.1) * .14);
    motion.position.y += Math.sin(now * 2.6) * .055 * alive + wind * .10 - state.death * .30;
    motion.rotation.x = -state.death * .65;
  } else if (phase === 'crab') {
    const wind = winding ? THREE.MathUtils.clamp(1 - telegraph / .8, .12, 1) : 0;
    const thrust = rushing ? 1 : state.release * .6;
    const fatigue = resting ? Math.min(1, recovering / 1.15) : 0;
    rig.body.rotation.set(wind * .15 - thrust * .21 + fatigue * .08, 0,
      Math.sin(state.gait * 1.6) * amount * .026 * alive);
    rig.body.scale.set(1, 1 - wind * .11, 1);
    rig.shell.rotation.set(wind * -.10 + fatigue * .06, Math.sin(now * 1.8) * .025 * alive, 0);
    rig.head.rotation.set(-wind * .16 + thrust * .18, 0, 0);
    for (const leg of rig.legs) {
      const { side, index } = leg.userData;
      const wave = Math.sin(state.gait * (rushing ? 2.1 : 1.35) + index * 2.1 + (side < 0 ? Math.PI : 0));
      leg.rotation.set(wave * amount * .19 * alive, wave * amount * .22 * alive,
        side * (wind * .24 - Math.max(0, wave) * amount * .16 + state.death * .6));
    }
    rig.leftArm.rotation.set(-wind * .45 - thrust * .16 + fatigue * .22, -.15 * wind, -.10 - wind * .20);
    rig.rightArm.rotation.set(-wind * .45 - thrust * .16 + fatigue * .22, .15 * wind, .10 + wind * .20);
    for (const pincer of rig.pincers) {
      pincer.root.rotation.x = -wind * .22 + thrust * .18;
      for (const finger of pincer.fingers) finger.rotation.y = finger.userData.opening
        * (.10 + wind * .60 - thrust * .16 + fatigue * .05) * alive;
    }
    for (const [index, stalk] of rig.eyestalks.entries()) {
      stalk.rotation.x = -wind * .12 + thrust * .22 + state.death * .8;
      stalk.rotation.z = (index ? 1 : -1) * (fatigue * .16 + state.death * .3);
    }
    motion.position.y -= wind * .095 * alive;
    motion.rotation.x = 0;
    motion.rotation.z = state.death * Math.PI;
    // A full flip needs the former top to land at local ground zero. Remove
    // the generic humanoid lift, otherwise this wide shell floats after death.
    motion.position.y += state.death * (group.userData.height
      - 2 * (group.userData.motionRestY || 0) - group.userData.colliderRadius * .45);
  }
  if (special) {
    const cue = rig.chargeCue;
    cue.visible = !dead && (winding || rushing || state.release > .65);
    cue.scale.setScalar(1 + (winding ? .18 + Math.sin(now * 18) * .10 : state.release * .6));
    const flinch = state.hit * alive;
    motion.rotation.x -= flinch * .14;
    if (phase !== 'crab') motion.rotation.z = Math.sin(now * 35) * flinch * .12;
    else motion.rotation.z += Math.sin(now * 35) * flinch * .10;
  }
  // Death also relaxes limbs, rather than leaving a frozen mid-attack pose.
  if (state.death > 0.001) {
    for (const name of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
      const limb = rig[name];
      if (limb) {
        limb.rotation.x *= alive;
        limb.rotation.y *= alive;
        limb.rotation.z += (name.startsWith('left') ? -1 : 1) * state.death * 0.12;
      }
    }
  }
  group.userData.animateAppearance?.(group,{moving:amount,attacking,jumping,dead,time:now,dt:delta,stance,lean,weaponId,aiming,firePulse});
}

/** Call only after removing every model made by this module from all scenes.
 * A later create call will lazily rebuild a fresh shared resource pool. */
export function disposeCharacters() {
  for (const value of geometries.values()) value.dispose();
  for (const value of materials.values()) value.dispose();
  geometries.clear();
  materials.clear();
}
