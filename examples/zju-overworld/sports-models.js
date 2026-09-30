/** Procedural campus sports assets. Inject Three.js; no imports, DOM, downloads,
 * input, timers or gameplay physics. Metres, +Y up. Players face toward -Z.
 * Root placement/yaw belongs to the caller; all positions below are local.
 */
export const SPORTS_LAYOUTS=Object.freeze({
  baseball:Object.freeze({kind:'baseball',footprint:{minX:-6,maxX:6,minZ:-24,maxZ:4},playerBounds:{minX:-2,maxX:2,minZ:-1,maxZ:2},
    opponentBounds:{minX:-1.5,maxX:1.5,minZ:-17,maxZ:-15},player:{x:0,y:0,z:0},opponent:{x:0,y:0,z:-16},ballRadius:.065,groundY:0}),
  badminton:Object.freeze({kind:'badminton',footprint:{minX:-5,maxX:5,minZ:-9,maxZ:9},court:{minX:-3.05,maxX:3.05,minZ:-6.7,maxZ:6.7},
    playerBounds:{minX:-3.05,maxX:3.05,minZ:.35,maxZ:6.7},opponentBounds:{minX:-2.85,maxX:2.85,minZ:-6.35,maxZ:-.4},
    player:{x:0,y:0,z:4.5},opponent:{x:0,y:0,z:-4.5},netHeight:1.55,netCenterHeight:1.524,ballRadius:.027,groundY:0})
});
const activeBindings=new WeakMap();
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));

function assets(T){
 const geometries=new Set(),materials=new Map();let disposed=false;
 const material=(color,extra={})=>{const key=color+JSON.stringify(extra);if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness:.82,...extra}));return materials.get(key);};
 const mesh=(parent,geometry,color,p=[0,0,0],extra={})=>{geometries.add(geometry);const m=new T.Mesh(geometry,material(color,extra));m.position.set(...p);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const box=(g,w,h,d,x,y,z,color)=>mesh(g,new T.BoxGeometry(w,h,d),color,[x,y,z]);
 const cylinder=(g,r1,r2,h,x,y,z,color,segments=12)=>mesh(g,new T.CylinderGeometry(r1,r2,h,segments),color,[x,y,z]);
 function lines(g,segments,color='#edf0da',opacity=1){
  const geometry=new T.BufferGeometry().setFromPoints(segments.flatMap(s=>s.map(p=>new T.Vector3(...p))));geometries.add(geometry);
  const key='line:'+color+':'+opacity;if(!materials.has(key))materials.set(key,new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));
  const m=new T.LineSegments(geometry,materials.get(key));g.add(m);return m;
 }
 function stripe(g,a,b,width=.04,color='#f7f2db',y=.029){
  const dx=b[0]-a[0],dz=b[1]-a[1],m=box(g,width,.009,Math.hypot(dx,dz),(a[0]+b[0])/2,y,(a[1]+b[1])/2,color);m.rotation.y=Math.atan2(dx,dz);return m;
 }
 function rectangle(g,x1,z1,x2,z2,color,width=.04,y=.029){
  stripe(g,[x1,z1],[x2,z1],width,color,y);stripe(g,[x2,z1],[x2,z2],width,color,y);stripe(g,[x2,z2],[x1,z2],width,color,y);stripe(g,[x1,z2],[x1,z1],width,color,y);
 }
 function net(g,a,b,bottom,top,{spacing=.18,color='#426c67',opacity=.58,sag=0}={}){
  const segments=[],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),count=Math.ceil(length/spacing);
  for(let i=0;i<=count;i++){const t=i/count,h=top-sag*Math.sin(Math.PI*t);segments.push([[a[0]+dx*t,bottom,a[1]+dz*t],[a[0]+dx*t,h,a[1]+dz*t]]);}
  for(let y=bottom;y<=top+.0001;y+=spacing)segments.push([[a[0],y,a[1]],[b[0],y,b[1]]]);
  return lines(g,segments,color,opacity);
 }
 return {mesh,box,cylinder,lines,stripe,rectangle,net,material,track:geometry=>{geometries.add(geometry);return geometry;},
  dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();},
  counts:()=>({geometries:geometries.size,materials:materials.size})};
}

