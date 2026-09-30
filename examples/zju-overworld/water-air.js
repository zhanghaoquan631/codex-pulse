/**
 * Procedural boats, seated campus avatars, a passenger jet, and certified water loops.
 * No imports, DOM, textures, network, or automatic world movement. Metres, +Y up,
 * +Z forward. Boat waterline is local Y=.12; caller places group at waterY-.12.
 * Boat update owns paddles / wake only; world code owns group translation / yaw.
 * Occupant.update owns its rig's pose: do not also run updateAvatar while seated.
 */

class Parts {
  constructor(T, root) { this.T = T; this.root = root; this.batches = new Map(); this.geometries = new Set(); this.materials = new Set(); }
  material(color, options = {}) {
    const T = this.T, { basic, ...settings } = options, material = basic ? new T.MeshBasicMaterial({ color, ...settings }) : new T.MeshStandardMaterial({ color, roughness: .65, metalness: .1, ...settings });
    this.materials.add(material); return material;
  }
  add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const T = this.T;
    geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...position), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(...scale)));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!flat.attributes.normal) flat.computeVertexNormals();
    if (!this.batches.has(material)) this.batches.set(material, []);
    this.batches.get(material).push({ p: flat.attributes.position.array.slice(), n: flat.attributes.normal.array.slice() });
    if (flat !== geometry) flat.dispose(); geometry.dispose();
  }
  box(size, material, position, rotation) { this.add(new this.T.BoxGeometry(...size), material, position, rotation); }
  pipe(a, b, r, material) {
    const T = this.T, va = new T.Vector3(...a), vb = new T.Vector3(...b), d = vb.clone().sub(va);
    const geometry = new T.CylinderGeometry(r, r, d.length(), 6);
    geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()));
    this.add(geometry, material, va.add(vb).multiplyScalar(.5).toArray());
  }
  movable(geometry, material, parent, name, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const mesh = new this.T.Mesh(geometry, material); mesh.position.fromArray(position); mesh.rotation.set(...rotation); mesh.name = name;
    mesh.castShadow = !material.transparent; mesh.receiveShadow = true; parent.add(mesh); this.geometries.add(geometry); return mesh;
  }
  flush() {
    const T = this.T;
    for (const [material, parts] of this.batches) {
      const count = parts.reduce((sum, part) => sum + part.p.length, 0), p = new Float32Array(count), n = new Float32Array(count); let offset = 0;
      for (const part of parts) { p.set(part.p, offset); n.set(part.n, offset); offset += part.p.length; }
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(p, 3)); geometry.setAttribute('normal', new T.BufferAttribute(n, 3));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      this.movable(geometry, material, this.root, `body:${material.color.getHexString()}`);
    }
    this.batches.clear();
  }
  dispose() { for (const g of this.geometries) g.dispose(); for (const m of this.materials) m.dispose(); this.geometries.clear(); this.materials.clear(); }
}

function triangles(T, positions) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); g.computeVertexNormals(); return g; }

function loftHull(T, outline, depth) {
  const rings = [outline.map(([x, z]) => [x * .66, -depth, z * .83]), outline.map(([x, z]) => [x, .37, z]), outline.map(([x, z]) => [x * .9, .37, z * .94]), outline.map(([x, z]) => [x * .65, -.015, z * .83])];
  const p = [], add = (a, b, c) => p.push(...a, ...b, ...c), N = outline.length;
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N; add(rings[r][i], rings[r][j], rings[r + 1][j]); add(rings[r][i], rings[r + 1][j], rings[r + 1][i]);
  }
  for (let i = 1; i < N - 1; i++) { add(rings[0][0], rings[0][i + 1], rings[0][i]); add(rings[3][0], rings[3][i], rings[3][i + 1]); }
  return triangles(T, p);
}

