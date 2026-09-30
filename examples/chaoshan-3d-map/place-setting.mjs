// Editorial landscape compositions, not surveyed footprints or downloaded map tiles.
const hash=text=>{let n=2166136261;for(const c of text){n^=c.codePointAt(0);n=Math.imul(n,16777619);}return n>>>0;};
const overrides={
 'nanao-nature-gate':'dune','nanao-qihang':'headland',
 'small-park':'arcade','guangji':'river','jieyang-jinxian':'arcade',
 'raoping-haishan':'fishing','raoping-xiao':'dune','raoping-xunzhou':'fishing',
 'raoping-zhelin-bay':'harbour','raoping-tangxi':'lake','raoping-daoyun':'courtyard',
 'huilai-lighthouse':'headland','huilai-keniaowei':'headland',
 'shantou-port':'harbour','shantou-post':'arcade','shantou-hotel':'arcade'
};
export function placeSetting(p){
 const key=p.id||p.name,seed=hash(key),text=[p.model,p.contextModel,p.name,p.en].join(' ').toLowerCase();
 let family=overrides[key];
 if(!family){
  family=/airport|railway|station|机场|高铁|交通/.test(text)?'transport':
   /tea|茶|乌岽/.test(text)?'tea':/harbour|\bport\b|old-port|aquaculture|渔港|码头|港区/.test(text)?'harbour':
   /lighthouse|battery|cliff|lotus|灯塔|炮台|石笋|莲花峰/.test(text)?'headland':
   /beach|dune|cove|island|海岛|海湾|海滨/.test(text)?'dune':
   /river|canal|water-town|水乡|韩江|榕江|练江/.test(text)?'river':
   /lake|reservoir|wetland|湖|水库|温泉/.test(text)?'lake':
   /forest|mountain|waterfall|valley|山|瀑布|峡谷/.test(text)?'forest':
   /courtyard|temple|academy|tulou|祠|寺|学宫|古寨|故居/.test(text)?'courtyard':
   /old|hotel|post|古城|古镇|古街|骑楼/.test(text)?'arcade':
   /airport|rail|station|机场|高铁|交通/.test(text)?'transport':
   /village|farm|田园|乡村|村/.test(text)?'farmland':'urban';
 }
 const settings={
  tea:{ground:['#7d986c','#9aa773','#668a5c'],trees:['broadleaf','bamboo'],building:'farm',density:.24},
  forest:{ground:['#719076','#87a18c','#617d68'],trees:['pine','broadleaf','bamboo'],building:'lodge',density:.82},
  lake:{ground:['#a3b599','#86a596','#b4be9c'],trees:['umbrella','bamboo'],building:'lodge',density:.48},
  river:{ground:['#94b3a6','#b7c4b1','#86a696'],trees:['broadleaf','umbrella'],building:'arcade',density:.44},
  headland:{ground:['#a1a89a','#bbc1b1','#879788'],trees:['pine','broadleaf'],building:'stone',density:.25},
  dune:{ground:['#c8ceb3','#aebd97','#9fad87'],trees:['pine','palm'],building:'lodge',density:.32},
  fishing:{ground:['#b6c7b5','#c3cfbd','#95b3a5'],trees:['palm','broadleaf'],building:'fishing',density:.30},
  harbour:{ground:['#a9b9ba','#bac6c2','#9babaa'],trees:['palm'],building:'warehouse',density:.18},
  courtyard:{ground:['#b4bca5','#99ad93','#c1c6b4'],trees:['broadleaf','umbrella'],building:'courtyard',density:.38},
  arcade:{ground:['#bec9be','#a9b8ae','#cbd0c3'],trees:['umbrella','broadleaf'],building:'arcade',density:.28},
  transport:{ground:['#b7c6c7','#a6b8b3','#c5cebf'],trees:['palm','umbrella'],building:'commercial',density:.20},
  farmland:{ground:['#9eaf72','#b1bd84','#809a68'],trees:['broadleaf','bamboo'],building:'farm',density:.28},
  urban:{ground:['#a7bcad','#b5c5b9','#92aa9c'],trees:['umbrella','flowering'],building:'commercial',density:.35}
 };
 return {key,seed,family,visitorHub:['gate','square','lighthouse','well'].includes(p.model),...settings[family],angle:((seed%101)-50)*Math.PI/180,phase:(seed%997)/997*Math.PI*2,
  spacing:.83+(seed%29)/100,aspect:.8+((seed>>>8)%51)/100,bend:((seed>>>16)%19-9)/100};
}

export function settingCell(profile,dx,dz,size){
 const c=Math.cos(profile.angle),s=Math.sin(profile.angle),u=dx*c+dz*s,v=-dx*s+dz*c;
 const bend=Math.sin(u*2.2+profile.phase)*.16;
 const band=Math.floor((v+bend)/Math.max(.055,size*1.8));
 const value=hash(`${profile.key}:${Math.round(dx*1000)}:${Math.round(dz*1000)}`);
 const path=Math.abs(v-bend-profile.bend)<size*.45;
 const terraces=['tea','farmland'].includes(profile.family);
 const field=Math.floor(Math.sin(u*1.7+profile.phase)*1.4+Math.cos(v*1.3-profile.phase));
 return {color:profile.ground[((terraces?band:field)%3+3)%3],path,
  plant:!path&&(value%1000)/1000<profile.density,
  tree:profile.trees[(value>>>5)%profile.trees.length],
  treatment:terraces?'crop':profile.family==='headland'?'rock':profile.family==='harbour'?'yard':'green',value};
}

// A continuous world-space colour field gives adjacent paving triangles identical edge colours.
export function landscapeColor(x,z){
 const t=(Math.sin(x*.73+Math.sin(z*.41))*.5+Math.cos(z*.61-x*.18)*.5+1)/2;
 const a=[.24,.39,.28],b=[.42,.55,.36];
 return a.map((v,i)=>v+(b[i]-v)*t);
}
