import * as THREE from 'three';
import {createElement,Store} from 'lucide';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {prepareWaterContains} from './water-query.mjs';
import {terrainPaving,terrainRoadJoint} from './terrain-paving.mjs';
import regions from './regions.json';
import './style.css';
import './experience.css';
import {attachExperience} from './experience.mjs';
import {createLivingSky} from './living-sky.mjs';
import {fitSunShadow} from './solar-lighting.mjs';
import {createLivingWorld} from './living-world.mjs';
import {mountTravelExplorer} from './travel-explorer.mjs';
import {createIslandDetail} from './island-detail.mjs';
import {createOldTownDetail} from './oldtown-detail.mjs';
import {oldTownWorldBounds,clipSegmentToBounds} from './oldtown-layout.mjs';
import {createCoastDetail} from './coast-detail.mjs';
import {createCoastCoverage,outsideIntervals,coastLocations} from './coast-layout.mjs';
import {createCampusDetail,campusLocations} from './campus-detail.mjs';
import {createCampusTerrain} from './campus-terrain.mjs';
import {createGardenDetail} from './garden-detail.mjs';
import {createEastshoreDetail,eastshoreLocations} from './eastshore-detail.mjs';
import {createNorthshoreDetail,northshoreLocations} from './northshore-detail.mjs';
import {campusStops} from './campus-stops.mjs';
import {mountDestinationControls} from './destination-controls.mjs';
import {createAtlasTour} from './atlas-tour.mjs';
import {createInstanceDetailBudget} from './instance-detail-budget.mjs';
let instanceBudget;
import {mountMapLayers} from './map-layers.mjs';
import {travelPlaces} from './travel-data.mjs';
import {mappedIslandHotels} from './island-hotels.mjs';
let atlasTour,mapLayers,preferredTourScope='context',tourCatalog=[],overview;
import {animateWater,createMarineLife} from './marine-life.mjs';
import {createIslandTerrain} from './island-terrain.mjs';
import {smoothMainlandGround} from './mainland-ground.mjs';
import {createMainlandContext} from './mainland-context.mjs';
import {mountOverviewCatalog} from './overview-catalog.mjs';
import {islandTourOrder} from './travel-tour.mjs';
let mainlandContext;
const $=id=>document.getElementById(id),mobile=()=>innerWidth<=650,reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=THREE.MathUtils.clamp,V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const places=regions.map(p=>({...p,id:p.en,top:.24,pin:true,major:true,zoom:5,description:'点击地图探索厦门，位置为游览参考点。'}));
let data,renderer,scene,camera,controls,terrainMesh,waterMesh,buildings,trees,sun,hemisphere,floor,base,roadMesh,nightWindows,borderLines,starField;
let animation=null,runningTour=false,tourIndex=0,shotStart=0,lastTime=0,mode='day',flatView=false,labelsVisible=true,selected=-1,stopped=false;
let shadowStamp=0,shadowZoom=0;const shadowTarget=V();
let worldBounds,width,depth,sceneReady=false,toastTimer,targetHalfHeight=20.5,activeViewIndex,livingWorld;
const labels=[],animatedBoats=[],landmarkMaterials=[],buildingTiles=[],materials={},waterIndex=new Map();
const nightGroup=new THREE.Group(),landmarkGroup=new THREE.Group(),dummy=new THREE.Object3D(),color=new THREE.Color();
let seed=617;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const landscapeColor=()=>[.43,.6,.46],applyMeadowSurface=()=>{};
const coreCities=['鼓浪屿','集美学村','海沧湾','黄厝海滩'];
const placeZoom=(p,h)=>h/Math.max(p.minHalfHeight??.48,(mobile()?(p.mobileSceneRadius??p.sceneRadius??.7):(p.sceneRadius??.7))*(mobile()?2.6:1.5));
let experience,livingSky,travel,scenePaused=false,simulationTime=0,previousFrame=0,travelView=null,coastData,coastCoverage,campusData,campusCoverage,campusTerrain,gardenData,gardenCoverage,gardenTerrain,gardenWorld,gardenSelect,gardenStop=null,eastshoreData,eastshoreCoverage,eastshoreTerrain;
let northshoreData,northshoreWorld,northshoreSelect,northshoreStop=null,northshoreCoverages=[],northshoreTerrains=[];
let campusPoints=[],campusSelect,campusStop=null,destinationControls,tourStops=[],tourScope='全市巡游',marineLife,waterAnimation,islandTerrain;
const northshoreCovers=(x,z)=>northshoreCoverages.some(c=>c.covers(x,z));
function material(name, hex, extra={}) { const m=new THREE.MeshStandardMaterial({color:hex,roughness:.83,metalness:0,...extra});materials[name]=m;return m; }

function toWorld(lon,lat){return[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz];}

