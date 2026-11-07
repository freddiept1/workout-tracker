// Comments on sessions: which are new to you. Pure.
import type { SessionComment } from '../db/types';

/**
 * Unread = written by someone else after you last opened that session's comments (on this phone).
 * Deleted comments never count. Returns counts per session id.
 */
export function unreadBySession(comments: SessionComment[], seen: Record<string, string>, myId: string | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!myId) return out;
  comments = comments.filter(isValidComment);
  for (const c of comments) {
    if (c.deletedAt || c.authorId === myId) continue;
    if (c.createdAt <= (seen[c.sessionId] ?? '')) continue;
    out.set(c.sessionId, (out.get(c.sessionId) ?? 0) + 1);
  }
  return out;
}

/** Unread counts per athlete ('me' or a client's account id). */
export function unreadByAthlete(comments: SessionComment[], seen: Record<string, string>, myId: string | null): Map<string, number> {
  const valid = comments.filter(isValidComment);
  const athleteOf = new Map(valid.map((c) => [c.sessionId, c.athleteId]));
  const out = new Map<string, number>();
  for (const [sessionId, n] of unreadBySession(valid, seen, myId)) {
    const athlete = athleteOf.get(sessionId)!;
    out.set(athlete, (out.get(athlete) ?? 0) + n);
  }
  return out;
}

/** A comment with everything the screens need (anything else is ignored rather than crashing them). */
export const isValidComment = (c: SessionComment) =>
  !!c && typeof c.athleteId === 'string' && typeof c.sessionId === 'string' && typeof c.body === 'string' && typeof c.createdAt === 'string';

/** "2 min ago", "3 h ago", "Tue 4 Nov". */
export function commentTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
