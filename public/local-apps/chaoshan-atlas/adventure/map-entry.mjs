/**
 * Optional map adapter; it never imports the RPG engine or modifies its save.
 *
 * const entry = mountAdventureEntry({places, card, baseUrl:'http://127.0.0.1:PORT/'});
 * entry.setPlace(places[index]); // call from the map's existing select(index)
 * entry.open(); entry.close(); entry.destroy();
 *
 * main.mjs protocol: parent sends :enter {placeId}; child sends :complete
 * {placeId,levelId} or :exit {placeId}. All origins and window sources are exact.
 */

export const ADVENTURE_ENTRIES = Object.freeze([
  Object.freeze({ placeId: 'small-park', levelId: 'small-park', order: 1, title: '骑楼寻迹', name: '汕头小公园', description: '街巷来袭 · 18 击杀 · 找路标解字谜，拼钥开启北巷任务房。' }),
  Object.freeze({ placeId: 'guangji', levelId: 'guangji', order: 2, title: '韩江连桥', name: '潮州广济桥', description: '横江推进 · 24 击杀 · 沿桥寻找字母线索，前往东岸护桥房。' }),
  Object.freeze({ placeId: 'jieyang-tower', levelId: 'jieyang-tower', order: 3, title: '城台守夜', name: '揭阳楼', description: '广场突围 · 30 击杀 · 收集两半密码，在楼前任务棚迎战墨将。' }),
  Object.freeze({ placeId: 'lighthouse', levelId: 'lighthouse', order: 4, title: '灯塔归航', name: '南澳长山尾', description: '海岸竞速 · 36 击杀 · 沿海岸解谜，赶往远端守灯任务棚。' }),
  ...[
    ['puning-deanli','古厝探迹','普宁德安里',42],['chaoyang-wenguang','塔影巡街','潮阳文光塔',48],
    ['chaonan-cuihu','湖岸寻字','潮南仙湖 · 翠湖旅游区',54],['chenghai-chen','侨厝密信','澄海陈慈黉故居',60],
    ['chaoan-tianchi','登山观湖','潮安凤凰天池',66],['raoping-daoyun','八角围楼','饶平道韵楼',72],
    ['huilai-jinghai','城墙迷踪','惠来靖海古城',78],['jiexi-falls','沿谷追瀑','揭西黄满寨瀑布群',84]
  ].map(([id,title,name,kills],i)=>Object.freeze({placeId:id,levelId:id,order:i+5,title,name,description:`主动增援 · ${kills} 击杀 · 调查地图问号、拼合两半密码，进入远端任务房击败首领。`})),
]);

const entries = new Map(ADVENTURE_ENTRIES.map(entry => [entry.placeId, entry]));
const mountedCards = new WeakMap();
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
let instanceCounter = 0;

/** Pure helper: validates the configured URL and sets an exact known place ID. */
export function adventureUrl(baseUrl, placeId, mapUrl) {
  if (!entries.has(placeId)) throw new Error('这个地点尚未实现可玩的关卡');
  if (typeof baseUrl !== 'string' && !(baseUrl instanceof URL)) throw new Error('baseUrl 必须指向独立关卡的 HTTP(S) 入口');
  const base = new URL(baseUrl, mapUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('关卡入口仅支持不含用户名密码的 HTTP(S) 地址');
  if (mapUrl) {
    const map = new URL(mapUrl);
    if (!localHosts.has(map.hostname) && map.origin !== base.origin) throw new Error('当前游戏协议要求线上地图与关卡同源；本机地图可使用不同端口');
    if (map.protocol === 'https:' && base.protocol === 'http:') throw new Error('HTTPS 地图需要 HTTPS 关卡入口');
  }
  base.searchParams.delete('placeId');
  base.searchParams.set('place', placeId);
  base.searchParams.set('embedded', '1');
  base.hash = '';
  return base;
}

/** Pure helper: null means untrusted, unrelated or malformed. */
export function readAdventureMessage(event, expectedWindow, expectedOrigin) {
  if (!expectedWindow || event.source !== expectedWindow || event.origin !== expectedOrigin) return null;
  const payload = event.data;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.type !== 'chaoshan-adventure:complete' && payload.type !== 'chaoshan-adventure:exit') return null;
  const entry = entries.get(payload.placeId);
  if (!entry) return null;
  if (payload.type === 'chaoshan-adventure:complete' && payload.levelId !== entry.levelId) return null;
  return { type: payload.type, placeId: entry.placeId, ...(payload.type === 'chaoshan-adventure:complete' ? { levelId: entry.levelId } : {}) };
}

