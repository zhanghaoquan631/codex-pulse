import {nanaoGeoData,projectNanao} from './nanao-geo-data.mjs';
import {clipPolygon,lineRectangle} from './map-geometry.mjs';
const B={minX:-30,maxX:70,minZ:-32,maxZ:63};
const source=id=>nanaoGeoData.ways.find(w=>w.id===id);
const points=id=>source(id).geometry.map(projectNanao);
// Extract the continuous local coastline; close on the landward/east side.
const coast=points(576560533).filter(p=>p.z>=-42&&p.z<=73&&p.x>-35&&p.x<90);
const land=clipPolygon([...coast,{x:100,z:73},{x:100,z:-42}],B);
const pier=lineRectangle({x:-1,z:-.7},{x:12.4,z:9.5},4.2);
const tower={x:0,z:0};
const roadIds=[817501267,818965751,818965752,818965754,818965755,818965756,818965757,1200042861,1200042862,1200042863,1416482797];
export const nanaoLayout={origin:nanaoGeoData.origin,scale:nanaoGeoData.scale,bounds:B,coast,land,pier,tower,
  roads:roadIds.map(id=>({id,name:source(id).tags.name||'沿线连接路',points:points(id),width:source(id).tags.highway==='service'?2.7:4.1})),
  park:clipPolygon(points(818965750),B),parking:points(578001762),wood:points(818965753),battery:points(1416482796),bridge:points(320163307),
};
const wall=(id,x,z,w,d,height=2.8,extra={})=>({id,x,z,w,d,height,kind:'na-wall',...extra});
const room={x:12,z:50,w:11,d:11};
const enemies=Array.from({length:25},(_,i)=>({id:['coast-shade','coast-archer','coast-brute','coast-ink','coast-crab-shallows'][i]||`coast-wave-${i}`,type:['doodler','crab','shade','lantern','archer','inkling','brute'][i%7],x:20+i%4*2,z:20+Math.floor(i/4)*2,rank:1+Math.floor(i/9)}));
export const nanaoChapter={
  id:'lighthouse',placeId:'lighthouse',title:'第四章 · 长山归航',shortTitle:'南澳长山尾',theme:'coast',region:'南澳岛',ll:[116.94145,23.4343],layout:'osm-nanao-coast',
  geoReference:{origin:nanaoGeoData.origin,scale:nanaoGeoData.scale,checkedAt:'2026-09-12',precision:'OSM水平位置；游戏道路加宽；无实测高程'},
  art:{accent:0xbd4e43,sky:0xf0ecdf,water:0xb9d3cf,identity:'红灯桩 · 西岸海湾 · 启航广场'},
  landform:{type:'flat-mapped-coast',note:'保留OSM海岸和道路形状。地面为游戏平面基准，无DEM；码头通道为操作加宽。'},
  sourceNote:'长山尾灯塔、码头、广场绿地、停车场、环岛公路与炮台轮廓依据 2026-09-12 请求的 OSM 数据。任务棚与敌人属于游戏创作。',
  description:'从环岛公路入口沿真实西岸南行，在启航广场、停车场与炮台外围收集密码，最后进入南侧守灯任务棚。',
  objectiveText:'主动墨潮 → 路标密码与击杀半钥 → 沿西岸赶往守灯棚 → 首领现身',
  bounds:B,walkablePolygons:[land,pier],spawn:{x:60,z:-25},exit:{x:room.x+1,z:room.z-1,radius:3.5},
  lighting:{time:'海风薄暮'},
  walls:[
    wall('na-room-west',room.x-5.5,room.z,.28,11),wall('na-room-south',room.x,room.z+5.5,11,.28),wall('na-room-east',room.x+5.5,room.z,.28,11),
    wall('na-room-front-left',room.x-4,room.z-5.5,3,.28),wall('na-room-front-right',room.x+4,room.z-5.5,3,.28),
    wall('na-lighthouse-core',0,0,1.65,1.65,8,{kind:'na-tower'}),
    ...points(1416482796).slice(1).map((p,i)=>{const a=points(1416482796)[i],length=Math.hypot(p.x-a.x,p.z-a.z);return wall(`na-battery-${i}`,(p.x+a.x)/2,(p.z+a.z)/2,length,.25,3,{rotation:Math.atan2(-(p.z-a.z),p.x-a.x),kind:'na-battery'});}),
    wall('na-cover-1',18,25,1.4,2.2,1.1,{kind:'na-crate'}),wall('na-cover-2',36,5,1.4,2,1.1,{kind:'na-crate'}),
  ],
  doors:[{id:'harbour-door',x:61,z:-17,w:3.5,d:.22,open:true,height:2.2,label:'行商营地木门'},
    {id:'beacon-gate',x:room.x,z:room.z-5.5,w:5,d:.28,open:false,locked:true,height:2.5,label:'守灯任务棚 · 密码门'}],
  collectibles:[{id:'beacon-core-1',x:-11,z:30,kind:'clue',symbol:'潮',name:'广场路标 · 潮'},
    {id:'beacon-core-2',x:53,z:25,kind:'clue',symbol:'灯',name:'炮台外围路标 · 灯'},
    {id:'beacon-core-3',x:15,z:31,kind:'clue',symbol:'归',name:'停车场路标 · 归'}],switches:[],
  npcs:[{id:'coast-merchant',type:'merchant',name:'长山尾行商',x:54,z:-17}],
  enemies:[...enemies,{id:'mist-boss',type:'boss',name:'雾海守影',x:room.x-1,z:room.z+2,hp:260,damage:17,rank:3}],
  goals:{boss:true},reward:{xp:340,gold:300},decorations:[],
};

