import * as THREE from 'three';

const MODEL_URL = new URL('./assets/yae-miko/model.json', import.meta.url);
let pendingModel;
async function loadModel() {
  if (!pendingModel) pendingModel = (async () => {
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error('八重神子模型暂时无法加载，请稍后再试。');
    const data = await response.json();
    if (data.format !== 'chaoshan-skin-1') throw new Error('角色模型格式不匹配。');
    const binaryResponse = await fetch(new URL('mesh.bin', MODEL_URL));
    if (!binaryResponse.ok) throw new Error('角色骨骼数据未能加载。');
    const binary = await binaryResponse.arrayBuffer(), geometry = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(data.attributes)) {
      const Type = {f: Float32Array, H: Uint16Array, I: Uint32Array}[a.type];
      const attribute = new THREE.BufferAttribute(new Type(binary, a.offset, a.length), a.itemSize);
      if (name === 'index') geometry.setIndex(attribute); else geometry.setAttribute(name, attribute);
    }
    const loader = new THREE.TextureLoader();
    const textures = await Promise.all(data.textures.map(async file => {
      if (!file) return null;
      const texture = await loader.loadAsync(new URL(file, MODEL_URL).href);
      texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false;
      texture.anisotropy = 4;
      return texture;
    }));
    const materials = data.materials.map((m, i) => {
      geometry.addGroup(m.start, m.count, i);
      return new THREE.MeshBasicMaterial({name:m.name, map:textures[m.texture] || null,
        color:0xffffff, opacity:m.diffuse[3], transparent:m.diffuse[3]<1,
        alphaTest:.35, side:THREE.DoubleSide, toneMapped:false});
    });
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return {data, geometry, materials, textures};
  })().catch(error => { pendingModel = null; throw error; });
  return pendingModel;
}

function buildSkin(source) {
  const {data, geometry, materials} = source;
  const visual = new THREE.Group(); visual.name = 'yae-miko-original-model';
  const mesh = new THREE.SkinnedMesh(geometry, materials); mesh.frustumCulled = false;
  const bones = data.bones.map(b => {const bone=new THREE.Bone();bone.name=b.name;return bone;});
  data.bones.forEach((b,i) => {
    bones[i].position.fromArray(b.position);
    if (b.parent>=0 && bones[b.parent]) {bones[i].position.sub(new THREE.Vector3(...data.bones[b.parent].position));bones[b.parent].add(bones[i]);}
    else mesh.add(bones[i]);
  });
  mesh.bind(new THREE.Skeleton(bones)); visual.add(mesh);
  const scale=1.7/(geometry.boundingBox.max.y-geometry.boundingBox.min.y);
  mesh.scale.setScalar(scale);mesh.position.y=-geometry.boundingBox.min.y*scale;
  const byName=new Map(bones.map(b=>[b.name,b]));
  const rest=bones.map(b=>({bone:b,position:b.position.clone(),quaternion:b.quaternion.clone()}));
  visual.userData={mesh,bones,byName,rest,scale,source};
  return visual;
}

/** Keep the gameplay root, weapon sockets and collision dimensions stable. */
export async function setHeroAppearance(hero, id) {
  if (!['traveler','yae-miko'].includes(id)) throw new Error('没有这个角色外观。');
  if(id==='yae-miko'&&!hero.userData.yaeVisual){
    const source=await loadModel();
    const visual=buildSkin(source);hero.add(visual);hero.userData.yaeVisual=visual;
    hero.userData.originalAppearanceMeshes=[];
    hero.userData.rig.motion.traverse(node=>{
      // Weapons and future equipment keep their own independent visibility.
      let parent=node,weapon=false;
      while(parent&&parent!==hero){if(parent.userData.weaponId)weapon=true;parent=parent.parent;}
      if((node.isMesh||node.isLine)&&!weapon)hero.userData.originalAppearanceMeshes.push({node,visible:node.visible});
    });
    hero.userData.animateAppearance=animateAppearance;
  }
  const yae=id==='yae-miko';
  for(const {node,visible} of hero.userData.originalAppearanceMeshes||[])node.visible=yae?false:visible;
  if(hero.userData.yaeVisual)hero.userData.yaeVisual.visible=yae;
  hero.userData.appearanceId=id;hero.userData.appearanceReady=true;
  return {id,ready:true};
}

