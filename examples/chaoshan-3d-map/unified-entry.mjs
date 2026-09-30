import {ADVENTURE_ENTRIES, mountAdventureEntry} from './adventure/map-entry.mjs';
import './unified-entry.css';

const SAVE_KEY = 'chaoshan-adventure:singleplayer:v1';
const entries = new Map(ADVENTURE_ENTRIES.map(entry => [entry.placeId, entry]));

// Read only. Match the game's essential v1 validation and sequential unlocks;
// an arbitrary unlockedLevelIds value must never grant access to a later chapter.
export function latestUnlockedEntry(raw) {
  const first = ADVENTURE_ENTRIES[0];
  try {
    const save = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!save || save.version !== 1 || !save.player || Array.isArray(save.player) || !save.progress) return first;
    for (const key of ['level', 'xp', 'gold', 'potions']) {
      if (typeof save.player[key] !== 'number' || !Number.isFinite(save.player[key]) || save.player[key] < 0) return first;
    }
    const completed = new Set(Array.isArray(save.progress.completedLevelIds) ? save.progress.completedLevelIds : []);
    let latest = first;
    for (let index = 0; index < ADVENTURE_ENTRIES.length - 1; index++) {
      if (!completed.has(ADVENTURE_ENTRIES[index].levelId)) break;
      latest = ADVENTURE_ENTRIES[index + 1];
    }
    return latest;
  } catch { return first; }
}

export function mountUnifiedEntry({places = [], baseUrl = './adventure/'} = {}) {
  const host = document.querySelector('.top-actions');
  const panel = document.createElement('nav');
  panel.className = 'unified-entry glass';
  panel.setAttribute('aria-label', '地图与游戏');
  const mapButton = document.createElement('button');
  mapButton.type = 'button'; mapButton.className = 'unified-map';
  mapButton.textContent = '地图'; mapButton.setAttribute('aria-current', 'page');
  mapButton.title = '浏览地图，保留当前地点与视角';
  const gameButton = document.createElement('button');
  gameButton.type = 'button'; gameButton.className = 'unified-game';
  const gameLabel = document.createElement('strong'), badge = document.createElement('small');
  gameLabel.textContent = '进入游戏'; badge.textContent = '十二章冒险 · 本地';
  gameButton.append(gameLabel, badge);
  const context = document.createElement('span');
  context.className = 'unified-entry-context'; context.id = 'unified-entry-context';
  gameButton.setAttribute('aria-describedby', context.id);
  panel.append(mapButton, gameButton, context); host.append(panel);

  let selectedPlace = null;
  function continueEntry() {
    try { return latestUnlockedEntry(localStorage.getItem(SAVE_KEY)); }
    catch { return ADVENTURE_ENTRIES[0]; }
  }
  function targetEntry() { return entries.get(selectedPlace?.id) || continueEntry(); }
  function render() {
    const entry = targetEntry(), selected = entries.has(selectedPlace?.id);
    context.textContent = `${selected ? '当前地点' : entry.order === 1 ? '从首章启程' : '继续旅程'} · 第 ${entry.order} 章 ${entry.title}`;
    context.title = `${entry.name} · 章节按顺序解锁，未开放章节需先完成前章。`;
    gameButton.dataset.placeId = entry.placeId;
  }
  // The adapter owns the existing full-screen iframe dialog. Its old per-place
  // card is detached because this persistent navigation replaces that entry.
  const adapter = mountAdventureEntry({places, baseUrl, card: document.createElement('div'),
    onClose: () => { render(); mapButton.setAttribute('aria-current', 'page'); gameButton.removeAttribute('aria-current'); },
    onOpen: () => { mapButton.removeAttribute('aria-current'); gameButton.setAttribute('aria-current', 'page'); },
  });
  function open() {
    const result = adapter.open(targetEntry().placeId);
    if (!result.ok) context.textContent = result.reason;
    return result;
  }
  function showMap() { adapter.close(); document.getElementById('viewport')?.focus({preventScroll: true}); }
  function onStorage(event) { if (event.key === SAVE_KEY || event.key === null) render(); }
  gameButton.addEventListener('click', open);
  mapButton.addEventListener('click', showMap);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', render);
  render();
  return Object.freeze({
    setPlace(place) { selectedPlace = place || null; render(); return adapter.setPlace(place); },
    open, close: adapter.close,
    destroy() { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', render); adapter.destroy(); panel.remove(); },
  });
}