function makeBat(T,A){
 const group=new T.Group();group.name='Baseball bat · grip origin · length 0.86m';
 A.cylinder(group,.019,.018,.20,0,.09,0,'#303f48');
 A.cylinder(group,.043,.019,.50,0,.44,0,'#cb9760');
 A.cylinder(group,.046,.043,.17,0,.775,0,'#e7b777');
 A.mesh(group,new T.SphereGeometry(.046,10,8),'#e7b777',[0,.86,0]).scale.y=.55;
 A.cylinder(group,.026,.026,.015,0,-.016,0,'#e7b777');
 for(let y=.015;y<.17;y+=.027){const ring=A.mesh(group,new T.TorusGeometry(.0195,.002,4,10),'#788581',[0,y,0]);ring.rotation.x=Math.PI/2;}
 group.userData.sportsEquipment='bat';group.userData.grip=[0,0,0];group.userData.strikeCenter=[0,.71,0];group.userData.length=.90;return group;
}
function makeRacket(T,A){
 const group=new T.Group();group.name='Badminton racket · grip origin · length 0.67m';
 A.cylinder(group,.017,.019,.15,0,.06,0,'#27464f');A.cylinder(group,.005,.005,.24,0,.25,0,'#9aa8a9',8);
 const ring=A.mesh(group,new T.TorusGeometry(.16,.009,7,36),'#efbe53',[0,.49,0]);ring.scale.set(.79,1.10,1);
 const strings=[];for(let x=-.11;x<=.111;x+=.025){const h=.176*Math.sqrt(Math.max(0,1-(x/.1264)**2));strings.push([[x,.49-h,0],[x,.49+h,0]]);}
 for(let y=-.15;y<=.151;y+=.025){const w=.1264*Math.sqrt(Math.max(0,1-(y/.176)**2));strings.push([[-w,.49+y,0],[w,.49+y,0]]);}
 A.lines(group,strings,'#e7ebd5',.83);A.box(group,.035,.02,.021,0,.34,0,'#547e79');
 group.userData.sportsEquipment='racket';group.userData.grip=[0,0,0];group.userData.strikeCenter=[0,.49,0];group.userData.length=.675;return group;
}
function makeBaseball(T,A){
 const group=new T.Group();group.name='Playable baseball';
 A.mesh(group,new T.SphereGeometry(.065,16,12),'#f6ecd7');
 const seams=[];
 for(const sign of [-1,1])for(let i=0;i<28;i++){
  const a=i/28*Math.PI*2,b=(i+1)/28*Math.PI*2;
  const point=t=>[Math.cos(t)*.049,Math.sin(t)*.058,sign*(.022+.012*Math.cos(t*2))];
  seams.push([point(a),point(b)]);
 }
 A.lines(group,seams,'#bf564e');group.userData.radius=.065;return group;
}
function makeShuttle(T,A){
 const group=new T.Group();group.name='Playable shuttlecock · cork at origin · skirt +Y';
 A.mesh(group,new T.SphereGeometry(.027,12,8),'#d8bf8d',[0,0,0]).scale.y=.92;
 A.cylinder(group,.033,.025,.022,0,.025,0,'#f0e8d0');
 for(let i=0;i<12;i++){
  const a=i/12*Math.PI*2,g=new T.Group();g.rotation.y=a;group.add(g);
  const feather=A.mesh(g,new T.ConeGeometry(.022,.115,4),'#f7f1dd',[0,.091,.061]);feather.rotation.x=.46;feather.scale.z=.36;
 }
 for(const [radius,y] of [[.037,.048],[.071,.126]]){const ring=A.mesh(group,new T.TorusGeometry(radius,.0025,4,24),'#eee9d5',[0,y,0]);ring.rotation.x=Math.PI/2;}
 group.userData.radius=.027;group.userData.skirtRadius=.09;group.userData.length=.17;return group;
}

