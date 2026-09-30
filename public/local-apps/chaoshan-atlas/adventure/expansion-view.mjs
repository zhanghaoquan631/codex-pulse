import * as THREE from './vendor/three.module.js';
import {MEMENTOS} from './traveller-growth.mjs';
export function createExpansionView(scene,hero){
 const markers=new Map();let currentLevel=null,mementoId=undefined,badge=null;
 function clear(){for(const m of markers.values()){scene.remove(m);m.material.map.dispose();m.material.dispose();}markers.clear();}
 function stamp(text,color){const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#f5edd6';ctx.fillRect(8,8,112,112);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(10,10,108,108);ctx.fillStyle=color;ctx.font='bold 74px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,64,68);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
 function update(state,time){
  const l=state.level;
  if(l!==currentLevel){clear();currentLevel=l;}
  for(const e of l?.expedition?.evidence||[]){
   let m=markers.get(e.id);if(!m){m=new THREE.Sprite(new THREE.SpriteMaterial({map:stamp('证','#657d65'),transparent:true,depthTest:true}));m.name=e.id;m.scale.set(.8,.8,1);markers.set(e.id,m);scene.add(m);}
   m.visible=state.status==='playing'&&!e.collected;m.position.set(e.x,e.y+1.3+Math.sin(time*2)*.04,e.z);
  }
  const id=state.player.growth?.memento||null;if(id!==mementoId){
   mementoId=id;if(badge){badge.parent.remove(badge);badge.material.map.dispose();badge.material.dispose();badge.geometry.dispose();badge=null;}
   const item=MEMENTOS.find(m=>m.id===id);if(item){badge=new THREE.Mesh(new THREE.PlaneGeometry(.19,.22),new THREE.MeshBasicMaterial({map:stamp(item.symbol,'#963e32'),side:THREE.DoubleSide}));badge.name='traveller-district-memento';badge.position.set(-.06,.29,.102);hero.userData.rig.body.add(badge);}
  }
 }
 return {update,dispose(){clear();}};
}
