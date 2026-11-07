// Your Supabase project. Both values are public by design (they ship in every app download);
// the database's row-level security rules are what keep each person's data private.
// They can also be set at build time with VITE_SUPABASE_URL / VITE_SUPABASE_KEY.
const env = import.meta.env as Record<string, string | undefined>;

export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? 'https://ojeqayiaaahrrszjbxdn.supabase.co';
export const SUPABASE_KEY = env.VITE_SUPABASE_KEY ?? 'sb_publishable_7vOFKwEC8sTbzxxrnlHl0A_U8zyYfxE';

export const cloudConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);