// A small jointed fallback keeps the field playable even before campus avatars
// are injected. Supplying opponentRig uses that avatar without owning its assets.
function fallbackRig(T,A,kind){
 const group=new T.Group();group.name=kind==='baseball'?'Practice pitcher':'Badminton opponent';const joints={};
 const joint=(name,parent,p)=>{const g=new T.Group();g.name=name;g.position.set(...p);(parent?joints[parent]:group).add(g);joints[name]=g;return g;};
 joint('hips',null,[0,.73,0]);joint('torso','hips',[0,.065,0]);joint('head','torso',[0,.44,.01]);
 A.box(joints.hips,.34,.18,.24,0,-.015,0,'#425d65');A.box(joints.torso,.43,.35,.28,0,.15,0,kind==='baseball'?'#b75d50':'#4a9590');
 A.mesh(joints.head,new T.SphereGeometry(.21,12,10),'#e4bd95',[0,.17,0]);
 A.mesh(joints.head,new T.SphereGeometry(.214,12,8),'#4b4039',[0,.245,-.025]).scale.set(1,.6,1);
 for(const x of [-.068,.068])A.mesh(joints.head,new T.SphereGeometry(.018,6,5),'#283b3e',[x,.17,.199]);
 if(kind==='baseball'){A.cylinder(joints.head,.218,.218,.05,0,.32,0,'#e1ba63');A.box(joints.head,.23,.025,.15,0,.32,.19,'#e1ba63');}
 for(const [side,sign] of [['L',1],['R',-1]]){
  joint('upperArm'+side,'torso',[sign*.265,.29,0]);joint('lowerArm'+side,'upperArm'+side,[0,-.225,0]);joint('hand'+side,'lowerArm'+side,[0,-.19,0]);
  A.cylinder(joints['upperArm'+side],.065,.059,.21,0,-.11,0,kind==='baseball'?'#b75d50':'#4a9590');
  A.cylinder(joints['lowerArm'+side],.05,.045,.18,0,-.09,0,'#e4bd95');A.mesh(joints['hand'+side],new T.SphereGeometry(.05,8,6),'#e4bd95',[0,-.025,0]);
  joint('upperLeg'+side,'hips',[sign*.105,-.06,0]);joint('lowerLeg'+side,'upperLeg'+side,[0,-.28,0]);joint('foot'+side,'lowerLeg'+side,[0,-.28,.015]);
  A.cylinder(joints['upperLeg'+side],.078,.067,.26,0,-.13,0,'#425d65');A.cylinder(joints['lowerLeg'+side],.055,.046,.25,0,-.125,0,'#e4bd95');A.box(joints['foot'+side],.13,.09,.22,0,-.045,.06,'#e8e5d5');
 }
 return {group,joints};
}
function snapshotRig(rig){const root=rig.root||rig.group;return {root,parent:root.parent,position:root.position.clone(),quaternion:root.quaternion.clone(),scale:root.scale.clone(),
  joints:Object.values(rig.joints||{}).map(j=>({j,position:j.position.clone(),quaternion:j.quaternion.clone(),scale:j.scale.clone()}))};}
function restoreRig(s){s.root.removeFromParent();if(s.parent)s.parent.add(s.root);s.root.position.copy(s.position);s.root.quaternion.copy(s.quaternion);s.root.scale.copy(s.scale);for(const q of s.joints){q.j.position.copy(q.position);q.j.quaternion.copy(q.quaternion);q.j.scale.copy(q.scale);}}

/** Absolute pose layer; call AFTER the ordinary avatar walk/idle pose. Does not
 * write avatar position, root yaw, scale, or gameplay state. Phase is 0..1.
 */
