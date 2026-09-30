function buildSurface(){
 indexWater();waterMesh=polygonMesh(data.water,material('water','#3d94b0',{roughness:.36,metalness:.15,side:THREE.DoubleSide}),true);
 const roads=[],rails=[],pave=terrainPaving(data.terrain,heightAt),sizes={motorway:.012,trunk:.011,primary:.01,secondary:.008,tertiary:.006,rail:.004};
 for(const [cls,bridge,path] of data.roads)for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dest=cls==='rail'?rails:roads;
  if(!bridge){pave(dest,a,b,sizes[cls]*2);continue;}
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.001)continue;
  const nx=-dz/len*sizes[cls],nz=dx/len*sizes[cls],ya=Math.max(heightAt(...a),waterAt(...a)??0)+.04,yb=Math.max(heightAt(...b),waterAt(...b)??0)+.04;
  dest.push(a[0]+nx,ya,a[1]+nz,b[0]+nx,yb,b[1]+nz,a[0]-nx,ya,a[1]-nz,a[0]-nx,ya,a[1]-nz,b[0]+nx,yb,b[1]+nz,b[0]-nx,yb,b[1]-nz);
 }
 for(const [pts,name,hex] of [[roads,'road','#596b6b'],[rails,'rail','#becab0']]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.computeVertexNormals();const m=new THREE.Mesh(g,material(name,hex,{side:THREE.DoubleSide}));m.receiveShadow=true;scene.add(m);}
}
function buildBuildings(){
 const rows=data.buildings.filter(b=>inBounds(b[0],b[1])&&waterAt(b[0],b[1])===null);
 buildings=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material('buildings','#ffffff'),rows.length);buildings.castShadow=true;buildings.receiveShadow=true;
 const lights=[];
 rows.forEach(([x,z,w,d,a,h],i)=>{const high=h*.004;dummy.position.set(x,heightAt(x,z)+high/2,z);dummy.rotation.set(0,-a,0);dummy.scale.set(w,high,d);dummy.updateMatrix();buildings.setMatrixAt(i,dummy.matrix);buildings.setColorAt(i,color.set(h>60?'#acc7c9':h>20?'#c6d4cc':'#deded0'));if(h>20&&i%3===0)lights.push(x,heightAt(x,z)+high*.8,z);});
 buildings.computeBoundingSphere();scene.add(buildings);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lights,3));nightWindows=new THREE.Points(g,new THREE.PointsMaterial({size:1.7,sizeAttenuation:false,color:'#ffc77c'}));nightGroup.add(nightWindows);scene.add(nightGroup);
}
function buildTrees(){
 const pts=[];for(let i=0;i<24000&&pts.length<3000;i++){const x=worldBounds[0][0]+random()*width,z=worldBounds[0][1]+random()*depth,h=heightAt(x,z);if(h>.18&&waterAt(x,z)===null)pts.push([x,h,z]);}
 trees=new THREE.InstancedMesh(new THREE.ConeGeometry(.035,.13,5),material('trees','#387154'),pts.length);pts.forEach(([x,y,z],i)=>{dummy.position.set(x,y+.06,z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(.65+random()*.7);dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);});scene.add(trees);
}
function buildLandmarks(){
 const ivory=material('ivory','#eee5d0'),roof=material('roof','#a66048'),glass=material('glass','#87bac4',{metalness:.3,roughness:.3});
 function site(lon,lat){const g=new THREE.Group(),[x,z]=toWorld(lon,lat);g.position.set(x,heightAt(x,z)+.006,z);landmarkGroup.add(g);return g;}
 const twin=site(118.086,24.438);
 for(const x of [-.09,.09]){const shape=new THREE.Shape();shape.moveTo(-.065,0);shape.lineTo(.065,0);shape.lineTo(.055,.83);shape.quadraticCurveTo(.02,1.15,-.055,1.2);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:.085,bevelEnabled:false,curveSegments:12});addMesh(twin,g,glass,[x,0,-.04]);for(let y=.05;y<.9;y+=.045)block(twin,ivory,x,y,.048,.115,.004,.004);}
 const dome=site(118.064,24.448);block(dome,ivory,0,0,0,.19,.15,.14);addMesh(dome,new THREE.SphereGeometry(.08,16,10,0,Math.PI*2,0,Math.PI/2),roof,[0,.16,0]);
 const temple=site(118.0965,24.438);for(let i=0;i<3;i++){block(temple,ivory,0,0,-i*.095,.16,.075,.065);const g=new THREE.ConeGeometry(.12,.035,4);g.rotateY(Math.PI/4);addMesh(temple,g,roof,[0,.095,-i*.095],[1,1,.65]);}
 const jimei=site(118.1,24.574);block(jimei,ivory,0,0,0,.22,.17,.1);block(jimei,ivory,0,.17,0,.055,.17,.055);addMesh(jimei,new THREE.ConeGeometry(.055,.055,4),roof,[0,.36,0]);
 for(const [lon,lat] of [[118.087,24.441],[118.076,24.454]]){const g=site(lon,lat);for(let i=0;i<7;i++){const x=(i-3)*.045;block(g,i%2?ivory:roof,x,0,0,.04,.075,.04);block(g,ivory,x,.075,0,.043,.008,.046);}}
 scene.add(landmarkGroup);
}
function setTime(time){
 if(!scene||!['morning','day','sunset','night'].includes(time))return;mode=time;document.body.dataset.time=time==='morning'?'day':time;
 const palettes={morning:['#e6e9dd','#fff0c9',2.1,.9],day:['#e6ede7','#fff2d6',3.1,2.1],sunset:['#ead6c7','#ffb580',2.3,1.3],night:['#152b38','#b3c8ff',.6,.6]},[bg,light,intensity,ambient]=palettes[time];scene.background.set(bg);scene.fog.color.set(bg);floor.material.color.set(bg);sun.color.set(light);sun.intensity=intensity;hemisphere.intensity=ambient;nightGroup.visible=time==='night';starField.visible=time==='night';sun.position.set(time==='sunset'?-32:-18,time==='sunset'?10:35,15);
 for(const b of document.querySelectorAll('[data-time-choice]')){const on=b.dataset.timeChoice===time;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}
}
function updateSelection(){for(let i=0;i<places.length;i++){places[i].button.classList.toggle('selected',i===selected);places[i].label.classList.toggle('selected',i===selected);}}
function focusPlace(i,touring=false){if(!places[i])return;if(!touring)stopTour();selected=i;flatView=false;updateViewButton();const p=places[i];tweenTo(V(p.x,heightAt(p.x,p.z),p.z),placeZoom(p,targetHalfHeight),V(5,6,8),1500);setLocation(p.name,p.en,p.description,p.ll,String(i+1).padStart(2,'0'));updateSelection();$('district').value=String(i);closeExplore();}
const projected=new THREE.Vector3();
function updateLabels(){
 const occupied=[];for(const {p,el,pos} of [...labels].sort((a,b)=>(b.p===places[selected])-(a.p===places[selected]))){projected.copy(pos).project(camera);const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;const w=el.offsetWidth||85,h=30,r=[x-w/2,y-h,x+w/2,y];const collision=occupied.some(o=>r[0]<o[2]+8&&r[2]>o[0]-8&&r[1]<o[3]+6&&r[3]>o[1]-6);el.hidden=!labelsVisible||Math.abs(projected.x)>1||Math.abs(projected.y)>1||projected.z>1||(collision&&p!==places[selected]);if(!el.hidden){el.style.left=x+'px';el.style.top=y+'px';occupied.push(r);}}
}
function animate(now){requestAnimationFrame(animate);if(document.hidden||!sceneReady)return;
 if(animation){const a=animation,t=a.duration?clamp((now-a.start)/a.duration,0,1):1,e=t*t*(3-2*t);controls.target.lerpVectors(a.fromTarget,a.toTarget,e);camera.position.lerpVectors(a.fromPosition,a.toPosition,e);camera.zoom=THREE.MathUtils.lerp(a.fromZoom,a.toZoom,e);camera.updateProjectionMatrix();if(t===1)animation=null;}
 if(runningTour){const elapsed=now-shotStart;$('tour-progress').style.width=Math.min(100,elapsed/90)+'%';if(elapsed>9000){tourIndex=(tourIndex+1)%places.length;shotStart=now;focusPlace(tourIndex,true);}}
 for(const a of animatedBoats){const t=(now*.000022+a.offset)%1;a.mesh.position.set(a.x+a.dx*t,a.y+.012,a.z+a.dz*t);}
 controls.update();updateLabels();renderer.render(scene,camera);
}
async function init(){
 const [r,b]=await Promise.all([fetch('/data/xiamen.json'),fetch('/data/buildings.bin')]);if(!r.ok||!b.ok)throw new Error('地图数据缺失');data=await r.json();const a=new Float32Array(await b.arrayBuffer());if(a.length!==data.meta.buildingCount*6)throw new Error('建筑数据不完整');data.buildings=Array.from({length:data.meta.buildingCount},(_,i)=>Array.from(a.subarray(i*6,i*6+6)));
 worldBounds=data.terrain.bounds;width=worldBounds[1][0]-worldBounds[0][0];depth=worldBounds[1][1]-worldBounds[0][1];for(const p of places)[p.x,p.z]=toWorld(...p.ll);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('viewport').append(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color('#e6ede7');scene.fog=new THREE.Fog('#e6ede7',100,300);camera=new THREE.OrthographicCamera(-35,35,24,-24,.1,700);camera.position.copy(V(34,39,46).multiplyScalar(Math.max(width/47,depth/45)));controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.465;controls.minZoom=.65;controls.maxZoom=700;controls.screenSpacePanning=false;controls.addEventListener('start',()=>{animation=null;stopTour();});
 hemisphere=new THREE.HemisphereLight('#d8e7f2','#b5c4a3',2.1);scene.add(hemisphere);sun=new THREE.DirectionalLight('#fff2d6',3.1);sun.position.set(-18,35,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:100});sun.shadow.normalBias=.015;scene.add(sun);
 floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshStandardMaterial({color:'#e6ede7'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.94;floor.receiveShadow=true;scene.add(floor);
 buildTerrain();buildSurface();buildBuildings();buildTrees();buildLandmarks();buildBorders();buildBoats();buildStars();buildUI();setTime('day');resize();controls.update();sceneReady=true;resetView();$('loading').hidden=true;window.addEventListener('resize',resize);requestAnimationFrame(animate);
 window.xiamenAtlas={getState:()=>({ready:sceneReady,buildings:buildings.count,roads:data.roads.length,water:data.water.length,selected:places[selected]?.name,time:mode,touring:runningTour,flat:flatView,labelsVisible})};
}
$('retry').onclick=()=>location.reload();init().catch(fail);
