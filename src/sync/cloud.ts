// Supabase: sign-in with an emailed code, and the `records` table as the sync engine's Remote.
// The library is loaded only when it's needed, so the app opens just as fast without an account.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Remote } from './engine';
import type { CloudRow } from './merge';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

let client: Promise<SupabaseClient> | null = null;

export function supabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'fb-training-auth' }
    })
  );
  return client;
}

export interface CloudUser {
  id: string;
  email: string;
}

/** The signed-in account, from the saved session (works offline). */
export async function currentUser(): Promise<CloudUser | null> {
  const { data } = await (await supabase()).auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? '' } : null;
}

/** Emails a one-time code. New emails get an account automatically. */
export async function sendCode(email: string) {
  const { error } = await (await supabase()).auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw new Error(friendly(error.message));
}

export async function verifyCode(email: string, code: string): Promise<CloudUser> {
  const { data, error } = await (await supabase()).auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'email' });
  if (error || !data.user) throw new Error(friendly(error?.message ?? 'That code didn’t work.'));
  return { id: data.user.id, email: data.user.email ?? email };
}

export async function signOut() {
  await (await supabase()).auth.signOut({ scope: 'local' });
}

/** Deletes everything you've synced to the cloud (your phone keeps its copy). */
export async function deleteCloudData(uid: string) {
  const { error } = await (await supabase()).from('records').delete().eq('athlete_id', uid);
  if (error) throw new Error(friendly(error.message));
}

function friendly(message: string): string {
  if (/rate limit|too many/i.test(message)) return 'Too many codes asked for. Wait a few minutes and try again.';
  if (/expired|invalid/i.test(message)) return 'That code is wrong or has expired. Ask for a new one.';
  if (/fetch|network/i.test(message)) return 'No connection. Try again when you have signal.';
  return message;
}

const PAGE = 1000;
const CHUNK = 400;

export const supabaseRemote: Remote = {
  async push(rows: CloudRow[]) {
    const sb = await supabase();
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await sb.from('records').upsert(rows.slice(i, i + CHUNK), { onConflict: 'athlete_id,kind,id' });
      if (error) throw new Error(friendly(error.message));
    }
  },
  async pull(since: string | null) {
    const sb = await supabase();
    const out: CloudRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = sb.from('records').select('athlete_id,kind,id,data,updated_at,deleted_at,synced_at').order('synced_at').order('id');
      if (since) q = q.gt('synced_at', since);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw new Error(friendly(error.message));
      out.push(...(data as CloudRow[]));
      if (data.length < PAGE) return out;
    }
  }
};
