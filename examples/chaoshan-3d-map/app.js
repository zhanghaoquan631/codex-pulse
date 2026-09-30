import {fitSunShadow} from './solar-lighting.mjs';
import {createAtlasTour} from './atlas-tour.mjs';
import {createSignBudget} from './screen-detail-budget.mjs';
let signBudget;
import {mountDestinationControls} from './destination-controls.mjs';
let atlasTour,destinationControls,tourScope='当前分类';
import {prepareWaterContains} from './water-query.mjs';
import {createStaticVisibility} from './static-visibility.mjs';
let staticVisibility;
import {applyMeadowSurface} from './landscape-planting.mjs';
import {landscapeColor} from './place-setting.mjs';
import {createLivingSky} from './living-sky.mjs';
import {createCommunitySocial} from './community-social.mjs';
import './living-world.css';
let livingSky,communitySocial;
import {exhibitCulling} from './exhibit-culling.mjs';
let exhibitVisibility;
import {partitionLargeSurfaces} from './spatial-surfaces.mjs';
import {setCrowdView} from './scene-view-budget.mjs';
import {terrainPaving} from './terrain-paving.mjs';
import {placeZoom,resumedTimeline} from './atlas-interaction.mjs';
import {jieyangPlaces,positionJieyangPlaces} from './jieyang-places.mjs';
import {buildJieyangSights} from './jieyang-sights.mjs';
let jieyangSights;
import {puningPlaces,positionPuningPlaces} from './puning-places.mjs';
import {buildPuningSights} from './puning-sights.mjs';
let puningSights;
import {chaonanPlaces,positionChaonanPlaces} from './chaonan-places.mjs';
import {buildChaonanSights} from './chaonan-sights.mjs';
let chaonanSights;
import {chaoyangPlaces,positionChaoyangPlaces} from './chaoyang-places.mjs';
import {buildChaoyangSights} from './chaoyang-sights.mjs';
let chaoyangSights;
import {chenghaiPlaces,positionChenghaiPlaces} from './chenghai-places.mjs';
import {buildChenghaiSights} from './chenghai-sights.mjs';
let chenghaiSights;
import {chaoanPlaces,positionChaoanPlaces} from './chaoan-places.mjs';
import {buildChaoanSights} from './chaoan-sights.mjs';
let chaoanSights;
import {raopingPlaces,positionRaopingPlaces} from './raoping-places.mjs';
import {buildRaopingSights} from './raoping-sights.mjs';
let raopingSights;
import {huilaiPlaces} from './huilai-places.mjs';
import {buildHuilaiSights} from './huilai-sights.mjs';
let huilaiSights;
import {jiexiPlaces} from './jiexi-places.mjs';
import {buildJiexiSights} from './jiexi-sights.mjs';
let jiexiSights;
import {outsideSmallParkRoads} from './small-park-layout.mjs';
import {shantouPlaces,positionShantouPlaces} from './shantou-places.mjs';
import {buildShantouSights} from './shantou-sights.mjs';
import {insidePlace} from './place-footprints.mjs';
let shantouSights;
import {nanaoPlaces,positionNanaoPlaces,buildNanaoSights} from './nanao-sights.mjs';
let nanaoSights;
// Local adaptation of Seoul 3D Atlas v1.3 renderer. Reference and data attribution: /REFERENCE-LICENSES.txt
import {buildCommunityActivities} from './community-activities.mjs';
import {buildTourContext} from './tour-context.mjs';
let communityActivities,tourContext;
import {buildCuisine} from './local-cuisine.mjs';
let cuisine;
import {buildRegionalEnvironment} from './regional-environment.mjs';
import {buildTransport} from './transport.mjs';
let regionalEnvironment,transport;
import {buildUrbanEnvironment} from './urban-environment.mjs';
let urbanEnvironment;
import {coreCities,labelPriority,labelPosition} from './label-layout.mjs';
import {buildTraffic,buildVegetation,buildLandmarkLife,mountainPlaces,buildRockfields} from './street-life.mjs';
import {buildRegionalLife} from './regional-life.mjs';
import {extendLandmarkLife} from './coastal-life.mjs';
let traffic,woodland,streetLife,rockfields,regionalLife;let lifeSeconds=0;
import {landmarkPlaces,buildLocalLandmarks} from './landmarks.mjs';
import {attachFeatureUI} from './feature-ui.mjs';
import './features.css';
let localLandmarks,featureUI;
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import regions from './regions.json';
import './style.css';

const ATLAS_VERSION = '5.0';
const ASSET_REVISION = 'chaoshan-data-5';
const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => innerWidth <= 650;
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const clamp = THREE.MathUtils.clamp;
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
let data, renderer, scene, camera, controls, terrainMesh, waterMesh, buildings, trees;
let sun, hemisphere, floor, base, roadMesh, nightWindows, borderLines, starField;
let animation = null, runningTour = false, tourIndex = 0, shotStart = 0, lastTime = 0;
let activeViewIndex,hiddenAt=null;
let mode = 'day', flatView = false, labelsVisible = true, selected = -1, stopped = false;
let worldBounds, width, depth, sceneReady = false, toastTimer, targetHalfHeight = 20.5;
const labels = [], animatedCars = [], animatedBoats = [], landmarkMaterials = [];
const buildingTiles = [];
const nightGroup = new THREE.Group(), landmarkGroup = new THREE.Group();
const dummy = new THREE.Object3D(), color = new THREE.Color();
let seed = 617; function random(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }

const places = [...landmarkPlaces,...regions.map(p=>({...p,kind:'district',zoom:p.en==="Nan'ao Island"?5:11,top:.20,major:true,pin:true}))];

const materials = {};
function material(name, hex, extra={}) { const m=new THREE.MeshStandardMaterial({color:hex,roughness:.83,metalness:0,...extra});materials[name]=m;return m; }
function toWorld(lon,lat){return[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz];}
function heightAt(x,z){
 const t=data.terrain;
 const gx=clamp((x-worldBounds[0][0])/width*t.nx,0,t.nx-.00001),gz=clamp((z-worldBounds[0][1])/depth*t.nz,0,t.nz-.00001);
 const ix=Math.floor(gx),iz=Math.floor(gz),a=gx-ix,b=gz-iz,i=iz*(t.nx+1)+ix;
 // Match the two triangles emitted by buildTerrain, including their diagonal.
 const h00=t.heights[i],h10=t.heights[i+1],h01=t.heights[i+t.nx+1],h11=t.heights[i+t.nx+2];
 return (a+b<=1?h00+(h10-h00)*a+(h01-h00)*b:h11+(h01-h11)*(1-a)+(h10-h11)*(1-b))*.004;
}
function inBounds(x,z,pad=0){return x>=worldBounds[0][0]+pad&&x<=worldBounds[1][0]-pad&&z>=worldBounds[0][1]+pad&&z<=worldBounds[1][1]-pad;}
function showToast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3600);}
function fail(error){console.error(error);$('loading').hidden=false;$('loading').classList.remove('done');$('loading-text').textContent='地图暂时无法加载，请点击重新载入。';$('retry').hidden=false;}
$('retry').onclick=()=>location.reload();

