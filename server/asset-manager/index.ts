import { Router, Request, Response, NextFunction } from "express";
import * as storage from "./storage";
import { syncCompanyCamAssets, getCompanyCamStatus, getCompanyCamConfig, type SyncProgressCallback, type SyncCompanyCamOptions } from "./companycam";
import {
  syncGoogleDriveAssets,
  getGoogleDriveStatus,
  extractFolderIdFromUrl,
  getDriveFolderName,
  type DriveSyncProgressCallback,
} from "./google-drive";
import { db, pool } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";

/** Lightweight activity log helper for asset-manager routes (has req context). */
async function logAssetActivity(
  req: Request,
  opts: {
    action: string;
    description: string;
    resourceId?: string | number | null;
    resourceType?: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    const userId = req.session?.userId ?? null;
    let userName: string | null = null;
    let userEmail: string | null = null;
    let userRole: string | null = null;
    if (userId) {
      try {
        const u = await storage.getUser(userId);
        if (u) { userName = u.name; userEmail = u.email ?? null; userRole = u.role; }
      } catch {}
    }
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      ?? req.socket?.remoteAddress ?? null;
    await pool.query(
      `INSERT INTO activity_logs
         (user_id, user_name, user_email, user_role, action, category, description,
          resource_id, resource_type, metadata, ip_address)
       VALUES ($1,$2,$3,$4,$5,'CompanyCam',$6,$7,$8,$9,$10)`,
      [
        userId, userName, userEmail, userRole,
        opts.action, opts.description,
        opts.resourceId != null ? String(opts.resourceId) : null,
        opts.resourceType ?? null,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
        ip,
      ]
    );
  } catch (err) {
    console.error("[Asset Activity Log Error]", err);
  }
}

const router = Router();

// Active CompanyCam sync controllers, keyed by adminId
const activeSyncControllers = new Map<number, AbortController>();

// Server-side progress tracker so any session can poll sync status
const activeSyncProgressMap = new Map<number, { synced: number; startedAt: number }>();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

router.use(requireAuth);

async function getUserRole(userId: number): Promise<string | null> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return user?.role ?? null;
}

/**
 * For super_admin: reads ownerId from req.body or req.query and uses it as the
 * target admin.  For regular admins: always returns their own userId.
 * Returns null and sends a 4xx response if the caller should abort.
 */
async function resolveOwnerAdminId(req: Request, res: Response): Promise<number | null> {
  const userId = req.session.userId!;
  const rawOwner = req.body?.ownerId ?? req.query?.ownerId;
  const ownerId =
    typeof rawOwner === "number" ? rawOwner
    : typeof rawOwner === "string" && rawOwner ? parseInt(rawOwner, 10)
    : undefined;
  if (!ownerId || isNaN(ownerId) || ownerId === userId) return userId;
  const role = await getUserRole(userId);
  if (role !== "super_admin") {
    res.status(403).json({ error: "Only super_admin can specify ownerId" });
    return null;
  }
  return ownerId;
}

function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const role = await getUserRole(userId);
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// ─── My Access ────────────────────────────────────────────────────────────────

router.get("/my-access", async (req, res) => {
  try {
    const userId = req.session.userId!;
    const role = await getUserRole(userId);

    if (role === "super_admin") {
      return res.json({ hasAccess: true, adminId: userId });
    }

    const access = await storage.resolveUserTenantAccess(userId);
    return res.json({ hasAccess: access?.enabled ?? false, adminId: access?.adminId ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to check access" });
  }
});

// ─── Access Hub ───────────────────────────────────────────────────────────────

router.get("/access", requireRole("super_admin"), async (req, res) => {
  try {
    const rows = await storage.listTenantAccess();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list access" });
  }
});

router.patch("/access/:ownerId", requireRole("super_admin"), async (req, res) => {
  try {
    const ownerId = parseInt(req.params.ownerId, 10);
    if (isNaN(ownerId)) return res.status(400).json({ error: "Invalid owner ID" });

    const { enabled } = req.body;
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });

    await storage.setTenantAccess(ownerId, enabled);
    const [ownerUser] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, ownerId));
    const totalUploads = await storage.countAssetsByAdmin(ownerId);
    res.json({
      ownerId,
      ownerName: ownerUser?.name ?? "",
      ownerEmail: ownerUser?.email ?? null,
      enabled,
      totalUploads,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update access" });
  }
});

// ─── Tag Library ──────────────────────────────────────────────────────────────