function prism(T, outline, thickness) {
  const p = [], add = (a, b, c) => p.push(...a, ...b, ...c), top = outline.map(([x, z]) => [x, thickness / 2, z]), bottom = outline.map(([x, z]) => [x, -thickness / 2, z]);
  for (let i = 1; i < outline.length - 1; i++) { add(top[0], top[i + 1], top[i]); add(bottom[0], bottom[i], bottom[i + 1]); }
  for (let i = 0; i < outline.length; i++) { const j = (i + 1) % outline.length; add(top[i], bottom[i], bottom[j]); add(top[i], bottom[j], top[j]); }
  return triangles(T, p);
}

export function createBoat(THREE, type = 'ferry') {
  if (!THREE?.Group) throw new TypeError('createBoat requires THREE.');
  if (!['ferry', 'rowboat'].includes(type)) throw new RangeError(`Unsupported boat type: ${type}`);
  const T = THREE, group = new T.Group(); group.name = `campus-boat:${type}`; group.userData.forwardAxis = '+Z'; group.userData.waterline = .12;
  const p = new Parts(T, group), ferry = type === 'ferry';
  const paint = p.material(ferry ? '#537f82' : '#658576', { side: T.DoubleSide }), cream = p.material('#eee7d0'), wood = p.material('#b98b58'), dark = p.material('#354a4f'), metal = p.material('#a5b7b3', { metalness: .6 }), cushion = p.material(ferry ? '#cfaf70' : '#ad7545');
  const outline = ferry ? [[-.7,-2.25],[.7,-2.25],[.9,-1.3],[.88,.9],[.63,1.72],[0,2.25],[-.63,1.72],[-.88,.9],[-.9,-1.3]] : [[-.27,-1.7],[.27,-1.7],[.64,-.95],[.7,.5],[.43,1.25],[0,1.7],[-.43,1.25],[-.7,.5],[-.64,-.95]];
  p.add(loftHull(T, outline, ferry ? .43 : .31), paint);
  for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length]; p.pipe([a[0],.38,a[1]], [b[0],.38,b[1]], .042, cream); }
  p.box(ferry ? [1.38,.07,3.16] : [.9,.06,2.1], wood, [0,ferry ? .175 : .025,ferry ? -.23 : -.13]);
  const seatPositions = [], seatOrientations = [];
  function seat(x, y, z, back = true, yaw = 0) {
    p.box([.5,.1,.41], cushion, [x,y-.05,z]); p.box([.035,.25,.32], wood, [x-.19,y-.22,z]); p.box([.035,.25,.32], wood, [x+.19,y-.22,z]);
    if (back) { const dz = Math.cos(yaw) * -.235; p.box([.51,.43,.065], cushion, [x,y+.19,z+dz]); }
    seatPositions.push(new T.Vector3(x,y,z)); seatOrientations.push(yaw);
  }
  let steeringWheel = null, steeringGripPositions = [], paddles = [], paddleGripNodes = [], driverSeat = 0;
  if (ferry) {
    seat(-.39,.54,.65); seat(.39,.54,.65);
    for (const z of [-.38,-1.36]) for (const x of [-.39,.39]) seat(x,.54,z);
    p.box([1.36,.29,.27], cream, [0,.77,1.16]);
    p.box([.46,.07,.12], dark, [-.39,.957,1.145], [-.23,0,0]);
    for (const x of [-.48,-.31]) p.add(new T.CylinderGeometry(.055,.055,.01,12), dark, [x,1.008,1.09], [Math.PI/2+.3,0,0]);
    const glass = p.material('#a5d8d9', { transparent: true, opacity: .36, depthWrite: false, roughness: .16, side: T.DoubleSide });
    p.box([1.48,.57,.035], glass, [0,1.23,1.31], [-.2,0,0]);
    for (const x of [-.76,.76]) p.pipe([x,.9,1.37],[x,1.53,1.24],.025,metal);
    p.pipe([-.76,1.53,1.24],[.76,1.53,1.24],.025,metal);
    for (const x of [-.82,.82]) for (const z of [-1.79,.83]) p.pipe([x,.39,z],[x,1.92,z],.035,cream);
    p.box([1.8,.09,3.09], cream, [0,1.94,-.49]); p.box([1.73,.045,3.04], paint, [0,2.007,-.49]);
    for (const x of [-.86,.86]) { p.pipe([x,.77,-1.85],[x,.77,.41],.027,cream); for (const z of [-1.83,-.77,.4]) p.pipe([x,.38,z],[x,.77,z],.022,cream); }
    const wheelRoot = new T.Group(); wheelRoot.position.set(-.39,1.02,1.035); wheelRoot.rotation.x = -.5; group.add(wheelRoot);
    steeringWheel = p.movable(new T.TorusGeometry(.18,.018,6,18), dark, wheelRoot, 'boat-steering-wheel');
    for (let i = 0; i < 3; i++) p.movable(new T.BoxGeometry(.014,.165,.016), metal, wheelRoot, 'wheel-spoke', [.079*Math.sin(i*2.094),.079*Math.cos(i*2.094),0], [0,0,-i*2.094]);
    steeringGripPositions = [new T.Vector3(-.535,1.08,1.004),new T.Vector3(-.245,1.08,1.004)];
    for (const x of [-.86,.86]) p.add(new T.TorusGeometry(.18,.049,7,16), cream, [x,.67,-1.0], [0,Math.PI/2,0]);
    for (const z of [-1.62,.22]) for (const x of [-.91,.91]) p.add(new T.CylinderGeometry(.08,.08,.3,8), dark, [x,.26,z]);
  } else {
    seat(0,.39,-.43,false,Math.PI); seat(0,.39,.79,false);
    for (const sign of [-1,1]) {
      const pivot = new T.Group(); pivot.name = sign < 0 ? 'port-oar' : 'starboard-oar'; pivot.position.set(sign*.61,.55,-.43); group.add(pivot);
      p.movable(new T.CylinderGeometry(.024,.026,1.8,7), wood, pivot, 'oar-shaft', [sign*.36,0,0], [0,0,Math.PI/2]);
      p.movable(new T.BoxGeometry(.54,.035,.19), wood, pivot, 'oar-blade', [sign*1.25,0,0]);
      p.movable(new T.CylinderGeometry(.035,.035,.25,7), dark, pivot, 'oar-handle', [-sign*.41,0,0], [0,0,Math.PI/2]);
      const grip = new T.Group(); grip.position.set(-sign*.4,0,0); pivot.add(grip); paddleGripNodes.push(grip); paddles.push(pivot);
      p.add(new T.TorusGeometry(.052,.013,6,12), metal, [sign*.61,.52,-.43], [0,Math.PI/2,0]);
    }
    p.pipe([0,.23,-1.45],[0,.23,-1.62],.035,cream);
  }
  const propeller = new T.Group(); propeller.name = 'boat-propeller'; propeller.position.set(0,-.22,ferry ? -2.22 : -1.5); propeller.visible = ferry; group.add(propeller);
  if (ferry) {
    p.box([.13,.43,.17], dark, [0,-.01,-2.21]);
    p.movable(new T.CylinderGeometry(.075,.075,.17,8), metal, propeller, 'propeller-hub', [0,0,0], [Math.PI/2,0,0]);
    for (let i = 0; i < 3; i++) p.movable(new T.BoxGeometry(.065,.29,.025), metal, propeller, 'propeller-blade', [.11*Math.sin(i*2.094),.11*Math.cos(i*2.094),0], [.3,0,-i*2.094]);
  }
  p.flush(); group.updateMatrixWorld(true);
  // The static bounds deliberately exclude the animated wake and rowboat oars.
  const bounds = new T.Box3(new T.Vector3(ferry ? -.99 : -.75,ferry ? -.44 : -.32,ferry ? -2.33 : -1.7),new T.Vector3(ferry ? .99 : .75,ferry ? 2.035 : .48,ferry ? 2.3 : 1.7));
  const wake = new T.Group(); wake.name = 'boat-wake'; group.add(wake);
  const foam = p.material('#d9f3ed', { basic: true, transparent: true, opacity: .26, depthWrite: false, side: T.DoubleSide });
  const foamRings = [];
  for (let i = 0; i < 5; i++) {
    const mesh = p.movable(new T.RingGeometry(.93,1,32,1,Math.PI*.14,Math.PI*.72), foam,wake, 'wake-arc', [0,.13,-1.5-i*.45],[-Math.PI/2,0,Math.PI]);
    mesh.castShadow = false; mesh.receiveShadow = false; foamRings.push(mesh);
  }
  const occupants = new Set(); let elapsed = 0, disposed = false;
  const boat = { group, type: 'boat', boatType: type, length: ferry ? 4.5 : 3.4, width: ferry ? 1.8 : 1.4, height: ferry ? 2.45 : .8, waterline: .12, bounds,
    seatPositions, seatOrientations, driverSeat, propeller, wake, paddles, paddleGripNodes, steeringWheel, steeringGripPositions, occupants,
    update(dt = 0, speed = 0, time) {
      if (disposed) return;
      const delta = Number.isFinite(dt) ? Math.max(0,Math.min(.2,dt)) : 0, velocity = Number.isFinite(speed) ? Math.abs(speed) : 0;
      elapsed = Number.isFinite(time) ? time : elapsed + delta;
      propeller.rotation.z += delta * (Number.isFinite(speed) ? speed : 0) * 9;
      wake.visible = velocity > .12;
      foam.opacity = Math.min(.4,velocity*.09);
      for (let i=0;i<foamRings.length;i++) {
        const t = (elapsed * .43 + i / foamRings.length) % 1, mesh = foamRings[i];
        mesh.position.z = -(ferry ? 1.9 : 1.4) - t * (ferry ? 4.3 : 3); mesh.scale.set((ferry ? .95 : .65)+t*1.4,.45+t*.6,1);
      }
      for (let i=0;i<paddles.length;i++) { const sign=i?1:-1, phase=elapsed*(velocity>.08?2.7:.32); paddles[i].rotation.y=sign*Math.sin(phase)*.34*(velocity>.08?1:.14); paddles[i].rotation.z=-sign*(.1+Math.cos(phase)*.12*(velocity>.08?1:.15)); }
      for (const occupant of occupants) occupant.update(delta,velocity,elapsed);
    },
    dispose() { if (disposed) return; disposed=true; for (const occupant of [...occupants]) occupant.dispose(); p.dispose(); group.removeFromParent(); group.clear(); },
  };
  boat.update(); return boat;
}

