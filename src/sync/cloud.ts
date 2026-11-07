// Supabase: sign-in with an emailed code, and the `records` table as the sync engine's Remote.
// The library is loaded only when it's needed, so the app opens just as fast without an account.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudProfile, CoachLink } from '../db/types';
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
  if (/schema cache|does not exist/i.test(message)) return 'The cloud needs an update before this works (run supabase/schema.sql again).';
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
  async pull(since: string | null, athleteId: string) {
    const sb = await supabase();
    const out: CloudRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = sb.from('records').select('athlete_id,kind,id,data,updated_at,deleted_at,synced_at').order('synced_at').order('id');
      q = q.eq('athlete_id', athleteId);
      if (since) q = q.gt('synced_at', since);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw new Error(friendly(error.message));
      out.push(...(data as CloudRow[]));
      if (data.length < PAGE) return out;
    }
  }
};

// ---------- Coach mode ----------

interface LinkRow {
  id: string; coach_id: string; client_id: string | null; name: string; invited_email: string | null; invite_code: string;
  status: CoachLink['status']; bodyweight_reminder: CoachLink['bodyweightReminder']; weekly_target: number | null;
  created_at: string; joined_at: string | null;
}
const toLink = (r: LinkRow): CoachLink => ({
  id: r.id, coachId: r.coach_id, clientId: r.client_id, name: r.name, invitedEmail: r.invited_email, inviteCode: r.invite_code,
  status: r.status, bodyweightReminder: r.bodyweight_reminder, weeklyTarget: r.weekly_target, createdAt: r.created_at, joinedAt: r.joined_at
});

async function check<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(friendly(error.message));
  return data;
}

export async function fetchProfile(uid: string): Promise<CloudProfile | null> {
  const rows = await check((await supabase()).from('profiles').select('id,name,role,consented_at').eq('id', uid));
  const p = (rows as { id: string; name: string | null; role: CloudProfile['role']; consented_at: string | null }[])[0];
  return p ? { id: p.id, name: p.name, role: p.role, consentedAt: p.consented_at } : null;
}

export async function saveMyName(uid: string, name: string) {
  await check((await supabase()).from('profiles').update({ name: name.trim() || null }).eq('id', uid));
}

/** Your links: as a coach, all your clients and invites; as a client, your coach (with their name). */
export async function fetchLinks(uid: string): Promise<CoachLink[]> {
  const sb = await supabase();
  const links = ((await check(sb.from('coach_clients').select('*').neq('status', 'removed').order('created_at'))) as LinkRow[]).map(toLink);
  const mine = links.filter((l) => l.clientId === uid);
  if (mine.length) {
    const names = (await check(sb.from('profiles').select('id,name').in('id', mine.map((l) => l.coachId)))) as { id: string; name: string | null }[];
    for (const l of mine) l.coachName = names.find((x) => x.id === l.coachId)?.name ?? null;
  }
  return links;
}

export async function createInvite(input: { name: string; invitedEmail: string | null; bodyweightReminder: CoachLink['bodyweightReminder']; weeklyTarget: number | null }): Promise<CoachLink> {
  const row = await check((await supabase()).from('coach_clients').insert({
    name: input.name.trim(), invited_email: input.invitedEmail?.trim() || null, bodyweight_reminder: input.bodyweightReminder, weekly_target: input.weeklyTarget
  }).select('*').single());
  return toLink(row as LinkRow);
}

export async function updateLink(id: string, patch: Partial<Pick<CoachLink, 'name' | 'bodyweightReminder' | 'weeklyTarget'>>) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.bodyweightReminder !== undefined) row.bodyweight_reminder = patch.bodyweightReminder;
  if (patch.weeklyTarget !== undefined) row.weekly_target = patch.weeklyTarget;
  await check((await supabase()).from('coach_clients').update(row).eq('id', id));
}

export async function cancelInvite(id: string) {
  await check((await supabase()).from('coach_clients').delete().eq('id', id));
}

/** Coach removes a client, or a client leaves their coach. */
export async function endCoaching(linkId: string) {
  await check((await supabase()).rpc('end_coaching', { link_id: linkId }));
}

export async function inviteInfo(code: string): Promise<{ coachName: string; clientName: string; status: string } | null> {
  const rows = (await check((await supabase()).rpc('invite_info', { code }))) as { coach_name: string; client_name: string; status: string }[];
  return rows[0] ? { coachName: rows[0].coach_name, clientName: rows[0].client_name, status: rows[0].status } : null;
}

export async function acceptInvite(code: string): Promise<string> {
  const rows = (await check((await supabase()).rpc('accept_invite', { code, consent: true }))) as { coach_name: string }[];
  return rows[0]?.coach_name ?? 'your coach';
}

export async function deleteMyAccount() {
  await check((await supabase()).rpc('delete_my_account'));
}
