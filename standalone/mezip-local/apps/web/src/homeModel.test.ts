import { describe, expect, it } from 'vitest';

import { createActions, routeForQuickAction, todayMetrics } from './homeModel.js';

describe('home skeleton contract', () => {
  it('keeps the frozen creation actions and does not fabricate personal values', () => {
    expect(createActions).toHaveLength(7);
    expect(todayMetrics.map((metric) => metric.value)).toEqual([
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
    ]);
  });

  it('routes each visible quick action to its matching record surface', () => {
    expect(routeForQuickAction('记录生活')).toBe('/life');
    expect(routeForQuickAction('写读书感悟')).toBe('/history');
    expect(routeForQuickAction('记录健身')).toBe('/fitness');
    expect(routeForQuickAction('发动态')).toBe('/community');
  });
});
