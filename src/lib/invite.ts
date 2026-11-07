// Invite links and codes for coach mode.

/** "K7P2QX9M" → "K7P2-QX9M" (easier to read out or type). */
export const formatCode = (code: string) => code.replace(/[^A-Z0-9]/gi, '').toUpperCase().replace(/^(.{4})(.+)$/, '$1-$2');

/** What people type: drop spaces/dashes, upper-case. */
export const cleanCode = (text: string) => text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export const isCodeShaped = (text: string) => cleanCode(text).length === 8;

export function inviteUrl(code: string, base = `${location.origin}${import.meta.env.BASE_URL}`): string {
  return `${base}?invite=${cleanCode(code)}`;
}

/** The message the coach sends (WhatsApp, text, email). */
export function inviteMessage(clientName: string, coachName: string, code: string, url: string): string {
  const first = clientName.trim().split(/\s+/)[0];
  return [
    `Hi ${first}, here's your invite to train with ${coachName} in the Freddie Butler Training app.`,
    '',
    `1. Open this link in Safari: ${url}`,
    '2. Tap the Share button, then "Add to Home Screen".',
    `3. Open the app from your home screen and enter invite code ${formatCode(code)}.`
  ].join('\n');
}

/** Reads ?invite=CODE from the address (and removes it, so a refresh doesn't ask again). */
export function takeInviteFromUrl(): string | null {
  const params = new URLSearchParams(location.search);
  const code = params.get('invite');
  if (!code) return null;
  params.delete('invite');
  const rest = params.toString();
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
  return isCodeShaped(code) ? cleanCode(code) : null;
}
