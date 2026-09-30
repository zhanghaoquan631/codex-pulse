import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = path.join(workspaceRoot, 'infrastructure', 'database');
const migrationNames = (await readdir(migrationDirectory))
  .map((name) => ({ name, match: /^(\d{3})_[a-z0-9_]+\.sql$/u.exec(name) }))
  .filter((entry) => entry.match !== null)
  .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));

const errors = [];
const seen = new Set();
for (const [index, migration] of migrationNames.entries()) {
  const version = Number(migration.match[1]);
  if (seen.has(version)) errors.push(`${migration.name}: duplicate migration version`);
  seen.add(version);
  if (version !== index + 1)
    errors.push(
      `${migration.name}: expected sequential migration version ${index + 1}`,
    );

  const source = await readFile(path.join(migrationDirectory, migration.name), 'utf8');
  const executable = source.replace(/--[^\r\n]*/gu, '');
  if (
    /\bDROP\s+(?:TABLE|COLUMN|TYPE)\b/iu.test(executable) ||
    /(?:^|;)\s*TRUNCATE\b/imu.test(executable)
  ) {
    errors.push(
      `${migration.name}: destructive schema operation requires an explicit reviewed expand/contract migration, not this baseline chain`,
    );
  }
}

console.log(
  `ME.zip migration validation: ${migrationNames.length} ordered additive migrations`,
);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length > 0) process.exitCode = 1;
