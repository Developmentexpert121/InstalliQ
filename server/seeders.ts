import bcrypt from "bcryptjs";
import { db, pool } from "./db";
import { storage } from "./storage";
import { subscriptionPlans, onboardingQuestions, calendarEvents, globalTags, users } from "@shared/schema";
import { eq, ilike, or, isNotNull, and } from "drizzle-orm";

async function seedMasterAdmins() {
  const admins = [
    {
      username: "developmentexpert121",
      email: "developmentexpert121@gmail.com",
      name: "System Administrator",
      password: "Admin@123!",
    },
    {
      username: "vjkalwani",
      email: "vjkalwani@gmail.com",
      name: "VJ Kalwani",
      password: "Admin!123",
    },
    {
      username: "mehta.shishir",
      email: "mehta.shishir@gmail.com",
      name: "Super Admin",
      password: "Admin@123!@#",
    },
  ];

  for (const admin of admins) {
    const [deletedUser] = await db.select().from(users).where(
      and(
        or(ilike(users.email, admin.email), ilike(users.username, admin.username)),
        isNotNull(users.deletedAt)
      )
    );
    if (deletedUser) {
      console.log(`[Seeder] Skipping deleted super admin: ${admin.email}`);
      continue;
    }

    let existing = await storage.getUserByEmail(admin.email);
    if (!existing) {
      existing = await storage.getUserByUsername(admin.username);
    }

    const hashedPassword = await bcrypt.hash(admin.password, 10);
    if (!existing) {
      await storage.createUser({
        username: admin.username,
        password: hashedPassword,
        name: admin.name,
        email: admin.email,
        role: "super_admin",
        isMaster: "true",
      });
      console.log(`[Seeder] Created master admin: ${admin.email}`);
    } else {
      await storage.updateUser(existing.id, { password: hashedPassword, role: "super_admin" });
      console.log(`[Seeder] Reset password for super admin: ${admin.email}`);
    }
  }
}

async function seedVjkalwaniYahoo() {
  const adminEmail = "vjkalwani@yahoo.com";
  const [deletedUser] = await db.select().from(users).where(
    and(
      ilike(users.email, adminEmail),
      isNotNull(users.deletedAt)
    )
  );
  if (deletedUser) {
    console.log(`[Seeder] Skipping deleted admin: ${adminEmail}`);
    return;
  }

  let adminUser = await storage.getUserByEmail(adminEmail);
  const hashedPassword = await bcrypt.hash("Admin!123", 10);
  if (adminUser) {
    await storage.updateUser(adminUser.id, { password: hashedPassword, role: "admin" });
    console.log(`[Seeder] Reset password for admin: ${adminEmail}`);
  } else {
    await storage.createUser({
      username: "vjkalwani.yahoo",
      password: hashedPassword,
      name: "VJ Kalwani",
      email: adminEmail,
      role: "admin",
    });
    console.log(`[Seeder] Created admin: ${adminEmail}`);
  }
}

async function seedOwnerAdmin() {
  const adminEmail = "saniyatanyal1@gmail.com";
  const [deletedUser] = await db.select().from(users).where(
    and(
      ilike(users.email, adminEmail),
      isNotNull(users.deletedAt)
    )
  );
  if (deletedUser) {
    console.log(`[Seeder] Skipping deleted admin: ${adminEmail}`);
    return;
  }

  let adminUser = await storage.getUserByEmail(adminEmail);
  const hashedPassword = await bcrypt.hash("Admin@123!", 10);
  if (adminUser) {
    await storage.updateUser(adminUser.id, { password: hashedPassword, role: "admin" });
    console.log(`[Seeder] Reset password for admin: ${adminEmail}`);
  } else {
    await storage.createUser({
      username: "saniyatanyal1",
      password: hashedPassword,
      name: "Saniya Tanyal",
      email: adminEmail,
      role: "admin",
    });
    console.log(`[Seeder] Created admin: ${adminEmail}`);
  }
}

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

async function seedTestInstaller() {
  if (!isDev()) return;
  const email = "installer-test@fastsigns.com";
  let existing = await storage.getUserByEmail(email);
  if (!existing) {
    existing = await storage.getUserByUsername("test.installer");
  }
  if (!existing) {
    const ownerAdmin = await storage.getUserByEmail("saniyatanyal1@gmail.com");
    const hash = await bcrypt.hash("Install@123", 10);
    await storage.createUser({
      username: "test.installer",
      password: hash,
      name: "Alex Rivera",
      email,
      role: "user",
      jobTitle: "Installer",
      location: "Boston, MA",
      createdBy: ownerAdmin?.id,
    });
    console.log(`[Seeder] Created test installer: ${email}`);
  }
}

async function seedSubscriptionPlans() {
  const existing = await db.select().from(subscriptionPlans);
  if (existing.length > 0) return;

  const plans = [
    { name: "Basic", price: "29", eventLimit: 20, bufferLimit: 5, isActive: true, isDefault: true, sortOrder: 0 },
    { name: "Standard", price: "59", eventLimit: 50, bufferLimit: 10, isActive: true, isDefault: false, sortOrder: 1 },
    { name: "Premium", price: "99", eventLimit: 200, bufferLimit: 25, isActive: true, isDefault: false, sortOrder: 2 },
  ];

  for (const plan of plans) {
    await db.insert(subscriptionPlans).values(plan);
  }
  console.log(`[Seeder] Created ${plans.length} default subscription plans`);
}

async function seedAppSettings() {
  try {
    const existing = await pool.query(
      "SELECT 1 FROM app_settings WHERE key = 'subscription_gate_enabled'"
    );
    if (existing.rowCount === 0) {
      await pool.query(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ('subscription_gate_enabled', 'false', NOW()) ON CONFLICT (key) DO NOTHING"
      );
      console.log("[Seeder] Set default app setting: subscription_gate_enabled = false");
    }
  } catch (err) {
    console.warn("[Seeder] app_settings seeding skipped:", err instanceof Error ? err.message : err);
  }
}

