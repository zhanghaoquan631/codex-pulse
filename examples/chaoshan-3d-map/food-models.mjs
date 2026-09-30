import * as THREE from 'three';
import {box,disc,material} from './scene-miniatures.mjs';

export function dishShape(name){
  return /擂茶/.test(name)?'leicha':/工夫茶/.test(name)?'tea':/乒乓粿/.test(name)?'pingpong':/鸭母捻/.test(name)?'dumpling-soup':/粿品/.test(name)?'peach-cake':/肠粉/.test(name)?'rice-roll':/豆干/.test(name)?'tofu':/豆腐/.test(name)?'stuffed-tofu':/蚝烙/.test(name)?'pancake':/饼/.test(name)?'pastry':/鹅/.test(name)?'goose':/鱼丸/.test(name)?'fishballs':/丸/.test(name)?'balls':/鱼饭/.test(name)?'seafood':/粥/.test(name)?'congee':/面线|粿汁/.test(name)?'noodles':'pastry';
}
const sphere=new THREE.SphereGeometry(1,20,14);
function oval(g,color,x,y,z,sx,sy,sz){const m=new THREE.Mesh(sphere,material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);g.add(m);return m;}
function line(g,color,points,r=.0008){const c=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const m=new THREE.Mesh(new THREE.TubeGeometry(c,24,r,5,false),material(color));g.add(m);return m;}
function bowl(g,color='#ecf1e8',soup='#a77c3f'){
  const profile=[[.004,0],[.020,.002],[.034,.014],[.039,.026],[.037,.028],[.033,.016],[.020,.006]].map(p=>new THREE.Vector2(...p));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(profile,36),material(color)));
  disc(g,soup,0,.020,0,.034,.002);
}
function garnish(g,y,count=25,color='#3e823e'){
  for(let i=0;i<count;i++){const a=i*2.399,r=.027*Math.sqrt((i+.5)/count);const m=box(g,color,Math.cos(a)*r,y,Math.sin(a)*r,.0028,.0015,.0012);m.rotation.y=a;}
}
function fish(g,x,z){
  oval(g,'#70969d',x,.018,z,.027,.009,.009);oval(g,'#cbd4c8',x,.015,z+.004,.022,.004,.006);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(.012,.018,3),material('#526f78'));tail.rotation.z=Math.PI/2;tail.position.set(x-.030,.018,z);g.add(tail);
  oval(g,'#172f33',x+.019,.024,z+.005,.002,.002,.002);
  for(let k=-2;k<=2;k++)line(g,'#536f75',[[x+k*.006,.025,z-.006],[x+k*.006+.003,.028,z],[x+k*.006,.025,z+.006]],.0005);
}
export function buildDish(parent,name,{x=0,y=0,z=0,scale=1}={}){
  const g=new THREE.Group();g.name='dish:'+name;g.position.set(x,y,z);g.scale.setScalar(scale);g.userData.dish=name;parent.add(g);
  const type=dishShape(name);g.userData.shape=type;
  if(['balls','fishballs','dumpling-soup','congee','noodles','leicha'].includes(type)){
    bowl(g,type==='leicha'?'#916441':'#e9f0ec',type==='leicha'?'#759a51':type==='congee'?'#dfd5ba':type==='dumpling-soup'?'#d8b277':'#b89866');
    if(type==='balls'||type==='fishballs'){
      for(let i=0;i<7;i++){const a=i*2.4;oval(g,type==='balls'?'#9b7961':'#ede7d6',Math.cos(a)*.022,.028,Math.sin(a)*.022,.008,.008,.008);}
      garnish(g,.030,16);
    }else if(type==='dumpling-soup'){
      for(let i=0;i<3;i++)oval(g,'#fff0dc',Math.sin(i*2.1)*.019,.027,Math.cos(i*2.1)*.019,.011,.008,.007);
      for(let i=0;i<5;i++)oval(g,i%2?'#a55737':'#f1d68a',Math.sin(i*1.6)*.028,.025,Math.cos(i*1.6)*.028,.003,.002,.004);
    }else if(type==='noodles'){
      for(let i=0;i<12;i++){const points=[];for(let j=0;j<9;j++){const a=j*.6+i;points.push([Math.cos(a)*(.008+i*.0014),.024+i*.0002,Math.sin(a)*(.008+i*.0014)]);}line(g,'#f3deb0',points,.001);}
      garnish(g,.032,12);
    }else if(type==='leicha'){
      const pestle=box(g,'#644731',.014,.022,0,.007,.049,.007);pestle.rotation.z=-.40;garnish(g,.024,50,'#d0bb81');
      for(let i=0;i<3;i++){const s=new THREE.Group();s.position.set((i-1)*.035,0,.065);s.scale.setScalar(.38);g.add(s);bowl(s,'#eff1df',['#685238','#d4bc82','#96a54f'][i]);garnish(s,.024,12,'#e1c88e');}
    }else {garnish(g,.025,55,'#f6ead0');oval(g,'#d97a50',.01,.026,.01,.012,.003,.005);garnish(g,.028,12);}
    const spoon=oval(g,'#e6eeeb',.045,.021,0,.009,.002,.005);box(g,'#e6eeeb',.045,.022,.016,.004,.003,.03);spoon.rotation.y=.3;
  }else if(type==='tea'){
    box(g,'#764e35',0,0,0,.089,.006,.066);
    for(let i=-4;i<=4;i++)box(g,'#b58550',i*.009,.006,0,.002,.001,.061);
    oval(g,'#90562f',-.017,.020,-.008,.016,.013,.014);disc(g,'#ac784b',-.017,.031,-.008,.013,.003);oval(g,'#754527',-.017,.036,-.008,.004,.004,.004);
    line(g,'#90562f',[[-.006,.018,-.009],[.008,.021,-.009],[.014,.031,-.009]],.004);
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.01,.002,6,18),material('#90562f'));handle.position.set(-.034,.021,-.008);g.add(handle);
    for(let i=0;i<3;i++){disc(g,'#f2ede2',(i-1)*.022,.007,.018,.008,.010);disc(g,'#945e2a',(i-1)*.022,.017,.018,.006,.001);}
  }else{
    disc(g,'#edf2ec',0,0,0,.047,.004);const rim=new THREE.Mesh(new THREE.TorusGeometry(.044,.002,6,36),material('#587b8c'));rim.rotation.x=Math.PI/2;rim.position.y=.005;g.add(rim);
    if(type==='tofu'||type==='stuffed-tofu'){
      for(let i=0;i<6;i++){const x=(i%3-1)*.022,z=(Math.floor(i/3)-.5)*.024;box(g,type==='tofu'?'#dca345':'#e9d8ac',x,.005,z,.019,.015,.020);box(g,'#f6e9bd',x,.009,z+.0101,.014,.008,.001);if(type==='stuffed-tofu')oval(g,'#875947',x,.022,z,.006,.004,.006);else for(let j=0;j<7;j++)oval(g,'#bb792c',x+Math.sin(j*2.4)*.007,.020,z+Math.cos(j*2.4)*.007,.0008,.0005,.0008);}
      disc(g,'#d5e4d1',.06,.001,0,.018,.006);disc(g,'#718d4c',.06,.007,0,.015,.001);
    }else if(type==='pancake'){
      const pts=[];for(let i=0;i<48;i++){const a=i/48*Math.PI*2,r=.039*(1+.08*Math.sin(i*7));pts.push(new THREE.Vector2(Math.cos(a)*r,Math.sin(a)*r));}
      const geo=new THREE.ExtrudeGeometry(new THREE.Shape(pts),{depth:.003,bevelEnabled:false});geo.rotateX(-Math.PI/2);const m=new THREE.Mesh(geo,material('#dca044'));m.position.y=.007;g.add(m);
      for(let i=0;i<12;i++)oval(g,i%2?'#7f7866':'#c5bba0',Math.sin(i*2.4)*.027,.012,Math.cos(i*2.4)*.027,.005,.002,.003);garnish(g,.014,35);
    }else if(type==='goose'){
      for(let i=0;i<8;i++){const z=(i-3.5)*.008;box(g,'#8c492a',0,.006,z,.049,.009,.007);box(g,'#d7b68c',0,.015,z,.043,.003,.005);box(g,'#854226',0,.018,z,.045,.001,.005);}
      oval(g,'#82452f',.029,.016,-.016,.012,.012,.018);garnish(g,.012,10);
    }else if(type==='seafood'){fish(g,0,-.015);fish(g,0,.014);}
    else if(type==='rice-roll'){
      for(let i=0;i<3;i++){oval(g,'#f6f0de',0,.013,(i-1)*.024,.035,.007,.010);line(g,'#cebd94',[[-.03,.017,(i-1)*.024],[0,.022,(i-1)*.024],[.03,.017,(i-1)*.024]],.001);}
      garnish(g,.022,17,'#965a2e');
    }else if(type==='peach-cake'){
      for(let i=0;i<3;i++){const s=new THREE.Shape();s.moveTo(0,-.023);s.bezierCurveTo(-.031,0,-.017,.024,0,.016);s.bezierCurveTo(.017,.024,.031,0,0,-.023);const geo=new THREE.ExtrudeGeometry(s,{depth:.006,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.001,bevelThickness:.001});geo.rotateX(-Math.PI/2);const m=new THREE.Mesh(geo,material('#db8290'));m.position.set((i-1)*.025,.008,i===1?.015:-.01);g.add(m);line(g,'#b85871',[[m.position.x,.016,m.position.z-.015],[m.position.x-.009,.016,m.position.z],[m.position.x,.016,m.position.z+.01],[m.position.x+.009,.016,m.position.z]],.0007);}
    }else if(type==='pingpong'){
      for(let i=0;i<3;i++){const x=(i-1)*.026,z=i===1?.013:-.01;oval(g,'#b9a779',x,.011,z,.017,.005,.013);oval(g,'#776246',x+.004,.014,z,.008,.003,.007);for(let k=0;k<9;k++)oval(g,'#d7c395',x+Math.sin(k*2.4)*.01,.016,z+Math.cos(k*2.4)*.008,.001,.0005,.0006);}
    }else{
      for(let i=0;i<4;i++){const x=(i%2-.5)*.034,z=(Math.floor(i/2)-.5)*.03;disc(g,'#b8753d',x,.005,z,.014,.009);disc(g,'#e6b965',x,.014,z,.013,.002);for(let j=0;j<9;j++)box(g,'#f0d395',x+Math.sin(j*2.4)*.009,.017,z+Math.cos(j*2.4)*.009,.001,.0005,.002);}
    }
  }
  return g;
}