/** Attach a full-size campus rig, keep pelvis on cushion, and aim hands at wheel / oar grips. */
export function createBoatOccupant(THREE, boat, rig, { driver = false, seatIndex } = {}) {
  const T=THREE, j=rig?.joints, root=rig?.group;
  if (!boat?.group || !root || !j?.hips) throw new TypeError('createBoatOccupant requires a boat and jointed campus rig.');
  const index=seatIndex ?? (driver ? boat.driverSeat : Math.min(1,boat.seatPositions.length-1));
  if (!boat.seatPositions[index]) throw new RangeError('Boat seat index is out of range.');
  const required=['torso','head','upperArmL','lowerArmL','handL','upperArmR','lowerArmR','handR','upperLegL','lowerLegL','footL','upperLegR','lowerLegR','footR'];
  for (const name of required) if (!j[name]) throw new TypeError(`Missing avatar joint ${name}`);
  const oldParent=root.parent, oldRider=root.userData.vehicleRider, snapshots=[];
  root.traverse(object=>snapshots.push({ object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone(),visible:object.visible }));
  for (const object of [rig.shadow,rig.groundShadow]) if (object?.isObject3D&&!snapshots.some(s=>s.object===object)) snapshots.push({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone(),visible:object.visible});
  const seat=boat.seatPositions[index].clone(), yaw=boat.seatOrientations?.[index]||0, pelvis=rig.meshes?.pelvis;
  pelvis?.geometry.computeBoundingBox();
  const bottom=pelvis ? pelvis.position.y+pelvis.geometry.boundingBox.min.y*pelvis.scale.y : -.115;
  boat.group.add(root); root.scale.set(1,1,1); root.rotation.set(0,yaw,0); root.position.set(seat.x,seat.y-j.hips.position.y-bottom,seat.z);
  rig.motionRoot?.position.set(0,0,0); rig.motionRoot?.rotation.set(0,0,0); rig.motionRoot?.scale.set(1,1,1);
  for (const joint of Object.values(j)) { joint.rotation.set(0,0,0); joint.scale.set(1,1,1); }
  root.visible=true; root.userData.vehicleRider='boat';
  root.traverse(object=>{ if (/shadow|backpack|bagSeam|^strap|^satchel|role:.*:(handItem|readingBook|basketball)(:|$)/i.test(object.name)||object.userData?.groundShadow) object.visible=false; });
  for (const object of [rig.shadow,rig.groundShadow]) if (object?.isObject3D) object.visible=false;
  const inverseRoot=new T.Matrix4(), boatToRig=new T.Matrix4(), rootQ=new T.Quaternion(), parentQ=new T.Quaternion(), targetQ=new T.Quaternion(), desiredQ=new T.Quaternion(), down=new T.Vector3(0,-1,0);
  const start=new T.Vector3(), direction=new T.Vector3(), bend=new T.Vector3(), middle=new T.Vector3(), end=new T.Vector3(), v=new T.Vector3(), target=new T.Vector3(), pole=new T.Vector3(), worldPoint=new T.Vector3();
  const palmQ=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2), palmOffset=new T.Vector3(0,-.039,0).applyQuaternion(palmQ);
  let disposed=false, elapsed=0;
  function orient(object,q) { object.parent.getWorldQuaternion(parentQ); object.quaternion.copy(parentQ.invert()).multiply(rootQ).multiply(q); object.updateWorldMatrix(false,false); }
  function solveArm(side,point) {
    const arm=j[`upperArm${side}`], forearm=j[`lowerArm${side}`], hand=j[`hand${side}`];
    start.setFromMatrixPosition(arm.matrixWorld).applyMatrix4(inverseRoot); target.copy(point).sub(palmOffset); direction.copy(target).sub(start);
    const length=direction.length(); if(length<1e-6)return;
    const a=forearm.position.length(), b=hand.position.length(), d=Math.max(Math.abs(a-b)+1e-5,Math.min(length,a+b-1e-5));
    direction.multiplyScalar(1/length); const along=(a*a+d*d-b*b)/(2*d), height=Math.sqrt(Math.max(0,a*a-along*along));
    pole.set(side==='L'?.7:-.7,-1,-.1); bend.copy(pole).addScaledVector(direction,-pole.dot(direction)).normalize();
    middle.copy(start).addScaledVector(direction,along).addScaledVector(bend,height); v.copy(middle).sub(start).normalize(); desiredQ.setFromUnitVectors(down,v); orient(arm,desiredQ);
    end.copy(start).addScaledVector(direction,d); v.copy(end).sub(middle).normalize(); targetQ.setFromUnitVectors(hand.position.clone().normalize(),v); orient(forearm,targetQ); orient(hand,palmQ);
  }
  const controller={rig,seatIndex:index,driver,seatPosition:seat,
    update(dt=0,speed=0,time) {
      if(disposed)return rig;
      elapsed=Number.isFinite(time)?time:elapsed+(Number.isFinite(dt)?Math.max(0,dt):0);
      j.hips.rotation.set(0,0,0); j.torso.rotation.set(0,0,0); j.head.rotation.set(0,Math.sin(elapsed*.4+index)*.035,0);
      for(const side of ['L','R']) { j[`upperLeg${side}`].rotation.set(-Math.PI/2,0,side==='L'?.03:-.03); j[`lowerLeg${side}`].rotation.set(Math.PI/2,0,0); j[`foot${side}`].rotation.set(0,0,0); }
      root.updateWorldMatrix(true,true); inverseRoot.copy(root.matrixWorld).invert(); root.getWorldQuaternion(rootQ); boatToRig.multiplyMatrices(inverseRoot,boat.group.matrixWorld);
      for(let i=0;i<2;i++) {
        const side=i?'R':'L';
        if(driver&&boat.boatType==='ferry') { // Local +X is avatar L; wheel grip order is port then starboard.
          target.copy(boat.steeringGripPositions[i?0:1]).applyMatrix4(boatToRig);
        } else if(driver&&boat.paddleGripNodes?.length) {
          boat.paddleGripNodes[i?1:0].getWorldPosition(worldPoint); target.copy(worldPoint).applyMatrix4(inverseRoot);
        } else target.set(i?-.17:.17,j.hips.position.y+.09,.27);
        solveArm(side,target.clone());
      }
      root.updateWorldMatrix(false,true); return rig;
    },
    dispose() { if(disposed)return; disposed=true; boat.occupants?.delete(controller); root.removeFromParent(); for(const s of snapshots){s.object.position.copy(s.position);s.object.quaternion.copy(s.quaternion);s.object.scale.copy(s.scale);s.object.visible=s.visible;} if(oldRider===undefined)delete root.userData.vehicleRider;else root.userData.vehicleRider=oldRider; if(oldParent)oldParent.add(root); root.updateWorldMatrix(true,true); },
  };
  controller.detach=controller.dispose; boat.occupants?.add(controller); controller.update(); return controller;
}

