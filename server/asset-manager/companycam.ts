/**
 * CompanyCam integration.
 *
 * Token resolution order (per admin):
 *  1. DB-stored encrypted token for the admin (`asset_manager_access.companycam_api_key`)
 *  2. Fall back to process.env.COMPANYCAM_API_KEY (global / legacy)
 *
 * Sync flow:
 *  1. Load last successful sync timestamp from DB (null on first run).
 *  2. GET /v2/projects — paginate through ALL projects (50 per page until empty).
 *  3. For each project GET /v2/projects/{id}/photos — paginate through ALL pages,
 *     passing `after=UNIX_SECONDS` when a prior sync timestamp exists so only new
 *     photos are returned by the API.
 *  4. Download each new photo, upload to DO Spaces, upsert asset record with full
 *     project metadata (name, address, job number) and project name as a tag.
 *  5. On success, persist the sync-start timestamp so the next run only fetches
 *     photos captured after this point.
 */

import { randomUUID } from "crypto";
import { uploadBufferWithKeyToSpaces } from "../digitalocean-spaces";
import * as storage from "./storage";
import { maskToken } from "./token-crypto";
import { pool } from "../db";

const DB_SYNC_UPDATE_INTERVAL = 5; // write count to DB every N photos

const COMPANYCAM_API = "https://api.companycam.com/v2";
const PAGE_SIZE = 50;

/**
 * Delay between pages within a single paginated API call sequence.
 * Keeps pagination well under CompanyCam's rate limit.
 */
const INTER_PAGE_DELAY_MS = 200;

/**
 * Delay before fetching each project's photo list.
 * With thousands of projects this prevents burst-flooding the API.
 */
const INTER_PROJECT_DELAY_MS = 100;

/** Sleep that resolves early (without throwing) when the abort signal fires. */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/** Insert a "CompanyCam" category activity log entry (fire-and-forget). */
async function logCompanyCamActivity(opts: {
  action: string;
  description: string;
  userId?: number | null;
  resourceId?: string | number | null;
  resourceType?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    let userName: string | null = null;
    let userEmail: string | null = null;
    let userRole: string | null = null;
    if (opts.userId) {
      try {
        const u = await storage.getUser(opts.userId);
        if (u) { userName = u.name; userEmail = u.email ?? null; userRole = u.role; }
      } catch {}
    }
    await pool.query(
      `INSERT INTO activity_logs
         (user_id, user_name, user_email, user_role, action, category, description,
          resource_id, resource_type, metadata, ip_address)
       VALUES ($1,$2,$3,$4,$5,'CompanyCam',$6,$7,$8,$9,NULL)`,
      [
        opts.userId ?? null, userName, userEmail, userRole,
        opts.action, opts.description,
        opts.resourceId != null ? String(opts.resourceId) : null,
        opts.resourceType ?? null,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
      ]
    );
  } catch (err) {
    console.error("[CompanyCam Activity Log Error]", err);
  }
}

export interface CompanyCamSyncResult {
  status: "not_connected" | "synced" | "error";
  synced?: number;
  message?: string;
  stopped?: boolean;
}

export type SyncProgressCallback = (synced: number) => void;

export interface CompanyCamStatusResult {
  status: "not_connected" | "connected";
  provider: "companycam";
}

export interface CompanyCamConfigResult {
  connected: boolean;
  maskedKey: string | null;
  lastSyncedAt: string | null;
}

async function resolveApiKey(adminId: number): Promise<string | null> {
  const dbKey = await storage.getCompanyCamApiKey(adminId);
  if (dbKey) return dbKey;
  return process.env.COMPANYCAM_API_KEY ?? null;
}

export async function getCompanyCamStatus(adminId: number): Promise<CompanyCamStatusResult> {
  const key = await resolveApiKey(adminId);
  return { status: key ? "connected" : "not_connected", provider: "companycam" };
}

export async function getCompanyCamConfig(adminId: number): Promise<CompanyCamConfigResult> {
  const [plain, lastSyncedAt] = await Promise.all([
    resolveApiKey(adminId),
    storage.getCompanyCamLastSyncedAt(adminId),
  ]);
  return {
    connected: !!plain,
    maskedKey: plain ? maskToken(plain) : null,
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
  };
}

