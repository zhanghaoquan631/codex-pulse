import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source='https://seoul-3d-atlas.synabreu.chatgpt.site';
await fs.mkdir(path.join(root,'RECON'),{recursive:true});
await fs.mkdir(path.join(root,'public'),{recursive:true});
async function get(file){const response=await fetch(source+file,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`${file}: ${response.status}`);return response.text();}
async function cached(file,url){try{return await fs.readFile(path.join(root,file),'utf8');}catch{return get(url);}}
const [original,css,licenses]=await Promise.all([cached('RECON/reference-app.js','/app.js?v=1.3-hangang-1'),cached('RECON/reference-style.css','/style.css?v=1.3-hangang-1'),cached('public/REFERENCE-LICENSES.txt','/LICENSES.txt')]);
await fs.writeFile(path.join(root,'RECON/reference-app.js'),original);
await fs.writeFile(path.join(root,'RECON/reference-style.css'),css);
await fs.writeFile(path.join(root,'public/REFERENCE-LICENSES.txt'),licenses);
let code=original;
function replace(a,b){if(!code.includes(a))throw new Error('Reference changed: '+a.slice(0,100));code=code.replace(a,b);}
replace("import { OrbitControls } from './vendor/OrbitControls.js';","import { OrbitControls } from 'three/addons/controls/OrbitControls.js';\nimport regions from './regions.json';\nimport './style.css';");
replace("const ATLAS_VERSION = '1.3';","const ATLAS_VERSION = '5.0';");
replace("const ASSET_REVISION = '1.3-hangang-1';","const ASSET_REVISION = 'chaoshan-data-5';");
const start=code.indexOf('const places = ['),end=code.indexOf('\nconst materials = {};',start);
if(start<0||end<0)throw new Error('Place definition not found');
code=code.slice(0,start)+"const places = regions.map(p=>({...p,kind:'district',zoom:p.en===\"Nan'ao Island\"?5:11,top:.20,major:true,pin:true}));\n"+code.slice(end);
replace('/data/seoul.json?v=', '/data/chaoshan.json?v=');
replace("let worldBounds, width, depth, sceneReady", "let worldBounds, width, depth, sceneReady");
replace("targetHalfHeight=mobile()?Math.max(24,30/aspect):Math.max(24,34/aspect);","targetHalfHeight=(mobile()?Math.max(24,30/aspect):Math.max(24,34/aspect))*Math.max(width/47,depth/45);");
replace("clamp(p.zoom*(mobile()?targetHalfHeight/24:1),1,28)","clamp(p.zoom*(mobile()?1.4:1),1,28)");
replace("new THREE.Fog('#e6ede7',135,240)","new THREE.Fog('#e6ede7',260,650)");
replace("24,-24,.1,400)","24,-24,.1,700)");
// Coastal water is at sea level; the original beveled base rose above it.
replace('/2,-.73,','/2,-.86,');
replace("updateSelection();closeExplore();$('district').value='';", "updateSelection();closeExplore();$('district').value=String(i);");
code=code.replaceAll('V(34,39,46)', 'V(34,39,46).multiplyScalar(Math.max(width/47,depth/45))');
const lmStart=code.indexOf('function buildLandmarks(){'),lmEnd=code.indexOf('function buildBorders(){',lmStart);
code=code.slice(0,lmStart)+`function buildLandmarks(){
 material('ivory','#eee5d0');
 scene.add(landmarkGroup);
}
`+code.slice(lmEnd);
const uiStart=code.indexOf(' for(const d of [...data.districts]'),uiEnd=code.indexOf(" for(const b of document.querySelectorAll('[data-time-choice]'))",uiStart);
if(uiStart<0||uiEnd<0)throw new Error('Region dropdown not found');
code=code.slice(0,uiStart)+` for(let i=0;i<places.length;i++){const option=document.createElement('option');option.value=String(i);option.textContent=places[i].name;$('district').append(option);}
 $('district').onchange=e=>{if(e.target.value!=='')focusPlace(Number(e.target.value));};
`+code.slice(uiEnd);
replace('const x=-14+random()*29,z=-3+random()*10,y=waterAt(x,z);','const x=worldBounds[0][0]+random()*width,z=worldBounds[0][1]+random()*depth,y=waterAt(x,z);');
replace('const near=camera.zoom>2.5||p.major||p===places[selected];','const near=camera.zoom>2.5||p.major||p===places[selected];');
replace("window.seoulAtlas=", "window.chaoshanAtlas=");
replace('districts:data.districts.length','districts:places.length');
replace('landmarks:places.length','landmarks:landmarkGroup.children.length');
replace('version:ATLAS_VERSION,ready:sceneReady','version:ATLAS_VERSION,ready:sceneReady,source:data.meta.vectorSource,terrainSamples:data.terrain.heights.length,roadSegments:data.roads.length,waterPolygons:data.water.length');
replace("[126.978,37.5665],'SEOUL'", "data.meta.origin,'CHAOSHAN'");
const translations={
 '서울, 한눈에':'潮汕，一览山海','A CITY IN MINIATURE':'A REGION IN MINIATURE',
 '한강과 산, 그 사이에 펼쳐진 25개 자치구':'三市、山地与海岸，十二处地区入口',
 '자동 비행':'自动巡游','비행 멈춤':'停止巡游','입체 보기':'立体视图','평면 보기':'平面视图',
 '곳':'处',' 위치로 이동':'，前往此处','숨김':'隐藏','표시':'显示',
 '서울 한 바퀴를 마쳤습니다. 원하는 곳을 더 둘러보세요.':'潮汕巡游结束，可继续选择地点探索。',
 '이 브라우저에서는 기기를 가로로 돌려 넓게 볼 수 있습니다.':'此浏览器不支持全屏，可横置设备查看。',
 '전체 화면을 열 수 없습니다. 기기를 가로로 돌려 보세요.':'暂时无法打开全屏。',
 '지도를 불러오지 못했습니다. 연결을 확인하거나 최신 Safari·Chrome에서 다시 열어 주세요.':'地图暂时无法加载，请点击重新载入。',
 '한강과 서울의 거리를 잇는 중':'正在连接潮汕河流与道路','서울의 랜드마크를 세우는 중':'正在加载城市建筑与山林'
};
for(const [a,b] of Object.entries(translations))code=code.replaceAll(a,b);
code="import {landmarkPlaces,buildLocalLandmarks} from './landmarks.mjs';\nimport {attachFeatureUI} from './feature-ui.mjs';\nimport './features.css';\nlet localLandmarks,featureUI;\n"+code;
replace('const places = regions.map(', 'const places = [...landmarkPlaces,...regions.map(');
replace("major:true,pin:true}));", "major:true,pin:true}))];");
replace(" scene.add(landmarkGroup);", " localLandmarks=buildLocalLandmarks({parent:landmarkGroup,heightAt,waterAt,toWorld});\n scene.add(landmarkGroup);");
replace("mode=time;document.body.dataset.time=time;", "mode=time;document.body.dataset.time=time;localLandmarks?.setTime(time);");
replace("function updateSelection(){", "function updateSelection(){\n featureUI?.select(selected);");
replace('camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);','camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(sceneReady&&places[selected]?.kind===\'landmark\')focusPlace(selected);');
replace("featureUI?.select(selected);", "featureUI?.select(selected);frameSun();");
replace('renderer.toneMappingExposure=settings.exposure;', 'renderer.toneMappingExposure=settings.exposure;sun.userData.offset=V(...settings.pos);frameSun();');
code+=`\nfunction frameSun(){
 if(!sun)return;
 const p=places[selected],local=p?.kind==='landmark';
 const center=local?V(p.x,heightAt(p.x,p.z),p.z):V(0,0,0);
 sun.target.position.copy(center);sun.target.updateMatrixWorld();
 sun.position.copy(center).add(sun.userData.offset||V(-25,42,12));
 const extent=local?Math.max(p.span*1.2,1):25;
 Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent});
 sun.shadow.normalBias=local?.0008:.025;sun.shadow.camera.updateProjectionMatrix();
}\n`;
replace("clamp(p.zoom*(mobile()?1.4:1),1,28)", "p.kind==='landmark'?targetHalfHeight/Math.max(p.halfHeight,p.span/(innerWidth/innerHeight)*.60):clamp(p.zoom*(mobile()?1.4:1),1,28)");
replace("V(...(p.offset||[14,16,20]))", "V(...(p.kind==='landmark'?(p.id==='lighthouse'?[-4,3.5,4]:[3,4,5]):(p.offset||[14,16,20])))");
replace('controls.maxZoom=28','controls.maxZoom=700');
code=code.replaceAll('clamp(camera.zoom*1.35,.65,28)','clamp(camera.zoom*1.35,.65,700)').replaceAll('clamp(camera.zoom/1.35,.65,28)','clamp(camera.zoom/1.35,.65,700)');
replace("buildUI();setTime('day');", "buildUI();featureUI=attachFeatureUI({places,focusPlace,renderer,camera,landmarkGroup});setTime('day');");
replace('updateLabels();renderer.render(scene,camera);','localLandmarks?.update(now,reducedMotion);updateLabels();renderer.render(scene,camera);');
replace('districts:places.length','districts:regions.length');
replace('landmarks:landmarkGroup.children.length','landmarks:landmarkGroup.children.length,selected:places[selected]?.id||places[selected]?.name||null,modelMeshes:localLandmarks.models.map(m=>({id:m.spec.id,meshes:m.group.children.length})),zoom:camera.zoom');
code="import {buildTraffic,buildVegetation,buildLandmarkLife,mountainPlaces,buildRockfields} from './street-life.mjs';\nimport {buildRegionalLife} from './regional-life.mjs';\nimport {extendLandmarkLife} from './coastal-life.mjs';\nlet traffic,woodland,streetLife,rockfields,regionalLife;let lifeSeconds=0;\n"+code;
replace('const roadPositions=[],railPositions=[],carRoutes=[];', 'const roadPositions=[],railPositions=[],carRoutes=[],walkRoutes=[];');
replace("if(['motorway','trunk','primary'].includes(cls)&&route.length>3&&route.reduce((s,p,i)=>s+(i?p.distanceTo(route[i-1]):0),0)>.65)carRoutes.push(route);", "if(cls!=='rail'&&route.length>1){carRoutes.push(route);if(!bridge&&!['motorway','trunk'].includes(cls))walkRoutes.push(route);}");
const trafficStart=code.indexOf(' for(let i=0;i<Math.min(100,carRoutes.length);i++){'),trafficEnd=code.indexOf('\nfunction buildBuildings()',trafficStart);
if(trafficStart<0||trafficEnd<0)throw new Error('Traffic adapter location missing');
code=code.slice(0,trafficStart)+` traffic=buildTraffic({parent:scene,routes:carRoutes,places,mobile:mobile()});
 regionalLife=buildRegionalLife({parent:scene,routes:walkRoutes,roadRoutes:carRoutes,places,heightAt,waterAt,buildings:data.buildings,toLonLat:(x,z)=>[data.meta.origin[0]+x/data.meta.sx,data.meta.origin[1]-z/data.meta.sz],mobile:mobile()});
 places.push(...regionalLife.places);
}\n`+code.slice(trafficEnd);
const treeStart=code.indexOf(' trees=new THREE.InstancedMesh('),treeEnd=code.indexOf('\nfunction addMesh(',treeStart);
if(treeStart<0||treeEnd<0)throw new Error('Woodland adapter location missing');
code=code.slice(0,treeStart)+` woodland=buildVegetation({parent:scene,accepted});trees=woodland.group;\n}\n`+code.slice(treeEnd);
replace('N=mobile()?11000:17000','N=mobile()?4000:7000');
replace('for(const p of places){[p.x,p.z]=toWorld(...p.ll);}', 'places.push(...mountainPlaces(data));for(const p of places){[p.x,p.z]=toWorld(...p.ll);}');
replace(" scene.add(landmarkGroup);", " streetLife=buildLandmarkLife({models:localLandmarks.models,mobile:mobile()});\n rockfields=buildRockfields({parent:scene,data,heightAt,waterAt});\n scene.add(landmarkGroup);");
replace('streetLife=buildLandmarkLife({models:localLandmarks.models,mobile:mobile()});','streetLife=extendLandmarkLife(buildLandmarkLife({models:localLandmarks.models,mobile:mobile()}),{models:localLandmarks.models,mobile:mobile(),heightAt,waterAt,roads:data.roads});');
replace('attachFeatureUI({places,focusPlace,renderer,camera,landmarkGroup})','attachFeatureUI({places,focusPlace,renderer,camera,landmarkGroup,life:{traffic,woodland,streetLife,rockfields,regionalLife}})');
replace('localLandmarks?.update(now,reducedMotion);', 'if(!reducedMotion){lifeSeconds+=dt;traffic?.update(lifeSeconds);streetLife?.update(lifeSeconds);regionalLife?.update(lifeSeconds);}localLandmarks?.update(now,reducedMotion);');
replace('version:ATLAS_VERSION,ready:sceneReady','version:ATLAS_VERSION,ready:sceneReady,life:{vehicles:traffic.count+streetLife.vehicles,people:streetLife.people+regionalLife.count,coastalLandmarks:streetLife.coverage,regionalCoverage:regionalLife.coverage,trafficCoverage:traffic.coverage,trafficRoutes:traffic.routeCount,activities:regionalLife.activityTypes,activityPlaces:regionalLife.places.map(p=>p.name),vehicleTypes:traffic.types,treeTypes:woodland.counts,outfits:streetLife.outfits,rocks:rockfields.count,seconds:lifeSeconds}');
replace("clamp(p.zoom*(mobile()?1.4:1),1,28)", "clamp(p.zoom*(mobile()?1.4:1),1,p.kind==='activity'?700:28)");
code="import {coreCities,labelPriority,labelPosition} from './label-layout.mjs';\n"+code;
replace('function updateLabels(){', `function updateLabels(){
 // Project labels with the same camera transform used to render this frame.
 camera.updateMatrixWorld();`);
