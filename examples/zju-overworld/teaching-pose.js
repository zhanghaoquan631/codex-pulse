/**
 * Audio-progress-driven teaching pose and chalk IK. No wall-clock animation.
 * 1. sampleTeachingPose(THREE, rig, input) -> root transform + pose sample.
 * 2. Caller applies sample.rootPosition and sample.rootQuaternion to rig.root.
 * 3. applyTeachingPose(THREE, rig, sample), after updateAvatar/role animation.
 * 4. resetTeachingPose(rig) before the rig stops acting as the teacher.
 */
const states = new WeakMap();
const wrapped = new WeakSet();
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const names = ['hips','torso','head','upperArmL','lowerArmL','handL',
  'upperArmR','lowerArmR','handR','upperLegL','lowerLegL','footL',
  'upperLegR','lowerLegR','footR'];
const vector = (THREE, value, fallback = [0,0,0]) => {
  if (value?.isVector3 && [value.x,value.y,value.z].every(Number.isFinite)) return value.clone();
  if (Array.isArray(value) && value.length >= 3 && value.slice(0,3).every(Number.isFinite)) return new THREE.Vector3(...value.slice(0,3));
  if (value && [value.x,value.y,value.z].every(Number.isFinite)) return new THREE.Vector3(value.x,value.y,value.z);
  return new THREE.Vector3(...fallback);
};

function ensure(THREE, rig) {
  let state = states.get(rig);
  if (state) return state;
  if (!rig?.joints?.handR || !rig.motionRoot) throw new Error('A campus avatar rig is required.');
  const group = new THREE.Group();group.name = 'teaching:chalk';group.visible = false;
  // The 9 cm chalk is gripped at the palm's front; local +Z points at the board.
  const geometry = new THREE.CylinderGeometry(.009,.010,.09,7);
  const material = new THREE.MeshStandardMaterial({color:0xf5eed7,roughness:.95});
  const chalk = new THREE.Mesh(geometry,material);chalk.rotation.x = Math.PI / 2;
  chalk.position.set(0,-.04,.128);chalk.castShadow = false;group.add(chalk);
  rig.joints.handR.add(group);
  state = {group,geometry,material,tipLocal:new THREE.Vector3(0,-.04,.173),
    saved:null,lastSample:null,hidden:new Map(),disposed:false};
  states.set(rig,state);
  if (!wrapped.has(rig)) {
    const previous = rig.dispose;
    rig.dispose = function disposeTeachingAvatar() {
      disposeTeachingPose(rig);
      if (previous) return previous.call(rig);
    };
    wrapped.add(rig);
  }
  return state;
}

function capture(rig, state) {
  if (state.saved) return;
  state.saved = {joints:{},motionY:rig.motionRoot.position.y,
    motionQuaternion:rig.motionRoot.quaternion.clone(),torsoScaleY:rig.joints.torso.scale.y};
  for (const name of names) if (rig.joints[name]) state.saved.joints[name] = rig.joints[name].quaternion.clone();
}

/**
 * board: {mesh,width:7,height:1.2,floor:0}; its local +Z is the audience normal.
 * boardTarget: exact WORLD chalk-contact point at the currently written text end.
 * floorY optionally overrides floor*3.6; platformHeight defaults to .13.
 * paused holds the complete last sample, even if incoming progress changes.
 * rootPosition/rootQuaternion are in the outer root's PARENT coordinate system.
 */
