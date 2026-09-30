import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textExtensions = new Set([
  '.env',
  '.example',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.webmanifest',
]);
const findings = [];

function configCandidate(file) {
  return (
    file === '.env.example' ||
    file.startsWith('.github/') ||
    file.startsWith('infrastructure/') ||
    file.startsWith('apps/web/public/')
  );
}

function placeholder(value) {
  return (
    value.length === 0 ||
    /(?:YOUR_|CHANGE_ME|EXAMPLE|PLACEHOLDER|<[^>]+>)/iu.test(value) ||
    /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/iu.test(value) ||
    /^postgresql:\/\/mezip:mezip@localhost/iu.test(value)
  );
}

function inspect(file, source) {
  if (/-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/u.test(source))
    findings.push(`${file}: private key block`);
  if (/(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/u.test(source))
    findings.push(`${file}: GitHub token pattern`);
  if (/\bsk-[A-Za-z0-9]{24,}\b/u.test(source))
    findings.push(`${file}: API key token pattern`);
  if (/\bAKIA[0-9A-Z]{16}\b/u.test(source))
    findings.push(`${file}: AWS access-key pattern`);
  if (!file.startsWith('.env')) return;
  for (const line of source.split(/\r?\n/u)) {
    const match =
      /^\s*([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|DATABASE_URL))\s*=\s*(.*?)\s*$/u.exec(
        line,
      );
    if (match !== null && !placeholder(match[2]))
      findings.push(`${file}: ${match[1]} has a non-placeholder value`);
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'assets'].includes(entry.name))
        files.push(...(await walk(target)));
    } else if (
      textExtensions.has(path.extname(entry.name)) ||
      entry.name.startsWith('.env')
    ) {
      files.push(target);
    }
  }
  return files;
}

const tracked = (
  await execute('git', ['ls-files', '-z'], { cwd: workspaceRoot })
).stdout
  .split('\0')
  .filter(Boolean)
  .filter(configCandidate);
for (const relative of tracked) {
  inspect(relative, await readFile(path.join(workspaceRoot, relative), 'utf8'));
}

for (const relative of ['apps/web/dist', 'apps/admin/dist']) {
  const outputDirectory = path.join(workspaceRoot, relative);
  try {
    for (const file of await walk(outputDirectory)) {
      inspect(
        path.relative(workspaceRoot, file).split(path.sep).join('/'),
        await readFile(file, 'utf8'),
      );
    }
  } catch {
    // Build output is optional; CI runs the source/config scan before build and
    // can run it again after packaging without a different security policy.
  }
}

console.log(
  `ME.zip secret scan: ${tracked.length} tracked configuration/deployment files reviewed`,
);
for (const finding of findings) console.error(`ERROR: ${finding}`);
if (findings.length > 0) process.exitCode = 1;