function buildTerrain(){
 const t=data.terrain,positions=[],colors=[],indices=[];
 const flatColor=new THREE.Color('#779b79'),mid=new THREE.Color('#53845e'),high=new THREE.Color('#999e88');
 for(let j=0;j<=t.nz;j++)for(let i=0;i<=t.nx;i++){
  const x=worldBounds[0][0]+i/t.nx*width,z=worldBounds[0][1]+j/t.nz*depth,h=t.heights[j*(t.nx+1)+i];
  positions.push(x,h*.004,z);
  const c=new THREE.Color().fromArray(landscapeColor(x,z)).lerp(mid,clamp((h-35)/300,0,1));if(t.green?.[j*(t.nx+1)+i])c.lerp(mid,.55);if(h>400)c.lerp(high,clamp((h-400)/500,0,1));
  const k=j*(t.nx+1)+i;
  const slope=Math.abs(h-t.heights[Math.max(0,k-1)])+Math.abs(h-t.heights[Math.max(0,k-t.nx-1)]);
  if(h>350)c.lerp(new THREE.Color('#aba899'),clamp((slope-80)/350,0,.48));
  colors.push(c.r,c.g,c.b);
  if(i<t.nx&&j<t.nz){const k=j*(t.nx+1)+i;indices.push(k,k+t.nx+1,k+1,k+1,k+t.nx+1,k+t.nx+2);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 terrainMesh=new THREE.Mesh(geometry,material('terrain','#ffffff',{vertexColors:true}));terrainMesh.receiveShadow=true;applyMeadowSurface(terrainMesh.material);scene.add(terrainMesh);
 // Rounded solid foundation; actual elevation is the surface above it.
 const w=width+.15,d=depth+.15,r=.6,s=new THREE.Shape();
 s.moveTo(-w/2+r,-d/2);s.lineTo(w/2-r,-d/2);s.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);s.lineTo(w/2,d/2-r);s.quadraticCurveTo(w/2,d/2,w/2-r,d/2);s.lineTo(-w/2+r,d/2);s.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);s.lineTo(-w/2,-d/2+r);s.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);
 const bg=new THREE.ExtrudeGeometry(s,{depth:.65,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.11,bevelThickness:.11,curveSegments:10});bg.rotateX(-Math.PI/2);
 base=new THREE.Mesh(bg,material('base','#d3daca'));base.position.set((worldBounds[0][0]+worldBounds[1][0])/2,-.86,(worldBounds[0][1]+worldBounds[1][1])/2);base.receiveShadow=true;base.castShadow=true;scene.add(base);
 // Close the uneven cut edges of the terrain down to its foundation.
 const skirts=[];
 const edgePaths=[Array.from({length:t.nx+1},(_,i)=>[worldBounds[0][0]+i/t.nx*width,worldBounds[0][1]]),Array.from({length:t.nz+1},(_,j)=>[worldBounds[1][0],worldBounds[0][1]+j/t.nz*depth]),Array.from({length:t.nx+1},(_,i)=>[worldBounds[1][0]-i/t.nx*width,worldBounds[1][1]]),Array.from({length:t.nz+1},(_,j)=>[worldBounds[0][0],worldBounds[1][1]-j/t.nz*depth])];
 for(const path of edgePaths)for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],h1=heightAt(...a),h2=heightAt(...b);skirts.push(a[0],-.04,a[1],b[0],h2,b[1],a[0],h1,a[1],a[0],-.04,a[1],b[0],-.04,b[1],b[0],h2,b[1]);}
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(skirts,3));sg.computeVertexNormals();scene.add(new THREE.Mesh(sg,material('skirt','#bbc9a8',{side:THREE.DoubleSide})));
}
function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return a/2;}
function groups(rings){const out=[];for(const ring of rings){if(ring.length<4)continue;if(ringArea(ring)>0||!out.length)out.push([ring]);else out[out.length-1].push(ring);}return out;}
function inside(p,ring){let ok=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])ok=!ok;}return ok;}
const waterIndex=new Map();
function indexWater(){
 for(let itemIndex=0;itemIndex<data.water.length;itemIndex++)for(const g of groups(data.water[itemIndex])){
  const r=g[0],xs=r.map(p=>p[0]),zs=r.map(p=>p[1]);
  const item={contains:prepareWaterContains(g),height:data.waterHeights[itemIndex]*.004+.012};
  for(let x=Math.floor(Math.min(...xs));x<=Math.floor(Math.max(...xs));x++)for(let z=Math.floor(Math.min(...zs));z<=Math.floor(Math.max(...zs));z++){const key=x+','+z;if(!waterIndex.has(key))waterIndex.set(key,[]);waterIndex.get(key).push(item);}
 }
}
function waterAt(x,z){for(const w of waterIndex.get(Math.floor(x)+','+Math.floor(z))||[])if(w.contains(x,z))return w.height;return null;}
function polygonMesh(items,mat,water=false){
 const arr=[];
 for(let itemIndex=0;itemIndex<items.length;itemIndex++)for(const group of groups(items[itemIndex])){
  const rings=group.map(r=>{const a=r.slice();if(a.length>1&&a[0][0]===a.at(-1)[0]&&a[0][1]===a.at(-1)[1])a.pop();return a.map(p=>new THREE.Vector2(...p));});
  const faces=THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1)),pts=rings.flat();
  const wh=water?data.waterHeights[itemIndex]*.004+.012:null;
  for(const face of faces){const a=pts[face[0]],b=pts[face[1]],c=pts[face[2]];const cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(Math.abs(cross)<1e-10)continue;const order=cross>0?[face[0],face[2],face[1]]:face;for(const k of order){const p=pts[k];arr.push(p.x,water?wh:heightAt(p.x,p.y)+.009,p.y);}}
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;scene.add(m);return m;
}
function buildSurface(){
 indexWater();
 // Land cover is colored directly on the elevation grid, preserving the hills.
 waterMesh=polygonMesh(data.water,material('water','#3d94b0',{roughness:.36,metalness:.15,side:THREE.DoubleSide}),true);
 const roadPositions=[],railPositions=[],carRoutes=[],walkRoutes=[],pave=terrainPaving(data.terrain,heightAt);
 const roadWidth={motorway:.046,trunk:.044,primary:.042,secondary:.040,tertiary:.038,rail:.006};
 for(const [cls,bridge,path] of outsideSmallParkRoads(data.roads,places.find(p=>p.id==='small-park'))){
  const dest=cls==='rail'?railPositions:roadPositions;
  const route=[];
  for(let i=0;i<path.length;i++){const p=path[i],h=heightAt(...p);route.push(V(p[0],Math.max(h,bridge?waterAt(...p)??0:0)+(bridge?.035:.017),p[1]));}
  for(let i=0;i<route.length-1;i++){
   const a=route[i],b=route[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.001)continue;
   if(!bridge){pave(dest,[a.x,a.z],[b.x,b.z],roadWidth[cls]*2);continue;}
   const nx=-dz/len*roadWidth[cls],nz=dx/len*roadWidth[cls];
   dest.push(a.x+nx,a.y,a.z+nz,b.x+nx,b.y,b.z+nz,a.x-nx,a.y,a.z-nz,a.x-nx,a.y,a.z-nz,b.x+nx,b.y,b.z+nz,b.x-nx,b.y,b.z-nz);
  }
  if(cls!=='rail'&&route.length>1){carRoutes.push(route);if(!bridge&&!['motorway','trunk'].includes(cls))walkRoutes.push(route);}
 }
 const make=(arr,mat)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));g.computeVertexNormals();const m=new THREE.Mesh(g,mat);scene.add(m);return m;};
 roadMesh=make(roadPositions,material('road','#53616a',{roughness:.95,side:THREE.DoubleSide}));
 make(railPositions,material('rail','#a6b0a0',{side:THREE.DoubleSide}));
 // Vehicles follow the source road polylines, and do not represent live traffic.
 const carMat=new THREE.MeshStandardMaterial({color:'#edf1d6',emissive:'#e3b675',emissiveIntensity:0});materials.cars=carMat;
 timed('traffic',()=>{traffic=buildTraffic({coverNetwork:true,population:mobile()?1008:2016,parent:scene,routes:carRoutes,places,mobile:mobile()});});
 timed('regionalLife',()=>{regionalLife=buildRegionalLife({coverNetwork:true,population:mobile()?768:1536,parent:scene,routes:walkRoutes,roadRoutes:carRoutes,places,heightAt,waterAt,buildings:data.buildings,toLonLat:(x,z)=>[data.meta.origin[0]+x/data.meta.sx,data.meta.origin[1]-z/data.meta.sz],mobile:mobile()});});
 places.push(...regionalLife.places);timed('transport',()=>{transport=buildTransport({parent:scene,data,places,heightAt,waterAt,toWorld,mobile:mobile()});});places.push(...transport.places);timed('cuisine',()=>{cuisine=buildCuisine({parent:scene,data,places,heightAt,waterAt,mobile:mobile()});});positionNanaoPlaces({toWorld,heightAt,waterAt});places.push(...cuisine.places,...nanaoPlaces);positionShantouPlaces({existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...shantouPlaces);positionShantouPlaces({places:jiexiPlaces,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...jiexiPlaces);positionShantouPlaces({places:huilaiPlaces,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...huilaiPlaces);positionRaopingPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...raopingPlaces);positionChaoanPlaces({existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...chaoanPlaces);positionChenghaiPlaces({existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...chenghaiPlaces);positionChaoyangPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...chaoyangPlaces);positionChaonanPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...chaonanPlaces);positionPuningPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...puningPlaces);positionJieyangPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...jieyangPlaces);timed('communityActivities',()=>{communityActivities=buildCommunityActivities({parent:scene,places,heightAt,waterAt,routes:carRoutes,buildings:data.buildings});});timed('tourContext',()=>{tourContext=buildTourContext({terrain:data.terrain,parent:scene,places,sites:communityActivities.sites,routes:walkRoutes,roadRoutes:carRoutes,heightAt,waterAt,buildings:data.buildings,mobile:mobile()});});timed('regionalEnvironment',()=>{regionalEnvironment=buildRegionalEnvironment({reserve:tourContext.clear,reservedSites:[...communityActivities.sites,...tourContext.sites,...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces,...puningPlaces,...jieyangPlaces],parent:scene,data,places,heightAt,waterAt,waterMesh,mobile:mobile()});});timed('urbanEnvironment',()=>{urbanEnvironment=buildUrbanEnvironment({reserve:tourContext.clear,parent:scene,routes:walkRoutes,places,heightAt,waterAt,buildings:data.buildings,mobile:mobile()});});
}

