import { describe, expect, it } from 'vitest';
import type { Exercise, Metric, Program, Session } from '../db/types';
import { ALERT_ORDER, missedWeighIn, summariseClient, type ClientInput } from './roster';

const squat = { id: 'squat', name: 'Squat', tracking: 'strength' } as Exercise;
const exercises = new Map([[squat.id, squat]]);
let n = 0;
const session = (date: string, kg = 100, reps = 5): Session => ({
  id: `s${++n}`, athleteId: 'c', date, startedAt: null, endedAt: null, templateId: null, notes: '', source: 'live',
  exerciseIds: ['squat'],
  exercises: [{ id: `e${n}`, exerciseId: 'squat', sets: [{ id: `x${n}`, type: 'working', weightKg: kg, reps, rpe: null, completedAt: null }] }],
  createdAt: date, updatedAt: date, deletedAt: null
});
const bw = (date: string, kg: number): Metric => ({ id: `b${++n}`, athleteId: 'c', date, kind: 'bodyweight', bodyweightKg: kg, createdAt: date, updatedAt: date, deletedAt: null });
const ci = (date: string, v: number): Metric => ({ id: `c${++n}`, athleteId: 'c', date, kind: 'checkin', checkin: { sleep: v, energy: v, soreness: 6 - v, stress: 6 - v }, createdAt: date, updatedAt: date, deletedAt: null });

const base = (p: Partial<ClientInput>): ClientInput => ({
  sessions: [], metrics: [], programs: [], exercises, reminder: 'weekly', target: null, joinedAt: '2026-09-01T10:00:00Z', today: '2026-11-07', ...p
});
const kinds = (p: Partial<ClientInput>) => summariseClient(base(p)).alerts.map((a) => a.kind);

describe('roster', () => {
  it('flags a client with no workout for a week', () => {
    expect(kinds({ sessions: [session('2026-10-30')] })).toContain('inactive');
    expect(summariseClient(base({ sessions: [session('2026-10-30')] })).alerts[0].text).toBe('No workout for 8 days');
    expect(kinds({ sessions: [session('2026-11-02')] })).not.toContain('inactive');
    expect(kinds({ sessions: [], joinedAt: '2026-11-05T09:00:00Z' })).not.toContain('inactive'); // only just joined
  });

  it('flags falling behind the weekly target only when it can no longer be hit', () => {
    // Saturday 7 Nov: 2 days left (Sat, Sun).
    expect(kinds({ sessions: [session('2026-11-03')], target: 4 })).toContain('behind'); // needs 3 more in 2 days
    expect(kinds({ sessions: [session('2026-11-03')], target: 3 })).not.toContain('behind'); // 2 more in 2 days is possible
    expect(summariseClient(base({ sessions: [session('2026-11-03'), session('2026-11-05')], target: 3 })).thisWeek).toBe(2);
  });

  it('counts PRs this week as good news', () => {
    const s = summariseClient(base({ sessions: [session('2026-10-20', 100), session('2026-11-06', 110)] }));
    expect(s.prsThisWeek).toBeGreaterThan(0);
    expect(s.alerts.find((a) => a.kind === 'pr')).toEqual({ kind: 'pr', text: 'PR this week: Squat', good: true });
    expect(s.prsThisWeek).toBe(1); // one lift, however many kinds of record it broke
  });

  it('flags stalled lifts', () => {
    const flat = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-05'];
    const sessions = flat.map((d, i) => session(d, i === 1 ? 120 : 110));
    expect(summariseClient(base({ sessions })).alerts.find((a) => a.kind === 'stalled')?.text).toMatch(/^Squat stalled for \d+ weeks$/);
  });

  it('summarises bodyweight, check-ins and rough patches', () => {
    const metrics = [bw('2026-10-08', 80), bw('2026-11-06', 78.5), ci('2026-11-05', 2), ci('2026-11-06', 2), ci('2026-11-07', 1)];
    const s = summariseClient(base({ metrics, sessions: [session('2026-11-06')] }));
    expect(s.bodyweight).toEqual({ kg: 78.5, change: -1.5 });
    expect(s.readiness).toBe(1.7);
    expect(s.alerts.map((a) => a.kind)).toContain('rough');
    const order = s.alerts.map((a) => ALERT_ORDER.indexOf(a.kind));
    expect(order).toEqual([...order].sort((a, b) => a - b)); // worst first
  });

  it('flags missed weigh-ins by reminder', () => {
    expect(missedWeighIn('off', null, '2026-11-07', 100)).toBe(false);
    expect(missedWeighIn('daily', '2026-11-05', '2026-11-07', 100)).toBe(false);
    expect(missedWeighIn('daily', '2026-11-04', '2026-11-07', 100)).toBe(true);
    expect(missedWeighIn('weekly', '2026-10-30', '2026-11-07', 100)).toBe(false);
    expect(missedWeighIn('weekly', '2026-10-28', '2026-11-07', 100)).toBe(true);
    expect(missedWeighIn('weekly', null, '2026-11-07', 3)).toBe(false); // new client
  });

  it('shows where they are in their program', () => {
    const program = {
      id: 'p', athleteId: 'c', name: 'Block', weeks: 2, deloadEvery: 0, maxes: {}, status: 'active', startedAt: null,
      days: [{ id: 'a', name: 'Day A', exercises: [] }, { id: 'b', name: 'Day B', exercises: [] }],
      log: { w1d1: { sessionId: 's', date: '2026-11-02', skipped: false } }, createdAt: '', updatedAt: '', deletedAt: null
    } as unknown as Program;
    expect(summariseClient(base({ programs: [program] })).program).toEqual({ name: 'Block', next: 'Week 1 · Day B', done: 1, total: 4 });
  });
});
