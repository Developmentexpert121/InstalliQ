import { pool } from "../db";
import { encryptToken, decryptToken } from "./token-crypto";

export interface AssetRow {
  id: number;
  adminId: number;
  uploadedByUserId: number;
  uploaderName: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  title: string | null;
  description: string | null;
  tags: string[];
  source: string | null;
  aiTaggedAt: Date | null;
  assetDate: Date | null;
  createdAt: Date;
  projectName: string | null;
  projectAddress: string | null;
  jobNumber: string | null;
  capturedBy: string | null;
  sourceDisplay: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}

export interface TenantAccessRow {
  ownerId: number;
  ownerName: string;
  ownerEmail: string | null;
  totalUploads: number;
  enabled: boolean;
}

export interface TagLibraryRow {
  id: number;
  adminId: number;
  tagName: string;
  createdAt: Date;
}

export interface GlobalTagRow {
  id: number;
  name: string;
  color: string;
  createdAt: Date;
}

export interface TenantAccessResult {
  adminId: number;
  enabled: boolean;
}

function mapAsset(row: any): AssetRow {
  return {
    id: row.id,
    adminId: row.admin_id,
    uploadedByUserId: row.uploaded_by_user_id,
    uploaderName: row.uploader_name ?? "Unknown",
    fileName: row.file_name,
    fileUrl: row.file_url,
    fileType: row.file_type,
    fileSize: row.file_size,
    title: row.title,
    description: row.description,
    tags: row.tags || [],
    source: row.source,
    aiTaggedAt: row.ai_tagged_at ? new Date(row.ai_tagged_at) : null,
    assetDate: row.asset_date ? new Date(row.asset_date) : null,
    createdAt: new Date(row.created_at),
    projectName: row.project_name ?? null,
    projectAddress: row.project_address ?? null,
    jobNumber: row.job_number ?? null,
    capturedBy: row.captured_by ?? null,
    sourceDisplay: row.source_display ?? null,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    customerEmail: row.customer_email ?? null,
  };
}

const ASSET_SELECT = `
  SELECT a.*, COALESCE(u.name, 'Unknown') AS uploader_name
  FROM assets a
  LEFT JOIN users u ON u.id = a.uploaded_by_user_id
`;

function mapTag(row: any): TagLibraryRow {
  return {
    id: row.id,
    adminId: row.admin_id,
    tagName: row.tag_name,
    createdAt: new Date(row.created_at),
  };
}

