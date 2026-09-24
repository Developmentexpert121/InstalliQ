# InstalliQ.ai - AI-Powered Field Proof

## Overview
InstalliQ.ai is an AI-powered project management application for signage installation businesses. It streamlines workflows by enabling photo uploads, leveraging AI for auto-tagging and report generation, and managing projects from initiation to completion. The platform features a multi-tenant architecture with role-based access, calendar scheduling, subscription management, and automated email notifications, aiming to enhance efficiency and organization in installation businesses.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
-   **Frontend**: React 18, TypeScript, Wouter, TanStack React Query v5, React Context, Shadcn/ui (Radix UI), Tailwind CSS, Vite.
-   **Backend**: Express.js, TypeScript, RESTful JSON APIs, Express-session, Multer.
-   **Database**: PostgreSQL (DigitalOcean managed, primary; Replit built-in as fallback), Drizzle ORM, drizzle-zod, Drizzle Kit.

### Multi-Tenant Role System
-   **Super Admin**: Platform-wide management.
-   **Owner Admin**: Manages their team, projects, calendar, custom tags, AI assistants, and business details, with isolated data.
-   **Installer (User)**: Views assigned jobs, uploads project photos, and tracks time.

### Key Features

#### User Management
-   Flexible login with session-based authentication and password management.
-   Multi-step onboarding with dynamic questionnaires and file uploads.

#### Project Management
-   Project creation and tracking with photo uploads.
-   AI-powered image analysis for auto-tagging and PDF work order data extraction.
-   Project archiving and detailed views.

#### Tag System
-   Supports both global tags (managed by super admin) and custom owner-specific tags.
-   Photo tagging for documentation.

#### Install Time Estimator
-   Estimates installation time using AI based on uploaded data and owner-specific settings (business address, install range, travel time, etc.).

#### Site Surveys
-   Manages site survey documentation, including photo uploads, annotation tools, and PDF report generation.
-   Surveys can be linked to calendar events and emailed as branded PDF attachments.

#### Calendar & Scheduling
-   Provides day/week/month views with event creation, editing, status management, and user filtering.
-   Features a consolidated toolbar, status filter bar, and expandable weather strip.
-   Includes AI-powered install time calculation and scheduling, and prevents duplicate work order entries.
-   **Mobile responsive**: On screens narrower than 640px the calendar defaults to **Day** view (Week is still selectable but no longer the landing view). A new **Agenda** tab (in both desktop and mobile view-mode rows) lists the current week's bookings grouped by day in chronological order with full readable cards (time, title, address, assignees, status pill) — empty days show "Free". In the mobile **Week** view the day-header strip ALWAYS shows all 7 days at once (fitted to the viewport), while the event body grid below has its own horizontal scroll with ≈120px-wide day columns (min-w-[900px]) so typical "INSTALL-401-XXXXX" booking titles fit on a single line. Event-title text uses `overflowWrap: 'break-word'` + `hyphens: 'auto'` so long titles wrap at hyphens (e.g., `INSTALL-` / `401-51345`) instead of one character per line. Tapping a day in the header strip jumps the body horizontally to that day; on mount and on week navigation the body auto-centers on today (or the first day of the week if today isn't visible). Weather forecast cards scroll horizontally on mobile; header title uses short format (e.g., "Mon, Mar 28") on mobile.
-   **Week-view overflow**: When more than ~2 (mobile) or ~3 (desktop) bookings overlap, the extra ones are grouped into a single clearly-labeled "+N More" button positioned just below the day's last visible booking. Clicking the button opens a popover listing every hidden booking for that day in chronological order (time, title, assignees), each row clickable to open the booking dialog. (Replaces the previous tiny per-time-bucket "+N" badges.)

#### AI Integration
-   Utilizes OpenAI API (gpt-4o) for image analysis, PDF processing, and install time calculation.
-   Supports customizable OpenAI Assistants per admin with specific instructions and knowledge files.

#### Subscription & Payment
-   Manages subscription plans (Basic, Standard, Premium) with event limits.
-   Integrates Razorpay for payment processing.

#### Email Notifications
-   Automated email notifications using configurable templates for various events (welcome, schedule confirmation, etc.).
-   Templates support rich text, variable substitution, and per-owner branding.

#### Dashboard
-   Displays completed photo documentation projects with search, filtering, and bulk export.
-   Provides access to photo tag management.

#### Audit Trails
-   Comprehensive activity logging for critical actions, including authentication, projects, calendar, settings, users, AI calls, storage operations, and email sends/failures.
-   Logs capture detailed information such as AI model usage, token counts, storage provider, and email delivery status.

### Project Structure
-   **Frontend (`client/src/`)**: Handles UI, user interactions, and admin tools.
-   **Backend (`server/`)**: Manages API routes, database interactions, and business logic.
-   **Shared (`shared/`)**: Contains Drizzle ORM schemas, Zod schemas, and TypeScript types.

## External Dependencies

### Database
-   **PostgreSQL** (DigitalOcean Managed Database): Primary data store, with Replit's built-in PostgreSQL as fallback.

### AI Services
-   **OpenAI API**: For AI-powered features like image analysis, PDF processing, and custom AI assistants.

### Email
-   **Neo Space SMTP**: Primary email delivery service.
-   **SendGrid**: Alternative email delivery and sender verification.

### File Storage
-   **DigitalOcean Spaces**: S3-compatible cloud storage for file uploads.

### Weather & Geocoding
-   **OpenWeather API**: Provides weather forecasting and geocoding services.