export function applySportsPose(rig,kind,{action='ready',phase=0}={}){
 const j=rig?.joints;if(!j)return rig;const t=clamp(phase),swing=Math.sin(Math.PI*t),finish=Math.sin(Math.PI*t*.5),pitch=['pitch','throw','serve'].includes(action);
 const hit=['swing','hit','return','smash'].includes(action);
 const set=(name,x=0,y=0,z=0)=>j[name]?.rotation.set(x,y,z);
 if(kind==='baseball'){
  set('torso',.10,hit?-.6+1.35*finish:pitch?-.35+.8*finish:-.35,0);
  set('upperArmR',pitch?-2.65+2.5*finish:hit?-.9-1.05*swing:-1.0,0,hit?-.28+.8*finish:-.45);
  set('lowerArmR',pitch?-.65*(1-t):hit?-.75+.55*swing:-1.1,0,0);
  set('upperArmL',pitch?-.5:hit?-.65-.55*swing:-.7,0,.45);set('lowerArmL',-.9,0,0);
  set('head',-.05,.2,0);
 }else{
  set('torso',hit?.08+.18*swing:.07,hit?-.30+.65*finish:0,0);
  set('upperArmR',hit?-2.8+2.5*finish:pitch?-1.2:-.65,0,hit?-.35:-.22);set('lowerArmR',hit?-.25-.6*(1-t):-.95,0,0);
  set('upperArmL',-.30,0,.3);set('lowerArmL',-.75,0,0);set('head',hit?-.15:0,0,0);
 }
 return rig;
}

function setupActors(T,A,model,options){
 const external=options.opponentRig,rig=external||fallbackRig(T,A,model.kind),saved=external?snapshotRig(rig):null;
 const opponent=new T.Group();opponent.name=model.kind==='baseball'?'Pitcher controller anchor':'Opponent controller anchor';model.group.add(opponent);
 const root=rig.root||rig.group;opponent.add(root);root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.setScalar(1);
 const hiddenProps=[];root.traverse(o=>{if(/role:.*:(handItem|readingBook|basketball)(:|$)/.test(o.name)){hiddenProps.push([o,o.visible]);o.visible=false;}});
 opponent.position.set(model.anchors.opponent.x,model.anchors.opponent.y,model.anchors.opponent.z);
 model.opponent={group:opponent,rig,owned:!external};
 const ownProps=[],aiRacket=model.kind==='badminton'?makeRacket(T,A):null;
 if(aiRacket){rig.joints?.handR?.add(aiRacket);aiRacket.rotation.z=Math.PI;aiRacket.position.y=-.045;ownProps.push(aiRacket);}
 if(model.kind==='baseball'){
  const glove=new T.Group();glove.name='Pitching glove';rig.joints?.handL?.add(glove);ownProps.push(glove);A.mesh(glove,new T.SphereGeometry(.115,10,8),'#93623f',[0,-.05,.025]).scale.set(.85,1,.55);
 }
 model.setOpponentPose=({x=opponent.position.x,y=0,z=opponent.position.z,heading=0,action='ready',phase=0}={},animation)=>{
  const pose=animation||{action,phase};opponent.position.set(x,y,z);opponent.rotation.y=heading;applySportsPose(rig,model.kind,pose);
  const stride=pose.action==='run'?Math.sin(clamp(pose.phase)*Math.PI*2)*.5:0;
  for(const [side,sign] of [['L',1],['R',-1]]){rig.joints?.['upperLeg'+side]?.rotation.set(stride*sign,0,0);rig.joints?.['lowerLeg'+side]?.rotation.set(Math.max(0,-stride*sign)*.7,0,0);}
  return opponent;
 };
 model.setOpponentPose({x:model.anchors.opponent.x,z:model.anchors.opponent.z});
 const bindings=new Set();
 model.bindPlayer=player=>{
  if(!player?.joints?.handR)throw new TypeError('bindPlayer requires a campus avatar with handR.');
  for(const existing of [...bindings])existing.dispose();
  if(activeBindings.has(player))activeBindings.get(player).dispose();
  const tool=model.kind==='baseball'?model.equipment.bat:model.equipment.racket,oldParent=tool.parent,oldPosition=tool.position.clone(),oldQuaternion=tool.quaternion.clone(),oldScale=tool.scale.clone();
  const joints=Object.values(player.joints).map(j=>({j,quaternion:j.quaternion.clone()})),hidden=[];
  (player.root||player.group).traverse(o=>{if(/role:.*:(handItem|readingBook|basketball)(:|$)/.test(o.name)){hidden.push([o,o.visible]);o.visible=false;}});
  player.joints.handR.add(tool);tool.position.set(0,-.045,0);tool.rotation.set(0,0,Math.PI);tool.scale.setScalar(1);
  let disposed=false;
  const binding={tool,rig:player,update(pose={}){if(!disposed)applySportsPose(player,model.kind,pose);},dispose(){
   if(disposed)return;disposed=true;tool.removeFromParent();if(oldParent)oldParent.add(tool);tool.position.copy(oldPosition);tool.quaternion.copy(oldQuaternion);tool.scale.copy(oldScale);
   for(const q of joints)q.j.quaternion.copy(q.quaternion);for(const [o,visible] of hidden)o.visible=visible;
   bindings.delete(binding);if(activeBindings.get(player)===binding)activeBindings.delete(player);
  }};
  bindings.add(binding);activeBindings.set(player,binding);binding.update();return binding;
 };
 return ()=>{for(const b of [...bindings])b.dispose();for(const prop of ownProps)prop.removeFromParent();for(const [o,visible] of hiddenProps)o.visible=visible;if(saved)restoreRig(saved);};
}

