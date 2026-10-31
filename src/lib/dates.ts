function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Sat, 31 Oct 2026" */
export const longDate = (iso: string) =>
  toDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** "31 Oct" */
export const shortDate = (iso: string) => toDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
