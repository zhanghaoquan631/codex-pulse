import React, { useState } from 'react';
import './TopBadgeDeck.css';

const badges = [
  { id: 'green', label: '绿色个人徽牌', source: '5198', asset: 'top-badge-green.png', accent: '#4fe0b0' },
  { id: 'blue', label: '蓝色个人徽牌', source: '5179', asset: 'top-badge-blue.png', accent: '#5e8dff' },
  { id: 'orange', label: '橙色个人徽牌', source: '5186', asset: 'top-badge-orange.png', accent: '#ff942f' }
];

function TopBadge({ badge }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`top-badge-shell top-badge-${badge.id}${collapsed ? ' is-collapsed' : ''}`}
      style={{ '--badge-accent': badge.accent }}
      data-badge-source={badge.source}
    >
      <span className="top-badge-thread" aria-hidden="true" />
      <span className="top-badge-hole" aria-hidden="true" />
      <div className="top-badge-art">
        <img src={`${import.meta.env.BASE_URL}assets/${badge.asset}`} alt={badge.label} draggable="false" />
      </div>
      <button
        type="button"
        className="top-badge-toggle"
        aria-label={collapsed ? `放下${badge.label}` : `收起${badge.label}`}
        aria-pressed={collapsed}
        onClick={() => setCollapsed(value => !value)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

export default function TopBadgeDeck() {
  return (
    <section className="top-badge-deck" aria-label="三个区域顶部的个人徽牌">
      {badges.map(badge => (
        <div className={`top-badge-slot top-badge-slot-${badge.id}`} key={badge.id}>
          <TopBadge badge={badge} />
        </div>
      ))}
    </section>
  );
}
