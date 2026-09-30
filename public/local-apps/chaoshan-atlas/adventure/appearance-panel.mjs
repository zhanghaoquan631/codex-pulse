const APPEARANCES = [
  {id: 'traveler', name: '红巾旅人', image: './assets/appearance-traveler.png', subtitle: '原版行旅形象', description: '墨线勾勒、红巾随行。保留原来的主角外形。'},

];

export function installAppearancePanel({getAppearance, onOpen, onClose, onSelect}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'appearance-panel';
  dialog.className = 'appearance-panel';
  dialog.setAttribute('aria-labelledby', 'appearance-title');
  dialog.setAttribute('aria-describedby', 'appearance-help');
  dialog.innerHTML = `<header><div><small>旅人换装 / WARDROBE</small><h2 id="appearance-title">换一个模样，继续这段旅程。</h2></div><button id="appearance-close" class="quiet" aria-label="关闭换装">×</button></header>
    <p id="appearance-help">营地或关卡中按 <kbd>9</kbd> 打开换装，选择后立即生效。第一人称按 <kbd>V</kbd> 切到第三人称，就能看到全身。</p>
    <div class="gear-grid appearance-options">${APPEARANCES.map(item => `<article class="appearance-card" data-appearance-card="${item.id}"><img class="appearance-portrait" src="${item.image}" width="400" height="500" alt="${item.name}游戏角色全身预览"><small>${item.subtitle}</small><h3>${item.name}</h3><p>${item.description}</p><button class="outlined dark" type="button" data-appearance="${item.id}"></button></article>`).join('')}</div>
    <p id="appearance-status" class="appearance-status" role="status" aria-live="polite"></p>
    
    <footer><span>换装时战斗暂停。位置、体力、金币、装备与本关进度保留。</span><button id="appearance-return" class="primary">完成换装 · 返回</button></footer>`;
  document.body.append(dialog);
  let loadingId = null;
  let returnFocus = null;
  let disposed = false;
  const status = dialog.querySelector('#appearance-status');

  function render() {
    const current = getAppearance();
    dialog.setAttribute('aria-busy', String(!!loadingId));
    for (const button of dialog.querySelectorAll('[data-appearance]')) {
      const selected = button.dataset.appearance === current;
      const busy = button.dataset.appearance === loadingId;
      button.disabled = !!loadingId || selected;
      button.setAttribute('aria-pressed', String(selected));
      button.textContent = busy ? '正在加载角色…' : selected ? '当前使用' : '换上这个角色';
      button.closest('article').classList.toggle('selected', selected);
    }
  }

  function open() {
    if (disposed || dialog.open) return;
    if (onOpen() === false) return;
    returnFocus = document.activeElement;
    status.classList.remove('error');
    status.textContent = loadingId ? '正在加载角色，完成后会自动换上。' : '选择一个角色即可换装，不消耗金币。';
    render();
    dialog.showModal();
    dialog.querySelector('#appearance-close').focus({preventScroll: true});
  }

  function close() {
    if (!dialog.open) return;
    dialog.close();
    onClose();
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected && returnFocus.getClientRects().length) returnFocus.focus({preventScroll: true});
    returnFocus = null;
  }

  async function select(id) {
    if (loadingId || id === getAppearance()) return;
    loadingId = id;
    status.classList.remove('error');
    status.textContent = '正在加载角色，请稍候。';
    render();
    try {
      await onSelect(id);
      if (!disposed) status.textContent = `已换上${APPEARANCES.find(item => item.id === id)?.name || '所选角色'}。点击「完成换装」继续。`;
    } catch (error) {
      if (!disposed) {
        status.classList.add('error');
        status.textContent = error?.message || '角色暂时未能加载，请稍后重试。当前角色已保留。';
      }
    } finally {
      loadingId = null;
      if (!disposed) {
        render();
        if (dialog.open) dialog.querySelector('#appearance-return').focus({preventScroll: true});
      }
    }
  }

  dialog.querySelector('#appearance-close').addEventListener('click', close);
  dialog.querySelector('#appearance-return').addEventListener('click', close);
  for (const button of dialog.querySelectorAll('[data-appearance]')) button.addEventListener('click', () => void select(button.dataset.appearance));
  dialog.addEventListener('cancel', event => {event.preventDefault();close();});
  return {open, close, get isOpen() {return dialog.open;}, get isLoading() {return !!loadingId;}, dispose() {close();disposed = true;dialog.remove();}};
}