function heightAt(x,z){
 if(islandTerrain?.covers(x,z))return islandTerrain.heightAt(x,z);
 const north=northshoreCoverages.findIndex(c=>c.covers(x,z));if(north>=0&&northshoreTerrains[north])return northshoreTerrains[north].heightAt(x,z);
 return eastshoreCoverage?.covers(x,z)&&eastshoreTerrain?eastshoreTerrain.heightAt(x,z):gardenCoverage?.covers(x,z)&&gardenTerrain?gardenTerrain.heightAt(x,z):campusTerrain?campusTerrain.heightAt(x,z):baseHeightAt(x,z);
}
function baseHeightAt(x,z){
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
  if(i<t.nx&&j<t.nz&&!islandTerrain?.coversCell(x,z,width/t.nx,depth/t.nz)&&!coastCoverage?.covers(x+width/t.nx/2,z+depth/t.nz/2)&&!campusCoverage?.covers(x+width/t.nx/2,z+depth/t.nz/2)&&!gardenCoverage?.covers(x+width/t.nx/2,z+depth/t.nz/2)&&!eastshoreCoverage?.covers(x+width/t.nx/2,z+depth/t.nz/2)&&!northshoreCovers(x+width/t.nx/2,z+depth/t.nz/2)){const k=j*(t.nx+1)+i;indices.push(k,k+t.nx+1,k+1,k+1,k+t.nx+1,k+t.nx+2);}
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

function indexWater(){
 waterIndex.clear();
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

function addMesh(parent,geo,mat,pos=[0,0,0],scale=null){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}

function block(g,mat,x,y,z,w,h,d){return addMesh(g,new THREE.BoxGeometry(w,h,d),mat,[x,y+h/2,z]);}

function cylinder(g,mat,r1,r2,h,y,x=0,z=0){return addMesh(g,new THREE.CylinderGeometry(r1,r2,h,24),mat,[x,y+h/2,z]);}

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
   const dx=.12+random()*.8,dz=(random()-.5)*.5;if([0,.25,.5,.75,1].some(t=>waterAt(x+dx*t,z+dz*t)===null||coastCoverage?.covers(x+dx*t,z+dz*t)||campusCoverage?.covers(x+dx*t,z+dz*t)||gardenCoverage?.covers(x+dx*t,z+dz*t)||eastshoreCoverage?.covers(x+dx*t,z+dz*t)||northshoreCovers(x+dx*t,z+dz*t)))continue;
   const g=new THREE.Group();addMesh(g,new THREE.BoxGeometry(.08,.022,.03),mat,[0,.018,0]);addMesh(g,new THREE.BoxGeometry(.04,.02,.026),mat,[-.006,.039,0]);
   const wake=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(-.04,.008,0),V(-.16,.008,.032),V(-.08,.008,0),V(-.16,.008,-.032)]),wakeMat);g.add(wake);g.rotation.y=-Math.atan2(dz,dx);g.userData.atlasLayer='boats';scene.add(g);animatedBoats.push({mesh:g,x,z,y,dx,dz,offset:random()});break;
  }
 }
}

function buildStars(){
 const pts=[];for(let i=0;i<550;i++){const a=random()*Math.PI*2,p=.15+random()*1.2,r=110;pts.push(Math.cos(a)*Math.sin(p)*r,Math.cos(p)*r,Math.sin(a)*Math.sin(p)*r);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));starField=new THREE.Points(g,new THREE.PointsMaterial({color:'#cfe1ed',size:1.3,sizeAttenuation:false,transparent:true,opacity:.6}));starField.visible=false;scene.add(starField);
}


function resize(){
 const aspect=innerWidth/innerHeight;targetHalfHeight=(mobile()?Math.max(24,30/aspect):Math.max(24,34/aspect))*Math.max(width/47,depth/45);
 camera.left=-targetHalfHeight*aspect;camera.right=targetHalfHeight*aspect;camera.top=targetHalfHeight;camera.bottom=-targetHalfHeight;
 camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
 if(sceneReady&&travelView&&!document.querySelector('.travel-drawer')?.hidden){focusTravel(travelView.ll,travelView.radius,0);return;}
 if(sceneReady&&places[selected]){
  if(selected===6&&gardenStop){focusGardenStop(gardenStop.name,0,runningTour);return;}
  if(northshoreStop){focusNorthshoreStop(northshoreStop.name,0,runningTour);return;}
  if(campusStop){focusCampusStop(campusStop.name,0,runningTour);return;}
  const original=places[selected],view=original.views?.[activeViewIndex??original.defaultView??0],p=view?{...original,...view}:original;
  if(animation){controls.target.copy(animation.toTarget);camera.position.copy(animation.toPosition);animation=null;}
  camera.zoom=placeZoom(p,targetHalfHeight,aspect,mobile());camera.updateProjectionMatrix();controls.update();
 }
}

function tweenTo(target,zoom,offset=V(34,39,46).multiplyScalar(Math.max(width/47,depth/45)),duration=2200){
 animation={start:performance.now(),duration:reducedMotion?0:duration,fromTarget:controls.target.clone(),toTarget:target,fromPosition:camera.position.clone(),toPosition:target.clone().add(offset),fromZoom:camera.zoom,toZoom:zoom};
}

function focusTravel(ll,radius,duration=700,touring=false){
 document.body.classList.remove('atlas-overview');
 travelView={ll:[...ll],radius};if(!touring)stopTour(false);
 const [x,z]=toWorld(...ll),target=V(x,Math.max(heightAt(x,z),waterAt(x,z)??-1),z),direction=flatView?V(0,10,.0001):V(5,6,8);
 const panel=document.querySelector('.travel-drawer'),rect=panel?.hidden?null:panel?.getBoundingClientRect();
 const availableHeight=mobile()&&rect?Math.max(130,rect.top-165):innerHeight-270;
 const zoom=clamp(targetHalfHeight/Math.max(.06,radius)*availableHeight/innerHeight,1,500),units=2*targetHalfHeight/zoom/innerHeight;
 const desiredX=rect&&!mobile()?(rect.right+innerWidth-25)/2:innerWidth/2,desiredY=rect&&mobile()?(155+rect.top)/2:innerHeight/2;
 const right=V(direction.z,0,-direction.x).normalize(),up=direction.clone().normalize().cross(right).normalize();
 target.addScaledVector(right,-(desiredX-innerWidth/2)*units).addScaledVector(up,(desiredY-innerHeight/2)*units);
 tweenTo(target,zoom,direction,duration);
}

function resetView(){
 travelView=null;stopTour();selected=-1;campusStop=null;gardenStop=null;northshoreStop=null;flatView=false;updateViewButton();updateSelection();
 tweenTo(V(0,.1,0),1,V(34,39,46).multiplyScalar(Math.max(width/47,depth/45)));
 setLocation('厦门，一览山海','A REGION IN MINIATURE',`已收录${tourCatalog.length}处游览节点，鼓浪屿${tourCatalog.filter(p=>p.island).length}处`,data.meta.origin,'XIAMEN');$('district').value='';
}

function setLocation(name,en,desc,ll,index='XIAMEN'){document.body.classList.toggle('atlas-overview',index==='XIAMEN');$('location-name').textContent=name;$('location-en').textContent=en.toUpperCase();$('location-description').textContent=desc;$('location-index').textContent=index;$('location-coordinates').textContent=`${ll[1].toFixed(4)}° N   ${ll[0].toFixed(4)}° E`;}

