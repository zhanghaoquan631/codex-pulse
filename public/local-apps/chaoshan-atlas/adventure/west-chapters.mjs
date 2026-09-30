/** Four independent OSM-derived chapters. All Y dimensions are game design.
 * Integration: copy this file, west-layout-data.mjs, west-geo-data.mjs and
 * west-sources.json beside world.mjs. Route level.layout via drawWestScene(ctx).
 * Common world code owns interactive doors/collectibles/NPCs/enemies; do not
 * re-render generic walls/ground for these mapped layouts.
 */
import {westLayouts} from './west-layout-data.mjs';
export {westLayouts};
export {westGeoData} from './west-geo-data.mjs';
export const deanliChapter=westLayouts.deanli.rawLevel;
export const wenguangChapter=westLayouts.wenguang.rawLevel;
export const cuihuChapter=westLayouts.cuihu.rawLevel;
export const chenChapter=westLayouts.chen.rawLevel;
export const westChapters=[deanliChapter,wenguangChapter,cuihuChapter,chenChapter];
export const westChapterById=Object.fromEntries(westChapters.map(l=>[l.id,l]));
const pairs=ps=>ps.map((p,i)=>[p,ps[(i+1)%ps.length]]);
const point=(p,y)=>[p.x,y,p.z];

function draw(ctx,key){
  const {THREE,root,level,mesh,box,cylinder,stroke,mat,label,geo,colors,tagStructure,tagNew}=ctx,L=westLayouts[key],first=root.children.length;
  const ink=colors.ink,paper=colors.paper,roofColor=colors.roof??ink;
  function surface(polygons,y,color,name){
    const pos=[];
    for(let ps of polygons){
      if(ps.length>3&&Math.hypot(ps[0].x-ps.at(-1).x,ps[0].z-ps.at(-1).z)<1e-7)ps=ps.slice(0,-1);
      if(ps.length<3)continue;
      const tris=THREE.ShapeUtils.triangulateShape(ps.map(p=>new THREE.Vector2(p.x,p.z)),[]);
      for(const tri of tris)for(const i of tri)pos.push(ps[i].x,y,ps[i].z);
    }
    if(!pos.length)return;
    const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();
    const m=mesh(g,mat(color,{side:THREE.DoubleSide}),0,0,0,root,false);m.name=name;return m;
  }
  function solid(ps,h,color,name,base=0){
    const positions=[];
    for(const[a,b]of pairs(ps))positions.push(a.x,base,a.z,b.x,base,b.z,b.x,base+h,b.z,a.x,base,a.z,b.x,base+h,b.z,a.x,base+h,a.z);
    const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
    const m=mesh(g,mat(color,{side:THREE.DoubleSide}),0,0,0,root,false);m.name=name;
    surface([ps],base+h,color,`${name}-top`);
    stroke([...ps,ps[0]].map(p=>point(p,base+h)),root,false);
    for(const p of ps)stroke([[p.x,base,p.z],[p.x,base+h,p.z]],root,false);
  }
  function pitchedRoof(ps,h){
    const cx=ps.reduce((v,p)=>v+p.x,0)/ps.length,cz=ps.reduce((v,p)=>v+p.z,0)/ps.length;
    const pos=[];
    for(const[a,b]of pairs(ps))pos.push(a.x,h,a.z,b.x,h,b.z,cx,h+1.15,cz);
    const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();mesh(g,mat(roofColor,{side:THREE.DoubleSide}),0,0,0,root,false);
    for(const p of ps)stroke([[p.x,h,p.z],[cx,h+1.15,cz]],root,false);
  }
  function facade(ps,h,nanyang){
    for(const[a,b]of pairs(ps)){
      const len=Math.hypot(b.x-a.x,b.z-a.z);if(len<4.5)continue;
      const dx=(b.x-a.x)/len,dz=(b.z-a.z)/len,nx=-dz*.12,nz=dx*.12;
      const count=Math.min(5,Math.floor(len/5));
      for(let i=0;i<count;i++){
        const t=(i+.5)/count,x=a.x+(b.x-a.x)*t+nx,z=a.z+(b.z-a.z)*t+nz,y=Math.min(2.3,h*.55),w=.7;
        const points=[[-w,0],[-w,1],[-w*.72,1.4],[0,1.6],[w*.72,1.4],[w,1],[w,0]];
        if(nanyang)stroke(points.map(([u,v])=>[x+u*dx,y+v,z+u*dz]),root,false);
        else stroke([[-w,0],[-w,1],[w,1],[w,0],[-w,0]].map(([u,v])=>[x+u*dx,y+v,z+u*dz]),root,false);
      }
    }
  }
  surface(level.walkablePolygons||L.rawLevel.walkablePolygons,0,paper,`${key}-ground`);
  surface(L.water.map(w=>w.points),-.28,colors.water,`${key}-osm-water`);
  for(const w of L.water){stroke([...w.points,w.points[0]].map(p=>point(p,.02)),root,false);}
  for(const paving of L.pavings){surface([paving.points],.014,colors.stone,`${key}-paving`);stroke([...paving.points,paving.points[0]].map(p=>point(p,.025)),root,false);}
  const roadFaces=[];
  for(const road of L.roads){
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],len=Math.hypot(b.x-a.x,b.z-a.z);if(len<.01)continue;
      const dx=(b.x-a.x)/len,dz=(b.z-a.z)/len,w=road.width/2;
      roadFaces.push([{x:a.x-dz*w,z:a.z+dx*w},{x:b.x-dz*w,z:b.z+dx*w},{x:b.x+dz*w,z:b.z-dx*w},{x:a.x+dz*w,z:a.z-dx*w}]);
      stroke([[a.x,.039,a.z],[b.x,.039,b.z]],root,false);
    }
  }
  surface(roadFaces,.018,colors.stone,`${key}-mapped-roads`);
  for(const b of L.buildings){
    if(b.style==='pagoda')continue;
    const start=root.children.length;
    solid(b.points,b.height,b.style==='nanyang'?paper:colors.wall,`${key}-building-${b.osmWayId}`);
    facade(b.points,b.height,b.style==='nanyang');
    if(key==='chen'&&b.osmWayId%3===0)pitchedRoof(b.points,b.height);
    tagNew?.(root,start,level.walls.find(w=>w.id.startsWith(`${key}-osm-${b.osmWayId}-`))?.id);
  }
  for(const b of L.authoredBuildings){
    if(level.traversal?.replacedBuildingIds?.includes(b.id))continue;
    const start=root.children.length;
    solid(b.points,b.height,b.style==='stone-screen'?colors.stone:paper,b.id);
    if(b.style==='swallowtail'){
      pitchedRoof(b.points,b.height);
      const c=b.points.reduce((o,p)=>({x:o.x+p.x/4,z:o.z+p.z/4}),{x:0,z:0}),ps=b.points;
      // A short forked ridge reads as a swallowtail gable without heavy meshes.
      stroke([[ps[0].x,b.height+.8,c.z],[c.x,b.height+1.25,c.z],[ps[1].x,b.height+.8,c.z]],root,false);
    }else if(b.style==='flat-lookout')box((b.points[0].x+b.points[2].x)/2,b.height-.12,(b.points[0].z+b.points[2].z)/2,7,.12,7,colors.stone);
    tagNew?.(root,start,b.id);
  }
  // These boxes are the exact authored collision solids, not extra decorative blockers.
  for(const w of level.walls||L.rawLevel.walls){
    if(!['west-task','west-fence','west-column'].includes(w.kind))continue;
    const g=new THREE.Group();g.name=w.id;g.position.set(w.x,w.baseY||0,w.z);g.rotation.y=w.rotation||0;root.add(g);
    tagStructure?.(g,w.id);
    box(0,0,0,w.w,w.height,w.d,w.kind==='west-column'?colors.red:paper,g);
    if(w.kind==='west-fence')box(0,w.height,0,w.w,.14,w.d+.18,roofColor,g);
  }
  if(key==='wenguang'){
    const start=root.children.length;
    const p=L.buildings.find(b=>b.style==='pagoda'),cx=p.points.reduce((v,a)=>v+a.x,0)/p.points.length,cz=p.points.reduce((v,a)=>v+a.z,0)/p.points.length;
    // Ground storey follows the mapped octagon; upper seven-tier elevation is design.
    solid(p.points,2.7,paper,'wenguang-osm-octagon');
    const radius=Math.max(...p.points.map(a=>Math.hypot(a.x-cx,a.z-cz)));
    for(let tier=0;tier<7;tier++){
      const r=radius*(1-tier*.062),y=2.5+tier*2.55;
      cylinder(cx,y,cz,r*.84,r,2.45,paper,root,8);
      cylinder(cx,y+2.15,cz,r+1,r+.45,.4,roofColor,root,8);
      for(let face=0;face<8;face++){
        const a=face*Math.PI/4,x=cx+Math.sin(a)*r,z=cz+Math.cos(a)*r;
        stroke([[x,y+.6,z],[x,y+1.4,z]],root,false);
      }
    }
    cylinder(cx,20.8,cz,.25,.75,2.2,colors.red,root,8);label('文光塔 · 八面七层',cx,4.5,cz+radius+.3,5.7,ink);
    tagNew?.(root,start,level.walls.find(w=>w.id.startsWith(`${key}-osm-${p.osmWayId}-`))?.id);
    label('中华路 · 棉城',-22,3.3,49,5.5,ink);
  }else if(key==='deanli'){
    for(const[x,z,text]of[[-20,58,'德安里 · 院落示意'],[-10,24,'厅堂 · 天井 · 侧厝']])label(text,x,3.7,z,6.5,ink);
    label('洪阳大道 · 东侧河岸',55,3.5,59,6.8,ink);
  }else if(key==='cuihu'){
    const start=root.children.length;
    const cx=15,cz=65;
    cylinder(cx,3.8,cz,6.7,7.5,.55,roofColor,root,8);cylinder(cx,4.35,cz,3.8,4.9,1.1,paper,root,8);cylinder(cx,5.45,cz,.3,5.6,1.4,roofColor,root,8);
    label('仙湖片区 · 亭群示意',15,3.1,73,7,ink);
    tagNew?.(root,start,'cuihu-pavilion-upper');
    label('实际湖岸 · 沿岸环行',-102,3.2,28,6.7,ink);
    // Distant vegetation is line drawing, with no additional solid blockers.
    for(const p of L.rawLevel.spawnSites.filter(s=>s.kind==='corner').slice(2,8)){
      const x=p.x+1.5,z=p.z;stroke([[x,0,z],[x,3.8,z],[x-1.2,2.6,z],[x,4.6,z],[x+1.2,2.6,z],[x,3.8,z]],root,false);
    }
  }else{
    label('陈慈黉故居 · 前美',66,4,20,6.6,ink);
    label('荷花池 · 侨宅巷道',37,2.7,-3,6,ink);
    label('郎中第',-34,4.8,9,4.4,ink);
  }
  const R=L.taskRoom,D=(level.doors||L.rawLevel.doors).find(d=>d.id===R.doorId);
  const sign=label('任务房 · 游戏虚构',D.x,D.height+.6,D.z,6.8,ink);
  if(sign){if(R.facing==='east')sign.rotation.y=Math.PI/2;else if(R.facing==='west')sign.rotation.y=-Math.PI/2;else if(R.facing==='north')sign.rotation.y=Math.PI;}
  root.userData.westStaticBatch=mergeStatic(ctx,first);
  return root.userData.westStaticBatch;
}