replace("const l=document.createElement('button');l.className='map-label';", "const l=document.createElement('button');l.className='map-label';l.classList.toggle('city-label',coreCities.includes(p.name));const leader=document.createElement('span');leader.className='map-label-leader';leader.hidden=true;$('labels').append(leader);l.leader=leader;");
replace("const occupied=[];const ordered=[...labels].sort((a,b)=>(b.p===places[selected]?100:b.p.major?10:0)-(a.p===places[selected]?100:a.p.major?10:0));", "const occupied=[];const ordered=[...labels].sort((a,b)=>labelPriority(b.p,places[selected])-labelPriority(a.p,places[selected]));");
const labelStart=code.indexOf('  const blocked=(x<='),labelEnd=code.indexOf('\n  if(p.pinElement){',labelStart);
if(labelStart<0||labelEnd<0)throw new Error('Label placement adapter location missing');
code=code.slice(0,labelStart)+`  const layout=labelPosition({x,y,width:innerWidth,height:innerHeight,mobile:mobile(),important:coreCities.includes(p.name)||p===places[selected],occupied});
  const show=labelsVisible&&near&&projected.z>-1&&projected.z<1&&x>0&&x<innerWidth&&y>80&&y<innerHeight-100&&!!layout;
  el.hidden=!show;if(el.leader)el.leader.hidden=true;
  if(show){el.style.left=layout.x+'px';el.style.top=layout.y+'px';occupied.push(layout.box);
   if(el.leader&&Math.hypot(layout.x-x,layout.y-y)>1){const d=Math.hypot(layout.x-x,layout.y-y);el.leader.hidden=false;el.leader.style.left=x+'px';el.leader.style.top=y+'px';el.leader.style.width=d+'px';el.leader.style.transform='rotate('+Math.atan2(layout.y-y,layout.x-x)+'rad)';}
  }`+code.slice(labelEnd);