export function sampleTeachingPose(THREE, rig, input = {}) {
  const state = ensure(THREE,rig);
  if (input.paused && state.lastSample) return state.lastSample;
  const phase = input.phase === 'write' ? 'write' : input.phase === 'turn' ? 'turn' : 'explain';
  const progress = clamp(finite(input.progress));
  const board = input.board;
  const mesh = board?.mesh;
  if (!mesh) throw new Error('Teaching requires board.mesh and its current world transform.');
  mesh.updateWorldMatrix(true,false);
  const center = mesh.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0,0,1).transformDirection(mesh.matrixWorld);
  const up = new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld);
  const right = new THREE.Vector3().crossVectors(up,normal).normalize();
  const boardWidth = finite(board.width,7), boardHeight = finite(board.height,1.2);
  const floorY = finite(input.floorY,finite(board.floor) * 3.6);
  const platformY = floorY + finite(input.platformHeight,.13);
  const contact = input.boardTarget ? vector(THREE,input.boardTarget) :
    center.clone().addScaledVector(right,2.265 + Math.sin(progress*Math.PI*12)*.025)
      .addScaledVector(up,platformY + 1.29 - center.y);
  const offset = contact.clone().sub(center);
  const writingSlot = clamp(offset.dot(right) - .265,-boardWidth/2+.22,boardWidth/2-.22);
  const explainSlot = clamp(finite(input.explainOffset,2),-boardWidth/2+.3,boardWidth/2-.3);
  const towardBoard = phase === 'write' || phase === 'turn';
  const turn = phase === 'write' ? 1 : phase === 'turn' ? smooth(progress) : smooth(progress / .22);
  const writingBlend = phase === 'write' ? 1 : phase === 'turn' ? smooth((progress-.25)/.75) : 1-smooth(progress/.20);
  const slot = towardBoard ? mix(explainSlot,writingSlot,turn) : mix(writingSlot,explainSlot,turn);
  const distance = towardBoard ? mix(.97,.24,turn) : mix(.24,.97,turn);
  const worldPosition = center.clone().addScaledVector(right,slot).addScaledVector(normal,distance);
  worldPosition.y = platformY;
  const classQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,normal));
  const boardQuaternion = classQuaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
  const worldQuaternion = towardBoard ? classQuaternion.clone().slerp(boardQuaternion,turn) : boardQuaternion.clone().slerp(classQuaternion,turn);
  const root = rig.root || rig.group;
  root.parent?.updateWorldMatrix(true,false);
  const rootPosition = root.parent ? root.parent.worldToLocal(worldPosition.clone()) : worldPosition.clone();
  const rootQuaternion = worldQuaternion.clone();
  if (root.parent) rootQuaternion.premultiply(root.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  const penDown = phase === 'write' && input.penDown !== false;
  const sample = {phase,progress,paused:!!input.paused,board,rootPosition,rootQuaternion,
    rootYaw:new THREE.Euler().setFromQuaternion(rootQuaternion,'YXZ').y,
    worldPosition,normal,up,right,center,contact,writingBlend,turn,penDown,
    boardUV:{u:.5+offset.dot(right)/boardWidth,v:.5-offset.dot(up)/boardHeight},
    targetPlaneDistance:offset.dot(normal),targetWithinBoard:Math.abs(offset.dot(right))<=boardWidth/2&&Math.abs(offset.dot(up))<=boardHeight/2};
  state.lastSample = sample;
  return sample;
}

function groundFeet(THREE, rig) {
  rig.motionRoot.position.y = 0;
  const root = rig.root || rig.group;root.updateWorldMatrix(true,true);
  const inverse = root.matrixWorld.clone().invert(),point = new THREE.Vector3();
  let min = Infinity;
  for (const mesh of rig._footMeshes || []) {
    mesh.geometry.computeBoundingBox();const b = mesh.geometry.boundingBox;
    for (let i=0;i<8;i++) {
      point.set(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z)
        .applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      min = Math.min(min,point.y);
    }
  }
  if (Number.isFinite(min)) rig.motionRoot.position.y = -min;
  root.updateWorldMatrix(true,true);
}

function solveWritingArm(THREE, rig, state, frame) {
  const j = rig.joints,upper = j.upperArmR,lower = j.lowerArmR,hand = j.handR;
  const root = rig.root || rig.group;root.updateWorldMatrix(true,true);
  // Chalk's +Z points into the board. Keeping hand +Y aligned with board up
  // gives a natural vertical grip and permits an exact known tip-to-wrist offset.
  const handWorldQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    frame.right.clone().negate(),frame.up,frame.normal.clone().negate()));
  const worldScale = root.getWorldScale(new THREE.Vector3());
  const uniformScale = (Math.abs(worldScale.x)+Math.abs(worldScale.y)+Math.abs(worldScale.z))/3;
  const desiredTip = frame.contact.clone();
  if (!frame.penDown) desiredTip.addScaledVector(frame.normal,.04);
  const wrist = desiredTip.clone().sub(state.tipLocal.clone().multiplyScalar(uniformScale).applyQuaternion(handWorldQuaternion));
  const target = upper.parent.worldToLocal(wrist.clone()).sub(upper.position);
  const length1 = lower.position.length(),length2 = hand.position.length();
  const distance = target.length(),reach = length1 + length2 - .000001;
  const solvedDistance = clamp(distance,Math.abs(length1-length2)+.000001,reach);
  const axis = distance>1e-8 ? target.clone().normalize() : new THREE.Vector3(0,1,0);
  const poleWorld = frame.right.clone().multiplyScalar(.85).addScaledVector(frame.normal,.2).addScaledVector(frame.up,-.2);
  const shoulderWorld = upper.getWorldPosition(new THREE.Vector3());
  const pole = upper.parent.worldToLocal(shoulderWorld.clone().add(poleWorld)).sub(upper.position);
  pole.addScaledVector(axis,-pole.dot(axis));
  if (pole.lengthSq()<1e-8) pole.set(1,0,0).addScaledVector(axis,-axis.x);
  pole.normalize();
  const along = (length1*length1-length2*length2+solvedDistance*solvedDistance)/(2*solvedDistance);
  const bend = Math.sqrt(Math.max(0,length1*length1-along*along));
  const elbow = axis.clone().multiplyScalar(along).addScaledVector(pole,bend);
  upper.quaternion.setFromUnitVectors(lower.position.clone().normalize(),elbow.clone().normalize());
  root.updateWorldMatrix(true,true);
  const elbowWorld = lower.getWorldPosition(new THREE.Vector3());
  const forearmWorld = wrist.clone().sub(elbowWorld).normalize();
  const parentWorldQuaternion = upper.getWorldQuaternion(new THREE.Quaternion());
  const forearmLocal = forearmWorld.applyQuaternion(parentWorldQuaternion.invert());
  lower.quaternion.setFromUnitVectors(hand.position.clone().normalize(),forearmLocal);
  root.updateWorldMatrix(true,true);
  hand.quaternion.copy(lower.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handWorldQuaternion));
  root.updateWorldMatrix(true,true);
  const actualTip = hand.localToWorld(state.tipLocal.clone());
  return {reachable:distance<=reach+.00001,tipError:actualTip.distanceTo(desiredTip),
    chalkTip:actualTip,target:desiredTip,armDistance:distance,armReach:reach,
    boardPlaneError:actualTip.clone().sub(frame.center).dot(frame.normal)};
}

