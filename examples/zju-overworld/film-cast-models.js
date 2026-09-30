/** Original sculpted, stylised film portraits. +Z faces forward, metres.
 * Apply immediately after createAvatar and BEFORE the first applyOutfit.
 * No images, canvas, imports, networking, or changes to the animation skeleton.
 */
export const FILM_CAST = Object.freeze([
 {id:'film-nolan',name:'克里斯托弗·诺兰',englishName:'Christopher Nolan',gender:'male',baseVariant:'academy-blue',description:'宽额方颌、微垂眼睑、灰棕侧分波浪短发'},
 {id:'film-murphy',name:'基里安·墨菲',englishName:'Cillian Murphy',gender:'male',baseVariant:'academy-blue',description:'高颧骨、内收双颊、窄下颌、冰蓝眼睛与深棕侧分发'},
 {id:'film-dicaprio',name:'莱昂纳多·迪卡普里奥',englishName:'Leonardo DiCaprio',gender:'male',baseVariant:'sunlight-orange',description:'宽额、圆润下颌、蓝灰眼睛、后梳金棕发与短胡茬'},
 {id:'film-hathaway',name:'安妮·海瑟薇',englishName:'Anne Hathaway',gender:'female',baseVariant:'female-lilac',description:'修长鹅蛋脸、宽杏眼、饱满唇形与半扎深栗长发'},
 {id:'film-tony-leung',name:'梁朝伟',englishName:'Tony Leung',gender:'male',baseVariant:'academy-blue',description:'柔和方颌、深眼窝、平眉与侧分短发'},
 {id:'film-andy-lau',name:'刘德华',englishName:'Andy Lau',gender:'male',baseVariant:'sunlight-orange',description:'修长轮廓、锐利颧骨、直鼻与上梳短发'},
 {id:'film-zhou-xun',name:'周迅',englishName:'Zhou Xun',gender:'female',baseVariant:'female-green',description:'小巧心形脸、宽眼距、薄唇与侧分肩长波浪发'},
 {id:'film-zhang-ziyi',name:'章子怡',englishName:'Zhang Ziyi',gender:'female',baseVariant:'female-blue',description:'细长鹅蛋脸、上扬杏眼、细眉与蓬松侧分黑发'},
]);
const PROFILES = [
 {width:1.04,jaw:1.06,chin:.93,cheek:.88,hollow:.08,eyeW:.047,eyeH:.012,eyeY:.183,eyeGap:.066,tilt:-.001,brow:.007,nose:.040,noseW:.020,lipW:.044,lipH:.007,skin:'#d5ae96',shade:'#b98e79',lip:'#976b64',hair:'#5b514a',hairLit:'#85796c',iris:'#788890',style:'wave',part:-.065,shirt:'#3d4e60',pants:'#30353b'},
 {width:.93,jaw:.79,chin:.73,cheek:1.42,hollow:1.0,eyeW:.049,eyeH:.014,eyeY:.186,eyeGap:.070,tilt:.001,brow:.008,nose:.046,noseW:.016,lipW:.039,lipH:.009,skin:'#d5b29e',shade:'#b88f7e',lip:'#a46e68',hair:'#352d29',hairLit:'#5a4940',iris:'#78a9bc',style:'side',part:-.059,shirt:'#303c42',pants:'#272e32'},
 {width:1.07,jaw:1.01,chin:1.03,cheek:.9,hollow:.20,eyeW:.044,eyeH:.011,eyeY:.182,eyeGap:.067,tilt:-.001,brow:.008,nose:.038,noseW:.020,lipW:.043,lipH:.008,skin:'#d7ac91',shade:'#b78d77',lip:'#9b7066',hair:'#65513b',hairLit:'#9a8060',iris:'#759397',style:'slick',part:-.035,shirt:'#293840',pants:'#303339'},
 {width:.96,jaw:.83,chin:.83,cheek:.91,hollow:.25,eyeW:.058,eyeH:.018,eyeY:.186,eyeGap:.071,tilt:.002,brow:.010,nose:.036,noseW:.016,lipW:.052,lipH:.014,skin:'#e4bfab',shade:'#c7a18e',lip:'#ab6267',hair:'#332c29',hairLit:'#57453c',iris:'#5c4736',style:'long',part:-.035,shirt:'#78667e',pants:'#48404d'},
 {width:1.00,jaw:.97,chin:.88,cheek:.93,hollow:.42,eyeW:.047,eyeH:.010,eyeY:.184,eyeGap:.066,tilt:-.001,brow:.006,nose:.040,noseW:.021,lipW:.042,lipH:.007,skin:'#c9a087',shade:'#ad816d',lip:'#93645e',hair:'#242626',hairLit:'#555652',iris:'#44362b',style:'side',part:-.043,shirt:'#545d58',pants:'#363c3a'},
 {width:.94,jaw:.84,chin:.82,cheek:1.18,hollow:.61,eyeW:.046,eyeH:.010,eyeY:.187,eyeGap:.064,tilt:.002,brow:.008,nose:.049,noseW:.018,lipW:.043,lipH:.007,skin:'#cba185',shade:'#af846a',lip:'#96645b',hair:'#2c2926',hairLit:'#625a4d',iris:'#443326',style:'quiff',part:-.046,shirt:'#455168',pants:'#313843'},
 {width:.91,jaw:.72,chin:.66,cheek:1.08,hollow:.15,eyeW:.054,eyeH:.014,eyeY:.185,eyeGap:.073,tilt:.002,brow:.005,nose:.029,noseW:.015,lipW:.037,lipH:.007,skin:'#dfb79d',shade:'#c49880',lip:'#a86c69',hair:'#222522',hairLit:'#474a40',iris:'#44382d',style:'bob',part:-.050,shirt:'#5d776e',pants:'#394c48'},
 {width:.91,jaw:.76,chin:.76,cheek:.95,hollow:.22,eyeW:.050,eyeH:.010,eyeY:.188,eyeGap:.066,tilt:.004,brow:.004,nose:.034,noseW:.015,lipW:.040,lipH:.010,skin:'#dfb498',shade:'#bf947b',lip:'#a05a60',hair:'#292626',hairLit:'#524a44',iris:'#423128',style:'bun',part:0,shirt:'#94715e',pants:'#534943'},
];
Object.assign(PROFILES[0],{eyeH:.009,brow:.002,browAngle:-.002,eyeFold:.006,mature:true,noseW:.023,chin:1.08,style:'wave'});
Object.assign(PROFILES[1],{eyeH:.011,brow:.004,browAngle:.002,eyeFold:.003,chin:.80,hollow:.70});
Object.assign(PROFILES[2],{eyeH:.0085,brow:.003,browAngle:-.002,eyeFold:.005,chin:1.10,jaw:1.05,noseW:.022,beard:true});
Object.assign(PROFILES[3],{eyeH:.014,brow:.009,browAngle:.002,eyeFold:.002,chin:.88,part:0});
Object.assign(PROFILES[4],{eyeH:.007,brow:.001,browAngle:0,eyeFold:.006,mature:true,nose:.031,noseW:.023,chin:1.02,jaw:1.04,style:'crop'});
Object.assign(PROFILES[5],{eyeH:.0075,brow:.003,browAngle:.004,eyeFold:.004,nose:.039,noseW:.021,chin:.98,jaw:.95,style:'quiff'});
Object.assign(PROFILES[6],{eyeH:.011,brow:.002,browAngle:.001,eyeFold:.001,chin:.77,lipW:.043,style:'shoulder',part:-.060});
Object.assign(PROFILES[7],{eyeH:.0085,brow:.001,browAngle:.005,eyeFold:.002,chin:.88,style:'softwave',part:.027});
const stores=new WeakMap(),instances=new WeakMap();
const gauss=(x,c,s)=>Math.exp(-(((x-c)/s)**2)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const rows=[[-.049,.026,.073],[-.035,.075,.106],[-.005,.114,.131],[.035,.139,.139],[.085,.154,.145],[.135,.160,.144],[.185,.153,.141],[.235,.155,.142],[.280,.149,.135],[.322,.126,.110],[.352,.081,.073],[.373,.001,.002]];
function section(y,p){
 let k=1;for(;k<rows.length-1;k++)if(y<=rows[k][0])break;const a=rows[k-1],b=rows[k],before=rows[Math.max(0,k-2)],after=rows[Math.min(rows.length-1,k+1)],t=clamp((y-a[0])/(b[0]-a[0]),0,1);
 const component=n=>{const m0=(b[n]-before[n])/(b[0]-before[0]),m1=(after[n]-a[n])/(after[0]-a[0]),h=b[0]-a[0];return(2*t*t*t-3*t*t+1)*a[n]+(t*t*t-2*t*t+t)*h*m0+(-2*t*t*t+3*t*t)*b[n]+(t*t*t-t*t)*h*m1;};
 let w=component(1)*p.width;w*=1+(p.jaw-1)*gauss(y,.025,.057)+(p.chin-1)*gauss(y,-.022,.030);w+=.007*(p.cheek-1)*gauss(y,.12,.035);return[Math.max(.001,w),Math.max(.002,component(2))];
}
function front(x,y,p){
 const [w,d]=section(y,p),u=clamp(x/Math.max(w,.001),-1,1),edge=Math.pow(Math.max(0,1-u*u),.23);let z=d*Math.pow(Math.max(0,1-u*u),.32),base=z;
 z+=.011*p.cheek*(gauss(x,.092,.040)+gauss(x,-.092,.040))*gauss(y,.128,.026);
 z-=.008*p.hollow*(gauss(x,.103,.029)+gauss(x,-.103,.029))*gauss(y,.071,.038);
 z-=.014*(gauss(x,p.eyeGap,.027)+gauss(x,-p.eyeGap,.027))*gauss(y,p.eyeY,.018);
 z+=.009*(gauss(x,p.eyeGap,.039)+gauss(x,-p.eyeGap,.039))*gauss(y,p.eyeY+.027,.012);
 z+=p.nose*.62*gauss(x,0,p.noseW*.66)*gauss(y,.163,.047)+p.nose*gauss(x,0,p.noseW)*gauss(y,.113,.021);
 z+=.008*gauss(x,0,.050)*gauss(y,.049,.023)+.008*gauss(x,0,.040)*gauss(y,.002,.022);return base+(z-base)*edge;
}
function makeAsset(T,p){
 const batches=new Map(),materials=new Map(),assets=[];
 const palette={skin:p.skin,shade:p.shade,lip:p.lip,lipline:'#784d48',hair:p.hair,hairLit:p.hairLit,white:'#eee8df',iris:p.iris,dark:'#26221f'};if(p.beard)palette.beard='#967d64';
 for(const [key,color]of Object.entries(palette))materials.set(key,new T.MeshStandardMaterial({color,roughness:key==='iris'?.34:key==='hair'?.72:.86,metalness:0,flatShading:false}));
 function add(g,slot,at=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){const matrix=new T.Matrix4().compose(new T.Vector3(...at),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));g.applyMatrix4(matrix);if(g.index){const expanded=g.toNonIndexed();g.dispose();g=expanded;}if(!batches.has(slot))batches.set(slot,[]);batches.get(slot).push(g);}
 function ellipsoid(slot,at,scale,rotation=[0,0,0],segments=12){add(new T.SphereGeometry(1,Math.min(segments,14),8),slot,at,scale,rotation);}
 function surface(slot,nu,nv,point){const pos=[],ix=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++)pos.push(...point(i/nu,j/nv));for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){let a=j*(nu+1)+i,b=a+nu+1;ix.push(a,a+1,b,b,a+1,b+1);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();const n=g.attributes.normal,position=g.attributes.position;for(let j=0;j<=nv;j++){const a=j*(nu+1),b=a+nu;if(Math.hypot(position.getX(a)-position.getX(b),position.getY(a)-position.getY(b),position.getZ(a)-position.getZ(b))<1e-6){const v=new T.Vector3(n.getX(a)+n.getX(b),n.getY(a)+n.getY(b),n.getZ(a)+n.getZ(b)).normalize();n.setXYZ(a,v.x,v.y,v.z);n.setXYZ(b,v.x,v.y,v.z);}}add(g,slot);}
 function curve(slot,points,radius=.002,segments=16,radial=5){const path=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v)));segments=Math.min(segments,slot.startsWith('hair')?10:12);radial=Math.min(radial,4);if(slot==='hair'&&radius>.008){surface(slot,radial,segments,(u,v)=>{const center=path.getPoint(v),tangent=path.getTangent(v),out=center.clone().sub(new T.Vector3(0,.17,0)).normalize(),side=new T.Vector3().crossVectors(tangent,out).normalize(),normal=new T.Vector3().crossVectors(side,tangent).normalize(),a=-u*Math.PI*2,r=radius*(.75+.25*Math.sin(v*Math.PI));return center.addScaledVector(side,Math.cos(a)*r).addScaledVector(normal,Math.sin(a)*r*.55).toArray();});}else add(new T.TubeGeometry(path,segments,radius,radial,false),slot);}
 const pt=(x,y,offset=0)=>[x,y,front(x,y,p)+offset];
 // A continuous, smooth face shell includes cheeks, jaw, nose and eye sockets.
 surface('skin',48,30,(u,v)=>{const y=lerp(rows[0][0],rows.at(-1)[0],v),theta=u*Math.PI*2,[w,d]=section(y,p),x=Math.sin(theta)*w,c=Math.cos(theta);return[x,y,c>=0?front(x,y,p):c*d*.91];});
 for(const sign of [-1,1]){
  ellipsoid('skin',[sign*.159*p.width,.126,-.002],[.030,.049,.023],[0,0,-sign*.12]);ellipsoid('shade',[sign*.177*p.width,.128,.014],[.009,.030,.008]);
  const cx=sign*p.eyeGap,cy=p.eyeY;
  // Almond-shaped whites sit in the carved sockets; no photo planes.
  surface('white',22,8,(u,v)=>{const q=u*2-1,x=cx+q*p.eyeW*.5,h=Math.pow(Math.max(0,1-q*q),.72)*p.eyeH,y=cy+sign*q*p.tilt+(v*2-1)*h;return pt(x,y,.003+Math.sin(Math.PI*v)*.003);});
  ellipsoid('iris',pt(cx,cy,.0085),[p.eyeH*.63,p.eyeH*.78,.004],[],14);
  ellipsoid('dark',pt(cx,cy,.012),[p.eyeH*.32,p.eyeH*.44,.0018],[],12);
  ellipsoid('white',pt(cx-.0024,cy+.0038,.014),[.0016,.0016,.001],[],8);
  for(const signY of [-1,1]){const points=[];for(let i=0;i<=14;i++){const q=i/7-1,x=cx+q*p.eyeW*.5,y=cy+sign*q*p.tilt+signY*Math.pow(Math.max(0,1-q*q),.72)*p.eyeH;points.push(pt(x,y,.005));}curve(signY>0?'hair':'shade',points,signY>0?.0017:.0015,16,5);}
  const brows=[];for(let i=0;i<=10;i++){const q=i/10,x=sign*(p.eyeGap-p.eyeW*.53+q*p.eyeW*1.12),y=cy+.025+Math.sin(q*Math.PI)*p.brow+q*p.browAngle;brows.push(pt(x,y,.003));}curve('hair',brows,p.gender==='female'?.0021:.0027,18,6);
  if(p.eyeFold){const fold=[];for(let i=0;i<10;i++){const q=i/9*2-1,x=cx+q*p.eyeW*.54,y=cy+sign*q*p.tilt+p.eyeH*Math.sqrt(Math.max(0,1-q*q))+p.eyeFold;fold.push(pt(x,y,.001));}curve('shade',fold,p.mature?.002:.0013,12,5);}
  ellipsoid('shade',pt(sign*p.noseW*.73,.103,.002),[.0055,.0026,.003],[.1,0,0],10);
  // Soft under-eye fold distinguishes mature portraits without black stripes.
  if(p.mature){const fold=[];for(let i=0;i<7;i++){const q=i/6-0.5,x=cx+q*p.eyeW*.94,y=cy-.018-.003*Math.cos(q*Math.PI*2);fold.push(pt(x,y,.001));}curve('shade',fold,.0011,12,5);}
 }
 // Cupid bow, a lower lip volume, and a restrained mouth seam.
 for(const upper of [true,false])surface('lip',24,6,(u,v)=>{const q=u*2-1,x=q*p.lipW,y0=.045+.001*Math.cos(q*Math.PI),h=p.lipH*Math.pow(Math.max(0,1-q*q),.8)*(upper?.72:1);const cupid=upper?-.003*gauss(q,0,.18)+.002*(gauss(q,.3,.18)+gauss(q,-.3,.18)):0,y=y0+(upper?1:-1)*v*h+cupid*v;return pt(x,y,.0015+Math.sin(v*Math.PI)*.004);});
 const seam=[];for(let i=0;i<15;i++){const q=i/7-1;seam.push(pt(q*p.lipW,.045+.001*Math.cos(q*Math.PI),.003));}curve('lipline',seam,.0008,16,5);
 if(p.beard){
  surface('beard',28,9,(u,v)=>{const x=(u*2-1)*.090,upper=.012+Math.abs(u*2-1)*.040,lower=-.034+Math.abs(u*2-1)*.014,y=lerp(lower,upper,v);return pt(x,y,.001);});
  for(const sign of [-1,1])surface('beard',12,4,(u,v)=>{const x=sign*(.008+u*.037),y=.063+.011*Math.sin(u*Math.PI)-v*.007;return pt(x,y,.001);});
 }
 // Scalp follows a variable hairline: temples lower, front open above brows.
 function hairline(theta){const c=Math.cos(theta),side=Math.abs(Math.sin(theta));return c>0?.273-.050*Math.pow(side,4)+(p.style==='slick'?.014:p.style==='side'?-.014:p.style==='quiff'?.009:0):.057+.14*Math.pow(side,2);}
 surface('hair',48,20,(u,v)=>{const theta=u*Math.PI*2,s=Math.sin(theta),c=Math.cos(theta),bottom=hairline(theta),y=lerp(bottom,.397,v),sy=lerp(bottom-.008,.373,v),[w,d]=section(sy,p),[wy,dy]=section(Math.min(y,.373),p),maxW=Math.max(w,wy),extra=.013*(1-v),x=s*(maxW+extra),z=c>=0?Math.max(front(s*w,sy,p),front(s*wy,Math.min(y,.373),p))+c*extra:c*(Math.max(d,dy)*.91+extra);return[x,y,z];});
 const hairY=(x,z)=>.181+.210*Math.sqrt(Math.max(.015,1-(x/(.180*p.width))**2-((z+.009)/.175)**2));
 // Sculpted ribbons define direction and hair volume; each is merged by material.
 const hairTop = p.style==='quiff'?.407:p.style==='slick'?.390:.386;
 if(['wave','side','slick','quiff','crop'].includes(p.style)){
  if(['crop','slick','quiff'].includes(p.style))for(let k=0;k<10;k++){const x=(k/9-.5)*.27,pts=[];for(let j=0;j<7;j++){const z=lerp(.132,-.14,j/6),y=Math.max(.268,hairY(x,z)+.005)+(p.style==='quiff'?.020*Math.sin(j/6*Math.PI):0);pts.push([x,y,z]);}curve('hair',pts,p.style==='crop'?.010:.014,16,5);curve('hairLit',pts.map(v=>[v[0],v[1]+.007,v[2]]),.001,16,4);}
  else for(let k=0;k<10;k++){
   const z0=.125-k*.025,lead=p.part,sideTo=.142*p.width,points=[];
   for(let j=0;j<=7;j++){const t=j/7,x=lerp(lead,sideTo,t),z=z0-.017*t,y=Math.max(.25,hairY(x,z)+.006)+(p.style==='wave'?.005*Math.sin(k+t*4):0);points.push([x,y,z]);}
   curve('hair',points,p.style==='wave'?.020:.016,18,7);curve('hairLit',points.map(v=>[v[0],v[1]+.007,v[2]+.003]),.0012,18,4);
   const short=[];for(let j=0;j<5;j++){const t=j/4,x=lerp(lead-.015,-.159*p.width,t),z=z0-.020*t;short.push([x,hairY(x,z)+.004,z]);}curve('hair',short,.017,12,5);
  }
  // Short temple hair remains tight to the head and leaves ears readable.
  for(const sign of [-1,1])ellipsoid('hair',[sign*.148*p.width,.214,-.008],[.014,.060,.083],[0,0,sign*.06]);
  if(p.style==='side')for(let k=0;k<3;k++){const pts=[[-.062,.335,.122],[.010,.287-k*.008,.151],[.093,.246-k*.003,.139]];curve('hair',pts,.021,14,5);}
  if(p.mature)for(const sign of [-1,1])for(let k=0;k<4;k++)curve('hairLit',[[sign*.151*p.width,.270-k*.009,-.022],[sign*.160*p.width,.244-k*.009,-.046],[sign*.157*p.width,.214-k*.007,-.070]],.0016,10,4);
 } else if(['long','shoulder','softwave'].includes(p.style)){
  const long=p.style==='long',end=long?-.21:p.style==='shoulder'?-.13:-.17;
  // Continuous closed hair masses connect crown, temples and lower locks.
  ellipsoid('hair',[0,(.255+end)*.5,-.128],[.170*p.width,(.255-end)*.61,.067],[],20);
  for(const sign of [-1,1]){const tuck=p.style==='shoulder'&&sign>0;ellipsoid('hair',[sign*.156*p.width,(.268+end)*.5,tuck?-.070:-.017],[tuck?.030:p.style==='softwave'?.051:.043,(.268-end)*.57,tuck?.075:.122],[0,0,sign*.018],18);}
  for(const sign of [-1,1])for(let k=0;k<7;k++){
   const z=(p.style==='shoulder'&&sign>0?-.015:.075)-k*.034,x=sign*(.151*p.width+.018),points=[];
   for(let j=0;j<=10;j++){const t=j/10;points.push([x+sign*(.008+Math.sin(t*Math.PI*(long?2.5:1.8))* (p.style==='softwave'?.030:.018)),lerp(.292,end+(sign<0&&p.style==='shoulder'?.04:0),t),z+.014*Math.sin(t*6+k)]);}
   curve('hair',points,long?.027:.024,22,7);curve('hairLit',points.map(v=>[v[0]+sign*.019,v[1],v[2]+.009]),.0013,22,4);
  }
  for(let k=0;k<10;k++){const x=(k/9-.5)*.29*p.width,points=[[x,.318,-.10],[x*1.10,.20,-.148],[x*1.05,.03,-.150],[x*.98,end,-.126]];curve('hair',points,.027,18,7);}
  // Side part, with soft asymmetry across the forehead instead of blunt blocks.
  for(const sign of [-1,1])for(let k=0;k<4;k++){const z=.088-k*.025,x=p.part,midZ=.135-k*.016,tuck=p.style==='shoulder'&&sign>0;const points=[[x,hairY(x,z)+.005,z],[sign*.09,hairY(sign*.09,midZ)+.020,midZ],[sign*.160,.246,(tuck?.060:.104)-k*.011],[sign*.172,.153,(tuck?-.040:.060)-k*.012]];curve('hair',points,.025,20,7);curve('hairLit',points.map(v=>[v[0],v[1]+.006,v[2]+.015]),.0013,20,4);}
  if(long){ellipsoid('hair',[0,.31,-.156],[.091,.069,.060]);for(const sign of [-1,1])for(let k=0;k<4;k++)curve('hair',[[sign*.14,.25,.018-k*.028],[sign*.13,.32,-.093],[sign*.057,.322,-.192]],.017,14,5);}
 } else {
  ellipsoid('hair',[0,.304,-.178],[.096,.087,.074]);
  for(let k=0;k<9;k++){const theta=k/9*Math.PI*2,pts=[];for(let j=0;j<=10;j++){const t=j/10,angle=theta+t*1.4;pts.push([Math.sin(angle)*.071,.306+Math.cos(angle)*.069,-.188-.052*Math.sin(t*Math.PI)]);}curve('hairLit',pts,.0018,18,5);}
  for(const sign of [-1,1])for(let k=0;k<8;k++){const pts=[[sign*.01,.373,.088-k*.020],[sign*.109,.322,.104-k*.024],[sign*.150,.237,.021-k*.020],[sign*.055,.28,-.178]];curve('hair',pts,.009,18,6);curve('hairLit',pts.map(v=>[v[0],v[1]+.004,v[2]+.005]),.0009,18,4);}
 }
 for(const [slot,list]of batches){let length=0;for(const g of list)length+=g.attributes.position.array.length;const positions=new Float32Array(length),normals=new Float32Array(length);let offset=0;for(const g of list){positions.set(g.attributes.position.array,offset);normals.set(g.attributes.normal.array,offset);offset+=g.attributes.position.array.length;g.dispose();}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('normal',new T.BufferAttribute(normals,3));g.computeBoundingBox();g.computeBoundingSphere();assets.push({slot,geometry:g,material:materials.get(slot)});}
 return{assets,refs:0,dispose(){for(const a of assets)a.geometry.dispose();for(const m of materials.values())m.dispose();}};
}
function release(T,id,asset){if(--asset.refs>0)return;asset.dispose();stores.get(T)?.delete(id);}

