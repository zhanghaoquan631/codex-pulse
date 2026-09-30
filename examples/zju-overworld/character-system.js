import {FILM_CAST} from './film-cast-models.js?v=11';
import {openFilmGallery} from './film-gallery.js?v=11';
import * as THREE from './vendor/three.module.js';
import {applyOutfit,OUTFITS,WARDROBE_COLORS} from './wardrobe.js?v=11';
import {applyRole,ROLE_OPTIONS} from './character-props.js?v=11';
import {resetTeachingPose} from './teaching-pose.js?v=11';
import {resetSwimPose} from './swimming-pose.js?v=11';
const $=id=>document.getElementById(id);
export const characterMethods={
  syncWardrobeUI(){
    if(!this.player)return;const variant=this.player.variant||this.variant;this.variant=variant;
    const cast=FILM_CAST.find(c=>c.id===variant);const female=cast?cast.gender==='female':variant.startsWith('female-');this.appearanceGender=female?'female':'male';
    const aliases={'qiushi-purple':'purple','lakeside-green':'green','academy-blue':'blue','sunlight-orange':'orange','female-lilac':'purple','female-green':'green','female-blue':'blue','female-orange':'orange'};
    const labels=female?{purple:'丁香女生',green:'湖畔女生',blue:'晴空女生',orange:'暖阳女生'}:{purple:'求是男生',green:'湖畔男生',blue:'书院男生',orange:'日光男生'};
    if($('film-character-select'))$('film-character-select').value=cast?.id||'';
    $('character-name').textContent=cast?.name||this.avatarSpec?.variants[variant]?.label||labels[aliases[variant]]||'校园同学';
    document.querySelectorAll('[data-avatar]').forEach(b=>{b.classList.toggle('active',b.dataset.avatar===aliases[variant]);b.textContent=labels[b.dataset.avatar];});
    document.querySelectorAll('[data-gender]').forEach(b=>{b.classList.toggle('active',b.dataset.gender===this.appearanceGender);b.setAttribute('aria-pressed',String(b.dataset.gender===this.appearanceGender));});
    $('role-select').value=this.player.roleKey||'student';$('current-role').textContent=ROLE_OPTIONS.find(r=>r.id===this.player.roleKey)?.label||'在校学生';
    $('outfit-select').value=this.player.outfitKey||'casual';$('clothes-color').value=this.player.colorKey||'original';
  },
  chooseAppearance(color){const key=this.appearanceGender==='female'?{purple:'female-lilac',green:'female-green',blue:'female-blue',orange:'female-orange'}[color]:color;this.createPlayer(key);this.syncWardrobeUI();},
  setGender(gender){this.appearanceGender=gender==='female'?'female':'male';this.chooseAppearance('purple');},
  changeOutfit(outfit,color){applyOutfit(THREE,this.player,outfit||this.player.outfitKey||'casual',color||this.player.colorKey||'original');this.syncWardrobeUI();},
  setRole(role){if(!ROLE_OPTIONS.some(r=>r.id===role))return false;applyRole(THREE,this.player,role);if(role==='teacher')applyOutfit(THREE,this.player,'formal',this.player.colorKey);if(['runner','basketball'].includes(role))applyOutfit(THREE,this.player,'sport',this.player.colorKey);this.syncWardrobeUI();return true;},
  bindWardrobe(){
    for(const cast of FILM_CAST){const o=document.createElement('option');o.value=cast.id;o.textContent=cast.name;$('film-character-select').append(o);}
    $('film-character-select').onchange=()=>{const id=$('film-character-select').value;if(id){this.createPlayer(id);this.env.toast('已换上电影人物形象，可以继续走动、上课和换装。');}else this.chooseAppearance('purple');};
    $('film-gallery-open').onclick=()=>openFilmGallery(this);
    for(const r of ROLE_OPTIONS){const o=document.createElement('option');o.value=r.id;o.textContent=r.label;$('role-select').append(o);}$('role-select').onchange=()=>this.setRole($('role-select').value);
    for(const outfit of OUTFITS){const o=document.createElement('option');o.value=outfit.id||outfit.key;o.textContent=outfit.label||outfit.name;$('outfit-select').append(o);}
    const defaults=WARDROBE_COLORS;
    for(const item of defaults){const o=document.createElement('option');o.value=item.id||item.key;o.textContent=item.label||item.name;$('clothes-color').append(o);}
    $('outfit-select').onchange=()=>this.changeOutfit($('outfit-select').value);
    $('clothes-color').onchange=()=>this.changeOutfit(null,$('clothes-color').value);
    document.querySelectorAll('[data-gender]').forEach(b=>b.onclick=()=>this.setGender(b.dataset.gender));
    document.querySelectorAll('[data-avatar]').forEach(b=>b.onclick=()=>this.chooseAppearance(b.dataset.avatar));
    $('swap-button').onclick=()=>this.swapAppearance();this.syncWardrobeUI();
  },
  updateCharacterInteraction(){
    this.nearestPerson=null;if(!this.seated&&this.mode!=='aerial'){
      const candidates=this.room?[...this.room.students,...this.room.teachers,...(this.room.walkers||[])].filter(n=>n.floor===this.currentFloor):[...this.npcs,...(this.activityActors||[])];
      for(const n of candidates){if(n.nightInside)continue;const pos=this.root(n.rig).position,d=this.position.distanceTo(pos);if(d<3.3&&(!this.nearestPerson||d<this.nearestPerson.distance))this.nearestPerson={npc:n,distance:d};}
    }
    $('swap-button').hidden=!this.nearestPerson;$('swap-button').disabled=!this.nearestPerson;
    if(this.nearestPerson){const n=this.nearestPerson.npc;const role=ROLE_OPTIONS.find(r=>r.id===n.rig.roleKey)?.label||'同学';$('swap-button').textContent=`与${FILM_CAST.find(c=>c.id===n.rig.variant)?.name||n.name||role}交换外形 · G`;}
  },
  swapAppearance(){
    this.updateCharacterInteraction();if(!this.nearestPerson){this.env.toast('走到一位路人身边，就能交换彼此的外形。');return false;}
    const n=this.nearestPerson.npc,myRig=this.player,theirRig=n.rig,theirHeading=this.root(theirRig).rotation.y,theirPos=this.root(theirRig).position.clone(),theirParent=this.root(theirRig).parent;
    if(n.kind==='crossing'&&!n.waiting){this.env.toast('等对方过完斑马线，再交换外形。');return false;}
    for(const rig of [myRig,theirRig]){rig.readingMotion?.update(0,{active:false});resetTeachingPose(rig);}
    resetSwimPose(myRig);resetSwimPose(theirRig);this.wasSwimming=false;
    this.root(myRig).removeFromParent();this.root(theirRig).removeFromParent();n.rig=myRig;this.player=theirRig;this.root(myRig).visible=true;this.root(theirRig).visible=this.mode!=='walk';
    theirParent.add(this.root(myRig));this.root(myRig).position.copy(theirPos);this.root(myRig).rotation.y=theirHeading;
    this.activeScene.add(this.root(theirRig));this.root(theirRig).position.copy(this.position);this.root(theirRig).rotation.y=this.heading;
    this.syncWardrobeUI();this.swapCount=(this.swapCount||0)+1;this.env.toast('外形已互换：你换成了路人的样子，对方换成你的样子。');return true;
  }
};