async function seedGlobalTags() {
  try {
    // Step 1: Deduplicate — keep only the lowest id per unique (case-insensitive) name
    await pool.query(`
      DELETE FROM global_tags
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM global_tags
        GROUP BY LOWER(name)
      )
    `);
    console.log("[Seeder] Deduplicated global_tags (kept lowest id per name)");

    // Step 1b: Ensure unique index on name (case-insensitive) — safe to run repeatedly
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "global_tags_name_unique"
      ON global_tags (LOWER(name));
    `);
    console.log("[Seeder] Ensured unique index on global_tags.name");

    const defaultTags = [
      { name: "ADA", color: "#8b5cf6" },
      { name: "Awning", color: "#f43f5e" },
      { name: "Backlit Channel Letters", color: "#6366f1" },
      { name: "Banner", color: "#0891b2" },
      { name: "Channel Letters", color: "#3b82f6" },
      { name: "Dimensional Letters", color: "#06b6d4" },
      { name: "Door Lettering", color: "#f59e0b" },
      { name: "Drop Offs", color: "#64748b" },
      { name: "Exterior Signs", color: "#10b981" },
      { name: "Halo Lit Letters", color: "#7c3aed" },
      { name: "Light Box", color: "#f97316" },
      { name: "Monument Signs", color: "#ef4444" },
      { name: "Parking Signs", color: "#0ea5e9" },
      { name: "Post and Panel Signs", color: "#84cc16" },
      { name: "Pylon Signs", color: "#b45309" },
      { name: "Site Signs", color: "#14b8a6" },
      { name: "Site Survey", color: "#a855f7" },
      { name: "Trade Show Graphics", color: "#ec4899" },
      { name: "Traffic Signs", color: "#eab308" },
      { name: "Vehicle Graphics", color: "#f59e0b" },
      { name: "Wall Graphics", color: "#10b981" },
      { name: "Window Graphics", color: "#06b6d4" },
    ];

    // Step 2: Fetch existing names to avoid duplicates (name-based check since no unique constraint yet)
    const existing = await db.select({ name: globalTags.name }).from(globalTags);
    const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));

    let added = 0;
    for (const tag of defaultTags) {
      if (!existingNames.has(tag.name.toLowerCase())) {
        await db.insert(globalTags).values(tag);
        existingNames.add(tag.name.toLowerCase());
        added++;
      }
    }
    console.log(`[Seeder] Added ${added} new default global tags`);
  } catch (err) {
    console.warn("[Seeder] global tags seeding skipped:", err instanceof Error ? err.message : err);
  }
}

async function seedSampleCalendarEvents() {
  if (!isDev()) return;
  try {
    const existing = await db.select().from(calendarEvents);
    if (existing.length > 0) return;

    const ownerAdmin = await storage.getUserByEmail("saniyatanyal1@gmail.com");
    if (!ownerAdmin) return;

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    dayAfter.setHours(10, 0, 0, 0);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(8, 30, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(12, 0, 0, 0);
    const dayAfterEnd = new Date(dayAfter);
    dayAfterEnd.setHours(14, 0, 0, 0);
    const nextWeekEnd = new Date(nextWeek);
    nextWeekEnd.setHours(11, 30, 0, 0);

    const events = [
      {
        title: "Channel Letter Install - Riverside Plaza",
        description: "Install 24-inch illuminated channel letters on storefront facade. Power supply pre-wired.",
        jobDescription: "LED channel letters, aluminum returns, acrylic faces. Total of 12 letters.",
        date: tomorrow,
        startTime: tomorrow,
        endTime: tomorrowEnd,
        status: "SCHEDULED",
        address: "150 Riverside Ave, Waltham, MA 02452",
        customerName: "Riverside Dental Group",
        customerPhone: "781-555-0142",
        customerEmail: "manager@riversidedental.example.com",
        workJobNumber: "WO-2026-0312",
        createdBy: ownerAdmin.id,
      },
      {
        title: "Vehicle Wrap - Martinez Landscaping",
        description: "Full wrap on Ford Transit van. Customer will drop off vehicle at 9 AM.",
        jobDescription: "Full vehicle wrap with laminated vinyl. Design files uploaded to project.",
        date: dayAfter,
        startTime: dayAfter,
        endTime: dayAfterEnd,
        status: "SCHEDULED",
        address: "42 Industrial Way, Watertown, MA 02472",
        customerName: "Martinez Landscaping LLC",
        customerPhone: "617-555-0198",
        customerEmail: "carlos@martinezlandscaping.example.com",
        workJobNumber: "WO-2026-0315",
        createdBy: ownerAdmin.id,
      },
      {
        title: "ADA Signs - City Hall Annex",
        description: "Install ADA-compliant room signs on all 3 floors. Building contact will provide access.",
        jobDescription: "Photopolymer ADA signs with Grade 2 Braille. 28 total signs. Mounting tape + screws.",
        date: nextWeek,
        startTime: nextWeek,
        endTime: nextWeekEnd,
        status: "SCHEDULED",
        address: "10 Main St, Newton, MA 02458",
        customerName: "City of Newton",
        customerPhone: "617-555-0211",
        customerEmail: "facilities@newton.gov.example.com",
        workJobNumber: "WO-2026-0320",
        createdBy: ownerAdmin.id,
      },
    ];

    for (const event of events) {
      await storage.createCalendarEvent(event as any);
    }
    console.log(`[Seeder] Created ${events.length} sample calendar events`);
  } catch (err) {
    console.warn("[Seeder] sample calendar events seeding skipped:", err instanceof Error ? err.message : err);
  }
}

const DEFAULT_ONBOARDING_QUESTIONS = [
  { stepName: "business_info", stepTitle: "Business Information", stepIcon: "Building2", stepDescription: "Tell us about your business location and travel policies", stepOrder: 0, questionLabel: "What is your business address?", questionKey: "businessAddress", questionType: "text", placeholder: "Enter your business address", required: true, sortOrder: 0 },
  { stepName: "business_info", stepTitle: "Business Information", stepIcon: "Building2", stepDescription: "Tell us about your business location and travel policies", stepOrder: 0, questionLabel: "How far will you travel for installations?", questionKey: "installationRange", questionType: "radio", options: "25 miles,50 miles,75 miles,100+ miles", placeholder: "", required: false, sortOrder: 1 },
  { stepName: "business_info", stepTitle: "Business Information", stepIcon: "Building2", stepDescription: "Tell us about your business location and travel policies", stepOrder: 0, questionLabel: "Do you charge for travel time?", questionKey: "chargeTravelTime", questionType: "radio", options: "Yes,No", placeholder: "", required: false, sortOrder: 2 },
  { stepName: "business_info", stepTitle: "Business Information", stepIcon: "Building2", stepDescription: "Tell us about your business location and travel policies", stepOrder: 0, questionLabel: "What is your standard setup/cleanup time?", questionKey: "setupCleanupTime", questionType: "radio", options: "15 minutes,30 minutes,45 minutes,60 minutes", placeholder: "", required: false, sortOrder: 3 },
  { stepName: "team", stepTitle: "Team & Scheduling", stepIcon: "Users", stepDescription: "Share your team structure and scheduling workflow", stepOrder: 1, questionLabel: "How many installers are on your team?", questionKey: "teamSize", questionType: "radio", options: "1,2-3,4-6,7+", placeholder: "", required: false, sortOrder: 0 },
  { stepName: "team", stepTitle: "Team & Scheduling", stepIcon: "Users", stepDescription: "Share your team structure and scheduling workflow", stepOrder: 1, questionLabel: "Who is the scheduling point of contact?", questionKey: "schedulingPOC", questionType: "text", placeholder: "Enter name", required: false, sortOrder: 1 },
  { stepName: "team", stepTitle: "Team & Scheduling", stepIcon: "Users", stepDescription: "Share your team structure and scheduling workflow", stepOrder: 1, questionLabel: "Who manages the calendar?", questionKey: "calendarOwner", questionType: "text", placeholder: "Enter name", required: false, sortOrder: 2 },
  { stepName: "team", stepTitle: "Team & Scheduling", stepIcon: "Users", stepDescription: "Share your team structure and scheduling workflow", stepOrder: 1, questionLabel: "How many sub-installers do you use?", questionKey: "subInstallerCount", questionType: "radio", options: "0,1-2,3-5,6+", placeholder: "", required: false, sortOrder: 3 },
  { stepName: "team", stepTitle: "Team & Scheduling", stepIcon: "Users", stepDescription: "Share your team structure and scheduling workflow", stepOrder: 1, questionLabel: "Who coordinates sub-installers?", questionKey: "subInstallerCoordinator", questionType: "text", placeholder: "Enter name", required: false, sortOrder: 4 },
  { stepName: "team", stepTitle: "Team & Scheduling", stepIcon: "Users", stepDescription: "Share your team structure and scheduling workflow", stepOrder: 1, questionLabel: "How do you notify customers?", questionKey: "customerNotification", questionType: "radio", options: "Email,Phone,Both,None", placeholder: "", required: false, sortOrder: 5 },
  { stepName: "equipment", stepTitle: "Capabilities & Equipment", stepIcon: "Wrench", stepDescription: "What equipment and capabilities does your team have?", stepOrder: 2, questionLabel: "Do you have a bucket truck?", questionKey: "hasBucketTruck", questionType: "radio", options: "Yes,No", placeholder: "", required: false, sortOrder: 0 },
  { stepName: "equipment", stepTitle: "Capabilities & Equipment", stepIcon: "Wrench", stepDescription: "What equipment and capabilities does your team have?", stepOrder: 2, questionLabel: "Minimum time for bucket truck jobs?", questionKey: "bucketTruckMinTime", questionType: "text", placeholder: "e.g., 2 hours", required: false, sortOrder: 1 },
  { stepName: "equipment", stepTitle: "Capabilities & Equipment", stepIcon: "Wrench", stepDescription: "What equipment and capabilities does your team have?", stepOrder: 2, questionLabel: "Two installers required for bucket truck?", questionKey: "bucketTruckTwoInstallers", questionType: "radio", options: "Yes,No", placeholder: "", required: false, sortOrder: 2 },
  { stepName: "equipment", stepTitle: "Capabilities & Equipment", stepIcon: "Wrench", stepDescription: "What equipment and capabilities does your team have?", stepOrder: 2, questionLabel: "Maximum ladder height?", questionKey: "ladderMaxHeight", questionType: "radio", options: "12 ft,16 ft,20 ft,24+ ft", placeholder: "", required: false, sortOrder: 3 },
  { stepName: "equipment", stepTitle: "Capabilities & Equipment", stepIcon: "Wrench", stepDescription: "What equipment and capabilities does your team have?", stepOrder: 2, questionLabel: "Do you need two people for ladder work?", questionKey: "ladderTwoPeople", questionType: "radio", options: "Yes,No", placeholder: "", required: false, sortOrder: 4 },
  { stepName: "equipment", stepTitle: "Capabilities & Equipment", stepIcon: "Wrench", stepDescription: "What equipment and capabilities does your team have?", stepOrder: 2, questionLabel: "Do you install vehicle graphics?", questionKey: "vehicleGraphics", questionType: "radio", options: "Yes,No", placeholder: "", required: false, sortOrder: 5 },
  { stepName: "equipment", stepTitle: "Capabilities & Equipment", stepIcon: "Wrench", stepDescription: "What equipment and capabilities does your team have?", stepOrder: 2, questionLabel: "Do you have a garage for vehicle work?", questionKey: "hasGarage", questionType: "radio", options: "Yes,No", placeholder: "", required: false, sortOrder: 6 },
  { stepName: "equipment", stepTitle: "Capabilities & Equipment", stepIcon: "Wrench", stepDescription: "What equipment and capabilities does your team have?", stepOrder: 2, questionLabel: "Do you do wraps?", questionKey: "doesWraps", questionType: "radio", options: "Yes,No", placeholder: "", required: false, sortOrder: 7 },
  { stepName: "equipment", stepTitle: "Capabilities & Equipment", stepIcon: "Wrench", stepDescription: "What equipment and capabilities does your team have?", stepOrder: 2, questionLabel: "Do you install posts?", questionKey: "installsPosts", questionType: "radio", options: "Yes,No", placeholder: "", required: false, sortOrder: 8 },
  { stepName: "products", stepTitle: "Product Lists & Pricing", stepIcon: "Package", stepDescription: "List the sign types you install and your pricing data", stepOrder: 3, questionLabel: "What sign types do you install?", questionKey: "signTypes", questionType: "checkbox", options: "Large Format (Wall/Window Graphics Vinyl Brick/Concrete),ADA signs (ADA Engraved),Parking Signs (Wall and Posts),Building Signs (Dibond Aluminum MDO),Monument Signs,Non-Illuminated Dimensional Letters,Channel Letters,Frost Vinyl", placeholder: "", required: false, sortOrder: 0 },
  { stepName: "products", stepTitle: "Product Lists & Pricing", stepIcon: "Package", stepDescription: "List the sign types you install and your pricing data", stepOrder: 3, questionLabel: "Other sign types (please specify)", questionKey: "signTypesOther", questionType: "text", placeholder: "Enter any additional sign types", required: false, sortOrder: 1 },
  { stepName: "products", stepTitle: "Product Lists & Pricing", stepIcon: "Package", stepDescription: "List the sign types you install and your pricing data", stepOrder: 3, questionLabel: "Pricing/product list details", questionKey: "pricingProductList", questionType: "textarea", placeholder: "Paste or describe your pricing and product list", required: false, sortOrder: 2 },
  { stepName: "time_standards", stepTitle: "Install Time Standards", stepIcon: "Clock", stepDescription: "Define your standard installation time estimates", stepOrder: 4, questionLabel: "Standard installation time estimates", questionKey: "installTimeStandards", questionType: "textarea", placeholder: "Describe your standard installation time estimates", required: false, sortOrder: 0 },
  { stepName: "time_standards", stepTitle: "Install Time Standards", stepIcon: "Clock", stepDescription: "Define your standard installation time estimates", stepOrder: 4, questionLabel: "Additional notes", questionKey: "additionalNotes", questionType: "textarea", placeholder: "Any additional information you'd like to share", required: false, sortOrder: 1 },
];

async function seedOnboardingQuestions() {
  const existing = await storage.getOnboardingQuestions();
  if (existing.length > 0) return;

  for (const q of DEFAULT_ONBOARDING_QUESTIONS) {
    await storage.createOnboardingQuestion(q as any);
  }
  console.log(`[Seeder] Created ${DEFAULT_ONBOARDING_QUESTIONS.length} default onboarding questions`);
}

export { DEFAULT_ONBOARDING_QUESTIONS };

async function fixMislinkedUsers() {
  try {
    const allUsers = await storage.getAllUsers();

    const shishirAdmin = allUsers.find(u =>
      u.role === "admin" && u.email?.toLowerCase() === "shishir.mehta@fastsigns.com"
    );
    if (!shishirAdmin) return;

    const shishirTeamUserIds = allUsers
      .filter(u => u.createdBy === shishirAdmin.id)
      .map(u => u.id);

    for (const u of allUsers) {
      if (u.role === "user" && !u.createdBy && u.email?.toLowerCase().endsWith("@fastsigns.com")) {
        const alreadyInTeam = allUsers.find(existing =>
          existing.email?.toLowerCase() === u.email?.toLowerCase() &&
          existing.id !== u.id &&
          existing.createdBy
        );
        if (alreadyInTeam) {
          console.log(`[Seeder] Skipping orphaned ${u.email} (id=${u.id}), duplicate of id=${alreadyInTeam.id}`);
          continue;
        }
      }
    }

    const johnDown = allUsers.find(u => u.id === 75 && u.email?.toLowerCase() === "john.down@fastsigns.com");
    if (johnDown && johnDown.createdBy !== shishirAdmin.id) {
      await pool.query('UPDATE users SET created_by = $1 WHERE id = $2', [shishirAdmin.id, johnDown.id]);
      console.log(`[Seeder] Fixed john.down@fastsigns.com (id=75) → admin ${shishirAdmin.id}`);
    }

    const installerTest = allUsers.find(u => u.id === 68 && u.email?.toLowerCase() === "installer-test@fastsigns.com");
    if (installerTest && installerTest.createdBy !== shishirAdmin.id) {
      await pool.query('UPDATE users SET created_by = $1 WHERE id = $2', [shishirAdmin.id, installerTest.id]);
      console.log(`[Seeder] Fixed installer-test@fastsigns.com (id=68) → admin ${shishirAdmin.id}`);
    }
  } catch (err) {
    console.warn("[Seeder] fixMislinkedUsers skipped:", err instanceof Error ? err.message : err);
  }
}

async function seedSchemaMigrations() {
  const { pool } = await import("./db");

  // ── Table creation (idempotent) ──────────────────────────────────────────
  // CREATE TABLE IF NOT EXISTS for every application table, ordered by
  // foreign-key dependency. This guarantees a brand-new production setup ends
  // up with the complete schema even if the auto-migrate table list ever
  // misses a newly-added table. Safe to run repeatedly (no-op when present).
  const tableCreations: Array<{ label: string; sql: string }> = [
    {
      label: "users",
      sql: `CREATE TABLE IF NOT EXISTS "users" (
        "id" SERIAL PRIMARY KEY,
        "username" TEXT NOT NULL UNIQUE,
        "password" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT,
        "phone" TEXT,
        "role" TEXT NOT NULL DEFAULT 'user',
        "is_master" TEXT NOT NULL DEFAULT 'false',
        "temp_password" TEXT,
        "job_title" TEXT,
        "location" TEXT,
        "created_by" INTEGER,
        "face_descriptor" TEXT,
        "face_photo" TEXT,
        "face_enabled" BOOLEAN NOT NULL DEFAULT false,
        "face_registered_at" TIMESTAMP,
        "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
        "openai_assistant_id" TEXT,
        "google_id" TEXT,
        "google_email" TEXT,
        "google_enabled" BOOLEAN NOT NULL DEFAULT false,
        "signsuiteiq_user_id" INTEGER UNIQUE,
        "signsuiteiq_admin_id" INTEGER,
        "payment_required" BOOLEAN NOT NULL DEFAULT false,
        "payment_completed" BOOLEAN NOT NULL DEFAULT false,
        "sender_first_name" TEXT,
        "sender_from_email" TEXT,
        "sender_reply_to" TEXT,
        "sender_company_address" TEXT,
        "sender_city" TEXT,
        "sender_country" TEXT,
        "sender_nickname" TEXT,
        "sender_verified" BOOLEAN NOT NULL DEFAULT false,
        "sendgrid_sender_id" INTEGER,
        "pdf_logo_url" TEXT,
        "pdf_template_url" TEXT,
        "pdf_company_name" TEXT,
        "pdf_company_address" TEXT,
        "pdf_company_phone" TEXT,
        "pdf_company_email" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP
      )`,
    },
    {
      label: "projects",
      sql: `CREATE TABLE IF NOT EXISTS "projects" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER REFERENCES "users"("id"),
        "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
        "description" TEXT,
        "job_label" TEXT,
        "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
        "ai_suggested_tags" TEXT[] DEFAULT ARRAY[]::text[],
        "has_issue" BOOLEAN NOT NULL DEFAULT false,
        "issue_description" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "address" TEXT,
        "city" TEXT,
        "state" TEXT,
        "postal_code" TEXT,
        "latitude" TEXT,
        "longitude" TEXT,
        "customer_name" TEXT,
        "customer_phone" TEXT,
        "customer_email" TEXT,
        "has_finished_photos" BOOLEAN NOT NULL DEFAULT false
      )`,
    },
    {
      label: "calendar_events",
      sql: `CREATE TABLE IF NOT EXISTS "calendar_events" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "job_description" TEXT,
        "date" TIMESTAMP NOT NULL,
        "project_id" INTEGER REFERENCES "projects"("id"),
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "start_time" TIMESTAMP,
        "end_time" TIMESTAMP,
        "status" TEXT DEFAULT 'SCHEDULED',
        "address" TEXT,
        "has_issue" BOOLEAN NOT NULL DEFAULT false,
        "issue_description" TEXT,
        "work_job_number" TEXT,
        "confirmation_token" TEXT,
        "created_by" INTEGER,
        "weather_temp" INTEGER,
        "weather_feels_like" INTEGER,
        "weather_condition" TEXT,
        "weather_humidity" INTEGER,
        "weather_wind_speed" INTEGER,
        "weather_icon" TEXT,
        "weather_fetched_at" TIMESTAMP,
        "customer_name" TEXT,
        "customer_phone" TEXT,
        "customer_email" TEXT,
        "secondary_poc_name" TEXT,
        "secondary_poc_phone" TEXT,
        "secondary_poc_email" TEXT
      )`,
    },
    {
      label: "weather_cache",
      sql: `CREATE TABLE IF NOT EXISTS "weather_cache" (
        "id" SERIAL PRIMARY KEY,
        "latitude" TEXT NOT NULL,
        "longitude" TEXT NOT NULL,
        "time_bucket" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "payload_json" TEXT NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "jobs",
      sql: `CREATE TABLE IF NOT EXISTS "jobs" (
        "id" SERIAL PRIMARY KEY,
        "work_order_number" TEXT,
        "invoice_number" TEXT,
        "job_name" TEXT,
        "description" TEXT,
        "address" TEXT,
        "city" TEXT,
        "state" TEXT,
        "postal_code" TEXT,
        "formatted_address" TEXT,
        "latitude" TEXT,
        "longitude" TEXT,
        "customer_name" TEXT,
        "poc_name" TEXT,
        "customer_email" TEXT,
        "customer_phone" TEXT,
        "secondary_poc_name" TEXT,
        "secondary_poc_phone" TEXT,
        "secondary_poc_email" TEXT,
        "sales_name" TEXT,
        "sales_email" TEXT,
        "sales_phone" TEXT,
        "notes" TEXT,
        "status" TEXT DEFAULT 'DRAFT',
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "install_events",
      sql: `CREATE TABLE IF NOT EXISTS "install_events" (
        "id" SERIAL PRIMARY KEY,
        "job_id" INTEGER NOT NULL REFERENCES "jobs"("id"),
        "calendar_event_id" INTEGER REFERENCES "calendar_events"("id"),
        "start_time" TIMESTAMP,
        "end_time" TIMESTAMP,
        "status" TEXT DEFAULT 'SCHEDULED',
        "assigned_installer_id" INTEGER REFERENCES "users"("id"),
        "gpt_estimate_minutes" INTEGER,
        "estimate_confidence" TEXT,
        "estimate_summary" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "attachments",
      sql: `CREATE TABLE IF NOT EXISTS "attachments" (
        "id" SERIAL PRIMARY KEY,
        "job_id" INTEGER NOT NULL REFERENCES "jobs"("id"),
        "file_url" TEXT NOT NULL,
        "file_name" TEXT NOT NULL,
        "file_type" TEXT,
        "category" TEXT NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "notification_logs",
      sql: `CREATE TABLE IF NOT EXISTS "notification_logs" (
        "id" SERIAL PRIMARY KEY,
        "type" TEXT NOT NULL,
        "to_email" TEXT NOT NULL,
        "cc_emails" TEXT,
        "subject" TEXT,
        "status" TEXT NOT NULL,
        "sent_at" TIMESTAMP,
        "error_message" TEXT,
        "job_id" INTEGER REFERENCES "jobs"("id"),
        "event_id" INTEGER REFERENCES "install_events"("id"),
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "event_assignments",
      sql: `CREATE TABLE IF NOT EXISTS "event_assignments" (
        "id" SERIAL PRIMARY KEY,
        "calendar_event_id" INTEGER NOT NULL REFERENCES "calendar_events"("id"),
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "assigned_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "availability_blocks",
      sql: `CREATE TABLE IF NOT EXISTS "availability_blocks" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "created_by" INTEGER NOT NULL REFERENCES "users"("id"),
        "category" TEXT NOT NULL DEFAULT 'other',
        "reason" TEXT,
        "start_at" TIMESTAMP NOT NULL,
        "end_at" TIMESTAMP NOT NULL,
        "all_day" BOOLEAN NOT NULL DEFAULT false,
        "display_name" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "reschedule_requests",
      sql: `CREATE TABLE IF NOT EXISTS "reschedule_requests" (
        "id" SERIAL PRIMARY KEY,
        "calendar_event_id" INTEGER NOT NULL REFERENCES "calendar_events"("id"),
        "confirmation_token" TEXT NOT NULL,
        "customer_name" TEXT NOT NULL,
        "customer_email" TEXT,
        "customer_phone" TEXT,
        "reason" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "archived_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "password_reset_tokens",
      sql: `CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "token" TEXT NOT NULL UNIQUE,
        "expires_at" TIMESTAMP NOT NULL,
        "used" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "calendar_filter_colors",
      sql: `CREATE TABLE IF NOT EXISTS "calendar_filter_colors" (
        "id" SERIAL PRIMARY KEY,
        "status_key" TEXT NOT NULL UNIQUE,
        "color" TEXT NOT NULL,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "job_timers",
      sql: `CREATE TABLE IF NOT EXISTS "job_timers" (
        "id" SERIAL PRIMARY KEY,
        "calendar_event_id" INTEGER NOT NULL REFERENCES "calendar_events"("id"),
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "start_time" TIMESTAMP NOT NULL,
        "end_time" TIMESTAMP,
        "total_seconds" INTEGER,
        "status" TEXT NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "onboarding_forms",
      sql: `CREATE TABLE IF NOT EXISTS "onboarding_forms" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "user_name" TEXT,
        "user_email" TEXT,
        "user_phone" TEXT,
        "user_location" TEXT,
        "business_address" TEXT,
        "installation_range" TEXT,
        "charge_travel_time" TEXT,
        "setup_cleanup_time" TEXT,
        "team_size" TEXT,
        "scheduling_poc" TEXT,
        "calendar_owner" TEXT,
        "sub_installer_count" TEXT,
        "sub_installer_coordinator" TEXT,
        "customer_notification" TEXT,
        "has_bucket_truck" TEXT,
        "bucket_truck_min_time" TEXT,
        "bucket_truck_two_installers" TEXT,
        "ladder_max_height" TEXT,
        "ladder_two_people" TEXT,
        "vehicle_graphics" TEXT,
        "has_garage" TEXT,
        "does_wraps" TEXT,
        "installs_posts" TEXT,
        "sign_types" TEXT[] DEFAULT ARRAY[]::text[],
        "pricing_product_list" TEXT,
        "install_time_standards" TEXT,
        "additional_notes" TEXT,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "business_details",
      sql: `CREATE TABLE IF NOT EXISTS "business_details" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "business_name" TEXT,
        "business_address" TEXT,
        "business_city" TEXT,
        "business_state" TEXT,
        "business_zip" TEXT,
        "contact_number" TEXT,
        "business_email" TEXT,
        "website" TEXT,
        "tax_id" TEXT,
        "business_type" TEXT,
        "year_established" TEXT,
        "number_of_employees" TEXT,
        "additional_notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "assistant_files",
      sql: `CREATE TABLE IF NOT EXISTS "assistant_files" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "openai_file_id" TEXT NOT NULL,
        "file_name" TEXT NOT NULL,
        "file_size" INTEGER,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "activity_logs",
      sql: `CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER REFERENCES "users"("id"),
        "user_name" TEXT,
        "user_email" TEXT,
        "user_role" TEXT,
        "action" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "description" TEXT,
        "resource_id" TEXT,
        "resource_type" TEXT,
        "metadata" TEXT,
        "ip_address" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP
      )`,
    },
    {
      label: "subscription_plans",
      sql: `CREATE TABLE IF NOT EXISTS "subscription_plans" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "price" TEXT NOT NULL,
        "original_price" TEXT,
        "event_limit" INTEGER NOT NULL,
        "buffer_limit" INTEGER NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "is_default" BOOLEAN NOT NULL DEFAULT false,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "admin_subscriptions",
      sql: `CREATE TABLE IF NOT EXISTS "admin_subscriptions" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "plan_id" INTEGER NOT NULL REFERENCES "subscription_plans"("id"),
        "status" TEXT NOT NULL DEFAULT 'active',
        "started_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "plan_notification" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "installer_notifications",
      sql: `CREATE TABLE IF NOT EXISTS "installer_notifications" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "calendar_event_id" INTEGER NOT NULL REFERENCES "calendar_events"("id"),
        "status" TEXT NOT NULL DEFAULT 'pending',
        "on_my_way_at" TIMESTAMP,
        "read_at" TIMESTAMP,
        "expires_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "global_tags",
      sql: `CREATE TABLE IF NOT EXISTS "global_tags" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(100) NOT NULL,
        "color" VARCHAR(20) DEFAULT '#3b82f6',
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "owner_tags",
      sql: `CREATE TABLE IF NOT EXISTS "owner_tags" (
        "id" SERIAL PRIMARY KEY,
        "owner_id" INTEGER NOT NULL,
        "name" VARCHAR(100) NOT NULL,
        "color" VARCHAR(20) DEFAULT '#3b82f6',
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "onboarding_questions",
      sql: `CREATE TABLE IF NOT EXISTS "onboarding_questions" (
        "id" SERIAL PRIMARY KEY,
        "step_name" TEXT NOT NULL,
        "step_title" TEXT NOT NULL,
        "step_icon" TEXT NOT NULL DEFAULT 'HelpCircle',
        "step_description" TEXT DEFAULT '',
        "question_label" TEXT NOT NULL,
        "question_key" TEXT NOT NULL,
        "question_type" TEXT NOT NULL DEFAULT 'text',
        "options" TEXT DEFAULT '',
        "placeholder" TEXT DEFAULT '',
        "required" BOOLEAN DEFAULT false,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "step_order" INTEGER NOT NULL DEFAULT 0,
        "is_active" BOOLEAN DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "email_templates_config",
      sql: `CREATE TABLE IF NOT EXISTS "email_templates_config" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "email_type" TEXT NOT NULL,
        "subject" TEXT,
        "body_html" TEXT,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "email_signatures",
      sql: `CREATE TABLE IF NOT EXISTS "email_signatures" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "company_name" TEXT,
        "address" TEXT,
        "phone" TEXT,
        "email" TEXT,
        "website" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "session",
      sql: `CREATE TABLE IF NOT EXISTS "session" (
        "sid" VARCHAR NOT NULL PRIMARY KEY,
        "sess" JSON NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL
      )`,
    },
    {
      label: "surveys",
      sql: `CREATE TABLE IF NOT EXISTS "surveys" (
        "id" SERIAL PRIMARY KEY,
        "calendar_event_id" INTEGER REFERENCES "calendar_events"("id"),
        "job_name" TEXT NOT NULL,
        "address" TEXT,
        "description" TEXT,
        "general_notes" TEXT,
        "assessment_data" JSONB,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "created_by" INTEGER REFERENCES "users"("id"),
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "survey_photos",
      sql: `CREATE TABLE IF NOT EXISTS "survey_photos" (
        "id" SERIAL PRIMARY KEY,
        "survey_id" INTEGER NOT NULL REFERENCES "surveys"("id"),
        "original_image_url" TEXT NOT NULL,
        "annotated_image_url" TEXT,
        "note" TEXT,
        "measurements" JSONB,
        "has_annotations" BOOLEAN NOT NULL DEFAULT false,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "app_settings",
      sql: `CREATE TABLE IF NOT EXISTS "app_settings" (
        "key" TEXT PRIMARY KEY,
        "value" TEXT,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      label: "assets",
      sql: `CREATE TABLE IF NOT EXISTS "assets" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "uploaded_by_user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "file_name" TEXT NOT NULL,
        "file_url" TEXT NOT NULL,
        "file_type" TEXT NOT NULL,
        "file_size" INTEGER NOT NULL,
        "title" TEXT,
        "description" TEXT,
        "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
        "source" TEXT,
        "ai_tagged_at" TIMESTAMP,
        "asset_date" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "project_name" TEXT,
        "project_address" TEXT,
        "job_number" TEXT,
        "captured_by" TEXT,
        "source_display" TEXT,
        "customer_name" TEXT,
        "customer_phone" TEXT,
        "customer_email" TEXT
      )`,
    },
    {
      label: "asset_manager_access",
      sql: `CREATE TABLE IF NOT EXISTS "asset_manager_access" (
        "id" SERIAL PRIMARY KEY,
        "owner_id" INTEGER NOT NULL REFERENCES "users"("id") UNIQUE,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "enabled_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "companycam_api_key" TEXT,
        "companycam_last_synced_at" TIMESTAMP,
        "companycam_sync_started_at" TIMESTAMP,
        "companycam_sync_count" INTEGER,
        "google_drive_refresh_token" TEXT,
        "google_drive_email" TEXT,
        "google_drive_folder_id" TEXT,
        "google_drive_folder_name" TEXT,
        "google_drive_last_synced_at" TIMESTAMP
      )`,
    },
    {
      label: "asset_tag_library",
      sql: `CREATE TABLE IF NOT EXISTS "asset_tag_library" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "tag_name" TEXT NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("admin_id", "tag_name")
      )`,
    },
    {
      label: "feedback_items",
      sql: `CREATE TABLE IF NOT EXISTS "feedback_items" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER REFERENCES "users"("id"),
        "page_url" TEXT NOT NULL,
        "page_title" TEXT,
        "feedback_type" TEXT NOT NULL DEFAULT 'bug',
        "notes" TEXT,
        "status" TEXT NOT NULL DEFAULT 'new',
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    },
  ];

  let tablesCreated = 0;
  for (const t of tableCreations) {
    try {
      await pool.query(t.sql);
      tablesCreated++;
    } catch (err) {
      console.warn(`[Seeder] Table ensure skipped (${t.label}):`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[Seeder] Table creation complete — ${tablesCreated}/${tableCreations.length} tables ensured`);

  const migrations: Array<{ label: string; sql: string }> = [
    // ── calendar_events ──────────────────────────────────────────────────────
    {
      label: "calendar_events.work_job_number",
      sql: `ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS work_job_number TEXT`,
    },
    {
      label: "calendar_events.customer_name",
      sql: `ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS customer_name TEXT`,
    },
    {
      label: "calendar_events.customer_phone",
      sql: `ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS customer_phone TEXT`,
    },
    {
      label: "calendar_events.customer_email",
      sql: `ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS customer_email TEXT`,
    },

    // ── assets — project metadata columns ────────────────────────────────────
    {
      label: "assets.project_name",
      sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS project_name TEXT`,
    },
    {
      label: "assets.project_address",
      sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS project_address TEXT`,
    },
    {
      label: "assets.job_number",
      sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS job_number TEXT`,
    },
    {
      label: "assets.captured_by",
      sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS captured_by TEXT`,
    },
    {
      label: "assets.source_display",
      sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS source_display TEXT`,
    },

    // ── assets — customer columns (May 2026 / installiq source) ─────────────
    {
      label: "assets.customer_name",
      sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS customer_name TEXT`,
    },
    {
      label: "assets.customer_phone",
      sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS customer_phone TEXT`,
    },
    {
      label: "assets.customer_email",
      sql: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS customer_email TEXT`,
    },

    // ── assets — dedup indexes (names match auto-migrate) ────────────────────
    {
      label: "assets_installiq_dedup index",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS assets_installiq_dedup
            ON assets (admin_id, file_url)
            WHERE source = 'installiq'`,
    },
    {
      label: "assets_gdrive_dedup index",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS assets_gdrive_dedup
            ON assets (admin_id, file_name)
            WHERE source = 'google-drive'`,
    },

    // ── asset_manager_access — companycam columns ────────────────────────────
    {
      label: "asset_manager_access.companycam_api_key",
      sql: `ALTER TABLE asset_manager_access ADD COLUMN IF NOT EXISTS companycam_api_key TEXT`,
    },
    {
      label: "asset_manager_access.companycam_last_synced_at",
      sql: `ALTER TABLE asset_manager_access ADD COLUMN IF NOT EXISTS companycam_last_synced_at TIMESTAMP`,
    },
    {
      label: "asset_manager_access.google_drive_refresh_token",
      sql: `ALTER TABLE asset_manager_access ADD COLUMN IF NOT EXISTS google_drive_refresh_token TEXT`,
    },
    {
      label: "asset_manager_access.google_drive_email",
      sql: `ALTER TABLE asset_manager_access ADD COLUMN IF NOT EXISTS google_drive_email TEXT`,
    },
    {
      label: "asset_manager_access.google_drive_folder_id",
      sql: `ALTER TABLE asset_manager_access ADD COLUMN IF NOT EXISTS google_drive_folder_id TEXT`,
    },
    {
      label: "asset_manager_access.google_drive_folder_name",
      sql: `ALTER TABLE asset_manager_access ADD COLUMN IF NOT EXISTS google_drive_folder_name TEXT`,
    },
    {
      label: "asset_manager_access.google_drive_last_synced_at",
      sql: `ALTER TABLE asset_manager_access ADD COLUMN IF NOT EXISTS google_drive_last_synced_at TIMESTAMP`,
    },

    // ── activity_logs — soft-delete support ─────────────────────────────────
    {
      label: "activity_logs.deleted_at",
      sql: `ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`,
    },

    // ── users — extended profile / sender fields ─────────────────────────────
    {
      label: "users.pdf_logo_url",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS pdf_logo_url TEXT`,
    },
    {
      label: "users.pdf_template_url",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS pdf_template_url TEXT`,
    },
    {
      label: "users.pdf_company_name",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS pdf_company_name TEXT`,
    },
    {
      label: "users.pdf_company_address",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS pdf_company_address TEXT`,
    },
    {
      label: "users.pdf_company_phone",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS pdf_company_phone TEXT`,
    },
    {
      label: "users.pdf_company_email",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS pdf_company_email TEXT`,
    },
    {
      label: "users.deleted_at",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`,
    },
    {
      label: "users.signsuiteiq_admin_id",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS signsuiteiq_admin_id INTEGER`,
    },
    {
      label: "availability_blocks.display_name",
      sql: `ALTER TABLE availability_blocks ADD COLUMN IF NOT EXISTS display_name TEXT`,
    },
  ];

  let applied = 0;
  for (const m of migrations) {
    try {
      await pool.query(m.sql);
      applied++;
    } catch (err) {
      console.warn(`[Seeder] Migration skipped (${m.label}):`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[Seeder] Schema migrations complete — ${applied}/${migrations.length} statements executed`);
}

export async function runSeeders(): Promise<void> {
  console.log("[Seeder] Running seeders...");

  try {
    await seedSchemaMigrations();
  } catch (err) {
    console.error("[Seeder] Failed to run schema migrations:", err instanceof Error ? err.message : err);
  }

  try {
    await seedMasterAdmins();
  } catch (err) {
    console.error("[Seeder] Failed to seed master admins:", err instanceof Error ? err.message : err);
  }

  try {
    await seedOwnerAdmin();
  } catch (err) {
    console.error("[Seeder] Failed to seed owner admin:", err instanceof Error ? err.message : err);
  }

  try {
    await seedVjkalwaniYahoo();
  } catch (err) {
    console.error("[Seeder] Failed to seed vjkalwani@yahoo.com:", err instanceof Error ? err.message : err);
  }

  try {
    await seedTestInstaller();
  } catch (err) {
    console.error("[Seeder] Failed to seed test installer:", err instanceof Error ? err.message : err);
  }

  try {
    await seedSubscriptionPlans();
  } catch (err) {
    console.error("[Seeder] Failed to seed subscription plans:", err instanceof Error ? err.message : err);
  }

  try {
    await seedAppSettings();
  } catch (err) {
    console.error("[Seeder] Failed to seed app settings:", err instanceof Error ? err.message : err);
  }

  try {
    await seedOnboardingQuestions();
  } catch (err) {
    console.error("[Seeder] Failed to seed onboarding questions:", err instanceof Error ? err.message : err);
  }

  try {
    await seedGlobalTags();
  } catch (err) {
    console.error("[Seeder] Failed to seed global tags:", err instanceof Error ? err.message : err);
  }

  try {
    await seedSampleCalendarEvents();
  } catch (err) {
    console.error("[Seeder] Failed to seed sample calendar events:", err instanceof Error ? err.message : err);
  }

  try {
    await fixMislinkedUsers();
  } catch (err) {
    console.error("[Seeder] Failed to fix mislinked users:", err instanceof Error ? err.message : err);
  }

  try {
    await seedAssetManagerAccess();
  } catch (err) {
    console.error("[Seeder] Failed to seed asset manager access:", err instanceof Error ? err.message : err);
  }

  try {
    await seedAssetTagLibrary();
  } catch (err) {
    console.error("[Seeder] Failed to seed asset tag library:", err instanceof Error ? err.message : err);
  }

  console.log("[Seeder] Seeders complete");
}

async function seedAssetManagerAccess() {
  const { pool } = await import("./db");

  // Admins that should have asset manager enabled by default (owner admin)
  const enabledAdmins = ["saniyatanyal1@gmail.com", "vjkalwani@yahoo.com"];
  for (const email of enabledAdmins) {
    const res = await pool.query(
      `SELECT id FROM users WHERE email ILIKE $1 AND deleted_at IS NULL LIMIT 1`,
      [email]
    );
    if (res.rows.length === 0) continue;
    const ownerId = res.rows[0].id;
    await pool.query(
      `INSERT INTO asset_manager_access (owner_id, enabled)
       VALUES ($1, true)
       ON CONFLICT (owner_id) DO UPDATE SET enabled = true`,
      [ownerId]
    );
    console.log(`[Seeder] Ensured asset_manager_access enabled for ${email} (id=${ownerId})`);
  }

  // Admins that should have asset manager disabled (must be explicitly enabled by super admin)
  const disabledAdmins: string[] = [];
  for (const email of disabledAdmins) {
    const res = await pool.query(
      `SELECT id FROM users WHERE email ILIKE $1 AND deleted_at IS NULL LIMIT 1`,
      [email]
    );
    if (res.rows.length === 0) {
      console.log(`[Seeder] ${email} not found, skipping asset_manager_access seed`);
      continue;
    }
    const ownerId = res.rows[0].id;
    await pool.query(
      `INSERT INTO asset_manager_access (owner_id, enabled)
       VALUES ($1, false)
       ON CONFLICT (owner_id) DO UPDATE SET enabled = false`,
      [ownerId]
    );
    console.log(`[Seeder] Ensured asset_manager_access disabled for ${email} (id=${ownerId})`);
  }
}

// Tags that were incorrectly seeded in a previous run — remove them on startup.
const STALE_ASSET_TAGS = [
  "Before Install", "After Install", "In Progress", "Damage", "Close Up",
  "Wide Shot", "Measurement", "Materials", "Site Condition", "Safety Issue",
  "Completed", "Permit", "Night Shot", "Vehicle", "Electrical",
];

async function seedAssetTagLibrary() {
  const { pool } = await import("./db");

  // Step 1: Remove stale custom tags that were incorrectly seeded previously.
  // Global tags are the source of truth — per-admin libraries mirror them.
  if (STALE_ASSET_TAGS.length > 0) {
    const placeholders = STALE_ASSET_TAGS.map((_, i) => `$${i + 1}`).join(", ");
    const deleted = await pool.query(
      `DELETE FROM asset_tag_library WHERE tag_name IN (${placeholders})`,
      STALE_ASSET_TAGS
    );
    if (deleted.rowCount && deleted.rowCount > 0) {
      console.log(`[Seeder] Removed ${deleted.rowCount} stale asset tags (replaced by global tags)`);
    }
  }

  // Step 2: Read the current global tags — these are the shared, consistent label set.
  const globalTagsRes = await pool.query(`SELECT name FROM global_tags ORDER BY name ASC`);
  if (globalTagsRes.rows.length === 0) {
    console.log("[Seeder] No global tags found — skipping asset_tag_library seed");
    return;
  }
  const globalTagNames: string[] = globalTagsRes.rows.map((r: { name: string }) => r.name);

  // Step 3: For every admin, sync global tags into their asset_tag_library.
  // ON CONFLICT DO NOTHING preserves any extra custom tags they added via the UI.
  const adminRes = await pool.query(
    `SELECT id, email FROM users WHERE role = 'admin' AND deleted_at IS NULL`
  );
  if (adminRes.rows.length === 0) {
    console.log("[Seeder] No admin accounts found for asset_tag_library seed");
    return;
  }

  let totalAdded = 0;
  for (const admin of adminRes.rows) {
    let added = 0;
    for (const tagName of globalTagNames) {
      const res = await pool.query(
        `INSERT INTO asset_tag_library (admin_id, tag_name)
         VALUES ($1, $2)
         ON CONFLICT (admin_id, tag_name) DO NOTHING`,
        [admin.id, tagName]
      );
      if (res.rowCount && res.rowCount > 0) added++;
    }
    totalAdded += added;
    if (added > 0) {
      console.log(`[Seeder] Added ${added} global tags to asset_tag_library for admin ${admin.email} (id=${admin.id})`);
    }
  }

  if (totalAdded === 0) {
    console.log("[Seeder] asset_tag_library already up to date for all admins");
  } else {
    console.log(`[Seeder] asset_tag_library sync complete — ${totalAdded} tags added across ${adminRes.rows.length} admin(s)`);
  }
}