function baseModel(T,kind,options){
 if(!T?.Group||!T?.Vector3)throw new TypeError('Pass the Three.js namespace.');
 const A=assets(T),layout=SPORTS_LAYOUTS[kind],group=new T.Group(),staticGroup=new T.Group();group.name=kind==='baseball'?'Campus playable baseball practice':'Campus playable badminton';staticGroup.name='Static court, markings and net';group.add(staticGroup);
 const model={kind,group,staticGroup,bounds:{...layout.footprint},playerBounds:{...layout.playerBounds},opponentBounds:{...layout.opponentBounds},courtBounds:layout.court?{...layout.court}:null,
  anchors:{player:{...layout.player},opponent:{...layout.opponent}},surfaceY:0,equipment:{},layout};
 model.toWorld=p=>{group.updateWorldMatrix(true,false);return group.localToWorld(new T.Vector3(p.x,p.y??0,p.z));};
 model.toLocal=p=>{group.updateWorldMatrix(true,false);return group.worldToLocal(new T.Vector3(p.x,p.y??0,p.z));};
 model.contains=(p,region='bounds',margin=0)=>{const b=model[region];return !!b&&p.x>=b.minX+margin&&p.x<=b.maxX-margin&&p.z>=b.minZ+margin&&p.z<=b.maxZ-margin;};
 const ball=kind==='baseball'?makeBaseball(T,A):makeShuttle(T,A);group.add(ball);model.ball=ball;
 const halo=A.mesh(ball,new T.SphereGeometry(kind==='baseball'?.115:.105,12,8),kind==='baseball'?'#ffe8a0':'#edfff3',[0,0,0],{transparent:true,opacity:.17,depthWrite:false,emissive:kind==='baseball'?'#ffe08a':'#c7fbe2',emissiveIntensity:.9});
 halo.name='Ball visibility halo';halo.castShadow=false;halo.receiveShadow=false;
 const trail=A.lines(group,[[[0,0,0],[0,0,0]]],kind==='baseball'?'#f4cf79':'#e1f9df',.62),trailGeometry=A.track(new T.BufferGeometry());
 trail.geometry=trailGeometry;trail.name='Recent ball path · visual only';trail.frustumCulled=false;trail.visible=false;model.trail=trail;
 const history=[],trailArray=new Float32Array(11*2*3);trailGeometry.setAttribute('position',new T.BufferAttribute(trailArray,3));trailGeometry.setDrawRange(0,0);
 model.setBall=(position,velocity)=>{
  if(!position||position.visible===false||position.active===false){ball.visible=false;trail.visible=false;history.length=0;return ball;}
  if(!Number.isFinite(position.x)||!Number.isFinite(position.z)||!Number.isFinite(position.y??0))throw new TypeError('Ball position must be finite.');
  ball.visible=true;ball.position.set(position.x,position.y??0,position.z);
  const previous=history.at(-1),distance=previous?ball.position.distanceTo(previous):0;
  if(distance>8)history.length=0;
  if(!history.length||distance>.03){history.push(ball.position.clone());if(history.length>12)history.shift();}
  for(let i=1;i<history.length;i++){history[i-1].toArray(trailArray,(i-1)*6);history[i].toArray(trailArray,(i-1)*6+3);}
  trailGeometry.attributes.position.needsUpdate=true;trailGeometry.setDrawRange(0,Math.max(0,history.length-1)*2);trail.visible=history.length>1;
  velocity=velocity||position.velocity||(Number.isFinite(position.vx)?{x:position.vx,y:position.vy||0,z:position.vz||0}:null);
  if(velocity&&kind==='badminton'){const v=new T.Vector3(-velocity.x,-velocity.y,-velocity.z);if(v.lengthSq()>1e-7)ball.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());}
  return ball;
 };
 model.setBall({...layout.player,y:1.15});
 model.stats=()=>A.counts();let actorsDispose=noop,disposed=false;
 model.dispose=()=>{if(disposed)return;disposed=true;actorsDispose();group.removeFromParent();A.dispose();};
 return {A,model,finish(){actorsDispose=setupActors(T,A,model,options);return model;}};
}
function noop(){}

