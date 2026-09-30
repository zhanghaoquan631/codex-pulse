import { readdir, readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTheme, assertCopyTarget, assertCopyDirectory, copyRoot } from './install-theme.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) throw new Error('Pass the original ME.zip apps/web/public directory (read-only source).');
const source = await realpath(path.resolve(process.argv[2]));
const output = copyRoot;
const compare = value => process.platform === 'win32' ? value.toLowerCase() : value;
if (compare(source) === compare(output) || compare(source).startsWith(compare(output) + path.sep)) {
  throw new Error('Build from the original source, not from the generated Pulse copy.');
}

// Guard the exact independent output, including existing directory junctions.
const project = await realpath(path.resolve(here, '../..'));
const publicDirectory = path.join(project, 'public');
if (compare(await realpath(path.dirname(output))) !== compare(publicDirectory)) {
  throw new Error('Pulse public must not be redirected outside the checkout.');
}
await mkdir(output, { recursive: true });
await assertCopyTarget(output);

// Absolute module paths are rewritten; ../ sibling paths must remain relative.
const hostedPaths = text => text
  .replace(/(?<![.\w/:])\/x-local-capture-v7\//g, '/mezip/x-local-capture-v7/')
  .replace(/(?<![.\w/:])\/x-link-archive-v1\//g, '/mezip/x-link-archive-v1/');

function prepareHtml(original, folder, name) {
  let text = hostedPaths(applyTheme(original, { archive: folder === 'x-link-archive-v1', name }));
  text = text.replace('无需 X API、无需登录 X、不会调用第三方接口。内容只保存在本机浏览器与本地桥接服务，不会上传到 X 或其他第三方。', '无需登录 X。记录由这台电脑的 ME.zip 保存，通过你的 Codex Pulse 账号访问，不会发布到 X。')
    .replace('没有 API 时也能使用；换设备不会自动同步。', '通过此网站连接同一台电脑，无需重新填写本机地址。')
    .replace('删除只移除本机清单，不会删除 X 原帖或 Capture 历史。', '删除只移除当前浏览器的清单，不会删除 X 原帖或电脑上的 Capture 历史。')
    .replace('桥接不可用时，网页仍会使用当前浏览器的私有本地存储，不会伪造“已同步”。', '电脑离线时暂停远程操作，开机联网后自动重新连接；未确认的操作不会显示为已写入电脑。');
  // The separate official X service keeps its original destination.
  text = text.replaceAll('href="/x"', 'href="http://127.0.0.1:5174/x" target="_blank" rel="noopener"');
  text = text.replace(/<script([^>]*)>/gi, (_, attrs) => {
    const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1];
    return '<script type="text/mezip-deferred"' + (src ? ' data-src="' + src + '"' : '') + '>';
  });
  return text.replace(/<\/body>/i, '<script src="/mezip/remote-adapter.js"></script>\n</body>');
}

// All source files are read only. Theme/navigation transformations happen in memory.
const generated = new Map();
let pages = 0;
for (const folder of ['x-local-capture-v7', 'x-link-archive-v1']) {
  const sourceDirectory = path.join(source, folder);
  const destination = path.join(output, folder);
  await mkdir(destination, { recursive: true });
  await assertCopyDirectory(destination);
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(html|css|js)$/.test(entry.name)) continue;
    if (['pulse-theme.css', 'pulse-shell.js'].includes(entry.name)) continue;
    const original = await readFile(path.join(sourceDirectory, entry.name), 'utf8');
    const text = entry.name.endsWith('.html')
      ? prepareHtml(original, folder, entry.name) : hostedPaths(original);
    generated.set(path.join(destination, entry.name), text);
    if (entry.name.endsWith('.html')) pages++;
  }
}
for (const file of ['pulse-theme.css', 'pulse-shell.js']) {
  generated.set(path.join(output, 'x-local-capture-v7', file), hostedPaths(await readFile(path.join(here, file), 'utf8')));
}
generated.set(path.join(output, 'remote-adapter.js'), await readFile(path.join(here, 'remote-adapter.js'), 'utf8'));
// Additive modules live with the Pulse integration and survive source refreshes.
for (const name of ['memory.js', 'memory.css', 'movies.html']) {
  generated.set(path.join(output, 'x-local-capture-v7', name), await readFile(path.join(here, 'additions', name), 'utf8'));
}

// Refuse file links as well as directory links before updating the independent copy.
for (const file of generated.keys()) {
  const info = await lstat(file).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (info && !info.isFile()) throw new Error('Generated output is not a regular file: ' + file);
}
let updated = 0;
for (const [file, text] of generated) {
  const prior = await readFile(file, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (prior === text) continue;
  await writeFile(file, text);
  updated++;
}
console.log(JSON.stringify({ pages, files: generated.size, updated, sourceMode: 'read-only', output }));

