import { describe, expect, it } from 'vitest';
import { exerciseIdFor } from './ids';
import { formatWeight, fromKg, parseNumber, toKg } from './units';

describe('units', () => {
  it('stores kg unchanged', () => {
    expect(toKg(97.5, 'kg')).toBe(97.5);
    expect(formatWeight(97.5, 'kg')).toBe('97.5');
  });

  it('round-trips pounds through kg storage', () => {
    for (const lb of [45, 97.5, 225, 315, 405, 500.5]) {
      expect(formatWeight(toKg(lb, 'lb'), 'lb')).toBe(String(lb));
    }
  });

  it('converts 100 kg to about 220.46 lb', () => {
    expect(fromKg(100, 'lb')).toBeCloseTo(220.46, 2);
  });

  it('parses typed numbers, including comma decimals', () => {
    expect(parseNumber('80,5')).toBe(80.5);
    expect(parseNumber(' 100 ')).toBe(100);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('.')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('-5')).toBeNull();
  });

  it('shows nothing for a missing weight', () => {
    expect(formatWeight(null, 'kg')).toBe('');
  });
});

describe('exercise ids', () => {
  it('ignores capitals and spacing', () => {
    expect(exerciseIdFor('Bench Press')).toBe('bench-press');
    expect(exerciseIdFor('  bench   press ')).toBe('bench-press');
    expect(exerciseIdFor('Pull-up')).toBe('pull-up');
  });

  it('gives names without letters a stable id', () => {
    expect(exerciseIdFor('💪')).toMatch(/^ex-/);
    expect(exerciseIdFor('💪')).toBe(exerciseIdFor('💪'));
    expect(exerciseIdFor('💪')).not.toBe(exerciseIdFor('🏋️'));
  });
});
