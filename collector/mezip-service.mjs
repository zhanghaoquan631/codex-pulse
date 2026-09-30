import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// The local transport deliberately bypasses HTTP proxy settings. It cannot be
// redirected, and neither the cloud nor the browser can choose its destination.
export function requestLocalCapture(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const encoded = body == null ? undefined : JSON.stringify(body);
    const request = http.request({ hostname: '127.0.0.1', port: 4319, path: requestPath, method,
      headers: { Accept: 'application/json', ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded) } : {}) },
      timeout: 10000,
    }, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1_750_000) { response.destroy(); reject(new Error('response-too-large')); }
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve({ status: response.statusCode || 502, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch { reject(new Error('invalid-local-response')); }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('local-timeout')));
    request.end(encoded);
  });
}

function portOccupied() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 4319 });
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(true));
  });
}

export class LocalCaptureSupervisor {
  constructor() { this.nextStart = 0; this.child = null; this.startState = 'offline'; }

  async ensure(config = {}) {
    try {
      const health = await requestLocalCapture('GET', '/v1/x/local-capture/health');
      if (health.status === 200 && health.body?.data?.active === true && health.body.data.mode === 'LOCAL_CAPTURE') {
        return { online: true, state: 'connected' };
      }
      return { online: false, state: 'unrecognized-local-service' };
    } catch { /* A stopped backend is recovered below. No personal data is logged. */ }
    if (await portOccupied()) return { online: false, state: 'local-service-unresponsive' };
    if (this.child?.exitCode === null || Date.now() < this.nextStart) return { online: false, state: this.startState };
    this.nextStart = Date.now() + 30000;
    const root = typeof config.mezipRoot === 'string' && path.isAbsolute(config.mezipRoot)
      ? config.mezipRoot : path.join(os.homedir(), 'Documents', 'Codex', '2026-08-16', 'x-github-ai', 'work', 'me-zip');
    const directory = path.join(root, 'services', 'social-connectors');
    const entry = path.join(directory, 'dist', 'local-capture-server.js');
    try { await access(entry); } catch { return { online: false, state: 'backend-files-unavailable' }; }
    this.startState = 'starting';
    try {
      const child = spawn(process.execPath, ['--experimental-transform-types', entry], {
        cwd: directory, detached: true, windowsHide: true, stdio: 'ignore',
        env: { ...process.env, MEZIP_X_CAPTURE_PORT: '4319' },
      });
      this.child = child;
      child.once('error', () => { this.startState = 'backend-start-failed'; this.child = null; });
      child.once('exit', () => { this.startState = 'backend-start-failed'; this.child = null; });
      child.unref();
      return { online: false, state: 'starting' };
    } catch { this.startState = 'backend-start-failed'; return { online: false, state: this.startState }; }
  }
}
