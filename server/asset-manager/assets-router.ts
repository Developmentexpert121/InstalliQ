import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { uploadBufferWithKeyToSpaces, deleteFromSpaces } from "../digitalocean-spaces";
import * as storage from "./storage";
import { tagAssetWithOpenAI, tagAllUntaggedAssets, type TagProgressCallback } from "./openai-tagger";
import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import exifr from "exifr";

async function extractExifDate(buffer: Buffer): Promise<Date | null> {
  try {
    const exif = await exifr.parse(buffer, { pick: ["DateTimeOriginal", "CreateDate", "DateTime"] });
    const date = exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.DateTime ?? null;
    return date instanceof Date ? date : null;
  } catch {
    return null;
  }
}

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    cb(null, true);
  },
});

async function getUserRole(userId: number): Promise<string | null> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return user?.role ?? null;
}

/**
 * Resolves the adminId for the current session user:
 * - super_admin  → always permitted, returns their own userId
 * - admin        → checks asset_manager_access; blocked if disabled
 * - regular user → checks via created_by chain; blocked if not enabled
 */
async function resolveAdminId(req: Request, res: Response): Promise<number | null> {
  const userId: number = req.session.userId!;
  const role = await getUserRole(userId);

  if (role === "super_admin") return userId;

  // admin and regular users both go through the access check
  const access = await storage.resolveUserTenantAccess(userId);
  if (!access || !access.enabled) {
    res.status(403).json({ error: "Asset Manager is not enabled for your account" });
    return null;
  }
  return access.adminId;
}

/**
 * Like resolveAdminId but lets a super_admin override with an explicit ownerId.
 * Other roles cannot specify an ownerId different from their own.
 */
async function resolveAdminIdWithOwnerOverride(
  req: Request,
  res: Response,
  ownerId?: number
): Promise<number | null> {
  const adminId = await resolveAdminId(req, res);
  if (adminId === null) return null;
  if (!ownerId || ownerId === adminId) return adminId;

  const role = await getUserRole(req.session.userId!);
  if (role !== "super_admin") {
    res.status(403).json({ error: "Only super_admin can specify ownerId" });
    return null;
  }
  return ownerId;
}

/**
 * For listing/stats endpoints: super_admin without an explicit ownerId gets
 * null (= show all tenants). With an ownerId they see just that tenant.
 * Non-super-admin follows normal access check.
 * Returns undefined if the request is already rejected (response sent).
 */
