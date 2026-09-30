/** Compact one-cell furniture. Inject THREE; no imports, textures or DOM.
 * Anchor = (x + .5, .16 + y, z + .5), rotation = quarter turns about +Y.
 * appendBuildProp owns its instances, sharing reference-counted geometry/material.
 */
export const BUILD_PROPS=Object.freeze({
 bed:Object.freeze({name:'单人格床',label:'单人格床',height:.55,width:1,depth:1,description:'低矮木床，浅色枕头与鼠尾草绿被褥；床头朝局部 −Z。'}),
 workbench:Object.freeze({name:'工作台',label:'工作台',height:.8,width:1,depth:1,description:'带锤子和手锯的木制工作台。'}),
 bookshelf:Object.freeze({name:'书架',label:'书架',height:2,width:1,depth:1,description:'两米高书架，四层书籍。'}),
 fence:Object.freeze({name:'木栅栏',label:'木栅栏',height:1,width:1,depth:1,description:'带三道横条的木栅栏。'}),
 step:Object.freeze({name:'半高台阶',label:'半高台阶',height:.5,width:1,depth:1,description:'石面木边的半米踏步。'})
});
const shared=new WeakMap();
const C={oak:0xb98b5f,edge:0x8d6546,paleWood:0xd2ae7b,linen:0xe8e1cb,blanket:0x8ba99a,fold:0xb3c6ad,pillow:0xf0e8d6,metal:0x667975,tool:0xc29863,stone:0x9fa9a2,stoneTop:0xbfc5b7,books:[0x829a92,0xb77f6d,0xc7ad72,0x8397a8,0xa597af,0xb9b89a]};
function resources(T){let r=shared.get(T);if(!r){r={refs:0,geometry:new T.BoxGeometry(1,1,1),material:new T.MeshStandardMaterial({name:'Player furniture · matte warm colors',color:0xffffff,roughness:.8,metalness:.025})};shared.set(T,r);}r.refs++;return r;}
function partsFor(type){
 const parts=[],box=(w,h,d,x,y,z,color,rx=0,ry=0,rz=0)=>parts.push({size:[w,h,d],at:[x,y,z],color,rotation:[rx,ry,rz]});
 if(type==='bed'){
  for(const x of [-.335,.335])for(const z of [-.37,.37])box(.085,.19,.085,x,.095,z,C.edge);
  box(.84,.12,.95,0,.225,0,C.oak);box(.76,.12,.86,0,.345,0,C.linen);
  box(.78,.075,.58,0,.431,.13,C.blanket);box(.785,.035,.11,0,.48,-.112,C.fold);
  box(.56,.075,.23,0,.448,-.275,C.pillow);
  box(.84,.35,.055,0,.375,-.45,C.paleWood);box(.84,.15,.055,0,.285,.45,C.paleWood);
 }else if(type==='workbench'){
  for(const x of [-.365,.365])for(const z of [-.27,.27])box(.085,.63,.085,x,.315,z,C.edge);
  box(.81,.07,.59,0,.235,0,C.oak);box(.92,.11,.73,0,.675,0,C.paleWood);
  for(const z of [-.31,.31])box(.82,.14,.045,0,.56,z,C.oak);
  // Tools lie on the tabletop, with all metal below the .8m overall height.
  box(.028,.035,.29,.20,.751,.02,C.tool,0,-.38);box(.18,.060,.070,.251,.770,-.114,C.metal,0,-.38);
  box(.25,.016,.12,-.15,.743,.07,C.metal,0,.2);box(.06,.025,.12,-.299,.748,.10,C.tool,0,.2);
  box(.31,.030,.14,-.10,.748,-.22,C.oak);box(.12,.028,.075,-.09,.777,-.22,C.paleWood);
 }else if(type==='bookshelf'){
  box(.90,1.94,.045,0,.99,-.39,C.edge);
  for(const x of [-.43,.43])box(.08,2,.43,x,1,-.19,C.oak);
  for(const y of [.04,.51,.98,1.45,1.965])box(.80,.07,.43,0,y,-.19,C.paleWood);
  // Stable varied heights and muted colors, with pale spine bands.
  for(let row=0;row<4;row++)for(let i=0;i<6;i++){
   const x=-.325+i*.12,h=.26+((row*7+i*3)%5)*.026,w=.078+(i%3)*.007,bottom=.075+row*.47,z=-.155;
   box(w,h,.235,x,bottom+h/2,z,C.books[(row+i)%C.books.length]);
   box(w*.77,.014,.005,x,bottom+h*.78,z+.12,C.linen);
  }
 }else if(type==='fence'){
  for(const x of [-.43,.43]){box(.11,.94,.13,x,.47,0,C.oak);box(.14,.06,.16,x,.97,0,C.paleWood);}
  for(const y of [.22,.50,.78])box(.79,.09,.075,0,y,.01,C.paleWood);
 }else if(type==='step'){
  box(.98,.45,.98,0,.225,0,C.stone);box(.98,.05,.98,0,.475,0,C.stoneTop);
  for(const sign of [-1,1]){box(.02,.075,.98,sign*.49,.40,0,C.oak);box(.96,.075,.02,0,.40,sign*.49,C.oak);}
 }
 return parts;
}

/** Returns null for non-prop block types; otherwise {group,mesh,block,dispose()}.
 * Removing only the group does not dispose GPU instances: call this dispose.
 * Releasing one prop never disposes geometry still used by another live prop.
 */
export function appendBuildProp(T,parent,b){
 if(!Object.hasOwn(BUILD_PROPS,b?.type))return null;
 if(!T?.InstancedMesh||!parent?.add)throw new TypeError('appendBuildProp requires THREE and a parent Group');
 if(![b.x,b.y,b.z].every(Number.isFinite))throw new TypeError('Build prop coordinates must be finite');
 const block={...b,x:Math.round(b.x),y:Math.round(b.y),z:Math.round(b.z),rotation:((Math.round(Number.isFinite(b.rotation)?b.rotation:0)%4)+4)%4};
 const group=new T.Group();group.name=`Build ${block.type} · ${block.x},${block.y},${block.z}`;group.position.set(block.x+.5,.16+block.y,block.z+.5);group.rotation.y=block.rotation*Math.PI/2;group.userData.buildProp=block;group.userData.buildHeight=BUILD_PROPS[block.type].height;
 const r=resources(T),parts=partsFor(block.type),mesh=new T.InstancedMesh(r.geometry,r.material,parts.length);mesh.name=`${BUILD_PROPS[block.type].name} · shared box instances`;mesh.castShadow=true;mesh.receiveShadow=false;mesh.userData.buildProp=block;mesh.userData.instanceToBlock=parts.map(()=>block);
 const m=new T.Matrix4(),v=new T.Vector3(),s=new T.Vector3(),q=new T.Quaternion(),e=new T.Euler(),color=new T.Color();
 for(let i=0;i<parts.length;i++){const p=parts[i];v.set(...p.at);s.set(...p.size);q.setFromEuler(e.set(...p.rotation));m.compose(v,q,s);mesh.setMatrixAt(i,m);mesh.setColorAt(i,color.set(p.color));}
 mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);parent.add(group);let disposed=false;
 return {group,mesh,block,dispose(){if(disposed)return;disposed=true;group.removeFromParent();mesh.dispose();if(--r.refs===0){r.geometry.dispose();r.material.dispose();shared.delete(T);}}};
}
