import * as THREE from 'three';
import { createEnemy, animateCharacter } from './characters.mjs';
import { createDemonBoss, animateDemonBoss } from './boss-models.mjs';
import { DESKTOP_ANIMALS, DESKTOP_ANIMAL_COUNTS } from './animal-definitions.mjs';
import { ANIMAL_MOVES } from './animal-combat.mjs';
import { createDesktopAnimal, animateDesktopAnimal, disposeDesktopAnimal, loadDesktopAnimalManifest } from './animal-renderer.mjs';

// Descriptions describe the playable prototype, not imported art or historical creatures.
const entries = [
  { id: 'doodler', name: '涂鸦墨兵', fresh: true, behavior: '圆头圆肚，举起铅笔蓄力后射出墨点。', counter: '看到笔尖预警就侧移，再趁慢弹飞过时近身。' },
  { id: 'lantern', name: '灯笼精', fresh: true, behavior: '灯骨包着纸身，漂浮横移并蓄力投出灯火。', counter: '瞄准悬空灯身，侧移避开灯火，别只盯着地面。' },
  { id: 'crab', name: '寄甲蟹', fresh: true, behavior: '背着卷纹硬壳，伏低张钳后沿直线冲撞。', counter: '蓄力时横向躲开，等它冲过或撞墙后的停顿反击。' },
  { id: 'inkling', name: '墨灵', behavior: '小圆头配细手脚，会靠近旅人挥击。', counter: '等它进入短剑距离，出手后退开，避免被围住。' },
  { id: 'shade', name: '纸影', behavior: '高挑纸衣轻轻摆动，追击速度较快。', counter: '留好退路，优先处理贴近的纸影。' },
  { id: 'brute', name: '石甲妖', behavior: '厚肩大拳、步伐沉重，近身一击较痛。', counter: '利用移动较慢的空隙拉开距离，用长枪或远程武器周旋。' },
  { id: 'archer', name: '灯火弓手', behavior: '戴长面具、持弓，会在远处向旅人射击。', counter: '借墙壁挡住来箭，绕近后集中攻击。' },
  { id: 'boss', name: '墨潮守将 · 早期造型', behavior: '保留早期墨潮守将的角冠面具与巨大身躯，供旅人回看造型。', counter: '十二关的独特 Boss 及其攻击线索，请到行旅收藏册查看。' },
  { id: 'wraith', name: '纸面小恶灵', fresh: true, demonKind: 'arcade-wraith', height: 1.65, hoverHeight: .3, behavior: '无足纸衣悬在街巷中，细长袖爪横移摆动，蓄力后投出慢弹。', counter: '注意袖爪的蓄力预警，横向避开慢弹；雾中追击会更快。' },
  { id: 'imp', name: '墨角小恶魔', fresh: true, demonKind: 'bronze-oni', height: 1.55, behavior: '小型角鼎躯壳配三足与拳臂，靠近后定向蓄力，向旅人射出墨弹。', counter: '等它锁定方向后侧移，用墙角隔开射线，避免与其他小兵一同包围。' },
  ...DESKTOP_ANIMALS.map(animal => ({ ...animal, animalId: animal.id, fresh: true, behavior: animal.description })),
];

const installed = new WeakMap();
let serial = 0;
const PAGE_SIZE=24;
const familyNames={humanoid:'人形伙伴',capybara:'水豚',cat:'猫咪',dragon:'龙',rodent:'鼠类',rabbit:'兔子',object:'物件精灵',fish:'鱼类',monkey:'猴类',bat:'蝙蝠',plant:'植物',fox:'狐狸',dog:'犬类',unclassified:'待辨形象',wolf:'狼',bird:'鸟类',deer:'鹿',penguin:'企鹅',ghost:'幽灵',bear:'熊',heavy:'大型动物',snake:'蛇',frog:'蛙',insect:'昆虫',slime:'史莱姆',owl:'猫头鹰',feline:'其他猫科',panda:'熊猫',crab:'螃蟹',robot:'机器人',turtle:'龟',spider:'蜘蛛'};
const actionNames={idle:'待机',running:'奔跑','running-right':'向右跑','running-left':'向左跑',waving:'挥手',jumping:'跳跃',failed:'失落',waiting:'等待',review:'观察',sleep:'睡眠',happy:'开心',attack:'攻击',walk:'行走'};
const searchable=entries.map(entry=>({entry,text:[entry.id,entry.name,entry.behavior,entry.originalDescription,entry.family].join(' ').toLocaleLowerCase()}));



