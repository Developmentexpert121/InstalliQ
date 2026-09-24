# InstalliQ.ai — Developer Documentation

AI-powered project & field-proof platform for signage installation businesses. This document covers everything a developer needs to set up, understand, extend, and deploy the project.

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Wouter (routing), TanStack React Query v5, React Hook Form + Zod, Shadcn/ui (Radix), Tailwind CSS |
| Backend | Express.js + TypeScript, express-session (Postgres-backed via `connect-pg-simple`), Multer (uploads), bcryptjs |
| Database | PostgreSQL — DigitalOcean managed (primary), Drizzle ORM, drizzle-zod, drizzle-kit |
| AI | OpenAI SDK (`gpt-4o`) — image analysis, PDF data extraction, Assistants API for scheduling |
| Storage | DigitalOcean Spaces (S3-compatible) via `@aws-sdk/client-s3` |
| Email | Neo Space SMTP (primary, via Nodemailer), SendGrid (sender verification, fallback) |
| Payments | Razorpay |
| Weather/Geo | OpenWeather API |
| PDF | PDFKit (server-side) |
| Auth helpers | bcryptjs, face-api.js (client-side facial recognition) |

---

## 2. Repository Layout

```
.
├── client/                    # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.tsx            # Route registry (wouter)
│   │   ├── main.tsx           # Entry point
│   │   ├── index.css          # Tailwind + theme tokens (HSL CSS variables)
│   │   ├── pages/             # 30+ top-level pages
│   │   ├── components/        # Shared components + shadcn/ui under components/ui/
│   │   ├── hooks/             # Custom React hooks (incl. use-toast)
│   │   └── lib/               # API client (queryClient.ts), helpers (image-url.ts), etc.
├── server/                    # Backend (Express + TS)
│   ├── index.ts               # App bootstrap, DB connect, middleware, registerRoutes
│   ├── routes.ts              # 200+ Express routes (single file, intentional)
│   ├── storage.ts             # IStorage interface + Drizzle implementation
│   ├── db.ts                  # Postgres pool + Drizzle client
│   ├── auto-migrate.ts        # Idempotent schema bootstrap (CREATE/ALTER on boot)
│   ├── seeders.ts             # Default super-admin, plans, tags, etc.
│   ├── digitalocean-spaces.ts # S3 client + upload/get/delete helpers
│   ├── pdf-processor.ts       # OpenAI PDF & work-order extraction, install-time calc
│   ├── sendgrid.ts            # SendGrid verification + send fallback
│   ├── weather.ts             # OpenWeather + geocoding
│   ├── razorpay.ts            # Razorpay order creation/verification
│   ├── scheduler.ts           # Hourly cron (weather refresh, escalations)
│   ├── asset-manager/         # CompanyCam sync, AI tagger, asset router
│   ├── email-templates.ts     # Templated email send via SMTP
│   ├── config.ts              # Env-driven config defaults
│   └── vite.ts                # Dev: Vite middleware. Prod: serves built client
├── shared/
│   ├── schema.ts              # Drizzle table defs, Zod insert schemas, types (32 tables)
│   └── models/                # Optional secondary models
├── docs/                      # This file lives here
├── scripts/                   # One-off utility scripts
├── drizzle.config.ts          # Drizzle Kit config (db:push)
├── package.json
└── replit.md                  # High-level overview + recent-change log
```

> One-file routing (`server/routes.ts`) and one-file storage (`server/storage.ts`) are intentional — see "Conventions" below.

---

## 3. Local Setup

### Prereqs
- Node 20+
- A Postgres database (any: local, Neon, Supabase, DO managed)
- Optional: DO Spaces credentials, OpenAI key, SMTP creds

### Steps
```bash
git clone <repo>
cd <repo>
cp .env.example .env       # then fill in at minimum DATABASE_URL, SESSION_SECRET, SMTP_*
npm install
npm run db:push            # push schema to your DB (drizzle-kit)
npm run dev                # starts Express + Vite on port 5000
```

Open `http://localhost:5000`. The seeder will create default super-admin accounts on first boot — see `server/seeders.ts` for emails.

