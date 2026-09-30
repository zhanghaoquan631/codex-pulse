import './WorkspaceEntrances.css';

const ENTRIES = [
  {
    id: 'booking',
    label: '预约系统',
    href: '/booking/'
  },
  {
    id: 'gallery',
    label: '无限影像墙',
    href: '/infinite-gallery/'
  },
  {
    id: 'visitors',
    label: '访客记录',
    href: '/playground/#simple-graph'
  }
];

export default function WorkspaceEntrances() {
  return (
    <nav className="workspace-entrances" aria-label="已登录工作台入口">
      {ENTRIES.map(entry => (
        <a
          className={`workspace-entrance workspace-entrance-${entry.id}`}
          href={entry.href}
          key={entry.id}
          rel="noreferrer"
          target="_blank"
        >
          {entry.label}
        </a>
      ))}
    </nav>
  );
}
