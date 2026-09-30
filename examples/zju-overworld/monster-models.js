/** Low-poly campus survival creatures. No imports, textures or external assets.
 * createMonster(THREE, type, seed); supported types are listed in MONSTER_NAMES.
 * +Z is forward, +Y is up, idle animal feet rest on y=0. World movement is caller-owned.
 * update(dt,{speed,attack,hit,dead}): speed m/s; the other fields accept booleans
 * or 0..1 strengths. Hit rising edges flash; attack runs a repeating attack cycle.
 * Geometry/materials are shared per THREE namespace and reference-counted.
 */
export const MONSTER_NAMES=Object.freeze({wolf:'灰狼',tiger:'斑纹虎',lion:'鬃毛狮',lantern:'提灯鬼',bear:'黑熊',boar:'獠牙野猪',spider:'巨蛛',bat:'夜蝠',treant:'树怪',frostfox:'三尾霜狐'});
const POOLS=new WeakMap(),TYPES=new Set(Object.keys(MONSTER_NAMES));
const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const amount=v=>v===true?1:typeof v==='number'&&Number.isFinite(v)?clamp(v,0,1):0;
function seeded(seed){let s=(Number(seed)||0)>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

function retainPool(T){
 let p=POOLS.get(T);if(p){p.refs++;return p;}
 p={refs:1,geometries:new Map(),materials:new Map(),lanterns:new Set(),lights:[]};POOLS.set(T,p);
 p.geo=(key,factory)=>{if(!p.geometries.has(key))p.geometries.set(key,factory());return p.geometries.get(key);};
 p.mat=(color,extra={})=>{const key=color+JSON.stringify(extra);if(!p.materials.has(key))p.materials.set(key,new T.MeshStandardMaterial({color,roughness:.88,flatShading:true,...extra}));return p.materials.get(key);};
 p.syncLights=()=>{
  const owners=[...p.lanterns].filter(o=>!o.dead).slice(0,2);
  for(let i=0;i<owners.length;i++){
   if(!p.lights[i]){const light=new T.PointLight('#ffc479',1.8,4.8,2);light.name='Lantern ghost warm light · shared budget';light.castShadow=false;p.lights.push(light);}
   const light=p.lights[i];if(light.parent!==owners[i].anchor){light.removeFromParent();owners[i].anchor.add(light);}light.position.set(0,.14,0);light.visible=true;
  }
  for(let i=owners.length;i<p.lights.length;i++){p.lights[i].visible=false;p.lights[i].removeFromParent();}
 };
 p.release=()=>{if(--p.refs>0)return;for(const l of p.lights){l.removeFromParent();l.dispose?.();}for(const g of p.geometries.values())g.dispose();for(const m of p.materials.values())m.dispose();p.lanterns.clear();POOLS.delete(T);};
 return p;
}

export function createMonster(T,type,seed=0){
 if(!T?.Mesh||!T?.Group)throw new TypeError('createMonster requires THREE');
 if(!TYPES.has(type))throw new RangeError('Unknown monster type: '+type);
 const p=retainPool(T),random=seeded(seed),group=new T.Group(),motion=new T.Group(),model=new T.Group();
 group.name=`Survival ${type}`;group.userData.monsterType=type;group.userData.monsterName=MONSTER_NAMES[type];group.userData.forward='+Z';group.userData.seed=seed;
 group.add(motion);motion.add(model);const pivotY=type==='lantern'?.7:.52;motion.position.y=pivotY;model.position.y=-pivotY;
 const painted=[],legs=[],flaps=[],spiderLegs=[],wings=[],treeLegs=[],foxTails=[];let head,tail,leftArm,rightArm,lantern,lightOwner=null,disposed=false;
 const phaseSeed=random()*TAU,coatVariant=Math.floor(random()*3);let gait=phaseSeed,time=0,attackClock=0,attackBlend=0,death=0,hitClock=0,previousHit=0,previousAttack=0,wasDead=false;
 const unitBox=p.geo('box',()=>new T.BoxGeometry(1,1,1));
 const unitBall=p.geo('ball12x8',()=>new T.SphereGeometry(1,12,8));
 const smallBall=p.geo('ball8x6',()=>new T.SphereGeometry(1,8,6));
 const flashMaterial=p.mat('#fff3d6',{emissive:'#e09058',emissiveIntensity:.6});
 function mesh(parent,geometry,color,position=[0,0,0],scale=[1,1,1],extra={}){
  const m=new T.Mesh(geometry,p.mat(color,extra));m.position.set(...position);m.scale.set(...scale);m.castShadow=!extra.transparent;m.receiveShadow=false;parent.add(m);painted.push({mesh:m,material:m.material});return m;
 }
 function box(parent,size,at,color,extra){return mesh(parent,unitBox,color,at,size,extra);}
 function ball(parent,size,at,color,extra,small=false){return mesh(parent,small?smallBall:unitBall,color,at,size,extra);}
 function joint(parent,name,at){const g=new T.Group();g.name=name;g.position.set(...at);parent.add(g);return g;}
 function cylinder(parent,r1,r2,length,at,color,segments=8){const key=['cylinder',r1,r2,length,segments].join(':');return mesh(parent,p.geo(key,()=>new T.CylinderGeometry(r1,r2,length,segments)),color,at);}
 function link(parent,a,b,r1,r2,color,segments=8){const va=new T.Vector3(...a),vb=new T.Vector3(...b),delta=vb.clone().sub(va),m=cylinder(parent,r1,r2,delta.length(),va.add(vb).multiplyScalar(.5).toArray(),color,segments);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;}
 function cone(parent,radius,height,at,color,segments=5){const key=['cone',radius,height,segments].join(':');return mesh(parent,p.geo(key,()=>new T.ConeGeometry(radius,height,segments)),color,at);}
 function eyePair(parent,z,y,x,color){
  for(const sign of [-1,1]){ball(parent,[.039,.032,.018],[sign*x,y,z],'#292b23',{},true);ball(parent,[.019,.021,.01],[sign*x,y+.004,z+.015],color,{emissive:color,emissiveIntensity:.22},true);ball(parent,[.007,.022,.008],[sign*x,y+.004,z+.023],'#151b18',{},true);}
 }
 function paws(bodyColor,hipY,upperLength,lowerLength,width,front,rear,chunk,footColor){
  for(const [label,z,fore] of [['front',front,true],['rear',rear,false]])for(const sign of [-1,1]){
   const hip=joint(model,`${label} leg ${sign}`, [sign*width,hipY,z]);const upper=cylinder(hip,chunk,chunk*.78,upperLength,[0,-upperLength/2,0],bodyColor);upper.rotation.z=sign*.035;
   const knee=joint(hip,'knee',[0,-upperLength,0]);cylinder(knee,chunk*.72,chunk*.54,lowerLength,[0,-lowerLength/2,0],bodyColor);
   const foot=joint(knee,'paw',[0,-lowerLength,0]);ball(foot,[chunk*.9,.05,chunk*1.38],[0,-.04,.025],footColor||(type==='wolf'?'#adaf9f':bodyColor),{},true);
   legs.push({hip,knee,foot,fore,sign});
  }
 }

 if(type==='wolf'){
  const coat=['#7e8987','#87918a','#737f80'][coatVariant],dark='#596767',light='#d3d6c5';
  ball(model,[.245,.255,.57],[0,.665,-.07],coat);ball(model,[.20,.25,.29],[0,.72,.32],light);ball(model,[.22,.17,.47],[0,.785,-.12],dark);
  paws(coat,.60,.25,.26,.18,.34,-.4,.072);
  head=joint(model,'Wolf head',[0,.865,.51]);ball(head,[.205,.20,.25],[0,0,0],coat);ball(head,[.16,.105,.19],[0,-.105,.08],light);
  const muzzle=cylinder(head,.09,.14,.29,[0,-.015,.24],light,6);muzzle.rotation.x=Math.PI/2;ball(head,[.094,.061,.055],[0,.006,.402],'#263433',{},true);
  box(head,[.15,.011,.16],[0,-.068,.30],'#414845');eyePair(head,.176,.065,.142,'#c1b769');
  for(const sign of [-1,1]){
   const ear=cone(head,.105,.25,[sign*.15,.205,-.035],dark,3);ear.rotation.z=sign*-.13;
   const inset=cone(head,.055,.145,[sign*.15,.212,.012],'#b5b0a0',3);inset.rotation.z=sign*-.13;
  }
  tail=joint(model,'Bushy wolf tail',[0,.735,-.59]);link(tail,[0,0,0],[0,-.16,-.25],.095,.075,coat);link(tail,[0,-.16,-.25],[0,-.30,-.43],.075,.025,dark);
 }else if(type==='tiger'){
  const coat=['#ca8743','#c17d3c','#d2934e'][coatVariant],pale='#ead9ac',stripe='#393c31';
  ball(model,[.31,.29,.63],[0,.71,-.08],coat);ball(model,[.235,.125,.45],[0,.50,-.07],pale);paws(coat,.64,.27,.28,.22,.39,-.44,.094);
  // Tapered curved ribbons follow the torso's ellipsoid; geometry is shared.
  for(let band=0;band<6;band++){
   const geometry=p.geo('tiger-stripe:'+band,()=>{
    const points=[],indices=[],steps=12,center=-.48+band*.18;
    for(let j=0;j<=steps;j++){
     const theta=-.12+(Math.PI+.24)*j/steps,w=(.048+(band%2)*.01)*(.3+.7*Math.sin(Math.PI*j/steps));
     for(const side of [-1,1]){const z=center+.033*Math.sin(theta*2.2+band*.7)+side*w/2,profile=Math.sqrt(Math.max(.02,1-(z/.63)**2));points.push(Math.cos(theta)*.313*profile,Math.sin(theta)*.293*profile,z);}
     if(j<steps){const a=j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return g;
   });mesh(model,geometry,stripe,[0,.71,-.08],[1,1,1],{side:T.DoubleSide});
  }
  head=joint(model,'Tiger head',[0,.87,.56]);ball(head,[.255,.225,.25],[0,0,0],coat);ball(head,[.205,.105,.15],[0,-.105,.175],pale);ball(head,[.11,.076,.07],[0,-.065,.30],pale,{},true);ball(head,[.054,.033,.03],[0,-.025,.35],'#684941',{},true);
  for(const sign of [-1,1]){
   ball(head,[.085,.09,.047],[sign*.19,.18,-.045],stripe,{},true);ball(head,[.048,.049,.013],[sign*.19,.18,-.004],pale,{},true);
   for(let i=0;i<3;i++){const mark=box(head,[.095,.022,.025],[sign*(.135+i*.012),.09-i*.085,.22-Math.abs(i-1)*.02],stripe);mark.rotation.z=sign*(.16+i*.1);}
  }
  eyePair(head,.218,.055,.145,'#b8b977');box(head,[.026,.11,.027],[0,.095,.233],stripe);
  tail=joint(model,'Ringed tiger tail',[0,.71,-.70]);link(tail,[0,0,0],[.1,-.1,-.25],.038,.033,coat);link(tail,[.1,-.1,-.25],[.17,.07,-.48],.033,.025,coat);
  for(let i=0;i<5;i++)ball(tail,[.038,.039,.033],[.024+i*.035,-.03-(i<2?i*.03:.06-(i-2)*.07),-.075-i*.09],stripe,{},true);
  for(const leg of legs){cylinder(leg.hip,.101,.098,.026,[0,-.12,0],stripe);cylinder(leg.knee,.066,.064,.023,[0,-.09,0],stripe);}
 }else if(type==='lion'){
  const coat=['#c9a36a','#c3a06c','#d0ad78'][coatVariant],mane='#8a633f',maneLight='#a57a4b',pale='#e4cca0';
  ball(model,[.305,.30,.61],[0,.75,-.12],coat);ball(model,[.22,.18,.37],[0,.555,-.07],pale);paws(coat,.68,.29,.30,.22,.36,-.44,.096);
  head=joint(model,'Lion head and mane',[0,.98,.49]);ball(head,[.375,.37,.245],[0,0,-.035],mane);
  for(let i=0;i<10;i++){const a=i/10*TAU,r=.295;const tuft=cone(head,.098,.25,[Math.cos(a)*r,Math.sin(a)*r,-.035],i%2?mane:maneLight,5);tuft.rotation.z=a-Math.PI/2;}
  ball(head,[.22,.235,.21],[0,.015,.14],coat);ball(head,[.185,.098,.115],[0,-.105,.30],pale);ball(head,[.067,.043,.035],[0,-.052,.405],'#584735',{},true);
  box(head,[.012,.055,.012],[0,-.10,.395],'#6d533e');eyePair(head,.316,.085,.134,'#c8ac64');
  for(const sign of [-1,1]){ball(head,[.07,.075,.047],[sign*.20,.20,.105],coat,{},true);ball(head,[.033,.036,.012],[sign*.20,.20,.15],'#80664d',{},true);}
  tail=joint(model,'Lion tail',[0,.765,-.70]);link(tail,[0,0,0],[.04,-.12,-.28],.028,.025,coat);link(tail,[.04,-.12,-.28],[.14,.045,-.50],.025,.022,coat);ball(tail,[.07,.09,.1],[.15,.058,-.51],mane,{},true);
 }else if(type==='lantern'){
  const cloth=['#435a60','#435369','#4e5c60'][coatVariant],dark='#293d46',edge='#66817d',bone='#dddbc4';
  const robe=cylinder(model,.20,.32,.74,[0,.76,0],cloth,9);robe.rotation.y=.17;
  ball(model,[.25,.18,.20],[0,1.10,0],cloth);ball(model,[.21,.11,.19],[0,.37,0],edge,{transparent:true,opacity:.6,depthWrite:false});
  for(let i=0;i<7;i++){
   const a=i/7*TAU,g=joint(model,'Floating robe hem',[Math.sin(a)*.245,.43,Math.cos(a)*.245]);const strip=cone(g,.105,.37,[0,-.105,0],i%2?cloth:edge,3);strip.rotation.z=Math.PI;flaps.push(g);
  }
  head=joint(model,'Lantern ghost hood',[0,1.35,0]);ball(head,[.265,.285,.23],[0,0,-.025],dark);ball(head,[.18,.215,.048],[0,-.015,.19],bone);ball(head,[.127,.08,.02],[0,-.10,.232],'#344b4e',{},true);
  for(const sign of [-1,1]){ball(head,[.049,.057,.022],[sign*.077,.04,.24],'#e4ac50',{emissive:'#f5b849',emissiveIntensity:1.3},true);box(head,[.013,.025,.02],[sign*.071,.04,.264],'#fff4c9',{emissive:'#fff1b2',emissiveIntensity:1.8});}
  function arm(sign){const shoulder=joint(model,'Robe arm',[sign*.25,1.07,0]);cylinder(shoulder,.085,.068,.27,[0,-.135,0],cloth);const elbow=joint(shoulder,'Elbow',[0,-.27,0]);cylinder(elbow,.065,.045,.23,[0,-.115,0],dark);ball(elbow,[.048,.062,.046],[0,-.235,0],bone,{},true);return{shoulder,elbow};}
  leftArm=arm(-1);rightArm=arm(1);leftArm.shoulder.rotation.z=-.17;rightArm.shoulder.rotation.z=.30;rightArm.elbow.rotation.x=-.18;
  lantern=joint(rightArm.elbow,'Held warm lantern',[0,-.40,.025]);
  const ring=p.geo('lantern-handle',()=>new T.TorusGeometry(.075,.009,5,12));mesh(lantern,ring,'#354449',[0,.19,0]);
  box(lantern,[.18,.24,.18],[0,.045,0],'#efbd67',{emissive:'#f4b354',emissiveIntensity:1.2,roughness:.4});
  for(const x of [-.10,.10])for(const z of [-.10,.10])box(lantern,[.017,.29,.017],[x,.045,z],'#34464b');
  box(lantern,[.24,.032,.24],[0,-.115,0],'#34464b');box(lantern,[.24,.034,.24],[0,.20,0],'#34464b');cone(lantern,.175,.085,[0,.252,0],'#34464b',4).rotation.y=Math.PI/4;
  const glow=ball(lantern,[.027,.051,.027],[0,.045,.092],'#ffe1a0',{emissive:'#ffd07a',emissiveIntensity:2.1},true);glow.name='Lantern flame';
  lightOwner={anchor:lantern,dead:false};p.lanterns.add(lightOwner);p.syncLights();
 }else if(type==='bear'){
  const coat=['#373e3b','#414740','#353c40'][coatVariant],muzzle='#a9a28c';
  ball(model,[.42,.38,.65],[0,.83,-.06],coat);ball(model,[.37,.35,.34],[0,.89,.37],coat);paws(coat,.73,.34,.30,.285,.38,-.43,.137,'#303732');
  head=joint(model,'Bear rounded head',[0,1.105,.55]);ball(head,[.30,.265,.25],[0,0,0],coat);ball(head,[.175,.12,.18],[0,-.10,.22],muzzle);ball(head,[.095,.065,.047],[0,-.053,.377],'#222c2b',{},true);
  for(const sign of [-1,1]){ball(head,[.103,.102,.071],[sign*.225,.22,-.035],coat,{},true);ball(head,[.055,.056,.012],[sign*.225,.227,.03],'#7b8074',{},true);const patch=box(model,[.075,.28,.024],[sign*.088,.825,.627],'#c3c3a6');patch.rotation.z=sign*.55;}
  eyePair(head,.212,.060,.183,'#a89960');tail=joint(model,'Bear stub tail',[0,.82,-.72]);ball(tail,[.095,.082,.088],[0,0,0],coat,{},true);
 }else if(type==='boar'){
  const coat=['#756655','#6b6255','#80705c'][coatVariant],dark='#42463d',ivory='#e7dbc0';
  ball(model,[.35,.32,.57],[0,.64,-.11],coat);ball(model,[.30,.34,.30],[0,.70,.25],coat);paws(coat,.51,.23,.19,.23,.32,-.42,.092,dark);
  head=joint(model,'Boar tusked head',[0,.64,.51]);ball(head,[.255,.245,.30],[0,0,0],coat);const snout=cylinder(head,.13,.18,.26,[0,-.075,.275],coat,7);snout.rotation.x=Math.PI/2;ball(head,[.133,.096,.036],[0,-.075,.42],'#9c826b',{},true);
  for(const sign of [-1,1]){
   ball(head,[.024,.035,.013],[sign*.056,-.067,.45],dark,{},true);const ear=cone(head,.12,.24,[sign*.21,.19,-.04],coat,3);ear.rotation.z=-sign*.65;
   link(head,[sign*.20,-.14,.19],[sign*.29,-.04,.29],.056,.031,ivory,6);const tip=cone(head,.033,.18,[sign*.28,.035,.29],ivory,5);tip.rotation.z=sign*.17;
  }
  eyePair(head,.20,.06,.193,'#b9a36b');for(let i=0;i<7;i++){const bristle=cone(model,.054,.19,[0,.91,-.48+i*.115],dark,3);bristle.rotation.x=-.24;}
  tail=joint(model,'Curled boar tail',[0,.69,-.69]);const ring=p.geo('boar-tail-ring',()=>new T.TorusGeometry(.075,.018,5,10,Math.PI*1.7));const curl=mesh(tail,ring,coat,[.01,0,-.04]);curl.rotation.y=Math.PI/2;
 }else if(type==='spider'){
  const shell=['#544751','#484752','#504841'][coatVariant],jointColor='#786752',tipColor='#302f38';
  ball(model,[.40,.28,.47],[0,.48,-.29],shell);ball(model,[.265,.20,.275],[0,.42,.25],shell);ball(model,[.20,.055,.28],[0,.738,-.32],'#997556',{},true);
  head=joint(model,'Spider face',[0,.405,.49]);ball(head,[.205,.145,.17],[0,0,0],shell,{},true);
  for(const sign of [-1,1])for(let i=0;i<3;i++)ball(head,[.027-i*.004,.029-i*.004,.023],[sign*(.053+i*.054),.05+(i%2)*.042,.158-i*.024],'#e5a466',{emissive:'#de744c',emissiveIntensity:.55},true);
  for(const sign of [-1,1]){const fang=cone(head,.035,.14,[sign*.067,-.103,.177],'#b6b39d',5);fang.rotation.x=Math.PI*.83;}
  for(const sign of [-1,1])for(let i=0;i<4;i++){
   const z=-.24+i*.19,zSweep=(i-1.5)*.24,hip=joint(model,`Spider leg ${sign} ${i}`,[sign*.18,.44,z]);
   link(hip,[0,0,0],[sign*.47,.17,zSweep],.053,.043,jointColor,6);const knee=joint(hip,'Spider knee',[sign*.47,.17,zSweep]);
   link(knee,[0,0,0],[sign*.40,-.575,zSweep*.65],.042,.020,tipColor,6);ball(knee,[.027,.026,.036],[sign*.40,-.584,zSweep*.65],tipColor,{},true);
   spiderLegs.push({hip,knee,sign,index:i});
  }
 }else if(type==='bat'){
  const fur=['#595260','#51495d','#535560'][coatVariant],membrane='#765867',bone='#b0988c';
  ball(model,[.155,.255,.14],[0,1.05,0],fur);ball(model,[.104,.17,.055],[0,1.05,.125],'#958385');
  head=joint(model,'Bat head',[0,1.30,.07]);ball(head,[.18,.165,.16],[0,0,0],fur,{},true);ball(head,[.072,.06,.047],[0,-.035,.16],'#b19795',{},true);
  for(const sign of [-1,1]){const ear=cone(head,.083,.27,[sign*.127,.20,-.005],fur,3);ear.rotation.z=-sign*.14;const inner=cone(head,.042,.16,[sign*.128,.21,.035],'#b38f92',3);inner.rotation.z=-sign*.14;const fang=cone(head,.012,.056,[sign*.044,-.088,.165],'#e4d7c0',4);fang.rotation.z=Math.PI;}
  eyePair(head,.147,.026,.098,'#d49a66');
  const web=p.geo('bat-wing-web',()=>{const g=new T.BufferGeometry(),vertices=[0,0,0,.32,.16,-.015,.77,.20,-.025,1.06,.015,-.07,.75,-.28,.025,.44,-.19,.065,.14,-.23,.025];g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex([0,1,2,0,2,3,0,3,4,0,4,5,0,5,6]);g.computeVertexNormals();return g;});
  for(const sign of [-1,1]){
   const wing=joint(model,'Bat wing '+sign,[sign*.115,1.17,-.035]);wing.scale.x=sign;mesh(wing,web,membrane,[0,0,0],[1,1,1],{side:T.DoubleSide});
   for(const end of [[.32,.16,-.015],[.77,.20,-.025],[1.06,.015,-.07],[.75,-.28,.025]])link(wing,[0,0,0],end,.016,.009,bone,5);wings.push({wing,sign});
   link(model,[sign*.08,.85,0],[sign*.085,.68,.015],.027,.014,fur,5);box(model,[.055,.02,.085],[sign*.085,.663,.04],bone);
  }
 }else if(type==='treant'){
  const bark=['#76674e','#6b644c','#817154'][coatVariant],dark='#464b3c',leaf='#708459';
  cylinder(model,.265,.335,.85,[0,1.01,0],bark,8);ball(model,[.30,.18,.24],[0,.68,0],dark,{},true);
  for(const sign of [-1,1]){
   const hip=joint(model,'Root leg '+sign,[sign*.18,.62,0]);link(hip,[0,0,0],[sign*.035,-.235,.018],.13,.09,bark,7);const knee=joint(hip,'Root knee',[sign*.035,-.235,.018]);link(knee,[0,0,0],[-sign*.018,-.28,.012],.088,.065,bark,6);
   const foot=joint(knee,'Root foot',[-sign*.018,-.28,.012]);ball(foot,[.15,.065,.23],[0,-.04,.08],dark,{},true);treeLegs.push({hip,knee,foot,sign});
  }
  head=joint(model,'Tree spirit face',[0,1.44,.012]);cylinder(head,.24,.285,.43,[0,.065,0],bark,7);
  for(const sign of [-1,1]){box(head,[.094,.058,.031],[sign*.105,.11,.268],dark);box(head,[.059,.027,.015],[sign*.105,.116,.292],'#bdd184',{emissive:'#9cba67',emissiveIntensity:.6});const brow=box(head,[.145,.038,.056],[sign*.115,.173,.271],bark);brow.rotation.z=sign*.21;}
  box(head,[.13,.025,.03],[0,-.058,.291],dark);
  for(const sign of [-1,1]){
   link(head,[sign*.16,.23,-.04],[sign*.30,.53,-.07],.074,.043,bark,6);link(head,[sign*.30,.53,-.07],[sign*.49,.70,-.055],.043,.019,bark,5);link(head,[sign*.30,.53,-.07],[sign*.22,.75,-.04],.042,.016,bark,5);
   ball(head,[.145,.1,.15],[sign*.47,.67,-.015],leaf,{},true);ball(head,[.10,.085,.105],[sign*.23,.72,-.015],'#85945e',{},true);
   const shoulder=joint(model,'Branch arm '+sign,[sign*.30,1.23,0]);link(shoulder,[0,0,0],[sign*.29,-.19,.01],.105,.075,bark,7);const elbow=joint(shoulder,'Branch elbow',[sign*.29,-.19,.01]);link(elbow,[0,0,0],[sign*.13,-.31,.055],.074,.045,bark,6);
   for(let i=0;i<3;i++)link(elbow,[sign*.13,-.29,.055],[sign*(.10+i*.06),-.45,.075+i*.045],.026,.01,dark,5);
   if(sign<0)leftArm={shoulder,elbow};else rightArm={shoulder,elbow};
  }
  for(const [x,y,z]of [[-.20,1.09,.245],[.19,.88,.257],[-.12,1.31,-.245]])ball(model,[.10,.16,.035],[x,y,z],leaf,{},true);
 }else if(type==='frostfox'){
  const coat=['#e2e9e2','#dce7e5','#e9ede5'][coatVariant],blue='#9dbbc9',ice='#b9deeb';
  ball(model,[.215,.215,.45],[0,.54,-.04],coat);ball(model,[.19,.23,.245],[0,.57,.245],blue);paws(coat,.47,.19,.19,.145,.26,-.31,.061,blue);
  head=joint(model,'Frost fox face',[0,.72,.385]);ball(head,[.178,.168,.19],[0,0,0],coat);ball(head,[.125,.085,.14],[0,-.071,.115],coat,{},true);const muzzle=cylinder(head,.059,.105,.22,[0,-.016,.19],coat,5);muzzle.rotation.x=Math.PI/2;ball(head,[.061,.043,.028],[0,-.002,.313],'#597b8a',{},true);
  for(const sign of [-1,1]){const ear=cone(head,.080,.245,[sign*.12,.173,-.015],coat,3);ear.rotation.z=-sign*.12;const inner=cone(head,.041,.151,[sign*.12,.183,.025],blue,3);inner.rotation.z=-sign*.12;}
  eyePair(head,.151,.05,.122,'#b2e0ec');for(const sign of [-1,0,1]){const tuft=cone(model,.083,.23,[sign*.11,.72,.21],ice,4);tuft.rotation.z=sign*.4;}
  tail=joint(model,'Fanned frost fox tails',[0,.555,-.43]);
  for(const turn of [-.58,0,.58]){const g=joint(tail,'Frost tail',[0,0,0]);g.rotation.y=turn;const fur=ball(g,[.105,.14,.325],[0,.125,-.30],coat);fur.rotation.x=.20;const tip=ball(g,[.083,.105,.19],[0,.205,-.605],ice,{},true);tip.rotation.x=.30;foxTails.push({joint:g,turn});}
 }
 head.userData.restY=head.position.y;head.userData.restZ=head.position.z;
 const scaleVariation=.98+random()*.04;group.userData.sizeVariation=scaleVariation;
 // Keep public group.scale free for gameplay; the seeded variation is internal.
 motion.scale.setScalar(scaleVariation);motion.position.y=pivotY*scaleVariation;
 const restMaterials=()=>{for(const item of painted)item.mesh.material=item.material;};
 function update(dt,state={}){
  if(disposed)return;dt=clamp(Number.isFinite(dt)?dt:0,0,.1);time+=dt;
  const speed=clamp(Math.abs(Number.isFinite(state.speed)?state.speed:0),0,16),attack=amount(state.attack),hit=amount(state.hit),dead=amount(state.dead)>0;
  if(hit>0&&previousHit<=0)hitClock=.28;previousHit=hit;hitClock=Math.max(0,hitClock-dt);
  if(attack>0&&previousAttack<=0)attackClock=0;previousAttack=attack;attackClock+=dt*(type==='lantern'?1.05:1.65);
  const blend=1-Math.exp(-dt*12);attackBlend+=(attack-attackBlend)*blend;death+=(Number(dead)-death)*(1-Math.exp(-dt*7));if(Math.abs(death-Number(dead))<.0001)death=Number(dead);
  if(dead!==wasDead&&lightOwner){lightOwner.dead=dead;p.syncLights();}wasDead=dead;
  const alive=1-death,gaitWeight=clamp(speed/3.2,0,1)*alive,gaitRate=1.25+Math.min(speed,8)*.37;gait+=dt*gaitRate*TAU;
  const pulse=Math.max(0,Math.sin((attackClock%1)*Math.PI))*attackBlend*alive;
  if(type==='lantern'){
   motion.position.y=(pivotY+.055*Math.sin(time*2.2+phaseSeed)+.04*gaitWeight)*scaleVariation;
   motion.rotation.set(-.08*gaitWeight-.13*pulse,Math.sin(time*.8+phaseSeed)*.035,Math.sin(time*1.3+phaseSeed)*.025);
   for(let i=0;i<flaps.length;i++){flaps[i].rotation.x=Math.sin(time*2.5+i)*(.09+.12*gaitWeight)*alive;flaps[i].rotation.z=Math.cos(time*1.8+i)*.06*alive;}
   leftArm.shoulder.rotation.x=-.12-.22*Math.sin(gait)*gaitWeight-1.25*pulse;leftArm.elbow.rotation.x=-.15-.3*pulse;
   rightArm.shoulder.rotation.x=-.1+.15*Math.sin(gait+.8)*gaitWeight-.45*pulse;rightArm.elbow.rotation.x=-.18+.10*Math.sin(time*2.4)*alive;
   lantern.rotation.z=Math.sin(time*2+phaseSeed)*.1*alive;head.rotation.x=.025*Math.sin(time*1.9)-.18*pulse;
  }else if(type==='spider'){
   motion.position.y=(pivotY+.014*Math.sin(gait*2)*gaitWeight+.035*pulse)*scaleVariation;motion.rotation.set(-.09*pulse,0,0);
   for(const leg of spiderLegs){const a=gait+(leg.index%2?Math.PI:0)+(leg.sign<0?Math.PI:0);leg.hip.rotation.y=leg.sign*.24*Math.sin(a)*gaitWeight;leg.hip.rotation.x=(leg.index>1?-.30:0)*pulse;leg.knee.rotation.z=leg.sign*(.18*Math.max(0,Math.cos(a))*gaitWeight+.58*death);}
   head.rotation.x=-.28*pulse;head.rotation.y=.025*Math.sin(time*1.4+phaseSeed)*alive;
  }else if(type==='bat'){
   motion.position.y=(pivotY+.045*Math.sin(time*5+phaseSeed)-.16*pulse)*scaleVariation;motion.rotation.set(.28*pulse+.06*gaitWeight,Math.sin(time*1.7+phaseSeed)*.035*alive,0);
   const flap=.08+Math.sin(time*(12+Math.min(speed,7))+phaseSeed)*.62;
   for(const {wing,sign}of wings){wing.rotation.z=sign*(flap*alive+1.05*death);wing.rotation.y=-sign*.1*pulse;}
   head.rotation.x=-.18*pulse;
  }else if(type==='treant'){
   motion.position.y=(pivotY+.025*(.5+.5*Math.sin(gait*2))*gaitWeight)*scaleVariation;motion.rotation.set(-.08*pulse,0,.035*Math.sin(gait)*gaitWeight);
   for(const leg of treeLegs){const a=gait+(leg.sign>0?0:Math.PI);leg.hip.rotation.x=.38*Math.sin(a)*gaitWeight;leg.knee.rotation.x=.28*Math.max(0,Math.cos(a))*gaitWeight;leg.foot.rotation.x=-leg.hip.rotation.x*.45;}
   leftArm.shoulder.rotation.x=-.28*Math.sin(gait)*gaitWeight-1.0*pulse;rightArm.shoulder.rotation.x=.28*Math.sin(gait)*gaitWeight-1.0*pulse;leftArm.elbow.rotation.x=-.28*pulse;rightArm.elbow.rotation.x=-.28*pulse;head.rotation.x=-.15*pulse;
  }else{
   motion.position.y=(pivotY+.025*gaitWeight*(.5+.5*Math.sin(gait*2))+.075*pulse)*scaleVariation;
   motion.rotation.set(-.09*pulse,0,.012*Math.sin(gait)*gaitWeight);
   for(const leg of legs){
    const offset=(leg.fore?0:Math.PI)+(leg.sign<0?Math.PI:0),a=gait+offset,swing=Math.sin(a),lift=Math.max(0,Math.cos(a));
    leg.hip.rotation.x=.58*swing*gaitWeight+(leg.fore?-.95:.40)*pulse;
    leg.knee.rotation.x=.66*lift*gaitWeight+(leg.fore?.24:.36)*pulse;leg.foot.rotation.x=-leg.hip.rotation.x*.35-leg.knee.rotation.x*.5;
   }
   tail.rotation.y=.12*Math.sin(time*2.1+phaseSeed)+.19*Math.sin(gait)*gaitWeight;tail.rotation.x=-.1*gaitWeight;
   for(let i=0;i<foxTails.length;i++)foxTails[i].joint.rotation.y=foxTails[i].turn+.08*Math.sin(time*2.3+i*.8+phaseSeed)*alive;
   head.rotation.x=.026*Math.sin(gait*2)*gaitWeight-.20*pulse;head.rotation.y=.035*Math.sin(time*.85+phaseSeed)*alive;
  }
  head.position.z=head.userData.restZ+.10*pulse;head.position.y=head.userData.restY+.018*Math.sin(time*1.6+phaseSeed)*alive;
  if(death>0){
   if(type==='spider'){motion.rotation.x+=Math.PI*.92*death;motion.position.y+=(.40-pivotY)*scaleVariation*death;}
   else{motion.rotation.z+=(seed%2?-1:1)*Math.PI*.49*death;motion.rotation.x+=.10*death;const restHeight=type==='bat'?.66:type==='treant'?.90:.36;motion.position.y+=(restHeight-pivotY)*scaleVariation*death;}
   for(const leg of legs){leg.hip.rotation.x*=alive;leg.knee.rotation.x=leg.knee.rotation.x*alive+.38*death;leg.foot.rotation.x*=alive;}
   if(type==='lantern'){motion.position.y-=.13*death;leftArm.shoulder.rotation.x*=alive;rightArm.shoulder.rotation.x*=alive;}
  }
  const flash=hitClock>0&&Math.floor(hitClock*24)%2===0;
  for(const item of painted)item.mesh.material=flash?flashMaterial:item.material;
  group.userData.animation={speed,attack:pulse,hit:flash,dead:death};
 }
 function dispose(){if(disposed)return;disposed=true;restMaterials();if(lightOwner){p.lanterns.delete(lightOwner);p.syncLights();}group.removeFromParent();group.clear();p.release();}
 update(0,{speed:0});return{group,update,dispose};
}
