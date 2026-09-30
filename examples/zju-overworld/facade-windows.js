/** Real exterior wall apertures and operable double casements.
 * No imports/DOM/renderer/physics. Inject Three.js. All feature coordinates are
 * the existing campus x/z metres; preserve the original roof and footprint.
 * Build lazily for nearby buildings and hide the OLD opaque wallGroup while
 * this group's visible. Transparent glass cannot reveal holes in an old wall.
 */
const EPS=1e-6,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const point=p=>Array.isArray(p)?{x:p[0],z:p[1]}:{x:p.x,z:p.z};
function ringContains(ring,x,z){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=point(ring[i]),b=point(ring[j]);if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
function featureContains(f,x,z){return ringContains(f.p,x,z)&&!(f.h||[]).some(r=>ringContains(r,x,z));}

class BoxBatch {
 constructor(T,unit,colored=false){this.T=T;this.unit=unit;this.colored=colored;this.position=[];this.normal=[];this.color=[];this.count=0;}
 add(matrix,w,h,d,x,y,z,color=0xffffff){
  if(w<EPS||h<EPS||d<EPS)return;
  const T=this.T,m=matrix.clone().multiply(new T.Matrix4().makeTranslation(x,y,z)).multiply(new T.Matrix4().makeScale(w,h,d)),n=new T.Matrix3().getNormalMatrix(m),p=this.unit.attributes.position,a=this.unit.attributes.normal,c=new T.Color(color),v=new T.Vector3(),nv=new T.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m);nv.fromBufferAttribute(a,i).applyMatrix3(n).normalize();this.position.push(v.x,v.y,v.z);this.normal.push(nv.x,nv.y,nv.z);if(this.colored)this.color.push(c.r,c.g,c.b);}
  this.count++;
 }
 geometry(){const T=this.T,g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.position,3));g.setAttribute('normal',new T.Float32BufferAttribute(this.normal,3));if(this.colored)g.setAttribute('color',new T.Float32BufferAttribute(this.color,3));g.computeBoundingBox();g.computeBoundingSphere();return g;}
}

/** Complement of rectangular holes, extruded inward from z=0. Every window
 * opening is actually absent from geometry, including the wall's rear face.
 * cuts are {left,right,bottom,top}; coordinates are metres along the wall.
 */
export function wallRectangles(length,height,cuts=[]){
 const holes=cuts.map(c=>({left:clamp(c.left,0,length),right:clamp(c.right,0,length),bottom:clamp(c.bottom,0,height),top:clamp(c.top,0,height)})).filter(c=>c.right-c.left>EPS&&c.top-c.bottom>EPS);
 const levels=[...new Set([0,height,...holes.flatMap(c=>[c.bottom,c.top])])].sort((a,b)=>a-b),result=[];
 for(let row=1;row<levels.length;row++){
  const bottom=levels[row-1],top=levels[row],y=(bottom+top)/2,intervals=holes.filter(c=>y>c.bottom-EPS&&y<c.top+EPS).map(c=>[c.left,c.right]).sort((a,b)=>a[0]-b[0]);
  let cursor=0;for(const [left,right] of intervals){if(left>cursor+EPS)result.push({left:cursor,right:left,bottom,top});cursor=Math.max(cursor,right);}if(cursor<length-EPS)result.push({left:cursor,right:length,bottom,top});
 }
 return result;
}

/**
 * feature: {p:[x,z][],h:[ring][],cx,cz,height,category,entrance,glazed}.
 * contains(feature,x,z) is optional; used to orient walls and fit room recesses.
 * The old facade texture has 4 windows per 15 m / one row per 3.5 m. Defaults
 * retain that density and its .82 m sill, removing all painted near windows.
 */
