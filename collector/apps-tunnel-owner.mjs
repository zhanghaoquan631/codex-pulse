import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const validIdentity = value => value && Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.created === 'string' && /^\d+$/.test(value.created);

// Match Windows' argv quoting, including spaces in the private marker path.
export function windowsArgv(commandLine) {
  const result = []; let value = '', quoted = false, active = false;
  for (let index = 0; index < commandLine.length;) {
    const character = commandLine[index];
    if (!quoted && /\s/.test(character)) { if (active) { result.push(value); value = ''; active = false; } index++; continue; }
    if (character === '\\') {
      let end = index; while (commandLine[end] === '\\') end++;
      const count = end - index;
      if (commandLine[end] === '"') {
        value += '\\'.repeat(Math.floor(count / 2));
        if (count % 2) value += '"'; else quoted = !quoted;
        active = true; index = end + 1; continue;
      }
      value += '\\'.repeat(count); active = true; index = end; continue;
    }
    if (character === '"') { quoted = !quoted; active = true; index++; continue; }
    value += character; active = true; index++;
  }
  if (quoted) return [];
  if (active) result.push(value);
  return result;
}

const processScript = String.raw`
$ErrorActionPreference = 'Stop'
$request = $env:PULSE_OWNED_TUNNEL_REQUEST | ConvertFrom-Json
function Snapshot([int]$processId) {
  $target = $null
  try {
    try { $target = [Diagnostics.Process]::GetProcessById($processId) } catch [ArgumentException] { return $null }
    $handle = $target.SafeHandle
    $created = $target.StartTime.ToUniversalTime().Ticks.ToString()
    $info = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $processId)
    if ($target.HasExited) { return $null }
    if (-not $info -or -not $info.CommandLine -or -not $info.ExecutablePath) { throw 'Process identity cannot be inspected safely' }
    return @{ pid = $processId; created = $created; name = $info.Name; executable = $info.ExecutablePath; commandLine = $info.CommandLine; parentPid = [int]$info.ParentProcessId }
  } finally { if ($target) { $target.Dispose() } }
}
if ($request.mode -eq 'snapshot') { Snapshot ([int]$request.pid) | ConvertTo-Json -Compress; exit }
if ($request.mode -eq 'find') {
  $items = @(Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains([string]$request.marker) } | ForEach-Object { $item = Snapshot ([int]$_.ProcessId); if ($item) { $item } })
  ConvertTo-Json -InputObject $items -Compress -Depth 5; exit
}
if ($request.mode -ne 'kill') { throw 'Unsupported process operation' }
$target = $null
try {
  $expected = $request.expected
  try { $target = [Diagnostics.Process]::GetProcessById([int]$expected.pid) } catch { @{ status = 'missing' } | ConvertTo-Json -Compress; exit }
  # Pin the process handle before inspecting it so PID reuse cannot target another process.
  $handle = $target.SafeHandle
  if ($target.StartTime.ToUniversalTime().Ticks.ToString() -cne [string]$expected.created) { @{ status = 'identity-mismatch' } | ConvertTo-Json -Compress; exit }
  $live = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$expected.pid)
  if (-not $live -or $live.Name -ine 'cloudflared.exe' -or $live.ExecutablePath -ine [string]$expected.executable -or $live.CommandLine -cne [string]$expected.commandLine -or [int]$live.ParentProcessId -ne [int]$expected.parentPid) { @{ status = 'identity-mismatch' } | ConvertTo-Json -Compress; exit }
  if (-not $request.allowLiveOwner) {
    $owner = Snapshot ([int]$request.owner.pid)
    if ($owner -and $owner.created -ceq [string]$request.owner.created) { @{ status = 'owner-active' } | ConvertTo-Json -Compress; exit }
  }
  $target.Kill()
  if (-not $target.WaitForExit(5000)) { throw 'Owned tunnel did not exit' }
  @{ status = 'killed' } | ConvertTo-Json -Compress
} finally { if ($target) { $target.Dispose() } }
`;

export function windowsTunnelProcesses() {
  async function run(request) {
    if (process.platform !== 'win32') throw new Error('Owned tunnel process cleanup requires the Windows collector.');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(processScript, 'utf16le').toString('base64')], {
      windowsHide: true, timeout: 15000, maxBuffer: 512 * 1024,
      env: { ...process.env, PULSE_OWNED_TUNNEL_REQUEST: JSON.stringify(request) },
    });
    return stdout.trim() ? JSON.parse(stdout.replace(/^\uFEFF/, '')) : null;
  }
  return {
    snapshot: pid => run({ mode: 'snapshot', pid }),
    find: marker => run({ mode: 'find', marker }),
    kill: (expected, owner, allowLiveOwner) => run({ mode: 'kill', expected, owner, allowLiveOwner }),
  };
}