const css = `
.ca-map-entry{margin:12px 0 2px;padding:12px;border:1px solid rgba(48,82,69,.24);border-radius:12px;background:rgba(239,245,225,.9);color:#203c32;font:13px/1.55 system-ui,sans-serif}
.ca-map-entry[hidden]{display:none!important}
.ca-map-entry-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ca-map-entry strong{font-size:15px}.ca-map-entry-badge{flex:none;padding:2px 7px;border-radius:6px;background:#dce9d3;font-size:11px}
.ca-map-entry p{margin:7px 0}.ca-map-entry small{display:block;color:#536a5a;font-size:11px;line-height:1.55}
.ca-map-entry-button{display:block;width:100%;margin:9px 0 7px;padding:10px 12px;border:0;border-radius:8px;background:#285347;color:#fff;cursor:pointer;font:600 13px/1.3 system-ui,sans-serif}
.ca-map-entry-button:hover{background:#193e34}.ca-map-entry-button:focus-visible,.ca-map-framebar button:focus-visible,.ca-map-framebar a:focus-visible{outline:3px solid #edb963;outline-offset:3px}
.ca-map-entry-button:disabled{background:#d9dfd4;color:#677263;cursor:default}
.ca-map-frame{position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;max-width:none;height:100vh;height:100dvh;max-height:none;background:#193d35;color:#fff;z-index:2147483000;overflow:hidden}
.ca-map-frame:not([open]){display:none}.ca-map-frame[open]{display:flex;flex-direction:column}.ca-map-frame::backdrop{background:#10291f}
.ca-map-framebar{display:flex;align-items:center;gap:12px;min-height:48px;padding:7px max(12px,env(safe-area-inset-right)) 7px max(12px,env(safe-area-inset-left));box-sizing:border-box;background:#193d35;font:13px/1.4 system-ui,sans-serif}
.ca-map-framebar strong{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ca-map-framebar a{color:#e6eccc;text-decoration:underline;font-size:12px;white-space:nowrap}
.ca-map-framebar button{padding:8px 13px;border:1px solid #a3bba6;border-radius:7px;background:#f3eedb;color:#214035;cursor:pointer;font:600 13px system-ui,sans-serif;white-space:nowrap}
.ca-map-framebody{position:relative;flex:1;min-height:0;background:#d3ddc8}.ca-map-framebody iframe{display:block;width:100%;height:100%;border:0;background:#d3ddc8}
.ca-map-frame-loading{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;background:#d3ddc8;color:#24493c;font:15px system-ui,sans-serif}.ca-map-frame-loading[hidden]{display:none}
@media(max-width:550px){.ca-map-framebar{gap:8px;min-height:45px}.ca-map-framebar strong{font-size:12px}.ca-map-framebar a{font-size:11px}.ca-map-framebar button{padding:7px 9px}}
`;

