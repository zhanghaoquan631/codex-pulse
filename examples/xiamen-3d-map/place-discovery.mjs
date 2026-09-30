export function mountPlaceDiscovery(places,extraPlaces=[]){
 const list=document.getElementById('places'),count=document.getElementById('place-count');
 const categories=['全部','海岸海岛','老城街巷','人文园林','酒店住宿','码头'];
 const memberships=[1,2,2,1,3,3,3,2,1,1,3,1];
 const filters=document.createElement('div');filters.className='discovery-tabs';filters.setAttribute('aria-label','景点分类');
 let category=0;
 const search=document.createElement('input');search.type='search';search.className='place-search';search.placeholder='搜索景点、酒店、码头';search.setAttribute('aria-label','搜索厦门景点');search.maxLength=100;
 const empty=document.createElement('p');empty.textContent='没有匹配的地点';empty.hidden=true;empty.className='place-empty';
 const entries=places.map((p,i)=>({...p,category:memberships[i],main:true}));
 for(const p of extraPlaces){
  if(entries.some(e=>e.name===p.name&&e.main))continue;
  const button=document.createElement('button');button.className='place sub-place';
  const text=document.createElement('span'),title=document.createElement('span'),meta=document.createElement('span');
  title.className='place-title';title.textContent=p.name;meta.className='place-en';meta.textContent=p.area||p.en||categories[p.category];text.append(title,meta);button.append(text);
  button.onclick=()=>{p.select();document.getElementById('explore').classList.remove('open');document.getElementById('open-explore').setAttribute('aria-expanded','false');};
  list.append(button);entries.push({...p,button});
 }
 function filter(){
  const terms=search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);let total=0;
  for(const p of entries){
   const text=[p.name,p.en,p.area,p.address,p.kind].filter(Boolean).join(' ').toLocaleLowerCase();
   const visible=(!category||p.category===category)&&(p.main||terms.length||category!==0)&&terms.every(t=>text.includes(t));
   p.button.hidden=!visible;if(visible)total++;
  }
  count.textContent=total+'处';empty.hidden=total>0;for(const [i,b] of [...filters.children].entries())b.setAttribute('aria-pressed',String(i===category));
 }
 categories.forEach((name,i)=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>{category=i;filter();};filters.append(b);});
 search.oninput=filter;search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();entries.find(p=>!p.button.hidden)?.button.click();}if(e.key==='Escape'){search.value='';filter();}};
 list.before(filters,search);list.after(empty);filter();
 return {getState:()=>({indexed:entries.length,visible:entries.filter(p=>!p.button.hidden).length,category:categories[category]})};
}
