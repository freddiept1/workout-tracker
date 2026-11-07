import { describe, expect, it } from 'vitest';
import type { SessionComment } from '../db/types';
import { commentTime, unreadByAthlete, unreadBySession } from './comments';

let n = 0;
const c = (sessionId: string, authorId: string, createdAt: string, athleteId = 'me', deletedAt: string | null = null): SessionComment =>
  ({ id: `c${++n}`, athleteId, sessionId, authorId, authorName: null, body: 'hi', createdAt, updatedAt: createdAt, deletedAt });

describe('unread comments', () => {
  const list = [
    c('s1', 'coach', '2026-11-07T10:00:00Z'),
    c('s1', 'me-uid', '2026-11-07T10:05:00Z'), // mine: never unread
    c('s1', 'coach', '2026-11-07T11:00:00Z'),
    c('s2', 'coach', '2026-11-06T09:00:00Z'),
    c('s2', 'coach', '2026-11-06T09:30:00Z', 'me', '2026-11-06T10:00:00Z') // deleted
  ];

  it('counts others’ comments since you last looked', () => {
    expect(unreadBySession(list, {}, 'me-uid')).toEqual(new Map([['s1', 2], ['s2', 1]]));
    expect(unreadBySession(list, { s1: '2026-11-07T10:30:00Z' }, 'me-uid')).toEqual(new Map([['s1', 1], ['s2', 1]]));
    expect(unreadBySession(list, { s1: '2026-11-07T12:00:00Z', s2: '2026-11-07T00:00:00Z' }, 'me-uid').size).toBe(0);
    expect(unreadBySession(list, {}, null).size).toBe(0); // signed out
  });

  it('adds them up per athlete', () => {
    const coachView = [c('a', 'client-1', '2026-11-07T10:00:00Z', 'client-1'), c('a', 'client-1', '2026-11-07T10:01:00Z', 'client-1'), c('b', 'client-2', '2026-11-07T10:00:00Z', 'client-2')];
    expect(unreadByAthlete(coachView, {}, 'coach')).toEqual(new Map([['client-1', 2], ['client-2', 1]]));
  });

  it('formats times', () => {
    const now = Date.parse('2026-11-07T12:00:00Z');
    expect(commentTime('2026-11-07T11:59:30Z', now)).toBe('just now');
    expect(commentTime('2026-11-07T11:15:00Z', now)).toBe('45 min ago');
    expect(commentTime('2026-11-07T09:00:00Z', now)).toBe('3 h ago');
  });
});

describe('bad comment records', () => {
  it('are ignored instead of crashing the counts', () => {
    const broken = { id: 'x', sessionId: 's9', authorId: 'coach', body: 'hi', createdAt: '2026-11-07T10:00:00Z' } as unknown as SessionComment; // no athleteId
    const ok = c('s1', 'coach', '2026-11-07T10:00:00Z', 'client-1');
    expect(unreadByAthlete([broken, ok], {}, 'me-uid')).toEqual(new Map([['client-1', 1]]));
    expect(unreadBySession([broken, { ...ok, body: undefined } as unknown as SessionComment], {}, 'me-uid').size).toBe(0);
  });
});
