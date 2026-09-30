const storageKey='xiamen-atlas-explored-v1';

export function mountPassport({places,focusPlace}){
 const button=document.createElement('button');button.id='passport-open';button.textContent='云游足迹';document.querySelector('.scene-settings').append(button);
 const dialog=document.createElement('dialog');dialog.className='detail-dialog passport-dialog';
 dialog.innerHTML='<div class="dialog-top"><span class="eyebrow">XIAMEN EXPLORER</span><button aria-label="关闭云游足迹">×</button></div><h2>云游足迹</h2><p class="passport-count" role="status"></p><p class="about-note">手动在地图中选择景点即可点亮一站。这里只记录地图探索，不表示你实际到访。</p><div class="passport-grid" aria-label="景点探索进度"></div><p class="passport-badge" hidden>已点亮全部十二站，厦门地图探索完成！</p>';
 document.body.append(dialog);dialog.querySelector('[aria-label="关闭云游足迹"]').onclick=()=>dialog.close();
 let saved=[];
 try{const value=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(value))saved=value.filter(i=>Number.isInteger(i)&&i>=0&&i<places.length);}catch{}
 const visited=new Set(saved),grid=dialog.querySelector('.passport-grid');
 places.forEach((p,i)=>{const b=document.createElement('button');b.textContent=p.name;b.onclick=()=>{dialog.close();focusPlace(i);};grid.append(b);});
 function render(){dialog.querySelector('.passport-count').textContent=`已点亮 ${visited.size} / ${places.length} 站`;dialog.querySelector('.passport-badge').hidden=visited.size!==places.length;for(const [i,b]of [...grid.children].entries())b.setAttribute('aria-pressed',String(visited.has(i)));}
 function recordPlace(index){if(!Number.isInteger(index)||index<0||index>=places.length||visited.has(index))return;visited.add(index);try{localStorage.setItem(storageKey,JSON.stringify([...visited]));}catch{}render();}
 button.onclick=()=>{render();dialog.showModal();};render();
 return{recordPlace,getState:()=>({explored:visited.size,total:places.length})};
}
