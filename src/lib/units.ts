import type { Unit } from '../db/types';

export const LB_PER_KG = 2.2046226218;

/** Convert a weight typed in `unit` to kilograms for storage. */
export function toKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : round(value / LB_PER_KG, 4);
}

/** Convert stored kilograms to `unit` for display. */
export function fromKg(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG;
}

/** Display text for a stored weight: at most 2 decimals, no trailing zeros ("97.5", "225"). */
export function formatWeight(kg: number | null, unit: Unit): string {
  if (kg === null) return '';
  return String(round(fromKg(kg, unit), 2));
}

/** Parse weight/reps text as typed; empty or invalid text gives null. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