/** Installs a self-contained native dialog. Returns {open, close, dispose}.
 * Character and demon geometries/materials belong to shared main-game pools:
 * this module must never dispose them or invoke either global pool disposer. */
export function installBestiary(button) {
  if (!button?.addEventListener) throw new TypeError('installBestiary requires a button element');
  if (installed.has(button)) return installed.get(button);

  const style = document.createElement('link');style.rel='stylesheet';style.href=new URL('./bestiary.css',import.meta.url).href;document.head.append(style);
  const titleId = `bestiary-title-${++serial}`;
  const dialog = document.createElement('dialog');
  dialog.className = 'bestiary-dialog'; dialog.setAttribute('aria-labelledby', titleId);
  dialog.innerHTML = `
    <header class="bestiary-header"><div><p class="bestiary-kicker">旅人手记 · 全部桌宠与原生动作</p><h2 class="bestiary-title" id="${titleId}">墨灵与桌宠图鉴</h2><p class="bestiary-total">${DESKTOP_ANIMAL_COUNTS.catalog} 个桌宠条目 · ${DESKTOP_ANIMAL_COUNTS.unique} 种独立形象 · 另有 10 种原墨灵</p></div><button type="button" class="bestiary-close" aria-label="关闭墨灵图鉴">×</button></header>
    <div class="bestiary-filters">
      <label class="bestiary-search-label">寻找形象<input class="bestiary-search" type="search" placeholder="搜索名称、ID 或描述" autocomplete="off"></label>
      <label>条目<select class="bestiary-kind"><option value="all">全部条目</option><option value="animal">全部桌宠</option><option value="original">原墨灵与早期 Boss</option></select></label>
      <label>族群<select class="bestiary-family"><option value="">全部族群</option></select></label>
      <label>攻击机制<select class="bestiary-attack"><option value="">全部攻击</option></select></label>
      <button type="button" class="bestiary-clear">重置筛选</button>
    </div>
    <div class="bestiary-layout"><section class="bestiary-catalog"><p class="bestiary-results" role="status" aria-live="polite"></p><nav class="bestiary-list" aria-label="选择墨灵或桌宠"></nav><p class="bestiary-empty" hidden>没有符合条件的形象。试试短一点的名称，或重置筛选。</p><div class="bestiary-pages"><button class="bestiary-prev" type="button">上一页</button><span class="bestiary-page"></span><button class="bestiary-next" type="button">下一页</button></div></section><section class="bestiary-detail">
      <div class="bestiary-stage"><canvas class="bestiary-canvas" tabindex="0" aria-label="墨灵三维预览；左右拖动或按方向键旋转"></canvas><span class="bestiary-state">动作预览</span><p class="bestiary-error" role="status" hidden></p>
      <div class="bestiary-tools"><button type="button" class="bestiary-reset">重置角度</button><button type="button" class="bestiary-motion">暂停动作</button></div></div>
      <p class="bestiary-hint">拖动模型观察 · 方向键也可旋转 · 十二关 Boss 请到行旅收藏册查看</p>
      <div class="bestiary-actions" hidden><label>查看动作<select class="bestiary-action"><option value="">战斗动作演示</option></select></label><button type="button" class="bestiary-replay">重播动作</button><label class="bestiary-timeline-label">动作时间<input class="bestiary-timeline" type="range" min="0" max="6.6" step=".01" value="0" aria-label="动作时间轴"></label><output class="bestiary-time">0.00 秒</output><p class="bestiary-action-info" role="status"></p></div>
      <div class="bestiary-copy" aria-live="polite"><h3 class="bestiary-name"></h3><p class="bestiary-identity"></p><p class="bestiary-description"></p><p class="bestiary-counter"></p><p class="bestiary-source-note"></p></div>
    </section></div>`;
  document.body.append(dialog);
  const find = name => dialog.querySelector(`.bestiary-${name}`);
  const canvas = find('canvas'), list = find('list'), stateLabel = find('state');
  const closeButton = find('close'), motionButton = find('motion');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const ownedResources = [];
  let disposed = false, selected = entries[0], renderer = null, scene = null, camera = null, model = null;
  let raf = 0, lastFrame = 0, elapsed = 0, yaw = -.28, elevation = .12, fitDistance = 4, targetY = .9;
  let drag = null, motionPaused = reducedMotion.matches, resizeObserver = null;
  let pageIndex=0,filtered=entries,sourceActions=[],sourceAction='',loadGeneration=0;
  const familySelect=find('family'),attackSelect=find('attack'),actionSelect=find('action');
  for(const family of [...new Set(DESKTOP_ANIMALS.map(a=>a.family))].sort((a,b)=>(familyNames[a]||a).localeCompare(familyNames[b]||b,'zh'))){const option=document.createElement('option');option.value=family;option.textContent=familyNames[family]||family;familySelect.append(option);}
  for(const [id,move] of Object.entries(ANIMAL_MOVES)){const option=document.createElement('option');option.value=id;option.textContent=move.name;attackSelect.append(option);}

  function updateCopy() {
    find('name').textContent = selected.name;
    find('description').textContent = selected.behavior;
    find('identity').textContent=selected.animalId?`${familyNames[selected.family]||selected.family} · ${selected.hasHands?'可持武器':'自然近战'} · ${selected.id}`:selected.id;
    find('source-note').textContent=selected.animalId?selected.sourceStatic?'这份原素材只有静态画面，图鉴如实保留；游戏中的位移与攻击另由战斗规则驱动。':'原素材的帧、节奏与专属动作均保留，可在上方逐个播放。相同形象的别名合并抽签，整轮未抽完不会重复。':'';
    find('counter').replaceChildren();
    const label = document.createElement('b'); label.textContent = '对策 · ';
    find('counter').append(label, document.createTextNode(selected.counter));
    for (const item of list.children) item.setAttribute('aria-pressed', String(item.dataset.enemy === selected.id));
    canvas.setAttribute('aria-label', selected.animalId ? `${selected.name}原桌宠动画预览；拖动调整观察方向` : `${selected.name}三维预览；左右拖动或按方向键旋转`);
    find('hint').textContent = selected.animalId
      ? '拖动调整观察方向 · 选择原生动作查看原画动画 · 战斗预览用于展示姿态，招式效果请看下方介绍'
      : '拖动模型观察 · 方向键也可旋转 · 十二关 Boss 请到行旅收藏册查看';
  }

  function updateMotionButton() {
    motionButton.textContent = motionPaused ? '播放动作' : '暂停动作';
    motionButton.setAttribute('aria-pressed', String(!motionPaused));
  }

  function renderList(){
    const query=find('search').value.trim().toLocaleLowerCase(),kind=find('kind').value,family=familySelect.value,attack=attackSelect.value;
    filtered=searchable.filter(({entry,text})=>(!query||text.includes(query))&&(kind==='all'||(kind==='animal')===!!entry.animalId)&&(!family||entry.family===family)&&(!attack||entry.combatProfile?.primary===attack||entry.combatProfile?.secondary===attack)).map(row=>row.entry);
    const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));pageIndex=Math.min(pageIndex,pages-1);list.replaceChildren();
    for(const entry of filtered.slice(pageIndex*PAGE_SIZE,(pageIndex+1)*PAGE_SIZE)){
      const item=document.createElement('button');item.type='button';item.className='bestiary-entry';item.dataset.enemy=entry.id;item.setAttribute('aria-pressed',String(entry.id===selected.id));
      const words=document.createElement('span');words.textContent=entry.name;const small=document.createElement('small');small.textContent=entry.animalId?`${familyNames[entry.family]||entry.family} · ${ANIMAL_MOVES[entry.combatProfile.primary].name}`:entry.id==='boss'?'早期 Boss':'原墨灵';words.append(small);item.append(words);
      item.addEventListener('click',()=>{selected=entry;updateCopy();selectModel();});list.append(item);
    }
    find('results').textContent=`找到 ${filtered.length} 个条目 · 每页 ${PAGE_SIZE} 个`;
    find('page').textContent=`${pageIndex+1} / ${pages}`;find('prev').disabled=pageIndex===0;find('next').disabled=pageIndex>=pages-1;find('empty').hidden=filtered.length>0;list.scrollTop=0;
  }
  for(const name of ['search','kind','family','attack'])find(name).addEventListener(name==='search'?'input':'change',()=>{pageIndex=0;renderList();});
  find('clear').addEventListener('click',()=>{find('search').value='';find('kind').value='all';familySelect.value='';attackSelect.value='';pageIndex=0;renderList();});
  find('prev').addEventListener('click',()=>{pageIndex--;renderList();});find('next').addEventListener('click',()=>{pageIndex++;renderList();});
  renderList();

  function cameraPose() {
    if (!camera) return;
    const orbit = selected.animalId ? yaw : 0;
    camera.position.set(Math.sin(orbit) * Math.cos(elevation) * fitDistance, targetY + Math.sin(elevation) * fitDistance, Math.cos(orbit) * Math.cos(elevation) * fitDistance);
    camera.lookAt(0, targetY, 0); camera.updateMatrixWorld(true);
  }

  function resize() {
    if (!renderer || !camera || !dialog.open) return;
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false); camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (model) {
      // Fit at its rest pose, rather than zooming in and out as limbs animate.
      const size = model.userData.bestiarySize;
      const halfFov = THREE.MathUtils.degToRad(camera.fov * .5);
      fitDistance = Math.max(size.y, size.x / camera.aspect) * .63 / Math.tan(halfFov) + size.z * .55;
    }
    cameraPose(); draw();
  }

  function draw() {
    if (renderer && scene && camera && dialog.open && !document.hidden) renderer.render(scene, camera);
  }

  function currentSourceAction(){return sourceActions.find(action=>action.id===sourceAction);}
  function actionDuration(){const action=currentSourceAction();return action?Math.max(.1,action.durations?.length===action.sequence?.length?action.durations.reduce((sum,n)=>sum+n,0)/(action.durationUnit==='milliseconds'?1000:1):(action.sequence?.length||1)/Math.max(.1,action.fps||1)):6.6;}
  function updateActionInfo(){
    const action=currentSourceAction(),duration=actionDuration();find('timeline').max=String(duration);
    find('action-info').textContent=action?`${actionNames[action.label]||action.label||action.id} · ${action.sequence?.length||1} 帧 · ${action.durations?'原始逐帧时长':`${Number((action.fps||1).toFixed(2))} 帧/秒`} · ${action.loop===false?'播放一次，末帧停留':'循环播放'}${action.timingInference==='equal-frame-shares'?'。原资料仅提供完整 16.6 秒周期，各帧时长按均分估计。':''}`
      :selected.sourceStatic?'原素材为静态画面。战斗姿态演示会展示游戏动作，原图本身不含连续动画。':`战斗动作演示 · ${ANIMAL_MOVES[selected.combatProfile?.primary]?.name||'基础攻击'}${selected.combatProfile?.secondary?' / '+ANIMAL_MOVES[selected.combatProfile.secondary].name:''}。原生动作可在下拉框单独选择。`;
  }
  function loadActions(){
    const generation=++loadGeneration;sourceActions=[];sourceAction='';
    actionSelect.replaceChildren(new Option('战斗动作演示',''));actionSelect.disabled=true;find('actions').hidden=!selected.animalId;
    if(!selected.animalId)return;
    find('action-info').textContent='正在读取这只桌宠的原生动作…';
    loadDesktopAnimalManifest(selected.animalId).then(manifest=>{
      if(disposed||generation!==loadGeneration||!dialog.open)return;
      sourceActions=Array.isArray(manifest.sourceActions)?manifest.sourceActions.filter(action=>action.id&&Array.isArray(action.sequence)&&action.sequence.length):[];
      for(const action of sourceActions){const title=actionNames[action.label]||action.label||action.id;actionSelect.append(new Option(`${title} · ${action.id}`,action.id));}
      actionSelect.disabled=false;updateActionInfo();
      if(manifest.sourceStatic)find('source-note').textContent='这份原素材只有静态画面，图鉴如实保留；游戏中的位移与攻击另由战斗规则驱动。';
    }).catch(()=>{if(generation===loadGeneration&&!disposed)find('action-info').textContent='原生动作暂时读取失败。重新选择这只桌宠即可重试，仍可阅读招式介绍。';});
  }
  function resetActionClock(){elapsed=0;lastFrame=0;find('timeline').value='0';previewPose(0);draw();}
  actionSelect.addEventListener('change',()=>{sourceAction=actionSelect.value;updateActionInfo();resetActionClock();});
  find('replay').addEventListener('click',()=>{resetActionClock();motionPaused=false;updateMotionButton();resumeLoop();});
  find('timeline').addEventListener('input',()=>{motionPaused=true;updateMotionButton();cancelLoop();elapsed=Number(find('timeline').value)||0;previewPose(0);draw();});

  function previewPose(dt) {
    if (!model) return;
    const phase = elapsed % 6.6, special = selected.fresh;
    let options, label;
    if (phase < 2.4) { options = { moving: .65 }; label = ['lantern', 'wraith'].includes(selected.id) ? '漂浮' : '行走'; }
    else if (special && phase < 3.2) { options = { attackPhase: 'telegraph', telegraph: 3.2 - phase }; label = '蓄力预警'; }
    else if (phase < 3.75) {
      options = selected.id === 'crab' || selected.attackMode === 'charge' ? { attackPhase: 'charging', charging: true, moving: 1 }
        : { attacking: true, attackPhase: 'idle' };
      label = selected.id === 'crab' || selected.attackMode === 'charge' ? '冲撞 / 扑击姿态' : selected.attackMode === 'ranged' ? '射击与后坐' : '攻击';
    } else if ((selected.id === 'crab' || selected.animalId) && phase < 4.9) {
      options = { attackPhase: 'recovering', recovering: 4.9 - phase }; label = selected.attackMode === 'ranged' ? '射击后恢复' : '攻击后停顿';
    } else { options = {}; label = '待机'; }
    if (selected.animalId){
      if(sourceAction){options={sourceAction};const action=currentSourceAction();label=`原生 · ${actionNames[action?.label]||action?.label||sourceAction}`;}
      else{
        const move=selected.combatProfile.primary,active=phase>=3.2&&phase<3.75;
        options.animalAction={move,phase:phase<2.4?'moving':phase<3.2?'telegraph':active?move==='healer'?'healing':['guard-counter','bodyguard'].includes(move)?'guard':'active':phase<4.9?'recovering':'idle',serial:Math.floor(elapsed/6.6)};
        if(active){options.animalLift=move==='leap-slam'?Math.sin((phase-3.2)/.55*Math.PI)*.7:0;options.animalSpin=move==='spin-melee'?(phase-3.2)*12:0;options.animalGuard=['guard-counter','bodyguard'].includes(move);label=ANIMAL_MOVES[move].name;}
      }
      animateDesktopAnimal(model, { ...options, camera, dt, time: elapsed });
      if(sourceAction&&model.userData.desktopAnimal?.weapon)model.userData.desktopAnimal.weapon.visible=false;
      const action=currentSourceAction(),duration=actionDuration(),time=action?.loop===false?Math.min(elapsed,duration):elapsed%duration;
      find('timeline').value=String(time);find('time').textContent=`${time.toFixed(2)} / ${duration.toFixed(2)} 秒`;
    }
    else if (selected.demonKind) animateDemonBoss(model, { ...options, dt, time: elapsed, phase: 1 });
    else animateCharacter(model, { ...options, dt, time: elapsed });
    model.rotation.y = selected.animalId ? 0 : yaw;
    if (stateLabel.textContent !== label) stateLabel.textContent = label;
  }

  function cancelLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; lastFrame = 0; }
  function frame(timestamp) {
    raf = 0;
    if (!dialog.open || !renderer || motionPaused || document.hidden) return;
    const dt = lastFrame ? Math.min(.05, (timestamp - lastFrame) / 1000) : 0;
    lastFrame = timestamp; elapsed += dt; previewPose(dt); draw();
    raf = requestAnimationFrame(frame);
  }
  function resumeLoop() {
    if (dialog.open && renderer && !motionPaused && !document.hidden && !raf) raf = requestAnimationFrame(frame);
  }

  function selectModel() {
    loadActions();
    if (!scene || !renderer) return;
    // Remove only the preview instance. Its materials/geometries remain shared.
    if (model) { scene.remove(model); if (model.userData.animalId) disposeDesktopAnimal(model); }
    model = selected.animalId ? createDesktopAnimal(selected.animalId) : selected.demonKind ? createDemonBoss(selected.demonKind) : createEnemy(selected.id);
    if (selected.demonKind) model.scale.setScalar(selected.height / 3);
    model.position.y = selected.hoverHeight || (selected.id === 'lantern' ? .45 : 0);
    const bounds = new THREE.Box3().setFromObject(model);
    model.userData.bestiarySize = bounds.getSize(new THREE.Vector3());
    targetY = (bounds.min.y + bounds.max.y) * .5;
    if (selected.animalId) {
      model.userData.bestiarySize.set(selected.height * 1.35, selected.height * 1.12, .25);
      targetY = selected.height * .5;
      model.addEventListener('animalready', () => { previewPose(0); draw(); });
    }
    yaw = -.28; elevation = .12; elapsed = 0; lastFrame = 0;
    model.rotation.y = selected.animalId ? 0 : yaw; scene.add(model);
    if (selected.animalId) animateDesktopAnimal(model, { camera, time: 0, dt: 0 });
    else if (selected.demonKind) animateDemonBoss(model, { time: 0, dt: 0, phase: 1 });
    else animateCharacter(model, { time: 0, dt: 0 });
    stateLabel.textContent = motionPaused ? '静态预览' : '动作预览';
    resize(); resumeLoop();
  }

  function buildPreview() {
    find('error').hidden = true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
      renderer.setClearColor(0xf5f0dd); renderer.shadowMap.enabled = false;
      scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(35, 1, .03, 60);
      const floorGeometry = new THREE.PlaneGeometry(20, 20);
      const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f0dd, toneMapped: false });
      ownedResources.push(floorGeometry, floorMaterial);
      const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2;
      floor.position.y = -.012; scene.add(floor);
      const points = [];
      for (let i = -6; i <= 6; i++) points.push(-6, -.007, i * .7, 6, -.007, i * .7);
      const ruledGeometry = new THREE.BufferGeometry(); ruledGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const ruledMaterial = new THREE.LineBasicMaterial({ color: 0x7894b2, transparent: true, opacity: .22, toneMapped: false });
      ownedResources.push(ruledGeometry, ruledMaterial); scene.add(new THREE.LineSegments(ruledGeometry, ruledMaterial));
      selectModel();
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
    } catch (error) {
      teardown();
      find('error').textContent = '此设备暂时无法显示三维预览。仍可切换条目阅读外形与对策。';
      find('error').hidden = false;
      console.warn('Bestiary preview could not start:', error);
    }
  }

  function teardown() {
    cancelLoop(); drag = null;loadGeneration++;
    resizeObserver?.disconnect(); resizeObserver = null;
    if (model && scene) scene.remove(model);
    if (model?.userData.animalId) disposeDesktopAnimal(model);
    model = null;
    if (scene) scene.clear(); scene = null; camera = null;
    // Only these paper-stage resources are privately owned by this dialog.
    for (const resource of ownedResources.splice(0)) resource.dispose();
    renderer?.dispose(); renderer = null;
  }

  function open(event) {
    event?.stopPropagation();
    if (disposed || dialog.open) return;
    updateCopy(); updateMotionButton(); dialog.showModal(); closeButton.focus({ preventScroll: true });
    buildPreview();
  }
  function close() { if (dialog.open) dialog.close(); teardown(); }
  function afterClose() { teardown(); if (button.isConnected) button.focus({ preventScroll: true }); }

  const stop = event => event.stopPropagation();
  for (const type of ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'pointermove',
    'pointercancel', 'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'touchend'])
    dialog.addEventListener(type, stop);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', afterClose);
  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  } });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' && event.button !== 0) return;
    if (!model || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId); event.preventDefault(); canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id || !model) return;
    yaw += (event.clientX - drag.x) * .012;
    elevation = THREE.MathUtils.clamp(elevation + (event.clientY - drag.y) * .004, -.03, .6);
    drag.x = event.clientX; drag.y = event.clientY; model.rotation.y = selected.animalId ? 0 : yaw; cameraPose(); if (selected.animalId) previewPose(0); draw();
  });
  const finishDrag = event => { if (drag?.id === event.pointerId) drag = null; };
  canvas.addEventListener('pointerup', finishDrag); canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('lostpointercapture', finishDrag);
  canvas.addEventListener('keydown', event => {
    if (!model || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
    event.preventDefault();
    if (event.code === 'ArrowLeft') yaw -= .18;
    if (event.code === 'ArrowRight') yaw += .18;
    if (event.code === 'ArrowUp') elevation = Math.min(.6, elevation + .06);
    if (event.code === 'ArrowDown') elevation = Math.max(-.03, elevation - .06);
    model.rotation.y = selected.animalId ? 0 : yaw; cameraPose(); if (selected.animalId) previewPose(0); draw();
  });
  find('reset').addEventListener('click', () => { yaw = -.28; elevation = .12; if (model) model.rotation.y = selected.animalId ? 0 : yaw; cameraPose(); if (selected.animalId) previewPose(0); draw(); });
  motionButton.addEventListener('click', () => {
    motionPaused = !motionPaused; updateMotionButton();
    if (motionPaused) { cancelLoop(); stateLabel.textContent = '动作已暂停'; draw(); }
    else resumeLoop();
  });
  const onMotionPreference = () => {
    if (reducedMotion.matches) { motionPaused = true; updateMotionButton(); cancelLoop(); stateLabel.textContent = '静态预览'; draw(); }
  };
  reducedMotion.addEventListener('change', onMotionPreference);
  const onVisibility = () => { if (document.hidden) cancelLoop(); else { draw(); resumeLoop(); } };
  document.addEventListener('visibilitychange', onVisibility);
  button.addEventListener('click', open); button.setAttribute('aria-haspopup', 'dialog');

  const api = { open, close, dispose() {
    if (disposed) return; disposed = true; close();
    button.removeEventListener('click', open); button.removeAttribute('aria-haspopup');
    reducedMotion.removeEventListener('change', onMotionPreference);
    document.removeEventListener('visibilitychange', onVisibility);
    dialog.removeEventListener('close', afterClose); dialog.remove(); style.remove(); installed.delete(button);
  } };
  installed.set(button, api); return api;
}