export function createPlane(THREE) {
  if(!THREE?.Group)throw new TypeError('createPlane requires THREE.');
  const T=THREE,group=new T.Group();group.name='campus-sky-passenger-jet';group.userData.forwardAxis='+Z';
  const p=new Parts(T,group), white=p.material('#e5e9e9'),blue=p.material('#6286a0'),dark=p.material('#33434f'),metal=p.material('#a1afb3',{metalness:.64}),glass=p.material('#355362');
  // Fuselage is a lathed aerodynamic shell: tail at -Z, rounded nose at +Z.
  const profile=[[-16.5,0],[-15.9,.22],[-13.9,.64],[-10.6,1.32],[-7.5,1.7],[10.0,1.7],[12.0,1.51],[13.8,1.04],[15.3,.43],[15.7,0]].map(([z,r])=>new T.Vector2(r,z));
  p.add(new T.LatheGeometry(profile,20),white,[0,0,0],[Math.PI/2,0,0]);
  p.add(new T.SphereGeometry(1,16,8),blue,[0,-.93,-.1],[0,0,0],[1.46,.71,12.5]);
  for(const sign of [-1,1]) {
    const wing=[[sign*1.2,4.7],[sign*15.8,-3.7],[sign*16.3,-5.0],[sign*5.7,-3.15],[sign*1.15,-1.65]];
    p.add(prism(T,wing,.2),white,[0,-.48,0]);
    p.box([.09,1.65,1.2],blue,[sign*16.15,.28,-4.35],[0,0,-sign*.32]);
    const tail=[[sign*.8,-10.25],[sign*6.1,-13.23],[sign*6.45,-14.63],[sign*.6,-13.27]]; p.add(prism(T,tail,.14),white,[0,.52,0]);
    p.box([.24,.87,1.65],metal,[sign*5.1,-1.02,.8]);
    const engineProfile=[[-2.0,.5],[-1.55,.66],[.45,.85],[1.55,.82],[1.65,.72],[1.4,.65],[.8,.64]].map(([z,r])=>new T.Vector2(r,z));
    p.add(new T.LatheGeometry(engineProfile,16),white,[sign*5.1,-1.67,1.0],[Math.PI/2,0,0]);
    p.add(new T.TorusGeometry(.735,.065,8,20),metal,[sign*5.1,-1.67,2.6]);
    p.add(new T.CylinderGeometry(.64,.64,.035,16),dark,[sign*5.1,-1.67,2.45],[Math.PI/2,0,0]);
    p.add(new T.ConeGeometry(.2,.35,12),metal,[sign*5.1,-1.67,2.57],[Math.PI/2,0,0]);
    for(let i=0;i<10;i++) p.box([.028,.45,.027],metal,[sign*5.1+Math.sin(i*Math.PI/5)*.38,-1.67+Math.cos(i*Math.PI/5)*.38,2.48],[0,0,-i*Math.PI/5+.35]);
    for(let i=0;i<24;i++) p.add(new T.SphereGeometry(1,6,4),glass,[sign*1.63,.4,-7.8+i*.7],[0,0,0],[.045,.17,.125]);
    for(const z of [-8.7,7.5]) {p.box([.035,1.36,.71],metal,[sign*1.685,.11,z]);p.box([.039,1.22,.59],white,[sign*1.705,.11,z]);p.box([.043,.2,.2],glass,[sign*1.73,.48,z]);}
    p.box([.68,.44,.035],glass,[sign*.62,.84,13.76],[.1,sign*.35,sign*-.12]);
  }
  // Swept vertical stabilizer, using a horizontal prism rotated upright.
  p.add(prism(T,[[0,-8.7],[4.8,-13.8],[4.7,-15.0],[0,-13.6]],.2),blue,[0,.95,0],[0,0,Math.PI/2]);
  p.box([.215,.25,1.8],white,[0,4.09,-13.65]);
  p.flush();
  const navLights=[];
  for(const [x,y,z,color] of [[-16.16,.6,-4.1,'#fc5354'],[16.16,.6,-4.1,'#71ffb2'],[0,.62,-16.35,'#ffffff'],[0,1.79,-1.4,'#fc5555']]) {
    const mat=p.material(color,{basic:true,toneMapped:false}),mesh=p.movable(new T.SphereGeometry(.12,7,5),mat,group,'navigation-light',[x,y,z]);mesh.castShadow=false;navLights.push(mesh);
  }
  let elapsed=0,disposed=false;
  return {group,type:'plane',length:32.2,width:32.65,height:8.2,navigationLights:navLights,
    update(dt=0,time) { if(disposed)return;elapsed=Number.isFinite(time)?time:elapsed+(Number.isFinite(dt)?Math.max(0,dt):0);navLights[3].visible=(elapsed%1.4)<.16;navLights[2].visible=(elapsed%2.1)<.12||(elapsed%2.1)>.22&&(elapsed%2.1)<.3; },
    dispose(){if(disposed)return;disposed=true;p.dispose();group.removeFromParent();group.clear();},
  };
}