replace("const flatColor=new THREE.Color('#d6dfc2'),mid=new THREE.Color('#91ad7b'),high=new THREE.Color('#8b9a79');", "const flatColor=new THREE.Color('#d6dfc2'),mid=new THREE.Color('#7f9f70'),high=new THREE.Color('#999e88');");
replace('c.multiplyScalar(.975+random()*.05);', `const k=j*(t.nx+1)+i;
  const slope=Math.abs(h-t.heights[Math.max(0,k-1)])+Math.abs(h-t.heights[Math.max(0,k-t.nx-1)]);
  if(h>350)c.lerp(new THREE.Color('#aba899'),clamp((slope-80)/350,0,.48));
  c.multiplyScalar(.975+random()*.05);`);
code="import {buildUrbanEnvironment} from './urban-environment.mjs';\nlet urbanEnvironment;\n"+code;
replace('places.push(...regionalLife.places);','places.push(...regionalLife.places);urbanEnvironment=buildUrbanEnvironment({parent:scene,routes:walkRoutes,places,heightAt,waterAt,buildings:data.buildings,mobile:mobile()});');
code="import {buildRegionalEnvironment} from './regional-environment.mjs';\nimport {buildTransport} from './transport.mjs';\nlet regionalEnvironment,transport;\n"+code;
code="import {buildCuisine} from './local-cuisine.mjs';\nlet cuisine;\n"+code;
replace('places.push(...regionalLife.places);urbanEnvironment=', 'places.push(...regionalLife.places);transport=buildTransport({parent:scene,data,places,heightAt,waterAt,toWorld,mobile:mobile()});places.push(...transport.places);regionalEnvironment=buildRegionalEnvironment({parent:scene,data,places,heightAt,waterAt,waterMesh,mobile:mobile()});urbanEnvironment=');
replace('places.push(...transport.places);regionalEnvironment=', 'places.push(...transport.places);cuisine=buildCuisine({parent:scene,data,places,heightAt,waterAt,mobile:mobile()});places.push(...cuisine.places);regionalEnvironment=');
replace('traffic=buildTraffic({','traffic=buildTraffic({coverNetwork:true,population:mobile()?1008:2016,');
replace('regionalLife=buildRegionalLife({','regionalLife=buildRegionalLife({coverNetwork:true,population:mobile()?768:1536,');
replace('traffic?.update(lifeSeconds);','traffic?.update(lifeSeconds);transport?.update(lifeSeconds);cuisine?.update(lifeSeconds);');
replace('updateLabels();renderer.render(scene,camera);','regionalEnvironment?.update(lifeSeconds,camera.zoom);updateLabels();renderer.render(scene,camera);');
replace('localLandmarks?.setTime(time);','localLandmarks?.setTime(time);regionalEnvironment?.setTime(time);');
replace('life:{traffic,woodland,streetLife,rockfields,regionalLife}', 'life:{traffic,woodland,streetLife,rockfields,regionalLife,regionalEnvironment,transport,cuisine}');
replace("p.kind==='activity'?700:28", "['activity','transport','food'].includes(p.kind)?700:28");
replace('life:{vehicles:traffic.count','environment:{...regionalEnvironment.stats,corridorCells:urbanEnvironment.corridorCells,fields:urbanEnvironment.fields,urbanArchitecture:urbanEnvironment.architecture},transport:transport.stats,cuisine:cuisine.stats,life:{vehicles:traffic.count');
replace('const roadWidth={motorway:.034,trunk:.03,primary:.024,secondary:.016,tertiary:.009,rail:.006};','const roadWidth={motorway:.046,trunk:.044,primary:.042,secondary:.040,tertiary:.038,rail:.006};');
replace("material('road','#f1ede0'","material('road','#53616a'");
code=code.replaceAll("road:'#ede9d9'","road:'#53616a'").replaceAll("road:'#ebcda4'","road:'#665f5b'").replaceAll("road:'#938876'","road:'#354752'");
code=code.replaceAll("water:'#3d94b0'","water:'#367f87'").replaceAll("water:'#739ba9'","water:'#6d999f'");
replace("mid=new THREE.Color('#7f9f70')","mid=new THREE.Color('#53845e')");
replace('accepted.push([x,z,h,.055+random()*.1]);','accepted.push([x,z,h,.10+random()*.18]);');
replace('trafficRoutes:traffic.routeCount','trafficRoutes:traffic.routeCount,signalCrossings:traffic.crossings,urbanInfill:urbanEnvironment.buildings');
code="import {buildCommunityActivities} from './community-activities.mjs';\nimport {buildTourContext} from './tour-context.mjs';\nlet communityActivities,tourContext;\n"+code;
replace('places.push(...cuisine.places);regionalEnvironment=', 'places.push(...cuisine.places);communityActivities=buildCommunityActivities({parent:scene,places,heightAt,waterAt});tourContext=buildTourContext({parent:scene,places,sites:communityActivities.sites,routes:walkRoutes,heightAt,waterAt,buildings:data.buildings,mobile:mobile()});regionalEnvironment=');
replace('cuisine?.update(lifeSeconds);','cuisine?.update(lifeSeconds);communityActivities?.update(lifeSeconds);tourContext?.update(lifeSeconds);');
replace('buildCommunityActivities({parent:scene,places,heightAt,waterAt})','buildCommunityActivities({parent:scene,places,heightAt,waterAt,routes:carRoutes,buildings:data.buildings})');
replace('urbanEnvironment=buildUrbanEnvironment({parent:scene,','urbanEnvironment=buildUrbanEnvironment({reserve:tourContext.clear,parent:scene,');
replace('regionalEnvironment=buildRegionalEnvironment({parent:scene,','regionalEnvironment=buildRegionalEnvironment({reserve:tourContext.clear,reservedSites:communityActivities.sites,parent:scene,');
replace('accepted.push([x,z,h,.10+random()*.18]);','if(communityActivities.sites.every(p=>Math.hypot(x-p.x,z-p.z)>p.span+.35))accepted.push([x,z,h,.10+random()*.18]);');
replace('regionalEnvironment,transport,cuisine}', 'regionalEnvironment,transport,cuisine,communityActivities,tourContext}');
replace('sites:communityActivities.sites,routes:walkRoutes,heightAt,waterAt,buildings:data.buildings,mobile:mobile()','sites:communityActivities.sites,routes:walkRoutes,roadRoutes:carRoutes,heightAt,waterAt,buildings:data.buildings,mobile:mobile()');
replace('reservedSites:communityActivities.sites,parent:scene','reservedSites:[...communityActivities.sites,...tourContext.sites],parent:scene');
replace('if(communityActivities.sites.every(p=>Math.hypot(x-p.x,z-p.z)>p.span+.35))','if(tourContext.clear(x,z,.20)&&communityActivities.sites.every(p=>Math.hypot(x-p.x,z-p.z)>p.span+.35))');
replace('cuisine:cuisine.stats,life:', 'cuisine:cuisine.stats,recreation:communityActivities.stats,tourContext:tourContext.stats,life:');
replace('function focusPlace(i,touring=false){','function focusPlace(i,touring=false,viewIndex){');
replace('selected=i;flatView=false;updateViewButton();const p=places[i];','selected=i;flatView=false;updateViewButton();const original=places[i],view=original.views?.[viewIndex??original.defaultView??0],p=view?{...original,...view}:original;');
replace("p.kind==='landmark'?targetHalfHeight/Math.max(p.halfHeight,p.span/(innerWidth/innerHeight)*.60)","p.halfHeight?targetHalfHeight/Math.max(p.halfHeight,(p.span||.3)/(innerWidth/innerHeight)*.60)");
code='// Local adaptation of Seoul 3D Atlas v1.3 renderer. Reference and data attribution: /REFERENCE-LICENSES.txt\n'+code;
replace('return ((t.heights[i]*(1-a)+t.heights[i+1]*a)*(1-b)+(t.heights[i+t.nx+1]*(1-a)+t.heights[i+t.nx+2]*a)*b)*.004;',`// Match the two triangles emitted by buildTerrain, including their diagonal.
 const h00=t.heights[i],h10=t.heights[i+1],h01=t.heights[i+t.nx+1],h11=t.heights[i+t.nx+2];
 return (a+b<=1?h00+(h10-h00)*a+(h01-h00)*b:h11+(h01-h11)*(1-a)+(h10-h11)*(1-b))*.004;`);
