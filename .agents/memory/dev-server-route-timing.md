---
name: Dev server backend route timing
description: Why backend route changes appear ~1 min after a restart, and how to test without false 404s
---

# Dev server: backend changes need restart + routes register late

The `dev` script runs `tsx server/index.ts` with **no watch mode**, so backend
(`server/**`) changes do NOT hot-reload — only the Vite frontend HMRs. After
editing backend code you MUST restart the `Start application` workflow.

After restart, `server/index.ts` calls `httpServer.listen()` immediately (logs
"serving on port 5000"), but `registerRoutes()` runs inside an async IIFE only
**after** DB connect + autoMigrate + `runSeeders()`. Seeders can take ~1 minute.
Until they finish, EVERY `/api/*` route returns 404 ("Cannot POST ...") — this is
NOT a code error, just unregistered routes.

`registerRoutes` is wrapped in try/catch that logs "Failed to register routes"
and keeps serving; if you see 404s with no such error in the log, routes simply
haven't registered yet.

**How to apply:** after restarting, wait for the log line
`[express] Application fully initialized` (or poll an endpoint until it stops
404ing) before testing API routes. A 30s poll is not enough — seeding alone can
take ~56s.
