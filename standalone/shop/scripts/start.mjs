import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { createApp } from '../server/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env.local');
if (!existsSync(envFile) && !process.env.ADMIN_PASSWORD) {
  writeFileSync(envFile, `ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}\nPORT=8787\n`, { flag: 'wx', mode: 0o600 });
  console.log('已生成独立管理密码，保存在 .env.local 文件的 ADMIN_PASSWORD 一行。');
}
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const found = line.match(/^([A-Z_]+)=(.*)$/);
    if (found && process.env[found[1]] === undefined) process.env[found[1]] = found[2].trim();
  }
}
if (!existsSync(path.join(root, 'dist/client/index.html'))) throw new Error('请先运行 npm run build。');
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD 至少需要 12 位。');
const port = Number(process.env.PORT || 8787);
const app = await createApp();
const server = app.listen(port, '0.0.0.0', () => {
  app.locals.resetMailer.start();
  console.log(`售卖页 http://localhost:${port}/`);
  console.log(`后台 http://localhost:${port}/manage`);
  for (const list of Object.values(networkInterfaces())) for (const addr of list || []) {
    if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) console.log(`局域网后台（同一网络） http://${addr.address}:${port}/manage`);
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('close', () => app.locals.resetMailer.stop());