const axis=new THREE.Vector3(), target=new THREE.Vector3(), origin=new THREE.Vector3();
const worldRotation=new THREE.Quaternion(), inverseParent=new THREE.Quaternion();
function aimBone(bone,child,point){
  if(!bone||!child)return;
  bone.parent.updateWorldMatrix(true,false);
  target.copy(point);bone.parent.worldToLocal(target);target.sub(bone.position).normalize();
  axis.copy(child.position).normalize();bone.quaternion.setFromUnitVectors(axis,target);
  bone.updateWorldMatrix(false,true);
}
function solveArm(upper,elbow,hand,goal,side){
  if(!upper||!elbow||!hand)return;
  upper.getWorldPosition(origin);const start=origin.clone();
  const lengthA=upper.getWorldPosition(new THREE.Vector3()).distanceTo(elbow.getWorldPosition(new THREE.Vector3()));
  const lengthB=elbow.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()));
  const direction=goal.clone().sub(start),distance=Math.min(direction.length(),(lengthA+lengthB)*.995);direction.normalize();
  const along=(lengthA*lengthA-lengthB*lengthB+distance*distance)/(2*Math.max(.001,distance));
  const bend=new THREE.Vector3(side*.45,-1,0).addScaledVector(direction,-new THREE.Vector3(side*.45,-1,0).dot(direction)).normalize();
  const elbowGoal=start.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,lengthA*lengthA-along*along)));
  aimBone(upper,elbow,elbowGoal);aimBone(elbow,hand,goal);
}
function animateAppearance(hero, options){
  const visual=hero.userData.yaeVisual;if(!visual?.visible)return;
  const {rest,byName,mesh}=visual.userData;
  for(const r of rest){r.bone.position.copy(r.position);r.bone.quaternion.copy(r.quaternion);}
  const bone=name=>byName.get(name),rot=(name,x=0,y=0,z=0)=>bone(name)?.rotation.set(x,y,z);
  const {time=0,moving=0,stance='stand',jumping=false,dead=false,lean=0,weaponId,attacking=false}=options;
  const motion=hero.userData.rig.motion,animation=hero.userData.animation;
  const stride=Math.sin(animation.gait)*Number(moving)*.48;
  visual.position.set(-lean*.17,Math.abs(Math.cos(animation.gait))*Number(moving)*.025,0);
  visual.rotation.set(dead?-animation.death*Math.PI*.49:0,0,lean*.13);
  rot('上半身',-.025*Number(moving),0,Math.sin(time*2)*.006);rot('首',0,Math.sin(time*.8)*.025,0);
  rot('左足',jumping?-.5:stride);rot('右足',jumping?.45:-stride);
  rot('左ひざ',Math.max(0,-stride)*.8);rot('右ひざ',Math.max(0,stride)*.8);
  if(stance==='crouch'){
    rot('左足',-1.1+stride*.15);rot('右足',-1.1-stride*.15);
    rot('左ひざ',2);rot('右ひざ',2);rot('左足首',-.9);rot('右足首',-.9);rot('上半身',.12);visual.position.y-=.40;
  }else if(stance==='prone'){
    visual.rotation.x=Math.PI/2;visual.position.set(0,.24,-.68);
    rot('首',-Math.PI/2);rot('頭',-.15);rot('左足',stride*.15);rot('右足',-stride*.15);
  }
  // Hair and cloth use the existing bones, with restrained secondary motion.
  for(const b of visual.userData.bones){
    if(/髪|Hair|スカート|skirt/i.test(b.name))b.rotation.x+=Math.sin(time*2.2+b.position.y)*.018+Number(moving)*.035;
    if(stance==='prone'&&/后髪/.test(b.name)&&b.parent===bone('頭'))b.rotation.x+=Math.PI/2;
    if(stance==='crouch'&&/スカート|后摆/.test(b.name)&&b.parent===bone('下半身'))b.rotation.x=b.name.startsWith('后摆')?.85:-.65;
    if(/指[１２12]/.test(b.name)&&!b.name.includes('親指'))b.rotation.z+=(b.name.startsWith('左')?-1:1)*.45;
  }
  // This distribution skins legs to deformation bones rather than IK controls.
  for(const side of ['左','右'])for(const part of ['足','ひざ','足首']){
    const control=bone(side+part),deform=bone(side+part+'D');
    if(control&&deform)deform.quaternion.copy(control.quaternion);
  }
  const gun=hero.userData.firearmSocket.children.find(c=>c.userData.kind==='firearm');
  const actualWeapon=weaponId||gun?.userData.weaponId;
  const holdingGun=actualWeapon==='rifle'||actualWeapon==='shotgun';
  if(holdingGun&&gun){
    const s=hero.userData.rigScale||1;
    const height=stance==='prone'?.34:stance==='crouch'?.84:1.18;
    hero.userData.firearmSocket.position.set(-.12/s,(height-motion.position.y)/s,.08/s);
    gun.scale.setScalar(.72);
  }
  hero.updateWorldMatrix(true,true);
  for(const [jp,key,side] of [['左','leftHand',-1],['右','rightHand',1]]){
    const upper=bone(jp+'腕'),elbow=bone(jp+'ひじ'),hand=bone(jp+'手首');
    if(holdingGun||jp==='右'){
      const socket=holdingGun?(jp==='左'?gun?.userData.supportSocket:gun):hero.userData.rig[key];
      const goal=(socket||hero.userData.rig[key]).getWorldPosition(new THREE.Vector3());
      solveArm(upper,elbow,hand,goal,side);
      if(hand){hand.parent.getWorldQuaternion(inverseParent).invert();hero.getWorldQuaternion(worldRotation);hand.quaternion.copy(inverseParent).multiply(worldRotation);}
    }else{
      // The PMX bind pose arms point outwards; lower both arms for relaxed travel.
      if(upper)upper.rotation.set(-side*stride*.65,0,jp==='左'?-.65:.65);
      if(elbow)elbow.rotation.y=jp==='左'?-.12:.12;
    }
  }
  mesh.updateWorldMatrix(true,true);
}

