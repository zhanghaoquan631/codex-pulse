import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBuilder} from './living-world.mjs';
import {seededRandom,createSpatialIndex,distanceToSegment} from './world-layout.mjs';
import {terrainPaving,terrainTriangle} from './terrain-paving.mjs';
import {islandCoverage,landmarkProfiles} from './island-layout.mjs';
import {travelPlaces} from './travel-data.mjs';
import {categoryOf} from './travel-tour.mjs';
import {createMappedCrowd} from './mapped-crowd.mjs';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const mix=THREE.MathUtils.lerp;

export function createIslandDetail({scene,data,detail,toWorld,heightAt,waterAt,reducedMotion=false}) {
  const group=new THREE.Group();group.name='鼓浪屿街巷与分区景观';scene.add(group);
  const builder=createBuilder(group,{tintInstances:true}),rng=seededRandom(42881),covers=islandCoverage(data.meta);
  const pathIndex=createSpatialIndex(.05),builtIndex=createSpatialIndex(.05),plantIndex=createSpatialIndex(.04);
  const paths=[],footprints=[],landmarks=[],treePositions=[],pierRoutes=[],pave=terrainPaving(data.terrain,heightAt);
  let stairFlights=0,pierSegments=0,railPosts=0;
  const terminals=[];
  const pavement=[],curbs=[],stairs=[];
  const land=(x,z)=>covers(x,z)&&waterAt(x,z)===null;
  const base=(x,z)=>heightAt(x,z)+.008;
  const patches=detail.patches.map(p=>({...p,ring:p.ring.map(ll=>toWorld(...ll))}));
  const inRing=(x,z,ring)=>{
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  };
  const onSand=(x,z)=>patches.some(p=>p.kind==='sand'&&inRing(x,z,p.ring));
  const blocked=(x,z,pad=0)=>builtIndex.at(x,z).some(b=>{
    const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
    return Math.abs(dx*c-dz*s)<b.w/2+pad&&Math.abs(dx*s+dz*c)<b.d/2+pad;
  });
  function pathNear(x,z,pad=.008) {
    return pathIndex.at(x,z).find(s=>distanceToSegment(x,z,[s.a.x,s.a.z],[s.b.x,s.b.z])<s.width/2+pad);
  }
  const validFootprint=(x,z,w,d,angle)=>{
    const c=Math.cos(angle),s=Math.sin(angle);
    return [[0,0],[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]].every(([a,b])=>{
      const px=x+a*w*c+b*d*s,pz=z-a*w*s+b*d*c;
      return land(px,pz)&&!onSand(px,pz)&&!blocked(px,pz,.006)&&!pathNear(px,pz,.002);
    });
  };
  // Mapped piers need a visible deck even though the base water mask is coarse.
  for(const raw of detail.paths.filter(p=>p.kind==='pier'||p.bridge)){
    const pierPoints=raw.path.map(ll=>toWorld(...ll));
    const deckY=Math.max(.019,...pierPoints.map(p=>heightAt(...p)+.003));
    if(pierPoints.length>1)pierRoutes.push({points:pierPoints,kind:'pier',name:raw.name||'码头步行平台',height:deckY,width:.009});
    for(let i=1;i<raw.path.length;i++){
      const [ax,az]=toWorld(...raw.path[i-1]),[bx,bz]=toWorld(...raw.path[i]);
      const length=Math.hypot(bx-ax,bz-az);if(length<.0005)continue;
      const count=Math.max(1,Math.ceil(length/.01)),angle=Math.atan2(bx-ax,bz-az);
      for(let j=0;j<count;j++){
        const t=(j+.5)/count,x=mix(ax,bx,t),z=mix(az,bz,t),h=deckY,w=raw.kind==='pier'?.009:.006;
        builder.part('box','#bbb9ab',[x,h-.001,z],[w,.002,length/count+.0001],[0,angle,0]);
        for(const side of [-1,1]){
          const px=x+Math.cos(angle)*w*.46*side,pz=z-Math.sin(angle)*w*.46*side;
          builder.bar('#72817a',[px,h,pz],[px,h+.0035,pz],.00035);railPosts++;
          if(j<count-1)builder.bar('#89968c',[px,h+.0035,pz],[px+(bx-ax)/count,h+.0035,pz+(bz-az)/count],.00028);
          if(j%3===0){builder.part('cylinder','#787e73',[px,h/2,pz],[.0009,h,.0009]);builder.part('ball','#46595a',[px,h-.001,pz],[.0011,.002,.0011]);}
        }
        if(j%4===0)builder.part('box','#e6dcbd',[x,h+.00015,z],[w*.8,.0003,.0005],[0,angle,0]);
        pierSegments++;
      }
    }
  }
  const mapped=detail.paths.filter(p=>!['pier','service'].includes(p.kind)&&!p.bridge);
  for(const raw of mapped){
    let run=[];
    const flush=()=>{
      if(run.length>1){
        const cumulative=[0];for(let j=1;j<run.length;j++)cumulative.push(cumulative.at(-1)+run[j].distanceTo(run[j-1]));
        if(cumulative.at(-1)>.005)paths.push({points:run,cumulative,length:cumulative.at(-1),name:raw.name,kind:raw.kind});
      }
      run=[];
    };
    for(const ll of raw.path){
      const [x,z]=toWorld(...ll);
      if(!land(x,z)){flush();continue;}
      const p=V(x,base(x,z),z),last=run.at(-1);
      if(last&&last.distanceTo(p)<.00005)continue;
      if(last){
        const width=raw.kind==='steps'?.005:raw.kind==='pedestrian'?.010:['minor','tertiary'].includes(raw.kind)?.011:.006;
        const segment={a:last,b:p,width};
        if(![.25,.5,.75].every(t=>land(mix(last.x,x,t),mix(last.z,z,t)))){flush();run.push(p);continue;}
        pathIndex.insert(segment,Math.min(last.x,x)-.024,Math.min(last.z,z)-.024,Math.max(last.x,x)+.024,Math.max(last.z,z)+.024);
        pave(curbs,[last.x,last.z],[x,z],width+.003,{offset:.005});
        pave(pavement,[last.x,last.z],[x,z],width,{offset:.008});
        if(raw.kind==='steps'){
          stairFlights++;
          const length=Math.hypot(x-last.x,z-last.z),dx=(x-last.x)/length,dz=(z-last.z)/length;
          // Treads show mapped stair locations, not surveyed step counts or heights.
          const spacing=.0008,angle=Math.atan2(dx,dz);
          for(let step=spacing/2;step<length;step+=spacing){
            const cx=last.x+dx*step,cz=last.z+dz*step;
            const h0=base(cx-dx*spacing/2,cz-dz*spacing/2),h1=base(cx+dx*spacing/2,cz+dz*spacing/2),top=Math.max(h0,h1)+.0004,rise=Math.max(.0003,Math.abs(h1-h0));
            builder.part('box','#bdbaab',[cx,top-rise/2,cz],[width,rise,spacing],[0,angle,0]);
            pave(stairs,[cx-dz*width/2,cz+dx*width/2],[cx+dz*width/2,cz-dx*width/2],.00016,{offset:.0088});
          }
          for(const side of [-1,1])for(let step=0;step<length;step+=.005){
            const end=Math.min(length,step+.005),a=[last.x+dx*step-dz*width*.52*side,last.z+dz*step+dx*width*.52*side],b=[last.x+dx*end-dz*width*.52*side,last.z+dz*end+dx*width*.52*side];
            builder.bar('#7c8b80',[a[0],base(...a),a[1]],[a[0],base(...a)+.003,a[1]],.00025);
            builder.bar('#8d9a8c',[a[0],base(...a)+.003,a[1]],[b[0],base(...b)+.003,b[1]],.00025);railPosts++;
          }
        }
      }
      run.push(p);
    }
    flush();
  }
  function recordFootprint(x,z,w,d,angle,id) {
    const item={x,z,w,d,angle,id};footprints.push(item);
    const r=Math.hypot(w,d)/2+.01;builtIndex.insert(item,x-r,z-r,x+r,z+r);
  }
  // Mapped terminal positions with photograph-informed facades, not surveyed interiors.
  for(const profile of [
    {id:'neicuo',angle:-.43,w:.051,d:.021,roof:'#817a68',form:'colonnade'},
    {id:'sanqiutian',angle:-.35,w:.044,d:.023,roof:'#b5795b',form:'gable'},
    {id:'gangqin',angle:-.55,w:.047,d:.020,roof:'#487c8c',form:'canopy'}
  ]){
    const place=travelPlaces.find(p=>p.id===profile.id),[x,z]=toWorld(...place.ll),{w,d,angle}=profile;
    const ground=Math.max(.020,heightAt(x,z)+.006),c=Math.cos(angle),s=Math.sin(angle);
    const point=(a,y,b)=>[x+a*c+b*s,ground+y,z-a*s+b*c];
    const part=(type,color,a,y,b,sx,sy,sz,rot=0)=>builder.part(type,color,point(a,y,b),[sx,sy,sz],[0,angle+rot,0]);
    recordFootprint(x,z,w,d,angle,profile.id);
    part('box','#bdbcae',0,-.001,0,w+.012,.003,d+.008);
    part('box','#78968e',0,.006,-d*.4,w,.012,.001);
    for(const side of [-1,1])part('box','#dcd6bf',side*w*.5,.007,0,.0016,.014,d);
    for(let j=0;j<=8;j++){
      const u=-w*.5+j*w/8;
      part('box','#e7e0c8',u,.007,d*.43,.0011,.014,.0018);
      if(j!==4)part('box','#47717a',u+w/16,.0068,d*.45,w/8-.0015,.009,.0007);
    }
    part('box','#ece2cc',0,.014,0,w+.004,.0015,d+.004);
    if(profile.form==='gable'){
      part('roof',profile.roof,0,.018,0,w*.68/Math.SQRT2,.009,d/Math.SQRT2,Math.PI/4);
      part('box','#8f563e',0,.010,d*.47,w*.32,.005,.001);
    }else if(profile.form==='colonnade'){
      for(const side of [-1,1])part('box','#a99b7b',side*w*.44,.013,d*.48,.002,.023,.0025);
      part('box',profile.roof,0,.016,0,w*1.06,.0015,d*1.04);
    }else{
      for(let j=0;j<5;j++)part('box',profile.roof,-w*.4+j*w*.2,.016,0,w*.23,.0018,d*1.1);
    }
    for(let j=0;j<4;j++){
      part('box','#6e837e',(j-1.5)*w*.19,.0038,-d*.17,.004,.0008,.0018);
      for(const side of [-1,1])part('cylinder','#9a9e8d',(j-1.5)*w*.19+side*.0015,.0018,-d*.17,.00025,.0035,.00025);
    }
    for(const side of [-1,1]){
      const a=point(side*w*.49,0,-d*.42),b=point(side*w*.49,.019,-d*.42);
      builder.bar('#77867c',a,b,.00045);part('ball','#eddea2',side*w*.49,.019,-d*.42,.0014,.0014,.0014);
    }
    const front=point(0,.001,d*.66);
    pierRoutes.push({points:[point(-w*.43,0,d*.66),point(w*.43,0,d*.66)].map(p=>[p[0],p[2]]),kind:'pier',name:place.name+'候船前场',height:front[1],width:.006});
    terminals.push({id:profile.id,name:place.name,x,z,form:profile.form});
  }
  function building(x,z,profile,id,angle=0) {
    const {width:w,depth:d,height:h,form,wall,roof}=profile,c=Math.cos(angle),s=Math.sin(angle);
    const ground=Math.max(...[[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5],[0,0]].map(([a,b])=>heightAt(x+a*w*c+b*d*s,z-a*w*s+b*d*c)))+.002;
    const point=(a,y,b)=>[x+a*c+b*s,ground+y,z-a*s+b*c];
    const part=(type,color,a,y,b,sx,sy,sz,rot=0,glow=false)=>builder.part(type,color,point(a,y,b),[sx,sy,sz],[0,angle+rot,0],glow);
    const bar=(color,a,b,r)=>builder.bar(color,point(...a),point(...b),r);
    const ledge=y=>part('box','#f2e5cb',0,y,0,w*1.04,.002,d*1.04);
    const window=(a,y,b,ww,hh,rotation=0)=>{
      part('box','#416c70',a,y,b,ww,hh,.001,rotation);
      part('box','#c6b899',a,y-hh*.55,b,ww*1.2,.0009,.0018,rotation);
      part('box','#f0c57e',a,y,b,ww*.55,hh*.7,.0011,rotation,true);
    };
    const gable=(a,y,b,rw,rh,rd)=>{
      part('roof',roof,a,y,b,rw/Math.SQRT2,rh,rd/Math.SQRT2,Math.PI/4);
      part('box',roof,a,y+rh*.44,b,rw*.6,.0018,.0025);
    };
    part('box','#a39b89',0,.002,0,w*1.03,.007,d*1.04);
    part('box',wall,0,h/2+.005,0,w,h,d);
    const floors=form==='tower'?3:2;
    for(let row=0;row<floors;row++){
      const y=.007+(row+.6)*h/floors;
      for(let i=0;i<5;i++)for(const side of [-1,1])window((i-2)*w*.175,y,side*(d/2+.0006),w*.10,h/floors*.51);
      for(let i=0;i<3;i++)for(const side of [-1,1])window(side*(w/2+.0006),y,(i-1)*d*.27,d*.15,h/floors*.51,Math.PI/2);
      ledge(.006+(row+1)*h/floors);
    }
    part('box','#425f55',0,.015,d/2+.001,w*.13,.022,.0018);
    for(let i=0;i<4;i++)part('box','#b4ada0',0,.001+i*.0012,d/2+.008-i*.0017,w*.24,.002,.011-i*.0015);
    if(form==='dome'){
      gable(0,h+.006,0,w*1.06,.013,d*1.06);
      part('cylinder',wall,0,h+.021,0,w*.22,.035,w*.22);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        part('cylinder','#f2e5cb',Math.sin(a)*w*.225,h+.022,Math.cos(a)*w*.225,.0016,.034,.0016);
        part('box','#416c70',Math.sin(a)*w*.219,h+.022,Math.cos(a)*w*.219,.005,.019,.001,a);
      }
      part('dome',roof,0,h+.041,0,w*.255,.027,w*.255);
      part('cylinder','#bca17a',0,h+.074,0,.0012,.015,.0012);
      for(let i=0;i<8;i++)for(const side of [-1,1])part('cylinder','#eae0c7',(i-3.5)*w*.122,h*.55,side*(d/2+.003),.0015,h*.93,.0015);
    }else if(form==='gothic'){
      gable(0,h+.012,0,w*1.06,.026,d*1.06);
      for(const side of [-1,1]){
        const tx=side*w*.39;
        part('box',wall,tx,h*.74,d*.42,w*.19,h*1.5,w*.19);
        part('cone',roof,tx,h*1.65,d*.42,w*.16,.036,w*.16);
        bar('#a8a99c',[tx,h*1.88,d*.42],[tx,h*2.15,d*.42],.0007);
        bar('#a8a99c',[tx-.004,h*2.06,d*.42],[tx+.004,h*2.06,d*.42],.0007);
      }
      builder.part('arch','#c5c6b9',point(0,h*.61,d/2+.002),[w*.15,h*.25,.003],[0,angle,0]);
      part('ball','#447781',0,h*.90,d/2+.002,w*.12,w*.12,.001);
    }else if(form==='trinity'){
      part('box',wall,0,h*.43,0,w*1.5,h*.80,d*.40);
      gable(0,h+.008,0,w*1.08,.028,d*1.05);
      gable(0,h*.92,0,w*1.57,.021,d*.48);
      part('cylinder',wall,0,h+.019,0,.013,.019,.013);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;part('box','#516d67',Math.sin(a)*.013,h+.018,Math.cos(a)*.013,.003,.010,.001,a);}
      part('cone','#658678',0,h+.034,0,.017,.017,.017);
      bar('#d3c3a9',[0,h+.042,0],[0,h+.052,0],.0008);
      bar('#d3c3a9',[-.003,h+.049,0],[.003,h+.049,0],.0008);
    }else if(form==='courtyard'||form==='temple'||form==='pavilion'){
      gable(0,h+.012,0,w*1.13,.025,d*1.12);
      for(const side of [-1,1]){
        part('box',wall,side*w*.41,h*.45,d*.13,w*.20,h*.87,d*.82);
        gable(side*w*.41,h+.007,d*.13,w*.3,.017,d*.9);
        bar(roof,[side*w*.53,h+.018,d*.55],[side*w*.58,h+.026,d*.58],.0018);
      }
      for(let i=0;i<5;i++)part('cylinder','#af6049',(i-2)*w*.19,h*.43,d*.56,.0016,h*.8,.0016);
    }else if(form==='chapel'||form==='colonnade'||form==='museum'){
      if(form==='colonnade')part('box','#d9d5bd',0,h+.006,0,w*1.06,.004,d*1.05);
      else gable(0,h+.008,0,w*1.06,.020,d*1.05);
      const columns=form==='chapel'?4:7;
      for(let i=0;i<columns;i++)part('cylinder','#ece4ce',(i-(columns-1)/2)*w*.8/(columns-1),h*.52,d*.61,.0021,h*.90,.0021);
      part('box','#ded3b9',0,h+.004,d*.58,w*.92,.003,d*.23);
      gable(0,h+.012,d*.59,w*.92,.017,d*.27);
      if(form==='chapel'){
        bar('#928973',[0,h+.022,d*.59],[0,h+.036,d*.59],.001);
        bar('#928973',[-.004,h+.032,d*.59],[.004,h+.032,d*.59],.001);
      }else if(form==='colonnade'){
        for(let i=0;i<12;i++)part('box','#e6dfc9',(i-5.5)*w*.078,h+.013,-d*.47,.0013,.012,.0013);
        part('box','#e6dfc9',0,h+.019,-d*.47,w*.93,.0015,.002);
      }
    }else if(form==='tower'){
      part('roof',roof,0,h+.009,0,w,.017,d,Math.PI/4);
      part('cylinder','#485d56',0,h+.034,0,.001,.035,.001);
    }else if(form==='hall'){
      gable(0,h+.005,0,w*1.03,.016,d*1.06);
      for(let i=0;i<7;i++)part('box','#728482',(i-3)*w*.12,h*.7,d*.515,w*.056,h*.39,.001);
    }else{
      gable(0,h+.008,0,w*1.09,.019,d*1.07);
      part('box',wall,w*.28,h+.010,-d*.2,w*.09,.017,d*.09);
      part('box','#eee4cf',0,h*.51,d*.55,w*.64,.002,.010);
      for(let i=0;i<8;i++)part('box','#eee4cf',(i-3.5)*w*.084,h*.61,d*.62,.0009,h*.18,.001);
    }
    recordFootprint(x,z,w*1.10,d*1.28,angle,id);
    return {id,x,z,form,width:w,height:h,ground};
  }
  const places=travelPlaces.filter(p=>p.island);
  for(let index=0;index<places.length;index++){
    const place=places[index],[x,z]=toWorld(...place.ll),category=categoryOf(place);
    if(place.parent||!land(x,z))continue;
    if(!landmarkProfiles[place.id]&&(!['heritage','museum'].includes(category)||/岩|崖|井|炮|街巷|古榕|雕像|题刻/.test(place.name)))continue;
    const profile=landmarkProfiles[place.id]||{form:index%3===0?'colonnade':index%3===1?'villa':'courtyard',width:.034+index%4*.006,depth:.030+index%3*.006,height:.023+index%3*.006,wall:['#d5b7a4','#dfd9c3','#a97765','#e4c8a5'][index%4],roof:['#b56b50','#827165','#9d584c'][index%3]};
    let nearest=null,distance=Infinity;
    for(const path of paths)for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],d=distanceToSegment(x,z,[a.x,a.z],[b.x,b.z]);
      if(d<distance){distance=d;nearest={a,b};}
    }
    const angle=nearest?-Math.atan2(nearest.b.z-nearest.a.z,nearest.b.x-nearest.a.x):0;
    let placement=null;
    for(let i=0;i<65;i++){
      const a=i*2.39996323,delta=i===0?0:.006+Math.sqrt(i)*.004;
      const px=x+Math.cos(a)*delta,pz=z+Math.sin(a)*delta;
      if(validFootprint(px,pz,profile.width,profile.depth,angle)){placement=[px,pz];break;}
    }
    if(placement)landmarks.push({...building(...placement,profile,place.id,angle),reference:[x,z]});
  }
  // Reserve the monument and viewing rock before filling the streets around them.
  const sculptures=[];
  for(const id of ['haoyue','sunlight']){
    const p=places.find(p=>p.id===id),[x,z]=toWorld(...p.ll);if(!land(x,z))continue;
    const y=base(x,z);recordFootprint(x,z,.042,.040,0,id);sculptures.push(id);
    if(id==='haoyue'){
      builder.part('crown','#a2a18d',[x,y+.006,z],[.027,.016,.025]);
      builder.part('box','#c5c6b3',[x,y+.032,z],[.018,.033,.014]);
      builder.part('cone','#c5c6b3',[x,y+.024,z],[.016,.024,.012]);
      builder.part('crown','#c5c6b3',[x,y+.057,z],[.007,.009,.007]);
      builder.part('box','#9da38f',[x,y+.065,z],[.015,.003,.015]);
      builder.bar('#c5c6b3',[x-.008,y+.045,z],[x-.017,y+.027,z+.004],.003);
      builder.bar('#c5c6b3',[x+.008,y+.045,z],[x+.014,y+.034,z+.008],.003);
      builder.bar('#858d7c',[x+.014,y+.034,z+.008],[x+.015,y+.010,z+.008],.0013);
    }else{
      for(let i=0;i<6;i++)builder.part('crown','#b2ae95',[x+Math.sin(i*2.4)*.015,y+.010+i*.002,z+Math.cos(i*2.4)*.010],[.015,.015+i*.002,.013]);
      builder.part('cylinder','#d4cbb6',[x,y+.038,z],[.013,.003,.013]);
      for(let i=0;i<16;i++){const a=i*Math.PI/8;builder.part('cylinder','#727b6d',[x+Math.cos(a)*.012,y+.043,z+Math.sin(a)*.012],[.0007,.009,.0007]);}
    }
  }
  // Small houses follow mapped lanes, with clear courtyards and no landmark overlap.
  let houses=0;
  for(const path of paths){
    if(!path.name||path.kind==='steps'||path.length<.06)continue;
    for(let i=1;i<path.points.length&&houses<210;i++){
      const a=path.points[i-1],b=path.points[i],len=Math.hypot(b.x-a.x,b.z-a.z);
      if(len<.014)continue;
      const dx=(b.x-a.x)/len,dz=(b.z-a.z)/len;
      for(const side of [-1,1]){
        if(rng()>.48)continue;
        const w=.019+rng()*.015,d=.019+rng()*.015,offset=d/2+.012;
        const x=(a.x+b.x)/2-dz*offset*side,z=(a.z+b.z)/2+dx*offset*side,angle=-Math.atan2(dz,dx);
        if(!validFootprint(x,z,w,d,angle)||places.some(p=>{const [px,pz]=toWorld(...p.ll);return Math.hypot(px-x,pz-z)<.055;}))continue;
        building(x,z,{form:houses%4===0?'colonnade':'villa',width:w,depth:d,height:.017+rng()*.016,wall:['#e0d5bd','#cda994','#d6c7ab','#d5d4c8'][houses%4],roof:['#a25c49','#bb775a','#786759'][houses%3]},'lane-house-'+houses,angle);houses++;
      }
    }
  }
  function tree(x,z,size,style=0) {
    if(!land(x,z)||onSand(x,z)||blocked(x,z,size*.45)||pathNear(x,z,size*.28)||plantIndex.at(x,z).some(p=>Math.hypot(x-p.x,z-p.z)<size*.58))return false;
    const y=base(x,z);
    builder.part('cylinder','#776a50',[x,y+size*.41,z],[size*.045,size*.82,size*.045]);
    const leaf=['#46785b','#658950','#356e61','#648772'][style%4];
    if(style%5===0){
      for(let i=0;i<7;i++){const angle=i*Math.PI*2/7;
        builder.part('leaf',leaf,[x+Math.cos(angle)*size*.3,y+size*.88,z+Math.sin(angle)*size*.3],[size*.41,size*.04,size*.11],[0,-angle,.20]);}
    }else{
      for(let i=0;i<4;i++){const angle=i*2.4;
        builder.part('crown',leaf,[x+Math.cos(angle)*size*.19,y+size*(.77+(i%2)*.11),z+Math.sin(angle)*size*.19],[size*.33,size*.36,size*.32]);}
      if(style%4===1)for(let i=0;i<4;i++)builder.part('ball','#d99ba9',[x+Math.sin(i*2.4)*size*.25,y+size*.9,z+Math.cos(i*2.4)*size*.25],[size*.06,size*.035,size*.06]);
    }
    const p={x,z};treePositions.push(p);plantIndex.insert(p,x-size,z-size,x+size,z+size);return true;
  }
  function flowers(x,z,radius,variant=0) {
    if(!land(x,z)||onSand(x,z)||blocked(x,z,.007)||pathNear(x,z,.004))return;
    const y=base(x,z);
    builder.part('leaf','#558b5e',[x,y+.001,z],[radius,.0015,radius*.6]);
    for(let j=0;j<7;j++){
      const a=j*2.4,px=x+Math.cos(a)*radius*.72,pz=z+Math.sin(a)*radius*.46;
      builder.part('ball',['#cc809d','#edce6a','#dfe6d4'][variant%3],[px,heightAt(px,pz)+.011,pz],[.0012,.0008,.0012]);
    }
  }
  function bench(x,z,angle=0){
    if(!land(x,z)||blocked(x,z,.006)||pathNear(x,z,.003))return false;
    const y=base(x,z),c=Math.cos(angle),s=Math.sin(angle),pt=(a,b,h)=>[x+a*c+b*s,y+h,z-a*s+b*c];
    builder.part('box','#987758',pt(0,0,.0037),[.012,.0013,.004],[0,angle,0]);
    builder.part('box','#987758',pt(0,-.002,.006),[.012,.004,.001],[0,angle,0]);
    for(const a of [-.004,.004])builder.part('box','#52675b',pt(a,0,.0015),[.001,.003,.0035],[0,angle,0]);
    return true;
  }
  let scenicFeatures=0;
  for(let index=0;index<places.length;index++){
    const place=places[index],[x,z]=toWorld(...place.ll),category=categoryOf(place),radius=place.parent?.025:category==='garden'?.085:.060;
    if(!land(x,z))continue;
    if(['garden','coast'].includes(category)){
      for(let i=0;i<70;i++){
        const a=rng()*Math.PI*2,r=Math.sqrt(rng())*radius,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;
        if(i%3===0)tree(px,pz,.022+rng()*.018,index+i);else flowers(px,pz,.004+rng()*.004,index);
      }
      if(category==='coast'&&!/沙滩|海滩/.test(place.name))for(let i=0;i<8;i++){
        const a=i*2.4,r=.007+i*.003,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;
        if(!land(px,pz)||blocked(px,pz,.009)||pathNear(px,pz,.005))continue;
        const rock=.004+rng()*.006;
        builder.part('crown','#929888',[px,base(px,pz)+rock*.4,pz],[rock,rock*.65,rock*.8],[rng()*.4,rng()*3,0]);
      }
      scenicFeatures++;
    }
    if(/井/.test(place.name)){
      const y=base(x,z);
      for(let i=0;i<10;i++){const a=i*Math.PI/5;builder.part('box','#a6a58e',[x+Math.cos(a)*.003,y+.002,z+Math.sin(a)*.003],[.002,.004,.0018],[0,-a,0]);}
      scenicFeatures++;
    }
  }
  // Continuous planting links the small stops instead of framing each in a square plot.
  for(let attempt=0;attempt<19000&&treePositions.length<860;attempt++){
    const ll=[118.052+rng()*.020,24.439+rng()*.0175],[x,z]=toWorld(...ll);
    if(!land(x,z)||heightAt(x,z)<.002)continue;
    const near=places.some(p=>{const [px,pz]=toWorld(...p.ll);return Math.hypot(px-x,pz-z)<.040;});
    if(near)continue;
    tree(x,z,.020+rng()*.025,attempt);if(attempt%4===0)flowers(x+.012,z,.008,attempt);
  }
  const features=[];
  for(const path of paths){
    if(path.length<.040)continue;
    const p=path.points[Math.floor(path.points.length*.5)],next=path.points[Math.min(path.points.length-1,Math.floor(path.points.length*.5)+1)];
    const dx=next.x-p.x,dz=next.z-p.z,len=Math.hypot(dx,dz)||1,px=p.x-dz/len*.011,pz=p.z+dx/len*.011;
    if(bench(px,pz,-Math.atan2(dz,dx)))features.push({x:px,z:pz,kind:'bench'});
    if(!land(px,pz)||blocked(px,pz,.003)||pathNear(px,pz,.003))continue;
    const y=base(px,pz);
    builder.part('cylinder','#607665',[px,y+.010,pz],[.0008,.020,.0008]);
    builder.part('ball','#f0ce8e',[px,y+.020,pz],[.0022,.0028,.0022],[0,0,0],true);
  }
  function surface(vertices,color,name){
    if(!vertices.length)return;
    const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const g=mergeVertices(raw,1e-7);g.computeVertexNormals();raw.dispose();
    const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.94,side:THREE.DoubleSide}));mesh.name=name;mesh.receiveShadow=true;group.add(mesh);
  }
  // Match terrain triangles exactly; an independent tessellation causes flickering slopes.
  const groundByKind={sand:[],grass:[],wood:[]};
  for(const patch of patches){
    const ring=patch.ring.slice();if(ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring.pop();
    const points=ring.map(p=>new THREE.Vector2(...p)),triangles=THREE.ShapeUtils.triangulateShape(points,[]),dest=groundByKind[patch.kind]||groundByKind.grass;
    const offset=patch.kind==='sand'?.003:patch.kind==='wood'?.0012:.0022;
    for(const [a,b,c] of triangles)dest.push(...terrainTriangle(data.terrain,heightAt,[ring[a],ring[b],ring[c]],{offset,accept:land}));
  }
  surface(groundByKind.wood,'#6e976c','林下地被');surface(groundByKind.grass,'#93ac79','滨海园林草地');surface(groundByKind.sand,'#d8cca0','OSM 沙滩范围');
  surface(curbs,'#b1b8a3','街巷边石');surface(pavement,'#d0c7b4','OSM 鼓浪屿步行街巷');surface(stairs,'#ece5d4','石阶踏步');
  // Retaining walls follow mapped waterfront promenades, not natural beaches.
  let seawallSegments=0,beachFurniture=0;
  const beachRoutes=[];
  for(const ring of detail.shoreline||[])for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(len/.007);
    for(let j=0;j<n;j++){
      const x=mix(a[0],b[0],(j+.5)/n),z=mix(a[1],b[1],(j+.5)/n);
      if(onSand(x,z)||!pathNear(x,z,.016))continue;
      const y=heightAt(x,z);if(y>.07)continue;
      builder.part('box','#a7ae9e',[x,Math.max(.014,y)-.002,z],[.002,.005,len/n+.0002],[0,Math.atan2(b[0]-a[0],b[1]-a[1]),0]);seawallSegments++;
      if(j%3===0)builder.part('cylinder','#bcc5b4',[x,y+.0015,z],[.0005,.003,.0005]);
    }
  }
  for(const patch of patches.filter(p=>p.kind==='sand')){
    const centre=patch.ring.reduce((s,p)=>[s[0]+p[0]/patch.ring.length,s[1]+p[1]/patch.ring.length],[0,0]);let run=[];
    const flush=()=>{if(run.length>1)beachRoutes.push({points:run,kind:'beach',name:'沙滩散步',width:.009});run=[];};
    for(const p of patch.ring){const q=[mix(p[0],centre[0],.25),mix(p[1],centre[1],.25)];if(land(...q)&&onSand(...q)&&!blocked(...q,.006))run.push(q);else flush();}flush();
    for(let i=0;i<3;i++){
      const p=patch.ring[Math.floor(patch.ring.length*(i+1)/4)],x=mix(p[0],centre[0],.6),z=mix(p[1],centre[1],.6);
      if(!land(x,z)||!onSand(x,z)||blocked(x,z,.006)||pathNear(x,z,.008))continue;
      const y=base(x,z);builder.part('cylinder','#a99e81',[x,y+.004,z],[.0003,.008,.0003]);
      builder.part('cone',i%2?'#c99270':'#96afa2',[x,y+.008,z],[.006,.0018,.006]);
      for(const side of [-1,1])builder.part('box','#e9d6a9',[x+side*.006,y+.001,z],[.003,.0007,.007],[.15,0,0]);beachFurniture++;
    }
  }
  const instances=builder.finish();

  const walking=paths.map(p=>({points:p.points.map(v=>[v.x,v.z]),name:p.name,kind:p.kind,width:p.kind==='steps'?.005:.008})).concat(pierRoutes,beachRoutes);
  const crowd=createMappedCrowd({group,paths:walking,heightAt:(x,z,r)=>r.kind==='pier'?r.height:base(x,z),valid:(x,z,r)=>r.kind==='pier'?covers(x,z):land(x,z)&&!blocked(x,z,.0015),limit:300,seed:42881,scale:.6,groundOffset:.0006});
  let quality='balanced';
  function update(dt,target){
    group.visible=Math.hypot(target.x-toWorld(118.063,24.447)[0],target.z-toWorld(118.063,24.447)[1])<24;
    crowd.update(dt);
  }
  function getState(){
    return {snapshot:detail.snapshot,paths:paths.length,houses,landmarks:landmarks.map(p=>({id:p.id,form:p.form,x:p.x,z:p.z,reference:p.reference})),terminals,scenicFeatures,sculptures,landcoverPatches:patches.length,trees:treePositions.length,instances,stairFlights,pierSegments,railPosts,seawallSegments,beachFurniture,beachPaths:beachRoutes.length,quality,forms:[...new Set(landmarks.map(p=>p.form))],...crowd.getState()};
  }
  const [centerX,centerZ]=toWorld(118.063,24.447);update(0,V(centerX,0,centerZ));
  return {update,getState,covers,setQuality(q){quality=q;},setLight(night){for(const [key,material] of builder.materials)if(key.endsWith('-true'))material.emissiveIntensity=night*2.0;}};
}