code="import {nanaoPlaces,positionNanaoPlaces,buildNanaoSights} from './nanao-sights.mjs';\nlet nanaoSights;\n"+code;
replace('localLandmarks=buildLocalLandmarks({parent:landmarkGroup,heightAt,waterAt,toWorld});','localLandmarks=buildLocalLandmarks({parent:landmarkGroup,heightAt,waterAt,toWorld});nanaoSights=buildNanaoSights({parent:landmarkGroup,heightAt,waterAt,toWorld,data});');
replace('places.push(...cuisine.places);','positionNanaoPlaces({toWorld,heightAt,waterAt});places.push(...cuisine.places,...nanaoPlaces);');
replace('tourContext?.update(lifeSeconds);','tourContext?.update(lifeSeconds);nanaoSights?.update(lifeSeconds);');
replace('transport:transport.stats,','transport:transport.stats,nanao:nanaoSights.stats,');
replace('communityActivities,tourContext}})','communityActivities,tourContext,nanaoSights}})');
replace('heightAt(p.x,p.z)+p.top*.32','(p.sceneY??heightAt(p.x,p.z))+p.top*.32');
replace('heightAt(p.x,p.z)+p.top+.14','(p.sceneY??heightAt(p.x,p.z))+p.top+.14');
code="import {shantouPlaces,positionShantouPlaces} from './shantou-places.mjs';\nimport {buildShantouSights} from './shantou-sights.mjs';\nimport {insidePlace} from './place-footprints.mjs';\nlet shantouSights;\n"+code;
replace('places.push(...cuisine.places,...nanaoPlaces);','places.push(...cuisine.places,...nanaoPlaces);positionShantouPlaces({existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...shantouPlaces);');
replace('nanaoSights=buildNanaoSights({parent:landmarkGroup,heightAt,waterAt,toWorld,data});','nanaoSights=buildNanaoSights({parent:landmarkGroup,heightAt,waterAt,toWorld,data});shantouSights=buildShantouSights({parent:landmarkGroup,heightAt,waterAt});');
replace('nanaoSights?.update(lifeSeconds);','nanaoSights?.update(lifeSeconds);shantouSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights}})','tourContext,nanaoSights,shantouSights}})');
replace('nanao:nanaoSights.stats,','nanao:nanaoSights.stats,shantou:shantouSights.stats,');
replace('inBounds(b[0],b[1],.05)&&!places.some','inBounds(b[0],b[1],.05)&&!shantouPlaces.some(p=>!p.aliasOf&&insidePlace(p,b[0],b[1],Math.max(b[2],b[3])*.5))&&!places.some');
replace('reservedSites:[...communityActivities.sites,...tourContext.sites]','reservedSites:[...communityActivities.sites,...tourContext.sites,...shantouPlaces.filter(p=>!p.aliasOf)]');
code="import {outsideSmallParkRoads} from './small-park-layout.mjs';\n"+code;
replace('for(const [cls,bridge,path] of data.roads){','for(const [cls,bridge,path] of outsideSmallParkRoads(data.roads,places.find(p=>p.id===\'small-park\'))){');
replace('inBounds(b[0],b[1],.05)&&!shantouPlaces.some','inBounds(b[0],b[1],.05)&&!places.some(p=>p.id===\'small-park\'&&insidePlace(p,b[0],b[1],Math.max(b[2],b[3])*.5))&&!shantouPlaces.some');
code="import {jiexiPlaces} from './jiexi-places.mjs';\nimport {buildJiexiSights} from './jiexi-sights.mjs';\nlet jiexiSights;\n"+code;
replace('places.push(...shantouPlaces);','places.push(...shantouPlaces);positionShantouPlaces({places:jiexiPlaces,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...jiexiPlaces);');
replace('shantouSights=buildShantouSights({parent:landmarkGroup,heightAt,waterAt});','shantouSights=buildShantouSights({parent:landmarkGroup,heightAt,waterAt});jiexiSights=buildJiexiSights({parent:landmarkGroup,heightAt,waterAt});');
replace('shantouSights?.update(lifeSeconds);','shantouSights?.update(lifeSeconds);jiexiSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights,shantouSights}})','tourContext,nanaoSights,shantouSights,jiexiSights}})');
replace('shantou:shantouSights.stats,','shantou:shantouSights.stats,jiexi:jiexiSights.stats,');
replace('...shantouPlaces.filter(p=>!p.aliasOf)]','...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces]');
replace('!shantouPlaces.some(p=>!p.aliasOf&&insidePlace','![...shantouPlaces,...jiexiPlaces].some(p=>!p.aliasOf&&insidePlace');
code="import {huilaiPlaces} from './huilai-places.mjs';\nimport {buildHuilaiSights} from './huilai-sights.mjs';\nlet huilaiSights;\n"+code;
replace('places.push(...jiexiPlaces);','places.push(...jiexiPlaces);positionShantouPlaces({places:huilaiPlaces,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...huilaiPlaces);');
replace('jiexiSights=buildJiexiSights({parent:landmarkGroup,heightAt,waterAt});','jiexiSights=buildJiexiSights({parent:landmarkGroup,heightAt,waterAt});huilaiSights=buildHuilaiSights({parent:landmarkGroup,heightAt,waterAt});');
replace('jiexiSights?.update(lifeSeconds);','jiexiSights?.update(lifeSeconds);huilaiSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights,shantouSights,jiexiSights}})','tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights}})');
replace('jiexi:jiexiSights.stats,','jiexi:jiexiSights.stats,huilai:huilaiSights.stats,');
replace('...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces]','...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces]');
replace('[...shantouPlaces,...jiexiPlaces].some','[...shantouPlaces,...jiexiPlaces,...huilaiPlaces].some');
code="import {raopingPlaces,positionRaopingPlaces} from './raoping-places.mjs';\nimport {buildRaopingSights} from './raoping-sights.mjs';\nlet raopingSights;\n"+code;
replace('places.push(...huilaiPlaces);','places.push(...huilaiPlaces);positionRaopingPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...raopingPlaces);');
replace('huilaiSights=buildHuilaiSights({parent:landmarkGroup,heightAt,waterAt});','huilaiSights=buildHuilaiSights({parent:landmarkGroup,heightAt,waterAt});raopingSights=buildRaopingSights({parent:landmarkGroup,heightAt,waterAt});');
replace('huilaiSights?.update(lifeSeconds);','huilaiSights?.update(lifeSeconds);raopingSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights}})','tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights}})');
replace('huilai:huilaiSights.stats,','huilai:huilaiSights.stats,raoping:raopingSights.stats,');
replace('...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces]','...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces]');
replace('[...shantouPlaces,...jiexiPlaces,...huilaiPlaces].some','[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces].some');
code="import {chaoanPlaces,positionChaoanPlaces} from './chaoan-places.mjs';\nimport {buildChaoanSights} from './chaoan-sights.mjs';\nlet chaoanSights;\n"+code;
replace('places.push(...raopingPlaces);','places.push(...raopingPlaces);positionChaoanPlaces({existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...chaoanPlaces);');
replace('raopingSights=buildRaopingSights({parent:landmarkGroup,heightAt,waterAt});','raopingSights=buildRaopingSights({parent:landmarkGroup,heightAt,waterAt});chaoanSights=buildChaoanSights({parent:landmarkGroup,heightAt,waterAt});');
replace('raopingSights?.update(lifeSeconds);','raopingSights?.update(lifeSeconds);chaoanSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights}})','tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights}})');
replace('raoping:raopingSights.stats,','raoping:raopingSights.stats,chaoan:chaoanSights.stats,');
replace('...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces]','...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces]');
replace('[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces].some','[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces].some');
code="import {chenghaiPlaces,positionChenghaiPlaces} from './chenghai-places.mjs';\nimport {buildChenghaiSights} from './chenghai-sights.mjs';\nlet chenghaiSights;\n"+code;
replace('places.push(...chaoanPlaces);','places.push(...chaoanPlaces);positionChenghaiPlaces({existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...chenghaiPlaces);');
replace('chaoanSights=buildChaoanSights({parent:landmarkGroup,heightAt,waterAt});','chaoanSights=buildChaoanSights({parent:landmarkGroup,heightAt,waterAt});chenghaiSights=buildChenghaiSights({parent:landmarkGroup,heightAt,waterAt});');
replace('chaoanSights?.update(lifeSeconds);','chaoanSights?.update(lifeSeconds);chenghaiSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights}})','tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights}})');
replace('chaoan:chaoanSights.stats,','chaoan:chaoanSights.stats,chenghai:chenghaiSights.stats,');
replace('...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces]','...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces]');
replace('[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces].some','[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces].some');
code="import {chaoyangPlaces,positionChaoyangPlaces} from './chaoyang-places.mjs';\nimport {buildChaoyangSights} from './chaoyang-sights.mjs';\nlet chaoyangSights;\n"+code;
replace('places.push(...chenghaiPlaces);','places.push(...chenghaiPlaces);positionChaoyangPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...chaoyangPlaces);');
replace('chenghaiSights=buildChenghaiSights({parent:landmarkGroup,heightAt,waterAt});','chenghaiSights=buildChenghaiSights({parent:landmarkGroup,heightAt,waterAt});chaoyangSights=buildChaoyangSights({parent:landmarkGroup,heightAt,waterAt});');
replace('chenghaiSights?.update(lifeSeconds);','chenghaiSights?.update(lifeSeconds);chaoyangSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights}})','tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights}})');
replace('chenghai:chenghaiSights.stats,','chenghai:chenghaiSights.stats,chaoyang:chaoyangSights.stats,');
replace('...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces]','...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces]');
replace('[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces].some','[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces].some');
code="import {chaonanPlaces,positionChaonanPlaces} from './chaonan-places.mjs';\nimport {buildChaonanSights} from './chaonan-sights.mjs';\nlet chaonanSights;\n"+code;
replace('places.push(...chaoyangPlaces);','places.push(...chaoyangPlaces);positionChaonanPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...chaonanPlaces);');
replace('chaoyangSights=buildChaoyangSights({parent:landmarkGroup,heightAt,waterAt});','chaoyangSights=buildChaoyangSights({parent:landmarkGroup,heightAt,waterAt});chaonanSights=buildChaonanSights({parent:landmarkGroup,heightAt,waterAt});');
replace('chaoyangSights?.update(lifeSeconds);','chaoyangSights?.update(lifeSeconds);chaonanSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights}})','tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights,chaonanSights}})');
replace('chaoyang:chaoyangSights.stats,','chaoyang:chaoyangSights.stats,chaonan:chaonanSights.stats,');
replace('...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces]','...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces]');
replace('[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces].some','[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces].some');
code="import {puningPlaces,positionPuningPlaces} from './puning-places.mjs';\nimport {buildPuningSights} from './puning-sights.mjs';\nlet puningSights;\n"+code;
replace('places.push(...chaonanPlaces);','places.push(...chaonanPlaces);positionPuningPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...puningPlaces);');
replace('chaonanSights=buildChaonanSights({parent:landmarkGroup,heightAt,waterAt});','chaonanSights=buildChaonanSights({parent:landmarkGroup,heightAt,waterAt});puningSights=buildPuningSights({parent:landmarkGroup,heightAt,waterAt});');
replace('chaonanSights?.update(lifeSeconds);','chaonanSights?.update(lifeSeconds);puningSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights,chaonanSights}})','tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights,chaonanSights,puningSights}})');
replace('chaonan:chaonanSights.stats,','chaonan:chaonanSights.stats,puning:puningSights.stats,');
replace('...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces]','...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces,...puningPlaces]');
replace('[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces].some','[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces,...puningPlaces].some');
code="import {jieyangPlaces,positionJieyangPlaces} from './jieyang-places.mjs';\nimport {buildJieyangSights} from './jieyang-sights.mjs';\nlet jieyangSights;\n"+code;
replace('places.push(...puningPlaces);','places.push(...puningPlaces);positionJieyangPlaces({bbox:data.meta.bbox,existing:places,toWorld,heightAt,waterAt,routes:carRoutes});places.push(...jieyangPlaces);');
replace('puningSights=buildPuningSights({parent:landmarkGroup,heightAt,waterAt});','puningSights=buildPuningSights({parent:landmarkGroup,heightAt,waterAt});jieyangSights=buildJieyangSights({parent:landmarkGroup,heightAt,waterAt});');
replace('puningSights?.update(lifeSeconds);','puningSights?.update(lifeSeconds);jieyangSights?.update(lifeSeconds);');
replace('tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights,chaonanSights,puningSights}})','tourContext,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights,chaonanSights,puningSights,jieyangSights}})');
replace('puning:puningSights.stats,','puning:puningSights.stats,jieyang:jieyangSights.stats,');
replace('...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces,...puningPlaces]','...shantouPlaces.filter(p=>!p.aliasOf),...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces,...puningPlaces,...jieyangPlaces]');
replace('[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces,...puningPlaces].some','[...shantouPlaces,...jiexiPlaces,...huilaiPlaces,...raopingPlaces,...chaoanPlaces,...chenghaiPlaces,...chaoyangPlaces,...chaonanPlaces,...puningPlaces,...jieyangPlaces].some');
replace("if(sceneReady&&places[selected]?.kind==='landmark')focusPlace(selected);","if(sceneReady&&['landmark','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(places[selected]?.kind))focusPlace(selected);");