export function disposeHeroAppearance(hero){
  const visual=hero.userData.yaeVisual;
  if(visual){visual.userData.mesh.skeleton.dispose();hero.remove(visual);delete hero.userData.yaeVisual;}
  delete hero.userData.animateAppearance;
}

/** Render the same avatar's arms in the first-person layer, retaining its UVs. */
export function createYaeFirstPersonArms(hero){
  const source=hero.userData.yaeVisual?.userData.source;if(!source)return null;
  const visual=buildSkin(source),{mesh,byName}=visual.userData;
  const armBones=new Set();
  for(const side of ['左','右'])byName.get(side+'腕')?.traverse(b=>armBones.add(visual.userData.bones.indexOf(b)));
  const old=source.geometry,geometry=old.clone(),selected=[],skin=old.attributes.skinIndex,weight=old.attributes.skinWeight;
  geometry.clearGroups();
  const isArm=vertex=>{
    let amount=0;for(let i=0;i<4;i++)if(armBones.has(skin.array[vertex*4+i]))amount+=weight.array[vertex*4+i];
    return amount>.5;
  };
  for(const group of old.groups){
    const start=selected.length;
    for(let i=group.start;i<group.start+group.count;i+=3){
      const a=old.index.array[i],b=old.index.array[i+1],c=old.index.array[i+2];
      if(isArm(a)&&isArm(b)&&isArm(c))selected.push(a,b,c);
    }
    geometry.addGroup(start,selected.length-start,group.materialIndex);
  }
  geometry.setIndex(selected);mesh.geometry=geometry;
  visual.position.set(-.05,-1.30,.14);visual.rotation.y=Math.PI;
  visual.userData.update=(right,left)=>{
    for(const r of visual.userData.rest){r.bone.position.copy(r.position);r.bone.quaternion.copy(r.quaternion);}
    visual.updateWorldMatrix(true,true);
    for(const [jp,goalNode,side] of [['右',right,1],['左',left,-1]]){
      const upper=byName.get(jp+'腕'),elbow=byName.get(jp+'ひじ'),hand=byName.get(jp+'手首');
      solveArm(upper,elbow,hand,goalNode.getWorldPosition(new THREE.Vector3()),side);
      if(hand){hand.parent.getWorldQuaternion(inverseParent).invert();visual.getWorldQuaternion(worldRotation);hand.quaternion.copy(inverseParent).multiply(worldRotation);}
    }
    for(const b of visual.userData.bones)if(/指[１２３]/.test(b.name)&&!b.name.includes('親指'))b.rotation.z+=(b.name.startsWith('左')?-1:1)*.6;
  };
  visual.userData.dispose=()=>{geometry.dispose();mesh.skeleton.dispose();visual.removeFromParent();};
  return visual;
}
