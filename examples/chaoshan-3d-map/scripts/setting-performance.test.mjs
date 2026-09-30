import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {placeSetting,settingCell} from '../place-setting.mjs';
import {spatialQuery,placeBounds} from '../spatial-query.mjs';
import {addSpatialSurface} from '../spatial-surfaces.mjs';
import {setCrowdView,inCrowdView} from '../scene-view-budget.mjs';
import {localHouse} from '../local-architecture.mjs';
import {URBAN_STYLES,urbanPrototype,urbanFacadeMaterial,streetFacingAngle,urbanStyleAt,addUrbanArchitecture} from '../urban-architecture.mjs';
import {overviewTree} from '../overview-vegetation.mjs';
import {treeGeometry,treeTypes} from '../street-life.mjs';
import {addSpatialInstances} from '../spatial-instances.mjs';
import {exhibitCulling} from '../exhibit-culling.mjs';
import {createStaticVisibility} from '../static-visibility.mjs';
import {createPedestrianOccupancy} from '../pedestrian-occupancy.mjs';
import {batchStatic} from '../static-batch.mjs';
import fs from 'node:fs/promises';
import {prepareRingContains,prepareWaterContains} from '../water-query.mjs';
import {generateRegionalEnvironment} from '../regional-environment.mjs';

function scanRing(x,z,ring){let ok=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])ok=!ok;}return ok;}

test('numeric pedestrian cells match exhaustive spacing through moves and crossing storeys',()=>{
 const occupancy=createPedestrianOccupancy(),walkers=Array.from({length:150},(_,i)=>({pos:{x:i%15*.035-.3,y:i%7===0?.1:0,z:Math.floor(i/15)*.04-.25},stationary:i%9===0}));walkers.forEach(occupancy.add);
 const reference=(p,self)=>walkers.every(w=>w===self||Math.abs(p.y-w.pos.y)>.04||Math.hypot(p.x-w.pos.x,p.z-w.pos.z)>=(w.stationary?.03:.019));
 for(let frame=0;frame<400;frame++){
  const w=walkers[frame%walkers.length];w.pos.x+=Math.sin(frame)*.065;w.pos.z+=Math.cos(frame)*.05;occupancy.add(w);
  for(const p of [{...w.pos},{x:w.pos.x+.019+1e-10,y:w.pos.y,z:w.pos.z},{x:w.pos.x+.03-1e-10,y:w.pos.y,z:w.pos.z},{x:w.pos.x,y:w.pos.y+.041,z:w.pos.z},{x:-.05*(frame%5),y:0,z:.05*(frame%7)}]){
   assert.equal(occupancy.free(p,w),reference(p,w));assert.equal(occupancy.free(p),reference(p));
  }
 }
});

test('static hierarchy retains every visible tile, including boundaries and parent transforms',()=>{
 const scene=new THREE.Scene(),root=new THREE.Group();root.userData.staticSpatialTiles=true;scene.add(root);
 const geometry=new THREE.BoxGeometry(.18,.18,.18),material=new THREE.MeshBasicMaterial(),meshes=[];
 for(let i=0;i<400;i++){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(i%20*.4-4,0,Math.floor(i/20)*.4-4);root.add(mesh);meshes.push(mesh);}
 const other=new THREE.Mesh(geometry,material);scene.add(other);
 const controller=createStaticVisibility(scene,{leafSize:6}),camera=new THREE.OrthographicCamera(-.8,.8,.8,-.8,.1,20),frustum=new THREE.Frustum();
 assert.equal(controller.stats.totalTiles,400);
 for(const x of [0,2,-3])for(const rotate of [0,.5]){
  root.position.set(.3,0,-.2);root.rotation.y=rotate;root.scale.set(1.2,1,.8);
  camera.position.set(x,3,4);camera.lookAt(x,0,0);controller.update(camera);scene.updateMatrixWorld(true);
  frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const visible=new Set();scene.traverseVisible(o=>visible.add(o));let count=0;
  for(const mesh of meshes){
   const matrix=new THREE.Matrix4().multiplyMatrices(root.matrixWorld,mesh.matrix),bounds=geometry.boundingBox.clone().applyMatrix4(matrix);
   if(frustum.intersectsBox(bounds)){assert.ok(visible.has(mesh));assert.deepEqual(mesh.matrixWorld.toArray(),matrix.toArray());count++;}
  }
  assert.ok(count>0);assert.ok(controller.stats.visibleTiles<160);assert.ok(visible.has(other));
 }
 controller.dispose();assert.equal(root.children.length,400);assert.ok(meshes.every(m=>m.parent===root));
});