code="import {placeZoom,resumedTimeline} from './atlas-interaction.mjs';\n"+code;
replace("let mode = 'day',","let activeViewIndex,hiddenAt=null;\nlet mode = 'day',");
replace("function setTime(time){","function setTime(time){\n if(!['day','sunset','night'].includes(time)||!scene)return false;");
replace("if(time==='night')materials.ivory.emissive.set('#c58a47');","materials.ivory.emissive.set(time==='night'?'#c58a47':'#000000');");
replace("if(sceneReady&&['landmark','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(places[selected]?.kind))focusPlace(selected);",`if(sceneReady&&places[selected]){
  const original=places[selected],view=original.views?.[activeViewIndex??original.defaultView??0],p=view?{...original,...view}:original;
  if(animation){controls.target.copy(animation.toTarget);camera.position.copy(animation.toPosition);animation=null;}
  camera.zoom=placeZoom(p,targetHalfHeight,aspect,mobile());camera.updateProjectionMatrix();controls.update();
 }`);
replace("function focusPlace(i,touring=false,viewIndex){","function focusPlace(i,touring=false,viewIndex){\n if(!Number.isInteger(i)||i<0||i>=places.length)return false;activeViewIndex=viewIndex;");
replace("p.halfHeight?targetHalfHeight/Math.max(p.halfHeight,(p.span||.3)/(innerWidth/innerHeight)*.60):clamp(p.zoom*(mobile()?1.4:1),1,['activity','transport','food'].includes(p.kind)?700:28)","placeZoom(p,targetHalfHeight,innerWidth/innerHeight,mobile())");
replace("서울 한 바퀴를 마쳤습니다. 원하는 处을 더 둘러보세요.","潮汕巡游结束，可继续选择地点探索。");
replace("const p=places[selected],local=p?.kind==='landmark';","const p=places[selected],local=!!p?.halfHeight;");
replace("const center=local?V(p.x,heightAt(p.x,p.z),p.z):V(0,0,0);","const center=local?V(p.x,p.sceneY??heightAt(p.x,p.z),p.z):V(0,0,0);");
replace("init().catch(fail);",`document.addEventListener('visibilitychange',()=>{
 if(document.hidden){hiddenAt??=performance.now();return;}
 if(hiddenAt!==null){({animation,shotStart,lastTime}=resumedTimeline({animation,shotStart,hiddenAt,now:performance.now()}));hiddenAt=null;}
});
init().catch(fail);`);
replace("zoom:camera.zoom,time:mode,touring:runningTour","zoom:camera.zoom,time:mode,touring:runningTour,view:{flat:flatView,halfHeight:targetHalfHeight/camera.zoom,aspect:innerWidth/innerHeight,target:controls.target.toArray(),position:camera.position.toArray()},labelsVisible,boundariesVisible:borderLines.visible,ivoryEmission:materials.ivory.emissive.getHexString(),tourElapsed:performance.now()-shotStart,render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},places:places.map((p,i)=>({id:p.id||p.name,index:i,name:p.name,kind:p.kind}))");

