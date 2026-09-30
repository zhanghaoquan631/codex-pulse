import * as THREE from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';

export function createTravelMapLayer({scene,camera,toWorld,heightAt,waterAt,focus}){
 const group=new THREE.Group(),route=new THREE.Group(),trail=new THREE.Group(),highlight=new THREE.Group();scene.add(group);group.add(route,trail,highlight);
 const labels=document.createElement('div');labels.className='walking-map-labels';document.body.append(labels);let labelItems=[];
 const marker=new THREE.Group();group.add(marker);marker.visible=false;
 const dot=new THREE.Mesh(new THREE.SphereGeometry(.012,16,10),new THREE.MeshBasicMaterial({color:'#147bd1',depthTest:false}));marker.add(dot);
 const ring=new THREE.Mesh(new THREE.RingGeometry(.93,1,64),new THREE.MeshBasicMaterial({color:'#147bd1',transparent:true,opacity:.45,side:THREE.DoubleSide,depthTest:false}));ring.rotation.x=-Math.PI/2;marker.add(ring);
 const arrowShape=new THREE.Shape();arrowShape.moveTo(0,-.05);arrowShape.lineTo(-.016,-.02);arrowShape.lineTo(0,-.027);arrowShape.lineTo(.016,-.02);arrowShape.closePath();
 const arrow=new THREE.Mesh(new THREE.ShapeGeometry(arrowShape),new THREE.MeshBasicMaterial({color:'#07548d',side:THREE.DoubleSide,depthTest:false}));arrow.rotation.x=Math.PI/2;marker.add(arrow);
 marker.traverse(m=>m.renderOrder=1002);
 const point=ll=>{const [x,z]=toWorld(...ll);return new THREE.Vector3(x,Math.max(heightAt(x,z),waterAt(x,z)??-1)+.010,z);};
 function clear(g){while(g.children.length){const c=g.children[0];g.remove(c);c.geometry?.dispose();c.material?.map?.dispose();c.material?.dispose();}}
 function line(g,points,color,dashed=false,width=4,outline=false){
  if(points.length<2)return;
  const sampled=[];for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],wa=toWorld(...a),wb=toWorld(...b),steps=Math.max(1,Math.ceil(Math.hypot(wb[0]-wa[0],wb[1]-wa[1])/.025));
   for(let j=i===1?0:1;j<=steps;j++)sampled.push(...point([a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps]).toArray());
  }
  const geometry=new LineGeometry();geometry.setPositions(sampled);
  const material=new LineMaterial({color,linewidth:width,depthTest:false,dashed,dashSize:.035,gapSize:.022});material.resolution.set(innerWidth,innerHeight);
  const mesh=new Line2(geometry,material);mesh.computeLineDistances();mesh.renderOrder=outline?999:1000;g.add(mesh);
 }
 function endpoint(ll,text,color){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(48,48,44,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.arc(48,48,38,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,48,49);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.position.copy(point(ll));sprite.renderOrder=1001;route.add(sprite);
 }
 let trailCount=-1,lastTrailEnd=null,routeCount=0;
 return {
  point,
  route(legs){
   clear(route);clear(highlight);routeCount=0;labels.replaceChildren();labelItems=[];const named=new Set();
   for(const leg of legs||[])if(leg.points?.length){
    routeCount++;line(route,leg.points,'#fffdf2',leg.kind==='ferry',9,true);line(route,leg.points,leg.kind==='ferry'?'#bc6c17':'#086556',leg.kind==='ferry',5);
    for(const direction of leg.directions||[])if(direction.kind==='steps')line(route,direction.points,'#bb5529',false,6);
    for(const d of leg.directions||[]){
     if(d.kind!=='steps'&&(d.name==='未命名步道'||named.has(d.name)))continue;
     named.add(d.name);const ll=d.points[Math.floor(d.points.length/2)],b=document.createElement('button');b.type='button';b.className='walking-map-label';b.textContent=d.kind==='steps'?'楼梯':d.name;b.title=`查看${d.name}，约${Math.round(d.meters)}米`;b.dataset.stairs=String(d.kind==='steps');
     b.onclick=()=>focus?.(ll,.09,700);labels.append(b);labelItems.push({b,p:point(ll),width:Math.max(44,b.textContent.length*12+16)});
    }
   }
   const valid=(legs||[]).filter(l=>l.points?.length);if(valid.length){endpoint(valid[0].points[0],'起','#086556');endpoint(valid.at(-1).points.at(-1),'终','#aa4732');}
  },
  highlight(points){clear(highlight);if(points?.length){line(highlight,points,'#fff',false,12,true);line(highlight,points,'#008ec5',false,7);}},
  history(points){clear(trail);let part=[];for(const p of points){if(p.breakBefore){line(trail,part,'#2389e5');part=[];}part.push(p.ll);}line(trail,part,'#2389e5');trailCount=-1;},
  location(state){
   const usable=state.enabled&&state.position&&['active','imprecise'].includes(state.status);marker.visible=!!usable;
   if(usable){marker.position.copy(point(state.position.ll));ring.scale.setScalar(state.position.accuracy/1000);arrow.visible=state.status==='active'&&state.heading!==null;marker.rotation.y=state.heading===null?0:-state.heading*Math.PI/180;}
   const end=state.trail.at(-1);
   if(state.trail.length!==trailCount||end?.at!==lastTrailEnd){trailCount=state.trail.length;lastTrailEnd=end?.at;clear(trail);line(trail,state.trail.map(p=>p.ll),'#2389e5');}
  },
  update(){
   for(const g of [route,trail,highlight])for(const line of g.children)line.material.resolution?.set(innerWidth,innerHeight);
   // A readable marker at every zoom; the accuracy ring keeps its true metre size.
   const pixel=(camera.top-camera.bottom)/camera.zoom/innerHeight;dot.scale.setScalar(pixel*7/.012);arrow.scale.setScalar(pixel*34/.05);
   for(const sprite of route.children)if(sprite.isSprite)sprite.scale.setScalar(pixel*30);
   const panel=document.querySelector('.travel-body')?.dataset.panel;labels.hidden=!document.body.classList.contains('travel-open')||!['location','routes'].includes(panel);
   if(!labels.hidden){
    const occupied=[...document.querySelectorAll('.travel-drawer,.bottom-center,.scene-tools,.scene-settings,.sky-options,.travel-launch')].filter(el=>el.offsetWidth&&getComputedStyle(el).visibility!=='hidden').map(el=>{const r=el.getBoundingClientRect();return [r.left-6,r.top-6,r.right+6,r.bottom+6];});let count=0;
    for(const {b,p,width:w} of labelItems){const v=p.clone().project(camera),x=(v.x+1)*innerWidth/2,y=(1-v.y)*innerHeight/2,r=[x-w/2,y-32,x+w/2,y];
     b.hidden=v.z>1||v.z<-1||r[0]<10||r[2]>innerWidth-10||y<140||y>innerHeight-112||count>11||occupied.some(o=>r[0]<o[2]+8&&r[2]>o[0]-8&&r[1]<o[3]+8&&r[3]>o[1]-8);
     if(!b.hidden){b.style.left=x+'px';b.style.top=y+'px';occupied.push(r);count++;}
    }
   }
  },
  getState:()=>({routeSegments:routeCount,trackSegments:trail.children.length,markerVisible:marker.visible,headingVisible:marker.visible&&arrow.visible})
 };
}
