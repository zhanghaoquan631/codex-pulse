import * as THREE from './vendor/three.module.js';
import {groundHeight} from './landforms.mjs';
import {segmentBoxDistance} from './camera-math.mjs';
import {stanceProfile} from './player-tactics.mjs';
import {storyStatus} from './story-state.mjs';

const finite=(n,f=0)=>Number.isFinite(n)?n:f;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const NO_RAYCAST=()=>{};

/** A small original folded-paper companion. It has no simulation entity,
 * collision body, attack state or raycast target. Unlock checks stay in the
 * story state module; this view never awards or changes persistent progress. */
export function createStoryCompanionView(scene,hero){
 const root=new THREE.Group();root.name='story-return-paper-crane';root.visible=false;
 root.userData={decorative:true,storyCompanion:true,targetable:false};
 const geometries=new Set(),materials=new Set();
 const material=color=>{const m=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:true,depthWrite:true,toneMapped:false});materials.add(m);return m;};
 const paper=material('#f7efd9'),shadow=material('#c2d3dc'),blue=material('#31526d'),red=material('#b25448');
 const ink=new THREE.LineBasicMaterial({color:'#31526d',depthTest:true});materials.add(ink);
 function face(parent,points,mat=paper){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));geometry.computeVertexNormals();geometries.add(geometry);
  const mesh=new THREE.Mesh(geometry,mat);mesh.raycast=NO_RAYCAST;parent.add(mesh);
  const edge=new THREE.BufferGeometry().setFromPoints([...points,points[0]].map(p=>new THREE.Vector3(...p)));geometries.add(edge);
  const line=new THREE.Line(edge,ink);line.raycast=NO_RAYCAST;parent.add(line);return mesh;
 }
 // Faceted keel, raised folded neck, a red beak and a narrow swept tail.
 const nose=[0,.065,.18],tail=[0,.025,-.20],left=[-.085,0,0],right=[.085,0,0],ridge=[0,.105,-.025];
 face(root,[nose,left,ridge]);face(root,[nose,ridge,right],shadow);
 face(root,[tail,ridge,left],shadow);face(root,[tail,right,ridge]);face(root,[nose,right,left],blue);
 face(root,[[0,.045,.14],[-.032,.235,.275],[.018,.195,.30]]);
 face(root,[[0,.045,.14],[.018,.195,.30],[.033,.038,.10]],shadow);
 face(root,[[-.032,.235,.275],[.008,.24,.355],[.018,.195,.30]]);
 face(root,[[.008,.24,.355],[.006,.175,.405],[.018,.195,.30]],red);
 face(root,[[0,.025,-.16],[0,.165,-.375],[-.036,.035,-.25]],shadow);
 face(root,[[0,.025,-.16],[.036,.035,-.25],[0,.165,-.375]]);
 const wings=[-1,1].map(side=>{
  const wing=new THREE.Group();wing.name=side<0?'paper-crane-left-fold':'paper-crane-right-fold';wing.position.set(side*.055,.06,-.015);root.add(wing);
  const tip=[side*.38,.035,-.21],fold=[side*.18,.075,.015],front=[side*.10,-.012,.18];
  face(wing,[[0,0,0],tip,fold],side<0?paper:shadow);face(wing,[[0,0,0],fold,front]);
  face(wing,[[side*.22,.056,-.07],tip,[side*.30,.039,-.075]],side<0?blue:red);
  return wing;
 });
 scene.add(root);
 let disposed=false,primed=false,lastLevel=null,phase=0,blocked=false,eligible=false;
 const heroPosition=new THREE.Vector3(),target=new THREE.Vector3(),next=new THREE.Vector3();
 const solidsFor=level=>[...(level.walls||[]),...(level.doors||[]).filter(d=>!d.open)]
  .filter(b=>!b.collapsed&&b.status!=='collapsed'&&[b.x,b.z,b.w,b.d,b.height].every(Number.isFinite));
 function clearSegment(level,solids,a,b,radius){
  const bounds=level.bounds;
  if(bounds&&(b.x<bounds.minX+radius||b.x>bounds.maxX-radius||b.z<bounds.minZ+radius||b.z>bounds.maxZ-radius))return false;
  // This conservative sphere encloses the entire folded model and its wings.
  if(b.y-radius<groundHeight(level,b.x,b.z)+.025)return false;
  const dir={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},length=distance(a,b);
  for(const box of solids){
   const half=Math.hypot(box.w,box.d)/2+radius;
   if(Math.min(a.x,b.x)>box.x+half||Math.max(a.x,b.x)<box.x-half||Math.min(a.z,b.z)>box.z+half||Math.max(a.z,b.z)<box.z-half)continue;
   if(Math.min(a.y,b.y)>finite(box.baseY)+box.height+radius||Math.max(a.y,b.y)<finite(box.baseY)-radius)continue;
   if(segmentBoxDistance(a,dir,{...box,baseY:finite(box.baseY)},length,radius)!==null)return false;
  }
  return true;
 }
 function update(state,time,dt=.016){
  if(disposed)return;
  const level=state?.level,p=state?.player,progress=state?.progress;
  const story=storyStatus(progress?.story,progress?.completedLevelIds||[]);
  eligible=story.complete===true&&story.endingSeen===true&&story.companionEnabled===true;
  if(!eligible||!level||!p||!['playing','complete'].includes(state.status)||![p.x,p.z].every(Number.isFinite)){
   root.visible=false;primed=false;blocked=false;return;
  }
  const seconds=Math.min(.05,Math.max(0,finite(dt)));phase+=seconds;
  const stance=stanceProfile(p),scale=stance.id==='prone'?.48:stance.id==='crouch'?.68:.82;
  const radius=.48*scale,base=groundHeight(level,p.x,p.z)+finite(p.y);
  root.scale.setScalar(scale);
  // Hero is already synced by main. Prefer its actual world anchor when it
  // matches the player, but never inherit stale camp coordinates or invisibility
  // (the hero mesh is intentionally hidden by the first-person camera).
  const anchor={x:p.x,y:base,z:p.z};
  if(hero?.getWorldPosition){hero.getWorldPosition(heroPosition);if(Math.hypot(heroPosition.x-p.x,heroPosition.z-p.z)<.05&&Math.abs(heroPosition.y-base)<.25)Object.assign(anchor,{x:heroPosition.x,y:heroPosition.y,z:heroPosition.z});}
  let fx=finite(p.facingX),fz=finite(p.facingZ),length=Math.hypot(fx,fz);
  if(length<.001){const angle=finite(hero?.rotation?.y);fx=Math.sin(angle);fz=Math.cos(angle);length=1;}
  fx/=length;fz/=length;
  const shoulder=anchor.y+Math.max(radius+.04,stance.height*.62);
  const origin={x:anchor.x,y:shoulder,z:anchor.z},solids=solidsFor(level);
  let found=false;
  // Stay behind the aiming plane even on an instant 180° turn. Try the other
  // shoulder in narrow passages; hide when neither has clearance, never move
  // the player, push walls away or float above a solid roof to stay visible.
  for(const [side,back,lower]of [[-.82,.50,0],[.82,.50,0],[-.60,.55,.12],[.60,.55,.12],[-.50,.48,.22],[.50,.48,.22]]){
   target.set(anchor.x+fz*side-fx*back,Math.max(anchor.y+radius+.035,shoulder-lower)+Math.sin(phase*2.2)*.018,anchor.z-fx*side-fz*back);
   const from={...origin,y:target.y};
   if(clearSegment(level,solids,from,target,radius)){found=true;break;}
  }
  blocked=!found;if(!found){root.visible=false;primed=false;return;}
  const changed=lastLevel!==level;lastLevel=level;
  if(!primed||changed||distance(root.position,target)>2.4){next.copy(target);}
  else next.copy(root.position).lerp(target,1-Math.exp(-11*seconds));
  // Smoothing may lag in front of the new aim direction, through a corner or
  // under a newly reached upstairs floor. Re-seat while hidden instead.
  const ahead=(next.x-anchor.x)*fx+(next.z-anchor.z)*fz;
  const tooHigh=next.y>anchor.y+stance.height*.82;
  if(ahead>-.12||tooHigh||!clearSegment(level,solids,{...origin,y:next.y},next,radius)||
    (primed&&!changed&&!clearSegment(level,solids,root.position,next,radius))){
   root.visible=false;root.position.copy(target);primed=false;return;
  }
  root.position.copy(next);root.rotation.y=Math.atan2(fx,fz);root.rotation.z=Math.sin(phase*2.2)*.028;
  wings[0].rotation.z=.18+Math.sin(phase*7)*.34;wings[1].rotation.z=-wings[0].rotation.z;
  root.visible=true;primed=true;
 }
 function dispose(){if(disposed)return;disposed=true;root.visible=false;scene.remove(root);for(const g of geometries)g.dispose();for(const m of materials)m.dispose();root.clear();}
 function snapshot(){return{visible:root.visible,eligible,blocked,disposed,position:root.position.toArray(),scale:root.scale.x,wingAngles:wings.map(w=>w.rotation.z),geometryCount:geometries.size,materialCount:materials.size,objectCount:root.children.length};}
 return {update,dispose,snapshot};
}
