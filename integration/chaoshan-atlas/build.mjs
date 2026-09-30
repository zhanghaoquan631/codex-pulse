import { readFile, writeFile, readdir, mkdir, copyFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative, extname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '../..');
const source = resolve(process.argv[2] || 'C:/Users/your-user/Documents/Codex/2026-08-25/new-chat/outputs/chaoshan-3d-atlas-v5');
const output = resolve(project, 'public/local-apps/chaoshan-atlas');
const base = '/local-apps/chaoshan-atlas/';
if (!output.startsWith(resolve(project, 'public/local-apps') + sep)) throw new Error('Output must remain inside public/local-apps.');
const sourcePackage = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
if (sourcePackage.name !== 'chaoshan-3d-atlas-v5') throw new Error('Unexpected source application.');
const { build } = await import(pathToFileURL(join(source, 'node_modules/vite/dist/node/index.js')).href);
const sourceHashes = {};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hostedPaths = text => text.replace(/(["'`])\/(data|assets|photos)\//g, `$1${base}$2/`)
  .replaceAll('href="/REFERENCE-LICENSES.txt"', `href="${base}REFERENCE-LICENSES.txt"`);

await build({
  configFile: false,
  root: source,
  base,
  plugins: [{
    name: 'pulse-chaoshan-subpath',
    enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith(source.replaceAll('\\', '/')) || id.includes('/node_modules/')) return;
      sourceHashes[relative(source, id.split('?')[0]).replaceAll('\\', '/')] = hash(code);
      let result = hostedPaths(code);
      if (id.endsWith('/unified-entry.mjs')) result = result.replace('十二章冒险 · 本地', '十二章冒险 · 此浏览器存档');
      if (id.endsWith('/feature-ui.mjs')) result = result.replace("baseUrl:'./adventure/'", `baseUrl:'${base}adventure/index.html'`);
      return { code: result, map: null };
    },
    transformIndexHtml: { order: 'pre', handler: hostedPaths },
  }],
  build: { outDir: output, emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});

async function* files(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) yield* files(path);
    else if (item.isFile()) yield path;
  }
}

// Public JSON includes photo URLs; it is copied by Vite, not transformed by it.
for await (const path of files(output)) {
  if (extname(path) === '.json') {
    const text = await readFile(path, 'utf8');
    const changed = hostedPaths(text);
    if (changed !== text) await writeFile(path, changed);
  }
}

