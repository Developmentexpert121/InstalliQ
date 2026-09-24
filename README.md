# InstalliQ.ai

AI-powered project management for signage installation businesses (FASTSIGNS). Supports multi-tenant role-based access, calendar scheduling, photo documentation, AI time-estimation, subscription management, and email notifications.

## Quick Start

```bash
npm install --legacy-peer-deps
npm run dev
```

The app starts on port 5000 (Express backend + Vite frontend on the same port).

## Test Accounts (Development Only)

Seeders run automatically on every startup. Credentials are defined in `server/seeders.ts`.

| Role | Email | Notes |
|------|-------|-------|
| Super Admin | `developmentexpert121@gmail.com` | Platform-wide access |
| Super Admin | `mehta.shishir@gmail.com` | Platform-wide access |
| Super Admin | `vjkalwani@gmail.com` | Platform-wide access |
| Owner Admin | `Smehta@fastsigns.com` | Password reset every dev startup |
| Installer | `installer-test@fastsigns.com` | Dev-only, created on first boot |

Passwords are in `server/seeders.ts`. The test installer, sample calendar events, and global tags are only seeded in development (`NODE_ENV !== "production"`).

## Seed Data

On first run (when tables are empty), the following test data is also created:

- **3 subscription plans**: Basic ($29), Standard ($59), Premium ($99)
- **24 onboarding questions** across 5 steps (Business Info, Team, Equipment, Products, Time Standards)
- **6 global tags**: Channel Letters, Wall Graphics, Vehicle Graphics, ADA, Monument Signs, Window Graphics
- **3 sample calendar events**: Channel letter install, vehicle wrap, ADA sign install (dated relative to today)
- **App settings**: `subscription_gate_enabled = false`

All seeders use "insert if not exists" logic and are safe to run repeatedly.

## Manual Test Steps

### 1. Login Flow

1. Open the app and verify the login page loads with the lock icon and "Welcome back" heading.
2. Log in as owner admin (`Smehta@fastsigns.com` / `1waltham`).
3. Verify redirect to the dashboard.
4. Log out and log in as the test installer (`installer-test@fastsigns.com` / `Install@123`).
5. Verify the installer sees a limited sidebar (no admin-only pages).

### 2. Calendar

1. Log in as owner admin.
2. Navigate to Calendar from the sidebar.
3. Verify seeded events appear on the calendar.
4. Click an event to view details (title, address, customer info).
5. Create a new event with a title, date, start/end time, and address.
6. Verify the event appears on the calendar and can be edited.

### 3. Project & Photo Upload

1. Navigate to New Project from the sidebar.
2. Upload at least one photo.
3. Add a description and select tags.
4. Submit and verify the project appears in the archive.

### 4. Email (requires SMTP credentials)

1. Create or open an existing calendar event with a customer email.
2. In the event detail panel, click the email send button.
3. Verify the email is sent (check activity logs as super admin).

### 5. Activity Logs (Super Admin Only)

1. Log in as super admin (`developmentexpert121@gmail.com` / `Admin@123!`).
2. Navigate to Activity Logs from the sidebar.
3. Verify log entries with category badges (AI, Storage, Email, User, etc.).
4. For AI entries, verify inline token count, cost, and duration display.

### 6. Version Badge

1. On the login page, hold Ctrl (or Cmd on Mac) and click the lock icon.
2. Verify the version badge (`v3.2.0`) appears for 10 seconds and then disappears.

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Replit built-in) |
| `SESSION_SECRET` | Random string, min 32 characters |

### Database (choose one)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Replit PostgreSQL (fallback) |
| `DIGITALOCEAN_DATABASE_URL` | DigitalOcean managed Postgres (primary, enables SSL) |

### Email - SMTP

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server (e.g., `smtp0001.neo.space`) |
| `SMTP_PORT` | SMTP port (`587` for STARTTLS) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address (defaults to `SMTP_USER`) |

### Optional Services

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Enables AI tagging, time estimation, scheduling |
| `OPENAI_ASSISTANT_ID` | Pre-built OpenAI assistant for scheduling |
| `SENDGRID_API_KEY` | Sender verification (optional email add-on) |
| `DO_SPACES_KEY` | DigitalOcean Spaces access key (file storage) |
| `DO_SPACES_SECRET` | DigitalOcean Spaces secret key |
| `DO_SPACES_ENDPOINT` | Spaces endpoint (e.g., `https://nyc3.digitaloceanspaces.com`) |
| `DO_SPACES_BUCKET` | Spaces bucket name |
| `DO_SPACES_CDN_URL` | Spaces CDN URL for public file access |
| `RAZORPAY_KEY_ID` | Razorpay payment key |
| `RAZORPAY_KEY_SECRET` | Razorpay payment secret |
| `OPENWEATHER_API_KEY` | Weather data for installation scheduling |
| `GOOGLE_CLIENT_ID` | Google OAuth (calendar sync) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |

### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps for address autocomplete |

## Build & Deploy

```bash
bash build.sh
NODE_ENV=production node dist/index.cjs
```

The build script runs `vite build` for the frontend and `esbuild` for the backend, outputting a single `dist/index.cjs` bundle.

## Project Structure

```
server/
  index.ts            Entry point (DB connect, seeders, routes)
  routes.ts           All API endpoints (~8100 lines)
  storage.ts          Database CRUD interface (Drizzle ORM)
  seeders.ts          Startup seed data (users, plans, events, tags)
  db.ts               Database connection with retry/reconnect
  email-templates.ts  Email template system
  pdf-processor.ts    AI-powered PDF extraction (work orders, proofs)
  digitalocean-spaces.ts  S3-compatible file storage
  weather.ts          OpenWeather API integration
  razorpay.ts         Payment processing
  sendgrid.ts         SendGrid sender verification
  swagger.ts          API documentation
shared/
  schema.ts           Drizzle schema + Zod validation (source of truth)
client/src/
  pages/              29 page components
  components/         Shadcn/ui components
  hooks/              Custom React hooks
  lib/                Query client, utilities
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Wouter, TanStack Query v5, Shadcn/ui, Tailwind CSS, Vite
- **Backend**: Express.js, TypeScript, Drizzle ORM, Multer
- **Database**: PostgreSQL (DigitalOcean managed primary, Replit fallback)
- **AI**: OpenAI GPT-4o (tagging, time estimation, scheduling)
- **Storage**: DigitalOcean Spaces (S3-compatible)
- **Email**: SMTP (Nodemailer) + SendGrid sender verification
- **Payments**: Razorpay