export async function createAsset(data: Omit<AssetRow, "id" | "createdAt" | "uploaderName">): Promise<AssetRow> {
  const result = await pool.query(
    `INSERT INTO assets (admin_id, uploaded_by_user_id, file_name, file_url, file_type, file_size, title, description, tags, source, ai_tagged_at, asset_date, project_name, project_address, job_number, captured_by, source_display)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [data.adminId, data.uploadedByUserId, data.fileName, data.fileUrl, data.fileType, data.fileSize,
     data.title ?? null, data.description ?? null, data.tags, data.source ?? "upload", data.aiTaggedAt ?? null,
     data.assetDate ?? null, data.projectName ?? null, data.projectAddress ?? null, data.jobNumber ?? null,
     data.capturedBy ?? null, data.sourceDisplay ?? null]
  );
  // Fetch with uploader JOIN for consistent shape
  return getAsset(result.rows[0].id) as Promise<AssetRow>;
}

/**
 * Insert an asset only if no row with the same (admin_id, file_name) and
 * source='google-drive' already exists (enforced by a partial unique index).
 * Returns the existing-or-new row, or null if the insert was skipped due to
 * a conflict (i.e. the file was already imported).
 */
export async function createAssetDeduped(
  data: Omit<AssetRow, "id" | "createdAt" | "uploaderName">
): Promise<AssetRow | null> {
  const result = await pool.query(
    `INSERT INTO assets (admin_id, uploaded_by_user_id, file_name, file_url, file_type, file_size, title, description, tags, source, ai_tagged_at, asset_date, project_name, project_address, job_number, captured_by, source_display)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (admin_id, file_name) WHERE source = 'google-drive' DO NOTHING
     RETURNING id`,
    [data.adminId, data.uploadedByUserId, data.fileName, data.fileUrl, data.fileType, data.fileSize,
     data.title ?? null, data.description ?? null, data.tags, data.source ?? "upload", data.aiTaggedAt ?? null,
     data.assetDate ?? null, data.projectName ?? null, data.projectAddress ?? null, data.jobNumber ?? null,
     data.capturedBy ?? null, data.sourceDisplay ?? null]
  );
  if (result.rows.length === 0) return null; // duplicate — skipped
  return getAsset(result.rows[0].id) as Promise<AssetRow>;
}

/** Returns a Set of all CompanyCam photo IDs already imported for this admin.
 *  Photo IDs are extracted from file_name patterns like `companycam-{photoId}.ext`.
 *  Queries the DB directly (no pagination) so the dedup set is always complete. */
export async function getCompanyCamPhotoIds(adminId: number): Promise<Set<string>> {
  const result = await pool.query(
    `SELECT file_name FROM assets WHERE admin_id = $1 AND source = 'companycam'`,
    [adminId]
  );
  const ids = new Set<string>();
  for (const row of result.rows) {
    const match = (row.file_name as string).match(/^companycam-(.+)\./);
    if (match?.[1]) ids.add(match[1]);
  }
  return ids;
}

export async function getAsset(id: number): Promise<AssetRow | null> {
  const result = await pool.query(
    `${ASSET_SELECT} WHERE a.id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return mapAsset(result.rows[0]);
}

export interface ListAssetsOptions {
  search?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  sources?: string[];
  projectName?: string;
  customerName?: string;
  page?: number;
  pageSize?: number;
}

export interface ListAssetsResult {
  assets: AssetRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssetSourceStat {
  source: string;
  total: number;
  untagged: number;
}

export interface AssetStats {
  total: number;
  untaggedCount: number;
  bySource: AssetSourceStat[];
}

export async function getAssetStats(adminId: number | null): Promise<AssetStats> {
  // installiq assets are never AI-tagged from asset manager — exclude them from the untagged count
  const untaggedFilter = `(
    COALESCE(source, '') != 'installiq'
    AND (ai_tagged_at IS NULL OR array_length(tags, 1) IS NULL OR array_length(tags, 1) = 0)
  )`;
  const r = await pool.query(
    adminId !== null
      ? `SELECT
           COALESCE(source, 'upload') AS source,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ${untaggedFilter}) AS untagged
         FROM assets
         WHERE admin_id = $1
         GROUP BY COALESCE(source, 'upload')
         ORDER BY total DESC`
      : `SELECT
           COALESCE(source, 'upload') AS source,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ${untaggedFilter}) AS untagged
         FROM assets
         GROUP BY COALESCE(source, 'upload')
         ORDER BY total DESC`,
    adminId !== null ? [adminId] : []
  );
  const bySource: AssetSourceStat[] = r.rows.map((row: any) => ({
    source: row.source as string,
    total: parseInt(row.total, 10),
    untagged: parseInt(row.untagged, 10),
  }));
  const total = bySource.reduce((s, x) => s + x.total, 0);
  const untaggedCount = bySource.reduce((s, x) => s + x.untagged, 0);
  return { total, untaggedCount, bySource };
}

export async function listAssets(adminId: number | null, options: ListAssetsOptions = {}): Promise<ListAssetsResult> {
  const { search, tags, dateFrom, dateTo, sources, projectName, customerName, page = 1, pageSize = 24 } = options;
  // adminId = null means super_admin viewing all tenants — no admin_id filter applied
  const params: any[] = adminId !== null ? [adminId] : [];
  const conditions: string[] = adminId !== null ? ["a.admin_id = $1"] : [];

  if (search?.trim()) {
    params.push(`%${search.trim()}%`);
    const p = params.length;
    conditions.push(
      `(a.file_name ILIKE $${p} OR a.title ILIKE $${p} OR a.description ILIKE $${p}` +
      ` OR a.project_name ILIKE $${p} OR a.job_number ILIKE $${p}` +
      ` OR a.customer_name ILIKE $${p}` +
      ` OR EXISTS (SELECT 1 FROM unnest(a.tags) t WHERE t ILIKE $${p}))`
    );
  }

  if (tags && tags.length > 0) {
    params.push(tags);
    conditions.push(`a.tags && $${params.length}::text[]`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`COALESCE(a.asset_date, a.created_at) >= $${params.length}::date`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`COALESCE(a.asset_date, a.created_at) < ($${params.length}::date + INTERVAL '1 day')`);
  }

  if (sources && sources.length > 0) {
    params.push(sources);
    conditions.push(`a.source = ANY($${params.length}::text[])`);
  }

  if (projectName?.trim()) {
    params.push(`%${projectName.trim()}%`);
    conditions.push(`a.project_name ILIKE $${params.length}`);
  }

  if (customerName?.trim()) {
    params.push(`%${customerName.trim()}%`);
    conditions.push(`a.customer_name ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = `ORDER BY COALESCE(a.asset_date, a.created_at) DESC`;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM assets a ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const dataResult = await pool.query(
    `${ASSET_SELECT} ${where} ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { assets: dataResult.rows.map(mapAsset), total, page, pageSize };
}

export async function listUntaggedAssets(adminId: number, limit?: number): Promise<AssetRow[]> {
  const limitClause = limit && limit > 0 ? ` LIMIT ${limit}` : "";
  const result = await pool.query(
    `${ASSET_SELECT}
     WHERE a.admin_id = $1
       AND COALESCE(a.source, '') != 'installiq'
       AND (
         a.tags = ARRAY[]::text[]
         OR a.ai_tagged_at IS NULL
         OR a.description IS NULL
         OR TRIM(a.description) = ''
       )
     ORDER BY COALESCE(a.asset_date, a.created_at) DESC${limitClause}`,
    [adminId]
  );
  return result.rows.map(mapAsset);
}

export async function updateAsset(
  id: number,
  data: Partial<{
    title: string | null;
    description: string | null;
    tags: string[];
    aiTaggedAt: Date | null;
    projectName: string | null;
    projectAddress: string | null;
    jobNumber: string | null;
    capturedBy: string | null;
    sourceDisplay: string | null;
  }>
): Promise<AssetRow | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if ("title" in data) { sets.push(`title = $${idx++}`); values.push(data.title); }
  if ("description" in data) { sets.push(`description = $${idx++}`); values.push(data.description); }
  if ("tags" in data) { sets.push(`tags = $${idx++}`); values.push(data.tags); }
  if ("aiTaggedAt" in data) { sets.push(`ai_tagged_at = $${idx++}`); values.push(data.aiTaggedAt); }
  if ("projectName" in data) { sets.push(`project_name = $${idx++}`); values.push(data.projectName); }
  if ("projectAddress" in data) { sets.push(`project_address = $${idx++}`); values.push(data.projectAddress); }
  if ("jobNumber" in data) { sets.push(`job_number = $${idx++}`); values.push(data.jobNumber); }
  if ("capturedBy" in data) { sets.push(`captured_by = $${idx++}`); values.push(data.capturedBy); }
  if ("sourceDisplay" in data) { sets.push(`source_display = $${idx++}`); values.push(data.sourceDisplay); }

  if (sets.length === 0) return getAsset(id);
  values.push(id);
  await pool.query(
    `UPDATE assets SET ${sets.join(", ")} WHERE id = $${idx}`,
    values
  );
  return getAsset(id);
}

export async function deleteAsset(id: number): Promise<void> {
  await pool.query(`DELETE FROM assets WHERE id = $1`, [id]);
}

export async function listTenantAccess(): Promise<TenantAccessRow[]> {
  const result = await pool.query(`
    SELECT
      u.id AS owner_id,
      u.name AS owner_name,
      u.email AS owner_email,
      COALESCE(ac.enabled, false) AS enabled,
      COALESCE((SELECT COUNT(*)::int FROM assets WHERE admin_id = u.id), 0) AS total_uploads
    FROM users u
    LEFT JOIN asset_manager_access ac ON ac.owner_id = u.id
    WHERE u.role = 'admin' AND u.deleted_at IS NULL
    ORDER BY u.name ASC
  `);
  return result.rows.map(r => ({
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    totalUploads: r.total_uploads,
    enabled: r.enabled,
  }));
}

export async function setTenantAccess(ownerId: number, enabled: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO asset_manager_access (owner_id, enabled, enabled_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (owner_id) DO UPDATE SET enabled = $2`,
    [ownerId, enabled]
  );
}

export async function resolveUserTenantAccess(userId: number): Promise<TenantAccessResult | null> {
  const userResult = await pool.query(
    `SELECT id, role, created_by FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  if (userResult.rows.length === 0) return null;

  const user = userResult.rows[0];
  let ownerId: number;

  if (user.role === "admin") {
    ownerId = user.id;
  } else if (user.role === "super_admin") {
    return { adminId: user.id, enabled: true };
  } else {
    if (!user.created_by) return null;
    ownerId = user.created_by;
  }

  const accessResult = await pool.query(
    `SELECT enabled FROM asset_manager_access WHERE owner_id = $1`,
    [ownerId]
  );
  if (accessResult.rows.length === 0) return null;
  if (!accessResult.rows[0].enabled) return null;

  return { adminId: ownerId, enabled: true };
}

export async function listTagLibrary(adminId: number): Promise<TagLibraryRow[]> {
  const result = await pool.query(
    `SELECT * FROM asset_tag_library WHERE admin_id = $1 ORDER BY tag_name ASC`,
    [adminId]
  );
  return result.rows.map(mapTag);
}

export async function addTag(adminId: number, tagName: string): Promise<TagLibraryRow> {
  const normalised = tagName.trim().toLowerCase();
  const result = await pool.query(
    `INSERT INTO asset_tag_library (admin_id, tag_name)
     VALUES ($1, $2)
     ON CONFLICT (admin_id, tag_name) DO UPDATE SET tag_name = EXCLUDED.tag_name
     RETURNING *`,
    [adminId, normalised]
  );
  return mapTag(result.rows[0]);
}

export async function addTagsBulk(adminId: number, tagNames: string[]): Promise<number> {
  if (tagNames.length === 0) return 0;
  const normalised = [...new Set(tagNames.map(t => t.trim().toLowerCase()).filter(Boolean))];
  if (normalised.length === 0) return 0;

  const placeholders = normalised.map((_, i) => `($1, $${i + 2})`).join(", ");
  const result = await pool.query(
    `INSERT INTO asset_tag_library (admin_id, tag_name)
     VALUES ${placeholders}
     ON CONFLICT (admin_id, tag_name) DO NOTHING`,
    [adminId, ...normalised]
  );
  return result.rowCount ?? 0;
}

export async function deleteTag(id: number): Promise<void> {
  await pool.query(`DELETE FROM asset_tag_library WHERE id = $1`, [id]);
}

// ─── Global Tags (shared, app-wide vocabulary) ────────────────────────────────

export async function listGlobalTags(): Promise<GlobalTagRow[]> {
  const result = await pool.query(
    `SELECT id, name, color, created_at FROM global_tags ORDER BY name ASC`
  );
  return result.rows.map(r => ({
    id: r.id,
    name: r.name,
    color: r.color ?? "#3b82f6",
    createdAt: new Date(r.created_at),
  }));
}

export async function addGlobalTag(name: string): Promise<GlobalTagRow> {
  const trimmed = name.trim();
  // Try insert; if the case-insensitive unique index fires, fetch the existing row
  try {
    const result = await pool.query(
      `INSERT INTO global_tags (name) VALUES ($1) RETURNING id, name, color, created_at`,
      [trimmed]
    );
    const r = result.rows[0];
    return { id: r.id, name: r.name, color: r.color ?? "#3b82f6", createdAt: new Date(r.created_at) };
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
      // Unique violation — return the existing row
      const existing = await pool.query(
        `SELECT id, name, color, created_at FROM global_tags WHERE LOWER(name) = LOWER($1)`,
        [trimmed]
      );
      const r = existing.rows[0];
      return { id: r.id, name: r.name, color: r.color ?? "#3b82f6", createdAt: new Date(r.created_at) };
    }
    throw err;
  }
}

/** Bulk-insert new global tags. Duplicates (case-insensitive) are silently skipped.
 *  Returns the number of rows actually inserted (not counting pre-existing tags). */
export async function addGlobalTagsBulk(names: string[]): Promise<number> {
  // Deduplicate case-insensitively within the input (keep first occurrence per lower-key)
  const seen = new Set<string>();
  const unique = names
    .map((n) => n.trim())
    .filter((n) => {
      if (!n) return false;
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (unique.length === 0) return 0;
  // ON CONFLICT (LOWER(name)) DO NOTHING is the most reliable way to skip duplicates
  // (case-insensitive expression index).  rowCount reflects only rows actually inserted.
  const result = await pool.query(
    `INSERT INTO global_tags (name)
     SELECT name FROM (SELECT UNNEST($1::text[]) AS name) sub
     ON CONFLICT (LOWER(name)) DO NOTHING`,
    [unique]
  );
  return result.rowCount ?? 0;
}

export async function getUploaderName(userId: number): Promise<string> {
  const result = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
  return result.rows[0]?.name ?? "Unknown";
}

export async function countAssetsByAdmin(adminId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM assets WHERE admin_id = $1`,
    [adminId]
  );
  return result.rows[0]?.cnt ?? 0;
}

// ─── InstalliQ source sync ─────────────────────────────────────────────────────

export async function getAdminIdForUserId(userId: number): Promise<number | null> {
  const result = await pool.query(
    `SELECT id, role, created_by FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  if (user.role === "admin" || user.role === "super_admin") return userId;
  if (user.created_by) return user.created_by;
  return null;
}

export async function upsertInstalliqAsset(data: {
  adminId: number;
  uploadedByUserId: number;
  fileUrl: string;
  fileName: string;
  fileType: string;
  title: string | null;
  description: string | null;
  tags: string[];
  projectName: string | null;
  projectAddress: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  capturedBy: string | null;
}): Promise<void> {
  // ai_tagged_at is always NULL for installiq — tags come from the dashboard workflow, not from
  // AI tagging within the Asset Manager.
  await pool.query(
    `INSERT INTO assets (
       admin_id, uploaded_by_user_id, file_name, file_url, file_type, file_size,
       title, description, tags, source, ai_tagged_at,
       project_name, project_address, customer_name, customer_phone, customer_email,
       captured_by, source_display
     ) VALUES (
       $1, $2, $3, $4, $5, 0,
       $6, $7, $8, 'installiq', NULL,
       $9, $10, $11, $12, $13,
       $14, 'InstalliQ'
     )
     ON CONFLICT (admin_id, file_url) WHERE source = 'installiq'
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       tags = EXCLUDED.tags,
       ai_tagged_at = NULL,
       project_name = EXCLUDED.project_name,
       project_address = EXCLUDED.project_address,
       customer_name = EXCLUDED.customer_name,
       customer_phone = EXCLUDED.customer_phone,
       customer_email = EXCLUDED.customer_email`,
    [
      data.adminId, data.uploadedByUserId, data.fileName, data.fileUrl, data.fileType,
      data.title, data.description, data.tags,
      data.projectName, data.projectAddress, data.customerName, data.customerPhone, data.customerEmail,
      data.capturedBy,
    ]
  );
}

/**
 * Targeted bulk UPDATE of metadata on existing installiq assets by file URL.
 * Never inserts new rows — only updates assets already in the table.
 * Does NOT overwrite captured_by or uploaded_by_user_id (preserve original attribution).
 */
export async function bulkUpdateInstalliqAssetMeta(
  adminId: number,
  fileUrls: string[],
  meta: {
    title: string | null;
    description: string | null;
    tags: string[];
    projectName: string | null;
    projectAddress: string | null;
    customerName: string | null;
    customerPhone: string | null;
    customerEmail: string | null;
  }
): Promise<void> {
  if (fileUrls.length === 0) return;
  // ai_tagged_at is always NULL for installiq — tags come from the dashboard, not from
  // AI tagging within the Asset Manager. Explicitly clear it on every update.
  await pool.query(
    `UPDATE assets SET
       title          = $1,
       description    = $2,
       tags           = $3,
       ai_tagged_at   = NULL,
       project_name   = $4,
       project_address = $5,
       customer_name  = $6,
       customer_phone = $7,
       customer_email = $8
     WHERE admin_id = $9
       AND source    = 'installiq'
       AND file_url  = ANY($10::text[])`,
    [
      meta.title, meta.description, meta.tags,
      meta.projectName, meta.projectAddress,
      meta.customerName, meta.customerPhone, meta.customerEmail,
      adminId, fileUrls,
    ]
  );
}

export async function syncProjectToAssets(
  project: {
    id: number;
    imageUrls: string[] | null;
    jobLabel: string | null;
    description: string | null;
    tags: string[] | null;
    aiSuggestedTags: string[] | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    customerName: string | null;
    customerPhone: string | null;
    customerEmail: string | null;
    userId: number;
  },
  adminId: number,
  uploaderUserId?: number
): Promise<void> {
  const urls = project.imageUrls ?? [];
  if (urls.length === 0) return;

  const resolvedUploaderId = uploaderUserId ?? project.userId;
  const capturedBy = await getUploaderName(resolvedUploaderId);
  const projectAddress = [project.address, project.city, project.state, project.postalCode]
    .filter(Boolean)
    .join(", ") || null;
  // Merge manual tags and AI-suggested tags from the dashboard — both flow to the asset manager
  const allTags = [...new Set([...(project.tags ?? []), ...(project.aiSuggestedTags ?? [])])];

  for (const url of urls) {
    const urlParts = url.split("/");
    const rawFileName = urlParts[urlParts.length - 1] || `installiq-${project.id}.jpg`;
    const ext = (rawFileName.split(".").pop() ?? "jpg").toLowerCase();
    const fileType = `image/${ext === "jpg" ? "jpeg" : ext}`;

    await upsertInstalliqAsset({
      adminId,
      uploadedByUserId: resolvedUploaderId,
      fileUrl: url,
      fileName: rawFileName,
      fileType,
      title: project.jobLabel ?? null,
      description: project.description ?? null,
      tags: allTags,
      projectName: project.jobLabel ?? null,
      projectAddress,
      customerName: project.customerName ?? null,
      customerPhone: project.customerPhone ?? null,
      customerEmail: project.customerEmail ?? null,
      capturedBy,
    });
  }
}

// ─── CompanyCam per-admin encrypted token ─────────────────────────────────────

export async function getCompanyCamApiKey(adminId: number): Promise<string | null> {
  const result = await pool.query(
    `SELECT companycam_api_key FROM asset_manager_access WHERE owner_id = $1`,
    [adminId]
  );
  const row = result.rows[0];
  if (!row?.companycam_api_key) return null;
  try {
    return decryptToken(row.companycam_api_key);
  } catch {
    console.error("[Storage] Failed to decrypt CompanyCam API key for admin", adminId);
    return null;
  }
}

export async function saveCompanyCamApiKey(adminId: number, plainKey: string | null): Promise<void> {
  const encrypted = plainKey ? encryptToken(plainKey) : null;
  await pool.query(
    `INSERT INTO asset_manager_access (owner_id, enabled, enabled_at, companycam_api_key)
     VALUES ($1, true, NOW(), $2)
     ON CONFLICT (owner_id) DO UPDATE SET companycam_api_key = $2`,
    [adminId, encrypted]
  );
}

export async function getCompanyCamLastSyncedAt(adminId: number): Promise<Date | null> {
  const result = await pool.query(
    `SELECT companycam_last_synced_at FROM asset_manager_access WHERE owner_id = $1`,
    [adminId]
  );
  const row = result.rows[0];
  return row?.companycam_last_synced_at ? new Date(row.companycam_last_synced_at) : null;
}

export async function setCompanyCamLastSyncedAt(adminId: number, date: Date): Promise<void> {
  await pool.query(
    `INSERT INTO asset_manager_access (owner_id, enabled, enabled_at, companycam_last_synced_at)
     VALUES ($1, true, NOW(), $2)
     ON CONFLICT (owner_id) DO UPDATE SET companycam_last_synced_at = $2`,
    [adminId, date]
  );
}

/** Mark a sync as started in the DB so any session can detect it via polling. */
export async function setCompanyCamSyncStarted(adminId: number): Promise<void> {
  await pool.query(
    `INSERT INTO asset_manager_access (owner_id, enabled, enabled_at, companycam_sync_started_at, companycam_sync_count)
     VALUES ($1, true, NOW(), NOW(), 0)
     ON CONFLICT (owner_id) DO UPDATE SET companycam_sync_started_at = NOW(), companycam_sync_count = 0`,
    [adminId]
  );
}

/** Update the running photo count — called every ~50 photos to avoid DB overload. */
export async function setCompanyCamSyncCount(adminId: number, count: number): Promise<void> {
  await pool.query(
    `UPDATE asset_manager_access SET companycam_sync_count = $2 WHERE owner_id = $1`,
    [adminId, count]
  );
}

/** Clear sync state when sync finishes (success, stopped, or error). */
export async function clearCompanyCamSyncState(adminId: number): Promise<void> {
  await pool.query(
    `UPDATE asset_manager_access SET companycam_sync_started_at = NULL, companycam_sync_count = NULL WHERE owner_id = $1`,
    [adminId]
  );
}

/** Clear ALL stale sync states — called on server startup to reset any syncs
 *  that were killed by a previous server restart without cleaning up. */
export async function clearAllCompanyCamSyncStates(): Promise<void> {
  await pool.query(
    `UPDATE asset_manager_access SET companycam_sync_started_at = NULL, companycam_sync_count = NULL WHERE companycam_sync_started_at IS NOT NULL`
  );
}

/** Check if any sync is currently running. Returns null if none, or {adminId, count} for the active sync. */
export async function getActiveSyncState(): Promise<{ adminId: number; count: number } | null> {
  const result = await pool.query(
    `SELECT owner_id, companycam_sync_count
     FROM asset_manager_access
     WHERE companycam_sync_started_at IS NOT NULL
       AND companycam_sync_started_at > NOW() - INTERVAL '2 hours'
     ORDER BY companycam_sync_started_at DESC
     LIMIT 1`
  );
  const row = result.rows[0];
  if (!row) return null;
  return { adminId: row.owner_id, count: row.companycam_sync_count ?? 0 };
}

/** Check if a specific admin's sync is running. */
export async function getAdminSyncState(adminId: number): Promise<{ count: number } | null> {
  const result = await pool.query(
    `SELECT companycam_sync_count
     FROM asset_manager_access
     WHERE owner_id = $1
       AND companycam_sync_started_at IS NOT NULL
       AND companycam_sync_started_at > NOW() - INTERVAL '2 hours'`,
    [adminId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { count: row.companycam_sync_count ?? 0 };
}

// ─── Google Drive per-admin encrypted refresh token ───────────────────────────

export interface GoogleDriveConfig {
  connected: boolean;
  email: string | null;
  folderId: string | null;
  folderName: string | null;
  lastSyncedAt: Date | null;
}

export async function getGoogleDriveRefreshToken(adminId: number): Promise<string | null> {
  const result = await pool.query(
    `SELECT google_drive_refresh_token FROM asset_manager_access WHERE owner_id = $1`,
    [adminId]
  );
  const row = result.rows[0];
  if (!row?.google_drive_refresh_token) return null;
  try {
    return decryptToken(row.google_drive_refresh_token);
  } catch {
    console.error("[Storage] Failed to decrypt Google Drive refresh token for admin", adminId);
    return null;
  }
}

export async function saveGoogleDriveTokens(
  adminId: number,
  refreshToken: string | null,
  email: string | null
): Promise<void> {
  const encrypted = refreshToken ? encryptToken(refreshToken) : null;
  await pool.query(
    `INSERT INTO asset_manager_access (owner_id, enabled, enabled_at, google_drive_refresh_token, google_drive_email)
     VALUES ($1, true, NOW(), $2, $3)
     ON CONFLICT (owner_id) DO UPDATE SET
       google_drive_refresh_token = $2,
       google_drive_email = $3`,
    [adminId, encrypted, email]
  );
}

/** Alias used when saving from a parsed public folder URL. */
export async function saveGoogleDriveFolderUrl(
  adminId: number,
  folderId: string,
  folderName: string
): Promise<void> {
  return saveGoogleDriveFolderConfig(adminId, folderId, folderName);
}

export async function saveGoogleDriveFolderConfig(
  adminId: number,
  folderId: string | null,
  folderName: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO asset_manager_access (owner_id, enabled, enabled_at, google_drive_folder_id, google_drive_folder_name)
     VALUES ($1, true, NOW(), $2, $3)
     ON CONFLICT (owner_id) DO UPDATE SET
       google_drive_folder_id = $2,
       google_drive_folder_name = $3`,
    [adminId, folderId, folderName]
  );
}

export async function getGoogleDriveConfig(adminId: number): Promise<GoogleDriveConfig> {
  const result = await pool.query(
    `SELECT google_drive_folder_id, google_drive_folder_name, google_drive_last_synced_at
     FROM asset_manager_access WHERE owner_id = $1`,
    [adminId]
  );
  const row = result.rows[0];
  if (!row || !row.google_drive_folder_id) {
    return { connected: false, email: null, folderId: null, folderName: null, lastSyncedAt: null };
  }
  return {
    connected: true,
    email: null,
    folderId: row.google_drive_folder_id ?? null,
    folderName: row.google_drive_folder_name ?? null,
    lastSyncedAt: row.google_drive_last_synced_at ? new Date(row.google_drive_last_synced_at) : null,
  };
}

export async function clearGoogleDriveConfig(adminId: number): Promise<void> {
  await pool.query(
    `UPDATE asset_manager_access SET
       google_drive_refresh_token = NULL,
       google_drive_email = NULL,
       google_drive_folder_id = NULL,
       google_drive_folder_name = NULL,
       google_drive_last_synced_at = NULL
     WHERE owner_id = $1`,
    [adminId]
  );
}

export async function getGoogleDriveLastSyncedAt(adminId: number): Promise<Date | null> {
  const result = await pool.query(
    `SELECT google_drive_last_synced_at FROM asset_manager_access WHERE owner_id = $1`,
    [adminId]
  );
  const row = result.rows[0];
  return row?.google_drive_last_synced_at ? new Date(row.google_drive_last_synced_at) : null;
}

export async function setGoogleDriveLastSyncedAt(adminId: number, date: Date): Promise<void> {
  await pool.query(
    `INSERT INTO asset_manager_access (owner_id, enabled, enabled_at, google_drive_last_synced_at)
     VALUES ($1, true, NOW(), $2)
     ON CONFLICT (owner_id) DO UPDATE SET google_drive_last_synced_at = $2`,
    [adminId, date]
  );
}
