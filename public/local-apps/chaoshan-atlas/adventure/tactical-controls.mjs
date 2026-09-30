const names={stand:'站立',crouch:'蹲走',prone:'匍匐'};
export function installTacticalControls({getState,allowed,onOpen,onClose,onStance,onLean,onGuard}){
 const node=document.createElement('button');node.id='tactics-open';node.className='quiet tactical-controls';node.textContent='站立 · 战术';document.querySelector('.field-kit-controls').append(node);
 const dialog=document.createElement('dialog');dialog.id='tactical-stance-dialog';dialog.className='tactical-actions';dialog.innerHTML='<header><b>战术姿态 · 游戏已暂停</b><button data-close aria-label="返回游戏">×</button></header><div><button data-stance="stand">站立</button><button data-stance="crouch">蹲走 Z</button><button data-stance="prone">匍匐 Y</button></div><div><button data-lean="-1">左探头 [</button><button data-lean="0">回正</button><button data-lean="1">右探头 ]</button></div><button data-guard>举锅格挡 · 右键</button><small>选定动作后继续游戏。探头快捷键按住使用，按钮点按切换。烟雾弹按 O，背包 G 可查看装备。</small><output></output>';document.body.append(dialog);
 function close(){if(!dialog.open)return;dialog.close();onClose();}
 node.addEventListener('click',()=>{if(!allowed())return;onOpen();dialog.showModal();});
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const p=getState().player;
  if(b.hasAttribute('data-close')){close();return;}
  if(b.dataset.stance){close();onStance(b.dataset.stance);}
  if(b.dataset.lean!==undefined){const n=Number(b.dataset.lean),next=Math.sign(p.lean||0)===n?0:n;close();onLean(next);}
  if(b.hasAttribute('data-guard')){const next=!p.guarding;close();onGuard(next);}
 });
 return {update(){const p=getState().player;node.textContent=`${names[p.stance]||'站立'} · 战术`;
  for(const b of dialog.querySelectorAll('[data-stance]'))b.setAttribute('aria-pressed',String((p.stance||'stand')===b.dataset.stance));
  for(const b of dialog.querySelectorAll('[data-lean]'))b.setAttribute('aria-pressed',String(Math.sign(p.lean||0)===Number(b.dataset.lean)));
  const g=dialog.querySelector('[data-guard]');g.disabled=p.weaponId!=='pan';g.setAttribute('aria-pressed',String(!!p.guarding));
  dialog.querySelector('output').textContent=p.weaponId==='pan'?`锅耐久 ${Math.ceil(p.guardDurability??80)} / 80 · 正面减伤，背后无保护`:'蹲走与匍匐不能奔跑；头顶有障碍时不能起身。';
 },get isOpen(){return dialog.open;},close,reset(){close();},dispose(){close();node.remove();dialog.remove();}};
}