export function mountAdventureEntry({ places = [], baseUrl, card = document.getElementById('location-card'), onComplete, onOpen, onClose } = {}) {
  if (!card?.append || !Array.isArray(places)) throw new Error('需要地图 location-card 元素及 places 数组');
  if (mountedCards.has(card)) throw new Error('这个地点卡片已经挂载过关卡入口');
  // Validate immediately, before touching the host DOM.
  const validated = adventureUrl(baseUrl, ADVENTURE_ENTRIES[0].placeId, window.location.href);
  const expectedOrigin = validated.origin;
  const prefix = `ca-adventure-map-${++instanceCounter}`;
  const style = document.createElement('style');
  style.dataset.adventureMapAdapter = prefix; style.textContent = css; document.head.append(style);
  const section = document.createElement('section'); section.className = 'ca-map-entry'; section.hidden = true;
  section.setAttribute('aria-label', '地点冒险关卡');
  const top = document.createElement('div'); top.className = 'ca-map-entry-top';
  const title = document.createElement('strong'), badge = document.createElement('span'); badge.className = 'ca-map-entry-badge';
  const description = document.createElement('p'), note = document.createElement('small'), button = document.createElement('button');
  button.type = 'button'; button.className = 'ca-map-entry-button';
  top.append(title, badge); section.append(top, description, button, note); card.append(section);

  const dialog = document.createElement('dialog'); dialog.className = 'ca-map-frame';
  dialog.setAttribute('aria-labelledby', `${prefix}-heading`);
  const bar = document.createElement('div'); bar.className = 'ca-map-framebar';
  const heading = document.createElement('strong'); heading.id = `${prefix}-heading`;
  const standalone = document.createElement('a'); standalone.target = '_blank'; standalone.rel = 'noopener noreferrer'; standalone.textContent = '单独打开';
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = '关闭 · 返回地图';
  const body = document.createElement('div'); body.className = 'ca-map-framebody';
  const loading = document.createElement('div'); loading.className = 'ca-map-frame-loading'; loading.setAttribute('role', 'status'); loading.textContent = '正在载入关卡…';
  bar.append(heading, standalone, closeButton); body.append(loading); dialog.append(bar, body); document.body.append(dialog);

  let selectedPlace = null, frame = null, framePlaceId = null, isOpen = false, destroyed = false, returnFocus = null;
  const sessionCompleted = new Set();
  const syncMapSuspension = () => document.documentElement.toggleAttribute('data-chaoshan-adventure-open', Boolean(document.querySelector('.ca-map-frame[open]')));
  function resolvePlace(value) {
    if (typeof value === 'number') return places[value] || null;
    if (typeof value === 'string') return places.find(place => place.id === value) || (entries.has(value) ? { id: value, name: entries.get(value).name } : null);
    return value && typeof value.id === 'string' ? value : null;
  }
  function render() {
    section.hidden = !selectedPlace;
    if (!selectedPlace) return;
    const entry = entries.get(selectedPlace.id);
    section.dataset.placeId = selectedPlace.id;
    section.dataset.playable = String(!!entry);
    if (entry) {
      title.textContent = `第 ${entry.order} 章 · ${entry.title}`;
      badge.textContent = sessionCompleted.has(entry.placeId) ? '本次已通关' : '可玩原型';
      description.textContent = entry.description;
      button.disabled = false; button.textContent = sessionCompleted.has(entry.placeId) ? '再次进入关卡' : '进入关卡营地';
      note.textContent = '人物尺度的艺术化场景。章节按顺序解锁；等级、武器和通关进度由游戏存档管理。';
    } else {
      title.textContent = `${selectedPlace.name || '这个地点'} · 冒险关卡`;
      badge.textContent = '仍在规划';
      description.textContent = '这个地点尚未制作可玩的关卡。当前已完成小公园、广济桥、揭阳楼、长山尾四个独立场景。';
      button.disabled = true; button.textContent = '关卡尚未开放';
      note.textContent = '地图仍可正常浏览；规划中的地点不会被当作已实现的关卡。';
    }
  }
  function setPlace(place) {
    if (destroyed) return { ok: false, reason: '入口已卸载' };
    selectedPlace = resolvePlace(place); render();
    return { ok: !!selectedPlace, playable: !!selectedPlace && entries.has(selectedPlace.id) };
  }
  function sendEnter(placeId) {
    if (frame?.contentWindow && entries.has(placeId)) frame.contentWindow.postMessage({ type: 'chaoshan-adventure:enter', placeId }, expectedOrigin);
  }
  function open(place = selectedPlace) {
    if (destroyed) return { ok: false, reason: '入口已卸载' };
    const resolved = resolvePlace(place), entry = resolved && entries.get(resolved.id);
    if (!entry) return { ok: false, reason: '这个地点的关卡仍在规划' };
    selectedPlace = resolved; render();
    const url = adventureUrl(baseUrl, entry.placeId, window.location.href);
    heading.textContent = `${entry.name} · ${entry.title}`;
    const standaloneUrl = new URL(url); standaloneUrl.searchParams.delete('embedded');
    standalone.href = standaloneUrl.href;
    returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : button;
    if (!isOpen) {
      if (typeof dialog.showModal !== 'function') return { ok: false, reason: '浏览器不支持全屏关卡窗口，请使用现代浏览器' };
      dialog.showModal(); isOpen = true;
      syncMapSuspension();
    }
    if (!frame || framePlaceId !== entry.placeId) {
      // Focus outside the old child first: main.mjs saves and pauses on blur.
      closeButton.focus({ preventScroll: true });
      frame?.remove();
      frame = document.createElement('iframe'); framePlaceId = entry.placeId;
      frame.title = `${entry.name} · ${entry.title} 可玩关卡`;
      frame.allow = 'fullscreen'; frame.allowFullscreen = true;
      frame.referrerPolicy = 'origin';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads allow-pointer-lock');
      loading.hidden = false;
      const currentFrame = frame;
      frame.addEventListener('load', () => {
        if (destroyed || frame !== currentFrame) return;
        loading.hidden = true;
        if (isOpen) { sendEnter(framePlaceId); frame.focus({ preventScroll: true }); }
      });
      frame.src = url.href; body.prepend(frame);
    } else {
      sendEnter(entry.placeId); frame.focus({ preventScroll: true });
    }
    onOpen?.({ placeId: entry.placeId });
    return { ok: true, placeId: entry.placeId };
  }
  function close() {
    if (destroyed || !isOpen) return { ok: false, reason: '关卡窗口未打开' };
    // This invokes the child's existing blur->save/pause path, without accessing
    // its game object or sending an unsupported pause command.
    closeButton.focus({ preventScroll: true });
    dialog.close(); isOpen = false;
    syncMapSuspension();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    onClose?.({ placeId: framePlaceId });
    return { ok: true };
  }
  function onMessage(event) {
    if (!isOpen || !frame) return;
    const message = readAdventureMessage(event, frame.contentWindow, expectedOrigin);
    if (!message) return;
    if (message.type === 'chaoshan-adventure:exit') { close(); return; }
    const wasComplete = sessionCompleted.has(message.placeId);
    sessionCompleted.add(message.placeId); render();
    // Display-only receipt. No RPG storage, reward, level or unlock is changed.
    if (!wasComplete) onComplete?.({ placeId: message.placeId, levelId: message.levelId, displayOnly: true });
  }
  const onCancel = event => { event.preventDefault(); close(); };
  const onClick = () => open();
  button.addEventListener('click', onClick); closeButton.addEventListener('click', close); dialog.addEventListener('cancel', onCancel);
  window.addEventListener('message', onMessage);
  function destroy() {
    if (destroyed) return;
    if (isOpen) close();
    destroyed = true;
    window.removeEventListener('message', onMessage);
    button.removeEventListener('click', onClick); closeButton.removeEventListener('click', close); dialog.removeEventListener('cancel', onCancel);
    frame?.remove(); dialog.remove(); section.remove(); style.remove(); mountedCards.delete(card);
  }
  const api = Object.freeze({ setPlace, open, close, destroy });
  mountedCards.set(card, api);
  return api;
}
