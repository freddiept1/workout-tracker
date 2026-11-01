import { describe, expect, it } from 'vitest';
import type { Exercise, Session, SetEntry } from '../db/types';
import { bestLifts, dots, wilks } from './powerlifting';
import { bestByDate } from './progress';
import { findPRs, repMaxTable } from './prs';
import { epley, estimate1RM, rpePercent } from './strength';
import { addDays, calendarWeeks, isHardSet, regionShares, summariseWeek, weekStart, weeklyTonnage } from './weekly';

const ex = (id: string, p: Partial<Exercise> = {}): Exercise => ({ id, name: id, isCustom: false, tracking: 'strength', createdAt: '', updatedAt: '', deletedAt: null, ...p });
const exercises = new Map<string, Exercise>([
  ['squat', ex('squat', { muscles: [{ muscle: 'quads', pct: 45 }, { muscle: 'glutes', pct: 25 }, { muscle: 'adductors', pct: 15 }, { muscle: 'lower_back', pct: 10 }, { muscle: 'abs', pct: 5 }] })],
  ['paused-squat', ex('paused-squat', { parentId: 'squat' })],
  ['bench-press', ex('bench-press', { muscles: [{ muscle: 'chest', pct: 50 }, { muscle: 'triceps', pct: 25 }, { muscle: 'front_delts', pct: 25 }] })],
  ['deadlift', ex('deadlift')],
  ['block-pull', ex('block-pull')],
  ['20-m-sprint', ex('20-m-sprint', { tracking: 'sprint', muscles: [{ muscle: 'hamstrings', pct: 30 }] })],
  ['cmj', ex('cmj', { tracking: 'jump' })]
]);

let n = 0;
const set = (weightKg: number, reps: number, p: Partial<SetEntry> = {}): SetEntry =>
  ({ id: `s${++n}`, type: 'working', weightKg, reps, rpe: null, completedAt: null, ...p });
const session = (date: string, entries: [string, SetEntry[]][], id = date): Session => ({
  id, athleteId: 'me', date, startedAt: null, endedAt: null, templateId: null, notes: '', source: 'live',
  createdAt: date, updatedAt: date, deletedAt: null,
  exercises: entries.map(([exerciseId, sets], i) => ({ id: `${id}-${i}`, exerciseId, sets })),
  exerciseIds: [...new Set(entries.map(([e]) => e))]
});

describe('e1RM', () => {
  it('uses Epley without RPE', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 5)).toBeCloseTo(116.67, 2);
    expect(estimate1RM(100, 5, null)).toEqual({ value: 116.67, method: 'epley' });
  });

  it('uses the RPE chart when RPE is logged', () => {
    expect(rpePercent(1, 10)).toBe(100);
    expect(rpePercent(5, 8)).toBe(81.1);
    expect(rpePercent(3, 9)).toBe(89.2);
    expect(rpePercent(8, 10)).toBe(78.6);
    expect(rpePercent(12, 6.5)).toBe(58.6);
    expect(estimate1RM(160, 5, 8)).toEqual({ value: 197.29, method: 'rpe' });
    expect(estimate1RM(200, 1, 10)!.value).toBe(200);
  });

  it('refuses sets it can’t estimate', () => {
    expect(estimate1RM(100, 15, null)).toBeNull();
    expect(estimate1RM(0, 5, null)).toBeNull();
    expect(rpePercent(5, 5)).toBeNull();
  });
});

describe('PRs', () => {
  const history = [
    session('2026-10-01', [['squat', [set(140, 5), set(140, 5)]]]),
    session('2026-10-08', [['squat', [set(145, 5), set(140, 6)]]]),
    session('2026-10-15', [['squat', [set(150, 3, { rpe: 9 }), set(120, 8)]], ['20-m-sprint', [set(0, 4, { distanceM: 20 })]]]),
    session('2026-10-22', [['squat', [set(100, 5, { type: 'warmup' }), set(140, 5)]]])
  ];
  const prs = findPRs(history, exercises);

  it('treats the first session as a baseline', () => {
    expect(prs.get('2026-10-01')).toBeUndefined();
  });

  it('finds heaviest-weight, rep, e1RM and volume PRs', () => {
    const p = prs.get('2026-10-08')!;
    expect(p.find((x) => x.kind === 'weight')).toMatchObject({ value: 145, previous: 140 });
    expect(p.find((x) => x.kind === 'reps')).toMatchObject({ reps: 6, value: 140, previous: null }); // first time doing 6+
    expect(p.find((x) => x.kind === 'e1rm')!.value).toBeCloseTo(169.17, 2);
    expect(p.find((x) => x.kind === 'volume')).toMatchObject({ value: 1565, previous: 1400 });
  });

  it('reports rep PRs for lighter sets with more reps', () => {
    const p = prs.get('2026-10-15')!;
    // 150×3 @ RPE 9 estimates 168.2, below last week's 145×5 (169.2), so no e1RM PR.
    expect(p.map((x) => x.kind).sort()).toEqual(['reps', 'weight']);
    expect(p.find((x) => x.kind === 'reps')).toMatchObject({ reps: 8, value: 120 });
  });

  it('skips sessions with nothing new, ignores warm-ups and athletic work', () => {
    expect(prs.get('2026-10-22')).toBeUndefined();
    for (const list of prs.values()) expect(list.every((x) => x.exerciseId === 'squat')).toBe(true);
  });

  it('builds a rep-max table', () => {
    const table = repMaxTable(history, new Set(['squat']), exercises, 8);
    expect(table.map((r) => [r.reps, r.weightKg])).toEqual([[1, 150], [2, 150], [3, 150], [4, 145], [5, 145], [6, 140], [7, 120], [8, 120]]);
    expect(table[0]).toMatchObject({ actualReps: 3, date: '2026-10-15' });
  });

  it('can include variations in the rep-max table', () => {
    const withPaused = [...history, session('2026-10-29', [['paused-squat', [set(155, 1)]]])];
    expect(repMaxTable(withPaused, new Set(['squat', 'paused-squat']), exercises, 1)[0].weightKg).toBe(155);
  });
});