/** Fetch all pages of a paginated CompanyCam list endpoint.
 *  Inserts INTER_PAGE_DELAY_MS between consecutive page requests to
 *  avoid bursting CompanyCam's rate limit during multi-page sequences.
 *  Respects the AbortSignal — returns what was collected so far when aborted. */
async function fetchAllPages<T>(
  baseUrl: string,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  while (true) {
    if (signal?.aborted) break;

    // Throttle: pause before every page after the first
    if (page > 1) await sleep(INTER_PAGE_DELAY_MS, signal);

    if (signal?.aborted) break;

    const sep = baseUrl.includes("?") ? "&" : "?";
    const res = await fetch(`${baseUrl}${sep}per_page=${PAGE_SIZE}&page=${page}`, { headers, signal });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`CompanyCam API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data: T[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  return all;
}

/** Build a full address string from CompanyCam project address sub-fields. */
function buildAddress(project: any): string {
  const addr = project.address;
  if (!addr || typeof addr !== "object") {
    return project.formatted_address ?? String(project.address ?? "") ?? "";
  }

  const parts: string[] = [];
  if (addr.street_address_1) parts.push(addr.street_address_1);
  if (addr.street_address_2) parts.push(addr.street_address_2);
  if (addr.city) parts.push(addr.city);

  // Combine state + ZIP as one segment: "TX 75201" (no comma between them)
  const stateZip = [addr.state, addr.postal_code].filter(Boolean).join(" ");
  if (stateZip) parts.push(stateZip);

  return parts.join(", ");
}

/** Build a photo title: prefix with job number if present. */
function buildTitle(project: any): string {
  const name: string = project.name ?? project.project_name ?? "CompanyCam Project";
  const jobNum: string | undefined =
    project.job_number ?? project.project_number ?? project.external_id;
  return jobNum ? `${jobNum} — ${name}` : name;
}

export interface SyncCompanyCamOptions {
  /** When true, ignore the stored watermark and fetch all photos from the beginning.
   *  Already-imported photos are still skipped via the filename dedup set, so no
   *  duplicates are created.  The watermark IS advanced on success so the next
   *  regular sync only picks up photos captured after this run. */
  forceResync?: boolean;
  /** Hard cap on total photos imported per sync run. Useful for testing / incremental runs. */
  maxPhotos?: number;
  /** AbortSignal — abort() stops the sync after the current photo finishes. */
  signal?: AbortSignal;
}

/**
 * Sync all new CompanyCam photos for an admin.
 *
 * On the first run (no stored sync timestamp) all photos are fetched.
 * On subsequent runs only photos with captured_at > last sync are fetched
 * via the `after` API parameter, making re-syncs fast and duplicate-free.
 *
 * Pass `{ forceResync: true }` to ignore the watermark and check every photo
 * from the beginning (useful for picking up photos that were missed or deleted
 * from the library).
 */
export async function syncCompanyCamAssets(
  adminId: number,
  onProgress?: SyncProgressCallback,
  options: SyncCompanyCamOptions = {}
): Promise<CompanyCamSyncResult> {
  const key = await resolveApiKey(adminId);
  if (!key) {
    return {
      status: "not_connected",
      message: "CompanyCam integration is not configured. Add your API token in Asset Setup.",
    };
  }

  // Mark sync as started in DB so any client session can detect it via polling
  await storage.setCompanyCamSyncStarted(adminId);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };

  // Record start time before any API calls so no photos are missed by clock skew
  const syncStartedAt = new Date();

  try {
    // ── 1. Load last sync timestamp ───────────────────────────────────────────
    const lastSyncedAt = await storage.getCompanyCamLastSyncedAt(adminId);
    const useWatermark = !options.forceResync && lastSyncedAt !== null;
    const afterParam = useWatermark
      ? `&after=${Math.floor(lastSyncedAt!.getTime() / 1000)}`
      : "";

    const syncMode = options.forceResync ? "full_resync" : lastSyncedAt ? "incremental" : "first_sync";

    if (options.forceResync) {
      console.log("[CompanyCam] Force re-sync — fetching all photos from the beginning (dedup enabled)");
    } else if (lastSyncedAt) {
      console.log(`[CompanyCam] Incremental sync — fetching photos after ${lastSyncedAt.toISOString()}`);
    } else {
      console.log("[CompanyCam] First sync — fetching all photos");
    }

    const signal = options.signal;

    // ── 2. Build dedup set from already-imported photos (safety net) ──────────
    // Query directly for all CompanyCam file names (no pagination limit)
    const existingPhotoIds = await storage.getCompanyCamPhotoIds(adminId);

    // ── 3. Fetch all projects (paginated) ─────────────────────────────────────
    let projects: any[];
    try {
      projects = await fetchAllPages<any>(`${COMPANYCAM_API}/projects`, headers, signal);
    } catch (err: any) {
      if (err?.name === "AbortError" || signal?.aborted) {
        console.log("[CompanyCam] Projects fetch aborted by stop signal");
        return { status: "synced", synced: 0, stopped: true, message: "Sync stopped." };
      }
      console.error("[CompanyCam] Projects fetch failed:", err.message);
      const errMsg = err.message?.includes("401")
        ? "CompanyCam API returned 401. Check your API token."
        : `CompanyCam projects fetch failed: ${err.message}`;
      void logCompanyCamActivity({
        action: "COMPANYCAM_SYNC_ERROR",
        description: `Sync failed: ${errMsg}`,
        userId: adminId,
        metadata: { error: errMsg, sync_mode: syncMode },
      });
      return { status: "error", message: errMsg };
    }

    if (projects.length === 0) {
      return { status: "synced", synced: 0, message: "No CompanyCam projects found." };
    }

    console.log(`[CompanyCam] Found ${projects.length} project(s)`);

    // Log sync started
    void logCompanyCamActivity({
      action: "COMPANYCAM_SYNC_STARTED",
      description: `Sync started — ${projects.length} project(s) found (${syncMode})`,
      userId: adminId,
      metadata: {
        total_projects: projects.length,
        sync_mode: syncMode,
        max_photos: options.maxPhotos ?? null,
      },
    });

    // ── 4. Walk projects → photos ─────────────────────────────────────────────
    let totalSynced = 0;
    let hadErrors = false;
    let wasStopped = false;
    const maxPhotos = options.maxPhotos ?? Infinity;

    for (const project of projects) {
      if (signal?.aborted || totalSynced >= maxPhotos) {
        wasStopped = true;
        break;
      }

      const projectId = project.id;
      const projectName: string = project.name ?? project.project_name ?? "CompanyCam Project";
      const title = buildTitle(project);
      const description = buildAddress(project) || projectName;

      // Throttle: pause before fetching each project's photo list
      await sleep(INTER_PROJECT_DELAY_MS, signal);

      if (signal?.aborted) { wasStopped = true; break; }

      let photos: any[];
      try {
        photos = await fetchAllPages<any>(
          `${COMPANYCAM_API}/projects/${projectId}/photos${afterParam ? `?${afterParam.slice(1)}` : ""}`,
          headers,
          signal
        );
      } catch (err: any) {
        if (err?.name === "AbortError" || signal?.aborted) {
          wasStopped = true;
          break;
        }
        console.warn(`[CompanyCam] Photos fetch failed for project ${projectId}:`, err.message);
        hadErrors = true;
        continue;
      }

      for (const photo of photos) {
        if (signal?.aborted || totalSynced >= maxPhotos) {
          wasStopped = true;
          break;
        }

        const photoId = String(photo.id ?? "");
        if (!photoId || existingPhotoIds.has(photoId)) continue;

        const sourceUri: string | undefined =
          photo.uris?.[0]?.uri ?? photo.image_url ?? photo.photo_url;
        if (!sourceUri) continue;

        try {
          const imgRes = await fetch(sourceUri, { signal });
          if (!imgRes.ok) {
            console.warn(`[CompanyCam] Image download failed for photo ${photoId}: HTTP ${imgRes.status}`);
            hadErrors = true;
            continue;
          }

          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
          const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
          const safeName = `companycam-${photoId}.${ext}`;
          const spaceKey = `assets/${adminId}/${randomUUID()}-${safeName}`;

          const fileUrl = await uploadBufferWithKeyToSpaces(spaceKey, buffer, contentType);

          await storage.createAsset({
            adminId,
            uploadedByUserId: adminId,
            fileName: safeName,
            fileUrl,
            fileType: contentType,
            fileSize: buffer.length,
            title,
            description: null,
            tags: [],
            source: "companycam",
            aiTaggedAt: null,
            assetDate: photo.captured_at ? new Date(photo.captured_at * 1000) : null,
            projectName: projectName || null,
            projectAddress: buildAddress(project) || null,
            jobNumber: project.job_number ?? project.project_number ?? project.external_id ?? null,
            capturedBy: photo.creator?.name ?? null,
            sourceDisplay: "CompanyCam",
          });

          existingPhotoIds.add(photoId);
          totalSynced++;
          onProgress?.(totalSynced);
          // Persist count to DB every N photos so the polling endpoint sees live progress
          if (totalSynced % DB_SYNC_UPDATE_INTERVAL === 0) {
            void storage.setCompanyCamSyncCount(adminId, totalSynced);
          }
        } catch (photoErr: any) {
          if (photoErr?.name === "AbortError" || signal?.aborted) {
            wasStopped = true;
            break;
          }
          console.error(`[CompanyCam] Failed to import photo ${photoId}:`, photoErr);
          hadErrors = true;
        }
      }

      if (wasStopped) break;
    }

    const durationMs = Date.now() - syncStartedAt.getTime();

    // ── 5. Clear DB sync state + record timestamp & activity log ─────────────
    await storage.clearCompanyCamSyncState(adminId);

    if (wasStopped) {
      console.log(`[CompanyCam] Sync stopped — imported ${totalSynced} photo(s) before stop`);
      void logCompanyCamActivity({
        action: "COMPANYCAM_SYNC_STOPPED",
        description: `Sync stopped manually after importing ${totalSynced} photo(s)`,
        userId: adminId,
        metadata: { synced: totalSynced, duration_ms: durationMs, sync_mode: syncMode },
      });
      return {
        status: "synced",
        synced: totalSynced,
        stopped: true,
        message: `Stopped — imported ${totalSynced} photo(s).`,
      };
    }

    // Only advance the watermark when there were no errors and not stopped
    if (!hadErrors) {
      await storage.setCompanyCamLastSyncedAt(adminId, syncStartedAt);
      console.log(`[CompanyCam] Sync complete — imported ${totalSynced} new photo(s)`);
      void logCompanyCamActivity({
        action: "COMPANYCAM_SYNC_COMPLETE",
        description: totalSynced === 0
          ? "Sync complete — all photos already up to date"
          : `Sync complete — imported ${totalSynced} new photo(s)`,
        userId: adminId,
        metadata: {
          synced: totalSynced,
          duration_ms: durationMs,
          sync_mode: syncMode,
          total_projects: projects.length,
        },
      });
    } else {
      console.warn(
        `[CompanyCam] Sync finished with errors — imported ${totalSynced} photo(s), cursor NOT advanced. Retry to pick up skipped photos.`
      );
      void logCompanyCamActivity({
        action: "COMPANYCAM_SYNC_PARTIAL",
        description: `Sync finished with errors — imported ${totalSynced} photo(s), some photos skipped`,
        userId: adminId,
        metadata: {
          synced: totalSynced,
          duration_ms: durationMs,
          sync_mode: syncMode,
          had_errors: true,
        },
      });
    }

    return {
      status: hadErrors ? "error" : "synced",
      synced: totalSynced,
      message: hadErrors
        ? `Imported ${totalSynced} photo(s) but some failed. Sync again to retry skipped photos.`
        : totalSynced === 0
          ? "All photos are already up to date."
          : `Imported ${totalSynced} new photo(s) from CompanyCam.`,
    };
  } catch (err: any) {
    void storage.clearCompanyCamSyncState(adminId);
    if (err?.name === "AbortError" || (options.signal?.aborted)) {
      console.log("[CompanyCam] Sync aborted by stop signal");
      return { status: "synced", synced: 0, stopped: true, message: "Sync stopped." };
    }
    console.error("[CompanyCam] Sync error:", err);
    void logCompanyCamActivity({
      action: "COMPANYCAM_SYNC_ERROR",
      description: `Sync failed unexpectedly: ${err.message ?? "unknown error"}`,
      userId: adminId,
      metadata: { error: err.message ?? "unknown", sync_mode: "unknown" },
    });
    return { status: "error", message: err.message ?? "Sync request failed" };
  }
}
