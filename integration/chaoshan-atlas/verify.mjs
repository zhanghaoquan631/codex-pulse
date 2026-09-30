import { readFile, readdir, stat, access, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../public/local-apps/chaoshan-atlas');
const base = '/local-apps/chaoshan-atlas/';
const issues = [];
let files = 0, animals = 0, moduleImports = 0, localReferences = 0, totalBytes = 0;
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path); else if (entry.isFile()) yield path;
  }
}
async function checkReference(reference, source) {
  if (!reference || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference) || /[${}]/.test(reference)) return;
  let target;
  const clean = decodeURI(reference.split(/[?#]/)[0]);
  if (clean.startsWith(base)) target = join(root, clean.slice(base.length));
  else if (clean.startsWith('/')) { issues.push(`${relative(root, source)}: escaped base: ${reference}`); return; }
  else target = resolve(dirname(source), clean);
  try {
    const info = await stat(target);
    if (info.isDirectory()) await access(join(target, 'index.html'));
    localReferences++;
  } catch { issues.push(`${relative(root, source)}: missing ${reference}`); }
}
for await (const path of walk(root)) {
  const rel = relative(root, path).replaceAll('\\', '/');
  const bytes = (await stat(path)).size;
  files++; totalBytes += bytes;
  if (bytes >= 25 * 1024 * 1024) issues.push(`Asset too large: ${rel}`);
  if (/(?:^|\/)(?:qa|node_modules|\.env|\.git|PROJECT-RULES\.json|PUBLISH-RECORD\.json|RULES-SNAPSHOT\.json)(?:\/|$)/.test(rel)) issues.push(`Internal file published: ${rel}`);
  const ext = extname(path);
  if (!['.mjs', '.js', '.css', '.html', '.json'].includes(ext) || rel.startsWith('adventure/vendor/')) continue;
  const code = await readFile(path, 'utf8');
  if (/C:\\(?:Users|Program Files)|C:\/Users\//your-user issues.push(`Local absolute path: ${rel}`);
  if (ext === '.mjs') for (const match of code.matchAll(/\b(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) { await checkReference(match[1], path); moduleImports++; }
  if (ext === '.css') for (const match of code.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) await checkReference(match[1], path);
  if (ext === '.html') for (const match of code.matchAll(/(?:href|src)="([^"]+)"/g)) await checkReference(match[1], path);
  if (rel.startsWith('adventure/assets/desktop-animals/') && rel.endsWith('/manifest.json')) {
    const manifest = JSON.parse(code);
    if (!manifest.sheet.startsWith('https://assets.petdex.dev/')) issues.push(`Animal is not CDN-backed: ${rel}`);
    if (manifest.sheet !== manifest.source.spritesheetUrl || !/^[a-f0-9]{64}$/.test(manifest.sha256)) issues.push(`Animal provenance missing: ${rel}`);
    await access(join(root, 'adventure', manifest.preview));
    animals++;
  }
  if (rel === 'data/detail-photos.json') {
    const catalog = JSON.parse(code);
    for (const record of Object.values(catalog)) for (const photo of record.photos || []) await checkReference(photo.src, join(root, 'index.html'));
  }
}
if (animals !== 1593) issues.push(`Expected 1593 animals; got ${animals}`);
const game = await readFile(join(root, 'adventure/main.mjs'), 'utf8');
if (!game.includes(`const MAP_URL = '${base}index.html';`) || !game.includes('event.source !== window.parent') || !game.includes('referrer.origin === location.origin')) issues.push('Game navigation/origin validation mismatch');
const report = { passed: issues.length === 0, files, totalMiB: +(totalBytes / 1048576).toFixed(2), animals, moduleImports, localReferences, issues };
await writeFile(join(here, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exitCode = 1;
