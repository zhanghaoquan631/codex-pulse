const githubStatus = document.querySelector('#github-status');
const githubMessage = document.querySelector('#github-message');
const githubConnect = document.querySelector('#github-connect');
const wechatStatus = document.querySelector('#wechat-status');
const wechatMessage = document.querySelector('#wechat-message');
const wechatRecords = document.querySelector('#wechat-records');

function apiError(payload, fallback) {
  return payload && typeof payload === 'object' && payload.error && typeof payload.error.message === 'string'
    ? payload.error.message
    : fallback;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    redirect: 'error',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...options,
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* a non-JSON host response is unavailable */ }
  if (!response.ok || !payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new Error(apiError(payload, 'ME.zip 连接服务尚未配置或当前会话未登录。'));
  }
  return payload.data;
}

async function refreshGitHub() {
  githubStatus.textContent = '正在检查';
  try {
    const connection = await request('/v1/creator/github/connection');
    if (connection === null) {
      githubStatus.textContent = '未连接';
      githubConnect.textContent = '连接 GitHub';
      return;
    }
    githubStatus.textContent = `已连接：${connection.accountLabel}`;
    githubConnect.textContent = '重新连接 GitHub';
  } catch (error) {
    githubStatus.textContent = '服务未配置';
    githubMessage.textContent = error instanceof Error ? error.message : '无法读取 GitHub 连接状态。';
  }
}

async function startGitHub() {
  githubConnect.disabled = true;
  githubMessage.textContent = '';
  try {
    const handoff = await request('/v1/creator/github/authorization');
    const popup = window.open(handoff.authorizationUrl, 'mezip-github-oauth', 'popup=yes,width=620,height=760,noopener,noreferrer');
    githubMessage.textContent = popup === null
      ? '浏览器阻止了 GitHub 授权窗口。请允许本页打开窗口后重试。'
      : 'GitHub 官方授权窗口已打开。完成后会返回 ME.zip；此页面不读取密码或令牌。';
  } catch (error) {
    githubMessage.textContent = error instanceof Error ? error.message : '无法启动 GitHub 授权。';
  } finally {
    githubConnect.disabled = false;
  }
}

async function completeGitHubFromCallback() {
  const query = new URLSearchParams(window.location.search);
  const code = query.get('github_oauth_code');
  const state = query.get('github_oauth_state');
  if (!code || !state) return;
  githubMessage.textContent = '正在确认 GitHub 授权…';
  try {
    const connection = await request('/v1/creator/github/authorization/complete', { method: 'POST', body: JSON.stringify({ code, state }) });
    history.replaceState({}, '', window.location.pathname);
    githubStatus.textContent = `已连接：${connection.accountLabel}`;
    githubMessage.textContent = 'GitHub 已连接。现在可在 ME.zip 的 Creator Lab 内导入已授权仓库。';
  } catch (error) {
    githubMessage.textContent = error instanceof Error ? error.message : 'GitHub 授权未完成。';
  }
}

async function refreshWeChat() {
  wechatStatus.textContent = '正在检查';
  try {
    const steps = await request('/v1/archive/steps?limit=30');
    const verified = Array.isArray(steps) ? steps.filter((entry) => entry && entry.source === 'WECHAT') : [];
    wechatRecords.replaceChildren();
    if (verified.length === 0) {
      const item = document.createElement('li');
      item.textContent = '尚未有服务器验证的微信运动步数。请在 ME.zip 小程序的“步数”页点击“连接微信运动”。';
      wechatRecords.append(item);
      wechatStatus.textContent = '未同步';
      return;
    }
    for (const record of verified) {
      const item = document.createElement('li');
      item.textContent = `${new Date(record.day).toLocaleDateString('zh-CN')} · ${record.steps.toLocaleString('zh-CN')} 步 · 微信运动已验证`;
      wechatRecords.append(item);
    }
    wechatStatus.textContent = `已验证 ${verified.length} 天`;
  } catch (error) {
    wechatStatus.textContent = '服务未配置';
    wechatMessage.textContent = error instanceof Error ? error.message : '无法读取微信运动同步状态。';
  }
}

document.querySelector('#github-connect').addEventListener('click', startGitHub);
document.querySelector('#github-refresh').addEventListener('click', refreshGitHub);
document.querySelector('#wechat-refresh').addEventListener('click', refreshWeChat);
await completeGitHubFromCallback();
await Promise.all([refreshGitHub(), refreshWeChat()]);