const adventureSource = join(source, 'adventure');
const adventureOutput = join(output, 'adventure');
const assetManifest = [];
const publicGuides = new Set(['操作指南.html', 'CHAPTERS-V19.html', 'STORY-V20.html', '01-关卡内容对比.png']);
let skippedSpriteBytes = 0;
for await (const path of files(adventureSource)) {
  const rel = relative(adventureSource, path).replaceAll('\\', '/');
  const extension = extname(path);
  const rootFile = !rel.includes('/');
  // Explicit publication allowlist: no QA, internal release records, saves,
  // configuration, build scripts, node_modules, or source project metadata.
  const keep = (rootFile && ['.mjs', '.css', '.html'].includes(extension) && !rel.endsWith('.test.mjs'))
    || rel.startsWith('assets/') || rel.startsWith('fonts/') || rel.startsWith('vendor/')
    || (rel.startsWith('project-guide/') && publicGuides.has(rel.slice('project-guide/'.length)));
  if (!keep) continue;
  if (rel === 'assets/desktop-animals/manifest.json') continue;
  if (rel.startsWith('assets/desktop-animals/') && rel.endsWith('/spritesheet.webp')) {
    skippedSpriteBytes += (await stat(path)).size;
    continue;
  }
  // The per-animal manifest is required. The full duplicated source metadata is not.
  if (rel.startsWith('assets/desktop-animals/') && extension === '.json' && !rel.endsWith('/manifest.json')) continue;
  const dest = join(adventureOutput, rel);
  await mkdir(dirname(dest), { recursive: true });
  if (rel.startsWith('assets/desktop-animals/') && rel.endsWith('/manifest.json')) {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    const cdnUrl = new URL(manifest.source.spritesheetUrl);
    if (cdnUrl.protocol !== 'https:' || cdnUrl.hostname !== 'assets.petdex.dev' || cdnUrl.username || cdnUrl.password) throw new Error(`Unexpected sprite host for ${manifest.id}`);
    assetManifest.push({ id: manifest.id, url: cdnUrl.href, sha256: manifest.sha256 });
    manifest.sheet = cdnUrl.href;
    // Retain public source credit and integrity; omit local catalog path metadata.
    delete manifest.source.originalFile;
    delete manifest.source.originalMetadata;
    await writeFile(dest, JSON.stringify(manifest));
    continue;
  }
  if (['.mjs', '.css', '.html'].includes(extension) && !rel.startsWith('vendor/')) {
    let code = await readFile(path, 'utf8');
    sourceHashes[`adventure/${rel}`] = hash(code);
    if (rel === 'main.mjs') {
      code = code.replace(/const LOCAL_MAP =[^\n]+\r?\nconst MAP_URL =[^\n]+\r?\nif \(!LOCAL_MAP\)[^\n]+/, `const MAP_URL = '${base}index.html';\n$('map-return').href = MAP_URL;`)
        .replace("if (LOCAL_MAP) location.assign(MAP_URL); else showCamp();", 'location.assign(MAP_URL);')
        .replace(/  const local = \['localhost', '127\.0\.0\.1', '\[::1\]', '::1'\]\.includes\(referrer\.hostname\);\r?\n  if \(local \|\| referrer\.origin === location\.origin\)/, '  if (referrer.origin === location.origin)');
      if (/\bLOCAL_MAP\b/.test(code)) throw new Error('Unexpected game navigation source; review the integration patch.');
    }
    if (rel === 'index.html') {
      code = code.replace(/  <section id="local-file-help"[\s\S]*?<script>if\(location\.protocol==='file:'\)[\s\S]*?<\/script>\r?\n/, '')
        .replace('href="http://127.0.0.1:5242/"', `href="${base}index.html"`);
      code = code.replace('<div class="camp-bottom"><p>', '<div class="camp-bottom"><p>进度保存在当前浏览器，原电脑的本机存档不会自动迁移。动物精灵按需载入公开素材 CDN。<br>');
    }
    if (rel === 'chapter-introduction.mjs') {
      code = code.replace(/<nav class="chapter-intro-docs"[\s\S]*?<\/nav>/, '<nav class="chapter-intro-docs" aria-label="关卡参考资料"><a href="./project-guide/STORY-V20.html" target="_blank" rel="noopener">归途故事与收集说明 ↗</a><a href="./project-guide/CHAPTERS-V19.html" target="_blank" rel="noopener">十一章行动与下一章对比 ↗</a><a href="./project-guide/操作指南.html" target="_blank" rel="noopener">玩家操作指南 ↗</a></nav>')
        .replace(/<figure><a href="\$\{asset\('02-版本目标与推进路线\.png'\)\}[\s\S]*?<\/figure>/, '')
        .replace('完整规则手册与原版对比图', '玩家指南与关卡对比图')
        .replace(/<p>上方介绍随当前章节变化。[\s\S]*?<\/p>/, '<p>上方介绍随当前章节变化。第 2—12 章地区行动见章节说明；换装、跟随与瞄具按键见操作指南。</p>');
    }
    if (rel.startsWith('project-guide/')) {
      code = code.replace(/<section[^>]*><h2>后续[\s\S]*?<\/section>/g, '')
        .replace(/<a\b[^>]*href="[^"]*(?:PROJECT-HANDBOOK|PROJECT-RULES|COMPARISON|\.pdf)[^"]*"[^>]*>[\s\S]*?<\/a>/g, '')
        .replaceAll('http://127.0.0.1:5242/adventure/', `${base}adventure/index.html`)
        .replaceAll('本地开发说明', '故事说明').replaceAll('本地 V16', 'V16');
    }
    if (extension === '.html') code = code.replaceAll('./project-guide/COMPARISON.html', './project-guide/CHAPTERS-V19.html')
      .replace(/<a\b[^>]*href="[^"]*PROJECT-HANDBOOK[^\"]*"[^>]*>[\s\S]*?<\/a>/g, '');
    await writeFile(dest, code);
  } else await copyFile(path, dest);
}

// Catalog paths can also be displayed as source links by future UI versions.
// Keep them consistent with the deliberately CDN-backed sprite manifests.
const catalogPath = join(adventureOutput, 'animal-catalog-data.mjs');
let catalog = await readFile(catalogPath, 'utf8');
for (const item of assetManifest) catalog = catalog.replaceAll(`./assets/desktop-animals/${item.id}/spritesheet.webp`, item.url);
catalog = catalog.replace(/,"sourceMetadataPath":"[^"]*"/g, '');
await writeFile(catalogPath, catalog);

const report = { sourcePackage: sourcePackage.name, sourceVersion: sourcePackage.version, base, animalCount: assetManifest.length, skippedSpriteBytes, runtimeStorage: 'Browser localStorage; no server/API or local save data published.', sourceHashes, spriteAssets: assetManifest };
await mkdir(here, { recursive: true });
await writeFile(join(here, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
let totalBytes = 0, fileCount = 0, largest = { bytes: 0 };
for await (const path of files(output)) {
  const size = (await stat(path)).size;
  if (size >= 25 * 1024 * 1024) throw new Error(`Asset exceeds hosting limit: ${relative(output, path)}`);
  totalBytes += size; fileCount++;
  if (size > largest.bytes) largest = { path: relative(output, path).replaceAll('\\', '/'), bytes: size };
}
console.log(JSON.stringify({ output, fileCount, totalMiB: +(totalBytes / 1048576).toFixed(2), animalCount: assetManifest.length, largest, skippedSpriteMiB: +(skippedSpriteBytes / 1048576).toFixed(2) }, null, 2));