export class OwnedAppsTunnel {
  constructor(dataDir, options = {}) {
    this.dataDir = path.resolve(dataDir);
    this.file = path.join(this.dataDir, 'apps-tunnel-owner.json');
    this.processes = options.processes || windowsTunnelProcesses();
    this.ownerPid = options.ownerPid || process.pid;
    this.pending = Promise.resolve();
  }
  lock(callback) {
    const next = this.pending.catch(() => {}).then(callback);
    this.pending = next;
    return next;
  }
  async read() {
    let record;
    try { record = JSON.parse(await readFile(this.file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Owned tunnel record cannot be read safely.'); }
    const expectedMarker = path.join(this.dataDir, `apps-tunnel-${record.nonce}.pid`);
    if (record.version !== 1 || !UUID.test(record.nonce || '') || !samePath(record.dataDir, this.dataDir) || !samePath(record.marker, expectedMarker)
      || !validIdentity(record.owner) || !Number.isInteger(record.port) || record.port < 1 || record.port > 65535
      || typeof record.executable !== 'string' || !path.isAbsolute(record.executable) || path.basename(record.executable).toLowerCase() !== 'cloudflared.exe') throw new Error('Owned tunnel record is invalid.');
    return record;
  }
  async persist(record) {
    await mkdir(this.dataDir, { recursive: true });
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); } finally { await handle.close(); }
    try { await rename(temporary, this.file); } finally { await unlink(temporary).catch(() => {}); }
  }
  arguments(record) {
    return ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${record.port}`, '--protocol', 'http2', '--pidfile', record.marker];
  }
  matches(processInfo, record) {
    if (!validIdentity(processInfo) || processInfo.name?.toLowerCase() !== 'cloudflared.exe' || !samePath(processInfo.executable, record.executable) || processInfo.parentPid !== record.owner.pid || typeof processInfo.commandLine !== 'string') return false;
    const argv = windowsArgv(processInfo.commandLine);
    return samePath(argv[0], record.executable) && JSON.stringify(argv.slice(1)) === JSON.stringify(this.arguments(record));
  }
  async forgetRecord(nonce) {
    const current = await this.read();
    if (!current || current.nonce !== nonce) return;
    await unlink(current.marker).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await unlink(this.file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  forget(nonce) { return this.lock(() => this.forgetRecord(nonce)); }
  async cleanupRecord({ nonce } = {}) {
    const record = await this.read();
    if (!record) return { state: 'none' };
    const liveOwner = await this.processes.snapshot(record.owner.pid);
    const ownerAlive = validIdentity(liveOwner) && liveOwner.created === record.owner.created;
    const ownStop = nonce === record.nonce && record.owner.pid === this.ownerPid && ownerAlive;
    if (ownerAlive && !ownStop) throw new Error('A live collector still owns this tunnel.');
    const candidates = record.process ? [await this.processes.snapshot(record.process.pid)].filter(Boolean) : await this.processes.find(record.marker);
    for (const candidate of candidates) {
      if (!this.matches(candidate, record)) continue;
      if (record.process && (candidate.pid !== record.process.pid || candidate.created !== record.process.created || candidate.commandLine !== record.process.commandLine)) continue;
      const result = await this.processes.kill(candidate, record.owner, ownStop);
      if (!result || !['killed', 'missing', 'identity-mismatch'].includes(result.status)) throw new Error('Owned tunnel cleanup has not been confirmed.');
    }
    await this.forgetRecord(record.nonce);
    return { state: 'cleared' };
  }
  cleanup(options) { return this.lock(() => this.cleanupRecord(options)); }
  prepare(executable, port) { return this.lock(async () => {
    await this.cleanupRecord();
    const owner = await this.processes.snapshot(this.ownerPid);
    if (!validIdentity(owner)) throw new Error('Collector process identity cannot be verified.');
    const nonce = randomUUID();
    const record = { version: 1, dataDir: this.dataDir, nonce, port, executable: path.resolve(executable),
      owner: { pid: owner.pid, created: owner.created }, marker: path.join(this.dataDir, `apps-tunnel-${nonce}.pid`), process: null };
    // Persist the unique argv marker before spawning, including the short crash window before PID capture.
    await this.persist(record);
    return { record, args: this.arguments(record) };
  }); }
  capture(record, pid) { return this.lock(async () => {
    const current = await this.read();
    if (!current || current.nonce !== record.nonce) throw new Error('Tunnel ownership changed during startup.');
    const processInfo = await this.processes.snapshot(pid);
    if (!this.matches(processInfo, record)) throw new Error('Spawned tunnel identity cannot be verified.');
    record.process = processInfo;
    await this.persist(record);
  }); }
}
