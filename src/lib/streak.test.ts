import { describe, expect, it } from 'vitest';
import { streak } from './streak';

const s = (...dates: string[]) => dates.map((date) => ({ date }));

describe('streak', () => {
  it('is empty with no training', () => {
    expect(streak([], '2026-11-01')).toEqual({ current: 0, best: 0, lastDate: null, restDaysLeft: 0, trainByDate: null });
  });

  it('counts training days, not sessions', () => {
    expect(streak(s('2026-10-30', '2026-10-30', '2026-10-31'), '2026-11-01').current).toBe(2);
  });

  it('survives 2 rest days in a row, and breaks on the 3rd', () => {
    // Mon, (Tue, Wed off), Thu -> still going
    expect(streak(s('2026-10-26', '2026-10-29'), '2026-10-29').current).toBe(2);
    // Mon, (Tue, Wed, Thu off), Fri -> new streak
    expect(streak(s('2026-10-26', '2026-10-30'), '2026-10-30').current).toBe(1);
  });

  it('counts down the rest days you have left', () => {
    const history = s('2026-10-28', '2026-10-29');
    expect(streak(history, '2026-10-29')).toMatchObject({ current: 2, restDaysLeft: 2, trainByDate: '2026-11-01' });
    expect(streak(history, '2026-10-30').restDaysLeft).toBe(2); // first rest day, today still free
    expect(streak(history, '2026-10-31').restDaysLeft).toBe(1);
    expect(streak(history, '2026-11-01')).toMatchObject({ current: 2, restDaysLeft: 0 }); // train today to keep it
    expect(streak(history, '2026-11-02')).toMatchObject({ current: 0, trainByDate: null }); // ended
  });

  it('remembers the best streak', () => {
    const history = s('2026-09-01', '2026-09-02', '2026-09-04', '2026-09-07', '2026-09-20', '2026-10-30');
    expect(streak(history, '2026-10-31')).toMatchObject({ current: 1, best: 4 });
  });

  it('ignores sessions dated in the future', () => {
    expect(streak(s('2026-10-31', '2026-11-05'), '2026-11-01')).toMatchObject({ current: 1, lastDate: '2026-10-31' });
  });
});
