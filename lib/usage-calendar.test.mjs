import assert from 'node:assert/strict';
import test from 'node:test';
import { usageCalendar, usageMonths } from './usage-calendar.ts';

test('aligns active dates with Monday-first columns and leaves unused days blank', () => {
  const cells = usageCalendar('2026-09', { '2026-09-01': 100, '2026-09-07': 200, '2026-09-08': 0 });
  assert.deepEqual(cells[1], { day: '2026-09-01', date: 1, value: 100 });
  assert.equal(cells[7]?.day, '2026-09-07');
  assert.equal(cells[0], null);
  assert.equal(cells[8], null);
  assert.equal(cells.filter(Boolean).length, 2);
  assert.equal(cells.length, 35);
});

test('handles leap day and a six-week month without shifting dates', () => {
  const leap = usageCalendar('2024-02', { '2024-02-29': 1 });
  assert.equal(leap.findIndex(day => day?.date === 29) % 7, 3);
  const sixWeeks = usageCalendar('2026-03', { '2026-03-01': 1, '2026-03-31': 2 });
  assert.equal(sixWeeks.length, 42);
  assert.equal(sixWeeks[6]?.date, 1);
  assert.equal(sixWeeks[36]?.date, 31);
});

test('keeps every historical month with usage, excludes zero-only dates', () => {
  assert.deepEqual(usageMonths({ '2024-01-01': 1, '2026-09-20': 2, '2026-09-21': 3, '2025-02-01': 0 }), ['2024-01', '2026-09']);
  assert.equal(usageCalendar('2026-09', {}).every(cell => cell === null), true);
});
