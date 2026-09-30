import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { billingProfile } from '../integration/local-apps/billing-profiles.mjs';

const fail = (message, status = 503) => Object.assign(new Error(message), { status });
const launchError = () => fail('未能启动对应的 Chrome 个人资料，请在原电脑检查 Chrome 后重试。');
const billingUrl = 'https://chatgpt.com/settings/billing';

// Only standard Chrome install locations, never PATH, request parameters,
// Chrome Local State, profile files, cookies, or stored credentials.
function chromePaths(environment) {
  const roots = [
    environment.ProgramFiles || 'C:\\Program Files',
    environment['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    environment.LOCALAPPDATA,
  ].filter(root => typeof root === 'string' && path.win32.isAbsolute(root));
  return [...new Set(roots.map(root => path.win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')))];
}

export async function openChromeBilling(email, dependencies = {}) {
  const profile = billingProfile(email);
  if (!profile) throw fail('此邮箱尚未授权对应的 Chrome 个人资料，未打开账单页面。', 403);
  if ((dependencies.platform ?? process.platform) !== 'win32')
    throw fail('此功能需要原电脑上的 Windows Chrome，未打开账单页面。');
  const inspect = dependencies.stat || stat;
  let executable;
  try {
    for (const candidate of chromePaths(dependencies.environment || process.env)) {
      try { if ((await inspect(candidate)).isFile()) { executable = candidate; break; } }
      catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    }
  } catch { throw fail('无法检查原电脑的 Chrome 安装，请检查文件权限后重试。'); }
  if (!executable) throw fail('原电脑未找到 Chrome，请先安装 Chrome 后重试。');
  const launch = dependencies.spawn || spawn;
  await new Promise((resolve, reject) => {
    let child;
    try {
      child = launch(executable, [`--profile-directory=${profile.directory}`, billingUrl], {
        shell: false, windowsHide: true, detached: true, stdio: 'ignore',
      });
      // Keep an error handler after spawn; late process failures must not crash
      // the collector. Successful spawn only confirms launch, not page identity.
      child.on('error', () => reject(launchError()));
      child.once('spawn', () => {
        try { child.unref(); resolve(); } catch { reject(launchError()); }
      });
    } catch { reject(launchError()); }
  });
  const expectedEmail = email.toLowerCase();
  return { email: expectedEmail, profileLabel: profile.label, expectedEmail, opened: true };
}
