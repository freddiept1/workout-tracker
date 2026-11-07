import { useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { formatCode } from '../../lib/invite';
import { PRIVACY_NOTICE, PRIVACY_UPDATED } from '../../lib/privacy';
import { refreshLinks, syncNow, useSyncStatus } from '../../sync/controller';
import { SignInForm } from '../settings/AccountSection';

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIPhoneSafari = () => /iP(hone|ad|od)/.test(navigator.userAgent) && !standalone();

/** A client joining their coach: who invited them, sign in, agree to the privacy notice, join. */
export function JoinSheet({ code, onClose }: { code: string | null; onClose: () => void }) {
  return (
    <Sheet open={!!code} title="Join your coach" onClose={onClose}>
      {code && <JoinBody code={code} onClose={onClose} />}
    </Sheet>
  );
}

function JoinBody({ code, onClose }: { code: string; onClose: () => void }) {
  const sync = useSyncStatus();
  const [info, setInfo] = useState<{ coachName: string; clientName: string; status: string } | null | undefined>(undefined);
  const [consent, setConsent] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState<string | null>(null);
  const [inBrowser, setInBrowser] = useState(false);

  useEffect(() => {
    import('../../sync/cloud').then(({ inviteInfo }) => inviteInfo(code)).then(setInfo).catch((err) => { setInfo(null); setError((err as Error).message); });
  }, [code]);

  if (joined) {
    return (
      <>
        <p className="join-lead">You’re training with <b>{joined}</b>. 💪</p>
        <p className="hint">Your workouts, weigh-ins and check-ins now sync to your account, and {joined.split(' ')[0]} can follow your progress.</p>
        <button type="button" className="full" onClick={onClose}>Start training</button>
      </>
    );
  }
  if (info === undefined) return <p className="hint">Checking your invite…</p>;
  if (!info) return <p className="error">{error || 'That invite code wasn’t found. Check it with your coach.'}</p>;
  if (info.status !== 'invited') return <p className="error">That invite has already been used or cancelled. Ask {info.coachName} for a new one.</p>;

  // In Safari on an iPhone, get the app on the home screen first: the installed app keeps its own data.
  if (isIPhoneSafari() && !inBrowser) {
    return (
      <>
        <p className="join-lead"><b>{info.coachName}</b> has invited you to train with them.</p>
        <ol className="join-steps">
          <li>Tap the <b>Share</b> button at the bottom of Safari.</li>
          <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          <li>Open <b>FB Training</b> from your home screen, go to Settings → Account → <b>Have an invite code?</b> and enter:</li>
        </ol>
        <div className="invite-code">{formatCode(code)}</div>
        <button type="button" className="link" onClick={() => setInBrowser(true)}>Use it in the browser instead</button>
      </>
    );
  }

  return (
    <>
      <p className="join-lead">Hi {info.clientName.split(' ')[0]}! <b>{info.coachName}</b> has invited you to train with them.</p>
      {!sync.user ? (
        <>
          <p className="hint">First, sign in with your email. We’ll email you a code (no password needed).</p>
          <SignInForm />
        </>
      ) : (
        <>
          <p className="hint">Signed in as {sync.user.email}.</p>
          <label className="toggle consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I agree to {info.coachName} (Freddie Butler Personal Training) storing my training, bodyweight and check-ins to coach me, as described in the{' '}
              <button type="button" className="link inline" onClick={() => setShowNotice(!showNotice)}>privacy notice</button>.
            </span>
          </label>
          {showNotice && <PrivacyNotice />}
          {error && <p className="error">{error}</p>}
          <button type="button" className="full" disabled={!consent || busy} onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const { acceptInvite } = await import('../../sync/cloud');
              setJoined(await acceptInvite(code));
              await refreshLinks();
              void syncNow();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}>Join {info.coachName.split(' ')[0]}</button>
        </>
      )}
    </>
  );
}

export function PrivacyNotice() {
  return (
    <div className="privacy">
      {PRIVACY_NOTICE.map((s) => (
        <div key={s.heading}>
          <b>{s.heading}</b>
          <p>{s.body}</p>
        </div>
      ))}
      <p className="hint">Last updated {PRIVACY_UPDATED}.</p>
    </div>
  );
}
