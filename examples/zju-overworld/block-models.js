/** Procedural 1m building pieces. Inject THREE; no imports or remote assets.
 * Cell anchor: (x + .5, .16 + y, z + .5). rotation is quarter turns about +Y.
 * Door/window front is +Z; left hinges open -PI/2 toward local +Z.
 * All repeated components are instanced, including door/window moving parts.
 */
export const BUILD_VISUAL_GRID=Object.freeze({size:1,groundY:.16,doorHeight:2});
const OPEN_ANGLE=-Math.PI/2;
const TYPES=new Set(['wood','brick','stone','white','roof','glass','door','window','lamp']);
const COLORS={wood:'#c59a6b',brick:'#af7763',stone:'#a7ada4',white:'#e8e5d8',roof:'#586c6c'};
const finite=(n,f=0)=>Number.isFinite(n)?n:f;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

// Broad, continuous material details; deliberately no per-pixel noise.
function makeTexture(T,type){
 let canvas;
 if(typeof document!=='undefined')canvas=document.createElement('canvas');
 else if(typeof OffscreenCanvas!=='undefined')canvas=new OffscreenCanvas(256,256);
 if(!canvas)return null;canvas.width=canvas.height=256;
 const c=canvas.getContext('2d');if(!c)return null;
 c.fillStyle=COLORS[type];c.fillRect(0,0,256,256);
 if(type==='wood'){
  for(let i=0;i<4;i++){
   const x=i*64,g=c.createLinearGradient(x,0,x+64,0);g.addColorStop(0,'rgba(91,61,36,.12)');g.addColorStop(.25,'rgba(248,222,183,.1)');g.addColorStop(1,'rgba(91,61,36,.03)');c.fillStyle=g;c.fillRect(x,0,64,256);
   c.strokeStyle='rgba(77,57,36,.23)';c.lineWidth=1.8;c.beginPath();c.moveTo(x+.5,0);c.lineTo(x+.5,256);c.stroke();
   for(let j=0;j<7;j++){const u=x+7+j*7.3;c.strokeStyle=`rgba(111,76,43,${.055+(j%3)*.018})`;c.lineWidth=.8;c.beginPath();c.moveTo(u,0);c.bezierCurveTo(u+10,68,u-8,160,u,256);c.stroke();}
  }
 }else if(type==='brick'){
  c.fillStyle='#cdc2af';c.fillRect(0,0,256,256);
  for(let row=0;row<5;row++)for(let col=-1;col<3;col++){
   const x=col*128+(row%2)*64,y=row*64;const g=c.createLinearGradient(x,y,x,y+61);g.addColorStop(0,row%2?'#b17b65':'#b7826d');g.addColorStop(1,'#a56f5c');c.fillStyle=g;c.fillRect(x+2,y+2,124,60);c.strokeStyle='rgba(249,219,185,.15)';c.lineWidth=1;c.strokeRect(x+3,y+3,122,58);
  }
 }else if(type==='stone'){
  c.fillStyle='#929d94';c.fillRect(0,0,256,256);
  for(let row=0;row<2;row++)for(let col=-1;col<3;col++){
   const x=col*128+(row%2)*64,y=row*128;const g=c.createLinearGradient(x,y,x+128,y+128);g.addColorStop(0,'#b7bcb1');g.addColorStop(1,'#a1aba1');c.fillStyle=g;c.fillRect(x+1.4,y+1.4,125.2,125.2);c.strokeStyle='rgba(232,234,219,.21)';c.lineWidth=1;c.strokeRect(x+3,y+3,122,122);
  }
 }else if(type==='roof'){
  for(let row=0;row<4;row++)for(let col=-1;col<5;col++){
   const x=col*64+(row%2)*32,y=row*64;const g=c.createLinearGradient(x,y,x,y+64);g.addColorStop(0,'#718382');g.addColorStop(1,'#516667');c.fillStyle=g;c.fillRect(x+1,y+1,62,62);c.strokeStyle='rgba(39,57,58,.3)';c.lineWidth=2;c.beginPath();c.moveTo(x,y+63);c.lineTo(x+64,y+63);c.stroke();
  }
 }else{
  const g=c.createLinearGradient(0,0,256,256);g.addColorStop(0,'#efecdf');g.addColorStop(.5,'#e8e5d8');g.addColorStop(1,'#e4e0d1');c.fillStyle=g;c.fillRect(0,0,256,256);
 }
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;texture.name=`Build ${type} continuous material`;return texture;
}

