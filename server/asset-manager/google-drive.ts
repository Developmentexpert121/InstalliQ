/**
 * Google Drive integration — public folder link, zero API key, zero OAuth.
 *
 * How it works:
 *  1. Admin pastes a public Drive *folder* share URL.
 *  2. The server fetches the folder page HTML (same as a browser visiting the link)
 *     and extracts file IDs + names + MIME types from window['_DRIVE_ivd'], the
 *     structured JSON payload Google embeds in every public folder page.
 *  3. If the top-level folder contains sub-folders, each one is fetched recursively
 *     (one level deep) so images nested inside sub-folders are included.
 *  4. Each image file is downloaded via Google's public download endpoint:
 *       https://drive.google.com/uc?export=download&id={fileId}
 *     Large-file confirm-token handling is included (same as the existing PDF/XLSX flow).
 *  5. Downloaded images are resized (≤1920 px) and stored to DigitalOcean Spaces.
 *
 * The only requirement: the folder (and every image in it) must be shared as
 * "Anyone with the link can view". Google will redirect sign-in requests back to
 * accounts.google.com, which we detect and surface as a clear user-facing error.
 */

import sharp from "sharp";
import { randomUUID } from "crypto";
import { uploadBufferWithKeyToSpaces } from "../digitalocean-spaces";
import * as storage from "./storage";

const MAX_IMAGE_DIMENSION = 1920;
const JPEG_QUALITY = 80;
const MAX_SUBFOLDER_DEPTH = 1;

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const IMAGE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/heic", "image/heif", "image/tiff", "image/bmp",
]);

/** Prevents two concurrent syncs for the same admin from running simultaneously. */
const activeSyncs = new Map<number, boolean>();

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
}

export interface GoogleDriveStatusResult {
  status: "not_connected" | "connected";
  provider: "google-drive";
}

export interface GoogleDriveSyncResult {
  status: "not_connected" | "synced" | "error";
  synced?: number;
  message?: string;
}

export type DriveSyncProgressCallback = (synced: number) => void;

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Extract a Google Drive *folder* ID from any of the common share URL formats:
 *   https://drive.google.com/drive/folders/{ID}?usp=sharing
 *   https://drive.google.com/drive/folders/{ID}
 *   https://drive.google.com/open?id={ID}
 *   https://drive.google.com/folderview?id={ID}
 */
