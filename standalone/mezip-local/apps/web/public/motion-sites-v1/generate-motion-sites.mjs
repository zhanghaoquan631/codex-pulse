import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

const components = [
  ['circle-gallery', '圆环画廊', 'CIRCLE GALLERY', '#72e8ca'],
  ['animated-list', '动画列表', 'ANIMATED LIST', '#f58ac1'],
  ['comparison-slider', '比较滑块', 'COMPARISON SLIDER', '#f2cf82'],
  ['scroll-mask', '卷轴面具', 'SCROLL MASK', '#7ba9ff'],
  ['scroll-stack', '卷轴堆栈', 'SCROLL STACK', '#c492ff'],
  ['watercolor', '水彩画', 'WATERCOLOR', '#91d9ff'],
  ['neural-tunnel', '神经隧道', 'NEURAL TUNNEL', '#ad83ff'],
  ['blur-highlight', '模糊高光', 'BLUR HIGHLIGHT', '#f2a56f'],
  ['text-scatter', '文本散布', 'TEXT SCATTER', '#ff9bbf'],
  ['speeding-text', '快速文本', 'SPEEDING TEXT', '#ffdf78'],
  ['particle-text', '粒子文本', 'PARTICLE TEXT', '#75e6d0'],
  ['bending-marquee', '弯曲帐篷', 'BENDING MARQUEE', '#ae95ff'],
  ['staggered-text', '错开文本', 'STAGGERED TEXT', '#a5ddff'],
  ['tilted-tiles', '倾斜瓷砖', 'TILTED TILES', '#fd99bc'],
  ['simple-graph', '简单图', 'SIMPLE GRAPH', '#70eacb'],
  ['grid-rise', '网格上升', 'GRID RISE', '#f4c781'],
  ['glass-cursor', '玻璃光标', 'GLASS CURSOR', '#b5c5ff'],
  ['parallax-pills', '视差药丸', 'PARALLAX PILLS', '#e6a2ff'],
  ['smooth-cursor', '光滑光标', 'SMOOTH CURSOR', '#7bd4ff'],
  ['text-cube', '文本立方体', 'TEXT CUBE', '#c795ff'],
  ['user-cursor', '用户光标', 'USER CURSOR', '#82e7d0'],
  ['circles', '圆圈', 'CIRCLES', '#f69bc5'],
  ['tumble-carousel', '翻滚旋转木马', 'TUMBLE CAROUSEL', '#fbce88'],
];

