// Supabase Edge Function: create-admin  (revised)
// ----------------------------------------------------------------------
// Creates an admin auth user + profile with a temporary password.
// Verifies the caller is a super admin using ONLY the service-role key,
// so it does not depend on SUPABASE_ANON_KEY being present.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase
// automatically - you do not set any secrets.
// ----------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: "Server keys are not configured on the function." }, 500);
    }

    // One admin client (service-role). It can both validate the caller's
    // token and perform the privileged create.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Identify the caller from their bearer token.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "No sign-in token was received. Please sign out and in again." }, 401);

    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return json({ error: "Could not verify your sign-in. Please sign out and in again." }, 401);

    // 2) Confirm the caller is a super admin.
    const { data: caller, error: callerErr } = await admin
      .from("profiles").select("role").eq("id", user.id).single();
    if (callerErr) return json({ error: "Could not read your profile: " + callerErr.message }, 500);
    if (!caller || caller.role !== "superadmin") return json({ error: "Only a super admin can create admins." }, 403);

    // 3) Validate input.
    const { full_name, email, unit_id, temp_password } = await req.json();
    if (!full_name?.trim() || !email?.trim() || !unit_id || !temp_password?.trim())
      return json({ error: "All fields are required." }, 400);

    // 4) Create the auth account.
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: temp_password.trim(),
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    });
    if (authError) return json({ error: authError.message }, 400);

    // 5) Create the profile row.
    const { error: profileError } = await admin.from("profiles").insert({
      id: authUser.user.id,
      full_name: full_name.trim(),
      role: "admin",
      unit_id,
      email: email.trim().toLowerCase(),
      temp_password: temp_password.trim(),
      must_change_password: true,
    });
    if (profileError) {
      // Roll back the auth user so the email can be reused.
      await admin.auth.admin.deleteUser(authUser.user.id);
      return json({ error: "Profile could not be saved: " + profileError.message }, 500);
    }

    return json({ success: true }, 200);
  } catch (err) {
    return json({ error: "Unexpected error: " + String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
