import * as THREE from 'three';
import {createBuilder} from './living-world.mjs';
import {seededRandom,makeExclusions} from './world-layout.mjs';
import {terrainPaving,terrainTriangle} from './terrain-paving.mjs';
import {oldTownCoverage,oldTownCenter,streetWidth,createStreetLayout,footprintCorners} from './oldtown-layout.mjs';
import {createMappedCrowd} from './mapped-crowd.mjs';

export function createOldTownDetail({scene,data,detail,toWorld,heightAt,waterAt,reducedMotion=false}){
  const group=new THREE.Group();group.name='中山路与八市精细街巷';scene.add(group);
  const builder=createBuilder(group,{tintInstances:true}),rng=seededRandom(93982),covers=oldTownCoverage(data.meta);
  const land=(x,z)=>covers(x,z)&&waterAt(x,z)===null;
  const paths=[];
  for(const raw of detail.paths){
    let run=[];
    const flush=()=>{if(run.length>1)paths.push({...raw,points:run});run=[];};
    for(const ll of raw.path){
      const p=toWorld(...ll),last=run.at(-1);
      if(!land(...p)){flush();continue;}
      if(last&&Math.hypot(p[0]-last[0],p[1]-last[1])<.00001)continue;
      if(last&&![.25,.5,.75].every(t=>land(last[0]+(p[0]-last[0])*t,last[1]+(p[1]-last[1])*t)))flush();
      run.push(p);
    }
    flush();
  }
  const exclusions=makeExclusions(data),layout=createStreetLayout(paths,{land,heightAt,existingAt:exclusions.buildingAt});
  const pave=terrainPaving(data.terrain,heightAt),surfaces={road:[],walk:[],edge:[],courtyard:[]},walkRoutes=[];
  for(const path of paths){
    const pedestrian=['pedestrian','footway','path','steps'].includes(path.kind),width=streetWidth(path);
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<.00001)continue;
      pave(surfaces.edge,a,b,width+.0014,{offset:.001});
      pave(surfaces[pedestrian?'walk':'road'],a,b,width,{offset:.0012});
      if(pedestrian)walkRoutes.push({points:[a,b],name:path.name});
      else if(!['secondary','service'].includes(path.kind))for(const side of [-1,1]){
        const offset=(width/2+.0024)*side,nx=-dz/length,nz=dx/length;
        const aa=[a[0]+nx*offset,a[1]+nz*offset],bb=[b[0]+nx*offset,b[1]+nz*offset];
        if(![0,.25,.5,.75,1].every(t=>land(aa[0]+(bb[0]-aa[0])*t,aa[1]+(bb[1]-aa[1])*t)))continue;
        pave(surfaces.walk,a,b,.0038,{offset:.0014,side:offset});
        // Stop before junctions; this crowd is scenery, not a simulated crossing signal.
        const inset=Math.min(.014,length*.20);
        if(length>.035)walkRoutes.push({points:[[aa[0]+dx/length*inset,aa[1]+dz/length*inset],[bb[0]-dx/length*inset,bb[1]-dz/length*inset]],name:path.name});
      }
    }
  }
  const houses=[],forms=new Set(),trees=[],fixtures=[];
  function house(b,index,arcade){
    const {x,z,w,d,angle}=b,c=Math.cos(angle),s=Math.sin(angle),corners=footprintCorners(b);
    const lowest=Math.min(...corners.map(p=>heightAt(...p))),ground=Math.max(...corners.map(p=>heightAt(...p)))+.0018;
    const floors=2+index%3,height=.008*floors,wall=['#e0ddd0','#bccbc7','#d8c8b8','#d1d8d8','#c5b6aa'][index%5],trim='#ece8da',glass='#467580',roof=index%5===0?'#ad6f57':'#747d79';
    const point=(a,y,b)=>[x+a*c+b*s,ground+y,z-a*s+b*c];
    const part=(type,color,a,y,b,sx,sy,sz,rot=0,glow=false)=>builder.part(type,color,point(a,y,b),[sx,sy,sz],[0,angle+rot,0],glow);
    const bar=(color,a,b,r)=>builder.bar(color,point(...a),point(...b),r);
    part('box','#a4a69a',0,(lowest+.0004-ground)/2,0,w,ground-lowest-.0004,d);
    part('box',wall,0,height*.50,-.002,w,height,d-.004);
    if(arcade){
      part('box',wall,0,(height+.008)/2,d/2-.003,w,height-.008,.006);
      for(let j=0;j<3;j++){
        const px=(j-1)*w*.44;
        part('box',trim,px,.0045,d/2-.0015,.0015,.009,.0022);
        part('box','#a7ac9f',px,.0008,d/2-.0015,.0023,.0016,.0025);
      }
      for(let j=0;j<2;j++)builder.part('arch',trim,point((j-.5)*w*.44,.0082,d/2-.0014),[w*.205,.0023,.00065],[0,angle,0]);
    }
    const front=arcade?d/2-.005:d/2-.003,shop=['#54857f','#bc715c','#bca45d','#6c7893'][index%4];
    part('box',glass,0,.0038,front,w*.80,.006,.0006);
    part('box',shop,0,.008,front+.0005,w*.92,.002,.001,0,true);
    for(const side of [-1,1])part('box',trim,side*w*.42,.0045,front+.0007,.001,.008,.001);
    for(let floor=1;floor<floors;floor++){
      const y=floor*.008+.004;
      part('box',trim,0,floor*.008,d/2-.001,w,.0007,.002);
      for(let window=0;window<3;window++){
        const px=(window-1)*w*.28;
        part('box',glass,px,y,d/2-.0008,w*.17,.0043,.0005);
        for(const side of [-1,1])part('box',trim,px+side*w*.096,y,d/2-.0005,.0006,.005,.0007);
        part('box',trim,px,y-.0025,d/2-.0005,w*.21,.00065,.0012);
        if(index%3===0)builder.part('arch',trim,point(px,y+.0019,d/2-.0003),[w*.088,.0014,.00065],[0,angle,0]);
        else part('box',trim,px,y+.0024,d/2-.0005,w*.21,.00065,.0012);
        if((floor+window+index)%4===0)part('box','#e5bf79',px,y,d/2-.0003,w*.12,.0031,.0005,0,true);
      }
      for(let window=0;window<3;window++){
        const px=(window-1)*w*.28;
        part('box',glass,px,y,-d/2-.0002,w*.14,.0038,.0005);
        part('box',trim,px,y-.0021,-d/2-.0004,w*.17,.0005,.001);
      }
      for(const side of [-1,1])for(let window=0;window<3;window++){
        const pz=(window-1)*d*.24;
        part('box',glass,side*(w/2+.0002),y,pz,.0005,.0038,d*.13);
        part('box',trim,side*(w/2+.0004),y-.0021,pz,.001,.0005,d*.16);
      }
    }
    const variant=index%5;forms.add(arcade?['arched-arcade','balcony-arcade','stepped-parapet','pilaster-arcade','cornice-arcade'][variant]:'lane-dwelling');
    part('box',trim,0,height+.0008,0,w*1.03,.0016,d*1.01);
    part('box',roof,0,height+.0015,-.001,w*.92,.0012,d*.86);
    part('box',wall,0,height+.003,d/2-.001,w,.004,.0016);
    if(variant===2)for(let j=0;j<3;j++)part('box',wall,0,height+.004+j*.0015,d/2-.001,w*(.74-j*.18),.002,.0016);
    if(variant===1){
      part('box',trim,0,.016,d/2,w*.72,.001,.0035);
      for(let j=0;j<7;j++)part('box','#65736f',(j-3)*w*.105,.0177,d/2+.0011,.00035,.0033,.00035);
      part('box','#65736f',0,.0193,d/2+.0011,w*.72,.0004,.0004);
    }
    if(variant===3)for(const side of [-1,1])part('box',trim,side*w*.47,height*.6,d/2-.0003,.001,height*.8,.0012);
    if(variant===4){
      part('box',shop,0,.0088,d/2-.001,w*.84,.0006,.005);
      for(let j=0;j<6;j++)part('box','#e1dec8',(j-2.5)*w*.13,.0092,d/2-.001,w*.035,.00025,.0049);
    }
    if(index%3===0){
      part('box','#b4bbb3',w*.29,height+.0027,-d*.20,.0035,.003,.003);
      for(let j=0;j<3;j++)part('box','#6e7f7c',w*.29,height+.002+j*.0007,-d*.20+.0016,.0026,.0003,.0003);
    }
    if(index%4===0)for(const side of [-1,1]){
      part('cylinder','#b46b52',side*w*.36,.001,d/2+.001,.0011,.002,.0011);
      part('crown','#58865d',side*w*.36,.003,d/2+.001,.0019,.0018,.0019);
      part('ball','#d2a25f',side*w*.36,.0045,d/2+.001,.0007,.0005,.0007);
    }
    if(!arcade&&index%5===0){
      for(const side of [-1,1])bar('#81867a',[side*w*.4,height+.002,0],[side*w*.4,height+.006,0],.00035);
      bar('#81867a',[-w*.4,height+.006,0],[w*.4,height+.006,0],.00025);
    }
    for(const tri of [[corners[0],corners[1],corners[2]],[corners[0],corners[2],corners[3]]])surfaces.courtyard.push(...terrainTriangle(data.terrain,heightAt,tri,{offset:.0006,accept:land}));
    layout.reserve(b);houses.push({...b,street:b.street,form:arcade?'arcade':'dwelling'});
  }
  // Prioritize the pedestrian spine, then connect its named side streets.
  const ordered=[...paths].sort((a,b)=>(b.name==='中山路')-(a.name==='中山路')||(b.kind==='pedestrian')-(a.kind==='pedestrian')||Number(!!b.name)-Number(!!a.name));
  for(const path of ordered){
    if(!path.name||['steps','footway','path','service'].includes(path.kind))continue;
    const width=streetWidth(path),arcade=path.name==='中山路'||/镇邦|升平|大同|开元|水仙|思明/.test(path.name);
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<.015)continue;
      for(let along=.012;along<length-.008&&houses.length<520;along+=.024){
        for(const side of [-1,1]){
          const w=.019+rng()*.003,d=.028+rng()*.009,offset=width/2+.006+d/2;
          const candidate={x:a[0]+dx*along/length-dz/length*offset*side,z:a[1]+dz*along/length+dx/length*offset*side,w,d,angle:-Math.atan2(dz,dx)+(side>0?Math.PI:0),street:path.name};
          if(layout.footprintFits(candidate))house(candidate,houses.length,arcade);
        }
      }
    }
  }
  function tree(x,z,index){
    const size=.010+rng()*.005;
    if(!land(x,z)||layout.buildingAt(x,z,.009)||layout.roadNear(x,z,.002)||exclusions.buildingAt(x,z,.007)||trees.some(t=>Math.hypot(t.x-x,t.z-z)<.020))return;
    const y=heightAt(x,z)+.0014;
    builder.part('cylinder','#746954',[x,y+size*.42,z],[.0007,size*.84,.0007]);
    for(let j=0;j<4;j++){
      const a=j*2.4;builder.part('crown',index%3===0?'#6f915d':'#4d8065',[x+Math.cos(a)*size*.2,y+size*(.82+j%2*.12),z+Math.sin(a)*size*.2],[size*.36,size*.35,size*.32]);
    }
    builder.part('box','#8f9c8c',[x,y+.0004,z],[.004,.0008,.004]);trees.push({x,z});
  }
  for(const path of paths){
    const width=streetWidth(path);
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.045)continue;
      const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
      for(let along=.027;along<length;along+=.060)for(const side of [-1,1]){
        const x=a[0]+dx*along-dz*(width/2+.0045)*side,z=a[1]+dz*along+dx*(width/2+.0045)*side;
        if(!land(x,z)||layout.buildingAt(x,z,.003)||layout.roadNear(x,z,.001)||exclusions.buildingAt(x,z,.003)||fixtures.some(p=>Math.hypot(x-p.x,z-p.z)<.020))continue;
        const y=heightAt(x,z)+.0014;
        builder.part('cylinder','#4f6862',[x,y+.0035,z],[.00035,.007,.00035]);
        builder.part('ball','#f0ce92',[x,y+.007,z],[.001,.0013,.001],[0,0,0],true);fixtures.push({x,z});
        if(fixtures.length%3===0)tree(x-dz*.011*side,z+dx*.011*side,fixtures.length);
      }
    }
  }
  for(const [kind,vertices] of Object.entries(surfaces)){
    if(!vertices.length)continue;
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:{road:'#637778',walk:'#c6c7ba',edge:'#9fae9f',courtyard:'#a6ad9d'}[kind],roughness:.94,side:THREE.DoubleSide}));mesh.name='oldtown-'+kind;mesh.receiveShadow=true;group.add(mesh);
  }
  const instances=builder.finish(),crowd=createMappedCrowd({group,paths:walkRoutes,heightAt,valid:(x,z)=>land(x,z)&&!layout.buildingAt(x,z,.001)&&!exclusions.buildingAt(x,z,.001),limit:200,groundOffset:.0018,reducedMotion});
  const [x,z]=toWorld(...oldTownCenter),anchor={x,z,radius:.42,theme:'mapped-oldtown'};
  let quality='balanced';
  return {
    anchor,covers,update(dt,target){group.visible=Math.hypot(target.x-x,target.z-z)<24;crowd.update(dt);},
    setQuality(q){quality=q;},setLight(night){for(const [key,mat] of builder.materials)if(key.endsWith('-true'))mat.emissiveIntensity=night*1.8;},
    getState(){return {snapshot:detail.snapshot,buildings:houses.length,forms:[...forms],streets:[...new Set(paths.map(p=>p.name).filter(Boolean))],paths:paths.length,trees:trees.length,fixtures:fixtures.length,instances,quality,...crowd.getState()};}
  };
}
