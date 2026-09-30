import * as THREE from './vendor/three.module.js';

// Small original paper props mark actionable places without adding invisible
// collisions to the mapped streets. All materials respect world depth.
export function createChapterJourneyView(scene){
 let current=null;const props=new Map();
 function clear(){for(const root of props.values()){scene.remove(root);root.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});}props.clear();}
 function labelTexture(text){const c=document.createElement('canvas');c.width=512;c.height=112;const x=c.getContext('2d');x.fillStyle='#f4ecd7';x.fillRect(4,4,504,104);x.strokeStyle='#785388';x.lineWidth=4;x.strokeRect(5,5,502,102);x.font='bold 27px serif';x.fillStyle='#413347';x.textAlign='center';x.textBaseline='middle';x.fillText(text,256,57,478);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
 function box(root,w,h,d,x,y,z,color){const g=new THREE.BoxGeometry(w,h,d),m=new THREE.MeshBasicMaterial({color}),o=new THREE.Mesh(g,m);o.position.set(x,y,z);root.add(o);const lines=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:'#443946'}));lines.position.copy(o.position);root.add(lines);return o;}
 function build(step,index){const root=new THREE.Group();root.name='journey-prop:'+step.id;
  box(root,1.05,.18,.8,0,.09,0,'#c8b9a1');
  if(['pickup','collect','carry','install'].includes(step.kind)){
   box(root,.7,.62,.55,0,.48,0,'#e7d6ae');box(root,.12,.64,.58,0,.49,0,'#89714f');
   box(root,.74,.09,.58,0,.72,0,'#98755e');
  }else if(['order','align','sequence','rotation'].includes(step.kind)){
   box(root,.13,1.2,.13,0,.65,0,'#84707e');
   for(let i=0;i<3;i++)box(root,.25,.25,.16,(i-1)*.34,1.14,0,['#87654c','#5f8a83','#aa6773'][i]);
  }else{
   box(root,.18,1.25,.18,0,.8,0,'#87755e');box(root,.65,.56,.6,0,1.49,0,'#d7bc81');
   box(root,.8,.13,.75,0,1.83,0,'#785388');
  }
  const radius=step.radius||1.12;
  const ring=new THREE.Mesh(new THREE.RingGeometry(radius-.07,radius,64),new THREE.MeshBasicMaterial({color:'#785388',side:THREE.DoubleSide,transparent:true,opacity:.7}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;root.add(ring);root.userData.ring=ring;
  if(step.blockedRadius){const inner=new THREE.Mesh(new THREE.RingGeometry(step.blockedRadius-.05,step.blockedRadius,48),new THREE.MeshBasicMaterial({color:'#a5574b',side:THREE.DoubleSide,transparent:true,opacity:.45}));inner.rotation.x=-Math.PI/2;inner.position.y=.035;root.add(inner);}
  const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(`${index+1} · ${step.title}`),transparent:true,depthTest:true}));sign.position.y=2.3;sign.scale.set(3.5,.77,1);root.add(sign);root.userData.sign=sign;
  root.position.set(step.x,step.y,step.z);scene.add(root);return root;
 }
 function update(state,time){const l=state.level;if(current!==l){clear();current=l;}
  const j=l?.journey;if(!j)return;
  for(const [i,s] of j.steps.entries()){
   let root=props.get(s.id);if(!root){root=build(s,i);props.set(s.id,root);}
   const active=i===j.stepIndex&&!j.completed,done=s.completed;
   root.position.set(s.x,s.y,s.z);
   // At shared stations the newest state replaces the old prop instead of
   // drawing several cards or crates on top of one another.
   const superseded=j.steps.some((q,k)=>k>i&&(q.completed||k===j.stepIndex)&&Math.hypot(q.x-s.x,q.z-s.z)<1);
   root.visible=state.status==='playing'&&!superseded&&(active||done);
   const d=Math.hypot(state.player.x-s.x,state.player.z-s.z);
   root.userData.sign.visible=active&&d>2&&d<26;
   const signWidth=Math.min(4,Math.max(.55,d*.22));
   root.userData.sign.scale.set(signWidth,signWidth*112/512,1);
   root.userData.ring.material.color.set(done?'#52775f':'#785388');
   root.userData.ring.material.opacity=done?.4:.55+Math.sin(time*2)*.15;
  }
 }
 return {update,dispose:clear};
}
