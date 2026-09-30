import { useSiteVersion } from './useSiteVersion.mjs';
import './siteVersion.css';

export default function SiteVersion() {
  const { status, remoteVersion, check } = useSiteVersion();
  const update = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('gallery-release', remoteVersion || String(Date.now()));
    window.location.replace(url.href);
  };
  return <aside className={'site-version ' + (status === 'update' ? 'has-update' : '')} aria-label="网页版本">
    <span>当前 R6 · 设置与锁定</span>
    <span role="status">{status === 'update' ? '网站有新版，当前页面尚未更新' : status === 'error' ? '未能检查更新' : status === 'checking' ? '检查版本中…' : '已是最新网页版本'}</span>
    {status === 'update' ? <button onClick={update}>刷新到新版</button> : <button onClick={check}>检查更新</button>}
    {status === 'update' && <small>刷新会退出本轮操作，已完成积分保留在此浏览器。</small>}
  </aside>;
}