async function resolveAdminIdForListing(
  req: Request,
  res: Response,
  ownerId?: number
): Promise<number | null | undefined> {
  const userId: number = req.session.userId!;
  const role = await getUserRole(userId);

  if (role === "super_admin") {
    // ownerId provided → scope to that tenant; absent → all tenants (null)
    return ownerId ?? null;
  }

  // admin / regular user — check access as before
  const access = await storage.resolveUserTenantAccess(userId);
  if (!access || !access.enabled) {
    res.status(403).json({ error: "Asset Manager is not enabled for your account" });
    return undefined;
  }
  return access.adminId;
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

// ─── List Assets ──────────────────────────────────────────────────────────────

const VALID_SOURCES = new Set(["upload", "companycam", "google-drive", "installiq"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get("/", async (req, res) => {
  try {
    const q = req.query as Record<string, string | string[]>;
    const ownerIdParam = typeof q.ownerId === "string" ? parseInt(q.ownerId, 10) : undefined;
    const adminId = await resolveAdminIdForListing(req, res, ownerIdParam && !isNaN(ownerIdParam) ? ownerIdParam : undefined);
    if (adminId === undefined) return;

    const search = typeof q.search === "string" ? q.search : undefined;
    const tags = q.tags ? (Array.isArray(q.tags) ? q.tags : [q.tags]) : undefined;

    const rawSources = q.sources ? (Array.isArray(q.sources) ? q.sources : [q.sources]) : undefined;
    if (rawSources) {
      const invalid = rawSources.find((s) => !VALID_SOURCES.has(s));
      if (invalid) return void res.status(400).json({ error: `Invalid source value: ${invalid}` });
    }
    const sources = rawSources;

    const dateFrom = typeof q.dateFrom === "string" ? q.dateFrom : undefined;
    const dateTo = typeof q.dateTo === "string" ? q.dateTo : undefined;
    if (dateFrom && !ISO_DATE_RE.test(dateFrom))
      return void res.status(400).json({ error: "dateFrom must be YYYY-MM-DD" });
    if (dateTo && !ISO_DATE_RE.test(dateTo))
      return void res.status(400).json({ error: "dateTo must be YYYY-MM-DD" });

    const projectName = typeof q.projectName === "string" ? q.projectName : undefined;
    const customerName = typeof q.customerName === "string" ? q.customerName : undefined;
    const page = q.page ? Math.max(1, parseInt(q.page as string, 10) || 1) : 1;
    const pageSize = q.pageSize ? Math.min(100, Math.max(1, parseInt(q.pageSize as string, 10) || 24)) : 24;
    const result = await storage.listAssets(adminId, { search, tags, sources, dateFrom, dateTo, projectName, customerName, page, pageSize });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list assets" });
  }
});

// ─── Tags (accessible to all asset-manager users for filter panel) ─────────

router.get("/tags", async (req, res) => {
  try {
    const adminId = await resolveAdminId(req, res);
    if (adminId === null) return;
    const tags = await storage.listGlobalTags();
    res.json({ tags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list tags" });
  }
});

// ─── Stats (total + untaggedCount; supports optional ownerId for super_admin) ─

router.get("/stats", async (req, res) => {
  try {
    const q = req.query as Record<string, string | string[]>;
    const ownerIdParam = typeof q.ownerId === "string" ? parseInt(q.ownerId, 10) : undefined;
    const adminId = await resolveAdminIdForListing(req, res, ownerIdParam && !isNaN(ownerIdParam) ? ownerIdParam : undefined);
    if (adminId === undefined) return;
    const stats = await storage.getAssetStats(adminId);
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get asset stats" });
  }
});

// ─── AI Tag All (admin/super_admin only; before /:id to avoid route conflict) ─

router.post("/ai-tag-all", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const ownerIdParam = typeof req.body.ownerId === "number" ? req.body.ownerId : undefined;
    const adminId = await resolveAdminIdWithOwnerOverride(req, res, ownerIdParam);
    if (adminId === null) return;
    const limitParam = typeof req.body.limit === "number" ? req.body.limit : undefined;
    const untagged = await storage.listUntaggedAssets(adminId, limitParam);
    const controller = new AbortController();
    activeTaggingControllers.set(adminId, controller);
    try {
      const result = await tagAllUntaggedAssets(untagged, adminId, undefined, controller.signal);
      res.json(result);
    } finally {
      activeTaggingControllers.delete(adminId);
    }
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Batch tagging failed" });
  }
});

// ─── Per-admin abort controllers for stop support ─────────────────────────────
const activeTaggingControllers = new Map<number, AbortController>();

// ─── AI Tag All — SSE streaming (POST; consumed via fetch + ReadableStream) ───

router.post("/ai-tag-all-stream", requireRole("admin", "super_admin"), async (req, res) => {
  const ownerIdParam = typeof req.body.ownerId === "number" ? req.body.ownerId : undefined;
  const adminId = await resolveAdminIdWithOwnerOverride(req, res, ownerIdParam);
  if (adminId === null) return;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Content-Encoding", "identity");
  res.flushHeaders();

  const controller = new AbortController();
  activeTaggingControllers.set(adminId, controller);

  const send = (data: object) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    } catch {}
  };

  const limitParam = typeof req.body.limit === "number" ? req.body.limit : undefined;

  try {
    const untagged = await storage.listUntaggedAssets(adminId, limitParam);
    const total = untagged.length;
    send({ done: 0, total, failed: 0 });

    const onProgress: TagProgressCallback = (p) => send(p);
    const { tagged, failed, stopped } = await tagAllUntaggedAssets(untagged, adminId, onProgress, controller.signal);
    if (stopped) {
      send({ done: tagged + failed, total, tagged, failed, complete: true, stopped: true });
    } else {
      send({ done: tagged + failed, total, tagged, failed, complete: true });
    }
  } catch (err: any) {
    send({ error: err.message || "Batch tagging failed", complete: true });
  } finally {
    activeTaggingControllers.delete(adminId);
    res.end();
  }
});

// ─── Stop AI tagging ──────────────────────────────────────────────────────────

router.post("/ai-tag-stop", requireRole("admin", "super_admin"), async (req, res) => {
  const ownerIdParam = typeof req.body.ownerId === "number" ? req.body.ownerId : undefined;
  const adminId = await resolveAdminIdWithOwnerOverride(req, res, ownerIdParam);
  if (adminId === null) return;
  const controller = activeTaggingControllers.get(adminId);
  if (controller) {
    controller.abort();
    activeTaggingControllers.delete(adminId);
  }
  res.json({ stopped: true });
});

// ─── Upload ───────────────────────────────────────────────────────────────────

router.post(
  "/upload",
  upload.array("files", 10),
  async (req, res) => {
    try {
      const ownerIdParam = typeof req.query.ownerId === "string" ? parseInt(req.query.ownerId, 10) : undefined;
      const adminId = await resolveAdminIdWithOwnerOverride(req, res, ownerIdParam && !isNaN(ownerIdParam) ? ownerIdParam : undefined);
      if (adminId === null) return;

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }

      const { randomUUID } = await import("crypto");
      const userId = req.session.userId!;
      const results = await Promise.all(
        files.map(async (file) => {
          const safeName = file.originalname
            .toLowerCase()
            .replace(/[^a-z0-9.\-_]/g, "-")
            .replace(/-{2,}/g, "-")
            .slice(0, 100);
          const key = `assets/${adminId}/${randomUUID()}-${safeName}`;
          const [fileUrl, assetDate] = await Promise.all([
            uploadBufferWithKeyToSpaces(key, file.buffer as Buffer, file.mimetype),
            extractExifDate(file.buffer as Buffer),
          ]);
          return storage.createAsset({
            adminId,
            uploadedByUserId: userId,
            fileName: file.originalname,
            fileUrl,
            fileType: file.mimetype,
            fileSize: file.size,
            title: null,
            description: null,
            tags: [],
            source: "upload",
            aiTaggedAt: null,
            assetDate,
            projectName: null,
            projectAddress: null,
            jobNumber: null,
            capturedBy: null,
            sourceDisplay: "Upload",
          });
        })
      );

      res.json(results);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  }
);

// ─── Get Single Asset ─────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const adminId = await resolveAdminId(req, res);
    if (adminId === null) return;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid asset ID" });
    const asset = await storage.getAsset(id);
    if (!asset || asset.adminId !== adminId) return res.status(404).json({ error: "Not found" });
    res.json(asset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get asset" });
  }
});