export function createBaseballPractice(T,options={}){
 const {A,model,finish}=baseModel(T,'baseball',options),g=model.staticGroup;
 A.box(g,12,.06,28,0,-.03,-10,'#779667');A.box(g,3.2,.018,3.0,0,.009,0,'#b88461');
 A.rectangle(g,-5.65,-23.6,5.65,3.6,'#d8dfc0',.045,.025);
 for(const x of [-1.15,1.15])A.rectangle(g,x-.42,-.65,x+.42,.95,'#efe8d0',.045,.035);
 const plate=new T.Shape();plate.moveTo(-.22,-.20);plate.lineTo(.22,-.20);plate.lineTo(.22,.04);plate.lineTo(0,.27);plate.lineTo(-.22,.04);plate.closePath();
 const home=A.mesh(g,new T.ShapeGeometry(plate),'#f4ead5',[0,.038,0]);home.rotation.x=-Math.PI/2;
 A.stripe(g,[0,.27],[-5.4,-5.2],.04);A.stripe(g,[0,.27],[5.4,-5.2],.04);
 A.cylinder(g,1.1,1.18,.08,0,.025,-16,'#b08a64',28);A.box(g,.6,.024,.16,0,.077,-16,'#ece8d2');
 for(const z of [-8,-12,-20]){A.stripe(g,[-.35,z],[.35,z],.035,'#d8dfbc');}
 // The cage has an open near-side entrance and no opaque walls/roof.
 for(const x of [-5.7,5.7]){
  for(const z of [-23.5,-10,2.7])A.cylinder(g,.045,.045,3.25,x,1.625,z,'#446d60',8);
  A.net(g,[x,-23.5],[x,2.7],.12,3.2,{spacing:.6,opacity:.26});
 }
 A.net(g,[-5.7,-23.5],[5.7,-23.5],.12,3.2,{spacing:.5,opacity:.4});
 A.box(g,11.5,.08,.08,0,3.25,-23.5,'#446d60');
 // A distinct distant target wall marks the landing/scoring direction.
 for(const x of [-3,0,3]){const ring=A.mesh(g,new T.TorusGeometry(.66,.045,7,28),x===0?'#e3b94e':'#eee6c9',[x,1.4,-23.42]);ring.userData.sportsTarget=true;}
 const rack=new T.Group();rack.name='Bat and ball rack';rack.position.set(4.8,0,2.1);g.add(rack);
 A.box(rack,.55,.45,.45,0,.23,0,'#42665b');A.box(rack,.57,.045,.47,0,.46,0,'#bda780');
 const bat=makeBat(T,A);rack.add(bat);bat.position.set(-.13,.47,0);bat.rotation.z=-.15;model.equipment.bat=bat;
 for(let i=0;i<3;i++)A.mesh(rack,new T.SphereGeometry(.065,10,8),'#f4ead5',[.15,.52+i*.12,0]);
 model.anchors.pitchRelease={x:0,y:1.35,z:-16};model.anchors.strike={x:0,y:1.1,z:0};
 return finish();
}

