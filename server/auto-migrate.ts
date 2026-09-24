import pg from "pg";

const { Pool } = pg;

export async function autoMigrate(databaseUrl: string, useSsl: boolean): Promise<void> {
  console.log("[AutoMigrate] Checking database schema...");
  
  const pool = new Pool({
    connectionString: databaseUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, ""),
    connectionTimeoutMillis: 15000,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const tableCheck = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'users'
    `);

    if (tableCheck.rows.length > 0) {
      console.log("[AutoMigrate] Tables already exist, checking for missing columns...");
      await addMissingColumns(pool);
      await ensureMissingTables(pool);
      return;
    }

    console.log("[AutoMigrate] Fresh database detected — creating all tables...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "users" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ users");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "projects" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ projects");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "calendar_events" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ calendar_events");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "weather_cache" (
        "id" SERIAL PRIMARY KEY,
        "latitude" TEXT NOT NULL,
        "longitude" TEXT NOT NULL,
        "time_bucket" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "payload_json" TEXT NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ weather_cache");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "jobs" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ jobs");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "install_events" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ install_events");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "attachments" (
        "id" SERIAL PRIMARY KEY,
        "job_id" INTEGER NOT NULL REFERENCES "jobs"("id"),
        "file_url" TEXT NOT NULL,
        "file_name" TEXT NOT NULL,
        "file_type" TEXT,
        "category" TEXT NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ attachments");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "notification_logs" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ notification_logs");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "event_assignments" (
        "id" SERIAL PRIMARY KEY,
        "calendar_event_id" INTEGER NOT NULL REFERENCES "calendar_events"("id"),
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "assigned_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ event_assignments");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "reschedule_requests" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ reschedule_requests");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "token" TEXT NOT NULL UNIQUE,
        "expires_at" TIMESTAMP NOT NULL,
        "used" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ password_reset_tokens");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "calendar_filter_colors" (
        "id" SERIAL PRIMARY KEY,
        "status_key" TEXT NOT NULL UNIQUE,
        "color" TEXT NOT NULL,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ calendar_filter_colors");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "job_timers" (
        "id" SERIAL PRIMARY KEY,
        "calendar_event_id" INTEGER NOT NULL REFERENCES "calendar_events"("id"),
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "start_time" TIMESTAMP NOT NULL,
        "end_time" TIMESTAMP,
        "total_seconds" INTEGER,
        "status" TEXT NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ job_timers");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "onboarding_forms" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ onboarding_forms");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "business_details" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ business_details");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "assistant_files" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "openai_file_id" TEXT NOT NULL,
        "file_name" TEXT NOT NULL,
        "file_size" INTEGER,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ assistant_files");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "activity_logs" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ activity_logs");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "subscription_plans" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ subscription_plans");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "admin_subscriptions" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "plan_id" INTEGER NOT NULL REFERENCES "subscription_plans"("id"),
        "status" TEXT NOT NULL DEFAULT 'active',
        "started_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "plan_notification" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ admin_subscriptions");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "installer_notifications" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "calendar_event_id" INTEGER NOT NULL REFERENCES "calendar_events"("id"),
        "status" TEXT NOT NULL DEFAULT 'pending',
        "on_my_way_at" TIMESTAMP,
        "read_at" TIMESTAMP,
        "expires_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ installer_notifications");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "global_tags" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(100) NOT NULL,
        "color" VARCHAR(20) DEFAULT '#3b82f6',
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Ensure unique constraint on global_tags.name (safe to run repeatedly)
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "global_tags_name_unique"
      ON global_tags (LOWER(name));
    `);
    console.log("[AutoMigrate] ✓ global_tags");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "owner_tags" (
        "id" SERIAL PRIMARY KEY,
        "owner_id" INTEGER NOT NULL,
        "name" VARCHAR(100) NOT NULL,
        "color" VARCHAR(20) DEFAULT '#3b82f6',
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ owner_tags");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "onboarding_questions" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ onboarding_questions");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "email_templates_config" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "email_type" TEXT NOT NULL,
        "subject" TEXT,
        "body_html" TEXT,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ email_templates_config");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "email_signatures" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "company_name" TEXT,
        "address" TEXT,
        "phone" TEXT,
        "email" TEXT,
        "website" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ email_signatures");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" VARCHAR NOT NULL PRIMARY KEY,
        "sess" JSON NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    console.log("[AutoMigrate] ✓ session");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "surveys" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ surveys");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "survey_photos" (
        "id" SERIAL PRIMARY KEY,
        "survey_id" INTEGER NOT NULL REFERENCES "surveys"("id"),
        "original_image_url" TEXT NOT NULL,
        "annotated_image_url" TEXT,
        "note" TEXT,
        "measurements" JSONB,
        "has_annotations" BOOLEAN NOT NULL DEFAULT false,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ survey_photos");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "assets" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ assets");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "asset_manager_access" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ asset_manager_access");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "asset_tag_library" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
        "tag_name" TEXT NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("admin_id", "tag_name")
      );
    `);
    console.log("[AutoMigrate] ✓ asset_tag_library");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key" TEXT PRIMARY KEY,
        "value" TEXT,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ app_settings");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "feedback_items" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER REFERENCES "users"("id"),
        "page_url" TEXT NOT NULL,
        "page_title" TEXT,
        "feedback_type" TEXT NOT NULL DEFAULT 'bug',
        "notes" TEXT,
        "status" TEXT NOT NULL DEFAULT 'new',
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[AutoMigrate] ✓ feedback_items");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "availability_blocks" (
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
      );
    `);
    console.log("[AutoMigrate] ✓ availability_blocks");

    console.log("[AutoMigrate] ✓ All tables created successfully!");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AutoMigrate] ERROR:", msg);
    if (err instanceof Error && err.stack) {
      console.error("[AutoMigrate] STACK:", err.stack);
    }
    throw err;
  } finally {
    await pool.end();
  }
}