test('static culling preserves offscreen shadow casters and never changes user layer visibility',()=>{
 const scene=new THREE.Scene(),root=new THREE.Group();root.userData.staticSpatialTiles=true;scene.add(root);
 const geometry=new THREE.BoxGeometry(.15,.15,.15),material=new THREE.MeshBasicMaterial(),meshes=[];
 for(let i=0;i<80;i++){const m=new THREE.Mesh(geometry,material);m.position.x=i*.2-8;m.castShadow=true;root.add(m);meshes.push(m);}
 const controller=createStaticVisibility(scene,{leafSize:2}),camera=new THREE.OrthographicCamera(-.5,.5,.5,-.5,.1,20);camera.position.set(0,2,4);camera.lookAt(0,0,0);
 const sun=new THREE.DirectionalLight();sun.castShadow=true;sun.position.set(5,3,4);sun.target.position.set(5,0,0);Object.assign(sun.shadow.camera,{left:-.7,right:.7,top:.7,bottom:-.7,near:.1,far:20});sun.shadow.camera.updateProjectionMatrix();scene.add(sun);
 controller.update(camera);scene.updateMatrixWorld(true);let visible=new Set();scene.traverseVisible(o=>visible.add(o));assert.equal(visible.has(meshes[65]),false);
 controller.update(camera,[sun]);scene.updateMatrixWorld(true);visible=new Set();scene.traverseVisible(o=>visible.add(o));assert.ok(visible.has(meshes[65]));
 root.visible=false;controller.update(camera,[sun]);assert.equal(root.visible,false);assert.equal(controller.stats.visibleTiles,0);
 root.visible=true;controller.update(camera,[sun]);assert.ok(controller.stats.visibleTiles>0);
});

test('static hierarchy restores detailed LOD after overview without re-creating objects',()=>{
 const scene=new THREE.Scene(),source=new THREE.InstancedMesh(new THREE.BoxGeometry(.05,.1,.05),new THREE.MeshBasicMaterial(),512),dummy=new THREE.Object3D();
 for(let i=0;i<source.count;i++){dummy.position.set(i%32*.15-2.4,0,Math.floor(i/32)*.15-1.2);dummy.updateMatrix();source.setMatrixAt(i,dummy.matrix);}
 source.computeBoundingSphere();addSpatialInstances(scene,source,.2);const controller=createStaticVisibility(scene,{leafSize:4}),lod=scene.children[0],camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
 camera.position.set(0,3,5);camera.lookAt(0,0,0);controller.update(camera);assert.ok(lod.levels[0].object.visible);
 camera.position.set(0,40,60);camera.lookAt(0,0,0);controller.update(camera);assert.equal(lod.levels[0].object.visible,false);assert.ok(controller.stats.visibleTiles>0);assert.ok(lod.levels[1].object.visible);
 camera.position.set(0,3,5);camera.lookAt(0,0,0);controller.update(camera);assert.ok(lod.levels[0].object.visible);assert.ok(controller.stats.visibleTiles>0);assert.equal(lod.levels[1].object.visible,false);
});

test('urban prototypes add distinct silhouettes within the previous road-clearance envelope',()=>{
 const signatures=new Set();
 for(const style of URBAN_STYLES){
  const high=urbanPrototype(style),low=urbanPrototype(style,true);
  assert.equal(high,urbanPrototype(style));assert.ok(high.index.count<=72*3);assert.ok(low.index.count<high.index.count);
  signatures.add(Array.from(high.attributes.position.array).join(','));
  for(const g of [high,low]){
   const {position:p,facade:f,color:c}=g.attributes;assert.equal(p.count,f.count);assert.equal(p.count,c.count);
   const sides=new Set();
   for(let i=0;i<p.count;i++){
    assert.ok([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite));
    assert.ok(Math.hypot(p.getX(i),p.getZ(i))*.078<Math.hypot(.079,.084)/2);
    assert.ok(p.getY(i)>=-1e-7&&p.getY(i)<=1.001);sides.add(f.getZ(i));
   }
   assert.deepEqual([...sides].sort(),[0,1,2,3]);
  }
 }
 assert.equal(signatures.size,5);
});

