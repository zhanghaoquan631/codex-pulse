import * as THREE from 'three';
import {groundHeight,groundRange} from './landforms.mjs';
import {createInkMaterial,createInkLineMaterial,INK_COLORS} from './ink-materials.mjs';
import {drawSmallPark} from './small-park-scene.mjs';
import {drawGuangji} from './guangji-scene.mjs';
import {westDrawers} from './west-chapters.mjs';
import {eastDrawers} from './east-chapters.mjs';
import {drawLegacyPerches} from './legacy-perches.mjs';
import {drawJieyang} from './jieyang-scene.mjs';
import {drawNanao} from './nanao-scene.mjs';
import {drawBuildingInteriors} from './building-interiors-view.mjs';
import {drawWorldBoundaries} from './world-boundaries.mjs';
import {createStructureRegistry,createStructureView} from './structure-view.mjs';
import {createCivilianView} from './civilian-view.mjs';

/** Original procedural environment, in metres. Characters are rendered by main.mjs. */
export function buildWorld(scene, level) {
  const root=new THREE.Group();root.name=`world-${level.id}`;scene.add(root);
  const structureRegistry=createStructureRegistry(level),structureHooks=structureRegistry.hooks;
  const doors=new Map(),switches=new Map(),collectibles=new Map(),materials=new Map();
  const cube=new THREE.BoxGeometry(1,1,1),resources=new Set([cube]),textures=new Set(),edgeGeometries=new Map();
  const previousBackground=scene.background,previousFog=scene.fog;
  const colors={paper:0xf6f1e5,wall:0xeee8da,stone:0xc6c3b9,wood:0xd5cebd,roof:0x878b87,ink:0x242a29,gold:0xe2b957,red:0xb95b4f,glow:0x65b6a1,accent:level.art?.accent??0xb95b4f,water:level.art?.water??0xb9d3cf};
  const inkMaterial=createInkLineMaterial(INK_COLORS.blue,{transparent:true,opacity:.95});materials.set('ink-lines',inkMaterial);
  const silhouetteMaterial=new THREE.MeshBasicMaterial({color:INK_COLORS.blue,side:THREE.BackSide});materials.set('ink-silhouette',silhouetteMaterial);
  let elapsed=0,disposed=false;
  const geo=g=>(resources.add(g),g);
  function mat(color,extra={}){
    const key=JSON.stringify([color,extra]);
    const {roughness,metalness,emissive,emissiveIntensity,paperClean=false,...options}=extra;
    if(paperClean){if(!materials.has(key))materials.set(key,new THREE.MeshBasicMaterial({color,toneMapped:false,...options}));return materials.get(key);}
    // Legacy decorative colours become three pencil-wash values; functional marks retain colour.
    let tint=color;
    if(!Object.values(colors).includes(color)){
      const value=new THREE.Color(color);const l=value.r*.21+value.g*.72+value.b*.07;
      tint=l>.48?colors.wall:l>.18?colors.stone:colors.roof;
    }
    const ink=color===colors.red?INK_COLORS.red:color===colors.glow?INK_COLORS.green:color===colors.gold?INK_COLORS.orange:INK_COLORS.blue;
    const tone=tint===colors.paper?.05:tint===colors.wall?.12:tint===colors.roof?.30:tint===colors.ink?.42:.18;
    // Keep large architectural faces a quiet paper wash; dense screen-space
    // crosshatching on adjacent façades reads as a mosaic at close range.
    if([colors.wall,colors.roof,colors.stone].includes(tint)){
      const wash=tint===colors.roof?0xc5c7c0:tint===colors.stone?0xe2dfd3:0xf0ebdc;
      if(!materials.has(key))materials.set(key,new THREE.MeshBasicMaterial({color:wash,toneMapped:false,...options}));
      return materials.get(key);
    }
    if(!materials.has(key))materials.set(key,createInkMaterial({ink,paper:INK_COLORS.paper,tone,accent:color===colors.water?.12:.035,spacing:14,...options}));
    return materials.get(key);
  }
  function mesh(geometry,material,x=0,y=0,z=0,parent=root,grounded=true){
    const m=new THREE.Mesh(geometry,material);m.position.set(x,y+(parent===root&&grounded?groundHeight(level,x,z):0),z);m.castShadow=false;m.receiveShadow=false;parent.add(m);return m;
  }
  function outline(m,threshold=35){
    const key=`${m.geometry.uuid}:${threshold}`;
    if(!edgeGeometries.has(key))edgeGeometries.set(key,geo(new THREE.EdgesGeometry(m.geometry,threshold)));
    const edge=new THREE.LineSegments(edgeGeometries.get(key),inkMaterial);edge.name='ink-contour';m.add(edge);return m;
  }
  function stroke(points,parent=root,grounded=true){
    const g=geo(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],p[1]+(parent===root&&grounded?groundHeight(level,p[0],p[2]):0),p[2]))));
    const line=new THREE.Line(g,inkMaterial);parent.add(line);return line;
  }
  function box(x,y,z,w,h,d,color,parent=root,extra={}){const m=mesh(cube,mat(color,extra),x,y+h/2,z,parent);m.scale.set(w,h,d);if(Math.max(w,h,d)>.35&&Math.min(w,h,d)>.075&&!extra.transparent)outline(m);return m;}
  function cylinder(x,y,z,rTop,rBottom,h,color,parent=root,segments=12,extra={}){
    const m=mesh(geo(new THREE.CylinderGeometry(rTop,rBottom,h,segments)),mat(color,extra),x,y+h/2,z,parent);if(rBottom>.2)outline(m,55);return m;
  }
  function ring(x,y,z,r,color,parent=root,tube=.07){
    const geometry=geo(new THREE.TorusGeometry(r,tube,6,40));geometry.rotateX(Math.PI/2);
    if(parent===root){
      const datum=groundHeight(level,x,z),positions=geometry.attributes.position;
      for(let i=0;i<positions.count;i++)positions.setY(i,positions.getY(i)+groundHeight(level,x+positions.getX(i),z+positions.getZ(i))-datum);
      positions.needsUpdate=true;geometry.computeVertexNormals();
    }
    return mesh(geometry,mat(color,{emissive:color,emissiveIntensity:.4}),x,y,z,parent);
  }
  function label(text,x,y,z,width=5,color=0x384b48,parent=root){
    if(typeof document==='undefined')return;
    const c=document.createElement('canvas');c.width=640;c.height=160;
    const ctx=c.getContext('2d');if(!ctx)return;
    const draw=()=>{
    ctx.fillStyle='#f4efdd';ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle='#244c73';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(12,15);ctx.lineTo(628,10);ctx.lineTo(631,146);ctx.lineTo(9,150);ctx.closePath();ctx.stroke();
    ctx.lineWidth=1.5;ctx.strokeRect(17,21,607,120);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#244c73';ctx.font='600 57px "Sketch Han", cursive';ctx.fillText(text,320,84,575);
    ctx.fillStyle=`#${colors.accent.toString(16).padStart(6,'0')}`;ctx.fillRect(598,112,20,20);
    };draw();
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);
    document.fonts?.load('500 48px "Sketch Han"',text).then(()=>{if(disposed)return;draw();texture.needsUpdate=true;}).catch(()=>{});
    const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide});materials.set(`label-${textures.size}`,material);
    const plane=mesh(geo(new THREE.PlaneGeometry(width,width/4)),material,x,y,z,parent);
    const back=new THREE.Mesh(plane.geometry,material);back.rotation.y=Math.PI;back.position.z=-.003;plane.add(back);
    return plane;
  }
  const b=level.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
  const mapped=level.layout && level.layout!=='osm-small-park-five-roads';
  const settings=level.lighting||{};
  const paperSky=level.art?.sky??0xf0ecdf;
  scene.background=new THREE.Color(paperSky);scene.fog=new THREE.Fog(paperSky,68,145);
  const ambient=new THREE.HemisphereLight(0xfffaf0,0x8b908a,1.65);root.add(ambient);
  const sun=new THREE.DirectionalLight(0xfffaf0,1.25);sun.position.set(-22,40,18);sun.castShadow=false;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;sun.shadow.bias=-.0003;
  sun.target.position.set(cx,0,cz);root.add(sun,sun.target);
  const groundColor=colors.paper;
  const stairRows=[];
  if(level.theme==='tower'&&!mapped)for(let i=0;i<10;i++){
    const target=.06+i*.12;let lo=0,hi=1;
    for(let j=0;j<24;j++){const t=(lo+hi)/2;if(1.2*t*t*(3-2*t)<target)lo=t;else hi=t;}
    stairRows.push(16-(lo+hi)*5);
  }
  function terrainSurface(x,z,width,depth,color=groundColor,step=1){
    const wx=Math.max(1,Math.ceil(width/step)),wz=Math.max(1,Math.ceil(depth/step)),positions=[],indices=[];
    const xs=Array.from({length:wx+1},(_,i)=>x-width/2+i/wx*width),zs=Array.from({length:wz+1},(_,i)=>z-depth/2+i/wz*depth);
    if(level.theme==='tower'){
      for(const px of [-6.001,-5.999,5.999,6.001])if(px>x-width/2&&px<x+width/2)xs.push(px);
      for(const row of stairRows)for(const pz of[row-.001,row+.001])if(pz>z-depth/2&&pz<z+depth/2)zs.push(pz);
      xs.sort((a,b)=>a-b);zs.sort((a,b)=>a-b);
    }
    const nx=xs.length-1,nz=zs.length-1;
    for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
      const px=xs[ix],pz=zs[iz];positions.push(px,groundHeight(level,px,pz),pz);
    }
    for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const a=iz*(nx+1)+ix;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
    const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const surface=mesh(geometry,mat(color),0,0,0,root,false);surface.name='shared-height-terrain';
    // Filled cut edge down to a constant datum: raised banks never float above water.
    const edge=[];for(let ix=0;ix<=nx;ix++)edge.push([xs[ix],zs[0]]);for(let iz=1;iz<=nz;iz++)edge.push([xs[nx],zs[iz]]);for(let ix=nx-1;ix>=0;ix--)edge.push([xs[ix],zs[nz]]);for(let iz=nz-1;iz>=0;iz--)edge.push([xs[0],zs[iz]]);
    const sides=[];for(let i=1;i<edge.length;i++){const a=edge[i-1],b=edge[i],ah=groundHeight(level,...a),bh=groundHeight(level,...b);sides.push(a[0],-.65,a[1],a[0],ah,a[1],b[0],bh,b[1],a[0],-.65,a[1],b[0],bh,b[1],b[0],-.65,b[1]);}
    const skirt=geo(new THREE.BufferGeometry());skirt.setAttribute('position',new THREE.Float32BufferAttribute(sides,3));skirt.computeVertexNormals();mesh(skirt,mat(colors.stone,{side:THREE.DoubleSide}),0,0,0,root,false);
    return surface;
  }
  function paving(x,z,width,depth,color=groundColor){
    terrainSurface(x,z,width,depth,color,level.theme==='arcade'?4:1);
    // Short broken paving strokes suggest a drawn surface without a dense grid.
    for(let i=0;i<Math.ceil(width*depth/65);i++){
      const px=x-width*.44+((i*7.13)%(width*.88)),pz=z-depth*.44+((i*11.31)%(depth*.88));
      stroke([[px,.012,pz],[px+.9,.014,pz+.04],[px+1.45,.012,pz-.035]]);
    }
  }
  if(mapped){
    const draw=westDrawers[level.layout]||eastDrawers[level.id]||{'osm-guangji-bridge':drawGuangji,'osm-guangji':drawGuangji,'osm-jieyang-square':drawJieyang,'osm-nanao-coast':drawNanao}[level.layout];
    if(!draw)throw new Error(`Unknown mapped layout: ${level.layout}`);
    if(eastDrawers[level.id]){
      // These mapped chapters author absolute Y from a shared slope profile.
      // A zero-origin child avoids the legacy helpers adding ground twice.
      const absolute=new THREE.Group();absolute.name='mapped-absolute-height';root.add(absolute);
      const withParent=(fn,index)=>(...args)=>{if(args[index]===undefined)args[index]=absolute;return fn(...args);};
      draw({THREE,root:absolute,level,mesh:withParent(mesh,5),box:withParent(box,7),cylinder:withParent(cylinder,8),stroke:withParent(stroke,1),mat,label:withParent(label,6),outline,geo,colors,...structureHooks});
    }else draw({THREE,root,level,mesh,box,cylinder,stroke,mat,label,outline,geo,colors,...structureHooks});
  }else if(level.theme==='bridge'){
    paving(0,13,24,8);paving(0,-48.5,24,13);
  }else if(level.theme==='coast'){
    // Island footprint is a designed local arena, not the atlas miniature scaled up.
    terrainSurface(cx,cz,w,d,groundColor,1);
    const foot=mesh(geo(new THREE.CylinderGeometry(5.1,5.8,.18,40)),mat(0xcbc2a6),0,-.02,-10);
    ring(0,.02,-10,8,0x82968f,root,.12);ring(0,.02,-10,11,0xa5a990,root,.07);
    for(let z=-27;z<28;z+=3)stroke([[-11.5,.014,z],[-10,.014,z+.06],[-8.5,.014,z]]);
  }else paving(cx,cz,w,d);
  if(level.theme==='tower')for(const z of stairRows)stroke([[-5.9,.018,z-.002],[0,.018,z-.002],[5.9,.018,z-.002]]);
  if(level.theme==='coast'&&!mapped)for(const height of [.4,.9,1.3])for(const side of[-1,1]){
    const points=[];
    for(let x=11;x<=27;x+=1){let lo=-4,hi=14;const px=x*side;for(let i=0;i<20;i++){const z=(lo+hi)/2;if(groundHeight(level,px,z)>height)lo=z;else hi=z;}points.push([px,.015,(lo+hi)/2]);}
    stroke(points);
  }
  if(!mapped&&(level.theme==='bridge'||level.theme==='coast')){
    const water=mesh(geo(new THREE.PlaneGeometry(w+110,d+95)),mat(level.art?.water??0xb9d3cf,{transparent:true,opacity:.85}),cx,-.77,cz,root,false);
    water.rotation.x=-Math.PI/2;water.castShadow=false;
    for(let i=0;i<45;i++){
      const wx=cx-w/2-40+(i*17.3)%(w+80),wz=cz-d/2-35+(i*11.9)%(d+70);
      if(level.theme==='coast'&&wx>b.minX&&wx<b.maxX&&wz>b.minZ&&wz<b.maxZ)continue;
      if(level.theme==='bridge'&&Math.abs(wx)<4.4)continue;
      stroke([[wx,-.745,wz],[wx+.8,-.745,wz+.07],[wx+1.8+(i%3),-.745,wz]],root,false);
    }
  }
  if(level.layout==='osm-small-park-five-roads')drawSmallPark({THREE,root,level,mesh,box,cylinder,stroke,mat,label,outline,geo,colors,...structureHooks});
  for(const item of level.walls||[]){
    if(item.kind==='visible-boundary'||item.kind==='player-block'||item.kind?.startsWith('traversal-'))continue;
    if(item.kind==='game-stand'&&item.visual==='stacked-wood-crates')continue;
    if(westDrawers[level.layout]||eastDrawers[level.id])continue;
    if(item.kind?.startsWith('park-'))continue;
    if(mapped && /^(gq-|jieyang-|na-)/.test(item.kind||''))continue;
    if(item.kind==='invisible')continue;
    if(level.theme==='bridge'&&item.kind==='boundary'&&item.d>item.w)continue;
    const {x,z,w:ww,d:dd}=item,h=item.height??3.5;
    const visualStart=root.children.length;
    const land=groundRange(level,x,z,ww,dd);
    if(item.kind!=='railing'&&land.center-land.min>.05)box(x,land.min-land.center-.08,z,ww,land.center-land.min+.08,dd,colors.stone);
    if(item.kind==='rock'){
      const m=mesh(geo(new THREE.DodecahedronGeometry(1,0)),mat(level.theme==='coast'?0x777f78:colors.stone),x,h*.42,z);
      m.scale.set(ww*.52,h*.64,dd*.52);m.rotation.y=(x*.1+z*.02);outline(m,32);continue;
    }
    if(item.kind==='railing'){
      const count=Math.ceil(dd/2.2);
      for(let i=0;i<count;i++){
        const pz=z-dd/2+(i+.5)/count*dd,part=dd/count+.015;
        box(x,.13,pz,ww,.17,part,colors.stone);box(x,.88,pz,ww+.06,.14,part,colors.stone);
      }
      for(let i=0;i<=count;i++)box(x,0,z-dd/2+i/count*dd,ww+.14,1.08,.2,colors.stone);
      continue;
    }
    if(item.kind==='column'){
      cylinder(x,0,z,.32,.35,h,colors.red);box(x,0,z,.95,.25,.95,colors.stone);structureHooks.tagNew(root,visualStart,item.id);continue;
    }
    if(item.kind==='crate'){
      box(x,0,z,ww,h,dd,0x9e7851);box(x-.06,0,z,ww+.06,.12,dd+.06,0x664f39);box(x-.06,h-.17,z,ww+.06,.12,dd+.06,0x664f39);
      structureHooks.tagNew(root,visualStart,item.id);
      continue;
    }
    if(item.kind==='basin'){
      box(x,0,z,ww,h,dd,0x737f77);box(x,.65,z,ww-.4,.035,dd-.4,0x73a9a4);continue;
    }
    const color=item.kind==='boundary'?0x8b9a88:item.kind==='counter'?0x926746:item.kind==='stone'?0x8d9388:colors.wall;
    const node=box(x,0,z,ww,h,dd,color);node.name=item.id;
    if(item.kind==='building'){
      box(x,h,z,ww+.45,.3,dd+.45,colors.roof);
      for(let ix=-ww/2+1.3;ix<ww/2;ix+=2.7){
        for(const side of [-1,1]){
          const face=z+side*(dd/2+.035);
          box(x+ix,3.8,face,.9,1.25,.09,colors.stone);
          stroke([[x+ix,3.83,face+side*.055],[x+ix,5,face+side*.055]]);
          stroke([[x+ix-.42,4.39,face+side*.055],[x+ix+.42,4.39,face+side*.055]]);
          // Arches sit on the existing solid facade; they do not invent a walkable opening.
          const points=[[x+ix-.7,.12,face+side*.065],[x+ix-.7,2.1,face+side*.065]];
          for(let j=0;j<=12;j++){const a=Math.PI-j*Math.PI/12;points.push([x+ix+Math.cos(a)*.7,2.1+Math.sin(a)*.65,face+side*.065]);}
          points.push([x+ix+.7,.12,face+side*.065]);stroke(points);
        }
      }
      box(x,3.32,z,ww+.22,.15,dd+.22,colors.paper);
      box(x,h+.3,z,ww*.82,.6,dd*.76,colors.wall);
    }else if(item.kind!=='counter'){
      box(x,h-.16,z,ww+.1,.16,dd+.1,item.kind==='boundary'?0x596e67:colors.roof);
      box(x,0,z,ww+.07,.3,dd+.07,0x999988);
    }
    structureHooks.tagNew(root,visualStart,item.id);
  }
  // Upturned, solid roof contours: low polygon count, no triangulation drawn on faces.
  function foldedRoof(x,y,z,width,depth,rise,parent=root,color=colors.roof){
    const rings=[[1,1,.12],[.84,.78,0],[.46,.38,.5],[.32,.02,1]],v=[],idx=[];
    for(const [sx,sz,sy]of rings)for(const [px,pz]of[[-1,-1],[1,-1],[1,1],[-1,1]])v.push(px*width*sx/2,y+sy*rise,pz*depth*sz/2);
    for(let j=0;j<3;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4;idx.push(a,a+4,b,b,a+4,b+4);}
    const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geometry.setIndex(idx);geometry.computeVertexNormals();
    const m=mesh(geometry,mat(color,{side:THREE.DoubleSide}),x,0,z,parent);outline(m,24);
    // Only the silhouette and ridge get an extra pen stroke.
    const datum=parent===root?groundHeight(level,x,z):0;
    for(let r=0;r<4;r++){const points=[];for(let k=0;k<=4;k++){const i=r*12+(k%4)*3;points.push([v[i]+x,v[i+1]+.018+datum,v[i+2]+z]);}stroke(points,parent,false);}
    return m;
  }
  function pavilion(o){
    const g=new THREE.Group();g.position.set(o.x,groundHeight(level,o.x,o.z),o.z);root.add(g);
    const radius=o.radius??3.5,height=o.height??4.5;
    foldedRoof(0,height,0,radius*2,radius*2,1.05,g);
    foldedRoof(0,height+1.05,0,radius*1.32,radius*1.32,.75,g,colors.stone);
    cylinder(0,height+1.55,0,.11,.11,.35,colors.gold,g,8);
    // Roof support geometry matches the deliberately traversable interior.
    for(let i=0;i<8;i++){const a=i*Math.PI/4;box(Math.cos(a)*radius*.7,height-.18,Math.sin(a)*radius*.7,.12,.22,radius*.75,colors.wood,g).rotation.y=-a;}
  }
  function lantern(o){
    const s=o.scale??1,g=new THREE.Group();g.position.set(o.x,groundHeight(level,o.x,o.z),o.z);g.scale.setScalar(s);root.add(g);
    box(0,0,0,.13,3.2,.13,colors.wood,g);box(.3,3.1,0,.72,.12,.13,colors.wood,g);
    cylinder(.59,2.2,0,.25,.25,.64,colors.red,g,8,{emissive:colors.red,emissiveIntensity:.15});
    cylinder(.59,2.83,0,.33,.26,.12,colors.gold,g,8);cylinder(.59,2.1,0,.08,.08,.12,colors.gold,g,6);
  }
  function tree(o,palm=false){
    const g=new THREE.Group();g.position.set(o.x,groundHeight(level,o.x,o.z),o.z);g.scale.setScalar(o.scale??1);root.add(g);
    cylinder(0,0,0,.16,.27,palm?4.7:2.8,0x76624b,g);
    if(palm){for(let i=0;i<7;i++){const leaf=box(0,4.6,1.3,.42,.11,3.5,0x4e7966,g);leaf.rotation.z=.12;leaf.rotation.y=i*Math.PI*2/7;}}
    else for(let i=0;i<3;i++){const crown=mesh(geo(new THREE.SphereGeometry(1,10,7)),mat(i===1?colors.wall:colors.stone),i===0?0:(i===1?-1:1),3.3+i*.45,0,g);crown.scale.set(1.8,1.3,1.65);const ink=new THREE.Mesh(crown.geometry,silhouetteMaterial);ink.scale.setScalar(1.018);crown.add(ink);}
  }
  for(const o of level.decorations||[]){
    if(o.kind==='pavilion')pavilion(o);
    else if(o.kind==='lantern')lantern(o);
    else if(o.kind==='tree'||o.kind==='palm')tree(o,o.kind==='palm');
    else if(o.kind==='sign')label(o.text,o.x,o.y??3,o.z,Math.min(7,(o.text?.length||5)*.9),o.color);
    else if(o.kind==='tea-set'){
      // Small props live on existing colliding counters, keeping walking space unchanged.
      box(o.x,o.y,o.z,1.2,.06,.7,colors.stone);
      cylinder(o.x-.23,o.y+.06,o.z,.13,.19,.25,colors.paper,root,10);
      cylinder(o.x-.23,o.y+.31,o.z,.14,.14,.035,colors.ink,root,10);
      for(const dx of [.14,.39,.64])cylinder(o.x+dx,o.y+.06,o.z,.074,.06,.1,colors.paper,root,8);
      stroke([[o.x-.24,o.y+.42,o.z],[o.x-.29,o.y+.53,o.z],[o.x-.2,o.y+.66,o.z]]);
    }else if(o.kind==='paper-parcels'){
      for(let i=0;i<3;i++){
        const x=o.x+(i-1)*.7,y=o.y+(i===1?.35:0);box(x,y,o.z,.6,.35,.5,colors.paper);
        box(x,y+.351,o.z,.065,.008,.52,colors.red);box(x,y+.351,o.z,.62,.008,.025,colors.ink);
      }
    }
    else if(o.kind==='bench'){box(o.x,.55,o.z,2.5,.18,.85,colors.wood);box(o.x-.85,0,o.z,.18,.56,.6,colors.stone);box(o.x+.85,0,o.z,.18,.56,.6,colors.stone);}
    else if(o.kind==='bridge-deck'){
      const north=o.z-o.d/2,south=Math.min(9,o.z+o.d/2);
      terrainSurface(o.x,(north+south)/2,o.w,south-north,groundColor,1);
      for(let z=o.z-o.d/2;z<o.z+o.d/2;z+=2.2)stroke([[o.x-o.w/2,.014,z],[o.x+.3,.012,z+.045],[o.x+o.w/2,.014,z]]);
    }else if(o.kind==='pontoon'){
      for(const offset of [-2.7,0,2.7]){
        const x=o.x+offset,deckY=groundHeight(level,x,o.z);
        // Hulls share the river datum; the arched deck rests on short timber supports.
        const boat=mesh(geo(new THREE.CylinderGeometry(.7,.52,o.d,8)),mat(0x775d40),x,-.45,o.z,root,false);boat.rotation.x=Math.PI/2;boat.scale.x=1.4;
        if(deckY>.22)box(x,.22-deckY,o.z,.18,deckY-.22,.18,colors.wood);
      }
    }else if(o.kind==='hall-roof'||o.kind==='cloister-roof'){
      foldedRoof(o.x,o.height,o.z,o.w,o.d,o.kind==='hall-roof'?1.25:.65);
      if(o.kind==='hall-roof'){
        box(o.x,o.height+.95,o.z,o.w*.58,.8,o.d*.53,colors.wall);
        foldedRoof(o.x,o.height+1.65,o.z,o.w*.77,o.d*.73,1.1,root,colors.stone);
        box(o.x,o.height+2.4,o.z,o.w*.39,.65,o.d*.32,colors.wall);
        foldedRoof(o.x,o.height+2.95,o.z,o.w*.56,o.d*.51,.9);
        for(const side of [-1,1])box(o.x+side*o.w*.29,o.height+.94,o.z+o.d*.27,.15,.8,.15,colors.red);
      }
    }else if(o.kind==='stairs'){
      // Front silhouette below the boundary, not a false staircase over the walkable ramp.
      for(let i=0;i<5;i++)box(o.x,-1+i*.17,o.z+i*.7,o.w,.2,o.d-i*.65,colors.stone);
    }else if(o.kind==='lighthouse'){
      cylinder(o.x,0,o.z,o.radius*.7,o.radius,o.height-3,colors.paper,root,16);
      for(const [y,h]of[[0,2],[4,1.8],[8,1.8]]){const bottom=o.radius*(1-.3*y/(o.height-3)),top=o.radius*(1-.3*(y+h)/(o.height-3));cylinder(o.x,y,o.z,top+.018,bottom+.018,h,colors.red,root,16);}
      cylinder(o.x,o.height-3,o.z,o.radius*.72,o.radius*.72,.55,0x354f53,root,32);
      cylinder(o.x,o.height-2.45,o.z,o.radius*.5,o.radius*.5,1.5,0xa9d8c8,root,16,{emissive:0x79cbb4,emissiveIntensity:.4});
      cylinder(o.x,o.height-.95,o.z,.2,o.radius*.78,1.15,0x334a4d,root,16);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;box(o.x+Math.cos(a)*o.radius*.43,o.height-2.5,o.z+Math.sin(a)*o.radius*.43,.16,1.65,.16,0x2c4348);}
      for(let y=2;y<10;y+=3)box(o.x, y, o.z+o.radius*(1-y/(o.height*4)),.9,1.2,.08,0x243b43);
      const beam=mesh(geo(new THREE.ConeGeometry(3.7,28,18,1,true)),new THREE.MeshBasicMaterial({color:0xb4f4cf,transparent:true,opacity:.07,side:THREE.DoubleSide,depthWrite:false}),o.x,o.height-1.75,o.z);
      materials.set('beacon-beam',beam.material);beam.geometry.translate(0,-14,0);beam.rotation.z=Math.PI/2;root.userData.beam=beam;
    }else if(o.kind==='dock'){
      box(o.x,-.22,o.z,o.w,.22,o.d,0x967b58);for(let z=o.z-o.d/2;z<o.z+o.d/2;z+=1)box(o.x,.005,z,o.w,.02,.05,0x665640);
      for(const side of [-1,1])for(let z=o.z-o.d/2;z<o.z+o.d/2;z+=3)cylinder(o.x+side*o.w/2,-1,z,.16,.2,1.4,0x685740);
    }else if(o.kind==='boat'){
      const g=new THREE.Group();g.position.set(o.x,groundHeight(level,o.x,o.z)-.15,o.z);g.rotation.y=o.rotation??0;root.add(g);
      const hull=mesh(geo(new THREE.SphereGeometry(1,12,6)),mat(0x795c43),0,-.3,0,g);hull.scale.set(2,.65,4.1);
      box(0,0,0,3.2,.25,5.5,0x8b7652,g);box(0,.25,0,2.8,1.9,2.5,0xdbd4b2,g);box(0,2.15,0,3.3,.2,3,0x47665b,g);
    }
  }
  for(const item of level.doors||[]){
    const g=new THREE.Group();g.name=item.id;g.position.set(item.x,groundHeight(level,item.x,item.z),item.z);g.rotation.y=item.rotation||0;root.add(g);
    const horizontal=item.w>=item.d,length=horizontal?item.w:item.d,height=item.height??(item.style==='portcullis'?3.35:2.8);
    const pivot=new THREE.Group();g.add(pivot);
    pivot.position.set(horizontal?-length/2:0,0,horizontal?0:-length/2);
    const leaf=box(horizontal?length/2:0,0,horizontal?0:length/2,horizontal?length:.28,height,horizontal?.28:length,colors.wood,pivot);
    if(item.style==='portcullis')leaf.visible=false;
    for(let i=1;i<Math.max(2,Math.floor(length/.55));i++){
      const q=i*length/Math.max(2,Math.floor(length/.55));box(horizontal?q:0,.05,horizontal?0:q,horizontal?.06:.31,height-.1,horizontal?.31:.06,0x493f31,pivot);
    }
    const lock=cylinder(horizontal?length*.6:0,1.35,horizontal?.2:length*.6,.12,.12,.24,colors.gold,pivot,8,{emissive:0xbc8748,emissiveIntensity:.3});
    if(item.style==='portcullis')box(length/2,.5,0,length,.12,.3,colors.ink,pivot);
    box(horizontal?-length/2-.18:0,0,horizontal?0:-length/2-.18,horizontal?.25:.65,height+.35,horizontal?.65:.25,colors.stone,g);
    box(horizontal?length/2+.18:0,0,horizontal?0:length/2+.18,horizontal?.25:.65,height+.35,horizontal?.65:.25,colors.stone,g);
    box(0,height+.25,0,horizontal?length+.6:.65,.3,horizontal?.65:length+.6,colors.roof,g);
    const visual={root:g,pivot,leaf,lock,item,height,horizontal,amount:item.open?1:0};
    pivot.rotation.y=item.open?Math.PI*.5:0;doors.set(item.id,visual);
  }
  for(const item of level.switches||[]){
    const g=new THREE.Group();g.position.set(item.x,item.absoluteY===true?item.y:groundHeight(level,item.x,item.z),item.z);g.name=item.id;root.add(g);
    cylinder(0,0,0,.65,.8,.5,colors.stone,g);box(0,.5,0,.35,1.1,.35,colors.wood,g);
    const wheel=mesh(geo(new THREE.TorusGeometry(.5,.075,6,16)),mat(colors.gold),0,1.25,.23,g);
    box(0,1.18,.23,1.1,.1,.08,colors.wood,g);const halo=ring(0,.04,0,1.0,colors.gold,g);
    switches.set(item.id,{root:g,wheel,halo});
  }
  for(const item of level.collectibles||[]){
    const g=new THREE.Group();g.position.set(item.x,item.absoluteY===true?item.y:groundHeight(level,item.x,item.z),item.z);g.name=item.id;root.add(g);
    const base=ring(0,.04,0,.58,colors.gold,g),float=new THREE.Group();float.position.y=1.05;g.add(float);
    if(item.kind==='supply'){
      box(0,-.25,0,.6,.42,.38,colors.paper,float,{paperClean:true});
      label(item.supplyId==='medkit'?'+':'弹',0,-.02,.21,.4,colors.ink,float);
    }else if(item.symbol){
      cylinder(0,-1.05,0,.035,.045,1,colors.wood,float,6);
      label(item.symbol,0,.02,.1,.72,colors.ink,float);
    }else if(item.kind==='lamp'||item.id.startsWith('beacon')){
      cylinder(0,-.3,0,.18,.2,.6,0xf1c766,float,8,{emissive:0xf4ce68,emissiveIntensity:1});
      cylinder(0,.3,0,.25,.22,.08,colors.wood,float,8);cylinder(0,-.36,0,.25,.22,.08,colors.wood,float,8);
    }else if(item.kind==='key'){
      const bow=mesh(geo(new THREE.TorusGeometry(.2,.065,6,16)),mat(colors.gold,{emissive:colors.gold,emissiveIntensity:.3}),0,.15,0,float);
      box(0,-.32,0,.09,.4,.08,colors.gold,float);box(.11,-.27,0,.18,.08,.08,colors.gold,float);
    }else{
      box(0,-.24,0,.48,.48,.12,0xf0dfb7,float);box(0,-.11,.071,.23,.2,.02,colors.red,float);
    }
    collectibles.set(item.id,{root:g,float,base});
  }
  drawLegacyPerches({THREE,root,level,box,stroke,colors,...structureHooks});
  drawBuildingInteriors({THREE,root,level,box,stroke,colors,label,mat,geo,...structureHooks});
  const boundaries=drawWorldBoundaries({THREE,root,level,mat,geo,lineMaterial:inkMaterial});
  root.userData.structureBatch=structureRegistry.consolidate({THREE,root,geo});
  const structures=createStructureView({THREE,root,level,registry:structureRegistry,label});
  const civilians=createCivilianView(root,level);
  const exit=new THREE.Group();exit.name='chapter-exit';exit.position.set(level.exit.x,groundHeight(level,level.exit.x,level.exit.z),level.exit.z);root.add(exit);
  const exitRing=ring(0,.045,0,level.exit.radius??2.1,0x647d75,exit,.11);
  const exitCore=mesh(geo(new THREE.OctahedronGeometry(.5)),mat(0x78968a,{emissive:0x78968a,emissiveIntensity:.25}),0,1.8,0,exit);
  const exitBeam=mesh(geo(new THREE.CylinderGeometry(.6,.85,3.5,16,1,true)),mat(0x87e7c4,{transparent:true,opacity:.11,depthWrite:false,emissive:0x87e7c4,emissiveIntensity:1}),0,1.75,0,exit);exitBeam.visible=false;
  let defendRing;
  if(level.defendZone){const z=level.defendZone;defendRing=ring(z.x,.03,z.z,z.radius,0x73bce0,root,.12);}
  function update(state,dt=1/60){
    if(disposed)return;
    boundaries?.update?.(state);
    elapsed=dt>.25?dt:elapsed+Math.max(0,dt);
    const current=state?.level||state||level;
    structures.update(state,dt);
    civilians.update(state);
    for(const door of current.doors||[]){const v=doors.get(door.id);if(!v)continue;
      v.amount+=(Number(!!door.open)-v.amount)*.19;
      if(door.style==='portcullis')v.pivot.position.y=v.amount*(v.height+.1);else v.pivot.rotation.y=v.amount*Math.PI*.5;
      v.lock.visible=!!door.locked;v.root.userData.open=!!door.open;
    }
    for(const item of current.switches||[]){const v=switches.get(item.id);if(!v)continue;
      v.wheel.rotation.z=item.active?Math.PI*.5:0;v.halo.material=mat(item.active?colors.glow:colors.gold,{emissive:item.active?colors.glow:colors.gold,emissiveIntensity:.45});
    }
    const currentCollectibleIds=new Set((current.collectibles||[]).map(c=>c.id));
    for(const [id,v]of collectibles)if(!currentCollectibleIds.has(id))v.root.visible=false;
    for(const item of current.collectibles||[]){const v=collectibles.get(item.id);if(!v)continue;
      v.root.position.set(item.x,item.absoluteY===true?item.y:groundHeight(current,item.x,item.z),item.z);
      v.root.visible=!item.collected;v.float.position.y=1.05+Math.sin(elapsed*2.3+item.x)*.15;v.float.rotation.y=elapsed*.65;
    }
    const ready=!!current.readyToExit||current.hunt?.phase==='ready'||current.hunt?.phase==='boss';exitRing.material=mat(ready?colors.glow:0x647d75,{emissive:ready?colors.glow:0x33493e,emissiveIntensity:ready?.8:.12});
    exitCore.material=mat(ready?colors.glow:0x78968a,{emissive:ready?colors.glow:0x33493e,emissiveIntensity:ready?.75:.1});exitCore.rotation.y=elapsed*.6;exitCore.position.y=1.8+Math.sin(elapsed*2)*.12;
    exitBeam.visible=ready;exit.userData.unlocked=ready;
    if(defendRing)defendRing.material=mat(current.defenseContested?0xe6926d:0x73bce0,{emissive:current.defenseContested?0xe6926d:0x73bce0,emissiveIntensity:.4});
    if(root.userData.beam){root.userData.beam.rotation.y=elapsed*.16;}
  }
  function dispose(){
    if(disposed)return;disposed=true;scene.remove(root);
    structures.dispose();
    civilians.dispose();
    for(const geometry of resources)geometry.dispose();for(const material of materials.values())material.dispose();for(const texture of textures)texture.dispose();
    sun.shadow.map?.dispose();scene.background=previousBackground;scene.fog=previousFog;
  }
  update(level,0);
  return {root,doors,switches,collectibles,structures,exit,update,dispose};
}
