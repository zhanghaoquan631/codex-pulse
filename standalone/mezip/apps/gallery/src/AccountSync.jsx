export default function AccountSync({ cloud }) {
  return <div className="quest-account">
    <span>{cloud.user ? cloud.user.email : '账号进度同步'}</span>
    <small role="status">{cloud.message}</small>
    <div>{!cloud.user && <a href="/account/#login" target="_blank" rel="noreferrer">登录同一账号</a>}
      <button disabled={cloud.busy} onClick={cloud.enabled || !cloud.user ? cloud.refresh : cloud.connect}>
        {cloud.busy ? '正在同步…' : cloud.enabled ? '同步进度' : cloud.user ? '合并本地进度并开启同步' : '我已登录，检查账号'}
      </button></div>
  </div>;
}