replace("const occupied=[];const ordered=[...labels]",`const occupied=[...document.querySelectorAll('.brand,.top-actions,.explore,.location-card,.map-controls,.bottom-center')].filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};});const uiOccupied=[...occupied];const ordered=[...labels]`);
replace("const {p,el}=item;projected.copy(item.pos)",`const {p,el}=item;
  if(!item.size){const hidden=el.hidden;el.hidden=false;item.size={width:el.offsetWidth,height:el.offsetHeight};el.hidden=hidden;}
  projected.copy(item.pos)`);
replace("important:coreCities.includes(p.name)||p===places[selected],occupied","important:coreCities.includes(p.name)||p===places[selected],occupied,labelWidth:item.size.width,labelHeight:item.size.height");
replace("const pinShow=labelsVisible&&","const pinShow=!uiOccupied.some(b=>px+14>b.x&&px-14<b.x+b.w&&py+14>b.y&&py-14<b.y+b.h)&&labelsVisible&&");
replace("labelsVisible,boundariesVisible:borderLines.visible","labelsVisible,layers:featureUI.getLayers(),boundariesVisible:borderLines.visible");
code="import {terrainPaving} from './terrain-paving.mjs';\n"+code;
replace("const roadPositions=[],railPositions=[],carRoutes=[],walkRoutes=[];","const roadPositions=[],railPositions=[],carRoutes=[],walkRoutes=[],pave=terrainPaving(data.terrain,heightAt);");
replace("const nx=-dz/len*roadWidth[cls],nz=dx/len*roadWidth[cls];","if(!bridge){pave(dest,[a.x,a.z],[b.x,b.z],roadWidth[cls]*2);continue;}\n   const nx=-dz/len*roadWidth[cls],nz=dx/len*roadWidth[cls];");
replace("tourContext=buildTourContext({parent:scene,","tourContext=buildTourContext({terrain:data.terrain,parent:scene,");
replace("async function init(){","const startup={};\nfunction timed(name,fn){const start=performance.now();const value=fn();startup[name]=Math.round(performance.now()-start);return value;}\nasync function init(){");
for(const name of ['buildTerrain','buildSurface','buildBuildings','buildTrees','buildLandmarks','buildBorders','buildBoats','buildStars','buildUI']){
  replace(name+'();',`timed('${name}',()=>${name}());`);
}
replace("version:ATLAS_VERSION,ready:sceneReady,","version:ATLAS_VERSION,ready:sceneReady,startup:{...startup},");
for(const name of ['traffic','regionalLife','transport','cuisine','communityActivities','tourContext','regionalEnvironment','urbanEnvironment']){
  const pattern=new RegExp('\\b'+name+'=(build\\w+)\\((\\{[^;]*?\\})\\);');
  if(!pattern.test(code))throw new Error('Missing measured builder: '+name);
  code=code.replace(pattern,(_,builder,args)=>`timed('${name}',()=>{${name}=${builder}(${args});});`);
}
code="import {setCrowdView} from './scene-view-budget.mjs';\n"+code;
code="import {partitionLargeSurfaces} from './spatial-surfaces.mjs';\n"+code;
code="import {exhibitCulling} from './exhibit-culling.mjs';\nlet exhibitVisibility;\n"+code;
replace("setTime('day');resize();controls.update();sceneReady=true;","timed('spatialSurfaces',()=>partitionLargeSurfaces(scene));setTime('day');resize();controls.update();sceneReady=true;");
replace("timed('spatialSurfaces',()=>partitionLargeSurfaces(scene));", "timed('spatialSurfaces',()=>partitionLargeSurfaces(scene));exhibitVisibility=exhibitCulling([localLandmarks,nanaoSights,shantouSights,jiexiSights,huilaiSights,raopingSights,chaoanSights,chenghaiSights,chaoyangSights,chaonanSights,puningSights,jieyangSights,tourContext].flatMap(s=>s.models));");
// Pausing the clock must not pause visibility/LOD refresh when the camera moves.
replace("if(!reducedMotion){lifeSeconds+=dt;","setCrowdView(camera);{if(!reducedMotion)lifeSeconds+=dt;");
replace("setCrowdView(camera);", "exhibitVisibility?.update(camera);setCrowdView(camera);");
replace('}),focusPlace,resetView,setTime};', `}),geometryBudget:()=>{
 const rows=[],frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));scene.traverseVisible(o=>{if(!o.isMesh||(o.frustumCulled&&!frustum.intersectsObject(o)))return;const g=o.geometry;rows.push({name:o.name||o.parent?.name||o.type,color:o.material.color?.getHexString(),triangles:(g.index?.count||g.attributes.position?.count||0)/3*(o.isInstancedMesh?o.count:1),instances:o.isInstancedMesh?o.count:1});});return rows.sort((a,b)=>b.triangles-a.triangles).slice(0,20);
 },focusPlace,resetView,setTime};`);
