---
name: Dual schema migration paths (auto-migrate + seeders)
description: New DB columns must be added in BOTH startup migration paths or production breaks with Postgres 42703.
---

# New columns need updates in two startup migration paths

When you add a column to the Drizzle schema (`shared/schema.ts`), the column is NOT
automatically created on existing databases. The app self-migrates on startup via TWO
independent paths, and a new column must be added to BOTH:

1. `server/auto-migrate.ts`
   - The base `CREATE TABLE "users" (...)` block (for brand-new DBs).
   - The `addMissingColumns` list (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`) for existing DBs.
2. `server/seeders.ts`
   - The base `CREATE TABLE` block.
   - The `seedSchemaMigrations` `migrations[]` array (logs `[Seeder] Schema migrations complete — N/N`).

**Why:** Dev and production use SEPARATE DigitalOcean managed databases. A column can
exist in dev (because dev was migrated) but be missing in production. On the next prod
deploy the new code does `SELECT ... signsuiteiq_admin_id`, the prod column doesn't
exist, and EVERY user lookup throws Postgres `42703 column does not exist` → 500 on all
auth endpoints (login, /api/auth/me, SSO callback). This took down all sign-in once.

**How to apply:** Any time you add a column, mirror it into all four spots above. The
ALTER statements are idempotent (`IF NOT EXISTS`), so they're safe to leave permanently.
Startup order is safe: `autoMigrate()` → `runSeeders()` → `registerRoutes()`, so routes
never serve before columns are ensured. The agent cannot write to the prod DB (read-only)
and cannot push — production only picks up the migration when the user redeploys.
