import React from 'react';
import FlamePaths from '../FlamePaths/FlamePaths.jsx';
import './TripleBackdrop.css';

const zones = [
  // The visual order follows the user's URL order: intro (5198), selfie
  // (5179), then the Portfolio/ME.zip card (5186).
  { id: 'green', source: '5198', label: '介绍绿区' },
  { id: 'blue', source: '5179', label: '自拍蓝区' },
  { id: 'orange', source: '5186', label: '橙色区' }
];

function Flame({ tone }) {
  return <FlamePaths tone={tone} />;
}

export default function TripleBackdrop() {
  return (
    <div className="triple-backdrop" aria-hidden="true">
      {zones.map(zone => (
        <section
          key={zone.id}
          className={`triple-zone triple-zone-${zone.id}`}
          data-source-port={zone.source}
          aria-label={zone.label}
        >
          <div className="zone-grid" />
          <Flame tone={zone.id} />
          <div className="zone-vignette" />
        </section>
      ))}
    </div>
  );
}

// A screen-space colour wash sits above the shared Canvas. Because it uses
// `mix-blend-mode: color` and is pointer-transparent, a tag crossing a zone
// is tinted by that zone (including only the portion currently inside it),
// while the three original pages remain untouched.
export function TripleColorFilters() {
  return (
    <div className="triple-color-filters" aria-hidden="true">
      <div className="triple-filter-zone triple-filter-zone-green" data-filter-source="5198" />
      <div className="triple-filter-zone triple-filter-zone-blue" data-filter-source="5179" />
      <div className="triple-filter-zone triple-filter-zone-orange" data-filter-source="5186" />
    </div>
  );
}
