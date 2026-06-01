// ============================================================================
// Service-role Supabase client for the edge functions.
// ----------------------------------------------------------------------------
// The email tables are RLS-on / no-policy, so they can ONLY be read/written by
// the SERVICE ROLE (which bypasses RLS). This key is server-side only and must
// NEVER be shipped to the browser. Supabase injects SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY into edge functions automatically.
// ============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in the function environment.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