function point2(value) { return Array.isArray(value)?[+value[0],+value[1]]:[+value.x,+(value.z??value.y)]; }
function ringContains(ring,x,z) {let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function distanceToEdge(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],d=dx*dx+dz*dz,t=d?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/d)):0;return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}

/**
 * Return a conservative closed circular route, or null when water is too small.
 * water = {p: [[x,z],...], h: [holeRing,...]}; contains(x,z) may add bridge / obstacle
 * exclusions. Polygon edges and islands are checked analytically. Extra callback
 * exclusions are sampled at <=.6 m across the entire swept boat corridor.
 * clearance defaults to 3m (the whole ferry fits at every heading).
 * sample(distance) returns {x,z,yaw}; points is a closed [[x,z],...] polyline.
 * Do not Catmull-Rom this route: use sample() or straight point interpolation.
 */
export function makeWaterRoute(waterPolygon,{contains,seed=1,clearance=3,minRadius=4,maxRadius=90}={}){
  const raw=Array.isArray(waterPolygon)?waterPolygon:waterPolygon?.p??waterPolygon?.outer;
  if(!Array.isArray(raw)||raw.length<3)return null;
  const outer=raw.map(point2),holeRaw=waterPolygon?.h??waterPolygon?.holes??[],holes=Array.isArray(holeRaw)?holeRaw.filter(Array.isArray).map(r=>r.map(point2)):[];
  if([...outer,...holes.flat()].some(v=>!v.every(Number.isFinite)))return null;
  clearance=Math.max(.1,Number(clearance)||3);minRadius=Math.max(1,Number(minRadius)||4);maxRadius=Math.max(minRadius,Number(maxRadius)||90);
  const rings=[outer,...holes],inside=(x,z)=>ringContains(outer,x,z)&&!holes.some(r=>ringContains(r,x,z))&&(!contains||!!contains(x,z));
  const clearanceAt=(x,z)=>{if(!inside(x,z))return -1;let d=Infinity;for(const ring of rings)for(let i=0;i<ring.length;i++)d=Math.min(d,distanceToEdge(x,z,ring[i],ring[(i+1)%ring.length]));return d;};
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const [x,z]of outer){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
  if(maxX-minX<2*(clearance+minRadius)||maxZ-minZ<2*(clearance+minRadius))return null;
  let state=(Number(seed)||1)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const candidates=[],push=(x,z)=>{const d=clearanceAt(x,z);if(d>=clearance+minRadius)candidates.push({x,z,d});};
  for(let i=0;i<31;i++)for(let k=0;k<31;k++)push(minX+(maxX-minX)*(i+.5)/31,minZ+(maxZ-minZ)*(k+.5)/31);
  for(let i=0;i<160;i++)push(minX+(maxX-minX)*random(),minZ+(maxZ-minZ)*random());
  candidates.sort((a,b)=>b.d-a.d);
  // Refine a few good disk centers without triangulation or external libraries.
  for(const candidate of candidates.slice(0,6)){
    let c={...candidate},step=Math.max(maxX-minX,maxZ-minZ)/31;
    for(let pass=0;pass<6;pass++){for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){const x=c.x+dx*step,z=c.z+dz*step,d=clearanceAt(x,z);if(d>c.d)c={x,z,d};}step*=.5;}candidates.push(c);
  }
  candidates.sort((a,b)=>b.d-a.d);
  const spaced=[],spacing=Math.max(3,Math.min(maxX-minX,maxZ-minZ)/16);
  for(const c of candidates){if(spaced.every(s=>Math.hypot(s.x-c.x,s.z-c.z)>=spacing))spaced.push(c);if(spaced.length>=80)break;}
  for(const c of spaced){
    const largest=Math.min(maxRadius,c.d-clearance-.08);
    for(let radius=largest;radius>=minRadius;radius*=.76){
      const count=Math.max(48,Math.ceil(Math.PI*2*(radius+clearance)/.6));let safe=true;
      if(contains)for(let i=0;i<count&&safe;i++){
        const angle=i/count*Math.PI*2;
        for(let offset=-clearance;offset<=clearance+.0001;offset+=Math.min(.5,clearance)){if(!inside(c.x+Math.sin(angle)*(radius+offset),c.z+Math.cos(angle)*(radius+offset))){safe=false;break;}}
      }
      if(!safe)continue;
      let shore=null,shoreDistance=Infinity;
      for(let i=0;i<outer.length;i++){
        const a=outer[i],b=outer[(i+1)%outer.length],dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz,t=den?Math.max(0,Math.min(1,((c.x-a[0])*dx+(c.z-a[1])*dz)/den)):0;
        const x=a[0]+t*dx,z=a[1]+t*dz,d=Math.hypot(x-c.x,z-c.z);if(d<shoreDistance){shoreDistance=d;shore={x,z};}
      }
      const direction=random()<.5?1:-1,phase=shore?Math.atan2(shore.x-c.x,shore.z-c.z):random()*Math.PI*2,length=2*Math.PI*radius;
      const sample=(distance=0)=>{const angle=phase+direction*(Number.isFinite(distance)?distance:0)/radius;return{x:c.x+Math.sin(angle)*radius,z:c.z+Math.cos(angle)*radius,yaw:angle+direction*Math.PI/2};};
      const points=[],segments=Math.max(48,Math.ceil(length/2));for(let i=0;i<segments;i++){const p=sample(i*length/segments);points.push([p.x,p.z]);}points.push([...points[0]]);
      return{points,length,sample,contains:inside,center:{x:c.x,z:c.z},radius,clearance,closed:true,dock:{shore,water:sample(0),distance:shoreDistance-radius},pointInsideCircle:(x,z)=>Math.hypot(x-c.x,z-c.z)<=radius+clearance};
    }
  }
  return null;
}