export function drawNanao({THREE,root,level,mesh,box,cylinder,stroke,mat,label,outline,geo,colors,tagStructure,tagNew}){
  function polygon(points,y,color){
    if(points.length<3)return;
    const p=points[0].x===points.at(-1).x&&points[0].z===points.at(-1).z?points.slice(0,-1):points;
    const triangles=THREE.ShapeUtils.triangulateShape(p.map(q=>new THREE.Vector2(q.x,q.z)),[]),v=[];
    for(const tri of triangles)for(const i of tri)v.push(p[i].x,y,p[i].z);
    const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();mesh(g,mat(color,{side:THREE.DoubleSide}),0,0,0,root,false);
  }
  polygon([{x:-180,z:-100},{x:180,z:-100},{x:180,z:180},{x:-180,z:180}],-.55,colors.water);
  polygon(nanaoLayout.land,0,colors.paper);polygon(nanaoLayout.park,.015,colors.wall);polygon(nanaoLayout.parking,.018,colors.stone);polygon(nanaoLayout.wood,.018,colors.stone);
  polygon(pier,.025,colors.paper);stroke([...pier,pier[0]].map(p=>[p.x,.04,p.z]));
  stroke(coast.map(p=>[p.x,.06,p.z]));
  for(const r of nanaoLayout.roads)for(let i=1;i<r.points.length;i++){
    const a=r.points[i-1],b=r.points[i];polygon(clipPolygon(lineRectangle(a,b,r.width),B),.028,colors.wall);
    stroke([[a.x,.037,a.z],[b.x,.037,b.z]]);
  }
  for(let i=0;i<32;i++){const x=-75+(i*13.7)%92,z=-30+(i*19.3)%120;if(x>-18&&z>18)continue;stroke([[x,-.49,z],[x+1.5,-.49,z+.09],[x+3.5,-.49,z]],root,false);}
  // Red metal light beacon and dark cap; vertical dimensions are illustrative.
  const towerStart=root.children.length;
  cylinder(0,.05,0,.65,.95,6.5,colors.red);cylinder(0,6.55,0,1,1,.25,colors.ink);
  cylinder(0,6.8,0,.55,.55,1,colors.glow);cylinder(0,7.8,0,.12,1,.8,colors.ink);
  tagNew?.(root,towerStart,'na-lighthouse-core');
  const towerLabel=label('长山尾灯塔',0,3,1.04,2.8);tagStructure?.(towerLabel,'na-lighthouse-core');label('启航广场 · 西岸',-11,2.5,29,4.4);label('南澳环岛公路',54,3,-21,5);
  label('长山尾炮台',49,4.1,37,4.6);label('守灯任务棚 · 游戏场景',room.x,3,room.z-5.6,6);
  label('长山尾轮渡码头',20,2.7,8,4.8);
  for(const w of level.walls){if(!w.kind?.startsWith('na-')||w.kind==='na-tower')continue;
    const g=new THREE.Group();g.position.set(w.x,0,w.z);g.rotation.y=w.rotation||0;root.add(g);
    tagStructure?.(g,w.id);
    box(0,0,0,w.w,w.height,w.d,w.kind==='na-crate'?colors.wood:colors.stone,g);
  }
  // Open roof allows third-person camera visibility; no claim of surveyed interior.
  for(const side of [-1,1])box(room.x+side*5.5,2.8,room.z,.2,.25,11,colors.wood);
  for(const p of [{x:-11,z:23},{x:-16,z:38},{x:33,z:-5},{x:37,z:-13},{x:42,z:-8}]){
    cylinder(p.x,0,p.z,.16,.22,3.1,colors.wood);
    for(let i=0;i<5;i++){const leaf=box(p.x,3.1,p.z,.35,.09,3.2,colors.stone);leaf.rotation.y=i*Math.PI/5;}
  }
  // The bridge continues northwest in the actual OSM geometry, in the background.
  const bridge=nanaoLayout.bridge;
  for(let i=1;i<bridge.length;i++){const a=bridge[i-1],b=bridge[i];if(Math.max(a.x,b.x)<-190)continue;const length=Math.hypot(b.x-a.x,b.z-a.z),g=new THREE.Group();g.position.set((a.x+b.x)/2,0,(a.z+b.z)/2);g.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);root.add(g);box(0,5,0,3,.35,length,colors.stone,g);cylinder(0,-.5,0,.35,.45,5.5,colors.stone,g);}
}