test('urban door frontage points toward the road on either side of every bearing',()=>{
 for(let angle=0;angle<Math.PI*2;angle+=.07)for(const side of [-1,1]){
  const d={x:Math.sin(angle),z:Math.cos(angle)},facing=streetFacingAngle(d,side);
  assert.ok(Math.sin(facing)*(-d.z*side)+Math.cos(facing)*(d.x*side)>.999999);
 }
});

test('urban facades shade all floors and keep doors off upper floors and side walls',()=>{
 for(const style of URBAN_STYLES){
  const material=urbanFacadeMaterial(style),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('length(instanceMatrix[1].xyz)'));
  assert.ok(shader.fragmentShader.includes('vFacade.y*vStoreys'));
  assert.ok(shader.fragmentShader.includes('front?ground*'));
  assert.ok(shader.fragmentShader.includes('fwidth(value)'));
  assert.equal(shader.uniforms.urbanStyle.value,URBAN_STYLES.indexOf(style));
  assert.equal(material,urbanFacadeMaterial(style));
 }
});

test('urban LOD preserves every original parcel transform and tint without adding houses',()=>{
 const rows=Array.from({length:3000},(_,i)=>({x:(i%60)*.1-3,z:Math.floor(i/60)*.1-2.5,y:0,h:.075+i%5*.025,angle:i*.3,color:'#b5c6c5'})),anchors=[{x:0,z:0}];
 const group=new THREE.Group(),stats=addUrbanArchitecture(group,rows,anchors),matrix=new THREE.Matrix4(),actual=[],expected=rows.map(r=>[Math.fround(r.x),Math.fround(r.z)].join(','));
 assert.equal(stats.total,rows.length);assert.equal(Object.values(stats.counts).reduce((a,b)=>a+b),rows.length);
 assert.ok(Object.values(stats.counts).every(n=>n>0));assert.ok(stats.detailTriangles<rows.length*72);assert.ok(stats.overviewTriangles<stats.detailTriangles);
 group.children.forEach(node=>{
  const meshes=node.isLOD?node.levels[0].object.children:[node];
  for(const mesh of meshes){assert.ok(mesh.instanceColor);for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);actual.push([matrix.elements[12],matrix.elements[14]].join(','));}}
  if(node.isLOD)assert.equal(node.levels[1].object.children.reduce((sum,m)=>sum+m.count,0),meshes.reduce((sum,m)=>sum+m.count,0));
 });
 assert.deepEqual(actual.sort(),expected.sort());
 assert.equal(urbanStyleAt(rows[0],anchors),urbanStyleAt({...rows[0]},anchors));
});

test('water edge index preserves concave rings, holes and exact boundary decisions',()=>{
 const outer=[[-4,-3],[4,-3],[4,3],[1,3],[1,0],[-1,0],[-1,3],[-4,3],[-4,-3]],hole=[[-3,-2],[-2,-2],[-2,-1],[-3,-1],[-3,-2]];
 for(const scale of [1,1000])for(const ring of [outer,hole,outer.slice().reverse()]){
  const vertices=ring.map(([x,z])=>[x*scale,z*scale]),contains=prepareRingContains(vertices);
  for(let x=-5;x<=5;x+=.125)for(let z=-4;z<=4;z+=.125)assert.equal(contains(x*scale,z*scale),scanRing(x*scale,z*scale,vertices));
 }
 const contains=prepareWaterContains([outer,hole]);
 for(let x=-5;x<=5;x+=.125)for(let z=-4;z<=4;z+=.125)assert.equal(contains(x,z),scanRing(x,z,outer)&&!scanRing(x,z,hole));
 assert.equal(prepareWaterContains([])(0,0),false);assert.equal(prepareRingContains([])(0,0),false);
});

test('indexed water matches all actual shoreline vertices and near-edge samples',async()=>{
 const data=JSON.parse(await fs.readFile(new URL('../public/data/chaoshan.json',import.meta.url),'utf8'));
 let samples=0;
 for(const rings of data.water)for(const ring of rings){
  const contains=prepareRingContains(ring);
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length];
   for(const [x,z] of [a,[(a[0]+b[0])/2,(a[1]+b[1])/2],[a[0]+1e-9,a[1]-1e-9],[a[0]-1e-9,a[1]+1e-9]]){
    assert.equal(contains(x,z),scanRing(x,z,ring),`shoreline ${x},${z}`);samples++;
   }
  }
 }
 assert.ok(samples>10000);
});

