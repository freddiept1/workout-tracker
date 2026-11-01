// Rest-timer alerts: a beep, a buzz where supported, and a notification when the app is in the background.
// iPhone limits: web apps can't vibrate, and can't run timers while the phone is locked, so the
// notification only appears if the app is still running (e.g. switched to another app briefly).

let ctx: AudioContext | null = null;

/** Call from a tap (ticking a set): iPhone only allows sound from audio unlocked by a user gesture. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function beep() {
  if (!ctx) return;
  const start = ctx.currentTime;
  [0, 0.25, 0.5].forEach((offset, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.frequency.value = i === 2 ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.2);
  });
}

export function buzz() {
  navigator.vibrate?.([200, 100, 200]);
}

export type NotifyState = 'unsupported' | 'default' | 'granted' | 'denied';

export function notifyState(): NotifyState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function askNotifications(): Promise<NotifyState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

export async function notifyRestOver(next: string) {
  if (notifyState() !== 'granted' || document.visibilityState === 'visible') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  const options = { body: next ? `Next: ${next}` : 'Time for your next set', tag: 'rest-timer' };
  if (reg) await reg.showNotification('Rest over', options);
  else new Notification('Rest over', options);
}