router.get("/tags", requireRole("admin", "super_admin"), async (_req, res) => {
  try {
    const tags = await storage.listGlobalTags();
    res.json({ tags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list tags" });
  }
});

router.post("/tags", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const { tagName } = req.body;
    if (!tagName || typeof tagName !== "string") return res.status(400).json({ error: "tagName required" });
    const tag = await storage.addGlobalTag(tagName);
    res.json(tag);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add tag" });
  }
});

router.post("/tags/bulk", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: "tags must be an array" });
    const names: string[] = tags.map((t) => String(t).trim()).filter(Boolean);
    const inserted = await storage.addGlobalTagsBulk(names);
    res.json({ inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to bulk-add tags" });
  }
});

// ─── Asset Setup Stats ────────────────────────────────────────────────────────

router.get("/setup", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = req.session.userId!;
    const [globalTags, stats] = await Promise.all([
      storage.listGlobalTags(),
      storage.getAssetStats(adminId),
    ]);
    res.json({ tagCount: globalTags.length, assetCount: stats.total, untaggedCount: stats.untaggedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get setup stats" });
  }
});

// ─── Integration Status ───────────────────────────────────────────────────────

router.get("/integrations/companycam", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const status = await getCompanyCamStatus(adminId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get CompanyCam status" });
  }
});

router.get("/integrations/google-drive", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const status = await getGoogleDriveStatus(adminId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get Google Drive status" });
  }
});

// ─── CompanyCam token config (GET / PUT / DELETE) ─────────────────────────────

router.get("/integrations/companycam/config", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const config = await getCompanyCamConfig(adminId);
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get CompanyCam config" });
  }
});

router.put("/integrations/companycam/config", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return res.status(400).json({ error: "apiKey is required and must be a non-empty string" });
    }
    await storage.saveCompanyCamApiKey(adminId, apiKey.trim());
    const config = await getCompanyCamConfig(adminId);
    void logAssetActivity(req, {
      action: "COMPANYCAM_CONNECTED",
      description: "CompanyCam API token saved",
      resourceType: "companycam_integration",
    });
    res.json(config);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to save CompanyCam token" });
  }
});

router.delete("/integrations/companycam/config", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    await storage.saveCompanyCamApiKey(adminId, null);
    void logAssetActivity(req, {
      action: "COMPANYCAM_DISCONNECTED",
      description: "CompanyCam API token removed",
      resourceType: "companycam_integration",
    });
    res.json({ connected: false, maskedKey: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to clear CompanyCam token" });
  }
});

// ─── Google Drive config (GET / PUT / DELETE) ────────────────────────────────

router.get("/integrations/google-drive/config", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const driveConfig = await storage.getGoogleDriveConfig(adminId);
    res.json(driveConfig);
  } catch (err: unknown) {
    console.error(err);
    res.status(500).json({ error: "Failed to get Google Drive config" });
  }
});

/** Save a public Drive folder link: extract the folder ID, fetch its name, and persist. */
router.put("/integrations/google-drive/config", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const { folderUrl } = req.body as { folderUrl?: string };
    if (!folderUrl || typeof folderUrl !== "string" || !folderUrl.trim()) {
      return res.status(400).json({ error: "folderUrl is required" });
    }

    let folderId: string;
    try {
      folderId = extractFolderIdFromUrl(folderUrl.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid Drive URL";
      return res.status(400).json({ error: msg });
    }

    let folderName: string;
    try {
      folderName = await getDriveFolderName(folderId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not access Drive folder";
      console.error("[GoogleDrive] getDriveFolderName failed for", folderId, ":", msg);
      return res.status(422).json({ error: msg });
    }

    await storage.saveGoogleDriveFolderUrl(adminId, folderId, folderName);
    const driveConfig = await storage.getGoogleDriveConfig(adminId);
    res.json(driveConfig);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save folder config";
    console.error(err);
    res.status(500).json({ error: msg });
  }
});

router.delete("/integrations/google-drive/config", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    await storage.clearGoogleDriveConfig(adminId);
    res.json({ connected: false });
  } catch (err: unknown) {
    console.error(err);
    res.status(500).json({ error: "Failed to disconnect Google Drive" });
  }
});

// ─── CompanyCam Sync + Tag ────────────────────────────────────────────────────

router.post("/companycam/sync", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const controller = new AbortController();
    activeSyncControllers.set(adminId, controller);
    const opts: SyncCompanyCamOptions = {
      forceResync: req.body?.resync === true,
      maxPhotos: typeof req.body?.maxPhotos === "number" ? req.body.maxPhotos : undefined,
      signal: controller.signal,
    };
    try {
      const result = await syncCompanyCamAssets(adminId, undefined, opts);
      res.json(result);
    } finally {
      activeSyncControllers.delete(adminId);
    }
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "CompanyCam sync failed" });
  }
});