function destinationScope(){return preferredTourScope==='island'?'岛内巡游':preferredTourScope==='all'?'全市巡游':selected===4?'校园巡游':selected===6?'园内巡游':selected===10?'学村巡游':selected===11?'海湾巡游':'全市巡游';}
function syncDestination(){
 const s=atlasTour?.getState()||{running:false,total:0};runningTour=s.running;
 const label=runningTour?'暂停巡游':s.total&&!s.ended?'继续巡游':'自动巡游';
 if($('tour-text').textContent!==label){$('tour-text').textContent=label;$('tour').setAttribute('aria-pressed',String(runningTour));$('play-icon').innerHTML=runningTour?'<path d="M8 5h2v14H8zM16 5h2v14h-2z"/>':'<path d="m9 5 11 7-11 7Z"/>';}
 destinationControls?.sync({...s,scope:s.total?tourScope:destinationScope(),suspended:scenePaused||!!document.querySelector('dialog[open]')});
 travel?.syncTour();
 $('tour-progress').style.width=(s.total?s.elapsed/(s.seconds*10):0)+'%';
}
function stopTour(includeTravel=true){if(includeTravel)travel?.closeForTour(false);atlasTour?.cancel();runningTour=false;syncDestination();}

function prepareTour(){
 tourScope=destinationScope();
 const local=preferredTourScope==='context'?(selected===4?campusPoints:selected===6?gardenWorld.stops:[10,11].includes(selected)?northshoreWorld.stops.filter(p=>p.region===(selected===10?'jimei':'haicang')):null):null;
 const catalog=tourCatalog.filter(p=>preferredTourScope!=='island'||p.island),currentName=$('location-name').textContent,start=catalog.find(p=>p.name===currentName)?.id||'sanqiutian';
 tourStops=local?local.map(p=>({place:selected,stop:p.name})):islandTourOrder(catalog,start).map(id=>({catalog:catalog.find(p=>p.id===id)}));
 const current=campusStop||gardenStop||northshoreStop;tourIndex=local?Math.max(0,tourStops.findIndex(p=>p.stop===current?.name)):0;
}
function visitTourStop(){const p=tourStops[tourIndex];if(p.catalog){if(!p.catalog.travel)travel?.closeForTour(false);p.catalog.visit(true);}else if(p.travel){travel.showPlace(p.travel,true);}else if(p.stop){travel?.closeForTour(false);if(p.place===4)focusCampusStop(p.stop,1100,true);else if(p.place===6)focusGardenStop(p.stop,1100,true);else focusNorthshoreStop(p.stop,1100,true);}else{travel?.closeForTour(false);focusPlace(p.place,true);}shotStart=performance.now();syncDestination();}
function stepTour(direction){if(!atlasTour.getState().total){prepareTour();atlasTour.start(tourStops.map((_,i)=>i),tourIndex);atlasTour.pause();}atlasTour.step(direction);}
function startTour(){if(atlasTour.getState().total)atlasTour.resume();else{travel?.closeForTour(false);prepareTour();atlasTour.start(tourStops.map((_,i)=>i),tourIndex);}closeExplore();}
function toggleTour(){if(runningTour)atlasTour.pause();else startTour();}

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
 for(const b of document.querySelectorAll('[data-time-choice]'))b.onclick=()=>{setTime(b.dataset.timeChoice);livingSky?.manual?.(b.dataset.timeChoice);};
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
function buildSurface(){
 indexWater();waterMesh=polygonMesh(data.water,material('water','#3d94b0',{roughness:.6,metalness:.10,side:THREE.DoubleSide}),true);
 const roads=[],rails=[],pave=terrainPaving(data.terrain,heightAt),bridgePave=terrainPaving(data.terrain,(x,z)=>Math.max(heightAt(x,z)+.006,(waterAt(x,z)??-Infinity)+.016)),sizes={motorway:.012,trunk:.011,primary:.01,secondary:.008,tertiary:.006,rail:.004},detailBounds=oldTownWorldBounds(data.meta);
 for(const [cls,bridge,path] of data.roads)for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dest=cls==='rail'?rails:roads;
  if(!bridge){
   const ranges=cls==='rail'?[[0,1]]:outsideIntervals(a,b,[detailBounds,coastData.bounds,campusData.bounds,gardenData.bounds,eastshoreData.bounds,...northshoreData.regions.map(r=>r.bounds)],clipSegmentToBounds);
   const at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
   for(const [start,end] of ranges)pave(dest,at(start),at(end),sizes[cls]*2,{offset:.0012,endOffset:.0012});
   continue;
  }
  const ranges=outsideIntervals(a,b,[coastData.bounds,campusData.bounds,gardenData.bounds,eastshoreData.bounds,...northshoreData.regions.map(r=>r.bounds)],clipSegmentToBounds);
  for(const [start,end] of ranges){
  const at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],aa=at(start),bb=at(end);
  // Clip the deck against the terrain grid; a single endpoint quad can cut through hills.
  bridgePave(dest,aa,bb,sizes[cls]*2,{offset:0});
  }
 }
 const fineBounds=[detailBounds,coastData.bounds,campusData.bounds,gardenData.bounds,eastshoreData.bounds,...northshoreData.regions.map(r=>r.bounds)],joints=new Map();
 const acceptsJoint=(x,z)=>inBounds(x,z)&&waterAt(x,z)===null&&!fineBounds.some(b=>x>=b[0]&&x<=b[2]&&z>=b[1]&&z<=b[3]);
 for(const [cls,bridge,path] of data.roads){if(bridge||cls==='rail'||!sizes[cls])continue;for(const point of path){if(!acceptsJoint(...point))continue;const key=point.map(v=>v.toFixed(6)).join(','),previous=joints.get(key);if(!previous||previous.radius<sizes[cls])joints.set(key,{point,radius:sizes[cls]});}}
 for(const joint of joints.values())roads.push(...terrainRoadJoint(data.terrain,heightAt,joint.point,joint.radius,{offset:.0012,accept:acceptsJoint}));
 for(const [pts,name,hex] of [[roads,'road','#596b6b'],[rails,'rail','#becab0']]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.computeVertexNormals();const m=new THREE.Mesh(g,material(name,hex,{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));m.receiveShadow=true;scene.add(m);}
}
function buildBuildings(){
 const rows=data.buildings.filter(b=>inBounds(b[0],b[1])&&waterAt(b[0],b[1])===null&&!coastCoverage.covers(b[0],b[1])&&!campusCoverage.covers(b[0],b[1])&&!gardenCoverage.covers(b[0],b[1])&&!eastshoreCoverage.covers(b[0],b[1])&&!northshoreCovers(b[0],b[1])&&!data.mainlandBuildings.some(r=>b[0]>=r.bounds[0]&&b[0]<=r.bounds[2]&&b[1]>=r.bounds[1]&&b[1]<=r.bounds[3]));
 buildings=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material('buildings','#ffffff'),rows.length);buildings.castShadow=true;buildings.receiveShadow=true;
 const lights=[];
 rows.forEach(([x,z,w,d,a,h],i)=>{const high=h*.0017;dummy.position.set(x,heightAt(x,z)+high/2,z);dummy.rotation.set(0,-a,0);dummy.scale.set(w,high,d);dummy.updateMatrix();buildings.setMatrixAt(i,dummy.matrix);buildings.setColorAt(i,color.set(h>60?'#acc7c9':h>20?'#c6d4cc':'#deded0'));if(h>20&&i%3===0)lights.push(x,heightAt(x,z)+high*.8,z);});
 buildings.computeBoundingSphere();scene.add(buildings);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lights,3));nightWindows=new THREE.Points(g,new THREE.PointsMaterial({size:1.7,sizeAttenuation:false,color:'#ffc77c'}));nightGroup.add(nightWindows);scene.add(nightGroup);
}
function buildLandmarks(){
 const ivory=material('ivory','#eee5d0'),roof=material('roof','#a66048'),glass=material('glass','#87bac4',{metalness:.3,roughness:.3});
 materials.ivory=ivory;materials.roof=roof;materials.glass=glass;landmarkMaterials.push(ivory,roof,glass);
 scene.add(landmarkGroup);
}
function setTime(time){
 if(!scene||!['morning','day','sunset','night'].includes(time))return;mode=time;document.body.dataset.time=time==='morning'?'day':time;
 for(const b of document.querySelectorAll('[data-time-choice]')){const on=b.dataset.timeChoice===time;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}
}
function updateSelection(){for(let i=0;i<places.length;i++){places[i].button.classList.toggle('selected',i===selected);places[i].label.classList.toggle('selected',i===selected);}if(campusSelect)campusSelect.hidden=selected!==4;if(gardenSelect)gardenSelect.hidden=selected!==6;if(northshoreSelect){northshoreSelect.hidden=selected!==10&&selected!==11;const region=selected===10?'jimei':'haicang';for(const option of northshoreSelect.options)option.hidden=!!option.value&&option.dataset.region!==region;}syncDestination();}
function focusPlace(i,touring=false){if(!places[i])return;gardenStop=null;northshoreStop=null;campusStop=null;if(campusSelect)campusSelect.value='';if(gardenSelect)gardenSelect.value='';if(northshoreSelect)northshoreSelect.value='';travelView=null;if(!touring){stopTour();experience?.recordPlace(i);}selected=i;flatView=false;updateViewButton();const p=places[i],x=p.sceneX??p.x,z=p.sceneZ??p.z;tweenTo(V(x,heightAt(x,z),z),placeZoom(p,targetHalfHeight),V(...(p.viewDirection??[5,6,8])),1500);setLocation(p.name,p.en,p.description,p.ll,String(i+1).padStart(2,'0'));updateSelection();$('district').value=String(i);closeExplore();}
function focusCityLife(i=selected){
 const view=livingWorld?.cityViews[i];if(!view)return false;
 stopTour();travel?.closeForTour(false);travelView=null;selected=i;campusStop=null;gardenStop=null;northshoreStop=null;flatView=false;updateViewButton();
 tweenTo(V(view.x,heightAt(view.x,view.z),view.z),targetHalfHeight/(mobile()?.16:.085),V(3,5,7),900);
 setLocation(places[i].name+' · '+view.theme,'CITY LIFE',view.foods.join(' · ')+' · 示意街景',places[i].ll,String(i+1).padStart(2,'0'));updateSelection();$('district').value=String(i);closeExplore();return true;
}
function focusGardenStop(name,duration=1000,touring=false){
 const stop=gardenWorld.stops.find(p=>p.name===name);if(!stop){focusPlace(6);return;}
 gardenStop=stop;northshoreStop=null;campusStop=null;selected=6;travelView=null;if(!touring)stopTour();flatView=false;updateViewButton();updateSelection();gardenSelect.value=name;$('district').value='6';closeExplore();
 const [x,z]=stop.point,p={sceneRadius:stop.radius,mobileSceneRadius:stop.radius*.55,minHalfHeight:.12};
 tweenTo(V(x,Math.max(heightAt(x,z),waterAt(x,z)??-1),z),placeZoom(p,targetHalfHeight),V(3,7,8),duration);
 setLocation(name,'BOTANICAL GARDEN',stop.description,stop.ll,'07');
}
function buildGardenExplorer(){
 gardenSelect=document.createElement('select');gardenSelect.id='garden-stops';gardenSelect.setAttribute('aria-label','植物园园内地点');gardenSelect.hidden=true;
 const overview=document.createElement('option');overview.value='';overview.textContent='植物园全景';gardenSelect.append(overview);
 for(const stop of gardenWorld.stops){
  const option=document.createElement('option');option.value=stop.name;option.textContent=stop.name;gardenSelect.append(option);
  const el=document.createElement('button');el.className='map-label garden-label';el.textContent=stop.name;el.setAttribute('aria-label','植物园：'+stop.name);el.onclick=()=>focusGardenStop(stop.name);$('labels').append(el);
  labelSizes.set(el,[el.offsetWidth,el.offsetHeight]);
  labels.push({p:{name:stop.name,garden:true},el,pos:V(stop.point[0],Math.max(heightAt(...stop.point),waterAt(...stop.point)??-1)+.025,stop.point[1])});
 }
 gardenSelect.onchange=()=>focusGardenStop(gardenSelect.value);$('location-card').append(gardenSelect);
}
const projected=new THREE.Vector3();
function focusNorthshoreStop(name,duration=1000,touring=false){
 const stop=northshoreWorld.stops.find(p=>p.name===name);if(!stop){focusPlace(selected);return;}
 northshoreStop=stop;gardenStop=null;campusStop=null;selected=stop.region==='jimei'?10:11;travelView=null;if(!touring)stopTour();flatView=false;updateViewButton();updateSelection();northshoreSelect.value=name;$('district').value=String(selected);closeExplore();
 const [x,z]=stop.point,p={sceneRadius:stop.radius,mobileSceneRadius:stop.radius*.55,minHalfHeight:.12};
 tweenTo(V(x,Math.max(heightAt(x,z),waterAt(x,z)??-1),z),placeZoom(p,targetHalfHeight),V(2,6,8),duration);setLocation(name,stop.region==='jimei'?'JIMEI SCHOOL TOWN':'HAICANG BAY',stop.description,stop.ll,String(selected+1));
}
function buildNorthshoreExplorer(){
 northshoreSelect=document.createElement('select');northshoreSelect.id='northshore-stops';northshoreSelect.setAttribute('aria-label','集美与海沧详细地点');northshoreSelect.hidden=true;const overview=document.createElement('option');overview.value='';overview.textContent='片区总览';northshoreSelect.append(overview);
 for(const stop of northshoreWorld.stops){const option=document.createElement('option');option.value=stop.name;option.textContent=stop.name;option.dataset.region=stop.region;northshoreSelect.append(option);const el=document.createElement('button');el.className='map-label garden-label';el.textContent=stop.name;el.setAttribute('aria-label',stop.name+'，查看细节');el.onclick=()=>focusNorthshoreStop(stop.name);$('labels').append(el);labels.push({p:{name:stop.name,northshore:stop.region},el,pos:V(stop.point[0],Math.max(heightAt(...stop.point),waterAt(...stop.point)??-1)+.025,stop.point[1])});}
 northshoreSelect.onchange=()=>focusNorthshoreStop(northshoreSelect.value);$('location-card').append(northshoreSelect);
}
const labelSizes=new WeakMap();
function focusCampusStop(name,duration=1100,touring=false){
 const stop=campusPoints.find(p=>p.name===name);if(!stop){focusPlace(4);return;}
 campusStop=stop;gardenStop=null;northshoreStop=null;selected=4;travelView=null;if(!touring)stopTour();flatView=false;updateViewButton();updateSelection();campusSelect.value=name;$('district').value='4';closeExplore();
 const [x,z]=stop.point,p={sceneRadius:stop.radius,mobileSceneRadius:stop.radius*.55,minHalfHeight:.10};
 tweenTo(V(x,Math.max(heightAt(x,z),waterAt(x,z)??-1),z),placeZoom(p,targetHalfHeight),V(1,5,8),duration);
 setLocation(name,'XIAMEN UNIVERSITY',stop.description,stop.ll,'05');
}
function buildCampusExplorer(){
 campusPoints=campusStops(campusData,toWorld);campusSelect=document.createElement('select');campusSelect.id='campus-stops';campusSelect.setAttribute('aria-label','厦门大学校园地点');campusSelect.hidden=true;
 campusSelect.add(new Option('厦门大学全景',''));
 for(const stop of campusPoints){campusSelect.add(new Option(stop.name,stop.name));const el=document.createElement('button');el.className='map-label garden-label';el.textContent=stop.name;el.setAttribute('aria-label','厦门大学：'+stop.name);el.onclick=()=>focusCampusStop(stop.name);$('labels').append(el);labels.push({p:{name:stop.name,campus:true},el,pos:V(stop.point[0],Math.max(heightAt(...stop.point),waterAt(...stop.point)??-1)+.026,stop.point[1])});}
 campusSelect.onchange=()=>focusCampusStop(campusSelect.value);$('location-card').append(campusSelect);
}
function updateLabels(){
 if(overview){for(const {el} of labels)el.hidden=true;overview.update();return;}
 const occupied=[],blockers=[4,6,10,11].includes(selected)?[...document.querySelectorAll('.brand,.top-actions,.scene-settings,.scene-tools,.sky-options,.explore,.location-card,.bottom-center,.map-controls,.travel-launch,.travel-drawer,footer')].map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height).map(r=>[r.left,r.top,r.right,r.bottom]):[];
 const intersects=(r,o)=>r[0]<o[2]+8&&r[2]>o[0]-8&&r[1]<o[3]+6&&r[3]>o[1]-6;
 const priority=p=>(p.campus&&p.name===campusStop?.name)||(p.garden&&p.name===gardenStop?.name)||(p.northshore&&p.name===northshoreStop?.name)?2:p===places[selected]?1:0;
 for(const {p,el,pos} of [...labels].sort((a,b)=>priority(b.p)-priority(a.p))){
  if((p.campus&&selected!==4)||(p===places[4]&&campusStop)||(p.garden&&selected!==6)||(p===places[6]&&gardenStop)||(p.northshore&&selected!==(p.northshore==='jimei'?10:11))||([places[10],places[11]].includes(p)&&northshoreStop)){el.hidden=true;continue;}
  if(!labelSizes.has(el)&&el.offsetWidth)labelSizes.set(el,[el.offsetWidth,el.offsetHeight]);
  const [w,h]=labelSizes.get(el)||[85,30];
  projected.copy(pos).project(camera);
  const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight,r=[x-w/2,y-h,x+w/2,y];
  const collision=occupied.some(o=>intersects(r,o)),blocked=(p.campus||p.garden||p.northshore||[places[4],places[6],places[10],places[11]].includes(p))&&blockers.some(o=>intersects(r,o));
  if(p.campus)el.classList.toggle('selected',p.name===campusStop?.name);
  if(p.garden)el.classList.toggle('selected',p.name===gardenStop?.name);
  if(p.northshore)el.classList.toggle('selected',p.name===northshoreStop?.name);
  el.hidden=!labelsVisible||r[0]<0||r[2]>innerWidth||r[1]<0||r[3]>innerHeight||projected.z>1||blocked||(collision&&priority(p)===0);
  if(!el.hidden){el.style.left=x+'px';el.style.top=y+'px';occupied.push(r);}
 }
}
document.addEventListener('visibilitychange',()=>{previousFrame=0;});
function animate(now){requestAnimationFrame(animate);const frameMs=previousFrame?Math.min(1000,now-previousFrame):0,delta=Math.min(100,frameMs);previousFrame=now;if(document.hidden||!sceneReady)return;scenePaused=!!livingSky?.paused;if(!scenePaused)simulationTime+=delta;livingSky?.update(delta/1000);
 if(animation){const a=animation,t=a.duration?clamp((now-a.start)/a.duration,0,1):1,e=t*t*(3-2*t);controls.target.lerpVectors(a.fromTarget,a.toTarget,e);camera.position.lerpVectors(a.fromPosition,a.toPosition,e);camera.zoom=THREE.MathUtils.lerp(a.fromZoom,a.toZoom,e);camera.updateProjectionMatrix();if(t===1)animation=null;}
 if(runningTour&&scenePaused)shotStart+=delta;
 atlasTour?.tick(frameMs,scenePaused||!!document.querySelector('dialog[open]'));syncDestination();
 if(!scenePaused)for(const a of animatedBoats){const t=(simulationTime*.000022+a.offset)%1;a.mesh.position.set(a.x+a.dx*t,a.y+.012,a.z+a.dz*t);}
 if(!scenePaused){livingWorld?.update(delta/1000,controls.target);marineLife?.update(delta/1000);waterAnimation?.update(delta/1000);}
 controls.update();fitSunShadow({sun,camera,target:controls.target,worldSpan:Math.max(width,depth)});const quality=livingSky?.getState().quality;
 renderer.shadowMap.needsUpdate ||= quality==='high'||now-shadowStamp>250||Math.abs(camera.zoom-shadowZoom)>.3||controls.target.distanceToSquared(shadowTarget)>.0004;
 if(renderer.shadowMap.needsUpdate){shadowStamp=now;shadowZoom=camera.zoom;shadowTarget.copy(controls.target);}
 instanceBudget?.update(camera,innerHeight,quality);updateLabels();travel?.update();renderer.render(scene,camera);
}
async function init(){
 const backgroundResponse=await fetch('/data/mainland-buildings.json');if(!backgroundResponse.ok)throw new Error('城区建筑轮廓缺失');const background=await backgroundResponse.json();
 const [r,b,islandResponse,oldTownResponse,coastResponse,campusResponse,gardenResponse,eastshoreResponse,northshoreResponse]=await Promise.all([fetch('/data/xiamen.json'),fetch('/data/buildings.bin'),fetch('/data/island-detail.json'),fetch('/data/oldtown-detail.json'),fetch('/data/coast-detail.json'),fetch('/data/campus-detail.json'),fetch('/data/garden-detail.json'),fetch('/data/eastshore-detail.json'),fetch('/data/northshore-detail.json')]);if(!r.ok||!b.ok||!islandResponse.ok||!oldTownResponse.ok||!coastResponse.ok||!campusResponse.ok||!gardenResponse.ok||!eastshoreResponse.ok||!northshoreResponse.ok)throw new Error('地图数据缺失');data=await r.json();const islandData=await islandResponse.json(),oldTownData=await oldTownResponse.json(),a=new Float32Array(await b.arrayBuffer());if(a.length!==data.meta.buildingCount*6)throw new Error('建筑数据不完整');data.buildings=Array.from({length:data.meta.buildingCount},(_,i)=>Array.from(a.subarray(i*6,i*6+6)));
 coastData=await coastResponse.json();coastCoverage=createCoastCoverage(coastData);
 data.mainlandBuildings=background.buildings;
 data.mainlandCovers=background.covers||[];
 data.roads=background.roads;
 const oldBounds=oldTownWorldBounds(data.meta);for(const b of background.buildings){const [left,top,right,bottom]=b.bounds,x=(left+right)/2,z=(top+bottom)/2;if(x>oldBounds[0]&&x<oldBounds[2]&&z>oldBounds[1]&&z<oldBounds[3])data.buildings.push([x,z,right-left,bottom-top,0,b.height]);}
 campusData=await campusResponse.json();campusCoverage=createCoastCoverage({...campusData,water:campusData.water.map(w=>w.rings)});
 gardenData=await gardenResponse.json();gardenCoverage=createCoastCoverage({...gardenData,water:gardenData.water.map(w=>w.rings)});
 eastshoreData=await eastshoreResponse.json();eastshoreCoverage=createCoastCoverage({...eastshoreData,water:eastshoreData.water.map(w=>w.rings)});
 northshoreData=await northshoreResponse.json();northshoreCoverages=northshoreData.regions.map(r=>createCoastCoverage({...r,water:r.water.map(w=>w.rings)}));
 data.cityBuildings=[coastData,campusData,gardenData,eastshoreData,...northshoreData.regions].flatMap(d=>d.buildings||[]);
 data.cityCovers=[campusData,gardenData,eastshoreData,...northshoreData.regions].flatMap(d=>d.covers||[]);
 data.cityPaths=[coastData,campusData,gardenData,eastshoreData,...northshoreData.regions].flatMap(d=>d.paths||[]);
 for(const replacement of coastData.replacements)data.water[replacement.index]=replacement.rings;
 for(const replacement of campusData.replacements)data.water[replacement.index]=replacement.rings;
 for(const replacement of gardenData.replacements)data.water[replacement.index]=replacement.rings;
 for(const replacement of eastshoreData.replacements)data.water[replacement.index]=replacement.rings;
 for(const r of northshoreData.regions)for(const replacement of r.replacements)data.water[replacement.index]=replacement.rings;
 for(const polygon of coastData.water){data.water.push(polygon);data.waterHeights.push(0);}
 for(const water of campusData.water){data.water.push(water.rings);data.waterHeights.push(water.height);}
 for(const water of gardenData.water){data.water.push(water.rings);data.waterHeights.push(water.height);}
 for(const water of eastshoreData.water){data.water.push(water.rings);data.waterHeights.push(water.height);}
 for(const r of northshoreData.regions)for(const water of r.water){data.water.push(water.rings);data.waterHeights.push(water.height);}
 places[2].ll=coastLocations.harbor;places[3].ll=coastLocations.deck;
 places[4].ll=campusLocations.university;places[5].ll=campusLocations.temple;
 const gardenPoint=gardenData.pois.find(p=>p.name==='厦门市园林植物园');if(gardenPoint)places[6].ll=gardenPoint.ll;
 Object.values(eastshoreLocations).forEach((ll,i)=>{places[7+i].ll=ll;});
 Object.values(northshoreLocations).forEach((ll,i)=>{places[10+i].ll=ll;});
 const refinedResponse=await fetch('/data/terrain-refined.json');if(refinedResponse.ok){const refined=await refinedResponse.json();if(refined.heights.length===(refined.nx+1)*(refined.nz+1)&&refined.heights.every(Number.isFinite))data.terrain=refined;}
 worldBounds=data.terrain.bounds;width=worldBounds[1][0]-worldBounds[0][0];depth=worldBounds[1][1]-worldBounds[0][1];for(const p of places)[p.x,p.z]=toWorld(...p.ll);
 indexWater();const mainlandGround=smoothMainlandGround(data.terrain,[[...worldBounds[0],...worldBounds[1]]],{isWater:(x,z)=>waterAt(x,z)!==null});data.terrain=mainlandGround.terrain;
 campusTerrain=createCampusTerrain(campusData,baseHeightAt);
 gardenTerrain=createCampusTerrain(gardenData,baseHeightAt);
 // Source shoreline takes precedence over coarse sea-level elevation samples.
 eastshoreTerrain=createCampusTerrain(eastshoreData,(x,z)=>Math.max(.016,baseHeightAt(x,z)),{cellSize:.014});
 northshoreTerrains=northshoreData.regions.map(r=>createCampusTerrain(r,(x,z)=>Math.max(.016,baseHeightAt(x,z)),{cellSize:.014}));
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('viewport').append(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color('#e6ede7');scene.fog=new THREE.Fog('#e6ede7',100,300);camera=new THREE.OrthographicCamera(-35,35,24,-24,.1,700);camera.position.copy(V(34,39,46).multiplyScalar(Math.max(width/47,depth/45)));controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.465;controls.minZoom=.65;controls.maxZoom=700;controls.screenSpacePanning=false;controls.addEventListener('start',()=>{animation=null;stopTour();});
 hemisphere=new THREE.HemisphereLight('#d8e7f2','#b5c4a3',2.1);scene.add(hemisphere);sun=new THREE.DirectionalLight('#fff2d6',3.1);sun.position.set(-18,35,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:100});sun.shadow.normalBias=.015;scene.add(sun);
 floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshStandardMaterial({color:'#e6ede7'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.94;floor.receiveShadow=true;scene.add(floor);
 islandTerrain=createIslandTerrain(islandData,baseHeightAt);
 buildTerrain();islandTerrain?.addTo(scene);buildSurface();buildBuildings();buildLandmarks();buildBorders();buildStars();
 mainlandContext=createMainlandContext({scene,data,heightAt,waterAt,toWorld,excluded:(x,z)=>islandTerrain.covers(x,z)||coastCoverage.covers(x,z)||campusCoverage.covers(x,z)||gardenCoverage.covers(x,z)||eastshoreCoverage.covers(x,z)||northshoreCovers(x,z)||(x>oldBounds[0]&&x<oldBounds[2]&&z>oldBounds[1]&&z<oldBounds[3])});
 marineLife=createMarineLife({scene,toWorld,waterAt});waterAnimation=animateWater(materials.water);
 const islandWorld=createIslandDetail({scene,data:{...data,terrain:islandTerrain?.terrain||data.terrain},detail:islandData,toWorld,heightAt,waterAt,reducedMotion:false});
 const oldTownWorld=createOldTownDetail({scene,data,detail:oldTownData,toWorld,heightAt,waterAt,reducedMotion:false});
 const coastWorld=createCoastDetail({scene,data,detail:coastData,toWorld,heightAt,reducedMotion:false});
 const campusWorld=createCampusDetail({scene,data,detail:campusData,toWorld,heightAt,waterAt,campusTerrain,reducedMotion:false});
 gardenWorld=createGardenDetail({scene,detail:gardenData,heightAt,waterAt,terrain:gardenTerrain,reducedMotion:false});
 const eastshoreWorld=createEastshoreDetail({scene,detail:eastshoreData,heightAt,waterAt,terrain:eastshoreTerrain,toWorld,reducedMotion:false});
 northshoreWorld=createNorthshoreDetail({scene,detail:northshoreData,terrains:northshoreTerrains,heightAt,waterAt,toWorld,reducedMotion:false});
 livingWorld=createLivingWorld({scene,data,places,heightAt,waterAt,reducedMotion,islandWorld,oldTownWorld,coastWorld,campusWorld,gardenWorld,eastshoreWorld,northshoreWorld});
 livingWorld.anchors.forEach((a,i)=>Object.assign(places[i],{sceneX:a.x,sceneZ:a.z,sceneRadius:a.radius,mobileSceneRadius:a.mobileSceneRadius,...(a.viewDirection?{viewDirection:a.viewDirection,minHalfHeight:a.minHalfHeight,top:-.09}:{})}));
 buildUI();
 buildGardenExplorer();
 buildNorthshoreExplorer();
 buildCampusExplorer();
 atlasTour=createAtlasTour({seconds:9,onVisit:index=>{tourIndex=index;visitTourStop();},onChange:syncDestination});
 const sharedTravelTour={
  start(list,current,scope='岛内巡游'){tourStops=list.map(id=>({travel:id}));tourScope=scope;atlasTour.start(list.map((_,i)=>i),Math.max(0,list.indexOf(current)));},
  getState(){const s=atlasTour.getState(),p=tourStops[s.current];return {...s,current:p?.travel||p?.catalog?.travel||null,scope:tourScope};},
  pause:()=>atlasTour.pause(),resume:()=>atlasTour.resume(),step:n=>atlasTour.step(n),speed:n=>atlasTour.speed(n)
 };
 travel=mountTravelExplorer({scene,camera,controls,toWorld,heightAt,waterAt,stopTour:()=>stopTour(false),focus:focusTravel,focusViews:{dongdu:mainlandContext.view},tour:sharedTravelTour,labelsVisible:()=>labelsVisible,onSelect:p=>{selected=-1;campusStop=null;gardenStop=null;northshoreStop=null;updateSelection();setLocation(p.name,p.kind,p.intro,p.ll,'');}});
 controls.addEventListener('start',()=>{travelView=null;});
 const extraPlaces=[
  ...campusPoints.map(p=>({...p,category:3,area:'厦门大学',select:()=>focusCampusStop(p.name)})),
  ...gardenWorld.stops.map(p=>({...p,category:3,area:'植物园',select:()=>focusGardenStop(p.name)})),
  ...northshoreWorld.stops.map(p=>({...p,category:3,area:p.region==='jimei'?'集美学村':'海沧湾',select:()=>focusNorthshoreStop(p.name)})),
  ...travelPlaces.map(p=>({...p,category:p.area==='ferry'?5:p.category==='coast'?1:2,select:()=>travel.showPlace(p.id)})),
  ...mappedIslandHotels.map(p=>({...p,category:4,area:'鼓浪屿住宿',select:()=>travel.showPlace(p.id)}))
 ];
 const candidates=[
  ...travelPlaces.map(p=>({...p,group:p.island?'鼓浪屿':p.area==='oldtown'?'中山路':'客运码头',travel:p.id,visit:touring=>travel.showPlace(p.id,touring)})),
  ...campusPoints.map(p=>({...p,id:'campus:'+p.name,group:'厦门大学',visit:touring=>focusCampusStop(p.name,1100,touring)})),
  ...gardenWorld.stops.map(p=>({...p,id:'garden:'+p.name,group:'植物园',visit:touring=>focusGardenStop(p.name,1100,touring)})),
  ...northshoreWorld.stops.map(p=>({...p,id:'north:'+p.name,group:p.region==='jimei'?'集美学村':'海沧湾',visit:touring=>focusNorthshoreStop(p.name,1100,touring)})),
  ...places.slice(1).map((p,i)=>({...p,id:'region:'+(i+1),group:'厦门沿岸',visit:touring=>focusPlace(i+1,touring)}))
 ];
 const unique=new Set();tourCatalog=candidates.filter(p=>{const key=p.name.replace(/[·\s（）()]/g,'');if(unique.has(key))return false;unique.add(key);return true;});
 overview=mountOverviewCatalog({catalog:tourCatalog,camera,toWorld,heightAt,waterAt,labelsVisible:()=>labelsVisible,selectedName:()=>$('location-name').textContent});
 experience=attachExperience({places,extraPlaces,getSelected:()=>selected,getGardenStop:()=>campusStop||gardenStop||northshoreStop,focusPlace,showAbout:()=>$('about').showModal(),stopTour,pauseTour:()=>atlasTour?.pause(),openTravel:area=>travel.open(area)});
 destinationControls=mountDestinationControls({previous:()=>stepTour(-1),next:()=>stepTour(1),toggle:toggleTour,speed:value=>atlasTour.speed(value),scope:value=>{preferredTourScope=value;stopTour();},recenter:()=>{if(campusStop)focusCampusStop(campusStop.name);else if(gardenStop)focusGardenStop(gardenStop.name);else if(northshoreStop)focusNorthshoreStop(northshoreStop.name);else if(selected>=0)focusPlace(selected);else resetView();}});
 const lifeButton=document.createElement('button');lifeButton.id='city-life-focus';lifeButton.type='button';lifeButton.className='city-life-focus';lifeButton.title='街区生活近景';lifeButton.append(createElement(Store),document.createTextNode('街区生活'));lifeButton.onclick=()=>focusCityLife(selected<0?1:selected);$('location-card').append(lifeButton);
 mapLayers=mountMapLayers(scene);
 instanceBudget=createInstanceDetailBudget(scene);
 livingSky=createLivingSky({scene,camera,sun,hemisphere,renderer,materials,floor,nightGroup,starField,landmarkMaterials,regionalEnvironment:livingWorld,setPeriod:setTime,reducedMotion});setTime('day');resize();controls.update();sceneReady=true;resetView();$('loading').hidden=true;window.addEventListener('resize',resize);requestAnimationFrame(animate);
 for(const label of labels){const p=label.p;if(p.sceneX!==undefined)label.pos.set(p.sceneX,heightAt(p.sceneX,p.sceneZ)+p.sceneRadius*.45,p.sceneZ);}
 const requestedTravel=new URLSearchParams(location.search);
 if(requestedTravel.has('hotel'))travel.showPlace(requestedTravel.get('hotel'));
 else if(requestedTravel.get('travel')==='hotels')travel.open('hotels');
 window.xiamenAtlas={getState:()=>{const world=livingWorld.getState();return {ready:sceneReady,buildings:buildings.count,roads:data.roads.length,water:data.water.length,trees:world.trees,people:world.people,cars:world.cars,world,detailBudget:{...instanceBudget?.stats},tour:atlasTour?.getState(),layers:mapLayers?.getState(),discovery:experience?.getDiscoveryState(),marine:marineLife?.getState(),waves:waterAnimation?.getState(),travel:travel.getState(),camera:{position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,travelView},selected:places[selected]?.name,time:mode,sky:livingSky?.getState(),paused:scenePaused,touring:runningTour,flat:flatView,labelsVisible,render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,shadowMap:renderer.shadowMap.enabled,lightCastsShadow:sun.castShadow,groundReceivesShadow:terrainMesh.receiveShadow}};}};
}
$('retry').onclick=()=>location.reload();init().catch(fail);
window.xiamenOverview=()=>overview?.getState();
window.xiamenCoverage=()=>({records:data?.mainlandBuildings?.length,covers:data?.mainlandCovers?.length,context:mainlandContext?.getState()});
window.xiamenCityLife=()=>livingWorld?.cityState();
window.xiamenCityAudit=()=>livingWorld?.cityAudit();
window.xiamenCityFocus=focusCityLife;