### Available scripts
| Script | What it does |
|---|---|
| `npm run dev` | Starts Express + Vite middleware on port 5000 (single port serves API + SPA) |
| `npm run build` | Builds the client (vite) and bundles the server into `dist/index.cjs` |
| `npm start` | Runs the production build (`NODE_ENV=production node dist/index.cjs`) |
| `npm run check` | TypeScript typecheck (`tsc`) |
| `npm run db:push` | Push current `shared/schema.ts` to the DB via `drizzle-kit` |

> `package.json` is locked — do not edit scripts or add deps without using the package manager.

---

## 4. Environment Variables

Full list in `.env.example`. Highlights:

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` or `DIGITALOCEAN_DATABASE_URL` | Yes | Postgres connection. DO variant enables SSL TLS handling. |
| `SESSION_SECRET` | Yes | Express-session secret, ≥32 chars. |
| `SMTP_USER`, `SMTP_PASS` | Yes (for email) | Neo Space SMTP credentials. |
| `OPENAI_API_KEY` | For AI | Enables image analysis, PDF parsing, scheduling assistant. |
| `OPENAI_ASSISTANT_ID` | Optional | Default Assistants API ID for scheduling. |
| `DO_SPACES_KEY/SECRET/BUCKET/REGION/ENDPOINT/CDN_URL` | For uploads | DigitalOcean Spaces. **Endpoint must NOT include bucket name; CDN URL MUST include bucket as subdomain.** |
| `SENDGRID_API_KEY` | Optional | Sender verification + alt email path. |
| `RAZORPAY_KEY_ID/SECRET` | For payments | Subscription checkout. |
| `OPENWEATHER_API_KEY` | For weather | Forecasts on calendar. |
| `GOOGLE_CLIENT_ID/SECRET` | For Google Calendar OAuth | |
| `SIGNSUITEIQ_SSO_SECRET` | For SSO + provisioning | Shared secret with SignSuiteIQ admin panel (used for both SSO callback and the user-provisioning receiver). |
| `VITE_*` | Optional | Anything prefixed `VITE_` is exposed to the browser. |

---

## 5. Architecture

### Single-port full-stack
`server/index.ts` boots Express, mounts session middleware, calls `registerRoutes(httpServer, app)` from `server/routes.ts`, then in **dev** attaches Vite as middleware (HMR) and in **prod** serves the built client from `dist/public`. Everything runs on **port 5000**.

### Multi-tenant role model
- `super_admin` — platform owner, view-only on tenant data, manages global tags / plans / users.
- `admin` (Owner) — owns a workspace: their own users, projects, calendar, tags, assistants, branding, subscription. Data is isolated by `createdBy` chains.
- `user` (Installer) — created by an admin; sees only assigned jobs, uploads photos, tracks time.

Tenant isolation is enforced via `getTeamUserIdsForUser(currentUser)` in `server/routes.ts`, which walks the `createdBy` parent chain to compute the set of allowed user IDs for the current request. **Always use this helper for cross-tenant-sensitive reads/writes.**

### Auth
- Session-based via `express-session` + `connect-pg-simple` (sessions persisted in `session` table).
- Login: `POST /api/auth/login` (username / email / phone + password).
- SSO: SignSuiteIQ admin panel sends users to `/sso/callback?token=…`; server exchanges token at `https://www.signsuiteiq.ai/api/sso/exchange` and creates/updates a local user.
- Provisioning: `POST /api/internal/provision-user` — server-to-server endpoint, auth via `X-App-Secret` header (= `SIGNSUITEIQ_SSO_SECRET`). One-way push from SignSuiteIQ to keep the local users table in sync.
- Password reset: `POST /api/auth/forgot-password` → email link with token from `password_reset_tokens` table → `POST /api/auth/reset-password`.

