import * as THREE from 'three';

export const services=[
 ['grocery','街坊小卖部','#477f65'],['soup','粿条汤铺','#ac654d'],['supermarket','生活超市','#397684'],
 ['florist','花间花店','#a76486'],['coffee','街角咖啡','#596682'],['kfc','KFC','#af3e44'],
 ['school','社区学校','#527e96'],['police','警务服务站','#3c6489'],['warehouse','渔港仓库','#668176'],
 ['bakery','巷口饼铺','#ad8950'],['tea','单丛茶铺','#49744b'],['seafood','海鲜小馆','#387c88'],
 ['home','居民小院','#6b7b70'],['craft','手作小店','#8669a1'],['milk-tea','鲜茶饮品','#9a6588'],
 ['noodles','牛肉粿条','#a06843']
];
const menus={forest:[10,12,13,0],tea:[10,13,12,0,9],dune:[0,12,4,11,3,12,14,1],headland:[0,12,11,4,8,12],harbour:[8,11,0,2,7],fishing:[8,11,12,0,6],river:[1,10,3,12,4],courtyard:[10,13,9,12,1],arcade:[1,4,3,9,14,15],lake:[4,3,10,12,0],farmland:[6,0,12,10,8],transport:[4,5,2,7,0,14],urban:[0,1,2,3,4,5,6,7,9,12,14,15]};
export function serviceFor(profile,index){const menu=menus[profile?.family]||menus.urban;return services[menu[((profile?.seed||0)+index)%menu.length]];}
let atlas;
function atlasMaterial(){
 if(atlas)return atlas;
 if(typeof document==='undefined')return new THREE.MeshBasicMaterial({color:'#397684'});
 const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');
 services.forEach(([id,name,color],i)=>{const x=(i%4)*256,y=Math.floor(i/4)*64;ctx.fillStyle=color;ctx.fillRect(x,y,256,64);ctx.fillStyle='#f3f5ec';ctx.font='bold 27px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,x+128,y+32,244);});
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;atlas=new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide});return atlas;
}
export function addServiceSigns(parent,rows){
 if(!rows.length)return;
 const positions=[],uvs=[];
 for(const r of rows){const i=services.findIndex(v=>v[0]===r.service[0]),x=i%4/4,y=1-Math.floor(i/4)/4,co=Math.cos(r.angle),si=Math.sin(r.angle);
  for(const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){const xx=(u-.5)*r.width;positions.push(r.x+xx*co,r.y+v*r.height,r.z-xx*si);uvs.push(x+.006+u*.238,y-.245+v*.24);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,atlasMaterial());mesh.name='neighborhood-shop-signs';mesh.userData.sign=true;parent.add(mesh);return mesh;
}

export function serviceDetails(service,part,s){
 const [type,,color]=service;
 // All furniture stays inside the already reserved building footprint.
 part(color,0,.022,s*.559,s*.87,.022,.003);
 if(type==='florist'){
  for(let i=-2;i<=2;i++){part('#486949',i*s*.16,.029,s*.57,s*.08,.016,.009);part(['#d999b3','#e4bf62','#9b88c2'][(i+3)%3],i*s*.16,.04,s*.57,s*.13,.009,.01);}
 }else if(type==='coffee'||type==='tea'){
  part('#3e675e',0,.009,s*.559,s*.47,.020,.003);part('#c1a570',-s*.32,.035,s*.561,s*.14,.02,.004);
 }else if(type==='warehouse'){
  for(let i=0;i<6;i++)part('#405b64',0,.012+i*.006,s*.562,s*.75,.0015,.002);
 }else if(type==='school'){
  part('#657d87',s*.42,.02,s*.51,.002,.07,.002);part('#b34148',s*.34,.078,s*.51,s*.16,.011,.002);
 }else if(type==='police'){
  part('#527fa3',-s*.15,.046,s*.562,s*.14,.006,.003);part('#c46b61',s*.15,.046,s*.562,s*.14,.006,.003);
 }else if(type==='soup'||type==='noodles'||type==='seafood'){
  for(let i=-1;i<=1;i++){part('#917044',i*s*.24,.012,s*.564,s*.17,.018,.007);part('#a4c0bc',i*s*.24,.031,s*.564,s*.15,.007,.006);}
 }else if(type==='supermarket'||type==='grocery'){
  for(let j=0;j<2;j++)for(let i=-2;i<=2;i++)part(j?'#bbae5d':'#568a68',i*s*.15,.015+j*.009,s*.564,s*.11,.007,.006);
 }
}