describe('rolling variations into a lift', () => {
  it('charts the best of each week, so lighter variation days don’t drag the trend down', () => {
    const s = [
      session('2026-10-19', [['squat', [set(150, 5)]]]),
      session('2026-10-22', [['paused-squat', [set(130, 3)]]]),
      session('2026-10-26', [['squat', [set(155, 5)]]]),
      session('2026-10-29', [['paused-squat', [set(135, 3)]]])
    ];
    const ids = new Set(['squat', 'paused-squat']);
    const heaviest = { label: '', unit: 'kg', combine: 'max' as const, value: (x: SetEntry) => x.weightKg };
    expect(bestByDate(s, ids, heaviest).map((p) => p.value)).toEqual([150, 130, 155, 135]);
    expect(bestByDate(s, ids, heaviest, true)).toEqual([{ date: '2026-10-19', value: 150 }, { date: '2026-10-26', value: 155 }]);
  });
});

describe('powerlifting scores', () => {
  it('matches published DOTS and Wilks coefficients', () => {
    expect(dots(700, 100, 'male')).toBeCloseTo(430.87, 1);
    expect(wilks(700, 100, 'male')).toBeCloseTo(426.0, 0);
    expect(dots(400, 60, 'female')).toBeCloseTo(443.42, 1);
    expect(wilks(400, 60, 'female')).toBeGreaterThan(dots(400, 60, 'female'));
  });

  it('clamps extreme bodyweights', () => {
    expect(dots(500, 250, 'male')).toBe(dots(500, 210, 'male'));
  });

  it('takes the best competition lifts, not partials', () => {
    const s = [
      session('2026-10-01', [['squat', [set(200, 1)]], ['bench-press', [set(130, 3)]], ['deadlift', [set(240, 1)]], ['block-pull', [set(280, 1)]]]),
      session('2026-10-08', [['paused-squat', [set(190, 2, { rpe: 9 })]]])
    ];
    const best = bestLifts(s, exercises);
    expect(best.deadlift.lifted?.weightKg).toBe(240);
    expect(best.squat.lifted?.weightKg).toBe(200);
    expect(best.squat.estimated?.e1rm).toBeCloseTo(206.07, 1); // 190×2 @ 9 (92.2%) beats the 200 single
    expect(best.bench.estimated?.e1rm).toBeCloseTo(143, 0);
  });
});

describe('weeks', () => {
  it('starts weeks on Monday', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // a Sunday
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('credits main movers fully and helpers by half, once per group', () => {
    const shares = regionShares(exercises.get('squat'));
    expect(shares.get('quads')).toBe(1); // quads 45 + adductors 15 -> still one set of quads
    expect(shares.get('glutes')).toBe(1);
    expect(shares.get('back')).toBe(0.5);
    expect(shares.has('core')).toBe(false); // 5% doesn't count
  });

  it('only counts working sets at RPE 7+ (or unrated) as hard', () => {
    const sq = exercises.get('squat');
    expect(isHardSet(set(100, 5), sq)).toBe(true);
    expect(isHardSet(set(100, 5, { rpe: 6.5 }), sq)).toBe(false);
    expect(isHardSet(set(100, 5, { type: 'warmup' }), sq)).toBe(false);
    expect(isHardSet(set(0, 4, { distanceM: 20 }), exercises.get('20-m-sprint'))).toBe(false);
  });

  it('summarises a week', () => {
    const s = [
      session('2026-10-26', [['squat', [set(100, 5, { type: 'warmup' }), set(140, 5), set(140, 5)]], ['bench-press', [set(100, 5)]]]),
      session('2026-10-28', [['20-m-sprint', [set(0, 4, { distanceM: 20, weightKg: null })]], ['cmj', [set(0, 5, { weightKg: null })]]]),
      session('2026-11-02', [['squat', [set(150, 5)]]])
    ];
    const w = summariseWeek(s, exercises, '2026-10-26');
    expect(w.sessions).toBe(2);
    expect(w.workingSets).toBe(5);
    expect(w.tonnageKg).toBe(1900);
    expect(w.hardSets.get('quads')).toBe(2);
    expect(w.hardSets.get('chest')).toBe(1);
    expect(w.athletic).toEqual({ sprintMetres: 80, jumps: 5, throws: 0 });
    expect(weeklyTonnage(s, exercises, '2026-11-02', 2).map((x) => x.tonnageKg)).toEqual([1900, 750]);
  });

  it('lays out the calendar', () => {
    const cal = calendarWeeks([session('2026-10-28', [])], '2026-11-01', 2);
    expect(cal.map((w) => w.start)).toEqual(['2026-10-19', '2026-10-26']);
    expect(cal[1].days.find((d) => d.date === '2026-10-28')?.trained).toBe(true);
  });
});