### Payment Gateway
-   **Razorpay**: For subscription payment processing.

### PDF Generation
-   **PDFKit**: Used for server-side PDF report generation with customizable branding.

### Authentication
-   **bcrypt**: For password hashing.
-   **express-session**: For managing user sessions.
-   **face-api.js**: For client-side face recognition.

#### Asset Manager
-   **Search & Browse**: Paginated asset search with filters (source, date range, tags, text). Asset cards show title, date, source badge, and tags. Supports manual uploads and synced sources.
-   **AI Tagging**: OpenAI Vision (`gpt-4o`) auto-tags assets. Batch "Tag All Untagged" runs AI on all assets without tags or description. AI tags are drawn from the per-admin Tag Library. Tagging activity is logged to the Activity Logs.
-   **Project Metadata**: Assets carry 5 structured fields: `project_name`, `project_address`, `job_number`, `captured_by`, `source_display`. CompanyCam sync auto-populates all five (job number from `project.job_number ?? project_number ?? external_id`; captured by from `photo.creator.name`). Upload/Drive assets show editable inputs for the first three. Detail drawer shows a "Project" section — read-only for CompanyCam, editable inputs for other sources.
-   **CompanyCam Integration**: Per-admin encrypted API token (AES-256-GCM, key derived from `SIGNSUITEIQ_SSO_SECRET`). Token stored encrypted in `asset_manager_access.companycam_api_key`. Sync fetches projects then photos (up to 50 total, using project name as title and address as description). Deduplication by photo ID. Config UI: connect/disconnect token in Asset Setup tab.
-   **Google Drive Integration**: Placeholder sync (pending full OAuth implementation).
-   **Asset Sources**: `upload` (Manual), `companycam` (CompanyCam), `google-drive` (Google Drive), `installiq` (InstalliQ Projects).
-   **InstalliQ Source**: Project photos automatically sync to Asset Manager on upload (`POST /api/projects/:id/images`) and on metadata edits (`PATCH /api/projects/:id`). No file re-upload — references existing DigitalOcean Spaces URLs. Carries customer name/phone/email from the project. Dedup via partial unique index `(admin_id, file_url) WHERE source = 'installiq'`. Backfill: `POST /api/admin/sync-installiq-assets` (super_admin only).
-   **Asset Drawer**: InstalliQ assets show Job section (read-only, with "Synced from InstalliQ" note) + Customer section (name/phone/email, read-only). Customer filter added to search tab.
-   **DB columns added to `assets`**: `customer_name`, `customer_phone`, `customer_email`.
-   **API Endpoints**: `GET/POST /api/assets`, `GET/PATCH/DELETE /api/assets/:id`, `POST /api/assets/ai-tag-all`, `GET /api/asset-manager/integrations/companycam/config`, `PUT /api/asset-manager/integrations/companycam/config`, `DELETE /api/asset-manager/integrations/companycam/config`, `POST /api/admin/sync-installiq-assets`.
-   **Key Files**: `server/asset-manager/` (companycam.ts, token-crypto.ts, storage.ts, index.ts, assets-router.ts, openai-tagger.ts), `client/src/pages/asset-manager/` (tab-asset-setup.tsx, tab-search-assets.tsx, tab-upload-assets.tsx, asset-detail-drawer.tsx).

## Recent Changes

### Calendar booking dialog Edit Mode reset (Jun 2026)
- Fixed the calendar booking detail dialog leaking Edit Mode across jobs: clicking Edit then closing/canceling without saving left the dialog in Edit Mode, so opening a different job showed it in Edit Mode automatically.
- `EventDetailDialog` (`client/src/pages/google-calendar.tsx`) stays mounted, so its internal edit state persisted. Added a `useEffect` keyed on `event?.id` that resets `isEditing`, `isEditingJobId`, `showIssueForm`, `showDeleteConfirm`, `showSaveConfirm`, and `editFiles` whenever the opened event changes (including close → null).
- Keyed on `event?.id` (not the object) so saving the same event does not discard in-progress edits; the `?edit=true` deferred-open URL flow still works.

### InstalliQ source in Asset Manager (May 2026)
- Project photos now appear in Asset Manager as `source = 'installiq'` — metadata-only sync, no re-upload
- 3 new DB columns on `assets`: `customer_name`, `customer_phone`, `customer_email`; partial unique index for dedup
- Sync fires on photo upload and project PATCH; backfill via `POST /api/admin/sync-installiq-assets`
- Asset drawer: read-only Job section + new Customer section for installiq assets
- Search tab: InstalliQ source pill (orange), Customer filter input

### Booking & Project "Last Updates" history (Apr 2026)
Tracks who changed what on bookings and projects:
- New backend endpoints: `GET /api/calendar-events/:id/activity` and `GET /api/projects/:id/activity` (team-scoped, never cross-tenant). Project endpoint also includes any linked calendar event activity so dashboard "completed" projects show who completed the booking.
- Booking PATCH writes a real before/after diff in `metadata.changes` based on persisted values; no-op PATCHes are not logged.
- Reusable `<LastUpdates>` component (`client/src/components/last-updates.tsx`) renders a collapsible timeline with user, action badge, relative timestamp, and per-field diff lines. Embedded at the end of the booking detail dialog (calendar) and at the bottom of the project detail page (dashboard "completed" flow).
- `getTeamUserIdsForUser` helper validates parent role before widening the scope, so install_managers under a super_admin do not see other tenants' data.
