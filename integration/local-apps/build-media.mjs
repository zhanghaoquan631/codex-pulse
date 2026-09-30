import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = await realpath(path.resolve(here, '../..'));
const source = process.argv[2];
if (!source) throw new Error('Pass the original emotion-action-v1/index.html as the read-only source.');
const original = await readFile(source, 'utf8');
if (original.includes('media-adapter.js')) throw new Error('Build from the original ME.zip page, not a generated copy.');
const output = path.join(project, 'public', 'local-apps');
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
for (const directory of [path.join(project, 'public'), output, path.join(output, 'emotion-action-v1')]) {
  await mkdir(directory, { recursive: true });
  if (!samePath(await realpath(directory), directory)) throw new Error('Generated output must stay in the Pulse checkout, without symlinks.');
}
let html = original
  .replace('<title>Emotion. · Action.</title>', '<title>录制与截图库 · Codex Pulse</title>')
  .replace('<strong>Emotion. / Action.</strong>', '<strong>录制与截图库</strong>')
  .replace('LOCAL WATCH CAPTURE', '屏幕录制 · 视频与截图')
  .replaceAll('Emotion.', '视频资料库')
  .replaceAll('Action.', '截图资料库')
  .replace('>观影录制<', '>录制与截图<')
  .replace('href="/post-login-app/index.html#emotion-library"', 'href="/#activity" target="_top"')
  .replaceAll('/api/film-studio/v1', '/api/local-apps/media/api/film-studio/v1')
  .replace(/<script([^>]*)>/gi, (_, attrs) => {
    const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1];
    return '<script type="text/pulse-local-deferred"' + (src ? ' data-src="' + src + '"' : '') + '>';
  })
  .replace('</head>', '<link rel="stylesheet" href="/local-apps/media-theme.css">\n</head>')
  .replace('</body>', '<script src="/local-apps/media-adapter.js"></script>\n</body>');
const generated = new Map([[path.join(output, 'emotion-action-v1', 'index.html'), html]]);
for (const file of ['media-adapter.js', 'media-theme.css']) generated.set(path.join(output, file), await readFile(path.join(here, file), 'utf8'));
let updated = 0;
for (const [file, text] of generated) {
  const existing = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing && !existing.isFile()) throw new Error('Output must be a regular file: ' + file);
  if (await readFile(file, 'utf8').catch(() => null) === text) continue;
  await writeFile(file, text); updated++;
}
console.log(JSON.stringify({ sourceMode: 'read-only', pages: 1, files: generated.size, updated, output }));