code="import {createLivingSky} from './living-sky.mjs';\nimport {createCommunitySocial} from './community-social.mjs';\nimport './living-world.css';\nlet livingSky,communitySocial;\n"+code;
replace("const flatColor=new THREE.Color('#d6dfc2')","const flatColor=new THREE.Color('#779b79')");
code="import {landscapeColor} from './place-setting.mjs';\n"+code;
code="import {applyMeadowSurface} from './landscape-planting.mjs';\n"+code;
replace("terrainMesh.receiveShadow=true;scene.add(terrainMesh);", "terrainMesh.receiveShadow=true;applyMeadowSurface(terrainMesh.material);scene.add(terrainMesh);");
replace("const c=flatColor.clone().lerp(mid,clamp((h-35)/300,0,1));", "const c=new THREE.Color().fromArray(landscapeColor(x,z)).lerp(mid,clamp((h-35)/300,0,1));");
replace("c.multiplyScalar(.975+random()*.05);colors.push(c.r,c.g,c.b);", "colors.push(c.r,c.g,c.b);");
replace("featureUI=attachFeatureUI({places,focusPlace,renderer,camera,landmarkGroup,life:","communitySocial=createCommunitySocial({camera});featureUI=attachFeatureUI({places,focusPlace,renderer,camera,landmarkGroup,social:communitySocial,life:");
replace("function setTime(time){","function setTime(time,fromSky=false){");
replace("mode=time;document.body.dataset.time=time;","if(!fromSky)livingSky?.manual(time);mode=time;document.body.dataset.time=time;");
replace("sceneReady=true;renderer.render(scene,camera);","sceneReady=true;floor.material.depthWrite=false;livingSky=createLivingSky({scene,camera,sun,hemisphere,setPeriod:mode=>setTime(mode,true),reducedMotion});renderer.render(scene,camera);");
replace("updateLabels();renderer.render(scene,camera);","livingSky?.update(lifeSeconds);communitySocial?.update(lifeSeconds);frameSun();staticVisibility?.update(camera,[sun]);updateLabels();renderer.render(scene,camera);");
code="import {createStaticVisibility} from './static-visibility.mjs';\nlet staticVisibility;\n"+code;
replace("setTime('day');resize();controls.update();sceneReady=true;","staticVisibility=timed('staticVisibility',()=>createStaticVisibility(scene));setTime('day');resize();controls.update();sceneReady=true;");
replace('render:{calls:renderer.info.render.calls','staticVisibility:{...staticVisibility?.stats},render:{calls:renderer.info.render.calls');
replace("version:ATLAS_VERSION,ready:sceneReady,","version:ATLAS_VERSION,ready:sceneReady,sky:livingSky?.getState(),social:communitySocial?.getState(),");
code="import {prepareWaterContains} from './water-query.mjs';\n"+code;
replace('const item={rings:g,height:data.waterHeights[itemIndex]*.004+.012};','const item={contains:prepareWaterContains(g),height:data.waterHeights[itemIndex]*.004+.012};');
replace("function waterAt(x,z){for(const w of waterIndex.get(Math.floor(x)+','+Math.floor(z))||[])if(inside([x,z],w.rings[0])&&!w.rings.slice(1).some(r=>inside([x,z],r)))return w.height;return null;}","function waterAt(x,z){for(const w of waterIndex.get(Math.floor(x)+','+Math.floor(z))||[])if(w.contains(x,z))return w.height;return null;}");
// All environmental changes now share a continuous solar timeline.
code="import {fitSunShadow} from './solar-lighting.mjs';\n"+code;
const timeStart=code.indexOf('function setTime(time,fromSky=false){'),timeEnd=code.indexOf('\nfunction resize(){',timeStart);
if(timeStart<0||timeEnd<0)throw new Error('Time adapter not found');
code=code.slice(0,timeStart)+`function setTime(time,fromSky=false){
 if(!['morning','day','sunset','night'].includes(time)||!scene)return false;
 if(!fromSky&&livingSky)livingSky.manual(time);
 mode=time;document.body.dataset.time=time==='morning'?'day':time;
 for(const b of document.querySelectorAll('[data-time-choice]')){const on=b.dataset.timeChoice===time;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);}
 return true;
}
`+code.slice(timeEnd);
const shadowStart=code.indexOf('function frameSun(){'),shadowEnd=code.indexOf('\n}',shadowStart)+2;
if(shadowStart<0||shadowEnd<2)throw new Error('Shadow adapter not found');
code=code.slice(0,shadowStart)+`function frameSun(){
 if(!sun||!controls)return;
 fitSunShadow({sun,camera,target:controls.target,worldSpan:Math.max(width,depth)});
}
`+code.slice(shadowEnd);
replace('const mesh=new THREE.InstancedMesh(buildingGeo,buildingMat,rows.length);','const mesh=new THREE.InstancedMesh(buildingGeo,buildingMat,rows.length);mesh.name="osm-buildings";mesh.castShadow=true;mesh.receiveShadow=true;');
replace('scene.add(sun);','scene.add(sun,sun.target);');
replace('createLivingSky({scene,camera,sun,hemisphere,setPeriod:', 'createLivingSky({scene,camera,sun,hemisphere,renderer,materials,floor,nightGroup,starField,landmarkMaterials,localLandmarks,regionalEnvironment,setPeriod:');
replace('reducedMotion});renderer.render(scene,camera);', 'reducedMotion});livingSky.update(0);frameSun();renderer.render(scene,camera);');
replace('const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;', 'const skyDt=Math.min(Math.max(0,(now-lastTime)/1000),1),dt=Math.min(skyDt,.05);lastTime=now;');
replace('livingSky?.update(lifeSeconds);','livingSky?.update(skyDt);');
replace('if(!reducedMotion)lifeSeconds+=dt;','if(!livingSky?.paused)lifeSeconds+=dt;');
replace('localLandmarks?.update(now,reducedMotion);','localLandmarks?.update(lifeSeconds*1000,false);');
replace('else if(runningTour&&!reducedMotion){','else if(runningTour&&!reducedMotion&&!livingSky?.paused){');
replace('if(runningTour){const elapsed=now-shotStart;', 'if(runningTour&&livingSky?.paused)shotStart+=skyDt*1000;\n if(runningTour&&!livingSky?.paused){const elapsed=now-shotStart;');
replace('if(!reducedMotion){\n  for(const a of animatedCars)', 'if(!livingSky?.paused){\n  const now=lifeSeconds*1000;\n  for(const a of animatedCars)');
replace('sky:livingSky?.getState(),','sky:livingSky?.getState(),sceneSeconds:lifeSeconds,');
replace("livingSky.update(0);frameSun();", "livingSky.update(0);frameSun();if(import.meta.env.DEV)window.__atlasLighting={scene,camera,sun,renderer};");
await fs.writeFile(path.join(root,'app.js'),code);
await fs.writeFile(path.join(root,'style.css'),css+'\n*{letter-spacing:0!important}.brand-en{font-size:18px}.brand h1{gap:10px}.atlas-version{font-size:11px}.explore{border-radius:12px}.location-card{border-radius:10px} .gesture-hint{display:none}.bottom-center{gap:0} .brand .eyebrow{font-size:11px}@media(max-width:650px){.brand-en{font-size:14px}.brand h1{gap:8px}.atlas-version{display:none}.location-card{max-width:calc(100% - 85px)}.toolbar-item{font-size:11px}}\n');
console.log('Captured reference renderer and styles. Apply local adaptation patch next.');