// ─── Update Asset ─────────────────────────────────────────────────────────────

router.patch("/:id", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveAdminId(req, res);
    if (adminId === null) return;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid asset ID" });
    const asset = await storage.getAsset(id);
    if (!asset || asset.adminId !== adminId) return res.status(404).json({ error: "Not found" });

    if (asset.source === "installiq") {
      return res.status(403).json({ error: "InstalliQ assets are read-only mirrors. Manage them from the Project dashboard." });
    }

    const { title, description, tags, projectName, projectAddress, jobNumber, capturedBy, sourceDisplay } = req.body;
    const updated = await storage.updateAsset(id, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(tags !== undefined && { tags }),
      ...(projectName !== undefined && { projectName }),
      ...(projectAddress !== undefined && { projectAddress }),
      ...(jobNumber !== undefined && { jobNumber }),
      ...(capturedBy !== undefined && { capturedBy }),
      ...(sourceDisplay !== undefined && { sourceDisplay }),
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update asset" });
  }
});

// ─── Delete Asset ─────────────────────────────────────────────────────────────

router.delete("/:id", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveAdminId(req, res);
    if (adminId === null) return;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid asset ID" });
    const asset = await storage.getAsset(id);
    if (!asset || asset.adminId !== adminId) return res.status(404).json({ error: "Not found" });

    if (asset.source === "installiq") {
      return res.status(403).json({ error: "InstalliQ assets are read-only mirrors and cannot be deleted here. Remove them via the Project dashboard." });
    }

    try {
      await deleteFromSpaces(asset.fileUrl);
    } catch (_) {}
    await storage.deleteAsset(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

// ─── AI Tag Single Asset ──────────────────────────────────────────────────────

router.post("/:id/ai-tag", requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const adminId = await resolveAdminId(req, res);
    if (adminId === null) return;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid asset ID" });
    const asset = await storage.getAsset(id);
    if (!asset || asset.adminId !== adminId) return res.status(404).json({ error: "Not found" });
    if (asset.source === "installiq") {
      return res.status(403).json({ error: "InstalliQ assets are read-only mirrors and cannot be AI-tagged from Asset Manager." });
    }
    const updated = await tagAssetWithOpenAI(asset, adminId);
    res.json(updated);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Tagging failed" });
  }
});

// ─── Multer error handler (non-image file → 422) ─────────────────────────────

router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (
    err instanceof multer.MulterError ||
    (err?.message && (err.message as string).startsWith("Only image files are allowed"))
  ) {
    return res.status(422).json({ error: "Only image files are allowed." });
  }
  next(err);
});

export { router as assetsRouter };
