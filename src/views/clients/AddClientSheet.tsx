import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import type { BodyweightReminder, CoachLink } from '../../db/types';
import { formatCode, inviteMessage, inviteUrl } from '../../lib/invite';
import { refreshLinks } from '../../sync/controller';

/** Add a client: name, optional email, weekly target and weigh-in reminder. Then share the invite. */
export function AddClientSheet({ open, coachName, onClose }: { open: boolean; coachName: string | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [target, setTarget] = useState<number | null>(3);
  const [reminder, setReminder] = useState<BodyweightReminder>('weekly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CoachLink | null>(null);

  const close = () => {
    setName(''); setEmail(''); setTarget(3); setReminder('weekly'); setError(''); setCreated(null);
    onClose();
  };

  async function create() {
    setBusy(true);
    setError('');
    try {
      const { createInvite } = await import('../../sync/cloud');
      setCreated(await createInvite({ name, invitedEmail: email || null, weeklyTarget: target, bodyweightReminder: reminder }));
      void refreshLinks();
    } catch (err) {
      const msg = (err as Error).message;
      setError(/row-level security|violates/i.test(msg) ? 'Only a coach account can invite clients. See docs/CLOUD_SETUP.md, "Make your account the coach".' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title={created ? 'Invite ready' : 'Add a client'} onClose={close}>
      {created ? (
        <InviteBody link={created} coachName={coachName} />
      ) : (
        <>
          <div>
            <label htmlFor="client-name">Name</label>
            <input id="client-name" autoComplete="off" placeholder="e.g. Sam Taylor" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="client-email">Email (optional, for your records)</label>
            <input id="client-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <TargetPicker value={target} onChange={setTarget} />
          <ReminderPicker value={reminder} onChange={setReminder} />
          {error && <p className="error">{error}</p>}
          <button type="button" className="full" disabled={busy || !name.trim()} onClick={create}>Create invite</button>
        </>
      )}
    </Sheet>
  );
}

export function TargetPicker({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  return (
    <div>
      <label>Sessions per week</label>
      <div className="segmented">
        {[null, 2, 3, 4, 5, 6].map((n) => (
          <button type="button" key={n ?? 'none'} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>{n ?? 'None'}</button>
        ))}
      </div>
    </div>
  );
}

export function ReminderPicker({ value, onChange }: { value: BodyweightReminder; onChange: (r: BodyweightReminder) => void }) {
  return (
    <div>
      <label>Weigh-in reminder</label>
      <div className="segmented">
        {([['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly']] as const).map(([v, label]) => (
          <button type="button" key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

/** Re-share an invite that hasn't been accepted yet, or cancel it. */
export function ShareInvite({ link, coachName, onClose }: { link: CoachLink | null; coachName: string | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={!!link} title={link ? `Invite for ${link.name}` : ''} onClose={onClose}>
      {link && (
        <>
          <InviteBody link={link} coachName={coachName} />
          <button type="button" className="danger full" disabled={busy} onClick={async () => {
            if (!confirm(`Cancel ${link.name}’s invite? The code will stop working.`)) return;
            setBusy(true);
            try {
              const { cancelInvite } = await import('../../sync/cloud');
              await cancelInvite(link.id);
              await refreshLinks();
              onClose();
            } catch (err) {
              alert((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}>Cancel invite</button>
        </>
      )}
    </Sheet>
  );
}

function InviteBody({ link, coachName }: { link: CoachLink; coachName: string | null }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(link.inviteCode);
  const message = inviteMessage(link.name, coachName ?? 'me', link.inviteCode, url);
  const canShare = typeof navigator.share === 'function';
  return (
    <>
      <div className="invite-code" aria-label="Invite code">{formatCode(link.inviteCode)}</div>
      <p className="hint center">Send {link.name.split(' ')[0]} this message. The code works once, for one person.</p>
      <pre className="invite-message">{message}</pre>
      <div className="row">
        {canShare && (
          <button type="button" className="grow" onClick={() => navigator.share({ text: message }).catch(() => {})}>Share…</button>
        )}
        <button type="button" className={canShare ? 'ghost grow' : 'grow'} onClick={async () => {
          await navigator.clipboard.writeText(message);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}>{copied ? 'Copied ✓' : 'Copy message'}</button>
      </div>
    </>
  );
}