export function createBuildingFacade(T,{feature,contains,baseY=.15,floorHeight=3.5,windowPitch=3.75,windowWidth=2.46,windowHeight=1.832,sill=.82,wallThickness=.22,openingAngle=98*Math.PI/180}={}){
 if(!T?.Group||!feature?.p?.length)throw new TypeError('createBuildingFacade needs Three.js and a campus building feature.');
 const height=Number(feature.height);if(!(height>0&&Number.isFinite(height)))throw new RangeError('Building height must be positive.');
 for(const [name,n] of Object.entries({baseY,floorHeight,windowPitch,windowWidth,windowHeight,sill,wallThickness,openingAngle}))if(!Number.isFinite(n))throw new TypeError(`${name} must be finite`);
 if(floorHeight<2||windowPitch<windowWidth+.2||windowWidth<1.2||windowHeight<1||wallThickness<=0)throw new RangeError('Facade dimensions do not leave usable walls and openings.');
 const inside=(x,z)=>contains?contains(feature,x,z):featureContains(feature,x,z),points=feature.p.map(point),origin={x:Number.isFinite(feature.cx)?feature.cx:points.reduce((s,p)=>s+p.x,0)/points.length,z:Number.isFinite(feature.cz)?feature.cz:points.reduce((s,p)=>s+p.z,0)/points.length};
 const group=new T.Group();group.name=`Operable facade · ${feature.name||feature.id||'building'}`;group.position.set(origin.x,baseY,origin.z);
 const controlGroup=new T.Group();controlGroup.name='Window hinge transforms (batched rendering)';group.add(controlGroup);
 const sourceUnit=new T.BoxGeometry(1,1,1),unit=sourceUnit.toNonIndexed(),ownedGeometries=[unit],ownedMaterials=[];sourceUnit.dispose();
 const walls=new BoxBatch(T,unit),rooms=new BoxBatch(T,unit,true),furniture=new BoxBatch(T,unit,true),segments=[],windows=[],frameMatrices=[],moving=new Set();
 const colors={wall:feature.category==='dorm'?0xcab5a0:feature.category==='landmark'?0xa77c6b:0xd9d9cf,frame:0xd3d8cd};
 const material=options=>{const m=new T.MeshStandardMaterial(options);ownedMaterials.push(m);return m;};
 const identity=new T.Matrix4(),frame=.085;
 function transform(seg,x,y,z){return {x:seg.a.x+seg.tangent.x*x+seg.normal.x*z,y:baseY+y,z:seg.a.z+seg.tangent.z*x+seg.normal.z*z};}
 function addFrame(base,w,h,d,x,y,z){frameMatrices.push(base.clone().multiply(new T.Matrix4().makeTranslation(x,y,z)).multiply(new T.Matrix4().makeScale(w,h,d)));}
 const door=feature.entrance;
 function reservedCuts(seg){
  if(!door)return [];
  const project=(x,z)=>({along:(x-seg.a.x)*seg.tangent.x+(z-seg.a.z)*seg.tangent.z,across:(x-seg.a.x)*seg.normal.x+(z-seg.a.z)*seg.normal.z});
  const d=project(door.x,door.z);if(Math.abs(d.across)>.45||d.along<-.1||d.along>seg.length+.1)return [];
  const cuts=[{left:d.along-door.width/2,right:d.along+door.width/2,bottom:0,top:Math.min(height,2.85),kind:'entrance'}];
  if(feature.glazed){const c=Math.cos(door.angle),s=Math.sin(door.angle);for(const side of [-1,1]){const q=project(door.x+c*side*3.5,door.z-s*side*3.5);cuts.push({left:q.along-1.7,right:q.along+1.7,bottom:.52,top:Math.min(height,2.62),kind:'foyer'});}}
  return cuts;
 }
 function roomFor(seg,x,floor,width,index){
  const roomWidth=Math.min(windowPitch-.24,width+.62),floorY=floor*floorHeight,roomHeight=Math.min(floorHeight-.12,height-floorY);
  let depth=0;for(const candidate of [2.35,1.65,1,.55,.30]){let fits=true;for(const sx of [-roomWidth/2,roomWidth/2])for(const z of [-wallThickness-.04,-candidate]){const p=transform(seg,x+sx,0,z);if(!inside(p.x,p.z))fits=false;}if(fits){depth=candidate;break;}}
  if(!depth)return {depth:0};
  const roomBase=seg.matrix.clone().multiply(new T.Matrix4().makeTranslation(x,floorY,0)),rear=-depth,front=-wallThickness-.018,len=front-rear;
  if(len<=.015)return {depth:0};
  rooms.add(roomBase,roomWidth,.065,len,0,.0325,(front+rear)/2,index%2?0xb8bcad:0xc5bba5);
  rooms.add(roomBase,roomWidth,.065,len,0,roomHeight-.0325,(front+rear)/2,0xe2e0cf);
  rooms.add(roomBase,roomWidth,roomHeight,.055,0,roomHeight/2,rear+.0275,index%3?0xdad9c7:0xcbd8cc);
  for(const sign of [-1,1])rooms.add(roomBase,.05,roomHeight,len,sign*(roomWidth/2-.025),roomHeight/2,(front+rear)/2,0xdedccb);
  if(depth>1.1){
   const tableZ=-Math.min(depth*.56,1.25),tableW=Math.min(1.5,roomWidth*.63);
   furniture.add(roomBase,tableW,.095,.57,0,.80,tableZ,0xb99a73);
   for(const sign of [-1,1])furniture.add(roomBase,.065,.76,.48,sign*(tableW/2-.09),.38,tableZ,0x6c7f70);
   if(depth>2.1){furniture.add(roomBase,.47,.075,.48,.28,.46,tableZ-.58,0x829383);furniture.add(roomBase,.47,.49,.07,.28,.72,tableZ-.80,0x829383);}
   furniture.add(roomBase,.36,.04,.26,-.16,.87,tableZ+.04,index%2?0x839d9c:0xc59a6a);
   furniture.add(roomBase,.18,.19,.18,tableW*.33,.93,tableZ-.04,0xc5b796);
   furniture.add(roomBase,.27,.28,.23,tableW*.33,1.15,tableZ-.04,0x779675);
  }
  return {depth,width:roomWidth,height:roomHeight};
 }
 const rings=[feature.p,...(feature.h||[])];
 for(let ringIndex=0;ringIndex<rings.length;ringIndex++){
  const ring=rings[ringIndex].map(point);if(ring.length>1&&Math.hypot(ring[0].x-ring.at(-1).x,ring[0].z-ring.at(-1).z)<EPS)ring.pop();
  for(let edge=0;edge<ring.length;edge++){
   let a=ring[edge],b=ring[(edge+1)%ring.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.01)continue;
   let tx=(b.x-a.x)/length,tz=(b.z-a.z)/length,nx=-tz,nz=tx;
   if(inside((a.x+b.x)/2+nx*.08,(a.z+b.z)/2+nz*.08)){[a,b]=[b,a];tx=-tx;tz=-tz;nx=-nx;nz=-nz;}
   const matrix=new T.Matrix4().makeBasis(new T.Vector3(tx,0,tz),new T.Vector3(0,1,0),new T.Vector3(nx,0,nz));matrix.setPosition(a.x-origin.x,0,a.z-origin.z);
   const seg={index:segments.length,ringIndex,edge,a,b,length,tangent:{x:tx,z:tz},normal:{x:nx,z:nz},matrix,angle:Math.atan2(nx,nz),cuts:[]};
   seg.reserved=reservedCuts(seg);seg.cuts.push(...seg.reserved);
   for(let floor=0;floor*floorHeight+sill+1.25<height;floor++){
    const bottom=floor*floorHeight+sill,h=Math.min(windowHeight,height-bottom-.18);if(h<1.25)continue;
    for(let x=windowPitch/2;x+windowWidth/2<length-.18;x+=windowPitch){
     if(x-windowWidth/2<.18)continue;
     const cut={left:x-windowWidth/2,right:x+windowWidth/2,bottom,top:bottom+h,kind:'window'};
     if(seg.reserved.some(r=>cut.left<r.right+.08&&cut.right>r.left-.08&&cut.bottom<r.top+.08&&cut.top>r.bottom-.08))continue;
     seg.cuts.push(cut);
     const index=windows.length,center=transform(seg,x,bottom+h/2,0),floorY=baseY+floor*floorHeight,base=matrix.clone().multiply(new T.Matrix4().makeTranslation(x,bottom+h/2,0)),innerW=windowWidth-2*frame,innerH=h-2*frame,leafW=innerW/2;
     const windowGroup=new T.Group();windowGroup.name=`Facade window ${index}`;windowGroup.position.set(center.x-origin.x,center.y-baseY,center.z-origin.z);windowGroup.rotation.y=seg.angle;controlGroup.add(windowGroup);
     const hinges=[-1,1].map(sign=>{const hinge=new T.Group();hinge.name=sign<0?'Left outward hinge':'Right outward hinge';hinge.position.set(sign*innerW/2,0,.027);windowGroup.add(hinge);return hinge;});
     const insidePoint=transform(seg,x,floor*floorHeight,-.88),outsidePoint=transform(seg,x,floor*floorHeight,1.0),room=roomFor(seg,x,floor,windowWidth,index);
     const record={id:`${feature.id||'building'}:facade:${ringIndex}:${edge}:${floor}:${Math.round(x*1000)}`,index,feature,segmentIndex:seg.index,group:windowGroup,hinges,
      x:center.x,y:floorY,z:center.z,center,floor,floorY,sill,width:windowWidth,height:h,innerWidth:innerW,innerHeight:innerH,normal:{...seg.normal},tangent:{...seg.tangent},insidePoint,outsidePoint,room,
      opening:{center,minY:baseY+bottom+frame,maxY:baseY+bottom+h-frame,width:innerW,height:innerH},
      _base:base,_leafW:leafW,_innerH:innerH,_amount:0,_target:0,_leafMatrices:[new T.Matrix4(),new T.Matrix4()],_leafInverses:[new T.Matrix4(),new T.Matrix4()],
      get amount(){return this._amount;},get target(){return this._target;},get open(){return this._target===1;},get isPassable(){return this._amount>=.92;},
      setOpen(value){if(!disposed){this._target=value?1:0;moving.add(this);}return this;},
      setAmount(value){if(!disposed){this._amount=clamp(Number.isFinite(value)?value:0,0,1);this._target=this._amount>=.5?1:0;writeWindow(this);flushInstances();}return this;},
      blocks(p,radius=.28){return windowBlocks(this,p,radius);}
     };
     windowGroup.userData.facadeWindow=record;for(const hinge of hinges)hinge.userData.facadeWindow=record;
     for(const sign of [-1,1]){addFrame(base,frame,h,.20,sign*(windowWidth/2-frame/2),0,-.035);addFrame(base,innerW,frame,.20,0,sign*(h/2-frame/2),-.035);}
     addFrame(base,windowWidth+.10,.07,.34,0,-h/2+.013,.015);
     windows.push(record);
    }
   }
   seg.rectangles=wallRectangles(length,height,seg.cuts);
   for(const r of seg.rectangles)walls.add(matrix,r.right-r.left,r.top-r.bottom,wallThickness,(r.left+r.right)/2,(r.bottom+r.top)/2,-wallThickness/2);
   segments.push(seg);
  }
 }
 function addMerged(name,batch,mat){const geometry=batch.geometry();ownedGeometries.push(geometry);const mesh=new T.Mesh(geometry,mat);mesh.name=name;mesh.receiveShadow=false;mesh.castShadow=true;group.add(mesh);return mesh;}
 const wallMesh=addMerged('Opaque wall skin with real apertures',walls,material({color:colors.wall,roughness:.88}));wallMesh.castShadow=true;wallMesh.userData.feature=feature;
 const roomMesh=addMerged('Visible recessed rooms behind windows',rooms,material({vertexColors:true,roughness:.91,side:T.DoubleSide,emissive:0xffffff,emissiveIntensity:.075}));
 const furnitureMesh=addMerged('Room furniture behind transparent glass',furniture,material({vertexColors:true,roughness:.84}));
 const frameMat=material({color:colors.frame,roughness:.61,metalness:.12}),sashBatch=new BoxBatch(T,unit);
 for(const x of [-.48,.48])sashBatch.add(identity,.04,1,.056,x,0,0);
 for(const y of [-.48,0,.48])sashBatch.add(identity,.92,.04,.056,0,y,0);
 const sashGeometry=sashBatch.geometry();ownedGeometries.push(sashGeometry);
 const paneGeometry=new T.PlaneGeometry(.916,.916),handleGeometry=new T.BoxGeometry(.032,.18,.04);ownedGeometries.push(paneGeometry,handleGeometry);
 const frameMesh=new T.InstancedMesh(unit,frameMat,frameMatrices.length);frameMesh.name='Batched exterior window jambs and sills';frameMesh.castShadow=true;frameMatrices.forEach((m,i)=>frameMesh.setMatrixAt(i,m));group.add(frameMesh);
 const sashMesh=new T.InstancedMesh(sashGeometry,frameMat,windows.length*2);sashMesh.name='Operable casement frame instances';
 const glassMesh=new T.InstancedMesh(paneGeometry,material({color:0xc4e2df,transparent:true,opacity:.115,roughness:.12,metalness:.035,depthWrite:false,side:T.DoubleSide,forceSinglePass:true}),windows.length*2);glassMesh.name='True transparent moving glass instances';glassMesh.renderOrder=2;
 const handleMesh=new T.InstancedMesh(handleGeometry,material({color:0xb19a66,roughness:.45,metalness:.35}),windows.length*2);handleMesh.name='Moving casement handles';
 for(const mesh of [sashMesh,glassMesh,handleMesh]){mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.userData.facadeWindows=windows;mesh.userData.facadeWindowStride=2;mesh.userData.feature=feature;mesh.frustumCulled=false;mesh.receiveShadow=false;mesh.castShadow=mesh!==glassMesh;group.add(mesh);}
 const pickables=[glassMesh,sashMesh,handleMesh];let disposed=false;
 function writeWindow(w){
  for(let leaf=0;leaf<2;leaf++){
   const sign=leaf===0?-1:1,angle=sign*w._amount*openingAngle;
   w.hinges[leaf].rotation.y=angle;
   const pose=w._base.clone().multiply(new T.Matrix4().makeTranslation(sign*w.innerWidth/2,0,.027)).multiply(new T.Matrix4().makeRotationY(angle)).multiply(new T.Matrix4().makeTranslation(-sign*w._leafW/2,0,0));
   w._leafMatrices[leaf].copy(pose);w._leafInverses[leaf].copy(pose).invert();
   const scaled=pose.clone().multiply(new T.Matrix4().makeScale(w._leafW,w._innerH,1)),instance=w.index*2+leaf;
   sashMesh.setMatrixAt(instance,scaled);glassMesh.setMatrixAt(instance,scaled);
   handleMesh.setMatrixAt(instance,pose.clone().multiply(new T.Matrix4().makeTranslation(-sign*w._leafW*.37,0,.065)));
  }
  w.group.userData.windowAmount=w._amount;
 }
 function flushInstances(){for(const mesh of [sashMesh,glassMesh,handleMesh])mesh.instanceMatrix.needsUpdate=true;}
 function windowBlocks(w,p,r=.28){
  if(disposed||![p?.x,p?.y,p?.z].every(Number.isFinite))return false;r=Math.max(0,r);
  const dx=p.x-w.center.x,dz=p.z-w.center.z,localX=dx*w.tangent.x+dz*w.tangent.z,localY=p.y-w.center.y,localZ=dx*w.normal.x+dz*w.normal.z;
  if(Math.abs(localZ+.035)<.12+r&&Math.abs(localX)<w.width/2+r&&Math.abs(localY)<w.height/2+r&&
    (Math.abs(localX)>w.innerWidth/2-r||Math.abs(localY)>w.innerHeight/2-r))return true;
  const worldLocal=new T.Vector3(p.x-origin.x,p.y-baseY,p.z-origin.z);
  for(const inv of w._leafInverses){const q=worldLocal.clone().applyMatrix4(inv);if(Math.abs(q.x)<w._leafW/2+r&&Math.abs(q.y)<w._innerH/2+r&&Math.abs(q.z)<.055+r)return true;}
  return false;
 }
 for(const w of windows)writeWindow(w);flushInstances();frameMesh.instanceMatrix.needsUpdate=true;
 // Instance broad-phase bounds must include all future 98-degree leaf positions.
 const localBox=wallMesh.geometry.boundingBox.clone().expandByScalar(windowWidth+1);
 for(const mesh of [sashMesh,glassMesh,handleMesh]){mesh.boundingBox=localBox.clone();mesh.boundingSphere=localBox.getBoundingSphere(new T.Sphere());}
 frameMesh.computeBoundingBox();frameMesh.computeBoundingSphere();
 const api={group,windows,segments,pickables,wallMesh,frameMesh,sashMesh,glassMesh,roomMesh,furnitureMesh,handleMesh,feature,
  windowForHit(hit){return hit?.object?.userData?.facadeWindows===windows&&Number.isInteger(hit.instanceId)?windows[Math.floor(hit.instanceId/2)]||null:null;},
  update(dt=0){if(disposed||!moving.size)return api;const delta=clamp(Number.isFinite(dt)?dt:0,0,.2);for(const w of moving){w._amount+=(w._target-w._amount)*(1-Math.exp(-delta*6));if(Math.abs(w._amount-w._target)<.0005){w._amount=w._target;moving.delete(w);}writeWindow(w);}flushInstances();return api;},
  setDetailed(value){furnitureMesh.visible=handleMesh.visible=!!value;return api;},
  get stats(){return {windows:windows.length,segments:segments.length,wallBoxes:walls.count,roomBoxes:rooms.count,furnitureBoxes:furniture.count,drawCalls:5+(handleMesh.visible?1:0)+(furnitureMesh.visible?1:0),moving:moving.size,vertices:ownedGeometries.reduce((s,g)=>s+(g.attributes.position?.count||0),0)};},
  dispose(){if(disposed)return;disposed=true;moving.clear();group.removeFromParent();for(const geometry of ownedGeometries)geometry.dispose();for(const mat of ownedMaterials)mat.dispose();}
 };
 return api;
}
