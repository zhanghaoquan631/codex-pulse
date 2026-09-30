// Layers wrap their objects instead of fighting visibility changes used by scene culling.
import {Group} from 'three';
export function mountMapLayers(scene){
 const catalog={people:'游人',traffic:'车流',boats:'船舶',forest:'背景山林'},nodes={};
 scene.traverse(o=>{const key=o.userData.atlasLayer;if(catalog[key]){nodes[key]??=[];nodes[key].push(o);}});
 const gates={};
 for(const [key,objects] of Object.entries(nodes))gates[key]=objects.map(o=>{const parent=o.parent,g=new Group();g.name='layer-'+key;parent.add(g);g.add(o);return g;});
 const details=document.createElement('details');details.className='map-layers';
 const title=document.createElement('summary');title.textContent='地图图层';details.append(title);
 const options=document.createElement('div');options.className='map-layer-options';details.append(options);
 for(const [key,label] of Object.entries(catalog)){
  const row=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.setAttribute('aria-label',label);
  input.onchange=()=>{for(const gate of gates[key]||[])gate.visible=input.checked;};row.append(input,document.createTextNode(label));options.append(row);
 }
 document.querySelector('.explore-foot').before(details);
 return {getState:()=>Object.fromEntries(Object.entries(gates).map(([key,list])=>[key,{total:list.length,visible:list.filter(g=>g.visible).length}]))};
}