function buildBuildings(){
 const records=data.buildings.filter(b=>inBounds(b[0],b[1],.05)&&!places.some(p=>p.id==='small-park'&&insidePlace(p,b[0],b[1],Math.max(b[2],b[3])*.5))&&![...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces,...puningPlaces,...jieyangPlaces].some(p=>!p.aliasOf&&insidePlace(p,b[0],b[1],Math.max(b[2],b[3])*.5))&&!places.some(p=>['palace','tower','lotte','ddp','botanic'].includes(p.kind)&&Math.hypot(b[0]-p.x,b[1]-p.z)<(p.kind==='palace'?.25:.12)));
 buildings=new THREE.Group();buildings.count=records.length;
 const buildingMat=material('buildings','#ffffff',{roughness:.77}),buildingGeo=new THREE.BoxGeometry(1,1,1);
 const tileRecords=new Map();
 for(const row of records){const key=Math.floor(row[0]/3)+','+Math.floor(row[1]/3);if(!tileRecords.has(key))tileRecords.set(key,[]);tileRecords.get(key).push(row);}
 const hash=r=>{const n=Math.sin(r[0]*132.43+r[1]*219.73)*43758.5453;return n-Math.floor(n);};
 for(const rows of tileRecords.values()){
  rows.sort((a,b)=>(b[5]>=25?2+b[5]/555:hash(b))-(a[5]>=25?2+a[5]/555:hash(a)));
  const mesh=new THREE.InstancedMesh(buildingGeo,buildingMat,rows.length);mesh.name="osm-buildings";mesh.castShadow=true;mesh.receiveShadow=true;
  for(let i=0;i<rows.length;i++){
   const [x,z,w,d,a,h]=rows[i],high=h*.004;dummy.position.set(x,heightAt(x,z)+high/2,z);dummy.rotation.set(0,-a,0);dummy.scale.set(w,high,d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   color.set(h>70?'#9dbdc0':h>25?'#bec9c1':'#d2d7c9').multiplyScalar(.86+hash(rows[i])*.25);mesh.setColorAt(i,color);
  }
  mesh.computeBoundingSphere();mesh.userData.fullCount=rows.length;
  const tall=rows.filter(r=>r[5]>=25).length;mesh.userData.overviewCount=tall+Math.ceil((rows.length-tall)*(mobile()?.25:.4));mesh.count=mesh.userData.overviewCount;buildingTiles.push(mesh);buildings.add(mesh);
 }
 const windowPos=[],windowColors=[];
 for(let i=0;i<records.length;i++){
  const [x,z,w,d,a,h]=records[i],high=h*.004;
  if(h>18&&random()>.22){
   for(let n=0;n<Math.min(8,Math.ceil(h/23));n++){
    const yy=heightAt(x,z)+(.3+random()*.65)*high;
    const side=random()>.5?1:-1,xx=x+Math.cos(a)*w*.505*side,zz=z+Math.sin(a)*w*.505*side;
    windowPos.push(xx,yy,zz);const wc=new THREE.Color(random()>.13?'#ffcc78':'#a1dfef');windowColors.push(wc.r,wc.g,wc.b);
   }
  }
 }
 scene.add(buildings);data.buildings=[];
 const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(windowPos,3));wg.setAttribute('color',new THREE.Float32BufferAttribute(windowColors,3));nightWindows=new THREE.Points(wg,new THREE.PointsMaterial({size:1.65,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));nightGroup.add(nightWindows);scene.add(nightGroup);nightGroup.visible=false;
}
function buildTrees(){
 const accepted=[],N=mobile()?4000:7000;
 for(let i=0;i<N*10&&accepted.length<N;i++){
  const x=worldBounds[0][0]+.18+random()*(width-.36),z=worldBounds[0][1]+.18+random()*(depth-.36),h=heightAt(x,z);
  if(h<.30||h>2.65||waterAt(x,z)!==null||random()>Math.min(.9,h/.9))continue;
  if(tourContext.clear(x,z,.20)&&communityActivities.sites.every(p=>Math.hypot(x-p.x,z-p.z)>p.span+.35))accepted.push([x,z,h,.10+random()*.18]);
 }
 woodland=buildVegetation({parent:scene,accepted});trees=woodland.group;
}

function addMesh(parent,geo,mat,pos=[0,0,0],scale=null){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function block(g,mat,x,y,z,w,h,d){return addMesh(g,new THREE.BoxGeometry(w,h,d),mat,[x,y+h/2,z]);}
function cylinder(g,mat,r1,r2,h,y,x=0,z=0){return addMesh(g,new THREE.CylinderGeometry(r1,r2,h,24),mat,[x,y+h/2,z]);}
function buildLandmarks(){
 material('ivory','#eee5d0');
 localLandmarks=buildLocalLandmarks({parent:landmarkGroup,heightAt,waterAt,toWorld});nanaoSights=buildNanaoSights({parent:landmarkGroup,heightAt,waterAt,toWorld,data});shantouSights=buildShantouSights({parent:landmarkGroup,heightAt,waterAt});jiexiSights=buildJiexiSights({parent:landmarkGroup,heightAt,waterAt});huilaiSights=buildHuilaiSights({parent:landmarkGroup,heightAt,waterAt});raopingSights=buildRaopingSights({parent:landmarkGroup,heightAt,waterAt});chaoanSights=buildChaoanSights({parent:landmarkGroup,heightAt,waterAt});chenghaiSights=buildChenghaiSights({parent:landmarkGroup,heightAt,waterAt});chaoyangSights=buildChaoyangSights({parent:landmarkGroup,heightAt,waterAt});chaonanSights=buildChaonanSights({parent:landmarkGroup,heightAt,waterAt});puningSights=buildPuningSights({parent:landmarkGroup,heightAt,waterAt});jieyangSights=buildJieyangSights({parent:landmarkGroup,heightAt,waterAt});
 streetLife=extendLandmarkLife(buildLandmarkLife({models:localLandmarks.models,mobile:mobile()}),{models:localLandmarks.models,mobile:mobile(),heightAt,waterAt,roads:data.roads});
 rockfields=buildRockfields({parent:scene,data,heightAt,waterAt});
 scene.add(landmarkGroup);
}
function buildBorders(){
 const positions=[];
 for(const district of data.districts)for(const ring of district.rings)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];positions.push(a[0],heightAt(...a)+.023,a[1],b[0],heightAt(...b)+.023,b[1]);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));borderLines=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#bfa267',transparent:true,opacity:.8}));borderLines.visible=false;scene.add(borderLines);
}
function buildBoats(){
 const mat=new THREE.MeshStandardMaterial({color:'#fff2d8',roughness:.8}),wakeMat=new THREE.LineBasicMaterial({color:'#d8f5e2',transparent:true,opacity:.6});
 for(let i=0;i<20;i++){
  for(let attempt=0;attempt<80;attempt++){
   const x=worldBounds[0][0]+random()*width,z=worldBounds[0][1]+random()*depth,y=waterAt(x,z);if(y===null)continue;
   const dx=.12+random()*.8,dz=(random()-.5)*.5;if([.25,.5,.75,1].some(t=>waterAt(x+dx*t,z+dz*t)===null))continue;
   const g=new THREE.Group();addMesh(g,new THREE.BoxGeometry(.08,.022,.03),mat,[0,.018,0]);addMesh(g,new THREE.BoxGeometry(.04,.02,.026),mat,[-.006,.039,0]);
   const wake=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(-.04,.008,0),V(-.16,.008,.032),V(-.08,.008,0),V(-.16,.008,-.032)]),wakeMat);g.add(wake);g.rotation.y=-Math.atan2(dz,dx);scene.add(g);animatedBoats.push({mesh:g,x,z,y,dx,dz,offset:random()});break;
  }
 }
}
function buildStars(){
 const pts=[];for(let i=0;i<550;i++){const a=random()*Math.PI*2,p=.15+random()*1.2,r=110;pts.push(Math.cos(a)*Math.sin(p)*r,Math.cos(p)*r,Math.sin(a)*Math.sin(p)*r);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));starField=new THREE.Points(g,new THREE.PointsMaterial({color:'#cfe1ed',size:1.3,sizeAttenuation:false,transparent:true,opacity:.6}));starField.visible=false;scene.add(starField);
}