### Database
- Postgres only. Drizzle ORM, schema in `shared/schema.ts` (32 tables).
- **Schema migration strategy**: there are no migration files. Two mechanisms:
  1. `drizzle-kit push` for local dev (`npm run db:push`).
  2. `server/auto-migrate.ts` runs on every boot in production:
     - Creates any missing tables (idempotent `CREATE TABLE IF NOT EXISTS`).
     - Adds any missing columns from a hard-coded `columnChecks` array (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`).
     - Ensures certain partial unique indexes (assets dedup).
- **When you add a column to `shared/schema.ts`**: also add it to BOTH places in `server/auto-migrate.ts` — the fresh `CREATE TABLE` block AND the `columnChecks` array. Otherwise prod will boot with a missing column. (See the recent `plan_notification` fix.)

### File storage
- All user uploads go to DigitalOcean Spaces under `uploads/<filename>` via `server/digitalocean-spaces.ts`.
- The CDN URL has the form `https://<bucket>.nyc3.digitaloceanspaces.com/uploads/<file>`.
- To **hide the raw DO URL**, attachments in the calendar Documents section are served through a proxy: `GET /api/attachments/:id/download` streams the file from Spaces with a friendly `Content-Disposition`. Use this pattern for any new "open file" UI.

### Frontend data flow
- All API calls go through `client/src/lib/queryClient.ts`. Query keys are arrays: `['/api/projects', id]` (NOT template strings — required for cache invalidation).
- Default `queryFn` is configured globally; queries don't define their own.
- Mutations use `apiRequest` from the same module; remember to call `queryClient.invalidateQueries({ queryKey: [...] })` after.
- All forms use `useForm` + `zodResolver` with the matching insert schema from `@shared/schema`.

---

## 6. Domain Model (32 tables)

| Table | Purpose |
|---|---|
| `users` | All accounts (super_admin / admin / user). Soft-delete via `deletedAt`. SSO link via `signsuiteiq_user_id`. |
| `projects` | Photo-documented installation projects. |
| `attachments` | Files attached to jobs/projects (photos, work orders, proofs). |
| `jobs` + `install_events` + `calendar_events` | The scheduling triplet. A `calendar_event` (booking) ties to one or more `install_events`, each backed by a `job`. |
| `event_assignments` | Which installers are assigned to which calendar events. |
| `reschedule_requests` | Requests from installers for rescheduling. |
| `weather_cache` | Geocode + 5-day forecast cache. |
| `notification_logs` | Delivery log for emails/SMS. |
| `password_reset_tokens` | Forgot-password tokens. |
| `calendar_filter_colors` | Per-user tag-color preferences in calendar UI. |
| `job_timers` | Time-tracking on jobs (installer side). |
| `onboarding_forms` + `onboarding_questions` | Multi-step onboarding & dynamic questionnaire. |
| `business_details` | Per-admin install-time-calc config (address, install range, travel time). |
| `assistant_files` | Knowledge files attached to per-admin OpenAI Assistants. |
| `activity_logs` | Append-only audit trail (auth, projects, AI calls, storage, email). |
| `subscription_plans` + `admin_subscriptions` | Plans (Basic/Standard/Premium) and current subscription per admin (incl. `plan_notification` for in-app banners). |
| `installer_notifications` | In-app notifications for installers. |
| `global_tags` + `owner_tags` + `asset_tag_library` | Tag system: super-admin globals + per-admin custom + asset-manager library. |
| `email_templates_config` + `email_signatures` | Templated, branded outbound email per admin. |
| `surveys` + `survey_photos` | Site-survey docs with photo annotations + PDF reports. |
| `app_settings` | Singleton-style key/value settings table. |
| `assets` + `asset_manager_access` | Asset Manager: aggregated photos/files from multiple sources (upload, CompanyCam, Google Drive, InstalliQ projects). Per-admin access + encrypted CompanyCam token. |
| `feedback_items` | In-app feedback inbox. |

See `shared/schema.ts` for the authoritative definitions, insert schemas (`createInsertSchema(...).omit({ id, createdAt })`), and exported types.

---

## 7. API Surface (overview)

**200 routes total**, all in `server/routes.ts`. Grouped by prefix:

| Prefix | Notable endpoints |
|---|---|
| `/api/auth/*` | login, logout, register, me, forgot-password, reset-password, change-password, google OAuth |
| `/api/users/*` | CRUD on installers (admin scope), team list |
| `/api/projects/*` | CRUD projects + nested photos: `POST /api/projects/:id/images`, `PATCH /api/projects/:id`, archive/unarchive |
| `/api/attachments/:id/download` | Streams a file through our domain (proxies DO Spaces). |
| `/api/attachments/:id` | DELETE — soft-tied to tenant scope. |
| `/api/calendar-events/*` | Full CRUD; `:id/activity` for last-updates timeline. |
| `/api/install-events/*` | Per-job install scheduling links. |
| `/api/jobs/*` | Job CRUD + timers (`/api/job-timers/*`). |
| `/api/reschedule-requests/*` | Installer reschedule workflow. |
| `/api/email-templates/*` + `/api/email-signature/*` | Per-admin templated email config. |
| `/api/sender/*` | SendGrid sender-identity verification. |
| `/api/onboarding/*` + `/api/onboarding-questions/*` | Dynamic onboarding system. |
| `/api/global-tags/*` + `/api/owner-tags/*` | Tag library. |
| `/api/business-details/*` | Per-admin install-time-calc config. |
| `/api/assistant/*` | Per-admin OpenAI Assistant config + knowledge files. |
| `/api/analyze-image` + `/api/extract-work-order` | AI: vision tagging + PDF extraction. |
| `/api/calculate-install-time` | AI: install-time estimator. |
| `/api/surveys/*` | Site survey CRUD + PDF generation. |
| `/api/installer-notifications/*` | Installer-side notifications. |
| `/api/booking-calendar/*` + `/api/confirm-booking` + `/api/reschedule-booking` | Public booking flow. |
| `/api/weather/*` | Forecast + geocode (cached). |
| `/api/feedback/*` | Feedback inbox. |
| `/api/subscription/*` | Plans, current subscription, Razorpay checkout/verify. |
| `/api/assets` + `/api/asset-manager/*` | Asset Manager: search, upload, AI tag-all, CompanyCam config. |
| `/api/admin/*` | Super-admin endpoints (incl. `sync-installiq-assets`). |
| `/api/internal/provision-user` | Server-to-server user provisioning from SignSuiteIQ (X-App-Secret). |
| `/api/health` | Liveness + version. |
| `/api-docs` | Swagger UI; `/api-docs.json` for the spec. |

> All routes that touch tenant-scoped data must call `getTeamUserIdsForUser(currentUser)` and gate access on the resulting ID list.

---

## 8. Frontend Pages (`client/src/pages/`)

| Page | Purpose |
|---|---|
| `login.tsx` / `register.tsx` / `forgot-password.tsx` / `reset-password.tsx` | Auth flows |
| `onboarding.tsx` | First-run questionnaire + uploads |
| `dashboard.tsx` | Completed projects with search/filter/bulk export |
| `project-new.tsx` / `project-detail.tsx` / `archive.tsx` | Project CRUD + archive |
| `google-calendar.tsx` | Main calendar (Day/Week/Month/Agenda views, mobile-responsive, weather strip, "+N More" overflow) |
| `calendar.tsx` | Older calendar variant (kept for compatibility) |
| `confirm-booking.tsx` / `reschedule-booking.tsx` / `reschedule-requests.tsx` | Booking flows |
| `survey.tsx` | Site survey editor with annotation + PDF |
| `time-estimator.tsx` | AI install-time calculator |
| `asset-manager/` | Multi-tab Asset Manager (search, upload, setup) |
| `assistant-settings.tsx` | Per-admin OpenAI Assistant config |
| `email-templates.tsx` | Per-admin email templates + signatures |
| `subscription-plans.tsx` / `payment.tsx` | Plan selection + Razorpay checkout |
| `admin.tsx` | Super-admin tools |
| `account-settings.tsx` | Profile, password, sender verification |
| `activity-logs.tsx` | Audit trail viewer |
| `installer-notifications`, `feedback-inbox.tsx` | In-app notifications + feedback |
| `developer-guide.tsx` / `super-admin-manual.tsx` / `owner-admin-manual.tsx` / `user-manual.tsx` | In-app documentation |

Routes are registered in `client/src/App.tsx`. Add new pages there.

---

## 9. Conventions & Gotchas

### Editing rules
- **Don't edit `package.json`** — use the package-manager tooling.
- **Don't edit `vite.config.ts` or `server/vite.ts`** unless absolutely necessary.
- **Don't edit `drizzle.config.ts`**.
- Frontend env vars must be prefixed `VITE_`, accessed as `import.meta.env.VITE_...`.

### Drizzle / DB
- New column on a table → update **3 places**: `shared/schema.ts`, the fresh `CREATE TABLE` in `auto-migrate.ts` (if the table is in the bootstrap list), and the `columnChecks` array in `auto-migrate.ts`.
- Dev: `npm run db:push`. Prod: auto-migrate on boot.
- Tag column types: `text().array()` (method form), not `array(text())`.
- Insert types: `z.infer<typeof insertXSchema>`. Select types: `typeof xTable.$inferSelect`.

### React Query
- Query keys are arrays. `queryKey: ['/api/projects', id]`.
- Don't define `queryFn` on individual `useQuery` calls — the default fetcher is set up globally.
- Mutations: use `apiRequest` from `@/lib/queryClient`, then call `queryClient.invalidateQueries`.

### Forms
- Always `useForm` + `zodResolver(insertSchema.extend({...}))` from `@shared/schema`.
- Pass `defaultValues` to `useForm` (controlled).
- Debug failed submits with `form.formState.errors`.

### Styling
- Tailwind tokens are HSL CSS vars in `client/src/index.css` — write `H S% L%` (no `hsl()` wrapper).
- Use `@/` alias for client imports, `@shared/` for shared, `@assets/` for `attached_assets/`.
- Icons: `lucide-react` for actions; `react-icons/si` for company logos.
- Dark mode: `class`-based, see how existing components use light/dark variants.

### Test IDs
- Every interactive element gets `data-testid`. Naming: `{action}-{target}` (e.g. `button-submit-issue`, `link-document-${id}`). For dynamic lists, append a unique id.

### Logging & audit
- `logActivity(req, { action, category, description, ... })` writes to `activity_logs`. Use it for every meaningful state change (auth events, CRUD on projects/calendar, AI calls, storage ops, email send/failure).

---

## 10. Integrations Cheat-Sheet

| Service | Where it lives | Auth model |
|---|---|---|
| OpenAI | `server/pdf-processor.ts`, `server/asset-manager/openai-tagger.ts`, `server/routes.ts` AI endpoints | `OPENAI_API_KEY`. Uses `gpt-4o` for vision + chat; Assistants API for scheduling. |
| DigitalOcean Spaces | `server/digitalocean-spaces.ts` | S3 API key/secret per env. **Endpoint must NOT include bucket subdomain.** |
| SMTP (Neo Space) | `server/email-templates.ts` (and other senders) | `SMTP_HOST/PORT/USER/PASS` |
| SendGrid | `server/sendgrid.ts` | `SENDGRID_API_KEY`. Used for sender verification + as alternative send path. |
| Razorpay | `server/razorpay.ts` | `RAZORPAY_KEY_ID/SECRET`. Order create + signature verify. |
| OpenWeather | `server/weather.ts` | `OPENWEATHER_API_KEY`. Geocode + 5-day forecast, results cached in `weather_cache`. |
| Google Calendar | `server/replit_integrations/` | OAuth: `GOOGLE_CLIENT_ID/SECRET`. Per-user tokens stored on `users`. |
| CompanyCam | `server/asset-manager/companycam.ts` + `token-crypto.ts` | Per-admin API token, AES-256-GCM encrypted with key derived from `SIGNSUITEIQ_SSO_SECRET`. |
| SignSuiteIQ SSO | `server/routes.ts` (`/sso/callback`) + `/api/internal/provision-user` | Shared secret in `SIGNSUITEIQ_SSO_SECRET`. SSO calls `https://www.signsuiteiq.ai/api/sso/exchange`. Provisioning is server-to-server with `X-App-Secret` header. |

---

## 11. Background Work

`server/scheduler.ts` runs every hour:
- **Weather refresh** — re-fetches forecasts for upcoming bookings with addresses.
- **Escalation** — flags past-due `SCHEDULED` jobs.

The scheduler kicks off on app start (`server/index.ts`).

---

## 12. Deployment

The Replit workspace is **dev only**. Production runs on **DigitalOcean App Platform** in two environments:

| Env | Domain | Spaces bucket |
|---|---|---|
| Demo | demo.installiq.ai | `installiq` |
| Production | installiq.ai (and `www.installiq.ai`) | `productionstorage` |

Each env has its own DO Postgres instance, its own DO Spaces bucket, and its own env vars (NOT synced from Replit). Push the same git branch to both apps; they each rebuild and run `auto-migrate.ts` on startup.

### Build pipeline
1. `npm run build` → `tsx script/build.ts` → bundles client (vite) + server (`dist/index.cjs`).
2. `npm start` runs `dist/index.cjs` (production).

### Common production gotchas
- **`InvalidAccessKeyId` on uploads** → `DO_SPACES_KEY/SECRET` aren't valid for the bucket the env points at. Create a new Spaces key scoped to that bucket and update the App Platform env vars.
- **`column "X" does not exist`** → schema drift; column added to routes/schema but missing from `auto-migrate.ts`. Add to `columnChecks` (and the bootstrap CREATE TABLE if applicable), redeploy.
- **`NoSuchBucket: <bucket>.<bucket>`** → `DO_SPACES_ENDPOINT` was set with the bucket as a subdomain. Endpoint should be `https://nyc3.digitaloceanspaces.com`; CDN URL should be `https://<bucket>.nyc3.digitaloceanspaces.com`.
- **`NODE_TLS_REJECT_UNAUTHORIZED=0`** in production — disables TLS verification globally; remove it from env vars (keep DB SSL cert validation in `server/db.ts` correct instead).

---

## 13. How to Extend (recipes)

### Add a new database table
1. Define `pgTable` in `shared/schema.ts` + `createInsertSchema` + types.
2. Add `CREATE TABLE IF NOT EXISTS` block to `ensureMissingTables()` in `server/auto-migrate.ts`.
3. Add storage methods to `IStorage` and the Drizzle implementation in `server/storage.ts`.
4. Add Express routes in `server/routes.ts`. Validate body with Zod.
5. Add a React page or component; query via `useQuery({ queryKey: ['/api/...'] })`.

### Add a new column to an existing table
1. Add field to the `pgTable` definition in `shared/schema.ts`.
2. Add `ALTER TABLE … ADD COLUMN IF NOT EXISTS` entry to `columnChecks` in `server/auto-migrate.ts`.
3. (If the table is in the bootstrap section) add the column to the `CREATE TABLE` block too.
4. Update storage interface + types as needed.
5. Run `npm run db:push` locally to sync your dev DB.

### Add a third-party service
1. Add env vars to `.env.example` and document them above.
2. Create `server/<service>.ts` with a thin client + helper functions.
3. Wire it into existing routes; never construct a new client per request — use a module-level singleton (see `getS3Client()` in `digitalocean-spaces.ts` for the pattern).
4. Log every external call to `activity_logs` with category set to the service name.

### Add a new role / capability
- Roles are plain strings on `users.role`. To add one, update the role-check helpers and any UI conditionals; consider whether it should be picked up by `getTeamUserIdsForUser`.

---

## 14. Where to find things fast

| Need | Look at |
|---|---|
| What does this route do? | `server/routes.ts` (search by path) |
| What does this query/mutation hit? | The component's `useQuery`/`useMutation`, then `server/routes.ts` |
| What columns does table X have? | `shared/schema.ts` |
| How are uploads stored? | `server/digitalocean-spaces.ts` |
| AI calls | `server/pdf-processor.ts`, `server/asset-manager/openai-tagger.ts` |
| Email rendering / sending | `server/email-templates.ts`, `server/sendgrid.ts` |
| Hourly cron | `server/scheduler.ts` |
| Tenant scope helper | `getTeamUserIdsForUser` in `server/routes.ts` |
| Who edited what | `activity_logs` table; UI: `LastUpdates` component |
| Recent product changes | `replit.md` "Recent Changes" section |

---

## 15. Useful Internal Endpoints

```bash
# Health / version
curl https://www.installiq.ai/api/health

# Provision a user from SignSuiteIQ
curl -X POST https://www.installiq.ai/api/internal/provision-user \
  -H "Content-Type: application/json" \
  -H "X-App-Secret: $SIGNSUITEIQ_SSO_SECRET" \
  -d '{"external_id":1,"email":"x@y.com","username":"x","name":"X","role":"admin","phone":null,"job_title":null,"location":null,"action":"upsert","password":"…"}'

# Backfill InstalliQ project photos into the Asset Manager (super-admin)
curl -X POST https://www.installiq.ai/api/admin/sync-installiq-assets \
  -H "Cookie: <super-admin-session>"
```

---

## 16. Further Reading

- `replit.md` — high-level overview + a running log of recent product changes (read this before extending a feature so you know its current shape).
- `docs/local-setup.html` — original local-setup walkthrough.
- `/api-docs` (Swagger UI) — live API reference once the server is running.
- The shadcn docs: https://ui.shadcn.com — for any component-level work.
- Drizzle docs: https://orm.drizzle.team — for schema/query work.