router.post("/companycam/sync-stream", requireRole("admin", "super_admin"), async (req, res) => {
  const adminId = await resolveOwnerAdminId(req, res);
  if (adminId === null) return;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Content-Encoding", "identity");
  res.flushHeaders();

  const send = (data: object) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    } catch {}
  };

  send({ synced: 0 });

  const controller = new AbortController();
  activeSyncControllers.set(adminId, controller);

  const opts: SyncCompanyCamOptions = {
    forceResync: req.body?.resync === true,
    maxPhotos: typeof req.body?.maxPhotos === "number" ? req.body.maxPhotos : undefined,
    signal: controller.signal,
  };

  activeSyncProgressMap.set(adminId, { synced: 0, startedAt: Date.now() });

  const onProgress: SyncProgressCallback = (synced) => {
    activeSyncProgressMap.set(adminId, { synced, startedAt: activeSyncProgressMap.get(adminId)?.startedAt ?? Date.now() });
    send({ synced });
  };

  try {
    const result = await syncCompanyCamAssets(adminId, onProgress, opts);
    if (result.stopped) {
      send({ ...result, complete: true, stopped: true });
    } else if (result.status === "error" || result.status === "not_connected") {
      send({ ...result, error: result.message ?? result.status, complete: true });
    } else {
      send({ ...result, complete: true });
    }
  } catch (err: any) {
    send({ error: err.message || "Sync failed", complete: true });
  } finally {
    activeSyncControllers.delete(adminId);
    activeSyncProgressMap.delete(adminId);
    res.end();
  }
});

router.post("/companycam/sync-stop", requireRole("admin", "super_admin"), async (req, res) => {
  const adminId = await resolveOwnerAdminId(req, res);
  if (adminId === null) return;
  const controller = activeSyncControllers.get(adminId);
  if (controller) {
    controller.abort();
    res.json({ stopped: true });
  } else {
    res.json({ stopped: false, message: "No active sync found" });
  }
});

/** Poll endpoint — reads sync state from DB, so it works across page refreshes,
 *  server restarts, and any browser tab without an active SSE connection. */
router.get("/companycam/sync-active", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const userId = req.session!.userId as number;
    const role = await getUserRole(userId);
    if (role === "super_admin") {
      const state = await storage.getActiveSyncState();
      if (!state) return res.json({ running: false });
      return res.json({ running: true, synced: state.count });
    } else {
      const adminId = await resolveOwnerAdminId(req, res);
      if (adminId === null) return;
      const state = await storage.getAdminSyncState(adminId);
      if (!state) return res.json({ running: false });
      return res.json({ running: true, synced: state.count });
    }
  } catch (err) {
    console.error("[sync-active] Error:", err);
    res.json({ running: false });
  }
});

router.post("/companycam/tag", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const { status } = await getCompanyCamStatus(adminId);
    res.json({ status, message: status === "connected" ? "Use AI Tag All to tag CompanyCam assets." : "CompanyCam not connected." });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "CompanyCam AI tag failed" });
  }
});

// ─── Google Drive Sync ────────────────────────────────────────────────────────

router.post("/google-drive/sync", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const result = await syncGoogleDriveAssets(adminId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google Drive sync failed";
    console.error(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/google-drive/sync-stream", requireRole("admin", "super_admin"), async (req, res) => {
  const adminId = await resolveOwnerAdminId(req, res);
  if (adminId === null) return;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ synced: 0 });

  const onProgress: DriveSyncProgressCallback = (synced) => send({ synced });

  try {
    const result = await syncGoogleDriveAssets(adminId, onProgress);
    if (result.status === "error" || result.status === "not_connected") {
      send({ ...result, error: result.message ?? result.status, complete: true });
    } else {
      send({ ...result, complete: true });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google Drive sync failed";
    send({ error: msg, complete: true });
  }

  res.end();
});

router.post("/google-drive/tag", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveOwnerAdminId(req, res);
    if (adminId === null) return;
    const { status } = await getGoogleDriveStatus(adminId);
    res.json({ status, message: status === "connected" ? "Use AI Tag All to tag Google Drive assets." : "Google Drive not connected." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google Drive AI tag failed";
    console.error(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Combined export ──────────────────────────────────────────────────────────

import { assetsRouter } from "./assets-router";
const combined = Router();
combined.use("/assets", assetsRouter);
combined.use("/asset-manager", router);

export { combined as assetManagerRouter };
