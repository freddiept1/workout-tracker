export function newId(): string {
  return crypto.randomUUID();
}

/**
 * Exercise ids are slugs of the name ("Bench Press" -> "bench-press"), so the same lift typed with
 * different capitals is one exercise, and the Phase 2 library can match migrated exercises by id.
 */
export function exerciseIdFor(name: string): string {
  const key = name.trim().toLowerCase();
  const slug = key
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;
  // Names with no letters or digits (e.g. only emoji) get a stable hash instead.
  let h = 0;
  for (const ch of key) h = (Math.imul(h, 31) + ch.codePointAt(0)!) | 0;
  return 'ex-' + (h >>> 0).toString(36);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Today's date (local time) as YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
