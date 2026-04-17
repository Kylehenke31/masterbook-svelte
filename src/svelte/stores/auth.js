import { writable } from 'svelte/store';
import { supabase } from '../lib/supabase.js';

/* ── Auth store ── */
export const authUser = writable(null);  // { id, email, user_metadata }
export const authLoading = writable(true);

/* ── Bootstrap: restore session on page load ── */
supabase.auth.getSession().then(({ data: { session } }) => {
  authUser.set(session?.user ?? null);
  authLoading.set(false);
});

/* ── Keep store in sync with Supabase auth state ── */
supabase.auth.onAuthStateChange((_event, session) => {
  authUser.set(session?.user ?? null);
  authLoading.set(false);
});

/* ── Auth actions ── */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/* ── Helpers ── */
export function getDisplayName(user) {
  return user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
}
