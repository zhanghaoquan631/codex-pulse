export const qqLink = (qq) => `https://wpa.qq.com/msgrd?v=3&uin=${encodeURIComponent(qq)}&site=qq&menu=yes`;

export default function BackupQQ({ number }) {
  if (!number) return null;
  return <div className="backup-qq"><small>主 QQ 无法联系时，请使用备用 QQ</small><a href={qqLink(number)} target="_blank" rel="noreferrer">备用 QQ：{number}</a></div>;
}
