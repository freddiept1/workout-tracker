import { useState } from 'react';
import { db } from '../db/db';
import { addComment, deleteComment } from '../db/repo';
import type { Session, SessionComment } from '../db/types';
import { useProfile } from '../hooks';
import { commentTime } from '../lib/comments';

/** Comments under a session in History: coach and client, in order, with a box to add one. */
export function CommentThread({ session, comments, otherName }: {
  session: Pick<Session, 'id' | 'athleteId'>;
  comments: SessionComment[];
  /** Who you're talking to (shown in the placeholder). */
  otherName: string | null;
}) {
  const profile = useProfile();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (!profile) return null;

  async function send() {
    setBusy(true);
    setError('');
    try {
      await addComment(db, session, text, { id: profile!.id, name: profile!.name });
      setText('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="comments">
      <div className="comments-head">💬 Comments</div>
      {comments.length === 0 && <p className="hint">No comments yet.</p>}
      {comments.map((c) => {
        const mine = c.authorId === profile.id;
        return (
          <div key={c.id} className={'comment' + (mine ? ' mine' : '')}>
            <div className="comment-meta">
              <b>{mine ? 'You' : c.authorName ?? otherName ?? 'Coach'}</b> · {commentTime(c.createdAt)}
              {mine && (confirmDelete === c.id ? (
                <button type="button" className="link inline danger-link" onClick={() => { void deleteComment(db, c.id); setConfirmDelete(null); }}>Tap again to delete</button>
              ) : (
                <button type="button" className="link inline" aria-label="Delete comment" onClick={() => setConfirmDelete(c.id)}>Delete</button>
              ))}
            </div>
            <div className="comment-body">{c.body}</div>
          </div>
        );
      })}
      <div className="comment-new">
        <textarea
          rows={2} maxLength={2000} placeholder={otherName ? `Comment for ${otherName.split(' ')[0]}…` : 'Add a comment…'} aria-label="New comment"
          value={text} onChange={(e) => setText(e.target.value)}
        />
        <button type="button" disabled={busy || !text.trim()} onClick={send}>Send</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