function setTime(time,fromSky=false){
 if(!['morning','day','sunset','night'].includes(time)||!scene)return false;
 if(!fromSky&&livingSky)livingSky.manual(time);
 mode=time;document.body.dataset.time=time==='morning'?'day':time;
 for(const b of document.querySelectorAll('[data-time-choice]')){const on=b.dataset.timeChoice===time;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);}
 return true;
}

function resize(){
 const aspect=innerWidth/innerHeight;targetHalfHeight=(mobile()?Math.max(24,30/aspect):Math.max(24,34/aspect))*Math.max(width/47,depth/45);
 camera.left=-targetHalfHeight*aspect;camera.right=targetHalfHeight*aspect;camera.top=targetHalfHeight;camera.bottom=-targetHalfHeight;
 camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(sceneReady&&places[selected]){
  const original=places[selected],view=original.views?.[activeViewIndex??original.defaultView??0],p=view?{...original,...view}:original;
  if(animation){controls.target.copy(animation.toTarget);camera.position.copy(animation.toPosition);animation=null;}
  camera.zoom=placeZoom(p,targetHalfHeight,aspect,mobile());camera.updateProjectionMatrix();controls.update();
 }
}
function tweenTo(target,zoom,offset=V(34,39,46).multiplyScalar(Math.max(width/47,depth/45)),duration=2200){
 animation={start:performance.now(),duration:reducedMotion?0:duration,fromTarget:controls.target.clone(),toTarget:target,fromPosition:camera.position.clone(),toPosition:target.clone().add(offset),fromZoom:camera.zoom,toZoom:zoom};
}
function resetView(){
 stopTour();selected=-1;flatView=false;updateViewButton();updateSelection();
 tweenTo(mobile()?V(0,.1,0):V(-4.5,.1,3.1),1,V(34,39,46).multiplyScalar(Math.max(width/47,depth/45)));
 setLocation('潮汕，一览山海','A REGION IN MINIATURE','三市、山地与海岸，十二处地区入口',data.meta.origin,'CHAOSHAN');$('district').value='';
}
function setLocation(name,en,desc,ll,index='SEOUL'){$('location-name').textContent=name;$('location-en').textContent=en.toUpperCase();$('location-description').textContent=desc;$('location-index').textContent=index;$('location-coordinates').textContent=`${ll[1].toFixed(4)}° N   ${ll[0].toFixed(4)}° E`;}
function updateSelection(){
 featureUI?.select(selected);frameSun();
 for(let i=0;i<places.length;i++){places[i].button.classList.toggle('selected',i===selected);places[i].button.setAttribute('aria-current',i===selected?'location':'false');places[i].label.classList.toggle('selected',i===selected);places[i].pinElement?.classList.toggle('selected',i===selected);}
}
function focusPlace(i,touring=false,viewIndex){
 if(!Number.isInteger(i)||i<0||i>=places.length)return false;activeViewIndex=viewIndex;
 if(!touring)stopTour();selected=i;flatView=false;updateViewButton();const original=places[i],view=original.views?.[viewIndex??original.defaultView??0],p=view?{...original,...view}:original;
 tweenTo(V(p.x,(p.sceneY??heightAt(p.x,p.z))+p.top*.32,p.z),placeZoom(p,targetHalfHeight,innerWidth/innerHeight,mobile()),V(...(p.kind==='landmark'?(p.id==='lighthouse'?[-4,3.5,4]:[3,4,5]):(p.offset||[14,16,20]))),touring?3200:2200);
 setLocation(p.name,p.en,p.description,p.ll,String(i+1).padStart(2,'0'));updateSelection();closeExplore();$('district').value=String(i);
}
function syncTour(){
 const s=atlasTour?.getState()||{running:false,total:0};runningTour=s.running;
 const label=runningTour?'暂停巡游':s.total&&!s.ended?'继续巡游':'自动巡游';
 if($('tour-text').textContent!==label){$('tour').setAttribute('aria-pressed',String(runningTour));$('tour-text').textContent=label;$('play-icon').innerHTML=runningTour?'<path d="M8 5h2v14H8zM16 5h2v14h-2z"/>':'<path d="m9 5 11 7-11 7Z"/>';}
 destinationControls?.sync({...s,scope:s.total?tourScope:featureUI?.getTourSelection().scope||'当前分类',suspended:!!document.querySelector('dialog[open]')||livingSky?.paused});
 $('tour-progress').style.width=(s.total?s.elapsed/(s.seconds*10):0)+'%';
}
function stopTour(){atlasTour?.cancel();runningTour=false;if($('tour'))syncTour();}
function startTour(){
 if(atlasTour.getState().total){atlasTour.resume();closeExplore();return;}
 const selection=featureUI.getTourSelection();tourScope=selection.scope;
 atlasTour.start(selection.indices,selected);closeExplore();
}
function toggleTour(){if(runningTour)atlasTour.pause();else startTour();}
function stepTour(delta){
 if(!atlasTour.getState().total){const selection=featureUI.getTourSelection();tourScope=selection.scope;atlasTour.start(selection.indices,selected);atlasTour.pause();}
 atlasTour.step(delta);
}
function updateViewButton(){$('view-text').textContent=flatView?'立体视图':'平面视图';$('view-mode').setAttribute('aria-pressed',flatView);}
function closeExplore(){$('explore').classList.remove('open');$('open-explore').setAttribute('aria-expanded','false');}
function buildUI(){
 $('place-count').textContent=places.length+'处';
 places.forEach((p,i)=>{
  const b=document.createElement('button');b.className='place';b.innerHTML=`<span class="place-number">${String(i+1).padStart(2,'0')}</span><span><span class="place-title">${p.name}</span><span class="place-en">${p.en}</span></span><span class="place-icon" aria-hidden="true">↗</span>`;b.onclick=()=>focusPlace(i);$('places').append(b);p.button=b;
  const l=document.createElement('button');l.className='map-label';l.classList.toggle('city-label',coreCities.includes(p.name));const leader=document.createElement('span');leader.className='map-label-leader';leader.hidden=true;$('labels').append(leader);l.leader=leader;l.textContent=p.name;l.setAttribute('aria-label',p.name+'，前往此处');l.onclick=()=>focusPlace(i);$('labels').append(l);p.label=l;labels.push({p,el:l,pos:V(p.x,(p.sceneY??heightAt(p.x,p.z))+p.top+.14,p.z)});
  if(p.pin){const pin=document.createElement('button');pin.className='map-pin';pin.hidden=true;pin.title=p.name;pin.setAttribute('aria-label',p.name+'，前往此处');pin.onclick=()=>focusPlace(i);$('labels').append(pin);p.pinElement=pin;p.pinPosition=V(p.x,heightAt(p.x,p.z)+.04,p.z);}
 });
 const river=data.meta.hangangWater;
 if(river){
  const [x,z]=toWorld(...river.labelCoordinates),y=waterAt(x,z);
  if(y!==null){const el=document.createElement('span');el.className='map-label water-label';el.textContent=river.label;el.hidden=true;$('labels').append(el);labels.push({p:{major:true},el,pos:V(x,y+.07,z)});}
 }
 for(let i=0;i<places.length;i++){const option=document.createElement('option');option.value=String(i);option.textContent=places[i].name;$('district').append(option);}
 $('district').onchange=e=>{if(e.target.value!=='')focusPlace(Number(e.target.value));};
 for(const b of document.querySelectorAll('[data-time-choice]'))b.onclick=()=>setTime(b.dataset.timeChoice);
 $('home').onclick=resetView;$('tour').onclick=toggleTour;
 $('zoom-in').onclick=()=>{stopTour();animation=null;camera.zoom=clamp(camera.zoom*1.35,.65,700);camera.updateProjectionMatrix();};$('zoom-out').onclick=()=>{stopTour();animation=null;camera.zoom=clamp(camera.zoom/1.35,.65,700);camera.updateProjectionMatrix();};
 $('north').onclick=()=>{stopTour();tweenTo(controls.target.clone(),camera.zoom,V(0,flatView?65:42,flatView?.001:45),1300);};
 $('view-mode').onclick=()=>{stopTour();flatView=!flatView;updateViewButton();tweenTo(controls.target.clone(),camera.zoom,flatView?V(0,65,.001):V(34,39,46).multiplyScalar(Math.max(width/47,depth/45)),1500);};
 $('toggle-labels').onclick=()=>{labelsVisible=!labelsVisible;$('toggle-labels').classList.toggle('active',labelsVisible);$('toggle-labels').setAttribute('aria-pressed',labelsVisible);};
 $('boundaries').onclick=()=>{borderLines.visible=!borderLines.visible;$('boundaries').setAttribute('aria-pressed',borderLines.visible);$('boundaries').textContent=borderLines.visible?'隐藏':'显示';};
 $('open-explore').onclick=()=>{const open=$('explore').classList.toggle('open');$('open-explore').setAttribute('aria-expanded',open);};$('close-explore').onclick=closeExplore;
 const showAbout=()=>{stopTour();$('about').showModal();};$('info').onclick=showAbout;$('credits').onclick=showAbout;$('close-about').onclick=()=>$('about').close();
 $('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
 $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else showToast('此浏览器不支持全屏，可横置设备查看。');}catch{showToast('暂时无法打开全屏。');}};
 $('viewport').addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();stopTour();animation=null;const delta=1.2/camera.zoom;const x=e.key==='ArrowLeft'?-delta:e.key==='ArrowRight'?delta:0,z=e.key==='ArrowUp'?-delta:e.key==='ArrowDown'?delta:0;controls.target.add(V(x,0,z));camera.position.add(V(x,0,z));}
  if(e.key==='+'||e.key==='=')$('zoom-in').click();if(e.key==='-')$('zoom-out').click();if(e.key.toLowerCase()==='h')resetView();
 });
}
const projected=new THREE.Vector3();
function updateLabels(){
 // Project labels with the same camera transform used to render this frame.
 camera.updateMatrixWorld();
 const occupied=[...document.querySelectorAll('.brand,.top-actions,.explore,.location-card,.map-controls,.bottom-center')].filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};});const uiOccupied=[...occupied];const ordered=[...labels].sort((a,b)=>labelPriority(b.p,places[selected])-labelPriority(a.p,places[selected]));
 for(const item of ordered){
  const {p,el}=item;
  if(!item.size){const hidden=el.hidden;el.hidden=false;item.size={width:el.offsetWidth,height:el.offsetHeight};el.hidden=hidden;}
  projected.copy(item.pos).project(camera);const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
  const near=camera.zoom>2.5||p.major||p===places[selected];
  const layout=labelPosition({x,y,width:innerWidth,height:innerHeight,mobile:mobile(),important:coreCities.includes(p.name)||p===places[selected],occupied,labelWidth:item.size.width,labelHeight:item.size.height});
  const show=labelsVisible&&near&&projected.z>-1&&projected.z<1&&x>0&&x<innerWidth&&y>80&&y<innerHeight-100&&!!layout;
  el.hidden=!show;if(el.leader)el.leader.hidden=true;
  if(show){el.style.left=layout.x+'px';el.style.top=layout.y+'px';occupied.push(layout.box);
   if(el.leader&&Math.hypot(layout.x-x,layout.y-y)>1){const d=Math.hypot(layout.x-x,layout.y-y);el.leader.hidden=false;el.leader.style.left=x+'px';el.leader.style.top=y+'px';el.leader.style.width=d+'px';el.leader.style.transform='rotate('+Math.atan2(layout.y-y,layout.x-x)+'rad)';}
  }
  if(p.pinElement){
   projected.copy(p.pinPosition).project(camera);const px=(projected.x*.5+.5)*innerWidth,py=(-projected.y*.5+.5)*innerHeight;
   const pinBlocked=(px<=(mobile()?0:innerWidth<850?240:295)&&py>145)||(px>innerWidth-300&&py<100);
   const pinShow=!uiOccupied.some(b=>px+14>b.x&&px-14<b.x+b.w&&py+14>b.y&&py-14<b.y+b.h)&&labelsVisible&&projected.z>-1&&projected.z<1&&px>20&&px<innerWidth-20&&py>110&&py<innerHeight-150&&!pinBlocked;
   p.pinElement.hidden=!pinShow;if(pinShow){p.pinElement.style.left=px+'px';p.pinElement.style.top=py+'px';}
  }
 }
 $('north').querySelector('svg').style.transform=`rotate(${-Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z)*180/Math.PI}deg)`;
}
function animate(now){
 if(stopped)return;requestAnimationFrame(animate);if(document.hidden||!sceneReady)return;
 const skyDt=Math.min(Math.max(0,(now-lastTime)/1000),1),dt=Math.min(skyDt,.05);lastTime=now;
 if(animation){const a=animation;const t=a.duration?clamp((now-a.start)/a.duration,0,1):1;const ease=t*t*(3-2*t);controls.target.lerpVectors(a.fromTarget,a.toTarget,ease);camera.position.lerpVectors(a.fromPosition,a.toPosition,ease);camera.zoom=THREE.MathUtils.lerp(a.fromZoom,a.toZoom,ease);camera.updateProjectionMatrix();if(t===1)animation=null;}
 else if(runningTour&&!reducedMotion&&!livingSky?.paused&&!document.querySelector('dialog[open]')){const delta=camera.position.clone().sub(controls.target);delta.applyAxisAngle(V(0,1,0),dt*.045);camera.position.copy(controls.target).add(delta);}
 atlasTour?.tick(skyDt*1000,!!livingSky?.paused||!!document.querySelector('dialog[open]'));syncTour();
 controls.update();
 if(!animation){const x=clamp(controls.target.x,worldBounds[0][0],worldBounds[1][0]),z=clamp(controls.target.z,worldBounds[0][1],worldBounds[1][1]);camera.position.x+=x-controls.target.x;camera.position.z+=z-controls.target.z;controls.target.x=x;controls.target.z=z;}
 if(!livingSky?.paused){
  const now=lifeSeconds*1000;
  for(const a of animatedCars){const t=(now*.0001*a.speed+a.offset)%1;a.mesh.position.copy(a.curve.getPoint(t));a.mesh.position.y+=.025;const tangent=a.curve.getTangent(t);a.mesh.rotation.y=-Math.atan2(tangent.z,tangent.x);}
  for(const a of animatedBoats){const t=(now*.000022+a.offset)%1;a.mesh.position.set(a.x+a.dx*t,a.y+.012+Math.sin(now*.0018+a.offset*9)*.003,a.z+a.dz*t);}
 }
 const detailed=camera.zoom/(targetHalfHeight/24)>1.7;for(const tile of buildingTiles)tile.count=detailed?tile.userData.fullCount:tile.userData.overviewCount;
 exhibitVisibility?.update(camera);setCrowdView(camera);{if(!livingSky?.paused)lifeSeconds+=dt;traffic?.update(lifeSeconds);transport?.update(lifeSeconds);cuisine?.update(lifeSeconds);communityActivities?.update(lifeSeconds);tourContext?.update(lifeSeconds);nanaoSights?.update(lifeSeconds);shantouSights?.update(lifeSeconds);jiexiSights?.update(lifeSeconds);huilaiSights?.update(lifeSeconds);raopingSights?.update(lifeSeconds);chaoanSights?.update(lifeSeconds);chenghaiSights?.update(lifeSeconds);chaoyangSights?.update(lifeSeconds);chaonanSights?.update(lifeSeconds);puningSights?.update(lifeSeconds);jieyangSights?.update(lifeSeconds);streetLife?.update(lifeSeconds);regionalLife?.update(lifeSeconds);}localLandmarks?.update(lifeSeconds*1000,false);regionalEnvironment?.update(lifeSeconds,camera.zoom);livingSky?.update(skyDt);communitySocial?.update(lifeSeconds);frameSun();staticVisibility?.update(camera,[sun]);signBudget?.update(camera,innerHeight);updateLabels();renderer.render(scene,camera);
}
const startup={};
function timed(name,fn){const start=performance.now();const value=fn();startup[name]=Math.round(performance.now()-start);return value;}
async function init(){
 const [response,buildingResponse]=await Promise.all([fetch(`/data/chaoshan.json?v=${ASSET_REVISION}`),fetch(`/data/buildings.bin?v=${ASSET_REVISION}`)]);if(!response.ok||!buildingResponse.ok)throw new Error('Map data unavailable');data=await response.json();
 const buildingArray=new Float32Array(await buildingResponse.arrayBuffer());if(buildingArray.length!==data.meta.buildingCount*6)throw new Error('Building data incomplete');
 data.buildings=Array.from({length:data.meta.buildingCount},(_,i)=>Array.from(buildingArray.subarray(i*6,i*6+6)));$('loading-bar').style.width='35%';
 worldBounds=data.terrain.bounds;width=worldBounds[1][0]-worldBounds[0][0];depth=worldBounds[1][1]-worldBounds[0][1];
 places.push(...mountainPlaces(data));for(const p of places){[p.x,p.z]=toWorld(...p.ll);}
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.6:1.8));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('viewport').append(renderer.domElement);
 renderer.domElement.setAttribute('aria-hidden','true');renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();stopped=true;fail(new Error('WebGL context lost'));});
 scene=new THREE.Scene();scene.background=new THREE.Color('#e6ede7');scene.fog=new THREE.Fog('#e6ede7',260,650);
 camera=new THREE.OrthographicCamera(-35,35,24,-24,.1,700);const homeTarget=mobile()?V(0,.1,0):V(-4.5,.1,3.1);camera.position.copy(homeTarget).add(V(34,39,46).multiplyScalar(Math.max(width/47,depth/45)));
 controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(homeTarget);controls.enableDamping=true;controls.dampingFactor=.07;controls.maxPolarAngle=Math.PI*.465;controls.minPolarAngle=.001;controls.minZoom=.65;controls.maxZoom=700;controls.screenSpacePanning=false;controls.rotateSpeed=.6;controls.zoomSpeed=.85;
 controls.addEventListener('start',()=>{animation=null;stopTour();});
 hemisphere=new THREE.HemisphereLight('#d8e7f2','#b5c4a3',2.1);scene.add(hemisphere);sun=new THREE.DirectionalLight('#fff2d6',3.1);sun.position.set(-25,42,12);sun.castShadow=true;sun.shadow.mapSize.set(mobile()?1024:2048,mobile()?1024:2048);Object.assign(sun.shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:1,far:120});sun.shadow.bias=-.0004;sun.shadow.normalBias=.025;scene.add(sun,sun.target);
 floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshStandardMaterial({color:'#e6ede7',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.94;floor.receiveShadow=true;scene.add(floor);
 timed('buildTerrain',()=>buildTerrain());await nextPaint();$('loading-text').textContent='正在连接潮汕河流与道路';timed('buildSurface',()=>buildSurface());$('loading-bar').style.width='62%';await nextPaint();
 timed('buildBuildings',()=>buildBuildings());timed('buildTrees',()=>buildTrees());$('loading-text').textContent='正在加载城市建筑与山林';$('loading-bar').style.width='83%';await nextPaint();
 timed('buildLandmarks',()=>buildLandmarks());timed('buildBorders',()=>buildBorders());timed('buildBoats',()=>buildBoats());timed('buildStars',()=>buildStars());timed('buildUI',()=>buildUI());communitySocial=createCommunitySocial({camera});featureUI=attachFeatureUI({places,focusPlace,renderer,camera,landmarkGroup,social:communitySocial,onFilter:()=>stopTour(),pauseTour:()=>atlasTour?.pause(),life:{traffic,woodland,streetLife,rockfields,regionalLife,regionalEnvironment,transport,cuisine,communityActivities,tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights,chaonanSights,puningSights,jieyangSights}});atlasTour=createAtlasTour({onVisit:index=>{tourIndex=index;shotStart=performance.now();focusPlace(index,true);},onChange:syncTour});destinationControls=mountDestinationControls({previous:()=>stepTour(-1),next:()=>stepTour(1),toggle:toggleTour,recenter:()=>selected>=0?focusPlace(selected):resetView(),speed:value=>atlasTour.speed(value)});signBudget=createSignBudget(scene);timed('spatialSurfaces',()=>partitionLargeSurfaces(scene));exhibitVisibility=exhibitCulling([localLandmarks,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights,chaonanSights,puningSights,jieyangSights,tourContext].flatMap(s=>s.models));staticVisibility=timed('staticVisibility',()=>createStaticVisibility(scene));setTime('day');resize();controls.update();sceneReady=true;floor.material.depthWrite=false;livingSky=createLivingSky({scene,camera,sun,hemisphere,renderer,materials,floor,nightGroup,starField,landmarkMaterials,localLandmarks,regionalEnvironment,setPeriod:mode=>setTime(mode,true),reducedMotion});livingSky.update(0);frameSun();if(import.meta.env.DEV)window.__atlasLighting={scene,camera,sun,renderer};renderer.render(scene,camera);$('loading-bar').style.width='100%';$('loading').classList.add('done');setTimeout(()=>$('loading').hidden=true,750);window.addEventListener('resize',resize);requestAnimationFrame(animate);
 // Read-only state for non-browser functional checks and diagnostics.
 window.chaoshanAtlas={getState:()=>({version:ATLAS_VERSION,ready:sceneReady,sky:livingSky?.getState(),sceneSeconds:lifeSeconds,social:communitySocial?.getState(),startup:{...startup},environment:{...regionalEnvironment.stats,corridorCells:urbanEnvironment.corridorCells,fields:urbanEnvironment.fields,urbanArchitecture:urbanEnvironment.architecture},transport:transport.stats,nanao:nanaoSights.stats,shantou:shantouSights.stats,jiexi:jiexiSights.stats,huilai:huilaiSights.stats,raoping:raopingSights.stats,chaoan:chaoanSights.stats,chenghai:chenghaiSights.stats,chaoyang:chaoyangSights.stats,chaonan:chaonanSights.stats,puning:puningSights.stats,jieyang:jieyangSights.stats,cuisine:cuisine.stats,recreation:communityActivities.stats,tourContext:tourContext.stats,life:{vehicles:traffic.count+streetLife.vehicles,people:streetLife.people+regionalLife.count,coastalLandmarks:streetLife.coverage,regionalCoverage:regionalLife.coverage,trafficCoverage:traffic.coverage,trafficRoutes:traffic.routeCount,signalCrossings:traffic.crossings,urbanInfill:urbanEnvironment.buildings,activities:regionalLife.activityTypes,activityPlaces:regionalLife.places.map(p=>p.name),vehicleTypes:traffic.types,treeTypes:woodland.counts,outfits:streetLife.outfits,rocks:rockfields.count,seconds:lifeSeconds},source:data.meta.vectorSource,terrainSamples:data.terrain.heights.length,roadSegments:data.roads.length,waterPolygons:data.water.length,buildings:buildings.count,districts:regions.length,landmarks:landmarkGroup.children.length,selected:places[selected]?.id||places[selected]?.name||null,modelMeshes:localLandmarks.models.map(m=>({id:m.spec.id,meshes:m.group.children.length})),zoom:camera.zoom,time:mode,touring:runningTour,view:{flat:flatView,halfHeight:targetHalfHeight/camera.zoom,aspect:innerWidth/innerHeight,target:controls.target.toArray(),position:camera.position.toArray()},labelsVisible,layers:featureUI.getLayers(),boundariesVisible:borderLines.visible,ivoryEmission:materials.ivory.emissive.getHexString(),tourElapsed:atlasTour?.getState().elapsed||0,tour:{...atlasTour?.getState(),scope:tourScope},signBudget:{...signBudget?.stats},staticVisibility:{...staticVisibility?.stats},render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},places:places.map((p,i)=>({id:p.id||p.name,index:i,name:p.name,kind:p.kind}))}),geometryBudget:()=>{
 const rows=[],frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));scene.traverseVisible(o=>{if(!o.isMesh||(o.frustumCulled&&!frustum.intersectsObject(o)))return;const g=o.geometry;rows.push({name:o.name||o.parent?.name||o.type,color:o.material.color?.getHexString(),triangles:(g.index?.count||g.attributes.position?.count||0)/3*(o.isInstancedMesh?o.count:1),instances:o.isInstancedMesh?o.count:1});});return rows.sort((a,b)=>b.triangles-a.triangles).slice(0,20);
 },focusPlace,resetView,setTime};
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){hiddenAt??=performance.now();return;}
 if(hiddenAt!==null){({animation,shotStart,lastTime}=resumedTimeline({animation,shotStart,hiddenAt,now:performance.now()}));hiddenAt=null;}
});
init().catch(fail);

function frameSun(){
 if(!sun||!controls)return;
 fitSunShadow({sun,camera,target:controls.target,worldSpan:Math.max(width,depth)});
}