/** Returns the same rig; automatically extends rig.dispose with pooled cleanup. */
export function applyFilmAppearance(T,rig,id){
 const index=FILM_CAST.findIndex(x=>x.id===id);if(index<0)return rig;
 if(!rig?.joints?.head||!rig.meshes||!rig.materials)throw new TypeError('applyFilmAppearance expects createAvatar rig');
 if(instances.has(rig)){if(rig.filmId===id)return rig;throw new Error('Choose a film appearance before the first outfit; create a new rig to change identity');}
 const p={...PROFILES[index],gender:FILM_CAST[index].gender};let pool=stores.get(T);if(!pool){pool=new Map();stores.set(T,pool);}let asset=pool.get(id);if(!asset){asset=makeAsset(T,p);pool.set(id,asset);}asset.refs++;
 const portrait=new T.Group();portrait.name='film-portrait:'+id;const hidden=[];
 for(const mesh of Object.values(rig.meshes)){if(mesh.parent===rig.joints.head){hidden.push([mesh,mesh.visible]);mesh.visible=false;}}
 for(const item of asset.assets){const mesh=new T.Mesh(item.geometry,item.material);mesh.name='filmFace'+item.slot[0].toUpperCase()+item.slot.slice(1);mesh.castShadow=true;mesh.receiveShadow=false;portrait.add(mesh);rig.meshes[mesh.name]=mesh;}
 rig.joints.head.add(portrait);rig.baseVariant=rig.variant;rig.variant=id;rig.label=FILM_CAST[index].name;rig.filmId=id;rig.group.userData.filmId=id;rig.group.userData.avatarVariant=id;rig.group.userData.avatarLabel=rig.label;rig.filmAppearance={id,name:rig.label,group:portrait};
 // Avatar materials are already private; wardrobe copies these as its baseline.
 for(const [slot,color]of Object.entries({skin:p.skin,skinShade:p.shade,shirt:p.shirt,shirtShade:p.pants,pants:p.pants,hair:p.hair,undershirt:'#e5dfd3',shoe:'#3c3c39'}))if(rig.materials[slot])rig.materials[slot].color.set(color);
 for(const key of ['skin','skinShade'])if(rig.materials[key])rig.materials[key].flatShading=false;
 const previous=rig.dispose;let disposed=false;
 rig.dispose=function disposeFilmAvatar(){if(disposed)return;disposed=true;portrait.removeFromParent();for(const item of asset.assets)delete rig.meshes['filmFace'+item.slot[0].toUpperCase()+item.slot.slice(1)];for(const [mesh,visible]of hidden)mesh.visible=visible;release(T,id,asset);instances.delete(rig);if(previous)previous.call(rig);};
 instances.set(rig,{asset,portrait});return rig;
}
