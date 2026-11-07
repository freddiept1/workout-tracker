import { useEffect, useState } from 'react';
import { useLinks, useMyCoach, useProfile } from '../../hooks';
import { cleanCode, isCodeShaped } from '../../lib/invite';
import { deleteAccount, refreshLinks, signedIn, signOutAndMaybeErase, syncNow, useSyncStatus } from '../../sync/controller';
import { PrivacyNotice } from '../clients/JoinSheet';

const ago = (iso: string | null) => {
  if (!iso) return 'not yet';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** Email → emailed code → signed in. Used here and when joining a coach. */
export function SignInForm() {
  const sync = useSyncStatus();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      {!sent ? (
        <div className="row">
          <input
            className="grow" type="email" inputMode="email" autoComplete="email" placeholder="you@email.com" aria-label="Email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <button type="button" disabled={busy || !/\S+@\S+\.\S+/.test(email)} onClick={() => run(async () => {
            const { sendCode } = await import('../../sync/cloud');
            await sendCode(email);
            setSent(true);
          })}>Send code</button>
        </div>
      ) : (
        <>
          <p className="hint account-intro">We emailed a code to <b>{email}</b>. Type it here (check spam if it isn’t there in a minute).</p>
          <div className="row">
            <input
              className="grow code-input" inputMode="numeric" autoComplete="one-time-code" placeholder="Code" aria-label="Code from the email"
              value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ''))}
            />
            <button type="button" disabled={busy || code.length < 6} onClick={() => run(async () => {
              const { verifyCode } = await import('../../sync/cloud');
              await signedIn(await verifyCode(email, code));
              setSent(false);
              setCode('');
            })}>Sign in</button>
          </div>
          <button type="button" className="link" onClick={() => { setSent(false); setCode(''); }}>Use a different email</button>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {sync.error && <p className="error">{sync.error}</p>}
    </>
  );
}

/** Settings → Account: sign in, sync status, your name, your coach, invite code, sign out, delete. */
export function AccountSection({ onInvite }: { onInvite: (code: string) => void }) {
  const sync = useSyncStatus();
  const profile = useProfile();
  const coach = useMyCoach();
  const links = useLinks();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [inviteText, setInviteText] = useState('');
  const [askInvite, setAskInvite] = useState(false);
  const [notice, setNotice] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  if (!sync.configured) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const inviteEntry = (
    <>
      {!askInvite ? (
        <button type="button" className="link" onClick={() => setAskInvite(true)}>Have an invite code?</button>
      ) : (
        <div className="row invite-entry">
          <input
            className="grow code-input" autoCapitalize="characters" autoComplete="off" placeholder="K7P2-QX9M" aria-label="Invite code"
            value={inviteText} onChange={(e) => setInviteText(e.target.value.toUpperCase())}
          />
          <button type="button" disabled={!isCodeShaped(inviteText)} onClick={() => { onInvite(cleanCode(inviteText)); setInviteText(''); setAskInvite(false); }}>Next</button>
        </div>
      )}
    </>
  );

  if (!sync.user) {
    return (
      <div>
        <label>Account</label>
        <p className="hint account-intro">Sign in to back up to the cloud and use the app on more than one device. Your training stays on this phone too, and works offline.</p>
        <SignInForm />
        {inviteEntry}
      </div>
    );
  }

  const line = {
    idle: `Synced ${ago(sync.lastSyncAt)}`,
    syncing: 'Syncing…',
    offline: `Offline. Last synced ${ago(sync.lastSyncAt)}; changes will sync when you have signal.`,
    error: 'Sync problem',
    'signed-out': ''
  }[sync.state];
  const isCoach = profile?.role === 'coach';
  const clientCount = links.filter((l) => l.coachId === profile?.id && l.status === 'active').length;

  return (
    <div>
      <label>Account</label>
      <div className="card account-card">
        <div className="grow">
          <div className="card-title">{sync.user.email}</div>
          <div className={'card-sub' + (sync.state === 'error' ? ' error' : '')}>{sync.state === 'idle' ? '✓ ' : ''}{line}</div>
          {sync.error && <div className="card-sub error">{sync.error}</div>}
        </div>
        <button type="button" className="ghost small" disabled={sync.state === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
      </div>

      {profile && (
        <div className="account-name">
          <label htmlFor="my-name" className="sub">Your name{isCoach ? ' (shown to clients)' : ''}</label>
          <input
            id="my-name" autoComplete="name" defaultValue={profile.name ?? ''} key={profile.name ?? ''}
            onBlur={(e) => {
              if (e.target.value.trim() === (profile.name ?? '')) return;
              void run(async () => {
                const { saveMyName } = await import('../../sync/cloud');
                await saveMyName(sync.user!.id, e.target.value);
                await syncNow();
              });
            }}
          />
        </div>
      )}
      {isCoach && <p className="hint">Coach account · {clientCount} client{clientCount === 1 ? '' : 's'}.</p>}

      {coach ? (
        <div className="card coach-card">
          <div className="grow">
            <div className="card-sub">Your coach</div>
            <div className="card-title">{coach.coachName ?? 'Your coach'}</div>
          </div>
          <button type="button" className="ghost small" disabled={busy} onClick={() => {
            if (!confirm(`Stop training with ${coach.coachName ?? 'your coach'}? They’ll no longer see your training. Your data stays yours.`)) return;
            void run(async () => {
              const { endCoaching } = await import('../../sync/cloud');
              await endCoaching(coach.id);
              await refreshLinks();
            });
          }}>Leave</button>
        </div>
      ) : (
        !isCoach && inviteEntry
      )}

      {!signingOut ? (
        <div className="row account-links">
          <button type="button" className="link" onClick={() => setSigningOut(true)}>Sign out…</button>
          <button type="button" className="link" onClick={() => setNotice(!notice)}>Privacy notice</button>
        </div>
      ) : (
        <div className="card">
          <p className="account-intro">Sign out of this device?</p>
          <div className="stack-sm">
            <button type="button" className="ghost full" disabled={busy} onClick={() => run(() => signOutAndMaybeErase(false))}>
              Sign out, keep my data on this phone
            </button>
            <button type="button" className="danger full" disabled={busy} onClick={() => run(async () => {
              if (confirm('Remove all training data from this phone? It syncs first, so your cloud copy keeps everything, and signing in again brings it back.')) {
                await signOutAndMaybeErase(true);
              }
            })}>
              Sign out and remove data from this phone
            </button>
            <button type="button" className="danger full" disabled={busy} onClick={() => run(async () => {
              if (!confirm('Delete your account? Everything stored in the cloud is deleted for good, and your coach (if you have one) can no longer see your training. This phone keeps its own copy.')) return;
              if (prompt('Type DELETE to confirm.') !== 'DELETE') return;
              await deleteAccount();
            })}>
              Delete my account and cloud data
            </button>
            <button type="button" className="link" onClick={() => setSigningOut(false)}>Cancel</button>
          </div>
        </div>
      )}
      {notice && <PrivacyNotice />}
      {error && <p className="error">{error}</p>}
      <p className="hint">Stored in Supabase’s London data centre. Only you{coach ? ' and your coach' : ''} can see your data.</p>
    </div>
  );
}