const shellCss = `
:root { color-scheme: dark; --ink: #f8f7ff; --line: rgba(255,255,255,.16); --panel: rgba(8,9,15,.52); }
* { box-sizing: border-box; }
html, body { width: 100%; min-height: 100%; margin: 0; background: #070810; }
body { overflow: hidden; color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.motion-frame { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; background: #090a10; }
.standalone-body .lab-page { width: 100%; min-width: 0; min-height: 100svh; height: 100svh; padding: 0; }
.standalone-body .lab-header, .standalone-body .lab-nav, .standalone-body .demo-kicker, .standalone-body .demo-panel > h2 { display: none; }
.standalone-body .lab-layout { display: block; min-height: 100%; height: 100%; }
.standalone-body .demo-panel { min-height: 100%; height: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.standalone-body .demo-stage { min-height: 100%; height: 100%; border: 0; border-radius: 0; }
.site-chrome { position: fixed; z-index: 3; inset: 0; pointer-events: none; }
.site-chrome::before { content: ""; position: absolute; inset: 0; border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent); box-shadow: inset 0 0 0 1px #ffffff07; }
.site-meta { position: absolute; top: clamp(16px, 2.6vw, 34px); left: clamp(16px, 2.6vw, 34px); display: grid; gap: 5px; max-width: min(72vw, 420px); padding: 12px 15px; border: 1px solid #ffffff21; border-radius: 16px; background: linear-gradient(140deg, color-mix(in srgb, var(--accent) 13%, #0a0b12 88%), #090a10a8); box-shadow: 0 13px 38px #0006, inset 0 1px #ffffff20; backdrop-filter: blur(13px); }
.site-meta p, .site-meta h1 { margin: 0; }
.site-meta p { color: var(--accent); font-size: 10px; font-weight: 850; letter-spacing: .18em; }
.site-meta h1 { font-family: "Kaiti SC", "STKaiti", KaiTi, "DFKai-SB", serif; font-size: clamp(23px, 3.1vw, 38px); line-height: 1.05; letter-spacing: .09em; }
.back { position: absolute; right: clamp(16px, 2.6vw, 34px); top: clamp(16px, 2.6vw, 34px); display: inline-flex; align-items: center; gap: 8px; padding: 11px 14px; border: 1px solid #ffffff2e; border-radius: 999px; color: #f9f8ff; background: #0a0b12a6; box-shadow: 0 12px 32px #0006, inset 0 1px #ffffff21; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-decoration: none; pointer-events: auto; backdrop-filter: blur(13px); transition: border-color .2s ease, transform .2s ease, color .2s ease; }
.back:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-2px); }
.hint { position: absolute; left: 50%; bottom: 22px; margin: 0; padding: 8px 12px; border: 1px solid #ffffff18; border-radius: 999px; color: #eeedf4; background: #0809107a; font-family: "Kaiti SC", "STKaiti", KaiTi, serif; font-size: 13px; letter-spacing: .08em; transform: translateX(-50%); box-shadow: inset 0 1px #ffffff16; backdrop-filter: blur(10px); }
@media (max-width: 650px) { .site-meta { top: 13px; left: 13px; padding: 10px 12px; }.back { top: 13px; right: 13px; padding: 9px 11px; font-size: 11px; }.hint { bottom: 13px; font-size: 12px; }.site-meta h1 { font-size: 23px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: .001ms !important; animation-duration: .001ms !important; animation-iteration-count: 1 !important; } }
`;

