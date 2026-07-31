import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// detectSessionInUrl defaults to true, which makes the client scan every
// page load for a `?code=` param and try to treat it as its own OAuth
// callback. This app only ever uses email/password auth, but a `?code=`
// shows up anyway from the Dropbox connect redirect (dropbox.js) — without
// this off, Supabase grabs that code first and the auth session breaks.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: false },
});