async function addMissingColumns(pool: pg.Pool): Promise<void> {
  const columnChecks: { table: string; column: string; sql: string }[] = [
    { table: "users", column: "deleted_at", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP` },
    { table: "users", column: "sender_first_name", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sender_first_name" TEXT` },
    { table: "users", column: "sender_from_email", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sender_from_email" TEXT` },
    { table: "users", column: "sender_reply_to", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sender_reply_to" TEXT` },
    { table: "users", column: "sender_company_address", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sender_company_address" TEXT` },
    { table: "users", column: "sender_city", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sender_city" TEXT` },
    { table: "users", column: "sender_country", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sender_country" TEXT` },
    { table: "users", column: "sender_nickname", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sender_nickname" TEXT` },
    { table: "users", column: "sender_verified", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sender_verified" BOOLEAN NOT NULL DEFAULT false` },
    { table: "users", column: "sendgrid_sender_id", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sendgrid_sender_id" INTEGER` },
    { table: "users", column: "google_id", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" TEXT` },
    { table: "users", column: "google_email", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_email" TEXT` },
    { table: "users", column: "google_enabled", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_enabled" BOOLEAN NOT NULL DEFAULT false` },
    { table: "users", column: "signsuiteiq_user_id", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signsuiteiq_user_id" INTEGER; CREATE UNIQUE INDEX IF NOT EXISTS "users_signsuiteiq_user_id_unique" ON "users"("signsuiteiq_user_id") WHERE "signsuiteiq_user_id" IS NOT NULL` },
    { table: "users", column: "signsuiteiq_admin_id", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signsuiteiq_admin_id" INTEGER` },
    { table: "users", column: "payment_required", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payment_required" BOOLEAN NOT NULL DEFAULT false` },
    { table: "users", column: "payment_completed", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payment_completed" BOOLEAN NOT NULL DEFAULT false` },
    { table: "users", column: "pdf_logo_url", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pdf_logo_url" TEXT` },
    { table: "users", column: "pdf_template_url", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pdf_template_url" TEXT` },
    { table: "users", column: "pdf_company_name", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pdf_company_name" TEXT` },
    { table: "users", column: "pdf_company_address", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pdf_company_address" TEXT` },
    { table: "users", column: "pdf_company_phone", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pdf_company_phone" TEXT` },
    { table: "users", column: "pdf_company_email", sql: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pdf_company_email" TEXT` },
    { table: "calendar_events", column: "secondary_poc_name", sql: `ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "secondary_poc_name" TEXT` },
    { table: "calendar_events", column: "secondary_poc_phone", sql: `ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "secondary_poc_phone" TEXT` },
    { table: "calendar_events", column: "secondary_poc_email", sql: `ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "secondary_poc_email" TEXT` },
    { table: "surveys", column: "assessment_data", sql: `ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "assessment_data" JSONB` },
    { table: "survey_photos", column: "measurements", sql: `ALTER TABLE "survey_photos" ADD COLUMN IF NOT EXISTS "measurements" JSONB` },
    { table: "assets", column: "asset_date", sql: `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "asset_date" TIMESTAMP` },
    { table: "assets", column: "project_name", sql: `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "project_name" TEXT` },
    { table: "assets", column: "project_address", sql: `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "project_address" TEXT` },
    { table: "assets", column: "job_number", sql: `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "job_number" TEXT` },
    { table: "assets", column: "captured_by", sql: `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "captured_by" TEXT` },
    { table: "assets", column: "source_display", sql: `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "source_display" TEXT` },
    { table: "assets", column: "customer_name", sql: `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "customer_name" TEXT` },
    { table: "assets", column: "customer_phone", sql: `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "customer_phone" TEXT` },
    { table: "assets", column: "customer_email", sql: `ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "customer_email" TEXT` },
    { table: "asset_manager_access", column: "companycam_api_key", sql: `ALTER TABLE "asset_manager_access" ADD COLUMN IF NOT EXISTS "companycam_api_key" TEXT` },
    { table: "asset_manager_access", column: "companycam_last_synced_at", sql: `ALTER TABLE "asset_manager_access" ADD COLUMN IF NOT EXISTS "companycam_last_synced_at" TIMESTAMP` },
    { table: "asset_manager_access", column: "companycam_sync_started_at", sql: `ALTER TABLE "asset_manager_access" ADD COLUMN IF NOT EXISTS "companycam_sync_started_at" TIMESTAMP` },
    { table: "asset_manager_access", column: "companycam_sync_count", sql: `ALTER TABLE "asset_manager_access" ADD COLUMN IF NOT EXISTS "companycam_sync_count" INTEGER` },
    { table: "asset_manager_access", column: "google_drive_refresh_token", sql: `ALTER TABLE "asset_manager_access" ADD COLUMN IF NOT EXISTS "google_drive_refresh_token" TEXT` },
    { table: "asset_manager_access", column: "google_drive_email", sql: `ALTER TABLE "asset_manager_access" ADD COLUMN IF NOT EXISTS "google_drive_email" TEXT` },
    { table: "asset_manager_access", column: "google_drive_folder_id", sql: `ALTER TABLE "asset_manager_access" ADD COLUMN IF NOT EXISTS "google_drive_folder_id" TEXT` },
    { table: "asset_manager_access", column: "google_drive_folder_name", sql: `ALTER TABLE "asset_manager_access" ADD COLUMN IF NOT EXISTS "google_drive_folder_name" TEXT` },
    { table: "asset_manager_access", column: "google_drive_last_synced_at", sql: `ALTER TABLE "asset_manager_access" ADD COLUMN IF NOT EXISTS "google_drive_last_synced_at" TIMESTAMP` },
    { table: "admin_subscriptions", column: "plan_notification", sql: `ALTER TABLE "admin_subscriptions" ADD COLUMN IF NOT EXISTS "plan_notification" TEXT` },
    { table: "availability_blocks", column: "display_name", sql: `ALTER TABLE "availability_blocks" ADD COLUMN IF NOT EXISTS "display_name" TEXT` },
  ];

  let added = 0;
  for (const check of columnChecks) {
    try {
      const result = await pool.query(`
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = $2
      `, [check.table, check.column]);
      if (result.rows.length === 0) {
        await pool.query(check.sql);
        console.log(`[AutoMigrate] Added missing column: ${check.table}.${check.column}`);
        added++;
      }
    } catch (err) {
      console.warn(`[AutoMigrate] Warning adding ${check.table}.${check.column}:`, err instanceof Error ? err.message : err);
    }
  }

  await ensureMissingTables(pool);
  await ensureMissingIndexes(pool);
  await applyOneTimeFixups(pool);

  if (added === 0) {
    console.log("[AutoMigrate] Schema is up to date");
  }
}

async function ensureMissingIndexes(pool: InstanceType<typeof pg.Pool>): Promise<void> {
  const indexes: { name: string; sql: string }[] = [
    {
      name: "assets_gdrive_dedup",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS assets_gdrive_dedup
            ON assets (admin_id, file_name)
            WHERE source = 'google-drive'`,
    },
    {
      name: "assets_installiq_dedup",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS assets_installiq_dedup
            ON assets (admin_id, file_url)
            WHERE source = 'installiq'`,
    },
  ];

  for (const idx of indexes) {
    try {
      await pool.query(idx.sql);
      const exists = await pool.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
        [idx.name]
      );
      if (exists.rows.length > 0) {
        console.log(`[AutoMigrate] ✓ Index ensured: ${idx.name}`);
      }
    } catch (err) {
      console.warn(`[AutoMigrate] Warning ensuring index ${idx.name}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function applyOneTimeFixups(pool: InstanceType<typeof pg.Pool>): Promise<void> {
  // Fixup: installiq assets must never have ai_tagged_at set — tags come from the dashboard
  // workflow, not from AI tagging within the Asset Manager. Clear any previously set values.
  try {
    const result = await pool.query(
      `UPDATE assets SET ai_tagged_at = NULL WHERE source = 'installiq' AND ai_tagged_at IS NOT NULL`
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[AutoMigrate] ✓ Cleared ai_tagged_at on ${result.rowCount} installiq asset(s)`);
    }
  } catch (err) {
    console.warn("[AutoMigrate] Warning clearing installiq ai_tagged_at:", err instanceof Error ? err.message : err);
  }

  // Fixup: drop obsolete screenshot_url column from feedback_items (screenshots
  // are no longer captured by the feedback widget).
  try {
    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'feedback_items' AND column_name = 'screenshot_url'`
    );
    if (col.rows.length > 0) {
      await pool.query(`ALTER TABLE "feedback_items" DROP COLUMN "screenshot_url"`);
      console.log("[AutoMigrate] ✓ Dropped obsolete feedback_items.screenshot_url");
    }
  } catch (err) {
    console.warn("[AutoMigrate] Warning dropping feedback_items.screenshot_url:", err instanceof Error ? err.message : err);
  }
}

async function ensureMissingTables(pool: InstanceType<typeof pg.Pool>) {
  const tablesToCheck = [
    "session", "activity_logs", "subscription_plans", "admin_subscriptions",
    "installer_notifications", "global_tags", "owner_tags", "onboarding_questions",
    "email_templates_config", "email_signatures", "password_reset_tokens",
    "calendar_filter_colors", "job_timers", "business_details", "assistant_files",
    "reschedule_requests", "event_assignments", "onboarding_forms",
    "surveys", "survey_photos", "app_settings",
    "assets", "asset_manager_access", "asset_tag_library",
    "feedback_items", "availability_blocks"
  ];

  for (const tbl of tablesToCheck) {
    const check = await pool.query(`SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1`, [tbl]);
    if (check.rows.length === 0) {
      console.log(`[AutoMigrate] Table "${tbl}" missing — creating...`);
      try {
        if (tbl === "surveys") {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS "surveys" (
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
            );
          `);
          console.log(`[AutoMigrate] ✓ Created surveys table`);
        } else if (tbl === "survey_photos") {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS "survey_photos" (
              "id" SERIAL PRIMARY KEY,
              "survey_id" INTEGER NOT NULL REFERENCES "surveys"("id"),
              "original_image_url" TEXT NOT NULL,
              "annotated_image_url" TEXT,
              "note" TEXT,
              "measurements" JSONB,
              "has_annotations" BOOLEAN NOT NULL DEFAULT false,
              "sort_order" INTEGER NOT NULL DEFAULT 0,
              "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
          `);
          console.log(`[AutoMigrate] ✓ Created survey_photos table`);
        } else if (tbl === "app_settings") {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS "app_settings" (
              "key" TEXT PRIMARY KEY,
              "value" TEXT,
              "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
          `);
          console.log(`[AutoMigrate] ✓ Created app_settings table`);
        } else if (tbl === "assets") {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS "assets" (
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
            );
          `);
          console.log(`[AutoMigrate] ✓ Created assets table`);
        } else if (tbl === "asset_manager_access") {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS "asset_manager_access" (
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
            );
          `);
          console.log(`[AutoMigrate] ✓ Created asset_manager_access table`);
        } else if (tbl === "asset_tag_library") {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS "asset_tag_library" (
              "id" SERIAL PRIMARY KEY,
              "admin_id" INTEGER NOT NULL REFERENCES "users"("id"),
              "tag_name" TEXT NOT NULL,
              "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE("admin_id", "tag_name")
            );
          `);
          console.log(`[AutoMigrate] ✓ Created asset_tag_library table`);
        } else if (tbl === "feedback_items") {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS "feedback_items" (
              "id" SERIAL PRIMARY KEY,
              "user_id" INTEGER REFERENCES "users"("id"),
              "page_url" TEXT NOT NULL,
              "page_title" TEXT,
              "feedback_type" TEXT NOT NULL DEFAULT 'bug',
              "notes" TEXT,
              "status" TEXT NOT NULL DEFAULT 'new',
              "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
          `);
          console.log(`[AutoMigrate] ✓ Created feedback_items table`);
        } else if (tbl === "availability_blocks") {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS "availability_blocks" (
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
            );
          `);
          console.log(`[AutoMigrate] ✓ Created availability_blocks table`);
        } else {
          console.log(`[AutoMigrate] Table "${tbl}" needs manual migration`);
        }
      } catch (err) {
        console.warn(`[AutoMigrate] Warning creating table ${tbl}:`, err instanceof Error ? err.message : err);
      }
    }
  }
}
