// Keep the two race choices visible on the original game homepage.
function installPaperRaceEntry() {
  const card = document.getElementById('paper-race-entry');
  if (!card) return {sync() {}};
  const validTracks = new Set(['lagunaSeca', 'apexCircuit']);
  const query = new URLSearchParams(location.search);
  const isCompetition = query.get('mode') === 'competition' || query.has('room');
  if (isCompetition) {card.hidden = true;return {sync() {}};}
  const read = key => {try {return JSON.parse(localStorage.getItem(key) || 'null')} catch {return null}};
  let sawHome = false;
  let observedStore;
  let unsubscribe;
  let scheduled = false;
  const selectedTrack = () => {
    let live;
    try {live = window.apexPaperDebug?.settings?.getState()?.selectedTrackId} catch {}
    const persisted = read('mezip:racing:web:v1:apex-settings-storage')?.state?.selectedTrackId;
    const active = document.querySelector('.home-track__option.is-active');
    return [live, persisted, active?.dataset.trackId, active?.dataset.track, query.get('track'), 'lagunaSeca'].find(id => validTracks.has(id));
  };
  const raceUrl = intent => {
    const target = new URL('/racing/competition/', location.origin);
    target.searchParams.set('intent', intent === 'ai' ? 'ai' : 'invite');
    target.searchParams.set('track', selectedTrack());
    return target.pathname + target.search;
  };
  const rememberName = () => {
    let live;
    try {live = window.apexPaperDebug?.leaderboard?.getState()?.playerName} catch {}
    const currentInput = document.querySelector('.home-driver__input')?.value;
    const persisted = read('mezip:racing:web:v1:racing-leaderboard-storage')?.state?.playerName;
    const name = [currentInput, live, persisted].find(value => typeof value === 'string' && value.trim())?.trim();
    if (name) try {localStorage.setItem('mezip:racing:competition:v1:name', name)} catch {}
  };
  const refreshLinks = () => {
    for (const link of card.querySelectorAll('[data-race-intent]')) {
      const href = raceUrl(link.dataset.raceIntent);
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    }
  };
  for (const link of card.querySelectorAll('[data-race-intent]')) {
    link.addEventListener('click', event => {
      event.stopPropagation();
      rememberName();
      link.setAttribute('href', raceUrl(link.dataset.raceIntent));
      // Keep normal anchor navigation, including modifier-click/new-tab behavior.
    });
  }
  card.addEventListener('keydown', event => event.stopPropagation());
  const writeText = (node, value) => {if (node && node.textContent !== value) node.textContent = value};
  const sync = () => {
    const home = document.querySelector('.home-screen');
    const launching = home?.classList.contains('home-screen--is-launching');
    const playing = !!document.querySelector('.racing-hud,.experience-shell__hud');
    if (home) sawHome = true;
    card.hidden = isCompetition || !!launching || playing || (!home && sawHome);
    if (home && !card.hidden && !home.classList.contains('home-screen--unrevealed')) {
      const info = home.querySelector('.home-info');
      const description = info?.querySelector('.home-info__desc');
      if (info && card.parentElement !== info) {
        if (description) description.after(card); else info.append(card);
      }
      if (card.dataset.placement !== 'home') card.dataset.placement = 'home';
    } else if (!card.hidden && (!sawHome || home?.classList.contains('home-screen--unrevealed'))) {
      // A child of home (z-index 20) cannot rise above the splash (z-index 30).
      // Keep the entry on body until the home reveal has completed.
      if (card.parentElement !== document.body) document.body.append(card);
      if (card.dataset.placement !== 'loading') card.dataset.placement = 'loading';
    }
    const store = window.apexPaperDebug?.settings;
    if (store?.subscribe && observedStore !== store) {
      unsubscribe?.();
      observedStore = store;
      unsubscribe = store.subscribe(refreshLinks);
    }
    refreshLinks();
    const online = home?.querySelector('.home-thumb img[alt="Online Races"]')?.closest('button');
    if (online) {
      online.disabled = false;
      for (const name of ['is-disabled', 'is-locked']) if (online.classList.contains(name)) online.classList.remove(name);
      online.removeAttribute('aria-disabled');
      online.removeAttribute('data-paper-unavailable');
      online.setAttribute('aria-label', '好友与 AI 竞技');
      online.title = '邀请好友，或亲自驾驶挑战噩梦级 AI';
      if (!online.dataset.competitionEntry) {
        online.dataset.competitionEntry = 'true';
        online.addEventListener('click', event => {
          event.preventDefault();event.stopImmediatePropagation();
          rememberName();location.href = raceUrl('invite');
        }, true);
        const label = document.createElement('span');
        label.className = 'competition-mode-label';label.textContent = '好友 / AI 竞技';online.append(label);
      }
      const title = home.querySelector('.home-info__title');
      if (online.classList.contains('is-featured') || title?.textContent === 'Online Races' || title?.textContent === '好友 / AI 竞技') {
        // Only replace the currently featured online content; leave other modes alone.
        if (online.classList.contains('is-featured') || title?.textContent === 'Online Races') {
          writeText(title, '好友 / AI 竞技');
          writeText(home.querySelector('.home-info__desc'), '邀请好友同场争前三，或由你亲自驾驶挑战噩梦级 AI。');
          writeText(home.querySelector('.home-info__status'), '6 辆车 · 3 圈 · 你来驾驶');
          const status = home.querySelector('.home-info__status');
          if (status?.classList.contains('is-locked')) status.classList.remove('is-locked');
        }
      }
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {scheduled = false;sync()});
  };
  const root = document.getElementById('root');
  if (root) new MutationObserver(records => {
    if (records.some(record => {
      if (record.type === 'attributes') return record.target.matches('.home-screen,.home-thumb,.home-track__option');
      if (record.type === 'characterData') return !!record.target.parentElement?.closest('.home-info');
      return !!record.target.closest?.('.home-info') || [...record.addedNodes,...record.removedNodes].some(node => node.nodeType === 1);
    })) schedule();
  }).observe(root, {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
  addEventListener('storage', refreshLinks);
  addEventListener('pageshow', sync);
  sync();
  return {sync, raceUrl, rememberName};
}

installPaperRaceEntry();
