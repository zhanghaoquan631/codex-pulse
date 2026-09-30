const siteOrigin = 'https://codex-pulse-willow-0911.wozhe0196.chatgpt.site';

export const gameLinks = [
  { name: '公鸡快跑', desktop: 'http://127.0.0.1:4173/', mobile: `${siteOrigin}/games/rooster-rush/index.html` },
  { name: '潮汕行旅', desktop: 'http://127.0.0.1:5242/adventure/', mobile: `${siteOrigin}/local-apps/chaoshan-atlas/adventure/index.html` },
] as const;

export function mobileGameUrl(address: string, title: string): string | undefined {
  let url: URL;
  try { url = new URL(address); } catch { return; }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) return;
  const path = url.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
  if (url.port === '5242') {
    if (path === '/') return `${siteOrigin}/local-apps/chaoshan-atlas/index.html`;
    if (path === '/adventure') return gameLinks[1].mobile;
  }
  // Port 4173 is also used by unrelated local apps; require an identified game.
  if (url.port === '4173' && path === '/' && /公鸡|rooster/i.test(title)) return gameLinks[0].mobile;
}
