import { useEffect, useState } from 'react';
import { signedIn, signOutAndMaybeErase, syncNow, useSyncStatus } from '../../sync/controller';

const ago = (iso: string | null) => {
  if (!iso) return 'not yet';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** Settings → Account: sign in with an emailed code, sync status, sign out. */
export function AccountSection() {
  const sync = useSyncStatus();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  if (!sync.configured) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (!sync.user) {
    return (
      <div>
        <label>Account</label>
        {!sent ? (
          <>
            <p className="hint account-intro">Sign in to back up to the cloud and use the app on more than one device. Your training stays on this phone too, and works offline.</p>
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
          </>
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
      {!signingOut ? (
        <button type="button" className="link" onClick={() => setSigningOut(true)}>Sign out…</button>
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
            <button type="button" className="link" onClick={() => setSigningOut(false)}>Cancel</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}
      <p className="hint">Stored in Supabase’s London data centre. Only you can see your data.</p>
    </div>
  );
}