/** Merge generated meshes/lines by material. Labels keep their own textures. */
function mergeStatic({THREE,root,geo,isStructureNode},first){
  root.updateMatrixWorld(true);const entries=[],batches=new Map();
  for(const child of root.children.slice(first))child.traverse(o=>{if(!isStructureNode?.(o)&&((o.isMesh&&!Array.isArray(o.material)&&!o.material.map)||o.isLine))entries.push(o);});
  for(const o of entries){
    const mat=o.material;if(!mat||Array.isArray(mat))continue;
    const color=mat.color?.getHex(),key=[o.isLine?'line':'mesh',color,mat.opacity,mat.side,mat.transparent,mat.type].join('/');
    if(!batches.has(key))batches.set(key,{material:mat,line:!!o.isLine,position:[],normal:[],uv:[]});
    const b=batches.get(key),g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);
    const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;if(!p){g.dispose();continue;}
    if(o.isLine&&!o.isLineSegments){for(let i=1;i<p.count;i++)b.position.push(p.getX(i-1),p.getY(i-1),p.getZ(i-1),p.getX(i),p.getY(i),p.getZ(i));}
    else for(let i=0;i<p.count;i++)b.position.push(p.getX(i),p.getY(i),p.getZ(i));
    if(!o.isLine)for(let i=0;i<p.count;i++){b.normal.push(n?n.getX(i):0,n?n.getY(i):1,n?n.getZ(i):0);b.uv.push(u?u.getX(i):0,u?u.getY(i):0);}
    g.dispose();o.parent?.remove(o);
  }
  for(const b of batches.values()){
    const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(b.position,3));
    if(!b.line){g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));}
    root.add(b.line?new THREE.LineSegments(g,b.material):new THREE.Mesh(g,b.material));
  }
  const prune=o=>{for(const c of [...o.children]){prune(c);if(c.isGroup&&!c.children.length)o.remove(c);}};prune(root);
  return {inputObjects:entries.length,batches:batches.size,method:'Offline-designed static geometry; merged at construction. No WebGL acceptance claimed.'};
}
export const drawDeanli=ctx=>draw(ctx,'deanli');
export const drawWenguang=ctx=>draw(ctx,'wenguang');
export const drawCuihu=ctx=>draw(ctx,'cuihu');
export const drawChen=ctx=>draw(ctx,'chen');
export const westDrawers={'osm-west-deanli':drawDeanli,'osm-west-wenguang':drawWenguang,'osm-west-cuihu':drawCuihu,'osm-west-chen':drawChen};
export function drawWestScene(ctx){const fn=westDrawers[ctx.level.layout];if(!fn)throw new Error(`Unsupported west chapter layout: ${ctx.level.layout}`);return fn(ctx);}
