// @ts-nocheck
// Supabase Edge Function: send-renewal-emails
// Triggered daily by pg_cron at 0 8 * * * (08:00 UTC)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// 2.2 — Renewal date calculation
// ---------------------------------------------------------------------------
export function calculateNextRenewal(startDate: string, billingCycle: string): Date | null {
  const start = new Date(startDate + "T00:00:00Z"); // force UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let next = new Date(start);
  while (next <= today) {
    if (billingCycle === "Monthly") {
      next.setUTCMonth(next.getUTCMonth() + 1);
    } else if (billingCycle === "Yearly") {
      next.setUTCFullYear(next.getUTCFullYear() + 1);
    } else {
      console.warn(`[send-renewal-emails] Unsupported billing_cycle: "${billingCycle}" — skipping`);
      return null;
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// 3.3 — Email builders
// ---------------------------------------------------------------------------
interface SubscriptionRow {
  name: string;
  amount: number;
  renewal_date: Date;
  billing_cycle: string;
}

export function buildEmailHtml(userName: string, subscriptions: SubscriptionRow[]): string {
  const rows = subscriptions
    .map(
      (s) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(s.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Rs ${Number(s.amount).toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${formatDate(s.renewal_date)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(s.billing_cycle)}</td>
        </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>SubTrack — Upcoming Renewals</title></head>
<body style="font-family:sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#4f46e5;">SubTrack — Upcoming Renewals</h2>
  <p>Hi ${escapeHtml(userName)}, here are your subscriptions renewing soon:</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:8px 12px;text-align:left;">Name</th>
        <th style="padding:8px 12px;text-align:left;">Amount</th>
        <th style="padding:8px 12px;text-align:left;">Renewal Date</th>
        <th style="padding:8px 12px;text-align:left;">Cycle</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p style="margin-top:24px;font-size:13px;color:#6b7280;">
    Manage your settings at
    <a href="https://subtrackfsd.onrender.com/notifications.html">SubTrack Notifications</a>
  </p>
</body>
</html>`;
}

export function buildEmailText(userName: string, subscriptions: SubscriptionRow[]): string {
  const lines = subscriptions.map(
    (s) =>
      `- ${s.name}: Rs ${Number(s.amount).toFixed(2)}, renews ${formatDate(s.renewal_date)} (${s.billing_cycle})`
  );
  return [
    `SubTrack — Your upcoming subscription renewals`,
    ``,
    `Hi ${userName}, here are your subscriptions renewing soon:`,
    ``,
    ...lines,
    ``,
    `Manage your settings at https://subtrackfsd.onrender.com/notifications.html`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function utcDayStart(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// 2.4 — Query subscriptions within 14-day window
// ---------------------------------------------------------------------------
interface UserBucket {
  userId: string;
  email: string;
  userName: string;
  reminderDays: number;
  subscriptions: SubscriptionRow[];
}

async function queryUpcomingRenewals(): Promise<UserBucket[]> {
  // Fetch all subscriptions with user_settings joined
  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select(`
      id,
      user_id,
      name,
      amount,
      start_date,
      billing_cycle,
      user_settings (
        email_notifications_enabled,
        email_reminder_days
      )
    `);

  if (error) {
    console.error("[send-renewal-emails] Failed to query subscriptions:", error.message);
    return [];
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const maxWindow = new Date(today);
  maxWindow.setUTCDate(maxWindow.getUTCDate() + 14);

  // Group by user_id
  const buckets = new Map<string, UserBucket>();

  for (const row of rows ?? []) {
    const settings = Array.isArray(row.user_settings)
      ? row.user_settings[0]
      : row.user_settings;

    // Respect opt-out (default enabled if no settings row)
    const emailEnabled = settings?.email_notifications_enabled ?? true;
    if (!emailEnabled) continue;

    const reminderDays: number = settings?.email_reminder_days ?? 7;

    const renewal = calculateNextRenewal(row.start_date, row.billing_cycle);
    if (!renewal) continue; // unsupported cycle — already logged

    // 14-day global window check
    if (renewal > maxWindow) continue;

    // Per-user reminder window check
    const userWindow = new Date(today);
    userWindow.setUTCDate(userWindow.getUTCDate() + reminderDays);
    if (renewal > userWindow) continue;

    if (!buckets.has(row.user_id)) {
      buckets.set(row.user_id, {
        userId: row.user_id,
        email: "",
        userName: "",
        reminderDays,
        subscriptions: [],
      });
    }

    buckets.get(row.user_id)!.subscriptions.push({
      name: row.name,
      amount: row.amount,
      renewal_date: renewal,
      billing_cycle: row.billing_cycle,
    });
  }

  if (buckets.size === 0) return [];

  // Resolve user emails via admin API
  const userIds = [...buckets.keys()];
  for (const uid of userIds) {
    try {
      const { data: userData, error: userError } =
        await supabase.auth.admin.getUserById(uid);
      if (userError || !userData?.user?.email) {
        console.warn(`[send-renewal-emails] Could not resolve email for user ${uid} — skipping`);
        buckets.delete(uid);
        continue;
      }
      const bucket = buckets.get(uid)!;
      bucket.email = userData.user.email;
      bucket.userName = userData.user.user_metadata?.full_name ?? userData.user.email;
    } catch (err) {
      console.warn(`[send-renewal-emails] Error fetching user ${uid}:`, err);
      buckets.delete(uid);
    }
  }

  return [...buckets.values()];
}

// ---------------------------------------------------------------------------
// 3.1 — Dedup check
// ---------------------------------------------------------------------------
async function alreadySentToday(userId: string): Promise<boolean> {
  const todayStr = utcDayStart(); // YYYY-MM-DD
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "email_summary")
    .gte("created_at", `${todayStr}T00:00:00Z`)
    .lt("created_at", `${todayStr}T23:59:59.999Z`)
    .limit(1);

  if (error) {
    console.warn(`[send-renewal-emails] Dedup check failed for ${userId}:`, error.message);
    return false; // fail open — attempt send
  }
  return (data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// 3.5 — Resend API call
// ---------------------------------------------------------------------------
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SubTrack <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.error(
        `[send-renewal-emails] Resend error for ${to}: HTTP ${res.status} — ${body}`
      );
      return false;
    }
    return true;
  } catch (err) {
    // Network failure — log and signal caller to exit
    console.error("[send-renewal-emails] Network failure contacting Resend:", err);
    throw err; // re-throw so the main loop can exit
  }
}

// ---------------------------------------------------------------------------
// 3.7 — Post-send log insert
// ---------------------------------------------------------------------------
async function logEmailSent(userId: string, count: number): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type: "email_summary",
    title: "Email reminder sent",
    message: `${count} renewal(s) included`,
    read: false,
  });
  if (error) {
    console.warn(
      `[send-renewal-emails] Failed to insert notification log for ${userId}:`,
      error.message
    );
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (_req: Request) => {
  console.log("[send-renewal-emails] Starting daily email run");

  let buckets: UserBucket[];
  try {
    buckets = await queryUpcomingRenewals();
  } catch (err) {
    console.error("[send-renewal-emails] Fatal error querying renewals:", err);
    return new Response(JSON.stringify({ error: "DB query failed" }), { status: 500 });
  }

  if (buckets.length === 0) {
    console.log("[send-renewal-emails] No users with upcoming renewals — done");
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  let sent = 0;

  for (const bucket of buckets) {
    // 3.1 — Dedup check
    const alreadySent = await alreadySentToday(bucket.userId);
    if (alreadySent) {
      console.log(`[send-renewal-emails] Already sent today for user ${bucket.userId} — skipping`);
      continue;
    }

    const subject = "SubTrack \u2014 Your upcoming subscription renewals";
    const html = buildEmailHtml(bucket.userName, bucket.subscriptions);
    const text = buildEmailText(bucket.userName, bucket.subscriptions);

    // 3.5 — Send with per-user error isolation
    let success: boolean;
    try {
      success = await sendEmail(bucket.email, subject, html, text);
    } catch (_networkErr) {
      // Network failure — exit entire run
      console.error("[send-renewal-emails] Aborting run due to network failure");
      return new Response(JSON.stringify({ error: "Network failure", sent }), { status: 502 });
    }

    if (!success) {
      // Per-user API error — log already done inside sendEmail, continue to next user
      continue;
    }

    // 3.7 — Log successful send
    await logEmailSent(bucket.userId, bucket.subscriptions.length);
    sent++;
    console.log(
      `[send-renewal-emails] Sent to ${bucket.email} (${bucket.subscriptions.length} renewal(s))`
    );
  }

  console.log(`[send-renewal-emails] Done — ${sent} email(s) sent`);
  return new Response(JSON.stringify({ sent }), { status: 200 });
});
