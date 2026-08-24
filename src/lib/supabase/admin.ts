import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only. Uses the service role key, which bypasses Row Level Security.
// Never import this from a Client Component or expose it to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