test('riverbank index keeps the exact reserved-site exclusion and shoreline geometry',()=>{
 const options={data:{terrain:{bounds:[[-10,-10],[10,10]]},roads:[],water:[[[[-9,0],[9,0],[9,-9],[-9,-9],[-9,0]]]]},places:[{kind:'landmark',x:0,z:0}],heightAt:()=>0,waterAt:(x,z)=>z<0?0:null,mobile:true};
 const open=generateRegionalEnvironment(options);
 assert.ok(open.banks.length>100);
 const cases=[[],[{x:0,z:0,span:.5}],Array.from({length:100},(_,i)=>({x:(i%20)-10,z:Math.floor(i/20)-2,span:.2+i%5*.1})),[{x:-3,z:.2,span:2},{x:4,z:0,span:0},{x:6,z:0}], [{x:0,z:0,span:Infinity}]];
 for(const reservedSites of cases){
  const expected=[];
  for(let i=0;i<open.banks.length;i+=18){
   const vertices=open.banks.slice(i,i+18);
   if(![3,15].some(k=>reservedSites.some(p=>Math.hypot(vertices[k]-p.x,vertices[k+2]-p.z)<p.span+.02)))expected.push(...vertices);
  }
  const actual=generateRegionalEnvironment({...options,reservedSites});
  assert.deepEqual(actual.banks,expected);assert.deepEqual(actual.shallows,open.shallows);
 }
});

test('place settings distinguish coastal, mountain, heritage and airport compositions',()=>{
 const cases=[['huilai-lighthouse','', 'headland'],['raoping-haishan','','fishing'],['a','airport','transport'],['b','tea','tea'],['c','tulou','courtyard'],['d','forest','forest']];
 for(const [id,model,family] of cases)assert.equal(placeSetting({id,model}).family,family);
 const a=placeSetting({id:'raoping-haishan'}),b=placeSetting({id:'raoping-xunzhou'});
 assert.notEqual(a.angle,b.angle);assert.notEqual(a.phase,b.phase);
 assert.deepEqual(settingCell(a,.21,-.16,.06),settingCell(placeSetting({id:a.key}),.21,-.16,.06));
});

test('spatial candidates include all intersecting bounds, including negative cells and long routes',()=>{
 const items=Array.from({length:120},(_,i)=>({x:(i%12)-6,z:Math.floor(i/12)-5,w:.1+i%4}));
 const bounds=p=>[p.x-p.w,p.x+p.w,p.z-.24,p.z+.24],query=spatialQuery(items,bounds,.7);
 for(let x=-7;x<8;x+=.37)for(let z=-6;z<6;z+=.73){
  const r=.32,got=query(x,z,r);assert.equal(got.length,new Set(got).size);
  for(const p of items){const [a,b,c,d]=bounds(p);if(b>=x-r&&a<=x+r&&d>=z-r&&c<=z+r)assert.ok(got.includes(p));}
 }
 const b=placeBounds({x:2,z:3,footprint:[2,1],span:1});assert.ok(b[0]<0&&b[1]>4);
});

test('static paving tiles preserve every triangle and vertex color without changing transforms',()=>{
 const geo=new THREE.PlaneGeometry(20,20,60,60);geo.rotateX(-Math.PI/2);
 geo.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:geo.attributes.position.count*3},(_,i)=>(i%7)/7),3));
 const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true}));mesh.position.set(3,2,1);mesh.scale.setScalar(2);mesh.receiveShadow=true;
 const root=new THREE.Group(),lod=addSpatialSurface(root,mesh,3),tiles=lod.levels[0].object.children;
 assert.ok(tiles.length>9);assert.deepEqual(lod.position.toArray(),[3,2,1]);assert.equal(lod.scale.x,2);
 assert.equal(tiles.reduce((n,t)=>n+t.geometry.attributes.position.count,0),geo.index.count);
 assert.ok(tiles.every(t=>t.receiveShadow&&t.geometry.attributes.color.count===t.geometry.attributes.position.count));
 const expected=[];for(let i=0;i<geo.index.count;i++){const j=geo.index.getX(i);expected.push([geo.attributes.position.getX(j),geo.attributes.position.getY(j),geo.attributes.position.getZ(j),geo.attributes.color.getX(j)].join(','));}
 const actual=[];for(const t of tiles){const p=t.geometry.attributes.position,c=t.geometry.attributes.color;for(let j=0;j<p.count;j++)actual.push([p.getX(j),p.getY(j),p.getZ(j),c.getX(j)].join(','));}
 assert.deepEqual(actual.sort(),expected.sort());
});

