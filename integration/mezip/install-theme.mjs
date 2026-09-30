import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const copyRoot = path.resolve(here, '../../public/mezip');
const samePath = (left, right) => process.platform === 'win32'
  ? left.toLowerCase() === right.toLowerCase() : left === right;

export async function assertCopyTarget(target) {
  const resolved = path.resolve(target);
  if (!samePath(resolved, copyRoot)) {
    throw new Error('Theme installation is restricted to the independent Pulse public/mezip copy. Never pass the original ME.zip directory.');
  }
  const project = await fs.realpath(path.resolve(here, '../..'));
  const expected = path.join(project, 'public', 'mezip');
  if (!samePath(await fs.realpath(resolved), expected)) {
    throw new Error('The independent copy must not be redirected through a symbolic link.');
  }
  return resolved;
}

export async function assertCopyDirectory(directory) {
  const expected = path.join(await assertCopyTarget(copyRoot), path.basename(directory));
  if (!samePath(path.resolve(directory), expected) || !samePath(await fs.realpath(directory), expected)) {
    throw new Error('A copied module directory must stay inside Pulse public/mezip.');
  }
}

// Pure transformation: callers pass HTML read from the source, which is never written.
export function applyTheme(original, { archive = false, name = '' } = {}) {
  if (!/<body\b/i.test(original) || !/<\/head>/i.test(original) || !/<\/body>/i.test(original)) {
    throw new Error('Expected a complete HTML document: ' + name);
  }
  if (original.includes('/mezip/remote-adapter.js')) {
    throw new Error('This is already a bridged copy. Rebuild from the original source instead of installing a live script over the authentication gate.');
  }
  const prefix = archive ? '../x-local-capture-v7/' : './';
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  // This also covers the archive's viewLibrary.href assignment, not only HTML attributes.
  let html = original.replace(/(\bhref\s*=\s*["'])\/x-local-capture-v[34]\//gi, '$1/x-local-capture-v7/');
  if (!archive && ['settings.html', 'timeline.html'].includes(name)) {
    html = html.replace(/\/x-local-capture-v[34]\/index\.html#/g, '/x-local-capture-v7/index.html#');
  }
  const themeTag = '<link rel="stylesheet" href="' + prefix + 'pulse-theme.css">';
  let themeSeen = false;
  html = html.replace(/<link\b[^>]*\bhref\s*=\s*["'][^"']*\/pulse-theme\.css(?:\?[^"']*)?["'][^>]*>/gi, () => {
    if (themeSeen) return '';
    themeSeen = true;
    return themeTag;
  });
  if (!themeSeen) html = html.replace(/<\/head>/i, '  ' + themeTag + eol + '</head>');
  const shellTag = '<script src="' + prefix + 'pulse-shell.js"></script>';
  let shellSeen = false;
  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*\/pulse-shell\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi, () => {
    if (shellSeen) return '';
    shellSeen = true;
    return shellTag;
  });
  if (!shellSeen) {
    const bodyAt = html.search(/<body\b/i);
    const scriptAt = html.slice(bodyAt).search(/<script(?:\s|>)/i);
    const insertionAt = scriptAt >= 0 ? bodyAt + scriptAt : html.search(/<\/body>/i);
    html = html.slice(0, insertionAt) + shellTag + eol + '  ' + html.slice(insertionAt);
  }
  return html;
}

async function writeChanged(file, text) {
  const info = await fs.lstat(file).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (info && !info.isFile()) throw new Error('The independent copy must contain regular files: ' + file);
  const before = await fs.readFile(file, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (before === text) return false;
  await fs.writeFile(file, text);
  return true;
}

// Optional pre-bridge utility. Production builds call applyTheme() in memory instead.
export async function installTheme(target) {
  const root = await assertCopyTarget(target);
  const pages = [];
  for (const folder of ['x-local-capture-v7', 'x-link-archive-v1']) {
    const directory = path.join(root, folder);
    await assertCopyDirectory(directory);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const file = path.join(directory, entry.name);
      pages.push({ file, html: applyTheme(await fs.readFile(file, 'utf8'), { archive: folder === 'x-link-archive-v1', name: entry.name }) });
    }
  }
  let assetsUpdated = 0, updated = 0;
  for (const file of ['pulse-theme.css', 'pulse-shell.js']) {
    if (await writeChanged(path.join(root, 'x-local-capture-v7', file), await fs.readFile(path.join(here, file), 'utf8'))) assetsUpdated++;
  }
  for (const { file, html } of pages) if (await writeChanged(file, html)) updated++;
  return { pages: pages.length, updated, assetsUpdated, target: root };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Pass the independent Pulse public/mezip copy; use build-remote.mjs to build from the original ME.zip source.');
  console.log(JSON.stringify(await installTheme(process.argv[2])));
}