export function extractFolderIdFromUrl(url: string): string {
  const patterns = [
    /\/drive\/folders\/([A-Za-z0-9_-]+)/,
    /[?&]id=([A-Za-z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  throw new Error(
    "Could not extract a folder ID from that URL. " +
    "Use a Google Drive folder share link, e.g. https://drive.google.com/drive/folders/…"
  );
}

// ─── Folder page scraping ─────────────────────────────────────────────────────

/**
 * Fetch the public Google Drive folder page and return its raw HTML.
 * Throws a user-friendly error if Google redirects to a sign-in page.
 */
async function fetchFolderHtml(folderId: string): Promise<string> {
  const url = `https://drive.google.com/drive/folders/${folderId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Folder not found — check that the link is correct."
        : `Google Drive returned HTTP ${res.status}. Make sure the folder is shared publicly.`
    );
  }

  const html = await res.text();

  // A genuinely public folder page always contains the _DRIVE_ivd payload.
  // If it's missing the page is either a sign-in redirect or an access-denied screen.
  // (Note: "accounts.google.com" and "ServiceLogin" appear even on valid public pages
  //  as header sign-in links, so we cannot use those as the gating condition.)
  if (!html.includes("_DRIVE_ivd")) {
    throw new Error(
      "This folder requires Google sign-in or is not shared publicly. " +
      "Change sharing to 'Anyone with the link can view' and try again."
    );
  }

  return html;
}

/**
 * Extract the folder display name from the ds:1 AF_initDataCallback payload,
 * which contains the folder's own metadata object. Falls back to <title> then
 * the raw folder ID.
 */
function parseFolderName(html: string, fallback: string): string {
  const ds1Match = html.match(/'ds:1'.*?data:\[(.*?)\],\s*sideChannel/s);
  if (ds1Match) {
    const nameMatch = ds1Match[1].match(/"([^"]{1,200})","application\/vnd\.google-apps\.folder"/);
    if (nameMatch?.[1]) return nameMatch[1];
  }
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const name = titleMatch[1]
      .replace(/\s*[-–—]\s*Google Drive\s*$/i, "")
      .replace(/\s*[-–—]\s*Drive\s*$/i, "")
      .trim();
    if (name) return name;
  }
  return fallback;
}

/**
 * Parse the window['_DRIVE_ivd'] payload embedded in every public Drive folder
 * page. This is structured JSON (hex-escaped) that Google uses to seed the
 * initial render. Its structure is:
 *
 *   [[entry1, entry2, ...], null, null, ...]
 *
 * where each entry is an array whose fields are:
 *   [0] fileId  (string)
 *   [1] [parentFolderId, ...]
 *   [2] name    (string)
 *   [3] mimeType (string)
 *   ... (many more metadata fields, ignored)
 *
 * Returns image files and subfolder IDs found at this level.
 */
function parseDriveIvd(html: string): {
  images: DriveFileInfo[];
  subfolderIds: Array<{ id: string; name: string }>;
} {
  const images: DriveFileInfo[] = [];
  const subfolderIds: Array<{ id: string; name: string }> = [];

  const ivdMatch = html.match(/window\['_DRIVE_ivd'\]\s*=\s*'([\s\S]*?)';/);
  if (!ivdMatch) return { images, subfolderIds };

  let decoded: string;
  try {
    // Only decode \xNN hex escapes — JSON doesn't understand them but does natively
    // handle \uNNNN, \\, \/, \n, etc., so leave those for JSON.parse.
    decoded = ivdMatch[1]
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\'/g, "'");
  } catch {
    return { images, subfolderIds };
  }

  let outer: unknown;
  try {
    outer = JSON.parse(decoded);
  } catch {
    return { images, subfolderIds };
  }

  if (!Array.isArray(outer) || !Array.isArray(outer[0])) {
    return { images, subfolderIds };
  }

  const entries = outer[0] as unknown[];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length < 4) continue;
    const id = entry[0];
    const name = entry[2];
    const mime = entry[3];
    if (typeof id !== "string" || typeof name !== "string" || typeof mime !== "string") continue;
    if (seen.has(id)) continue;
    seen.add(id);

    if (IMAGE_MIMES.has(mime)) {
      images.push({ id, name, mimeType: mime });
    } else if (mime === "application/vnd.google-apps.folder") {
      subfolderIds.push({ id, name });
    }
  }

  return { images, subfolderIds };
}

/**
 * Fetch the folder HTML, parse _DRIVE_ivd to get images + subfolders,
 * then optionally recurse one level into subfolders to collect nested images.
 */
async function collectFolderImages(
  folderId: string,
  depth: number
): Promise<DriveFileInfo[]> {
  const html = await fetchFolderHtml(folderId);
  const { images, subfolderIds } = parseDriveIvd(html);

  if (depth < MAX_SUBFOLDER_DEPTH && subfolderIds.length > 0) {
    const subResults = await Promise.allSettled(
      subfolderIds.map((sf) => collectFolderImages(sf.id, depth + 1))
    );
    for (const result of subResults) {
      if (result.status === "fulfilled") {
        images.push(...result.value);
      }
    }
  }

  return images;
}

/**
 * Fetch the folder HTML, then return the folder name and the list of image files
 * (including images nested inside immediate sub-folders).
 */
export async function getFolderMetadata(folderId: string): Promise<{
  folderName: string;
  files: DriveFileInfo[];
}> {
  const html = await fetchFolderHtml(folderId);
  const folderName = parseFolderName(html, folderId);
  const { images: topImages, subfolderIds } = parseDriveIvd(html);

  let allImages = [...topImages];

  if (subfolderIds.length > 0) {
    const subResults = await Promise.allSettled(
      subfolderIds.map((sf) => collectFolderImages(sf.id, 1))
    );
    for (const result of subResults) {
      if (result.status === "fulfilled") {
        allImages.push(...result.value);
      }
    }
  }

  return { folderName, files: allImages };
}

/**
 * Convenience wrapper: get just the folder display name (used when saving the link).
 * Throws if the folder is not publicly accessible.
 */
export async function getDriveFolderName(folderId: string): Promise<string> {
  const html = await fetchFolderHtml(folderId);
  return parseFolderName(html, folderId);
}

// ─── File download ────────────────────────────────────────────────────────────

/**
 * Download a publicly shared Google Drive file by its file ID.
 *
 * Uses the same approach as the existing PDF/XLSX download flow:
 *   Primary URL:  https://drive.google.com/uc?export=download&id={fileId}
 *   Confirm URL:  https://drive.usercontent.google.com/download?id={fileId}&confirm=t
 *
 * Returns the raw file bytes.
 * Throws a user-friendly error if the file requires sign-in.
 */
async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const primaryUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  const firstRes = await fetch(primaryUrl, {
    headers: { "User-Agent": BROWSER_UA },
    redirect: "follow",
  });

  if (!firstRes.ok) {
    throw new Error(`Download failed for file ${fileId}: HTTP ${firstRes.status}`);
  }

  const contentType = firstRes.headers.get("content-type") ?? "";

  if (contentType.includes("text/html")) {
    const html = await firstRes.text();

    if (html.includes("accounts.google.com") || html.includes("ServiceLogin")) {
      throw new Error(
        `File ${fileId} requires sign-in — make sure it is shared as 'Anyone with the link'.`
      );
    }

    const confirmMatch = html.match(/confirm=([A-Za-z0-9_-]+)/);
    const confirmToken = confirmMatch?.[1] ?? "t";

    const confirmUrl =
      `https://drive.usercontent.google.com/download?id=${fileId}` +
      `&export=download&confirm=${confirmToken}&authuser=0`;

    const secondRes = await fetch(confirmUrl, {
      headers: { "User-Agent": BROWSER_UA },
      redirect: "follow",
    });

    if (!secondRes.ok) {
      throw new Error(
        `Confirm download failed for file ${fileId}: HTTP ${secondRes.status}`
      );
    }

    const buf = Buffer.from(await secondRes.arrayBuffer());
    if (buf.length < 1024) {
      throw new Error(`File ${fileId} returned too little data — it may not be accessible.`);
    }
    return buf;
  }

  const buf = Buffer.from(await firstRes.arrayBuffer());
  if (buf.length < 1024) {
    throw new Error(`File ${fileId} returned too little data — it may not be accessible.`);
  }
  return buf;
}

// ─── Image processing ─────────────────────────────────────────────────────────

async function processImage(input: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  const processed = await sharp(input)
    .rotate()
    .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return { buffer: processed, mimeType: "image/jpeg" };
}

// ─── Status / sync ────────────────────────────────────────────────────────────

export async function getGoogleDriveStatus(adminId: number): Promise<GoogleDriveStatusResult> {
  const cfg = await storage.getGoogleDriveConfig(adminId);
  return {
    status: cfg.connected ? "connected" : "not_connected",
    provider: "google-drive",
  };
}

/**
 * Sync all image files from the configured public Drive folder into the asset library.
 *
 * - Recursively collects images from sub-folders (one level deep).
 * - Downloads only new files (dedup by Drive file ID embedded in the filename).
 * - On full success, advances the last-synced-at watermark.
 * - On partial failure, the watermark is NOT advanced so the next sync retries.
 */
export async function syncGoogleDriveAssets(
  adminId: number,
  onProgress?: DriveSyncProgressCallback
): Promise<GoogleDriveSyncResult> {
  if (activeSyncs.get(adminId)) {
    return {
      status: "synced",
      synced: 0,
      message: "A sync is already in progress. Please wait for it to finish.",
    };
  }
  activeSyncs.set(adminId, true);

  try {
    return await _doSync(adminId, onProgress);
  } finally {
    activeSyncs.delete(adminId);
  }
}

async function _doSync(
  adminId: number,
  onProgress?: DriveSyncProgressCallback
): Promise<GoogleDriveSyncResult> {
  const driveConfig = await storage.getGoogleDriveConfig(adminId);

  if (!driveConfig.connected || !driveConfig.folderId) {
    return {
      status: "not_connected",
      message: "No Google Drive folder configured. Paste a public folder link in Asset Setup.",
    };
  }

  let folderFiles: DriveFileInfo[];
  let resolvedFolderName: string;

  try {
    const { folderName, files } = await getFolderMetadata(driveConfig.folderId);
    folderFiles = files;
    resolvedFolderName = folderName;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to read Drive folder.";
    console.error("[GoogleDrive] Folder listing failed:", msg);
    return { status: "error", message: msg };
  }

  if (folderFiles.length === 0) {
    return {
      status: "synced",
      synced: 0,
      message:
        "No image files were found in the Drive folder. " +
        "Make sure it contains images and is shared as 'Anyone with the link can view'.",
    };
  }

  console.log(
    `[GoogleDrive] Found ${folderFiles.length} image(s) in folder "${resolvedFolderName}"`
  );

  const { assets: existingAssets } = await storage.listAssets(adminId, { pageSize: 10000 });
  const existingFileIds = new Set(
    existingAssets
      .filter((a) => a.source === "google-drive")
      .map((a) => {
        const m = a.fileName.match(/^gdrive-(.+)\./);
        return m?.[1] ?? null;
      })
      .filter((id): id is string => id !== null)
  );

  const syncStartedAt = new Date();
  const folderLabel = driveConfig.folderName ?? resolvedFolderName;
  const syncTags = ["Google Drive", folderLabel];

  let totalSynced = 0;
  let hadErrors = false;

  for (const file of folderFiles) {
    if (existingFileIds.has(file.id)) continue;

    const safeName = `gdrive-${file.id}.jpg`;

    try {
      const rawBuffer = await downloadDriveFile(file.id);
      const { buffer, mimeType } = await processImage(rawBuffer);

      const spaceKey = `assets/${adminId}/${randomUUID()}-${safeName}`;
      const fileUrl = await uploadBufferWithKeyToSpaces(spaceKey, buffer, mimeType);

      const inserted = await storage.createAssetDeduped({
        adminId,
        uploadedByUserId: adminId,
        fileName: safeName,
        fileUrl,
        fileType: mimeType,
        fileSize: buffer.length,
        title: file.name,
        description: folderLabel,
        tags: syncTags,
        source: "google-drive",
        aiTaggedAt: null,
        assetDate: null,
        projectName: null,
        projectAddress: null,
        jobNumber: null,
        capturedBy: null,
        sourceDisplay: "Google Drive",
      });

      existingFileIds.add(file.id);
      if (inserted) {
        totalSynced++;
        onProgress?.(totalSynced);
      }
    } catch (fileErr: unknown) {
      const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
      console.error(`[GoogleDrive] Failed to import file ${file.id}:`, msg);
      hadErrors = true;
    }
  }

  if (!hadErrors) {
    await storage.setGoogleDriveLastSyncedAt(adminId, syncStartedAt);
    console.log(`[GoogleDrive] Sync complete — imported ${totalSynced} new image(s).`);
  } else {
    console.warn(
      `[GoogleDrive] Sync finished with errors — imported ${totalSynced}, cursor NOT advanced.`
    );
  }

  return {
    status: hadErrors ? "error" : "synced",
    synced: totalSynced,
    message: hadErrors
      ? `Imported ${totalSynced} image(s) but some failed. Sync again to retry.`
      : totalSynced === 0
        ? "All Drive images are already up to date."
        : `Imported ${totalSynced} new image(s) from Google Drive.`,
  };
}
