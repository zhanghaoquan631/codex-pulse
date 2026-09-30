// Disposable browser QA only. Never point this at the owner's live data.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';

const directory = await mkdtemp(path.join(os.tmpdir(), 'seller-browser-qa-'));
const app = await createApp({
  storePath: path.join(directory, 'store.json'), uploadsPath: path.join(directory, 'uploads'),
  adminPassword: 'local-browser-qa-password', secureCookies: false, mailEnv: {},
});
const server = app.listen(0, '127.0.0.1', () => {
  console.log(`Disposable QA shop: http://127.0.0.1:${server.address().port}`);
  console.log('Login password: local-browser-qa-password (test fixture only)');
});
async function stop() {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('seller-browser-qa-')) throw new Error('Unsafe QA cleanup target');
  await rm(resolved, { recursive: true, force: true });
}
process.once('SIGINT', () => stop().catch(() => { process.exitCode = 1; }));
process.once('SIGTERM', () => stop().catch(() => { process.exitCode = 1; }));
