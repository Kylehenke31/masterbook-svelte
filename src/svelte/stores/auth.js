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

/**
 * captchaToken is the Turnstile token from the signup form, when a human check
 * is configured. It is passed to Supabase rather than checked here on purpose:
 * anything this file could verify, a script skips by calling the API directly.
 * Supabase validates it server-side and refuses the signup if it does not hold
 * up — which is the only place a check like this means anything.
 */
export async function signUp(email, password, displayName, phone, captchaToken) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Both land on raw_user_meta_data, which the handle_new_user trigger
      // reads when it creates the profile row.
      data: { display_name: displayName, phone },
      ...(captchaToken ? { captchaToken } : {}),
    },
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
