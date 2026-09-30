import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { OwnedAppsTunnel, windowsArgv, windowsTunnelProcesses } from './apps-tunnel-owner.mjs';

const commandLine = (executable, args) => [executable, ...args].map(value => /\s/.test(value) ? `"${value}"` : value).join(' ');
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pulse-owned-tunnel-test-'));
  const table = new Map([[10, { pid: 10, created: '100' }], [20, { pid: 20, created: '200' }]]);
  const kills = [];
  const processes = {
    snapshot: async pid => table.get(pid) || null,
    find: async marker => [...table.values()].filter(info => info.commandLine?.includes(marker)),
    kill: async (expected, owner, allowLiveOwner) => {
      const live = table.get(expected.pid), liveOwner = table.get(owner.pid);
      if (liveOwner?.created === owner.created && !allowLiveOwner) return { status: 'owner-active' };
      if (!live) return { status: 'missing' };
      if (JSON.stringify(live) !== JSON.stringify(expected)) return { status: 'identity-mismatch' };
      kills.push(expected.pid); table.delete(expected.pid); return { status: 'killed' };
    },
  };
  const first = new OwnedAppsTunnel(directory, { processes, ownerPid: 10 });
  const next = new OwnedAppsTunnel(directory, { processes, ownerPid: 20 });
  const executable = path.join(directory, 'cloudflared.exe');
  const lease = await first.prepare(executable, 43872);
  const child = { pid: 123, created: '12300', parentPid: 10, executable, name: 'cloudflared.exe', commandLine: commandLine(executable, lease.args) };
  table.set(child.pid, child);
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('pulse-owned-tunnel-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, table, processes, kills, first, next, lease, child, executable };
}

test('Windows command-line parser preserves quoted paths and rejects unfinished quotes', () => {
  assert.deepEqual(windowsArgv('"C:\\Program Files\\cloudflared.exe" tunnel --pidfile "C:\\My Data\\owned.pid"'), ['C:\\Program Files\\cloudflared.exe', 'tunnel', '--pidfile', 'C:\\My Data\\owned.pid']);
  assert.deepEqual(windowsArgv('cloudflared.exe "unfinished'), []);
});

test('new collector kills only an exact recorded orphan, leaving other tunnels untouched', async t => {
  const f = await fixture(t); await f.first.capture(f.lease.record, f.child.pid);
  f.table.set(999, { ...f.child, pid: 999, created: '99900', commandLine: f.child.commandLine.replace('43872', '9999') });
  f.table.delete(10);
  await f.next.cleanup();
  assert.deepEqual(f.kills, [123]); assert.ok(f.table.has(999)); assert.equal(await f.next.read(), null);
});

test('live owning collector blocks cleanup and prevents a second tunnel from being started', async t => {
  const f = await fixture(t); await f.first.capture(f.lease.record, f.child.pid);
  await assert.rejects(f.next.prepare(f.executable, 43872), /live collector/);
  assert.deepEqual(f.kills, []); assert.equal((await f.first.read()).process.pid, f.child.pid);
});

test('recycled PID cannot kill another process even when executable and arguments happen to match', async t => {
  const f = await fixture(t); await f.first.capture(f.lease.record, f.child.pid); f.table.delete(10);
  f.table.set(f.child.pid, { ...f.child, created: '999999' });
  await f.next.cleanup();
  assert.deepEqual(f.kills, []); assert.ok(f.table.has(f.child.pid)); assert.equal(await f.next.read(), null);
});

test('changed command line or executable does not qualify as an owned process', async t => {
  const f = await fixture(t); await f.first.capture(f.lease.record, f.child.pid); f.table.delete(10);
  f.table.set(f.child.pid, { ...f.child, commandLine: f.child.commandLine.replace('43872', '43873') });
  await f.next.cleanup(); assert.deepEqual(f.kills, []); assert.ok(f.table.has(f.child.pid));
});

test('durable marker recovers a child when the parent crashed before PID metadata was persisted', async t => {
  const f = await fixture(t);
  assert.equal((await f.first.read()).process, null);
  assert.ok((await readFile(f.first.file, 'utf8')).includes(f.lease.record.nonce));
  f.table.set(999, { ...f.child, pid: 999, created: '99900', commandLine: f.child.commandLine.replace('43872', '9999') });
  f.table.delete(10);
  await f.next.cleanup(); assert.deepEqual(f.kills, [123]); assert.ok(f.table.has(999));
});

test('normal stop can clean its own child; stale exit notification cannot clear a newer record', async t => {
  const f = await fixture(t); await f.first.capture(f.lease.record, f.child.pid);
  await f.first.cleanup({ nonce: f.lease.record.nonce }); assert.deepEqual(f.kills, [123]);
  const newer = await f.first.prepare(f.executable, 43872);
  await f.first.forget(f.lease.record.nonce);
  assert.equal((await f.first.read()).nonce, newer.record.nonce);
});

test('unverifiable owner or changed identity at kill time fails safely', async t => {
  const f = await fixture(t); await f.first.capture(f.lease.record, f.child.pid);
  const inspect = f.processes.snapshot;
  f.processes.snapshot = async pid => { if (pid === 10) throw new Error('inspection-unavailable'); return inspect(pid); };
  await assert.rejects(f.next.cleanup(), /inspection-unavailable/); assert.deepEqual(f.kills, []);
  assert.equal((await f.first.read()).process.pid, 123);
  f.processes.snapshot = inspect; f.table.delete(10);
  f.processes.kill = async () => ({ status: 'identity-mismatch' });
  await f.next.cleanup(); assert.deepEqual(f.kills, []); assert.ok(f.table.has(123));
});

test('Windows identity provider can inspect this test process without changing any process', { skip: process.platform !== 'win32' }, async () => {
  const current = await windowsTunnelProcesses().snapshot(process.pid);
  assert.equal(current.pid, process.pid); assert.match(current.created, /^\d+$/);
  assert.equal(current.name.toLowerCase(), 'node.exe'); assert.ok(current.commandLine);
});
