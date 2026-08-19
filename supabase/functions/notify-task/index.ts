// Supabase Edge Function: notify-task
// ----------------------------------------------------------------------
// Called by the app when something happens to a UNIT task. It writes an
// in-app notification and sends an email to the right people.
//
// Body: { task_id: string, event?: "created" | "rejected" | "approved" | "reminder" }
//   created  (default) -> tell the unit's admins AND the super admin(s)
//   rejected/approved  -> tell the unit's admins (the people who act on it)
//   reminder           -> tell the unit's admins
// The person who triggered it (the caller) is always left out.
//
// Runs with the service-role key, so it can read every profile and write
// notifications for other users without being blocked by RLS.
//
// Secrets (Dashboard > Edge Functions > notify-task > Secrets):
//   RESEND_API_KEY   your Resend API key (required to actually send mail)
//   FROM_EMAIL       e.g.  ED1 Task Manager <tasks@rumbuindustries.com>
//   APP_URL          e.g.  https://your-app.vercel.app
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

    // 1) Identify the caller so we can leave them out.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let callerId: string | null = null;
    if (token) {
      const { data: { user } } = await admin.auth.getUser(token);
      callerId = user?.id ?? null;
    }

    // 2) Read the task and the event.
    const { task_id, event = "created" } = await req.json();
    if (!task_id) return json({ error: "task_id is required." }, 400);

    const { data: task, error: taskErr } = await admin
      .from("tasks")
      .select("id, title, description, unit_id, due_date, priority, assigned_by, rejection_note")
      .eq("id", task_id)
      .single();
    if (taskErr || !task) return json({ error: "Task not found." }, 404);

    // Personal tasks (no unit) have no audience - nothing to do.
    if (!task.unit_id) return json({ skipped: "personal task, no unit" }, 200);

    const actorId = callerId || task.assigned_by || null;

    // 3) Unit name and actor name (for the message).
    const { data: unit } = await admin
      .from("units").select("name").eq("id", task.unit_id).single();
    const unitName = unit?.name || "your unit";

    let actorName = "A colleague";
    if (actorId) {
      const { data: ap } = await admin
        .from("profiles").select("full_name").eq("id", actorId).single();
      if (ap?.full_name) actorName = ap.full_name;
    }

    // 4) Recipients.
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

    // Super admins are only added for a brand-new task.
    if (event === "created") {
      const { data: supers } = await admin
        .from("profiles").select("id, email, full_name").eq("role", "superadmin");
      for (const p of supers || []) {
        if (p?.id) recipients.set(p.id, { id: p.id, email: p.email, name: p.full_name || "there" });
      }
    }

    if (actorId) recipients.delete(actorId);
    const list = Array.from(recipients.values());
    if (!list.length) return json({ notified: 0, emailed: 0, note: "No recipients." }, 200);

    // 5) Message per event.
    const dueTxt = task.due_date ? " Due " + task.due_date + "." : "";
    let title: string, body: string, type: string, heading: string, intro: string;
    if (event === "rejected") {
      type = "rejected";
      title = "Task rejected: " + task.title;
      heading = "A task report was rejected";
      intro = actorName + " rejected the report for this " + unitName + " task. Please revise and resubmit.";
      body = intro + (task.rejection_note ? " Reason: " + task.rejection_note : "");
    } else if (event === "approved") {
      type = "approved";
      title = "Task approved: " + task.title;
      heading = "A task report was approved";
      intro = actorName + " approved the report for this " + unitName + " task.";
      body = intro;
    } else if (event === "reminder") {
      type = "reminder";
      title = "Reminder: " + task.title;
      heading = "A task needs your attention";
      intro = "This " + unitName + " task is awaiting your attention." + dueTxt;
      body = intro;
    } else {
      type = "assigned";
      title = "New task for " + unitName + ": " + task.title;
      heading = "New task needs your attention";
      intro = actorName + " created a new task for " + unitName + "." + dueTxt;
      body = actorName + " created a task that needs your attention." + dueTxt;
    }

    // 6) In-app notifications for everyone.
    const noteRows = list.map((r) => ({
      user_id: r.id, title, body, type, task_id: task.id, is_read: false,
    }));
    await admin.from("notifications").insert(noteRows);

    // 7) Emails via Resend (skipped cleanly if no key is set yet).
    let emailed = 0;
    if (RESEND_API_KEY) {
      const loginLink = APP_URL
        ? `<p style="margin:18px 0"><a href="${APP_URL}" style="background:#1F3864;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif">Open ED1 Task Manager</a></p>`
        : "";
      const dueRow = task.due_date ? `<tr><td style="padding:4px 12px 4px 0;color:#555">Due</td><td>${task.due_date}</td></tr>` : "";
      const reasonRow = (event === "rejected" && task.rejection_note)
        ? `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">Reason</td><td style="color:#c0392b">${escapeHtml(task.rejection_note)}</td></tr>` : "";

      for (const r of list) {
        if (!r.email) continue;
        const html = `
          <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
            <h2 style="color:#1F3864;font-size:18px;margin:0 0 6px">${escapeHtml(heading)}</h2>
            <p style="margin:0 0 14px">Hello ${escapeHtml(r.name)},</p>
            <p style="margin:0 0 14px">${escapeHtml(intro)}</p>
            <table style="border-collapse:collapse;font-size:14px">
              <tr><td style="padding:4px 12px 4px 0;color:#555">Task</td><td><strong>${escapeHtml(task.title)}</strong></td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#555">Unit</td><td>${escapeHtml(unitName)}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#555">Priority</td><td>${escapeHtml(task.priority || "medium")}</td></tr>
              ${dueRow}
              ${reasonRow}
            </table>
            ${loginLink}
            <p style="margin:18px 0 0;color:#888;font-size:12px">RUMBU INDUSTRIES GROUP &middot; ED1 Task Manager</p>
          </div>`;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_EMAIL, to: [r.email], subject: title, html }),
        });
        if (res.ok) emailed++;
        else console.error("Resend failed for " + r.email + ": " + (await res.text()));
      }
    }

    return json({ event, notified: list.length, emailed }, 200);
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