/** Apply an already sampled frame AFTER caller applies its outer root transform. */
export function applyTeachingPose(THREE, rig, frame) {
  const state = ensure(THREE,rig);capture(rig,state);
  if (!frame?.contact || !frame.rootPosition) throw new Error('Pass sampleTeachingPose() output.');
  const j = rig.joints,p = frame.progress,w = frame.writingBlend;
  // Every pose component is absolute and determined by audio progress. This
  // removes breathing/idle drift from updateAvatar while audio is paused.
  rig.motionRoot.quaternion.identity();j.torso.scale.y = 1;
  for (const name of names) j[name]?.rotation.set(0,0,0);
  const stepping = frame.turn>0&&frame.turn<1 ? Math.sin(frame.turn*Math.PI*4)*.15 : 0;
  j.upperLegL.rotation.x = stepping;j.upperLegR.rotation.x = -stepping;
  j.lowerLegL.rotation.x = Math.max(0,-stepping)*.6;j.lowerLegR.rotation.x = Math.max(0,stepping)*.6;
  // During writing keep the clipboard down beside the hip, clear of the board.
  j.upperArmL.rotation.set(mix(-.26,.10,w),0,.04);j.lowerArmL.rotation.x = mix(-.88,-.30,w);
  j.head.rotation.set(mix(-.03,-.10,w),mix(Math.sin(p*Math.PI*4)*.07,0,w),0);
  const gesture = Math.sin(p*Math.PI*6);
  j.upperArmR.rotation.set(mix(-.60-.14*gesture,-1.05,w),0,mix(-.25,-.10,w));
  j.lowerArmR.rotation.x = mix(-.48-.12*gesture,-.85,w);
  j.handR.rotation.x = -.06;
  groundFeet(THREE,rig);
  state.group.visible = frame.phase === 'write' || (frame.phase === 'turn' && p>.25) || (frame.phase === 'explain' && p<.08);
  // The teacher's normal clipboard is on the LEFT hand and can stay there.
  // Hide hand-held role props only if attached to the actual chalk (right) hand.
  for (const group of rig.roleGroups || []) {
    const onChalkHand = group.parent===j.handR;
    if (onChalkHand && /handItem|readingBook/.test(group.name)) {
      if (!state.hidden.has(group)) state.hidden.set(group,group.visible);
      group.visible = !state.group.visible && state.hidden.get(group);
    }
  }
  let contact = {reachable:false,tipError:null,chalkTip:j.handR.localToWorld(state.tipLocal.clone()),target:frame.contact.clone()};
  if (w>.999 && frame.phase==='write') contact = solveWritingArm(THREE,rig,state,frame);
  else (rig.root||rig.group).updateWorldMatrix(true,true);
  return {...contact,penDown:frame.penDown&&frame.targetWithinBoard&&Math.abs(frame.targetPlaneDistance)<.005&&contact.reachable&&contact.tipError<.005,
    boardUV:frame.boardUV,phase:frame.phase,progress:frame.progress};
}

/** End this role action before the rig is swapped into player/NPC control. */
export function resetTeachingPose(rig) {
  const state = states.get(rig);if (!state) return rig;
  state.group.visible = false;
  for (const [group,visible] of state.hidden) group.visible = visible;
  state.hidden.clear();
  if (state.saved) {
    for (const [name,quaternion] of Object.entries(state.saved.joints)) rig.joints[name]?.quaternion.copy(quaternion);
    rig.motionRoot.position.y = state.saved.motionY;
    rig.motionRoot.quaternion.copy(state.saved.motionQuaternion);
    rig.joints.torso.scale.y = state.saved.torsoScaleY;
  }
  state.saved = null;state.lastSample = null;
  return rig;
}

/** Release chalk resources; rig.dispose() also calls this automatically. */
export function disposeTeachingPose(rig) {
  const state = states.get(rig);if (!state || state.disposed) return;
  resetTeachingPose(rig);state.disposed = true;state.group.removeFromParent();
  state.geometry.dispose();state.material.dispose();states.delete(rig);
}
