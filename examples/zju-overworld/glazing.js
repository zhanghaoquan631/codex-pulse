import * as THREE from './vendor/three.module.js';
import {updateAvatar} from './avatar.js?v=11';

export const clearGlass=new THREE.MeshStandardMaterial({color:0xabcdd0,transparent:true,opacity:.16,roughness:.13,metalness:.08,depthWrite:false,side:THREE.DoubleSide});
const palette=new Map();
function box(parent,w,h,d,x,y,z,color){
  if(!palette.has(color))palette.set(color,new THREE.MeshStandardMaterial({color,roughness:.8,emissive:color,emissiveIntensity:.13}));
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),palette.get(color));m.position.set(x,y,z);parent.add(m);m.receiveShadow=true;return m;
}
export function foyerFurniture(){
  const group=new THREE.Group(),solids=[];
  const add=(w,h,d,x,y,z,c)=>{const m=box(group,w,h,d,x,y,z,c);solids.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,minY:y-h/2,maxY:y+h/2});return m;};
  for(const side of [-1,1]){
    const x=side*3.5;
    add(2,.12,.85,x,.82,-2.05,0xb8976c);
    for(const leg of [-1,1])add(.09,.76,.68,x+leg*.78,.38,-2.05,0x516d65);
    add(.62,.09,.6,x,.46,-2.85,0x8a9d78);add(.62,.63,.08,x,.79,-3.1,0x8a9d78);
    for(const dx of [-.24,.24])for(const dz of [-.22,.22])add(.055,.43,.055,x+dx,.215,-2.85+dz,0x516d65);
    box(group,.45,.04,.34,x,.91,-1.98,side<0?0x659790:0xb56849);
    add(.5,.58,.5,side*4.7,.29,-.85,0xd2c3a4);add(.13,1.05,.13,side*4.7,.88,-.85,0x71836c);
    for(const h of [.8,1.16,1.5])box(group,.66,.4,.5,side*4.7,h,-.85,0x779764);
  }
  return {group,solids};
}
export const glazingMethods={
  canGlaze(f,e){
    if(Math.min(e.t,1-e.t)*e.len<5.5||f.height<3.7)return false;
    const d={x:e.x,z:e.z,angle:Math.atan2(e.nx,e.nz)};
    for(const x of [-5.1,-3.5,0,3.5,5.1])for(const z of [-.6,-2,-4.3]){const p=this.doorWorld(d,x,z);if(!this.env.contains(f,p.x,p.z))return false;}
    return true;
  },
  addGlazedFoyer(f){
    const d=f.entrance,g=new THREE.Group();g.position.set(d.x,0,d.z);g.rotation.y=d.angle;this.env.campus.add(g);f.glazingGroup=g;
    for(const x of [-3.5,3.5]){
      const pane=new THREE.Mesh(new THREE.BoxGeometry(3.4,2.05,.07),clearGlass);pane.position.set(x,1.72,-.08);pane.userData.glass=true;g.add(pane);
      for(const sx of [-1.72,1.72])box(g,.08,2.12,.14,x+sx,1.72,-.08,0x54736c);
      for(const y of [.68,2.76])box(g,3.52,.08,.14,x,y,-.08,0x54736c);
      box(g,.065,2.05,.14,x,1.72,-.08,0x79948b);
    }
    const foyer=foyerFurniture();g.add(foyer.group);f.foyer=foyer;
    box(g,10.5,.14,4.5,0,.07,-2.25,0xd4d4c0);
    box(g,10.5,.13,4.5,0,3.3,-2.25,0xdddcca);
    for(const side of [-1,1]){box(g,.12,3.3,4.5,side*5.25,1.65,-2.25,0xe0dfd0);box(g,3.9,3.3,.12,side*3.3,1.65,-4.5,0xe0dfd0);}
    // All the visible furnishings are volumetric geometry behind real transparent panes.
    f.windowLobby=true;this.glazedBuildings.push(f);g.visible=false;
  },
  updateGlazing(dt){
    for(const f of this.glazedBuildings){
      const near=!this.room&&this.mode!=='aerial'&&Math.hypot(this.position.x-f.entrance.x,this.position.z-f.entrance.z)<65;
      f.glazingGroup.visible=near;
      if(near&&!f.foyerStudents){f.foyerStudents=[];for(const [i,x] of [-3.5,3.5].entries()){const rig=this.avatar(i?'blue':'green');this.root(rig).position.set(x,.16,-2.85);f.glazingGroup.add(this.root(rig));f.foyerStudents.push(rig);}}
      if(near)for(const [i,rig] of (f.foyerStudents||[]).entries()){rig.readingMotion?.resetPose();updateAvatar(rig,dt,0,'sit');this.updateReading(rig,dt,true,i*2.4);}
      if(!near&&f.foyerStudents){for(const rig of f.foyerStudents){this.root(rig).removeFromParent();rig.dispose?.();}f.foyerStudents=null;}
    }
  }
};
