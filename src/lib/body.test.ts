import { describe, expect, it } from 'vitest';
import type { Checkin, Metric } from '../db/types';
import {
  averageAt, bodyweightChange, bodyweightFor, checkinAverages, checkins, currentBodyweight, isComplete, movingAverage, readiness, roughPatch,
  weighIns, weighInDue
} from './body';

let n = 0;
const bw = (date: string, kg: number, updatedAt = `${date}T08:00:00Z`): Metric =>
  ({ id: `m${++n}`, athleteId: 'me', date, kind: 'bodyweight', bodyweightKg: kg, createdAt: updatedAt, updatedAt, deletedAt: null });
const ci = (date: string, c: Partial<Checkin>): Metric =>
  ({ id: `c${++n}`, athleteId: 'me', date, kind: 'checkin', checkin: { sleep: null, energy: null, soreness: null, stress: null, ...c }, createdAt: date, updatedAt: date, deletedAt: null });

describe('bodyweight', () => {
  const metrics = [bw('2026-10-01', 94), bw('2026-10-02', 93.4), bw('2026-10-02', 93.6, '2026-10-02T20:00:00Z'), bw('2026-10-05', 93), bw('2026-10-09', 92.4)];
  const entries = weighIns(metrics);

  it('keeps one weigh-in per day (the latest), oldest first, skipping deleted ones', () => {
    expect(entries.map((e) => [e.date, e.kg])).toEqual([['2026-10-01', 94], ['2026-10-02', 93.6], ['2026-10-05', 93], ['2026-10-09', 92.4]]);
    expect(weighIns([{ ...bw('2026-10-01', 90), deletedAt: 'x' }])).toEqual([]);
  });

  it('averages the last 7 days', () => {
    expect(averageAt(entries, '2026-10-05')).toBe(93.53); // 94, 93.6, 93
    expect(averageAt(entries, '2026-10-09')).toBe(92.7); // 93, 92.4 (1 and 2 Oct are more than 7 days back)
    expect(averageAt(entries, '2026-09-01')).toBeNull();
    expect(movingAverage(entries).map((e) => e.kg)).toEqual([94, 93.8, 93.53, 92.7]);
  });

  it('reports current bodyweight as the latest 7-day average', () => {
    expect(currentBodyweight(entries)).toEqual({ kg: 92.7, asOf: '2026-10-09' });
    expect(currentBodyweight([])).toBeNull();
  });

  it('uses logged weigh-ins for DOTS, falling back to the profile number', () => {
    expect(bodyweightFor(entries, 100)).toEqual({ kg: 92.7, asOf: '2026-10-09', logged: true });
    expect(bodyweightFor([], 100)).toEqual({ kg: 100, asOf: null, logged: false });
    expect(bodyweightFor([], null)).toBeNull();
  });

  it('measures the change over 4 weeks', () => {
    const series = [bw('2026-10-01', 95), bw('2026-10-29', 93)];
    expect(bodyweightChange(weighIns(series), '2026-10-29')).toBe(-2);
    expect(bodyweightChange(weighIns([bw('2026-10-29', 93)]), '2026-10-29')).toBeNull();
  });

  it('knows when a weigh-in is due', () => {
    const e = weighIns([bw('2026-11-02', 93)]); // a Monday
    expect(weighInDue('off', [], '2026-11-04')).toBe(false);
    expect(weighInDue('daily', [], '2026-11-04')).toBe(true);
    expect(weighInDue('daily', e, '2026-11-02')).toBe(false);
    expect(weighInDue('daily', e, '2026-11-03')).toBe(true);
    expect(weighInDue('weekly', e, '2026-11-08')).toBe(false); // same week (Sunday)
    expect(weighInDue('weekly', e, '2026-11-09')).toBe(true); // next Monday
  });
});

describe('check-ins', () => {
  it('scores readiness with soreness and stress flipped', () => {
    expect(readiness({ sleep: 5, energy: 5, soreness: 1, stress: 1 })).toBe(5);
    expect(readiness({ sleep: 1, energy: 1, soreness: 5, stress: 5 })).toBe(1);
    expect(readiness({ sleep: 4, energy: null, soreness: 2, stress: null })).toBe(4);
    expect(readiness({ sleep: null, energy: null, soreness: null, stress: null })).toBeNull();
  });

  it('knows when all four were answered', () => {
    expect(isComplete({ sleep: 3, energy: 3, soreness: 3, stress: null })).toBe(false);
    expect(isComplete({ sleep: 3, energy: 3, soreness: 3, stress: 3 })).toBe(true);
  });

  it('averages each answer over a date range', () => {
    const list = checkins([ci('2026-11-02', { sleep: 4, energy: 3 }), ci('2026-11-03', { sleep: 2, energy: 5, stress: 4 }), ci('2026-10-20', { sleep: 1 })]);
    expect(checkinAverages(list, '2026-11-02', '2026-11-08')).toEqual({ sleep: 3, energy: 4, soreness: null, stress: 4, count: 2 });
  });

  it('flags a rough patch: three recent poor check-ins', () => {
    const poor = { sleep: 2, energy: 3, soreness: 2, stress: 2 };
    const good = { sleep: 4, energy: 4, soreness: 2, stress: 2 };
    const list = checkins([ci('2026-11-01', poor), ci('2026-11-02', { ...good, stress: 5 }), ci('2026-11-03', poor)]);
    expect(roughPatch(list, '2026-11-03')).toBe(true);
    expect(roughPatch(checkins([ci('2026-11-01', poor), ci('2026-11-02', good), ci('2026-11-03', poor)]), '2026-11-03')).toBe(false);
    expect(roughPatch(list, '2026-11-10')).toBe(false); // too long ago
  });
});
