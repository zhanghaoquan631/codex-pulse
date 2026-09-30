const routes=[
 {title:'海岛与老城',stops:[0,1,2],note:'鼓浪屿涉及渡轮；先确认船票、码头和上岛安排，再决定是否与老城同日游览。'},
 {title:'岛南慢游',stops:[5,3,7],note:'从寺院周边走向海边街区。厦门大学入校规则可能变化，若要加入请另行确认。'},
 {title:'滨海散步',stops:[7,9,8],note:'沿海岸选择自己想走的一段；环岛路点位是路线代表点，不表示整条路。'},
 {title:'厦大与园林',stops:[4,5,6],note:'校园、寺院和植物园的进入方式各不相同。先核对厦门大学参观规定及植物园预约，再按体力安排步行。'},
 {title:'集美与海沧',stops:[10,11],note:'这是跨片区行程，两个地点之间需查询实际公共交通或驾车路线，不建议当作连续步行线。'}
];

export function mountItineraries({places,focusPlace}){
 const trigger=document.createElement('button');trigger.className='route-open';trigger.textContent='推荐行程 · 打开五条路线';document.querySelector('#explore .select-wrap').before(trigger);
 const dialog=document.createElement('dialog');dialog.className='detail-dialog itinerary-dialog';
 dialog.innerHTML='<div class="dialog-top"><span class="eyebrow">EXPLORE XIAMEN</span><button aria-label="关闭推荐行程">×</button></div><h2>按片区慢慢逛</h2><p class="about-note">这是基于地图导航点的行程草案，不含实时交通、营业时间或预约信息。</p><div class="route-tabs" aria-label="选择行程"></div><ol class="route-stops"></ol><p class="route-note"></p><a class="route-google" target="_blank" rel="noopener noreferrer">在谷歌地图打开路线 ↗</a><p class="about-note">谷歌地图会自行计算路线；渡轮和步行条件请以实际查询结果为准。</p>';
 document.body.append(dialog);
 const tabs=dialog.querySelector('.route-tabs'),stops=dialog.querySelector('.route-stops'),note=dialog.querySelector('.route-note'),link=dialog.querySelector('.route-google');
 function render(index){
  const route=routes[index];tabs.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  stops.replaceChildren();route.stops.forEach((placeIndex,order)=>{
   const li=document.createElement('li'),b=document.createElement('button');b.textContent=places[placeIndex].name;b.onclick=()=>{dialog.close();focusPlace(placeIndex);};li.append(b);stops.append(li);
  });
  note.textContent=route.note;
  const coordinates=route.stops.map(i=>`${places[i].ll[1]},${places[i].ll[0]}`);
  const url=new URL('https://www.google.com/maps/dir/');url.search=new URLSearchParams({api:'1',origin:coordinates[0],destination:coordinates.at(-1),waypoints:coordinates.slice(1,-1).join('|')}).toString();link.href=url.href;
 }
 routes.forEach((r,i)=>{const b=document.createElement('button');b.textContent=r.title;b.onclick=()=>render(i);tabs.append(b);});
 trigger.onclick=()=>{render(0);dialog.showModal();};dialog.querySelector('[aria-label="关闭推荐行程"]').onclick=()=>dialog.close();
}