test('crowd visibility follows camera moves and has an uncropped default',()=>{
 const camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.set(0,4,8);camera.lookAt(0,0,0);
 try{setCrowdView(camera);assert.ok(inCrowdView(new THREE.Vector3(0,0,0)));assert.equal(inCrowdView(new THREE.Vector3(100,0,0)),false);
 camera.position.x=100;camera.lookAt(100,0,0);setCrowdView(camera);assert.ok(inCrowdView(new THREE.Vector3(100,0,0)));assert.equal(inCrowdView(new THREE.Vector3(0,0,0)),false);
 }finally{setCrowdView(null);}assert.ok(inCrowdView(new THREE.Vector3(10000,0,0)));
});

test('local housing uses different geometry for fishing villages and arcaded streets',()=>{
 const fishing=new THREE.Group(),arcade=new THREE.Group();fishing.userData.setting=placeSetting({id:'raoping-haishan'});arcade.userData.setting=placeSetting({id:'small-park'});
 localHouse(fishing,0,0);localHouse(arcade,0,0);
 assert.notEqual(fishing.children.length,arcade.children.length);
 for(const g of [fishing,arcade])g.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));});
});

test('overview vegetation keeps species colors with lower geometry cost',()=>{
 for(const type of treeTypes){const low=overviewTree(type),high=treeGeometry(type);
  assert.ok(low.attributes.position.count<high.attributes.position.count,type);
  assert.equal(low.attributes.color.count,low.attributes.position.count);
  assert.equal(overviewTree(type),low);assert.ok(low.boundingSphere.radius>0);
 }
});

test('vegetation LOD preserves full population and restores original close-up geometry',()=>{
 const high=treeGeometry('palm'),low=overviewTree('palm'),source=new THREE.InstancedMesh(high,new THREE.MeshStandardMaterial({vertexColors:true}),300),root=new THREE.Group(),matrix=new THREE.Matrix4();
 for(let i=0;i<300;i++)source.setMatrixAt(i,matrix.makeTranslation((i%30)*.2,0,Math.floor(i/30)*.2));
 const tiles=addSpatialInstances(root,source,2,low),lod=root.children[0];
 assert.equal(tiles.reduce((n,t)=>n+t.count,0),300);assert.equal(source.count,300);assert.equal(source.geometry,low);assert.ok(tiles.every(t=>t.geometry===high));
 const camera=new THREE.PerspectiveCamera(45,1,.1,1000);camera.position.set(0,0,100);camera.updateMatrixWorld();lod.update(camera);assert.equal(lod.levels[1].object.visible,true);
 camera.position.set(0,0,5);camera.updateMatrixWorld();lod.update(camera);assert.equal(lod.levels[0].object.visible,true);assert.equal(lod.levels[1].object.visible,false);
});

test('offscreen exhibit gates restore current poses and retain parent layer visibility',()=>{
 const scene=new THREE.Scene(),layer=new THREE.Group(),root=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(layer);layer.add(root);root.add(body);root.position.x=100;
 const culling=exhibitCulling([{group:root}]),gate=root.parent,camera=new THREE.PerspectiveCamera(45,1,.1,200);camera.position.z=8;camera.lookAt(0,0,0);
 culling.update(camera);assert.equal(gate.visible,false);const before=body.matrixWorld.elements[12];body.position.x=.2;scene.updateMatrixWorld();assert.equal(body.matrixWorld.elements[12],before);
 camera.position.x=100;camera.lookAt(100,0,0);culling.update(camera);scene.updateMatrixWorld();assert.equal(gate.visible,true);assert.ok(Math.abs(body.matrixWorld.elements[12]-100.2)<1e-8);
 layer.visible=false;culling.update(camera);assert.equal(layer.visible,false);
});

test('static batches prune emptied containers but keep mapped sign branches',()=>{
 const root=new THREE.Group(),empty=new THREE.Group(),sign=new THREE.Group();root.add(empty,sign);empty.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));sign.add(new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial({map:new THREE.Texture()})));
 batchStatic(root);assert.equal(empty.parent,null);assert.equal(sign.parent,root);assert.ok(root.children.find(o=>o.isMesh).matrixAutoUpdate===false);
});
