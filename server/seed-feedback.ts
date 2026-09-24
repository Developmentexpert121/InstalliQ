/**
 * Seed script — feedback_items
 *
 * Inserts a representative set of feedback rows so the Feedback Inbox page
 * has realistic data to review. Safe to run multiple times: it checks for
 * an existing "seed" row before inserting.
 *
 * Usage:
 *   npx tsx server/seed-feedback.ts
 *
 * Requires DIGITALOCEAN_DATABASE_URL (or DATABASE_URL) in the environment.
 */

import pg from "pg";

const { Pool } = pg;

const DB_URL =
  process.env.DIGITALOCEAN_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!DB_URL) {
  console.error("ERROR: No database URL found. Set DIGITALOCEAN_DATABASE_URL or DATABASE_URL.");
  process.exit(1);
}

// ─── Seed data ────────────────────────────────────────────────────────────────
// Each row is inserted as if submitted by an existing user (user_id comes from
// the users table by email). If the email is not found the row is skipped.

const SEED_ROWS: Array<{
  userEmail: string;
  feedbackType: "bug" | "enhancement";
  notes: string;
  pageUrl: string;
  pageTitle: string;
  status: "new" | "accepted" | "ignored";
  createdAt: string; // ISO offset in days from now (negative = past)
}> = [
  {
    userEmail: "vjkalwani@yahoo.com",
    feedbackType: "bug",
    notes: "When I click 'Complete' on a booking, the status spinner never stops and the page has to be refreshed to see the update.",
    pageUrl: "/google-calendar",
    pageTitle: "Install Calendar — InstalliQ.ai",
    status: "new",
    createdAt: "-1",
  },
  {
    userEmail: "vjkalwani@yahoo.com",
    feedbackType: "enhancement",
    notes: "It would be great to have a bulk-assign feature on the calendar so I can assign multiple bookings to an installer in one click instead of editing each one.",
    pageUrl: "/google-calendar",
    pageTitle: "Install Calendar — InstalliQ.ai",
    status: "accepted",
    createdAt: "-3",
  },
  {
    userEmail: "vjkalwani@yahoo.com",
    feedbackType: "bug",
    notes: "The PDF work order download sometimes produces a blank page for jobs that have more than 10 photos attached.",
    pageUrl: "/dashboard",
    pageTitle: "Dashboard — InstalliQ.ai",
    status: "new",
    createdAt: "-2",
  },
  {
    userEmail: "vjkalwani@yahoo.com",
    feedbackType: "enhancement",
    notes: "Add a dark mode toggle in the user settings — working late shifts and the white background is very bright.",
    pageUrl: "/settings",
    pageTitle: "Settings — InstalliQ.ai",
    status: "new",
    createdAt: "-4",
  },
  {
    userEmail: "vjkalwani@yahoo.com",
    feedbackType: "bug",
    notes: "On mobile the 'Week' view in the calendar overlaps the day columns — event titles are unreadable when there are more than 3 events in a day.",
    pageUrl: "/google-calendar",
    pageTitle: "Install Calendar — InstalliQ.ai",
    status: "ignored",
    createdAt: "-7",
  },
  {
    userEmail: "vjkalwani@yahoo.com",
    feedbackType: "enhancement",
    notes: "The site survey PDF should include the annotated photos, not just the plain ones. Currently I have to export separately and combine manually.",
    pageUrl: "/surveys",
    pageTitle: "Site Surveys — InstalliQ.ai",
    status: "accepted",
    createdAt: "-5",
  },
  {
    userEmail: "vjkalwani@yahoo.com",
    feedbackType: "bug",
    notes: "Install Time Estimator always returns 0 hours when the job address is outside the US. The travel time calculation seems to break.",
    pageUrl: "/install-time-estimator",
    pageTitle: "Install Time Estimator — InstalliQ.ai",
    status: "new",
    createdAt: "-6",
  },
  {
    userEmail: "vjkalwani@gmail.com",
    feedbackType: "enhancement",
    notes: "Add CSV export for the activity logs so I can review audit trails in Excel without manually copying rows.",
    pageUrl: "/activity-logs",
    pageTitle: "Activity Logs — InstalliQ.ai",
    status: "new",
    createdAt: "-2",
  },
  {
    userEmail: "vjkalwani@gmail.com",
    feedbackType: "bug",
    notes: "The 'Export to Google Sheets' button on the Feedback Inbox page shows a success toast but no sheet is created when Google Drive is not connected.",
    pageUrl: "/admin/feedback",
    pageTitle: "Feedback Inbox — InstalliQ.ai",
    status: "new",
    createdAt: "-1",
  },
  {
    userEmail: "vjkalwani@gmail.com",
    feedbackType: "enhancement",
    notes: "Let owners customise the colour of their status pills in the calendar (e.g. make 'Completed' green and 'Cancelled' red) to match their company branding.",
    pageUrl: "/google-calendar",
    pageTitle: "Install Calendar — InstalliQ.ai",
    status: "ignored",
    createdAt: "-10",
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const pool = new Pool({
    connectionString: DB_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, ""),
    ssl: DB_URL!.includes("sslmode") || DB_URL!.includes("digitalocean")
      ? { rejectUnauthorized: false }
      : undefined,
    connectionTimeoutMillis: 15000,
  });

  try {
    console.log("[Seed] Connecting to database…");

    // Guard: skip if seed rows already exist (identified by this exact note)
    const guard = await pool.query(
      `SELECT COUNT(*) FROM feedback_items WHERE notes LIKE 'When I click%Complete%on a booking%'`
    );
    if (parseInt(guard.rows[0].count, 10) > 0) {
      console.log("[Seed] Seed data already present — skipping. Delete existing rows to re-seed.");
      return;
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of SEED_ROWS) {
      // Resolve user_id from email
      const userRes = await pool.query(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [row.userEmail]
      );
      if (userRes.rows.length === 0) {
        console.warn(`[Seed] User not found: ${row.userEmail} — skipping row`);
        skipped++;
        continue;
      }
      const userId = userRes.rows[0].id as number;

      // Calculate createdAt timestamp
      const daysOffset = parseInt(row.createdAt, 10);
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() + daysOffset);
      // Randomise the time a bit so rows aren't all at midnight
      createdAt.setHours(8 + Math.floor(Math.random() * 10));
      createdAt.setMinutes(Math.floor(Math.random() * 60));

      await pool.query(
        `INSERT INTO feedback_items
           (user_id, page_url, page_title, feedback_type, notes, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, row.pageUrl, row.pageTitle, row.feedbackType, row.notes, row.status, createdAt]
      );
      console.log(`[Seed] ✓ ${row.feedbackType.padEnd(11)} | ${row.status.padEnd(8)} | ${row.pageUrl}`);
      inserted++;
    }

    console.log(`\n[Seed] Done — ${inserted} row(s) inserted, ${skipped} skipped.`);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("[Seed] Fatal error:", err);
  process.exit(1);
});
