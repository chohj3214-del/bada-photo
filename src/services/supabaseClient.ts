import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.");
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

let anonymousSessionPromise: Promise<void> | undefined;

/** Gives every device a stable authenticated ID without asking for email or password. */
export function ensureAnonymousSession() {
  if (!anonymousSessionPromise) {
    anonymousSessionPromise = (async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (session) {
        supabase.realtime.setAuth(session.access_token);
        return;
      }
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
    })().catch((error) => {
      anonymousSessionPromise = undefined;
      throw error;
    });
  }
  return anonymousSessionPromise;
}