export function createBadmintonCourt(T,options={}){
 const {A,model,finish}=baseModel(T,'badminton',options),g=model.staticGroup;
 A.box(g,10,.06,18,0,-.03,0,'#7f9c89');A.box(g,6.1,.018,13.4,0,.009,0,'#467e78');
 A.rectangle(g,-3.05,-6.7,3.05,6.7,'#f5ecd2',.04,.031);
 for(const x of [-2.59,2.59])A.stripe(g,[x,-6.7],[x,6.7],.04,'#f5ecd2',.031);
 for(const z of [-5.94,-1.98,1.98,5.94])A.stripe(g,[-3.05,z],[3.05,z],.04,'#f5ecd2',.031);
 for(const sign of [-1,1])A.stripe(g,[0,sign*1.98],[0,sign*6.7],.04,'#f5ecd2',.031);
 for(const x of [-3.13,3.13]){A.box(g,.32,.12,.38,x,.06,0,'#3e6664');A.cylinder(g,.035,.041,1.55,x,.775,0,'#e8e4d1',10);}
 const netGroup=new T.Group();netGroup.name='Badminton net · z=0 · legal height profile';g.add(netGroup);
 A.net(netGroup,[-3.05,0],[3.05,0],.79,1.524,{spacing:.13,color:'#233f43',opacity:.66});
 const tape=[];for(let i=0;i<40;i++){const x=-3.13+i*6.26/40,x2=-3.13+(i+1)*6.26/40,h=q=>1.524+.026*(Math.abs(q)/3.13)**2;
  const bar=A.box(netGroup,x2-x+.003,.038,.035,(x+x2)/2,(h(x)+h(x2))/2-.019,0,'#efe8d0');bar.rotation.z=Math.atan2(h(x2)-h(x),x2-x);}
 model.net={group:netGroup,z:0,minX:-3.05,maxX:3.05,centerHeight:1.524,postHeight:1.55,bottom:.79};
 const rack=new T.Group();rack.name='Racket rest and spare shuttle';rack.position.set(4.1,0,6.7);g.add(rack);
 A.box(rack,.62,.4,.4,0,.2,0,'#4b7168');A.box(rack,.65,.045,.44,0,.42,0,'#cbb78e');
 const racket=makeRacket(T,A);rack.add(racket);racket.position.set(-.10,.45,0);racket.rotation.z=-.14;model.equipment.racket=racket;
 const spare=makeShuttle(T,A);rack.add(spare);spare.position.set(.18,.45,0);
 model.anchors.serve={x:0,y:1.25,z:4.5};
 return finish();
}