export function createBuildVisuals(T){
 if(!T?.InstancedMesh)throw new TypeError('createBuildVisuals requires THREE');
 const group=new T.Group();group.name='Player construction · one metre grid';group.userData.buildVisuals=true;
 const textures=[],materials={},batches=new Map(),panels=new Map(),lampLights=[];
 const box=new T.BoxGeometry(1,1,1),edgeGeometry=new T.EdgesGeometry(box);
 const matrix=new T.Matrix4(),localMatrix=new T.Matrix4(),hingeMatrix=new T.Matrix4(),rotationMatrix=new T.Matrix4();
 const position=new T.Vector3(),scale=new T.Vector3(),quaternion=new T.Quaternion(),up=new T.Vector3(0,1,0),instanceColor=new T.Color();
 let disposed=false;
 for(const type of Object.keys(COLORS)){
  const map=makeTexture(T,type);if(map)textures.push(map);
  materials[type]=new T.MeshStandardMaterial({name:`Build ${type}`,color:map?'#ffffff':COLORS[type],map,roughness:type==='white'?.9:.85});
 }
 materials.frame=new T.MeshStandardMaterial({name:'Oiled dark window frames',color:'#49625d',roughness:.65,metalness:.08});
 materials.trim=new T.MeshStandardMaterial({name:'Pale door trim',color:'#e8dfca',roughness:.72});
 materials.metal=new T.MeshStandardMaterial({name:'Brushed brass handles',color:'#bf975a',roughness:.38,metalness:.65});
 materials.glass=new T.MeshStandardMaterial({name:'Clear blue green glazing',color:'#bedbda',roughness:.14,metalness:.05,transparent:true,opacity:.25,depthWrite:false});
 materials.bulb=new T.MeshStandardMaterial({name:'Warm frosted lamp',color:'#fff1d0',emissive:'#ffd189',emissiveIntensity:1.25,roughness:.35});
 const previewMaterial=new T.MeshBasicMaterial({color:'#7ccbab',transparent:true,opacity:.2,depthWrite:false});
 const previewEdgeMaterial=new T.LineBasicMaterial({color:'#acffe0',transparent:true,opacity:.9,depthWrite:false});
 const preview=new T.Group();preview.name='Placement preview';preview.visible=false;
 const previewFill=new T.Mesh(box,previewMaterial),previewEdges=new T.LineSegments(edgeGeometry,previewEdgeMaterial);
 previewFill.renderOrder=20;previewEdges.renderOrder=21;preview.add(previewFill,previewEdges);group.add(preview);

 function materialBatch(name,geometry=box){
  const key=name;
  if(!batches.has(key))batches.set(key,{key,name,geometry,parts:[],mesh:null,capacity:0,dirty:false});
  return batches.get(key);
 }
 function add(block,name,size,at,panel=null,geometry=box){
  const batch=materialBatch(name,geometry),part={block,size,at,panel,index:batch.parts.length,batch};
  batch.parts.push(part);if(panel)panel.parts.push(part);
 }
 function frame(block,height,material='frame'){
  const top=.05,bottom=height===2?.02:.055;
  add(block,material,[.08,height,.16],[-.46,height/2,0]);add(block,material,[.08,height,.16],[.46,height/2,0]);
  add(block,material,[.84,top,.16],[0,height-top/2,0]);add(block,material,[.84,bottom,.16],[0,bottom/2,0]);
 }
 function makePanel(block,old){
  const door=block.type==='door',target=block.open?OPEN_ANGLE:0;
  const panel={id:block.id,key:block.key,block,target,angle:old?.type===block.type?old.angle:target,type:block.type,
   pivot:{x:door?-.44:-.43,y:door?.04:.08,z:0},width:door?.88:.86,height:door?1.9:.84,parts:[]};
  panels.set(block.key,panel);frame(block,door?2:1,door?'trim':'frame');
  if(door){
   add(block,'wood',[.86,1.89,.065],[.44,.95,0],panel);
   for(const y of [.39,1.33]){
    add(block,'wood',[.65,.53,.021],[.44,y,.043],panel);add(block,'wood',[.65,.53,.021],[.44,y,-.043],panel);
   }
   for(const z of [-.058,.058]){
    add(block,'metal',[.045,.15,.023],[.76,.95,z],panel);add(block,'metal',[.115,.026,.043],[.714,.98,z*1.42],panel);
   }
   for(const y of [.27,1.57])add(block,'metal',[.032,.1,.033],[.011,y,.042],panel);
  }else{
   for(const x of [.026,.834])add(block,'frame',[.052,.84,.065],[x,.42,0],panel);
   for(const y of [.026,.814])add(block,'frame',[.756,.052,.065],[.43,y,0],panel);
   add(block,'frame',[.025,.736,.05],[.43,.42,0],panel);add(block,'glass',[.756,.736,.018],[.43,.42,0],panel);
   add(block,'metal',[.035,.12,.028],[.787,.39,.053],panel);
  }
 }
 function buildParts(block,old){
  if(COLORS[block.type])add(block,block.type,[1,1,1],[0,.5,0]);
  else if(block.type==='glass'){
   frame(block,1);add(block,'glass',[.84,.9,.025],[0,.5,0]);
  }else if(block.type==='door'||block.type==='window')makePanel(block,old);
  else if(block.type==='lamp'){
   add(block,'frame',[.35,.065,.35],[0,.045,0]);add(block,'metal',[.045,.1,.045],[0,.125,0]);
   add(block,'bulb',[.32,.42,.32],[0,.385,0]);
   for(const x of [-.18,.18])for(const z of [-.18,.18])add(block,'frame',[.025,.48,.025],[x,.39,z]);
   add(block,'frame',[.42,.07,.42],[0,.645,0]);add(block,'metal',[.065,.12,.065],[0,.725,0]);
  }
 }
 function writePart(part){
  const {block,size,at,panel,batch,index}=part;
  position.set(...at);scale.set(...size);quaternion.identity();localMatrix.compose(position,quaternion,scale);
  if(panel){
   hingeMatrix.makeTranslation(panel.pivot.x,panel.pivot.y,panel.pivot.z);rotationMatrix.makeRotationY(panel.angle);hingeMatrix.multiply(rotationMatrix);localMatrix.premultiply(hingeMatrix);
  }
  quaternion.setFromAxisAngle(up,block.rotation*Math.PI/2);position.set(block.x+.5,.16+block.y,block.z+.5);scale.set(1,1,1);matrix.compose(position,quaternion,scale).multiply(localMatrix);
  batch.mesh.setMatrixAt(index,matrix);batch.dirty=true;
 }
 function finishBatch(batch,recompute=false){
  if(!batch.mesh||!batch.dirty)return;batch.mesh.instanceMatrix.needsUpdate=true;
  // Door/window vertices can swing outside their closed-cell bounds.
  if(recompute){batch.mesh.computeBoundingBox();batch.mesh.computeBoundingSphere();}
  batch.dirty=false;
 }
 function setBlocks(input){
  if(disposed)return;
  const previous=new Map(panels);panels.clear();for(const batch of batches.values())batch.parts.length=0;
  const blocks=[],used=new Set();
  for(const source of Array.isArray(input)?input:[]){
   if(!source||!TYPES.has(source.type)||![source.x,source.y,source.z].every(Number.isFinite))continue;
   const x=Math.round(source.x),y=Math.round(source.y),z=Math.round(source.z),key=String(source.id??source.key??`${x},${y},${z}`);
   if(used.has(key))continue;used.add(key);
   const block={id:source.id??source.key??key,key,sourceKey:source.key,x,y,z,type:source.type,rotation:((Math.round(finite(source.rotation))%4)+4)%4,open:!!source.open};
   blocks.push(block);buildParts(block,previous.get(key));
  }
  for(const batch of batches.values()){
   const count=batch.parts.length;
   if(count>batch.capacity){
    if(batch.mesh){group.remove(batch.mesh);batch.mesh.dispose();}
    batch.capacity=Math.max(8,2**Math.ceil(Math.log2(count)));batch.mesh=new T.InstancedMesh(batch.geometry,materials[batch.name],batch.capacity);
    batch.mesh.name=`Build instances · ${batch.key}`;batch.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);batch.mesh.castShadow=batch.name!=='glass'&&batch.name!=='bulb';batch.mesh.receiveShadow=false;
    batch.mesh.renderOrder=batch.name==='glass'?2:0;group.add(batch.mesh);
   }
   if(!batch.mesh)continue;batch.mesh.count=count;batch.mesh.visible=count>0;batch.mesh.userData.instanceToBlock=batch.parts.map(part=>part.block);
   // Shared materials may include both static frames and animated leaf parts.
   batch.mesh.frustumCulled=!batch.parts.some(part=>part.panel);
   for(const part of batch.parts){
    writePart(part);const b=part.block,hash=Math.abs((Math.imul(b.x,73856093)^Math.imul(b.z,19349663)^Math.imul(b.y,83492791))%101);
    const shade=COLORS[b.type] ? .03*(hash/100-.5) : 0;instanceColor.setRGB(1+shade,1+shade,1+shade);batch.mesh.setColorAt(part.index,instanceColor);
   }
   if(batch.mesh.instanceColor)batch.mesh.instanceColor.needsUpdate=true;finishBatch(batch,true);
  }
  const lamps=blocks.filter(b=>b.type==='lamp').slice(0,8);
  for(let i=0;i<lamps.length;i++){
   if(!lampLights[i]){const light=new T.PointLight('#ffdb9c',1.6,5,2);light.name='Construction lamp · no shadow';lampLights.push(light);group.add(light);}
   const b=lamps[i];lampLights[i].visible=true;lampLights[i].position.set(b.x+.5,b.y+.16+.4,b.z+.5);
  }
  for(let i=lamps.length;i<lampLights.length;i++)lampLights[i].visible=false;
  group.userData.blockCount=blocks.length;group.userData.batchCount=[...batches.values()].filter(b=>b.parts.length).length;
 }
 function setPreview(value){
  if(disposed)return;preview.visible=!!value;if(!value)return;
  if(![value.x,value.y,value.z].every(Number.isFinite)){preview.visible=false;return;}
  const height=value.height??(value.type==='door'?2:1);preview.position.set(value.x+.5,.16+value.y+height/2,value.z+.5);preview.rotation.y=finite(value.rotation)*Math.PI/2;preview.scale.set(1.008,height+.008,1.008);
  previewMaterial.color.set(value.valid===false?'#de6857':'#75cfaa');previewEdgeMaterial.color.set(value.valid===false?'#ffb3a1':'#b7ffe0');
  preview.userData.buildPreview=true;preview.userData.valid=value.valid!==false;
 }
 function update(dt){
  if(disposed)return;const alpha=1-Math.exp(-clamp(finite(dt),0,.1)*13);if(!alpha)return;
  for(const panel of panels.values()){
   if(Math.abs(panel.angle-panel.target)<.0001)continue;
   panel.angle+=(panel.target-panel.angle)*alpha;if(Math.abs(panel.angle-panel.target)<.0001)panel.angle=panel.target;
   for(const part of panel.parts)writePart(part);
  }
  for(const batch of batches.values())finishBatch(batch);
 }
 function getPanelState(id){
  const panel=panels.get(String(id))||[...panels.values()].find(p=>p.block.sourceKey!==undefined&&String(p.block.sourceKey)===String(id));if(!panel)return null;
  return {amount:Math.max(0,panel.angle/OPEN_ANGLE),angle:panel.angle,rotation:panel.block.rotation,pivot:{...panel.pivot},width:panel.width,height:panel.height};
 }
 function dispose(){
  if(disposed)return;disposed=true;
  for(const batch of batches.values())batch.mesh?.dispose();
  for(const material of Object.values(materials))material.dispose();previewMaterial.dispose();previewEdgeMaterial.dispose();
  for(const texture of textures)texture.dispose();box.dispose();edgeGeometry.dispose();
  for(const light of lampLights)light.dispose?.();panels.clear();batches.clear();group.clear();group.removeFromParent();
 }
 return {group,setBlocks,setPreview,update,getPanelState,dispose};
}
