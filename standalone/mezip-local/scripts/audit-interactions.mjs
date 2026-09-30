import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(workspaceRoot, 'apps', 'web', 'src');
const miniRoot = path.join(workspaceRoot, 'apps', 'wechat-miniprogram', 'miniprogram');
const ignoredDirectories = new Set(['dist', 'node_modules', '.git']);
const runtimeExtensions = new Set(['.ts', '.tsx', '.wxml']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name))
        files.push(...(await walk(path.join(directory, entry.name))));
      continue;
    }
    if (
      !entry.name.includes('.test.') &&
      runtimeExtensions.has(path.extname(entry.name))
    ) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function relative(file) {
  return path.relative(workspaceRoot, file).split(path.sep).join('/');
}

function findLines(source, matcher) {
  const lines = source.split(/\r?\n/u);
  return lines.flatMap((line, index) => (matcher.test(line) ? [index + 1] : []));
}

function openingTags(source, name) {
  return source.match(new RegExp(`<${name}\\b[^>]*>`, 'gu')) ?? [];
}

const errors = [];
const warnings = [];
const webFiles = await walk(webRoot);
const miniFiles = await walk(miniRoot);
let webButtons = 0;
let miniButtons = 0;
let explicitDisabledWebButtons = 0;
let explicitDisabledMiniButtons = 0;

for (const file of webFiles) {
  const source = await readFile(file, 'utf8');
  const buttonTags = openingTags(source, 'button');
  webButtons += buttonTags.length;
  explicitDisabledWebButtons += (
    source.match(/\bdisabled(?:=\{(?:true|[^}]+)\}|="true")/gu) ?? []
  ).length;
  for (const tag of buttonTags) {
    if (
      !/(?:\bonClick=|\bonMouseDown=|\bonKeyDown=|\bdisabled=|\btype="(?:submit|reset)"|\btype='(?:submit|reset)')/u.test(
        tag,
      )
    ) {
      errors.push(
        `${relative(file)} contains a web button without an event, form action, or explicit disabled state: ${tag}`,
      );
    }
  }
  for (const line of findLines(
    source,
    /onClick=\{\(\)\s*=>\s*\{\s*\}\}|onClick=\{\(\)\s*=>\s*undefined\}/u,
  )) {
    errors.push(`${relative(file)}:${line} contains a no-op web click handler`);
  }
  for (const line of findLines(source, /(?:window\.)?(?:alert|confirm|prompt)\(/u)) {
    errors.push(
      `${relative(file)}:${line} uses a blocking browser dialog instead of an inline interaction state`,
    );
  }
  for (const line of findLines(source, /javascript:/u)) {
    errors.push(`${relative(file)}:${line} contains a javascript: URL`);
  }
}

for (const file of miniFiles) {
  const source = await readFile(file, 'utf8');
  const buttonTags = openingTags(source, 'button');
  miniButtons += buttonTags.length;
  explicitDisabledMiniButtons += (source.match(/\bdisabled="true"/gu) ?? []).length;
  for (const tag of buttonTags) {
    if (!/(?:\b(?:bindtap|catchtap|open-type|form-type)=|\bdisabled=)/u.test(tag)) {
      errors.push(
        `${relative(file)} contains a Mini Program button without a tap/form/native action or explicit disabled state: ${tag}`,
      );
    }
  }
  for (const line of findLines(
    source,
    /(?:bindtap|catchtap)="(?:|todo|noop|placeholder)"/u,
  )) {
    errors.push(`${relative(file)}:${line} contains a no-op Mini Program tap handler`);
  }
  for (const line of findLines(source, /javascript:/u)) {
    errors.push(`${relative(file)}:${line} contains a javascript: URL`);
  }
}

const appConfigPath = path.join(miniRoot, 'app.json');
const appConfig = JSON.parse(await readFile(appConfigPath, 'utf8'));
for (const page of appConfig.pages) {
  for (const extension of ['.ts', '.wxml', '.json']) {
    const pageFile = path.join(miniRoot, `${page}${extension}`);
    try {
      const entry = await stat(pageFile);
      if (!entry.isFile()) errors.push(`${relative(pageFile)} is not a file`);
    } catch {
      errors.push(
        `${relative(pageFile)} is missing for registered Mini Program route ${page}`,
      );
    }
  }
}

if (explicitDisabledMiniButtons > 0) {
  warnings.push(
    `${explicitDisabledMiniButtons} Mini Program controls are explicitly disabled and must retain nearby state/reason copy.`,
  );
}
if (explicitDisabledWebButtons > 0) {
  warnings.push(
    `${explicitDisabledWebButtons} web controls have an explicit disabled state and are covered by the Phase 23 inventory.`,
  );
}

console.log('ME.zip interaction static audit');
console.log(`- Web runtime files: ${webFiles.length}; button elements: ${webButtons}`);
console.log(
  `- Mini runtime files: ${miniFiles.length}; button elements: ${miniButtons}`,
);
console.log(`- Registered Mini routes: ${appConfig.pages.length}`);
for (const warning of warnings) console.log(`WARN: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);

if (errors.length > 0) process.exitCode = 1;