const galleryCss = `
:root { color-scheme: dark; --page: #090a10; --line: rgba(255,255,255,.15); --ink: #f9f8ff; }
* { box-sizing: border-box; }
html { background: var(--page); }
body { min-height: 100vh; margin: 0; overflow-x: hidden; background: radial-gradient(circle at 16% 6%, #6d5ca42d, transparent 25rem), radial-gradient(circle at 88% 90%, #086c6a33, transparent 26rem), var(--page); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
main { width: min(1500px, 100%); margin: 0 auto; padding: clamp(26px, 5vw, 74px); }
header { display: flex; align-items: end; justify-content: space-between; gap: 22px; margin-bottom: clamp(28px, 5vw, 58px); }
h1 { margin: 0; font-family: "Kaiti SC", "STKaiti", KaiTi, serif; font-size: clamp(38px, 6vw, 82px); line-height: .95; letter-spacing: .11em; }
header p { margin: 0 0 9px; color: #aeadb8; font-size: 12px; font-weight: 800; letter-spacing: .17em; }
.count { flex: 0 0 auto; padding: 11px 14px; border: 1px solid var(--line); border-radius: 999px; color: #8ce7d1; background: #ffffff08; font-size: 12px; font-weight: 850; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 13px; }
.card { position: relative; min-height: 182px; overflow: hidden; padding: 21px; border: 1px solid var(--line); border-radius: 23px; background: linear-gradient(145deg, #191b29bd, #0c0d14d6); box-shadow: inset 0 1px #ffffff16, 0 18px 44px #0005; color: var(--ink); text-decoration: none; transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease; }
.card::after { content: ""; position: absolute; inset: auto -10% -50% auto; width: 70%; aspect-ratio: 1; border-radius: 50%; background: var(--accent); opacity: .22; filter: blur(18px); }
.card:hover { z-index: 1; border-color: var(--accent); transform: translateY(-8px) rotate(-.3deg); box-shadow: inset 0 1px #ffffff24, 0 28px 58px #0009; }
.number, .english, .name { position: relative; z-index: 1; display: block; }.number { color: var(--accent); font-size: 12px; font-weight: 900; letter-spacing: .12em; }.english { margin-top: 39px; color: #aaa9b6; font-size: 10px; font-weight: 850; letter-spacing: .16em; }.name { margin-top: 8px; font-family: "Kaiti SC", "STKaiti", KaiTi, serif; font-size: 28px; font-weight: 700; letter-spacing: .1em; }
@media (max-width: 600px) { main { padding: 28px 18px 52px; } header { align-items: flex-start; flex-direction: column; }.grid { grid-template-columns: 1fr 1fr; gap: 9px; }.card { min-height: 155px; padding: 15px; border-radius: 18px; }.english { margin-top: 28px; font-size: 9px; }.name { font-size: 22px; } }
`;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function sitePage([slug, chinese, english, accent], index) {
  const number = String(index + 1).padStart(2, '0');
  return `<!doctype html>
<html lang="zh-CN" data-component="${slug}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#090a10" />
    <meta name="description" content="${escapeHtml(chinese)}的独立互动预览。" />
    <title>${escapeHtml(chinese)} · 独立互动预览</title>
    <link rel="stylesheet" href="../component-runtime.css" />
    <link rel="stylesheet" href="../site-shell.css" />
  </head>
  <body class="standalone-body" style="--accent:${accent}">
    <main class="lab-page">
      <header class="lab-header" aria-hidden="true"><span id="labStatus"></span></header>
      <section class="lab-layout" aria-label="${escapeHtml(chinese)}互动预览">
        <section class="demo-panel">
          <div class="demo-kicker" aria-hidden="true"><span id="demoNumber"></span><span id="demoEnglish"></span></div>
          <h2 id="demoTitle"></h2>
          <div class="demo-stage" id="demoStage" tabindex="0" aria-label="${escapeHtml(chinese)}互动演示"></div>
        </section>
      </section>
    </main>
    <main class="site-chrome">
      <section class="site-meta" aria-label="当前组件">
        <p>${number} · ${escapeHtml(english)}</p>
        <h1>${escapeHtml(chinese)}</h1>
      </section>
      <a class="back" href="../index.html" aria-label="返回互动预览目录">全部预览 <span>↗</span></a>
      <p class="hint">直接在画面中互动</p>
    </main>
    <script>window.__motionSiteAssetRoot = '../assets/';</script>
    <script src="../component-runtime.js"></script>
  </body>
</html>
`;
}

function galleryPage() {
  const cards = components.map(([slug, chinese, english, accent], index) => `<a class="card" href="./${slug}/index.html" style="--accent:${accent}"><span class="number">${String(index + 1).padStart(2, '0')}</span><span class="english">${escapeHtml(english)}</span><strong class="name">${escapeHtml(chinese)}</strong></a>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#090a10" />
    <meta name="description" content="ME.zip 原创互动组件独立预览目录。" />
    <title>互动组件独立预览 · ME.zip</title>
    <link rel="stylesheet" href="./gallery.css" />
  </head>
  <body>
    <main>
      <header><div><p>ME.ZIP · ORIGINAL INTERACTION STUDIES</p><h1>互动预览<br>独立入口</h1></div><span class="count">${components.length} 个预览</span></header>
      <section class="grid" aria-label="独立互动预览列表">${cards}</section>
    </main>
  </body>
</html>
`;
}

await mkdir(root, { recursive: true });
await writeFile(path.join(root, 'site-shell.css'), shellCss.trimStart(), 'utf8');
await writeFile(path.join(root, 'gallery.css'), galleryCss.trimStart(), 'utf8');
await writeFile(path.join(root, 'index.html'), galleryPage(), 'utf8');
await writeFile(path.join(root, 'README.md'), `# 原创互动组件独立预览\n\n每个目录都是一个可单独打开的预览入口；交互运行时复用 \`../motion-lab-v1/\` 的原创实现。\n\n不包含 React Bits Pro 的源码、素材或原站文案。\n`, 'utf8');

for (const [index, component] of components.entries()) {
  const [slug] = component;
  const directory = path.join(root, slug);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), sitePage(component, index), 'utf8');
}

console.log(`Generated ${components.length} independent previews in ${root}`);
