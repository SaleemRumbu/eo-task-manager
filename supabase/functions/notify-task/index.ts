// Supabase Edge Function: notify-task
// ----------------------------------------------------------------------
// Fired by the app right after a task is created. It:
//   1) figures out who should be told  -> the admins assigned to that
//      unit PLUS every super admin, EXCLUDING the person who created the
//      task (the caller);
//   2) writes an in-app notification for each of them;
//   3) emails each of them via Resend.
//
// It runs with the service-role key, so it can read every profile and
// write notifications for other users without being blocked by RLS.
//
// Secrets you set on the function (Dashboard > Edge Functions > notify-task
// > Secrets):
//   RESEND_API_KEY   your Resend API key (required to actually send mail)
//   FROM_EMAIL       e.g.  ED1 Task Manager <tasks@rumbuindustries.com>
//   APP_URL          e.g.  https://your-app.vercel.app   (login link in the email)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
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
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "ED1 Task Manager <onboarding@resend.dev>";
    const APP_URL = Deno.env.get("APP_URL") || "";
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: "Server keys are not configured on the function." }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Identify the caller (the task creator) so we can leave them out.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let callerId: string | null = null;
    if (token) {
      const { data: { user } } = await admin.auth.getUser(token);
      callerId = user?.id ?? null;
    }

    // 2) Read the task.
    const { task_id } = await req.json();
    if (!task_id) return json({ error: "task_id is required." }, 400);

    const { data: task, error: taskErr } = await admin
      .from("tasks")
      .select("id, title, description, unit_id, due_date, priority, assigned_by")
      .eq("id", task_id)
      .single();
    if (taskErr || !task) return json({ error: "Task not found." }, 404);

    // Personal tasks (no unit) have no audience - nothing to do.
    if (!task.unit_id) return json({ skipped: "personal task, no unit" }, 200);

    const creatorId = callerId || task.assigned_by || null;

    // 3) Unit name (for the message).
    const { data: unit } = await admin
      .from("units").select("name").eq("id", task.unit_id).single();
    const unitName = unit?.name || "your unit";

    // 4) Creator name (for the message).
    let creatorName = "A colleague";
    if (creatorId) {
      const { data: cp } = await admin
        .from("profiles").select("full_name").eq("id", creatorId).single();
      if (cp?.full_name) creatorName = cp.full_name;
    }

    // 5) Recipients = admins linked to this unit + all super admins.
    const recipients = new Map<string, { id: string; email: string; name: string }>();

    const { data: links } = await admin
      .from("profile_units").select("profile_id").eq("unit_id", task.unit_id);
    const unitAdminIds = (links || []).map((l: any) => l.profile_id);

    if (unitAdminIds.length) {
      const { data: unitAdmins } = await admin
        .from("profiles").select("id, email, full_name").in("id", unitAdminIds);
      for (const p of unitAdmins || []) {
        if (p?.id) recipients.set(p.id, { id: p.id, email: p.email, name: p.full_name || "there" });
      }
    }

    const { data: supers } = await admin
      .from("profiles").select("id, email, full_name").eq("role", "superadmin");
    for (const p of supers || []) {
      if (p?.id) recipients.set(p.id, { id: p.id, email: p.email, name: p.full_name || "there" });
    }

    // Leave out whoever created the task.
    if (creatorId) recipients.delete(creatorId);

    const list = Array.from(recipients.values());
    if (!list.length) return json({ notified: 0, emailed: 0, note: "No recipients." }, 200);

    // 6) In-app notifications for everyone.
    const dueTxt = task.due_date ? " Due " + task.due_date + "." : "";
    const title = "New task for " + unitName + ": " + task.title;
    const body = creatorName + " created a task that needs your attention." + dueTxt;

    const noteRows = list.map((r) => ({
      user_id: r.id, title, body, type: "assigned", task_id: task.id, is_read: false,
    }));
    await admin.from("notifications").insert(noteRows);

    // 7) Emails via Resend (skipped cleanly if no key is set yet).
    let emailed = 0;
    if (RESEND_API_KEY) {
      const loginLink = APP_URL
        ? `<p style="margin:18px 0"><a href="${APP_URL}" style="background:#1F3864;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif">Open ED1 Task Manager</a></p>`
        : "";
      const dueRow = task.due_date ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Due</td><td>${task.due_date}</td></tr>` : "";
      const descRow = task.description ? `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">Details</td><td>${escapeHtml(task.description)}</td></tr>` : "";

      for (const r of list) {
        if (!r.email) continue;
        const html = `
          <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
            <h2 style="color:#1F3864;font-size:18px;margin:0 0 6px">New task needs your attention</h2>
            <p style="margin:0 0 14px">Hello ${escapeHtml(r.name)},</p>
            <p style="margin:0 0 14px"><strong>${escapeHtml(creatorName)}</strong> created a new task for
              <strong>${escapeHtml(unitName)}</strong>.</p>
            <table style="border-collapse:collapse;font-size:14px">
              <tr><td style="padding:4px 12px 4px 0;color:#555">Task</td><td><strong>${escapeHtml(task.title)}</strong></td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#555">Unit</td><td>${escapeHtml(unitName)}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#555">Priority</td><td>${escapeHtml(task.priority || "medium")}</td></tr>
              ${dueRow}
              ${descRow}
            </table>
            ${loginLink}
            <p style="margin:18px 0 0;color:#888;font-size:12px">RUMBU INDUSTRIES GROUP &middot; ED1 Task Manager</p>
          </div>`;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [r.email],
            subject: title,
            html,
          }),
        });
        if (res.ok) emailed++;
        else console.error("Resend failed for " + r.email + ": " + (await res.text()));
      }
    }

    return json({ notified: list.length, emailed }, 200);
  } catch (err) {
    return json({ error: "Unexpected error: " + String(err) }, 500);
  }
});

function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
