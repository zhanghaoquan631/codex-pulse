(() => {
  if (document.body.dataset.pulseShell === 'ready') return;
  document.body.dataset.pulseShell = 'ready';
  const pulseOrigin = 'https://codex-pulse-willow-0911.wozhe0196.chatgpt.site';
  const base = '/mezip/x-local-capture-v7/';
  function pagePath(pathname) {
    if (pathname.endsWith('/')) return pathname + 'index.html';
    return /\/[^/]+\.[^/]+$/.test(pathname) ? pathname : pathname + '.html';
  }
  const indexPage = pagePath(location.pathname) === base + 'index.html';
  const archive = location.pathname.startsWith('/mezip/x-link-archive-v1/');
  document.body.classList.toggle('pulse-link-archive', archive);
  document.body.classList.toggle('pulse-embedded', window.parent !== window);
  // Preserve the standalone pages' content while giving them the same section navigation.
  let rail = document.querySelector('.rail');
  const main = document.querySelector('main');
  if (!rail && main) {
    const shell = document.createElement('div'); shell.className = 'app-shell'; main.before(shell);
    rail = document.createElement('aside'); rail.className = 'rail';
    const brand = document.createElement('a'); brand.className = 'brand'; brand.href = base + 'index.html#overview'; brand.setAttribute('aria-label', 'ME.zip 本地监控系统');
    const mark = document.createElement('span'); mark.className = 'brand-mark'; mark.append(document.createTextNode('ME'));
    const suffix = document.createElement('span'); suffix.textContent = '.zip'; mark.append(suffix);
    const caption = document.createElement('small'); caption.textContent = 'LOCAL MEMORY'; brand.append(mark, caption);
    const navigation = document.createElement('nav'); navigation.setAttribute('aria-label', '行为与资料导航');
    rail.append(brand, navigation); shell.append(rail, main); main.classList.add('main');
  }
  const groups = [
    ['活动记录', [['⌂','总览','index.html#overview','overview'],['◷','全局时间轴','global-timeline.html'],['▣','电影档案','movies.html'],['𝕏','X 行为','index.html#timeline','timeline'],['▷','观看记录','watch.html']]],
    ['资料与研究', [['↗','X 链接收集','/mezip/x-link-archive-v1/index.html'],['▤','网页 · 文章 · 代码','resources.html'],['◉','阅读与研究','reading.html'],['☆','私人资料库','index.html#special','special']]],
    ['偏好与设置', [['✧','兴趣档案','index.html#interest','interest'],['⚙','隐私设置','index.html#settings','settings']]],
  ];
  const nav = rail?.querySelector('nav');
  if (nav) {
    nav.replaceChildren();
    for (const [label, links] of groups) {
      const group = document.createElement('div'); group.className = 'pulse-nav-group';
      const title = document.createElement('span'); title.className = 'pulse-nav-label'; title.textContent = label; group.append(title);
      const list = document.createElement('div'); list.className = 'pulse-nav-links'; group.append(list);
      for (const [symbol,name,file,route] of links) {
        const a = document.createElement('a'); a.href = indexPage && route ? '#' + route : file.startsWith('/') ? file : base + file;
        if(indexPage && route) a.dataset.route = route;
        const icon = document.createElement('i'); icon.className='pulse-nav-icon';icon.textContent=symbol;icon.setAttribute('aria-hidden','true');
        const text = document.createElement('span');text.textContent=name;a.append(icon,text);list.append(a);
      }
      nav.append(group);
    }
    const back = document.createElement('a');back.className='pulse-return';back.href=pulseOrigin+'/#activity';back.target='_top';back.textContent='Codex Pulse ↗';nav.after(back);
  }
  function selected(){
    const sectionPath=pagePath(location.pathname).replace(/\/watch-(?:detail|test)\.html$/,'/watch.html').replace(/\/reading-detail\.html$/,'/reading.html');
    if(nav)for(const link of nav.querySelectorAll('a')){const url=new URL(link.href);const samePage=pagePath(url.pathname)===sectionPath;const active=samePage&&(!url.hash||url.hash===(location.hash||'#overview').split('?')[0]);link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  }
  selected();window.addEventListener('hashchange',selected);
  // Only tell the parent which module is open. No records or personal data cross origins.
  let parentOrigin=null;try{parentOrigin=new URL(document.referrer).origin;}catch{}
  if(parentOrigin!==pulseOrigin&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(parentOrigin||''))parentOrigin=null;
  const report=()=>{if(window.parent!==window&&parentOrigin)window.parent.postMessage({type:'mezip:pulse-ready',path:location.pathname,search:location.search,hash:location.hash},parentOrigin);};
  window.addEventListener('hashchange',report);window.addEventListener('load',report);report();
  const memoryStyle=document.createElement('link'); memoryStyle.rel='stylesheet'; memoryStyle.href=base+'memory.css'; document.head.append(memoryStyle);
  const memoryScript=document.createElement('script'); memoryScript.src=base+'memory.js'; document.body.append(memoryScript);
})();
