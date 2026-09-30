// Normalized parcels share a footprint, not a building silhouette or floor plan.
export function serviceBuilding(service,{size,height,variant=0,low=false,residential=false,setting}){
 const [type,,accent]=service;if(type==='home'&&!residential)return null;
 const parts=[],s=size,H=Math.min(height,low?.09:.14),v=variant%4;
 const part=(color,x,y,z,w,h,d,turn=0,shape='box')=>parts.push({color,x:x*s,y:y*s+.006,z:z*s,w:w*s,h:h*s,d:d*s,turn,shape});
 const wall=['#b6c5c0','#94b5b0','#bfac97','#97aa86'][v],roof='#456568',glass='#4e8390';
 const block=(x,z,w,d,h,color=wall)=>{part(color,x,h/2,z,w,h,d);part(roof,x,h+.035,z,w+.045,.07,d+.045);};
 const window=(x,z,y,w=.15,h=.21)=>part(glass,x,y,z,w,h,.014);
 const plant=(x,z,color='#538754')=>{part('#977e63',x,.075,z,.13,.15,.13);part(color,x,.22,z,.20,.23,.19,0,'sphere');};
 const table=(x,z)=>{part('#9d835b',x,.17,z,.20,.035,.20,0,'cylinder');part('#557474',x,.08,z,.025,.15,.025);};
 const chair=(x,z)=>{part('#79968b',x,.075,z,.085,.035,.085);part('#557474',x,.04,z,.06,.07,.06);};
 let sign={x:0,y:.62,z:.56,width:.88,height:.18};
 const tall=Math.min(H/s,1.6);
 if(type==='home'){
  const side=v%2?1:-1;
  block(side*.27,-.14,.40,.69,.90,wall);
  if(v<2)block(-side*.15,-.35,.44,.28,.62,'#9daa8d');
  else block(-side*.23,-.28,.31,.42,1.08,'#a9b9ad');
  for(const y of [.26,.61])window(side*.27,.212,y,.27,.19);
  // Exterior windows leave the connected wings and courtyard entrances intact.
  for(const y of [.29,.63]){
   window(side*.27,-.492,y,.22,.17);
   for(const z of [-.30,.025]){
    part(glass,side*.476,y,z,.012,.17,.14);
    part('#b6c7ba',side*.48,y-.10,z,.019,.027,.17);
   }
  }
  const wingX=-side*(v<2?.15:.23);
  for(const y of v<2?[.29]:[.31,.72]){
   window(wingX,-.497,y,v<2?.28:.19,.17);
   window(wingX,v<2?-.203:-.063,y,v<2?.28:.19,.17);
   part(glass,-side*(v<2?.376:.391),y,v<2?-.35:-.28,.012,.17,v<2?.14:.23);
  }
  part('#827051',side*.27,.15,.222,.11,.29,.012);
  part('#749781',-side*.19,.016,.12,.45,.03,.36);
  for(const x of [-.46,.46]){
   part('#7c9486',x,.14,-.01,.028,.28,.17);
   part('#7c9486',x,.07,.275,.028,.14,.40);
   for(const z of [.11,.44])part('#627d71',x,.095,z,.032,.19,.032);
  }
  part('#7c9486',-side*.34,.07,.47,.25,.14,.027);
  plant(-side*.27,.18);table(-side*.08,.33);chair(-side*.25,.38);
  part('#577c84',side*.21,.08,.39,.15,.16,.13);
  if(['dune','headland','fishing','harbour'].includes(setting)){
   // Compact coastal terraces stay inside the existing house and courtyard footprint.
   const terraceY=v<2?.69:1.15,terraceX=-side*(v<2?.15:.23),terraceZ=v<2?-.35:-.28;
   const tw=v<2?.39:.27,td=v<2?.23:.36;
   for(const x of [terraceX-tw/2,terraceX+tw/2])part('#719395',x,terraceY+.06,terraceZ,.018,.12,td);
   part('#719395',terraceX,terraceY+.06,terraceZ+td/2,tw,.12,.018);
   for(const y of [.26,.61])for(const x of [side*.27-.15,side*.27+.15]){
    part('#5f8981',x,y,.231,.075,.21,.020);
    for(const dy of [-.06,0,.06])part('#88aca0',x,y+dy,.246,.075,.013,.010);
   }
   if(v%2===0){
    for(const x of [-side*.40,side*.02])part('#62796c',x,.31,.39,.017,.62,.017);
    for(const z of [.12,.20,.28,.36,.44])part('#9d9e78',-side*.19,.64,z,.45,.028,.044);
   }else{
    part('#5a8291',side*.27,1.055,-.29,.16,.20,.16,0,'cylinder');
    part('#789995',side*.27,1.17,-.29,.18,.027,.18,0,'cylinder');
   }
  }
  sign={x:side*.27,y:.46,z:.224,width:.28,height:.12};
 }else if(type==='school'){
  if(v<2){
  block(0,-.23,.96,.48,1.15,'#9eb3be');block(-.36,.13,.23,.35,.72,'#b2bf98');
  part('#588e7f',.13,.015,.18,.58,.03,.50);
  for(const x of [-.32,-.12,.10,.32])window(x,.016,.73,.13,.22);
  for(const x of [-.32,.32])window(x,.016,.30,.13,.22);
  part('#365c68',0,.20,.028,.22,.40,.028);part('#bdcbbb',0,.20,.045,.015,.40,.015);
  part('#506f75',0,.46,.092,.32,.045,.20);
  for(const z of [.03,.16,.30])part('#cbd4ad',.12,.038,z,.46,.009,.012);
  part('#446169',.42,.50,.36,.022,.98,.022);part('#b64148',.33,.90,.36,.18,.15,.012);
  sign={x:0,y:1.0,z:.017,width:.74,height:.15};
  }else{
   block(0,-.36,.96,.25,.95,'#b2bf98');
   block(-.36,-.03,.24,.58,.78,'#9eb3be');block(.36,-.03,.24,.58,1.08,'#9eb3be');
   part('#5f947b',0,.016,.16,.43,.03,.53);part('#afbc9e',0,.034,.14,.12,.006,.55);
   for(const x of [-.32,-.12,.12,.32])window(x,-.228,.64,.13,.20);
   for(const x of [-.36,.36])for(const y of [.26,.56])window(x,.268,y,.15,.19);
   part('#365c68',0,.20,-.218,.19,.40,.018);part('#bfcba7',0,.20,-.203,.014,.40,.008);
   part('#506f75',0,.46,-.12,.30,.035,.23);
   for(const x of [-.12,.12])part('#577979',x,.23,-.02,.016,.46,.016);
   for(const x of [-.145,.145]){part('#819d73',x,.065,.35,.12,.09,.11);part('#538258',x,.13,.35,.12,.09,.12,0,'sphere');}
   for(const x of [-.22,.22])part('#668c81',x,.29,.29,.026,.58,.035);
   part('#506f75',0,.64,.29,.51,.12,.13);
   part('#446169',.42,.50,.42,.022,.98,.022);part('#b64148',.33,.90,.42,.18,.15,.012);
   sign={x:0,y:.64,z:.366,width:.43,height:.09};
  }
 }else if(type==='warehouse'){
  if(v<2){
  block(-.08,-.06,.80,.89,.70,'#92aaa5');
  for(let i=0;i<7;i++)part('#617f82',-.08,.745,-.43+i*.12,.80,.017,.02);
  part('#355458',-.12,.27,.394,.51,.50,.015);
  const shutterBottom=v<2?.20:.36;
  for(let i=0;i<4;i++)part('#a0b7b0',-.12,shutterBottom+i*.05,.407,.49,.014,.012);
  part('#708b86',-.12,.032,.46,.53,.055,.12);
  for(const x of [-.39,.155])part('#b89f55',x,.12,.425,.026,.24,.025);
  for(const z of [-.32,0,.31]){part('#9c8058',.40,.075,z,.15,.15,.20);part('#bc9d6d',.40,.21,z,.12,.12,.16);}
  sign={x:-.08,y:.55,z:.409,width:.69,height:.13};
  }else{
   for(const [i,x] of [-.26,.26].entries()){
    const h=i?.62:.78;block(x,-.10,.43,.69,h,'#92aaa5');
    part('#4f7883',x,h+.078,-.14,.22,.016,.31);
    for(const z of [-.24,-.12,0])part('#97b3b2',x,h+.089,z,.24,.010,.018);
    part('#355458',x,.23,.253,.30,.43,.014);
    for(let j=0;j<3;j++)part('#a0b7b0',x,.32+j*.04,.265,.29,.015,.012);
    part('#708b86',x,.04,.34,.37,.08,.16);
    for(const dx of [-.165,.165])part('#b89f55',x+dx,.12,.29,.022,.24,.022);
   }
   part('#506c72',0,.69,.35,.98,.05,.23);
   for(const x of [-.46,.46])part('#56777b',x,.34,.44,.02,.68,.02);
   for(const x of [-.47,.47]){part('#9c8058',x,.075,.53,.10,.15,.11);part('#bc9d6d',x,.18,.53,.085,.06,.09);}
   sign={x:0,y:.64,z:.476,width:.85,height:.12};
  }
 }else if(type==='police'){
  block(-.12,-.14,.70,.72,.99,'#abc0c6');block(.34,.18,.24,.40,.48,'#7b9aa7');
  part('#3d688a',-.12,.70,.227,.70,.15,.018);
  for(const x of [-.32,.09])window(x,.229,.42,.13,.24);
  part('#355568',-.12,.22,.239,.17,.44,.018);part('#c5cfc6',-.12,.22,.254,.012,.43,.008);
  part('#d0d9cd',-.12,.04,.39,.45,.08,.25);part('#40617b',-.12,.53,.38,.52,.05,.24);
  for(const x of [-.26,.02])part('#4d6a7c',x,.27,.44,.02,.50,.02);
  for(let i=0;i<3;i++)part('#a0b4ae',-.12,.015*(3-i),.51+i*.043,.26,.03*(3-i),.045);
  part('#bd5e59',.28,.54,.22,.07,.06,.05);part('#4b8bbc',.40,.54,.22,.07,.06,.05);
  sign={x:-.12,y:.68,z:.24,width:.64,height:.15};
 }else if(type==='supermarket'){
  block(0,-.17,.97,.64,.72,'#8db3b2');part(accent,0,.71,.20,1.04,.20,.14);
  for(const x of [-.34,.34])window(x,.157,.32,.19,.44);
  for(const x of [-.085,.085]){part('#36636b',x,.27,.170,.16,.52,.025);part('#b0c3b5',x,.27,.19,.014,.50,.012);}
  for(const x of [-.36,-.21])for(const z of [.31,.47]){part('#9a865c',x,.075,z,.11,.15,.12);part(z<.4?'#699665':'#d0bd64',x,.16,z,.10,.04,.11);}
  part('#527675',.34,.12,.40,.16,.025,.20);
  for(const x of [.27,.41])part('#809d96',x,.18,.40,.018,.14,.20);
  part('#809d96',.34,.18,.305,.15,.14,.018);part('#45666a',.34,.27,.50,.18,.02,.02);
  for(const x of [.28,.40])for(const z of [.33,.47])part('#425b60',x,.04,z,.035,.05,.035,0,'sphere');
  sign={x:0,y:.64,z:.279,width:.91,height:.17};
 }else if(type==='kfc'){
  block(-.13,-.15,.72,.72,.80,'#b8b8aa');
  part('#aa3c42',-.13,.77,-.15,.77,.12,.77);
  for(const x of [-.33,-.10,.11])window(x,.216,.38,.17,.48);
  for(let i=0;i<8;i++)part(i%2?'#cad0c3':'#b84046',-.46+i*.091,.55,.36,.087,.035,.24);
  part('#ac3e45',.39,.51,-.17,.15,1.02,.15);part('#d2d4c7',.39,.81,-.086,.09,.22,.013);
  table(.25,.32);chair(.42,.36);chair(.24,.51);
  sign={x:-.13,y:.66,z:.237,width:.65,height:.17};
 }else if(type==='coffee'){
  block(-.23,-.10,.52,.80,.92,'#799a9c');
  window(-.32,.308,.38,.23,.52);part('#355c62',-.13,.26,.318,.14,.51,.024);part('#bea677',-.09,.27,.337,.015,.06,.013);part('#506e72',.23,.71,-.28,.43,.07,.40);
  for(const x of [.04,.43])part('#657675',x,.35,-.10,.018,.70,.018);
  for(const z of [.09,.40]){table(.24,z);chair(.42,z);chair(.06,z);}
  plant(-.37,.44);sign={x:-.23,y:.70,z:.32,width:.48,height:.14};
 }else if(type==='florist'){
  block(-.11,-.20,.76,.52,.68,'#8aa594');window(-.28,.068,.30,.28,.38);
  part('#365f60',.07,.23,.075,.17,.46,.025);part('#d0b785',.12,.23,.094,.018,.055,.01);
  part('#9e678b',-.11,.62,.18,.82,.055,.27);
  for(const [i,x] of [-.34,.40].entries())for(let j=0;j<2;j++){
   const z=.27+j*.22;part('#927361',x,.07,z,.14,.14,.14,0,'cylinder');
   for(let k=-1;k<=1;k++){
    const h=.20+(k+1)*.035;part('#4e7850',x+k*.045,h/2+.07,z,.009,h-.14,.009);
    part(['#c78aaf','#d7bc65','#9784b2'][(i+j+v)%3],x+k*.045,h,z,.061,.045,.06,0,'sphere');
   }
  }
  sign={x:-.11,y:.59,z:.323,width:.70,height:.14};
 }else if(type==='tea'){
  block(-.31,-.05,.32,.87,.74,'#95a580');block(.13,-.35,.56,.27,.66,'#adbba0');
  part('#49694e',-.31,.79,-.05,.37,.075,.92);part('#49694e',.13,.70,-.35,.61,.075,.32);
  for(const z of [.03,.34]){table(.15,z);chair(-.02,z);chair(.33,z);part('#526c58',.15,.22,z,.045,.075,.045,0,'cylinder');}
  plant(.40,-.03);sign={x:-.31,y:.51,z:.40,width:.30,height:.14};
 }else if(type==='soup'||type==='noodles'){
  const noodle=type==='noodles';block(0,-.22,.98,.49,noodle?.82:.67,noodle?'#a9927d':'#9cb4a5');
  part(accent,0,.60,.15,1.03,.04,.24);
  part('#799997',-.22,.20,.15,.41,.38,.16);
  for(const x of [-.34,-.18]){part('#b6c3b6',x,.43,.14,.115,.10,.115,0,'cylinder');part('#526e70',x,.485,.14,.10,.012,.10,0,'cylinder');part('#bca174',x,.50,.14,.028,.018,.018);}
  part('#3d6465',.27,.22,.035,.20,.43,.025);
  part('#4c777a',-.48,.67,-.22,.065,1.25,.065);part('#79918d',-.43,1.24,-.22,.17,.07,.065);
  if(noodle){part('#9d835b',0,.17,.35,.66,.035,.20);for(const x of [-.28,0,.28])part('#557474',x,.08,.35,.025,.15,.025);}
  for(const x of noodle?[-.18,.17]:[.14,.38]){
   if(!noodle)table(x,.35);chair(x,.52);part('#d4d1b7',x,.214,.35,.095,.046,.095,0,'cylinder');
   part(noodle?'#b79953':'#739579',x,.239,.35,.078,.008,.078,0,'cylinder');
   for(let k=-1;k<=1;k++)part(noodle?'#dbc273':'#bdb595',x+k*.020,.247,.35,noodle?.012:.022,.012,noodle?.052:.022,noodle?k*.17:0,noodle?'box':'sphere');
   for(const dz of [-.014,.014])part('#577547',x+.014,.249,.35+dz,.016,.009,.012);
   for(const dz of [.30,.316])part('#826947',x,.248,dz,.13,.006,.006,.15);
  }
  sign={x:0,y:.50,z:.28,width:.87,height:.16};
 }else if(type==='seafood'){
  block(0,-.24,.95,.44,.76,'#759ba5');part('#517e8b',0,.60,.12,1.0,.04,.29);
  for(const x of [-.29,0,.29]){part('#81b8b9',x,.14,.24,.23,.28,.24);part('#568d9c',x,.285,.24,.19,.018,.20);}
  for(const x of [-.33,.34])part('#aaa075',x,.07,.48,.20,.13,.15);
  sign={x:0,y:.50,z:.273,width:.90,height:.16};
 }else if(type==='bakery'){
  block(.10,-.16,.77,.65,.77,'#b59f86');
  part('#a37552',-.34,.44,-.26,.29,.88,.36);part('#637d78',-.34,.96,-.26,.13,.22,.14);
  window(.10,.171,.36,.64,.40);part('#a48759',.10,.65,.28,.84,.045,.20);
  for(let i=0;i<4;i++)part('#c4a15c',-.15+i*.16,.21,.38,.10,.075,.11,0,'sphere');
  sign={x:.10,y:.58,z:.178,width:.69,height:.14};
 }else if(type==='grocery'){
  block(-.11,-.20,.75,.59,.74,'#93a87c');part('#59865f',-.11,.59,.22,.83,.045,.27);
  window(-.26,.102,.32,.28,.33);part('#365e59',.14,.23,.11,.19,.46,.02);
  for(const z of [.19,.42])for(const x of [-.34,-.15]){
   part('#a38d68',x,.08,z,.15,.16,.15);part('#5e7354',x,.165,z,.13,.016,.13);
   for(const dx of [-.035,.035])part(z>.3?'#d6b365':'#588e65',x+dx,.19,z,.055,.048,.09,0,'sphere');
  }
  part('#6b999b',.40,.28,-.03,.15,.55,.27);window(.40,.114,.31,.11,.41);
  sign={x:-.11,y:.59,z:.363,width:.66,height:.15};
 }else if(type==='milk-tea'){
  block(-.03,-.10,.86,.76,.65,'#9ba4b9');part(accent,-.03,.68,-.10,.90,.07,.80);
  window(-.03,.286,.37,.70,.25);part('#6b7692',-.03,.18,.38,.78,.12,.15);
  for(const x of [-.30,-.02,.27])part('#c8b9a2',x,.29,.40,.065,.12,.065,0,'cylinder');
  plant(.43,-.39);sign={x:-.03,y:.51,z:.29,width:.76,height:.14};
 }else if(type==='craft'){
  block(-.22,-.17,.51,.66,.85,'#a296b1');block(.28,-.33,.38,.31,.51,'#b1a080');
  for(const x of [-.24,.15,.40]){table(x,.26);part('#bd8c72',x,.25,.26,.075,.11,.075,0,'sphere');}
  for(const x of [-.39,-.22,-.05])window(x,.168,.46,.10,.29);
  sign={x:-.22,y:.66,z:.18,width:.48,height:.14};
 }else return null;
 // Mirrored plots keep every entrance facing its path while varying the streetscape.
 if(type!=='home'&&v%2){for(const p of parts){p.x=-p.x;p.turn=-p.turn;}sign.x=-sign.x;}
 // Keep rural services low and respect the reserved parcel's horizontal clearance.
 const yScale=low?.75:Math.max(.85,Math.min(1.12,tall));
 for(const p of parts){p.y=(p.y-.006)*yScale+.006;p.h*=yScale;}
 const side=v%2?1:-1;
 const work={
  home:[-side*.25,.38,side*Math.PI/2,'sip','senior',.0925],
  school:[v<2?.12:0,.20,0,'read','office',null,.044],
  warehouse:[-.24,.58,0,'carry','courier'],
  police:[-.42,.40,0,'read','officer'],
  supermarket:[-.02,.40,0,'restock','shopkeeper'],
  kfc:[.42,.36,-1.8,'sip','office',.0925],
  coffee:[.42,.40,-Math.PI/2,'sip','beret',.0925],
  florist:[.05,.43,0,'arrange','shopkeeper'],
  tea:[.33,.34,-Math.PI/2,'sip','senior',.0925],
  soup:[-.43,.35,Math.PI,'stir','chef'],
  noodles:[-.43,.35,Math.PI,'stir','chef'],
  seafood:[0,.49,Math.PI,'arrange','overalls'],
  bakery:[-.34,.38,Math.PI,'prepare','chef'],
  grocery:[.09,.45,0,'restock','shopkeeper'],
  'milk-tea':[.10,.54,Math.PI,'pour','chef'],
  craft:[.15,.43,Math.PI,'shape','beret']
 }[type];
 const mirror=type!=='home'&&v%2?-1:1,scale=s*.09;
 const [x,z,yaw,activity,outfit,seat,floor=0]=work;
 const staff={position:[x*s*mirror,(seat===undefined||seat===null?floor*s*yScale:seat*s*yScale-.8*scale)+.006,z*s],yaw:yaw*mirror,scale,activity,outfit,seated:seat!==undefined&&seat!==null,
  ...(type==='warehouse'?{endX:.24*s*mirror,mirror}:{}),prop:type==='florist'?'flowers':type==='seafood'?'basket':activity==='read'?'book':activity==='stir'?'spoon':activity==='carry'||activity==='restock'?'box':activity==='sip'||activity==='pour'?'cup':type==='craft'?'vase':'bread'};
 return {parts,sign:{x:sign.x*s,y:sign.y*s*yScale+.006,z:sign.z*s,width:sign.width*s,height:sign.height*s*yScale},type,staff};
}
